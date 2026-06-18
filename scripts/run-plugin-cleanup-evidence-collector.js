const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const {
  createPluginCleanupEvidenceReport,
  writeReport
} = require('./create-plugin-cleanup-evidence-report')
const {
  createCollector,
  writeCollector
} = require('./create-plugin-cleanup-evidence-collector')
const {
  createPluginCleanupEvidenceArchiveManifest,
  resolveArchivePaths,
  writeManifest
} = require('./create-plugin-cleanup-evidence-archive-manifest')

const DEFAULT_EVIDENCE_ROOT = path.join('docs', 'release-evidence', 'plugin-cleanup-evidence')
const DEFAULT_COLLECTOR_COMMAND = 'bash'
const DEFAULT_COLLECTOR_TIMEOUT_MS = 300000

const usage = () => [
  'Usage: node scripts/run-plugin-cleanup-evidence-collector.js [options]',
  '',
  'Options:',
  '  --archive-dir <dir>   Directory for report, collector, collected evidence, and archive manifest.',
  '  --plugin-id <id>      Cleanup scenario plugin id. Defaults to openpet.cleanup-fixture.',
  '  --host-app <label>    Host app label. Defaults to OpenPet packaged app.',
  '  --notes <text>        Scenario notes.',
  '  --json                Print the generated run summary as JSON.',
  '  --help',
  '',
  'Creates a pending cleanup evidence report, generates the POSIX collector, executes it,',
  'and writes a hash manifest for the collected archive. The runner does not mark cleanup',
  'checks as pass and does not prove cleanup readiness by itself.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const sessionIdFromDate = (date) => date.toISOString().replace(/[:.]/g, '-').replace(/-000Z$/, 'Z')

const defaultArchiveDir = ({
  now = () => new Date(),
  platform = process.platform,
  arch = process.arch
} = {}) => path.join(DEFAULT_EVIDENCE_ROOT, `${sessionIdFromDate(now())}-${platform}-${arch}`)

const parseArgs = (argv) => {
  const options = {
    archiveDir: '',
    pluginId: 'openpet.cleanup-fixture',
    hostApp: 'OpenPet packaged app',
    notes: 'Packaged plugin cleanup evidence execution run',
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--archive-dir') {
      options.archiveDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--plugin-id') {
      options.pluginId = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--host-app') {
      options.hostApp = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--notes') {
      options.notes = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!options.pluginId) throw new Error('--plugin-id requires a value')
  if (!options.hostApp) throw new Error('--host-app requires a value')
  return options
}

const assertRunOutputsDoNotExist = ({ paths, fsImpl = fs }) => {
  for (const outputPath of [paths.reportPath, paths.collectorPath, paths.evidenceDir, paths.outputPath]) {
    if (fsImpl.existsSync(outputPath)) {
      throw new Error(`Plugin cleanup evidence run output already exists: ${outputPath}`)
    }
  }
}

const writeTextFile = ({ filePath, content, fsImpl = fs }) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, String(content ?? ''))
}

const serializeError = (error) => {
  if (!error) return ''
  return error.message || String(error)
}

const runCollectorCommand = ({
  collectorPath,
  reportPath,
  evidenceDir,
  command = DEFAULT_COLLECTOR_COMMAND,
  timeoutMs = DEFAULT_COLLECTOR_TIMEOUT_MS,
  cwd = process.cwd(),
  env = process.env,
  now = () => new Date(),
  spawnSyncImpl = spawnSync,
  fsImpl = fs
}) => {
  const startedAt = now().toISOString()
  fsImpl.mkdirSync(evidenceDir, { recursive: true })

  const result = spawnSyncImpl(command, [collectorPath], {
    cwd,
    env: {
      ...env,
      REPORT_PATH: reportPath,
      EVIDENCE_DIR: evidenceDir
    },
    encoding: 'utf-8',
    timeout: timeoutMs,
    windowsHide: true
  })
  const finishedAt = now().toISOString()
  const exitCode = Number.isInteger(result.status) ? result.status : null
  const signal = result.signal || ''
  const error = serializeError(result.error)
  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  const stdoutPath = path.join(evidenceDir, 'collector-stdout.txt')
  const stderrPath = path.join(evidenceDir, 'collector-stderr.txt')
  const runPath = path.join(evidenceDir, 'collector-run.json')
  const run = {
    startedAt,
    finishedAt,
    ok: exitCode === 0 && !error,
    command: [command, collectorPath],
    cwd,
    timeoutMs,
    reportPath,
    evidenceDir,
    exitCode,
    signal,
    error,
    stdoutPath,
    stderrPath
  }

  writeTextFile({ filePath: stdoutPath, content: stdout, fsImpl })
  writeTextFile({ filePath: stderrPath, content: stderr, fsImpl })
  writeTextFile({ filePath: runPath, content: `${JSON.stringify(run, null, 2)}\n`, fsImpl })

  return {
    ...run,
    runPath
  }
}

const createPluginCleanupEvidenceRun = ({
  archiveDir = '',
  pluginId = 'openpet.cleanup-fixture',
  hostApp = 'OpenPet packaged app',
  notes = 'Packaged plugin cleanup evidence execution run',
  now = () => new Date(),
  platform = process.platform,
  arch = process.arch,
  nodeVersion = process.version,
  env = process.env,
  hostname,
  collectorTimeoutMs = DEFAULT_COLLECTOR_TIMEOUT_MS,
  spawnSyncImpl = spawnSync,
  fsImpl = fs
} = {}) => {
  const selectedArchiveDir = archiveDir || defaultArchiveDir({ now, platform, arch })
  const paths = resolveArchivePaths({ archiveDir: selectedArchiveDir })
  assertRunOutputsDoNotExist({ paths, fsImpl })

  const report = createPluginCleanupEvidenceReport({
    platform,
    arch,
    nodeVersion,
    env,
    hostname,
    now,
    pluginId,
    hostApp,
    notes
  })
  const reportPath = writeReport({ report, outputPath: paths.reportPath, fsImpl })
  const collector = createCollector({ report, reportPath, generatedAt: now() })
  const collectorPath = writeCollector({ content: collector, outputPath: paths.collectorPath, fsImpl })
  const collectorRun = runCollectorCommand({
    collectorPath,
    reportPath,
    evidenceDir: paths.evidenceDir,
    env,
    now,
    timeoutMs: collectorTimeoutMs,
    spawnSyncImpl,
    fsImpl
  })
  const manifest = createPluginCleanupEvidenceArchiveManifest({
    archiveDir: paths.archiveDir,
    reportPath,
    collectorPath,
    evidenceDir: paths.evidenceDir,
    outputPath: paths.outputPath,
    now,
    fsImpl
  })
  const manifestPath = writeManifest({ manifest, outputPath: paths.outputPath, fsImpl })

  return {
    ok: collectorRun.ok && manifest.ok,
    archiveDir: paths.archiveDir,
    reportPath,
    collectorPath,
    evidenceDir: paths.evidenceDir,
    manifestPath,
    collectorRun,
    manifest
  }
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const result = createPluginCleanupEvidenceRun(options)
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Plugin cleanup evidence run archive: ${result.archiveDir}`)
    console.log(`Collector exit: ${result.collectorRun.exitCode === null ? 'unknown' : result.collectorRun.exitCode}`)
    console.log(`Archive valid: ${result.manifest.ok ? 'yes' : 'no'}`)
    console.log(`Plugin cleanup ready: ${result.manifest.cleanupReady ? 'yes' : 'no'}`)
    if (!result.manifest.cleanupReady) {
      console.log('Cleanup checks remain pending until real reviewed evidence is marked pass.')
    }
  }

  if (!result.ok) process.exit(1)
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}

module.exports = {
  createPluginCleanupEvidenceRun,
  defaultArchiveDir,
  parseArgs,
  runCollectorCommand,
  sessionIdFromDate,
  DEFAULT_COLLECTOR_TIMEOUT_MS
}
