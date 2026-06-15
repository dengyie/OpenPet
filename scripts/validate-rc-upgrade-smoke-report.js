const fs = require('fs')
const path = require('path')

const REQUIRED_CHECKS = [
  { id: 'legacy-dir-exists', label: 'Legacy ibot userData directory exists' },
  { id: 'observed-user-data-dir', label: 'Observed OpenPet userData directory is the legacy ibot directory' },
  { id: 'settings-preserved', label: 'Legacy settings.json remains readable' },
  { id: 'secrets-preserved', label: 'Legacy secrets.json remains present' },
  { id: 'plugins-preserved', label: 'Legacy installed plugins directory remains present' },
  { id: 'pet-packs-preserved', label: 'Legacy installed pet packs directory remains present' },
  { id: 'local-http-logs-preserved', label: 'Legacy local HTTP logs remain present in settings.json' },
  { id: 'openpet-dir-not-active', label: 'OpenPet-named userData directory is not the active data source' }
]

const REQUIRED_CHECK_IDS = new Set(REQUIRED_CHECKS.map((check) => check.id))
const VALID_STATUSES = new Set(['pass', 'fail', 'pending', 'blocked'])

const usage = () => [
  'Usage: node scripts/validate-rc-upgrade-smoke-report.js <report.json> [--allow-pending]',
  '',
  'Validates local OpenPet RC upgrade compatibility smoke evidence.',
  'By default every required upgrade compatibility check must pass.',
  '--allow-pending validates generated or in-progress reports without claiming upgrade smoke success.'
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
    return { ok: false, errors: ['Report must be a JSON object'], warnings, summary: { passed: 0, total: REQUIRED_CHECKS.length } }
  }

  if (!['darwin', 'win32'].includes(report.platform)) {
    warnings.push('RC upgrade smoke reports are intended for macOS or Windows desktop validation')
  }
  if (!isObject(report.environment)) errors.push('environment object is required')
  if (!isObject(report.artifact)) errors.push('artifact object is required')

  if (isObject(report.environment)) {
    if (!hasEvidence(report.environment.appDataDir)) errors.push('environment.appDataDir is required')
    if (!hasEvidence(report.environment.legacyUserDataDir)) errors.push('environment.legacyUserDataDir is required')
    if (!allowPending && !hasEvidence(report.environment.observedUserDataDir)) {
      errors.push('environment.observedUserDataDir is required before upgrade smoke readiness can be claimed')
    }
  }

  if (isObject(report.artifact)) {
    if (!hasEvidence(report.artifact.version)) errors.push('artifact.version is required')
    if (!hasEvidence(report.artifact.productName)) errors.push('artifact.productName is required')
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
      errors.push(`${required.id} must pass before RC upgrade smoke readiness can be claimed`)
    }
  }

  const openpetDirCheck = checksById.get('openpet-dir-not-active')
  if (openpetDirCheck?.status !== 'pass') {
    warnings.push('OpenPet-named userData directory was not proven inactive')
  }

  const passed = [...checksById.values()].filter((check) => check.status === 'pass').length
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      passed,
      total: REQUIRED_CHECKS.length,
      upgradeReady: errors.length === 0 && !allowPending
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

  console.log(`RC upgrade smoke report: ${absolutePath}`)
  console.log(`Checks: ${result.summary.passed}/${result.summary.total} passed`)
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`)

  if (!result.ok) {
    for (const error of result.errors) console.error(`Error: ${error}`)
    process.exit(1)
  }

  if (options.allowPending) {
    console.log('Report structure is valid.')
  } else {
    console.log('RC upgrade smoke report passed local upgrade compatibility checks.')
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
  validateReport
}
