const fs = require('fs')
const path = require('path')

const {
  REQUIRED_CHECKS,
  validateReport
} = require('./validate-plugin-cleanup-evidence-report')
const {
  writeReport
} = require('./update-plugin-cleanup-evidence-report')

const CHECKS = new Set(REQUIRED_CHECKS.map((check) => check.id))

const usage = () => [
  'Usage: node scripts/update-packaged-plugin-cleanup-evidence-report.js <report.json> --runtime-artifact <runtime.json> [--output <report.json>]',
  '',
  'Maps packaged app plugin cleanup runtime evidence into the structured plugin cleanup evidence report.',
  'The mapper only marks a check pass when that specific behavior is observed; it must not claim global cleanup readiness.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    reportPath: '',
    runtimeArtifactPath: '',
    outputPath: '',
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--runtime-artifact') {
      options.runtimeArtifactPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--output') {
      options.outputPath = readValue(argv, index, arg)
      index += 1
    } else if (!options.reportPath) {
      options.reportPath = arg
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const validateRuntimeArtifact = (artifact) => {
  if (!isObject(artifact)) throw new Error('Packaged cleanup runtime artifact must be an object')
  if (artifact.cleanupReady === true) throw new Error('Packaged cleanup runtime artifact must not claim cleanupReady')
  if (!artifact.pluginId) throw new Error('pluginId is required')
  if (!artifact.hostApp) throw new Error('hostApp is required')
}

const clone = (value) => JSON.parse(JSON.stringify(value))

const ensureCheck = (report, checkId) => {
  if (!CHECKS.has(checkId)) throw new Error(`Unknown cleanup evidence check: ${checkId}`)
  let check = report.checks.find((item) => item && item.id === checkId)
  if (!check) {
    const required = REQUIRED_CHECKS.find((item) => item.id === checkId)
    check = { id: checkId, status: 'pending', evidence: '', notes: required?.label || checkId }
    report.checks.push(check)
  }
  return check
}

const updateCheck = (report, checkId, patch) => {
  const check = ensureCheck(report, checkId)
  Object.assign(check, patch)
  return check
}

const evidenceFor = ({ artifact, pathLabel, transcriptPath }) => [
  `Packaged app: ${artifact.hostApp}`,
  `Plugin: ${artifact.pluginId}`,
  `Observed path: ${pathLabel}`,
  transcriptPath ? `Transcript: ${transcriptPath}` : ''
].filter(Boolean).join('; ')

const markPassIf = ({ report, artifact, checkId, condition, pathLabel, transcriptPath, passNotes, pendingNotes }) => {
  if (condition) {
    updateCheck(report, checkId, {
      status: 'pass',
      evidence: evidenceFor({ artifact, pathLabel, transcriptPath }),
      notes: passNotes
    })
    return
  }

  updateCheck(report, checkId, {
    status: 'pending',
    evidence: '',
    notes: pendingNotes
  })
}

const mapPackagedCleanupEvidence = ({ report, runtimeArtifact }) => {
  validateRuntimeArtifact(runtimeArtifact)
  const updated = clone(report)
  if (!Array.isArray(updated.checks)) updated.checks = []
  if (!isObject(updated.scenario)) updated.scenario = {}
  updated.scenario.pluginId = runtimeArtifact.pluginId
  updated.scenario.hostApp = runtimeArtifact.hostApp

  const setup = runtimeArtifact.setup || {}
  const command = runtimeArtifact.command || {}
  const service = runtimeArtifact.service || {}

  markPassIf({
    report: updated,
    artifact: runtimeArtifact,
    checkId: 'setup-exit-confirmed-stop',
    condition: Boolean(setup.stopRequested && setup.exitConfirmed),
    pathLabel: 'setup stop exit confirmation',
    transcriptPath: setup.transcriptPath,
    passNotes: 'Packaged app setup stop remained observable until child exit confirmation.',
    pendingNotes: 'Setup exit confirmation was not observed in this packaged run.'
  })
  markPassIf({
    report: updated,
    artifact: runtimeArtifact,
    checkId: 'setup-tree-fallback-cleanup',
    condition: Boolean(setup.treeCleanupAttempted),
    pathLabel: 'setup tree fallback cleanup',
    transcriptPath: setup.transcriptPath,
    passNotes: 'Packaged app setup cleanup attempted host-owned process-tree fallback.',
    pendingNotes: 'Setup tree fallback cleanup was not observed in this packaged run.'
  })
  markPassIf({
    report: updated,
    artifact: runtimeArtifact,
    checkId: 'command-exit-confirmed-stop',
    condition: Boolean(command.stopRequested && command.exitConfirmed),
    pathLabel: 'declaration command stop exit confirmation',
    transcriptPath: command.transcriptPath,
    passNotes: 'Packaged app declaration command stop remained observable until child exit confirmation.',
    pendingNotes: 'Declaration command exit confirmation was not observed in this packaged run.'
  })
  markPassIf({
    report: updated,
    artifact: runtimeArtifact,
    checkId: 'command-tree-fallback-cleanup',
    condition: Boolean(command.treeCleanupAttempted),
    pathLabel: 'declaration command tree fallback cleanup',
    transcriptPath: command.transcriptPath,
    passNotes: 'Packaged app declaration command cleanup attempted host-owned process-tree fallback.',
    pendingNotes: 'Declaration command tree fallback cleanup was not observed in this packaged run.'
  })
  markPassIf({
    report: updated,
    artifact: runtimeArtifact,
    checkId: 'service-exit-confirmed-stop',
    condition: Boolean(service.stopRequested && service.exitConfirmed),
    pathLabel: 'service stop exit confirmation',
    transcriptPath: service.transcriptPath,
    passNotes: 'Packaged app service stop remained observable until child exit confirmation.',
    pendingNotes: 'Service exit confirmation was not observed in this packaged run.'
  })
  markPassIf({
    report: updated,
    artifact: runtimeArtifact,
    checkId: 'service-process-group-cleanup',
    condition: Boolean(service.processGroupCleanupAttempted),
    pathLabel: 'service process-group cleanup',
    transcriptPath: service.transcriptPath,
    passNotes: 'Packaged app service stop attempted process-group cleanup.',
    pendingNotes: 'Service process-group cleanup was not observed in this packaged run.'
  })
  markPassIf({
    report: updated,
    artifact: runtimeArtifact,
    checkId: 'service-tree-fallback-cleanup',
    condition: Boolean(service.treeCleanupAttempted),
    pathLabel: 'service tree fallback cleanup',
    transcriptPath: service.transcriptPath,
    passNotes: 'Packaged app service cleanup attempted host-owned process-tree fallback.',
    pendingNotes: 'Service tree fallback cleanup was not observed in this packaged run.'
  })
  markPassIf({
    report: updated,
    artifact: runtimeArtifact,
    checkId: 'service-force-stop',
    condition: Boolean(service.forceStopAttempted),
    pathLabel: 'service bounded force stop',
    transcriptPath: service.transcriptPath,
    passNotes: 'Packaged app service cleanup attempted one bounded host-side force stop.',
    pendingNotes: 'Service force stop was not observed in this packaged run.'
  })

  const validation = validateReport(updated, { allowPending: true })
  if (!validation.ok) {
    throw new Error(`Mapped packaged cleanup report is invalid: ${validation.errors.join('; ')}`)
  }

  return updated
}

const loadJson = (filePath, fsImpl = fs) => JSON.parse(fsImpl.readFileSync(path.resolve(filePath), 'utf-8'))

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }
  if (!options.reportPath) throw new Error('Report path is required')
  if (!options.runtimeArtifactPath) throw new Error('--runtime-artifact is required')

  const report = loadJson(options.reportPath)
  const runtimeArtifact = loadJson(options.runtimeArtifactPath)
  const updated = mapPackagedCleanupEvidence({ report, runtimeArtifact })
  const outputPath = writeReport({
    report: updated,
    outputPath: options.outputPath || options.reportPath
  })

  console.log(`Packaged plugin cleanup evidence report updated: ${outputPath}`)
  console.log('Report structure is valid; readiness still depends on every required check passing with evidence.')
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
  mapPackagedCleanupEvidence,
  parseArgs,
  validateRuntimeArtifact
}
