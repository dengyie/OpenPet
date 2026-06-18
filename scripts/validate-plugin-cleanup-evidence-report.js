const fs = require('fs')
const path = require('path')

const REQUIRED_CHECKS = [
  { id: 'service-exit-confirmed-stop', label: 'Service stop remains visible until child exit confirmation' },
  { id: 'service-process-group-cleanup', label: 'Service stop attempts process-group cleanup' },
  { id: 'service-tree-fallback-cleanup', label: 'Service stop falls back to host-owned process-tree cleanup when process-group signalling fails' },
  { id: 'service-force-stop', label: 'Stubborn service receives one bounded host-side force-stop attempt' },
  { id: 'setup-exit-confirmed-stop', label: 'Setup stop remains visible until child exit confirmation' },
  { id: 'setup-tree-fallback-cleanup', label: 'Setup cleanup tries host-owned process-tree cleanup before direct child kill' },
  { id: 'command-exit-confirmed-stop', label: 'Declaration command stop remains visible until child exit confirmation' },
  { id: 'command-tree-fallback-cleanup', label: 'Declaration command cleanup tries host-owned process-tree cleanup before direct child kill' }
]

const REQUIRED_CHECK_IDS = new Set(REQUIRED_CHECKS.map((check) => check.id))
const VALID_STATUSES = new Set(['pass', 'fail', 'pending', 'blocked'])
const SCHEMA_VERSION = 'openpet-plugin-cleanup-evidence/v1'

const usage = () => [
  'Usage: node scripts/validate-plugin-cleanup-evidence-report.js <report.json> [--allow-pending]',
  '',
  'By default every required plugin cleanup evidence check must pass.',
  '--allow-pending validates template/in-progress reports without claiming cleanup readiness.'
].join('\n')

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const hasEvidence = (value) => {
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.some(hasEvidence)
  if (isObject(value)) return Object.values(value).some(hasEvidence)
  return false
}

const parseArgs = (argv) => {
  const options = {
    reportPath: null,
    allowPending: false,
    help: false
  }

  for (const arg of argv) {
    if (arg === '--allow-pending') {
      options.allowPending = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (!options.reportPath) {
      options.reportPath = arg
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

const loadReport = (reportPath) => {
  if (!reportPath) throw new Error('Report path is required')
  const absolutePath = path.resolve(reportPath)
  const raw = fs.readFileSync(absolutePath, 'utf-8')
  return { absolutePath, report: JSON.parse(raw) }
}

const validateReport = (report, options = {}) => {
  const allowPending = Boolean(options.allowPending)
  const errors = []
  const warnings = []

  if (!isObject(report)) {
    return { ok: false, errors: ['Report must be a JSON object'], warnings, summary: { passed: 0, total: REQUIRED_CHECKS.length, cleanupReady: false } }
  }

  if (report.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be "${SCHEMA_VERSION}"`)
  if (!hasEvidence(report.generatedAt)) errors.push('generatedAt is required')
  if (!hasEvidence(report.source)) errors.push('source is required')

  if (!isObject(report.environment)) {
    errors.push('environment object is required')
  } else {
    if (!hasEvidence(report.environment.platform)) errors.push('environment.platform is required')
    if (!hasEvidence(report.environment.arch)) errors.push('environment.arch is required')
    if (!hasEvidence(report.environment.node)) errors.push('environment.node is required')
    if (!allowPending && !hasEvidence(report.environment.machine)) errors.push('environment.machine evidence is required')
    if (!allowPending && !hasEvidence(report.environment.evidence)) errors.push('environment.evidence is required')
  }

  if (!isObject(report.scenario)) {
    errors.push('scenario object is required')
  } else {
    if (!hasEvidence(report.scenario.pluginId)) errors.push('scenario.pluginId is required')
    if (!hasEvidence(report.scenario.hostApp)) errors.push('scenario.hostApp is required')
  }

  if (!Array.isArray(report.checks)) errors.push('checks must be an array')

  const checksById = new Map()
  for (const check of Array.isArray(report.checks) ? report.checks : []) {
    if (!isObject(check)) {
      errors.push('each check must be an object')
      continue
    }
    if (!check.id) {
      errors.push('each check requires an id')
      continue
    }
    if (!REQUIRED_CHECK_IDS.has(check.id)) errors.push(`unknown check id: ${check.id}`)
    if (checksById.has(check.id)) errors.push(`duplicate check id: ${check.id}`)
    checksById.set(check.id, check)
  }

  for (const required of REQUIRED_CHECKS) {
    const check = checksById.get(required.id)
    if (!check) {
      errors.push(`missing required check: ${required.id}`)
      continue
    }
    if (!VALID_STATUSES.has(check.status)) errors.push(`${required.id} has invalid status: ${check.status}`)
    if (check.status === 'pass' && !hasEvidence(check.evidence)) {
      errors.push(`${required.id} passed but has no evidence`)
    }
    if ((check.status === 'fail' || check.status === 'blocked') && !hasEvidence(check.notes)) {
      errors.push(`${required.id} is ${check.status} but has no notes`)
    }
    if (!allowPending && check.status !== 'pass') {
      errors.push(`${required.id} must pass before plugin cleanup readiness can be claimed`)
    }
  }

  const passed = [...checksById.values()].filter((check) => check.status === 'pass').length
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      passed,
      total: REQUIRED_CHECKS.length,
      cleanupReady: errors.length === 0 && !allowPending
    }
  }
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const { absolutePath, report } = loadReport(options.reportPath)
  const result = validateReport(report, options)

  console.log(`Plugin cleanup evidence report: ${absolutePath}`)
  console.log(`Checks: ${result.summary.passed}/${result.summary.total} passed`)
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`)

  if (!result.ok) {
    for (const error of result.errors) console.error(`Error: ${error}`)
    process.exit(1)
  }

  if (options.allowPending) {
    console.log('Report structure is valid.')
  } else {
    console.log('Plugin cleanup evidence report passed cleanup-readiness checks.')
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
  REQUIRED_CHECKS,
  SCHEMA_VERSION,
  validateReport
}
