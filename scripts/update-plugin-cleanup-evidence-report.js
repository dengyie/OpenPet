const fs = require('fs')
const path = require('path')

const { REQUIRED_CHECKS, validateReport } = require('./validate-plugin-cleanup-evidence-report')

const VALID_STATUSES = new Set(['pass', 'fail', 'pending', 'blocked'])
const ENVIRONMENT_KEYS = new Set(['platform', 'arch', 'node', 'machine', 'runner', 'evidence'])
const SCENARIO_KEYS = new Set(['pluginId', 'hostApp', 'notes'])

const usage = () => [
  'Usage: node scripts/update-plugin-cleanup-evidence-report.js <report.json> [options]',
  '',
  'Options:',
  '  --output <report.json>        Write to a different report path instead of replacing input',
  '  --list-checks                Print required cleanup evidence check ids and exit',
  '  --check <id>                 Select a required check to update',
  '  --status <pass|fail|pending|blocked>',
  '  --evidence <text>            Set selected check evidence',
  '  --evidence-file <path>       Set selected check evidence from a UTF-8 text file',
  '  --notes <text>               Set selected check notes',
  '  --set-env <key=value>        Set environment metadata; repeatable',
  '  --set-scenario <key=value>   Set cleanup scenario metadata; repeatable',
  '  --validate-ready             Require all checks to pass after writing',
  '',
  'Default validation is structural and allows pending checks so reports can be filled incrementally.'
].join('\n')

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const parseKeyValue = (raw) => {
  const text = String(raw || '')
  const index = text.indexOf('=')
  if (index <= 0) throw new Error(`Expected key=value, got: ${raw}`)
  return {
    key: text.slice(0, index),
    value: text.slice(index + 1)
  }
}

const parseArgs = (argv) => {
  const options = {
    reportPath: null,
    outputPath: null,
    listChecks: false,
    checkId: null,
    status: null,
    evidence: undefined,
    evidenceFile: null,
    notes: undefined,
    envUpdates: [],
    scenarioUpdates: [],
    validateReady: false,
    help: false
  }

  const readValue = (index, flag) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--list-checks') {
      options.listChecks = true
    } else if (arg === '--output') {
      options.outputPath = readValue(index, arg)
      index += 1
    } else if (arg === '--check') {
      options.checkId = readValue(index, arg)
      index += 1
    } else if (arg === '--status') {
      options.status = readValue(index, arg)
      index += 1
    } else if (arg === '--evidence') {
      options.evidence = readValue(index, arg)
      index += 1
    } else if (arg === '--evidence-file') {
      options.evidenceFile = readValue(index, arg)
      index += 1
    } else if (arg === '--notes') {
      options.notes = readValue(index, arg)
      index += 1
    } else if (arg === '--set-env') {
      options.envUpdates.push(parseKeyValue(readValue(index, arg)))
      index += 1
    } else if (arg === '--set-scenario') {
      options.scenarioUpdates.push(parseKeyValue(readValue(index, arg)))
      index += 1
    } else if (arg === '--validate-ready') {
      options.validateReady = true
    } else if (!options.reportPath) {
      options.reportPath = arg
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!options.checkId && (options.status || options.evidence !== undefined || options.evidenceFile || options.notes !== undefined)) {
    throw new Error('--check is required when updating check status, evidence, or notes')
  }
  if (options.status && !VALID_STATUSES.has(options.status)) throw new Error(`Invalid check status: ${options.status}`)
  return options
}

const loadReport = (reportPath, fsImpl = fs) => {
  if (!reportPath) throw new Error('Report path is required')
  const absolutePath = path.resolve(reportPath)
  return {
    absolutePath,
    report: JSON.parse(fsImpl.readFileSync(absolutePath, 'utf-8'))
  }
}

const ensureReportShape = (report) => {
  if (!isObject(report)) throw new Error('Report must be a JSON object')
  if (!isObject(report.environment)) report.environment = {}
  if (!isObject(report.scenario)) report.scenario = {}
  if (!Array.isArray(report.checks)) report.checks = []
}

const getRequiredCheck = (checkId) => REQUIRED_CHECKS.find((check) => check.id === checkId)

const ensureCheck = (report, checkId) => {
  const required = getRequiredCheck(checkId)
  if (!required) throw new Error(`Unknown check id: ${checkId}`)

  let check = report.checks.find((item) => item && item.id === checkId)
  if (!check) {
    check = {
      id: checkId,
      status: 'pending',
      evidence: '',
      notes: required.label
    }
    report.checks.push(check)
  }
  return check
}

const applyMetadataUpdates = ({ target, updates, allowedKeys, label }) => {
  for (const update of updates || []) {
    if (!allowedKeys.has(update.key)) throw new Error(`Unknown ${label} key: ${update.key}`)
    target[update.key] = update.value
  }
}

const updateReport = (report, options, fsImpl = fs) => {
  ensureReportShape(report)

  applyMetadataUpdates({
    target: report.environment,
    updates: options.envUpdates,
    allowedKeys: ENVIRONMENT_KEYS,
    label: 'environment'
  })

  applyMetadataUpdates({
    target: report.scenario,
    updates: options.scenarioUpdates,
    allowedKeys: SCENARIO_KEYS,
    label: 'scenario'
  })

  if (options.checkId) {
    const check = ensureCheck(report, options.checkId)
    if (options.status) check.status = options.status
    if (options.evidence !== undefined) check.evidence = options.evidence
    if (options.evidenceFile) check.evidence = fsImpl.readFileSync(path.resolve(options.evidenceFile), 'utf-8').trim()
    if (options.notes !== undefined) check.notes = options.notes
  }

  return report
}

const writeReport = ({ report, outputPath, fsImpl = fs }) => {
  const absoluteOutputPath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  fsImpl.writeFileSync(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\n`)
  return absoluteOutputPath
}

const listChecks = () => REQUIRED_CHECKS.map((check) => `${check.id}\t${check.label}`).join('\n')

const validateUpdatedReport = (report, options = {}) => validateReport(report, {
  allowPending: !options.validateReady
})

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }
  if (options.listChecks) {
    console.log(listChecks())
    return
  }

  const { absolutePath, report } = loadReport(options.reportPath)
  const updated = updateReport(report, options)
  const result = validateUpdatedReport(updated, options)

  console.log(`Checks: ${result.summary.passed}/${result.summary.total} passed`)
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`)

  if (!result.ok) {
    for (const error of result.errors) console.error(`Error: ${error}`)
    process.exit(1)
  }

  const outputPath = writeReport({ report: updated, outputPath: options.outputPath || absolutePath })
  console.log(`Plugin cleanup evidence report updated: ${outputPath}`)

  if (options.validateReady) {
    console.log('Plugin cleanup evidence report passed cleanup-readiness validation.')
  } else {
    console.log('Report structure is valid; pending checks may remain.')
  }
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
  listChecks,
  parseArgs,
  updateReport,
  validateUpdatedReport,
  writeReport
}
