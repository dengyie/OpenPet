const fs = require('fs')
const path = require('path')

const REQUIRED_CHECKS = [
  { id: 'install', label: 'Install NSIS package on a clean Windows machine' },
  { id: 'launch', label: 'Launch installed app and keep it running' },
  { id: 'transparent-window', label: 'Transparent pet window renders with alpha' },
  { id: 'drag-bounds', label: 'Drag, bounds, always-on-top, and taskbar behavior' },
  { id: 'control-center-tabs', label: 'Control Center opens all tabs' },
  { id: 'pet-actions', label: 'Built-in sprites and imported frame folders work' },
  { id: 'pet-pack-import', label: 'Pet pack import, enable, and delete works on Windows paths' },
  { id: 'plugin-runner', label: 'Plugin runner works on Windows paths with restricted permissions' },
  { id: 'local-http-default-off', label: 'Local HTTP and MCP remain disabled by default' },
  { id: 'local-http-token-gated', label: 'Local HTTP and MCP are loopback-only and token-gated' },
  { id: 'api-key-isolation', label: 'API keys are unavailable to renderer and ordinary plugins' },
  { id: 'about-update-assets', label: 'About update check shows only Windows install assets' },
  { id: 'uninstall', label: 'Uninstall preserves user data unless explicitly removed' }
]

const REQUIRED_CHECK_IDS = new Set(REQUIRED_CHECKS.map((check) => check.id))
const VALID_STATUSES = new Set(['pass', 'fail', 'pending', 'blocked'])

const usage = () => [
  'Usage: node scripts/validate-windows-smoke-report.js <report.json> [--allow-pending] [--require-signed]',
  '',
  'By default every required Windows smoke check must pass.',
  '--allow-pending validates template/in-progress reports without claiming release readiness.',
  '--require-signed additionally requires Authenticode signature evidence.'
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
    requireSigned: false
  }

  for (const arg of argv) {
    if (arg === '--allow-pending') {
      options.allowPending = true
    } else if (arg === '--require-signed') {
      options.requireSigned = true
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
  const requireSigned = Boolean(options.requireSigned)
  const errors = []
  const warnings = []

  if (!isObject(report)) {
    return { ok: false, errors: ['Report must be a JSON object'], warnings, summary: { passed: 0, total: REQUIRED_CHECKS.length } }
  }

  if (report.platform !== 'win32') errors.push('platform must be "win32"')
  if (report.arch !== 'x64') errors.push('arch must be "x64" for the current Windows release track')
  if (!allowPending && !hasEvidence(report.environment)) errors.push('environment evidence is required')
  if (!isObject(report.artifact)) errors.push('artifact object is required')

  if (isObject(report.artifact)) {
    if (!allowPending && !hasEvidence(report.artifact.installer)) errors.push('artifact.installer evidence is required')
    if (!allowPending && !hasEvidence(report.artifact.version)) errors.push('artifact.version evidence is required')
    if (requireSigned) {
      if (report.artifact.signed !== true) errors.push('artifact.signed must be true when --require-signed is used')
      if (String(report.artifact.authenticodeStatus || '').toLowerCase() !== 'valid') {
        errors.push('artifact.authenticodeStatus must be "Valid" when --require-signed is used')
      }
      if (!hasEvidence(report.artifact.authenticodeEvidence)) {
        errors.push('artifact.authenticodeEvidence is required when --require-signed is used')
      }
    } else if (report.artifact.signed !== true) {
      warnings.push('Windows artifact is not signed; this report cannot prove official release readiness')
    }
  }

  if (!Array.isArray(report.checks)) {
    errors.push('checks must be an array')
  }

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
      errors.push(`${required.id} must pass before Windows release readiness can be claimed`)
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
      smokeReady: errors.length === 0 && !allowPending,
      officialReady: errors.length === 0 && !allowPending && requireSigned && report.artifact?.signed === true
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

  console.log(`Windows smoke report: ${absolutePath}`)
  console.log(`Checks: ${result.summary.passed}/${result.summary.total} passed`)
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`)

  if (!result.ok) {
    for (const error of result.errors) console.error(`Error: ${error}`)
    process.exit(1)
  }

  if (options.allowPending) {
    console.log('Report structure is valid.')
  } else if (options.requireSigned) {
    console.log('Windows smoke report passed signed official-readiness checks.')
  } else {
    console.log('Windows smoke report passed smoke checks. Official release readiness still requires signed artifact validation.')
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
