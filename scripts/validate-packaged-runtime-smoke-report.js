const fs = require('fs')
const path = require('path')

const BUILT_IN_PACKS = ['legacy-cat', 'doro', 'duodong', 'chispa']

const REQUIRED_CHECKS = [
  { id: 'packaged-launch', label: 'Packaged OpenPet launches and stays running' },
  { id: 'pet-window-created', label: 'Pet BrowserWindow is created from the packaged app' },
  { id: 'transparent-background', label: 'Pet window transparent background renders correctly' },
  { id: 'sprite-visible', label: 'Pet sprite is visible and not fully transparent' },
  { id: 'speech-bubble-rendered', label: 'Floating BubbleChatWindow renders and the old inline bubble stays hidden' },
  { id: 'default-action-playback', label: 'Default action plays in the packaged renderer' },
  ...BUILT_IN_PACKS.map((packId) => ({ id: `pack-switch-${packId}`, label: `Built-in pet pack ${packId} can be activated and rendered` })),
  { id: 'plugin-picker-evidence-linked', label: 'Plugin package native picker smoke evidence is linked' },
  { id: 'pet-picker-evidence-linked', label: 'Pet pack native picker smoke evidence is linked' },
  { id: 'invalid-package-feedback', label: 'Invalid plugin or pet package shows a visible error' },
  { id: 'state-after-runtime-smoke', label: 'State remains consistent after packaged runtime smoke checks' }
]

const REQUIRED_CHECK_IDS = new Set(REQUIRED_CHECKS.map((check) => check.id))
const VALID_PLATFORMS = new Set(['darwin', 'win32'])
const VALID_STATUSES = new Set(['pass', 'fail', 'pending', 'blocked'])
const LINKED_PICKER_CHECK_IDS = new Set([
  'plugin-picker-evidence-linked',
  'pet-picker-evidence-linked',
  'invalid-package-feedback'
])

const usage = () => [
  'Usage: node scripts/validate-packaged-runtime-smoke-report.js <report.json> [--allow-pending] [--require-signed]',
  '',
  'Validates packaged OpenPet runtime smoke evidence for macOS or Windows.',
  'By default every required runtime check must pass.',
  '--allow-pending validates generated or in-progress reports without claiming runtime smoke success.',
  '--require-signed additionally requires signed artifact evidence for the reported platform.'
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
    requireSigned: false,
    help: false
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

const validateSignatureEvidence = ({ report, errors }) => {
  if (!isObject(report.artifact)) return
  if (report.artifact.signed !== true) errors.push('artifact.signed must be true when --require-signed is used')

  if (report.platform === 'darwin') {
    if (String(report.artifact.signatureStatus || '').toLowerCase() !== 'valid') {
      errors.push('artifact.signatureStatus must be "Valid" for signed macOS runtime smoke readiness')
    }
    if (!hasEvidence(report.artifact.signatureEvidence)) {
      errors.push('artifact.signatureEvidence is required for signed macOS runtime smoke readiness')
    }
  }

  if (report.platform === 'win32') {
    if (String(report.artifact.authenticodeStatus || '').toLowerCase() !== 'valid') {
      errors.push('artifact.authenticodeStatus must be "Valid" for signed Windows runtime smoke readiness')
    }
    if (!hasEvidence(report.artifact.signatureEvidence) && !hasEvidence(report.artifact.authenticodeEvidence)) {
      errors.push('artifact.signatureEvidence or artifact.authenticodeEvidence is required for signed Windows runtime smoke readiness')
    }
  }
}

const validateReport = (report, options = {}) => {
  const allowPending = Boolean(options.allowPending)
  const requireSigned = Boolean(options.requireSigned)
  const errors = []
  const warnings = []

  if (!isObject(report)) {
    return { ok: false, errors: ['Report must be a JSON object'], warnings, summary: { passed: 0, total: REQUIRED_CHECKS.length } }
  }

  if (!VALID_PLATFORMS.has(report.platform)) errors.push('platform must be "darwin" or "win32"')
  if (!hasEvidence(report.arch)) errors.push('arch is required')
  if (!allowPending && !hasEvidence(report.environment)) errors.push('environment evidence is required')
  if (!isObject(report.artifact)) errors.push('artifact object is required')
  if (!isObject(report.fixtures)) errors.push('fixtures object is required')
  if (!isObject(report.linkedEvidence)) errors.push('linkedEvidence object is required')

  if (isObject(report.artifact)) {
    if (!allowPending && !hasEvidence(report.artifact.version)) errors.push('artifact.version evidence is required')
    if (!allowPending && !hasEvidence(report.artifact.appPath) && !hasEvidence(report.artifact.installer)) {
      errors.push('artifact.appPath or artifact.installer evidence is required')
    }
    if (requireSigned) {
      validateSignatureEvidence({ report, errors })
    } else if (report.artifact.signed !== true) {
      warnings.push('Packaged runtime artifact is not signed; this report cannot prove official release readiness')
    }
  }

  if (isObject(report.fixtures)) {
    for (const packId of BUILT_IN_PACKS) {
      if (!hasEvidence(report.fixtures.builtInPacks?.[packId])) {
        errors.push(`fixtures.builtInPacks.${packId} evidence is required`)
      }
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
      errors.push(`${required.id} must pass before packaged runtime smoke readiness can be claimed`)
    }
  }

  if (isObject(report.linkedEvidence)) {
    const linkedPickerPath = report.linkedEvidence.desktopPickerSmokeReport
    const hasReadyLinkedPickerChecks = [...checksById.values()].some((check) => (
      LINKED_PICKER_CHECK_IDS.has(check.id) && check.status === 'pass'
    ))
    if (hasReadyLinkedPickerChecks && !hasEvidence(linkedPickerPath)) {
      errors.push('linkedEvidence.desktopPickerSmokeReport is required when packaged runtime smoke links ready picker evidence')
    } else if (!allowPending && !hasEvidence(linkedPickerPath)) {
      errors.push('linkedEvidence.desktopPickerSmokeReport is required for packaged runtime smoke readiness')
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

  console.log(`Packaged runtime smoke report: ${absolutePath}`)
  console.log(`Checks: ${result.summary.passed}/${result.summary.total} passed`)
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`)

  if (!result.ok) {
    for (const error of result.errors) console.error(`Error: ${error}`)
    process.exit(1)
  }

  if (options.allowPending) {
    console.log('Report structure is valid.')
  } else if (options.requireSigned) {
    console.log('Packaged runtime smoke report passed signed official-readiness checks.')
  } else {
    console.log('Packaged runtime smoke report passed smoke checks. Official release readiness still requires signed artifact validation.')
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
  BUILT_IN_PACKS,
  REQUIRED_CHECKS,
  validateReport
}
