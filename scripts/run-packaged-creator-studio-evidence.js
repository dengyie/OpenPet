const fs = require('fs')
const path = require('path')
const { execFileSync, spawn } = require('child_process')

const DEFAULT_EVIDENCE_ROOT = path.join('docs', 'release-evidence', 'creator-studio-packaged')
const DEFAULT_TIMEOUT_MS = 30000

const usage = () => [
  'Usage: node scripts/run-packaged-creator-studio-evidence.js [options]',
  '',
  'Options:',
  '  --app <OpenPet.app|exe>         Packaged OpenPet app path.',
  '  --archive-dir <dir>            Output archive directory.',
  '  --json                         Print the generated summary as JSON.',
  '  --help',
  '',
  'Launches a packaged OpenPet app, waits for Creator Studio runtime evidence, and',
  'persists a bounded archive with runtime artifact plus stdout/stderr transcripts.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    appPath: '',
    archiveDir: '',
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--app') {
      options.appPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--archive-dir') {
      options.archiveDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

const sessionIdFromDate = (date) => date.toISOString().replace(/[:.]/g, '-').replace(/-000Z$/, 'Z')

const defaultArchiveDir = ({
  now = () => new Date(),
  platform = process.platform,
  arch = process.arch
} = {}) => path.join(DEFAULT_EVIDENCE_ROOT, `${sessionIdFromDate(now())}-${platform}-${arch}-packaged-creator-studio`)

const ensureDir = (dirPath, fsImpl = fs) => {
  fsImpl.mkdirSync(dirPath, { recursive: true })
}

const writeText = ({ filePath, content, fsImpl = fs }) => {
  ensureDir(path.dirname(filePath), fsImpl)
  fsImpl.writeFileSync(filePath, String(content ?? ''))
  return filePath
}

const writeJson = ({ filePath, value, fsImpl = fs }) => writeText({
  filePath,
  content: `${JSON.stringify(value, null, 2)}\n`,
  fsImpl
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForJsonFile = async (filePath, timeoutMs = DEFAULT_TIMEOUT_MS, fsImpl = fs) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (fsImpl.existsSync(filePath)) {
      return JSON.parse(fsImpl.readFileSync(filePath, 'utf-8'))
    }
    await sleep(250)
  }
  throw new Error(`Timed out waiting for packaged creator studio evidence: ${filePath}`)
}

const resolveMacExecutable = (appPath) => {
  const absoluteAppPath = path.resolve(appPath)
  if (!/\.app$/i.test(absoluteAppPath)) return absoluteAppPath
  const plistPath = path.join(absoluteAppPath, 'Contents', 'Info.plist')
  let executableName = 'OpenPet'
  if (fs.existsSync(plistPath)) {
    try {
      const output = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', plistPath], { encoding: 'utf-8' }).trim()
      if (output) executableName = output
    } catch (_) {}
  }
  return path.join(absoluteAppPath, 'Contents', 'MacOS', executableName)
}

const defaultOrchestratePackagedApp = async ({
  archiveDir,
  appPath,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnImpl = spawn,
  fsImpl = fs,
  env = process.env
} = {}) => {
  const stdoutPath = path.join(archiveDir, 'packaged-creator-studio-stdout.txt')
  const stderrPath = path.join(archiveDir, 'packaged-creator-studio-stderr.txt')
  const runtimeArtifactPath = path.join(archiveDir, 'packaged-creator-studio-runtime.json')
  const executable = process.platform === 'darwin' ? resolveMacExecutable(appPath) : path.resolve(appPath)
  if (!fsImpl.existsSync(executable)) {
    throw new Error(`Packaged app executable not found: ${executable}`)
  }

  const child = spawnImpl(executable, [], {
    env: {
      ...env,
      OPENPET_PACKAGED_CREATOR_STUDIO_EVIDENCE: '1',
      OPENPET_PACKAGED_CREATOR_STUDIO_OUTPUT: runtimeArtifactPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_STDOUT: stdoutPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_STDERR: stderrPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_APP_PATH: path.basename(appPath || executable)
    },
    stdio: 'ignore',
    detached: false
  })

  try {
    const runtimeArtifact = await waitForJsonFile(runtimeArtifactPath, timeoutMs, fsImpl)
    return {
      runtimeArtifact,
      runtimeArtifactPath,
      stdoutPath,
      stderrPath,
      errors: runtimeArtifact?.error ? [runtimeArtifact.error] : []
    }
  } finally {
    if (child?.pid && typeof child.kill === 'function') child.kill()
  }
}

const summarizeRuntimeArtifact = (runtimeArtifact, now = () => new Date()) => ({
  schemaVersion: 1,
  generatedAt: now().toISOString(),
  pluginId: runtimeArtifact?.pluginId || 'openpet.creator-studio',
  pluginFound: Boolean(runtimeArtifact?.pluginFound),
  dashboardPresent: Boolean(runtimeArtifact?.dashboard?.present),
  servicePresent: Boolean(runtimeArtifact?.service?.present),
  serviceHealthOk: Boolean(runtimeArtifact?.service?.healthOk),
  commandRequested: Boolean(runtimeArtifact?.command?.requested),
  commandOk: Boolean(runtimeArtifact?.command?.ok),
  commandId: runtimeArtifact?.command?.commandId || 'draft-task',
  runId: runtimeArtifact?.command?.runId || '',
  taskStatus: runtimeArtifact?.command?.taskStatus || '',
  mode: runtimeArtifact?.command?.mode || ''
})

const createPackagedCreatorStudioEvidenceRun = async ({
  appPath,
  archiveDir = '',
  now = () => new Date(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  orchestratePackagedAppImpl = defaultOrchestratePackagedApp,
  fsImpl = fs
} = {}) => {
  if (!appPath) throw new Error('--app is required')

  const selectedArchiveDir = archiveDir || defaultArchiveDir({ now })
  ensureDir(selectedArchiveDir, fsImpl)

  const runtimeArtifactPath = path.join(selectedArchiveDir, 'packaged-creator-studio-runtime.json')
  const stdoutPath = path.join(selectedArchiveDir, 'packaged-creator-studio-stdout.txt')
  const stderrPath = path.join(selectedArchiveDir, 'packaged-creator-studio-stderr.txt')
  const summaryPath = path.join(selectedArchiveDir, 'packaged-creator-studio-evidence-summary.json')

  let orchestration
  try {
    orchestration = await orchestratePackagedAppImpl({
      archiveDir: selectedArchiveDir,
      appPath,
      now,
      timeoutMs,
      fsImpl
    })
  } catch (error) {
    const message = error.message || String(error)
    writeText({ filePath: stdoutPath, content: '', fsImpl })
    writeText({ filePath: stderrPath, content: `${message}\n`, fsImpl })
    orchestration = {
      runtimeArtifact: null,
      runtimeArtifactPath,
      stdoutPath,
      stderrPath,
      errors: [message]
    }
  }

  if (!fsImpl.existsSync(orchestration.stdoutPath || stdoutPath)) {
    writeText({ filePath: orchestration.stdoutPath || stdoutPath, content: '', fsImpl })
  }
  if (!fsImpl.existsSync(orchestration.stderrPath || stderrPath)) {
    writeText({ filePath: orchestration.stderrPath || stderrPath, content: '', fsImpl })
  }

  const summary = summarizeRuntimeArtifact(orchestration.runtimeArtifact, now)
  const errors = [...(orchestration.errors || [])]

  if (!orchestration.runtimeArtifact) {
    errors.push('packaged creator studio runtime artifact was not produced')
  } else {
    if (!summary.pluginFound) errors.push('Creator Studio plugin was not discovered in the packaged app')
    if (!summary.dashboardPresent) errors.push('Creator Studio dashboard declaration was not present in the packaged app')
    if (!summary.servicePresent) errors.push('Creator Studio service declaration was not present in the packaged app')
    if (!summary.serviceHealthOk) errors.push('Creator Studio service did not report healthy status in the packaged app')
    if (!summary.commandRequested) errors.push('Creator Studio draft-task command was not requested in the packaged app')
    if (!summary.commandOk) errors.push('Creator Studio draft-task command did not succeed in the packaged app')
  }

  const result = {
    ok: errors.length === 0,
    appPath: path.resolve(appPath),
    archiveDir: path.resolve(selectedArchiveDir),
    runtimeArtifact: orchestration.runtimeArtifact,
    runtimeArtifactPath: orchestration.runtimeArtifactPath || runtimeArtifactPath,
    stdoutPath: orchestration.stdoutPath || stdoutPath,
    stderrPath: orchestration.stderrPath || stderrPath,
    summary,
    summaryPath,
    errors
  }

  writeJson({ filePath: summaryPath, value: result, fsImpl })
  return result
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }
  if (!options.appPath) throw new Error('--app is required')

  const result = await createPackagedCreatorStudioEvidenceRun(options)
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Packaged Creator Studio evidence archive: ${result.archiveDir}`)
    console.log(`Runtime artifact: ${result.runtimeArtifactPath}`)
    console.log(`Archive valid: ${result.ok ? 'yes' : 'no'}`)
  }

  if (!result.ok) process.exit(1)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error)
    process.exit(1)
  })
}

module.exports = {
  createPackagedCreatorStudioEvidenceRun,
  defaultArchiveDir,
  parseArgs
}
