const fs = require('fs')
const path = require('path')

const REQUIRED_CHECKS = [
  { id: 'packaged-launch', label: 'Launch packaged OpenPet and keep it running' },
  { id: 'control-center-open', label: 'Open Control Center from the packaged app' },
  { id: 'plugin-picker-cancel', label: 'Plugin package native picker cancel path is safe' },
  { id: 'plugin-picker-zip-review', label: 'Plugin package native picker reviews a real zip package' },
  { id: 'plugin-install-disabled', label: 'Plugin selected from the native picker installs disabled by default' },
  { id: 'invalid-package-feedback', label: 'Invalid plugin or pet package shows a visible error from the packaged app' },
  { id: 'action-frame-picker-cancel', label: 'Action frame folder native picker cancel path is safe' },
  { id: 'pet-pack-picker-cancel', label: 'Pet pack folder native picker cancel path is safe' },
  { id: 'state-after-picker-smoke', label: 'Application state remains consistent after picker smoke checks' }
]

const REQUIRED_CHECK_IDS = new Set(REQUIRED_CHECKS.map((check) => check.id))
const VALID_PLATFORMS = new Set(['darwin', 'win32'])
const VALID_STATUSES = new Set(['pass', 'fail', 'pending', 'blocked'])

const usage = () => [
  'Usage: node scripts/validate-desktop-picker-smoke-report.js <report.json> [--allow-pending] [--require-signature-integrity]',
  '',
  'Validates packaged desktop native OS file picker smoke evidence for macOS or Windows.',
  'By default every required picker smoke check must pass.',
  '--allow-pending validates generated or in-progress reports without claiming smoke success.',
  '--require-signature-integrity additionally requires signature integrity evidence for the reported platform.'
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
    requireSignatureIntegrity: false,
    requireSigned: false,
    help: false
  }

  for (const arg of argv) {
    if (arg === '--allow-pending') {
      options.allowPending = true
    } else if (arg === '--require-signature-integrity') {
      options.requireSignatureIntegrity = true
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

const validateSignatureEvidence = ({ report, errors, legacySigned = false }) => {
  if (!isObject(report.artifact)) return
  const flag = legacySigned ? '--require-signed' : '--require-signature-integrity'
  if (report.artifact.signed !== true) errors.push(`artifact.signed must be true when ${flag} is used`)

  if (report.platform === 'darwin') {
    if (String(report.artifact.signatureStatus || '').toLowerCase() !== 'valid') {
      errors.push(`artifact.signatureStatus must be "Valid" for ${legacySigned ? 'signed' : 'signature-integrity'} macOS picker smoke readiness`)
    }
    if (!hasEvidence(report.artifact.signatureEvidence)) {
      errors.push(`artifact.signatureEvidence is required for ${legacySigned ? 'signed' : 'signature-integrity'} macOS picker smoke readiness`)
    }
  }

  if (report.platform === 'win32') {
    if (String(report.artifact.authenticodeStatus || '').toLowerCase() !== 'valid') {
      errors.push(`artifact.authenticodeStatus must be "Valid" for ${legacySigned ? 'signed' : 'signature-integrity'} Windows picker smoke readiness`)
    }
    if (!hasEvidence(report.artifact.signatureEvidence) && !hasEvidence(report.artifact.authenticodeEvidence)) {
      errors.push(`artifact.signatureEvidence or artifact.authenticodeEvidence is required for ${legacySigned ? 'signed' : 'signature-integrity'} Windows picker smoke readiness`)
    }
  }
}

const validateReport = (report, options = {}) => {
  const allowPending = Boolean(options.allowPending)
  const requireSignatureIntegrity = Boolean(options.requireSignatureIntegrity || options.requireSigned)
  const legacySigned = Boolean(options.requireSigned && !options.requireSignatureIntegrity)
  const errors = []
  const warnings = []

  if (!isObject(report)) {
    return { ok: false, errors: ['Report must be a JSON object'], warnings, summary: { passed: 0, total: REQUIRED_CHECKS.length } }
  }

  if (!VALID_PLATFORMS.has(report.platform)) errors.push('platform must be "darwin" or "win32"')
  if (!hasEvidence(report.arch)) errors.push('arch is required')
  if (!allowPending && !hasEvidence(report.environment)) errors.push('environment evidence is required')
  if (!isObject(report.artifact)) errors.push('artifact object is required')

  if (isObject(report.artifact)) {
    if (!allowPending && !hasEvidence(report.artifact.version)) errors.push('artifact.version evidence is required')
    if (!allowPending && !hasEvidence(report.artifact.appPath) && !hasEvidence(report.artifact.installer)) {
      errors.push('artifact.appPath or artifact.installer evidence is required')
    }
    if (requireSignatureIntegrity) {
      validateSignatureEvidence({ report, errors, legacySigned })
    } else if (report.artifact.signed !== true) {
      warnings.push('Desktop picker artifact signature integrity is not established')
    }
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
    if (check.status === 'pass' && !hasEvidence(check.evidence)) errors.push(`${required.id} passed but has no evidence`)
    if ((check.status === 'fail' || check.status === 'blocked') && !hasEvidence(check.notes)) {
      errors.push(`${required.id} is ${check.status} but has no notes`)
    }
    if (!allowPending && check.status !== 'pass') {
      errors.push(`${required.id} must pass before desktop picker smoke readiness can be claimed`)
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
      signatureIntegrityReady: errors.length === 0 && !allowPending && requireSignatureIntegrity && report.artifact?.signed === true,
      // Keep the historical field for consumers of older evidence JSON.
      officialReady: errors.length === 0 && !allowPending && requireSignatureIntegrity && report.artifact?.signed === true
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

  console.log(`Desktop picker smoke report: ${absolutePath}`)
  console.log(`Checks: ${result.summary.passed}/${result.summary.total} passed`)
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`)

  if (!result.ok) {
    for (const error of result.errors) console.error(`Error: ${error}`)
    process.exit(1)
  }

  if (options.allowPending) {
    console.log('Report structure is valid.')
  } else if (options.requireSignatureIntegrity || options.requireSigned) {
    console.log('Desktop picker smoke report passed signature-integrity checks.')
  } else {
    console.log('Desktop picker smoke report passed smoke checks. Signature integrity was not required.')
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
