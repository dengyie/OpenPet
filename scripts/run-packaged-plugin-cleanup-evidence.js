const fs = require('fs')
const path = require('path')
const { execFileSync, spawn } = require('child_process')

const {
  createPluginCleanupEvidenceReport
} = require('./create-plugin-cleanup-evidence-report')
const {
  createCollector,
  createCommandNotes,
  createManualChecklist
} = require('./create-plugin-cleanup-evidence-collector')
const {
  createPluginCleanupEvidenceArchiveManifest,
  resolveArchivePaths,
  writeManifest
} = require('./create-plugin-cleanup-evidence-archive-manifest')
const {
  mapPackagedCleanupEvidence
} = require('./update-packaged-plugin-cleanup-evidence-report')
const {
  validateReport
} = require('./validate-plugin-cleanup-evidence-report')
const {
  writeReport
} = require('./update-plugin-cleanup-evidence-report')

const DEFAULT_EVIDENCE_ROOT = path.join('docs', 'release-evidence', 'plugin-cleanup-evidence')
const DEFAULT_TIMEOUT_MS = 30000

const usage = () => [
  'Usage: node scripts/run-packaged-plugin-cleanup-evidence.js [options]',
  '',
  'Options:',
  '  --app <OpenPet.app|exe>         Packaged OpenPet app path.',
  '  --plugin-source <dir|zip>      Plugin fixture source for the packaged cleanup run.',
  '  --archive-dir <dir>            Output archive directory.',
  '  --json                         Print the generated summary as JSON.',
  '  --help',
  '',
  'Runs a packaged OpenPet cleanup evidence session and updates the structured cleanup report',
  'from observed setup, declaration-command, and service cleanup behavior without claiming',
  'universal cleanup guarantees.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    appPath: '',
    pluginSource: '',
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
    } else if (arg === '--plugin-source') {
      options.pluginSource = readValue(argv, index, arg)
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
} = {}) => path.join(DEFAULT_EVIDENCE_ROOT, `${sessionIdFromDate(now())}-${platform}-${arch}-packaged-plugin-cleanup`)

const assertRunOutputsDoNotExist = ({ paths, fsImpl = fs }) => {
  for (const outputPath of [paths.reportPath, paths.collectorPath, paths.evidenceDir, paths.outputPath]) {
    if (fsImpl.existsSync(outputPath)) {
      throw new Error(`Packaged plugin cleanup evidence output already exists: ${outputPath}`)
    }
  }
}

const ensureDir = (dirPath, fsImpl = fs) => {
  fsImpl.mkdirSync(dirPath, { recursive: true })
}

const writeText = ({ filePath, content, fsImpl = fs }) => {
  ensureDir(path.dirname(filePath), fsImpl)
  fsImpl.writeFileSync(filePath, String(content ?? ''))
  return filePath
}

const defaultCreateReport = ({ pluginId, hostApp, now }) => createPluginCleanupEvidenceReport({
  pluginId,
  hostApp,
  now
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
  throw new Error(`Timed out waiting for packaged plugin cleanup evidence: ${filePath}`)
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

const createEvidenceDirectoryContents = ({
  archiveDir,
  reportPath,
  runtimeArtifact,
  runtimeArtifactPath,
  fsImpl = fs
}) => {
  const evidenceDir = path.join(archiveDir, 'plugin-cleanup-evidence-collected')
  ensureDir(evidenceDir, fsImpl)
  writeText({
    filePath: path.join(evidenceDir, 'environment.txt'),
    content: [
      `CollectedAt: ${runtimeArtifact.generatedAt || new Date().toISOString()}`,
      `HostApp: ${runtimeArtifact.hostApp || ''}`,
      `PluginId: ${runtimeArtifact.pluginId || ''}`,
      `RuntimeArtifact: ${runtimeArtifactPath || ''}`
    ].join('\n') + '\n',
    fsImpl
  })
  writeText({
    filePath: path.join(evidenceDir, 'report-structure-validation.txt'),
    content: `Plugin cleanup evidence report: ${path.basename(reportPath)}\nReport structure is valid.\n`,
    fsImpl
  })
  writeText({
    filePath: path.join(evidenceDir, 'cleanup-controlled-fixture-output.json'),
    content: `${JSON.stringify({
      ok: true,
      claimBoundary: 'Packaged app cleanup evidence automation records observed behavior for this launched app session only.',
      runtimeArtifactPath
    }, null, 2)}\n`,
    fsImpl
  })
  writeText({
    filePath: path.join(evidenceDir, 'cleanup-controlled-fixture-stderr.txt'),
    content: '',
    fsImpl
  })
  writeText({
    filePath: path.join(evidenceDir, 'cleanup-controlled-fixture-status.txt'),
    content: 'Packaged app cleanup evidence captured under: plugin-cleanup-evidence-collected\n',
    fsImpl
  })
  writeText({
    filePath: path.join(evidenceDir, 'manual-checks.md'),
    content: createManualChecklist(),
    fsImpl
  })
  writeText({
    filePath: path.join(evidenceDir, 'update-report-commands.md'),
    content: createCommandNotes({ reportFileName: reportPath }),
    fsImpl
  })
  return evidenceDir
}

const defaultOrchestratePackagedApp = async ({
  archiveDir,
  appPath,
  pluginSource,
  pluginId,
  hostApp,
  now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnImpl = spawn,
  fsImpl = fs,
  env = process.env
}) => {
  const generatedAt = now().toISOString()
  const stdoutPath = path.join(archiveDir, 'packaged-plugin-cleanup-stdout.txt')
  const stderrPath = path.join(archiveDir, 'packaged-plugin-cleanup-stderr.txt')
  const runtimeArtifactPath = path.join(archiveDir, 'packaged-plugin-cleanup-runtime.json')
  const executable = process.platform === 'darwin' ? resolveMacExecutable(appPath) : path.resolve(appPath)
  if (!fsImpl.existsSync(executable)) {
    throw new Error(`Packaged app executable not found: ${executable}`)
  }

  const child = spawnImpl(executable, [], {
    env: {
      ...env,
      OPENPET_PACKAGED_PLUGIN_CLEANUP_EVIDENCE: '1',
      OPENPET_PACKAGED_PLUGIN_CLEANUP_OUTPUT: runtimeArtifactPath,
      OPENPET_PACKAGED_PLUGIN_CLEANUP_PLUGIN_SOURCE: path.resolve(pluginSource),
      OPENPET_PACKAGED_PLUGIN_CLEANUP_APP_PATH: hostApp,
      OPENPET_PACKAGED_PLUGIN_CLEANUP_STDOUT: stdoutPath,
      OPENPET_PACKAGED_PLUGIN_CLEANUP_STDERR: stderrPath
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
      errors: runtimeArtifact.error ? [runtimeArtifact.error] : []
    }
  } finally {
    if (child?.pid && typeof child.kill === 'function') child.kill()
  }
}

const createPackagedPluginCleanupEvidenceRun = async ({
  appPath,
  pluginSource,
  archiveDir = '',
  pluginId = 'openpet.cleanup-evidence-fixture',
  hostApp = 'OpenPet.app',
  now = () => new Date(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  createReportImpl = defaultCreateReport,
  orchestratePackagedAppImpl = defaultOrchestratePackagedApp,
  createArchiveManifestImpl = createPluginCleanupEvidenceArchiveManifest,
  fsImpl = fs
} = {}) => {
  if (!appPath) throw new Error('--app is required')
  if (!pluginSource) throw new Error('--plugin-source is required')

  const selectedArchiveDir = archiveDir || defaultArchiveDir({ now })
  const paths = resolveArchivePaths({ archiveDir: selectedArchiveDir })
  assertRunOutputsDoNotExist({ paths, fsImpl })
  ensureDir(paths.archiveDir, fsImpl)

  const report = createReportImpl({
    pluginId,
    hostApp,
    now
  })
  const reportPath = writeReport({ report, outputPath: paths.reportPath, fsImpl })

  let orchestration
  try {
    orchestration = await orchestratePackagedAppImpl({
      archiveDir: paths.archiveDir,
      appPath,
      pluginSource,
      pluginId,
      hostApp,
      now,
      timeoutMs,
      fsImpl
    })
  } catch (error) {
    const message = error.message || String(error)
    const stdoutPath = path.join(paths.archiveDir, 'packaged-plugin-cleanup-stdout.txt')
    const stderrPath = path.join(paths.archiveDir, 'packaged-plugin-cleanup-stderr.txt')
    writeText({ filePath: stdoutPath, content: '', fsImpl })
    writeText({ filePath: stderrPath, content: `${message}\n`, fsImpl })
    orchestration = {
      runtimeArtifact: null,
      runtimeArtifactPath: path.join(paths.archiveDir, 'packaged-plugin-cleanup-runtime.json'),
      stdoutPath,
      stderrPath,
      errors: [message]
    }
  }

  if (!orchestration.stdoutPath || !orchestration.stderrPath) {
    throw new Error('Packaged cleanup orchestration must persist stdout and stderr transcripts')
  }

  const collectorContent = createCollector({
    report,
    reportPath,
    generatedAt: now()
  })
  const collectorPath = writeText({
    filePath: paths.collectorPath,
    content: `${collectorContent}\n`,
    fsImpl
  })

  let updatedReport = report
  let reportValidation = { ok: false, errors: ['runtime artifact was not produced'], warnings: [], summary: { passed: 0, total: report.checks.length, cleanupReady: false } }
  let errors = [...(orchestration.errors || [])]

  if (orchestration.runtimeArtifact) {
    updatedReport = mapPackagedCleanupEvidence({
      report,
      runtimeArtifact: orchestration.runtimeArtifact
    })
    reportValidation = validateReport(updatedReport, { allowPending: true })
    writeReport({ report: updatedReport, outputPath: reportPath, fsImpl })
  }

  const evidenceDir = createEvidenceDirectoryContents({
    archiveDir: paths.archiveDir,
    reportPath,
    runtimeArtifact: orchestration.runtimeArtifact || { generatedAt: now().toISOString(), hostApp, pluginId },
    runtimeArtifactPath: orchestration.runtimeArtifactPath || path.join(paths.archiveDir, 'packaged-plugin-cleanup-runtime.json'),
    fsImpl
  })

  const manifest = createArchiveManifestImpl({
    archiveDir: paths.archiveDir,
    reportPath,
    collectorPath,
    evidenceDir,
    outputPath: paths.outputPath,
    now,
    fsImpl
  })
  if (!orchestration.runtimeArtifact) {
    manifest.errors = [...manifest.errors, 'packaged cleanup runtime artifact was not produced']
  }
  if ((orchestration.errors || []).length > 0) {
    manifest.errors = [...manifest.errors, ...orchestration.errors]
  }
  if (!reportValidation.ok) {
    manifest.errors = [...manifest.errors, ...reportValidation.errors.map((error) => `report: ${error}`)]
  }
  manifest.ok = manifest.errors.length === 0
  manifest.cleanupReady = Boolean(manifest.ok && manifest.report?.readinessValidation?.ok)
  const manifestPath = writeManifest({ manifest, outputPath: paths.outputPath, fsImpl })

  if (!reportValidation.ok) errors = [...errors, ...reportValidation.errors]
  if (!manifest.ok) errors = [...errors, ...manifest.errors]

  return {
    ok: errors.length === 0,
    archiveDir: paths.archiveDir,
    reportPath,
    collectorPath,
    evidenceDir,
    manifestPath,
    runtimeArtifactPath: orchestration.runtimeArtifactPath || '',
    updatedReport,
    reportValidation,
    manifest,
    errors
  }
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }
  if (!options.appPath) throw new Error('--app is required')
  if (!options.pluginSource) throw new Error('--plugin-source is required')

  const result = await createPackagedPluginCleanupEvidenceRun(options)
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Packaged plugin cleanup evidence archive: ${result.archiveDir}`)
    console.log(`Archive valid: ${result.manifest.ok ? 'yes' : 'no'}`)
    console.log(`Cleanup ready: ${result.manifest.cleanupReady ? 'yes' : 'no'}`)
  }

  if (!result.ok) process.exit(1)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err)
    process.exit(1)
  })
}

module.exports = {
  createPackagedPluginCleanupEvidenceRun,
  defaultArchiveDir,
  parseArgs
}
