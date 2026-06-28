const fs = require('fs')
const path = require('path')
const { execFileSync, spawn } = require('child_process')

const DEFAULT_EVIDENCE_ROOT = path.join('docs', 'release-evidence', 'creator-studio-packaged-ui')
const DEFAULT_TIMEOUT_MS = 45000

const usage = () => [
  'Usage: node scripts/run-packaged-creator-studio-ui-e2e.js [options]',
  '',
  'Options:',
  '  --app <OpenPet.app|exe>         Packaged OpenPet app path.',
  '  --archive-dir <dir>            Output archive directory.',
  '  --json                         Print the generated summary as JSON.',
  '  --help',
  '',
  'Launches a packaged OpenPet app, drives the real Control Center and Creator Studio',
  'dashboard UI through the fixture path, and persists a bounded archive with runtime',
  'artifact plus stdout/stderr transcripts.'
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
} = {}) => path.join(DEFAULT_EVIDENCE_ROOT, `${sessionIdFromDate(now())}-${platform}-${arch}-packaged-creator-studio-ui`)

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
  throw new Error(`Timed out waiting for packaged creator studio ui e2e evidence: ${filePath}`)
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
  const stdoutPath = path.join(archiveDir, 'packaged-creator-studio-ui-e2e-stdout.txt')
  const stderrPath = path.join(archiveDir, 'packaged-creator-studio-ui-e2e-stderr.txt')
  const runtimeArtifactPath = path.join(archiveDir, 'packaged-creator-studio-ui-e2e.json')
  const executable = process.platform === 'darwin' ? resolveMacExecutable(appPath) : path.resolve(appPath)
  if (!fsImpl.existsSync(executable)) {
    throw new Error(`Packaged app executable not found: ${executable}`)
  }

  const child = spawnImpl(executable, [], {
    env: {
      ...env,
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E: '1',
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_OUTPUT: runtimeArtifactPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_STDOUT: stdoutPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_STDERR: stderrPath,
      OPENPET_PACKAGED_CREATOR_STUDIO_UI_E2E_APP_PATH: path.basename(appPath || executable)
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
  controlCenterReady: Boolean(
    runtimeArtifact?.controlCenter?.opened &&
    runtimeArtifact?.controlCenter?.pluginsTabActivated &&
    runtimeArtifact?.controlCenter?.serviceStarted &&
    runtimeArtifact?.controlCenter?.serviceHealthOk &&
    runtimeArtifact?.controlCenter?.dashboardOpenRequested
  ),
  dashboardFlowOk: Boolean(
    runtimeArtifact?.dashboard?.loaded &&
    runtimeArtifact?.dashboard?.draftOk &&
    runtimeArtifact?.dashboard?.questionAnswered &&
    runtimeArtifact?.dashboard?.confirmed &&
    runtimeArtifact?.dashboard?.generated &&
    runtimeArtifact?.dashboard?.approved &&
    runtimeArtifact?.dashboard?.status === 'approved' &&
    runtimeArtifact?.dashboard?.taskStatus === 'confirmed'
  ),
  importOk: Boolean(runtimeArtifact?.importResult?.importRequested && runtimeArtifact?.importResult?.importOk),
  runId: runtimeArtifact?.dashboard?.runId || '',
  importCommand: runtimeArtifact?.dashboard?.importCommand || runtimeArtifact?.importResult?.importCommandId || ''
})

const createPackagedCreatorStudioUiE2eRun = async ({
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

  const runtimeArtifactPath = path.join(selectedArchiveDir, 'packaged-creator-studio-ui-e2e.json')
  const stdoutPath = path.join(selectedArchiveDir, 'packaged-creator-studio-ui-e2e-stdout.txt')
  const stderrPath = path.join(selectedArchiveDir, 'packaged-creator-studio-ui-e2e-stderr.txt')
  const summaryPath = path.join(selectedArchiveDir, 'packaged-creator-studio-ui-e2e-summary.json')

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
    errors.push('packaged creator studio ui e2e runtime artifact was not produced')
  } else {
    if (!summary.pluginFound) errors.push('Creator Studio plugin was not discovered in the packaged app')
    if (!summary.controlCenterReady) errors.push('Creator Studio Control Center packaged UI path did not complete')
    if (!summary.dashboardFlowOk) errors.push('Creator Studio dashboard fixture packaged UI flow did not complete')
    if (!summary.importOk) errors.push('Creator Studio packaged UI import handoff did not complete')
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

  const result = await createPackagedCreatorStudioUiE2eRun(options)
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Packaged Creator Studio UI E2E archive: ${result.archiveDir}`)
    console.log(`Runtime artifact: ${result.runtimeArtifactPath}`)
    console.log(`Archive valid: ${result.ok ? 'yes' : 'no'}`)
  }

  if (!result.ok) process.exit(1)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || String(error))
    process.exit(1)
  })
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  createPackagedCreatorStudioUiE2eRun,
  defaultArchiveDir,
  defaultOrchestratePackagedApp,
  parseArgs,
  summarizeRuntimeArtifact
}
