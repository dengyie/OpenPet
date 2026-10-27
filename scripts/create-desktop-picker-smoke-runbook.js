const fs = require('fs')
const path = require('path')

const { REQUIRED_CHECKS, validateReport } = require('./validate-desktop-picker-smoke-report')

const CHECK_GUIDANCE = {
  'packaged-launch': 'Launch the packaged app artifact, confirm the pet window appears, and record the artifact path plus a screenshot or short recording.',
  'control-center-open': 'Open Control Center from the packaged app and record that the Plugins, Actions, and About tabs render.',
  'plugin-picker-cancel': 'From Plugins, open Install Plugin, cancel the native picker, and confirm no plugin selection or install state remains.',
  'plugin-picker-zip-review': 'From Plugins, choose a real .openpet-plugin.zip fixture and record the review panel showing package metadata, permissions, signature status, and install mode.',
  'plugin-install-disabled': 'Install the reviewed plugin and record that it is installed disabled by default and requires explicit enablement.',
  'invalid-package-feedback': 'From Plugins or Actions, choose an invalid package fixture and record that the packaged app shows a visible, actionable error without changing installed state.',
  'action-frame-picker-cancel': 'From Actions, open the frame-folder import picker, cancel it, and confirm the action list and pending import state remain unchanged.',
  'pet-pack-picker-cancel': 'From Actions / Pet Packs, open the pet pack folder picker, cancel it, and confirm the pack list and active pack remain unchanged.',
  'state-after-picker-smoke': 'Restart or refresh the packaged app after picker checks and record that settings, plugin enablement, active pet pack, and local HTTP default-off state are consistent.'
}

const DEFAULT_OUTPUT_NAME = 'desktop-picker-smoke-runbook.md'

const usage = () => [
  'Usage: node scripts/create-desktop-picker-smoke-runbook.js <report.json> [--output <runbook.md>]',
  '',
  'Creates a Markdown runbook for packaged desktop native OS file picker smoke validation.',
  'The runbook is an operator guide only; it does not claim smoke success.'
].join('\n')

const parseArgs = (argv) => {
  const options = {
    reportPath: null,
    outputPath: null,
    help: false
  }

  const readValue = (index, flag) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--output') {
      options.outputPath = readValue(index, arg)
      index += 1
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

const defaultOutputPath = (reportPath) => {
  const absoluteReportPath = path.resolve(reportPath)
  return path.join(path.dirname(absoluteReportPath), DEFAULT_OUTPUT_NAME)
}

const loadReport = (reportPath, fsImpl = fs) => {
  if (!reportPath) throw new Error('Report path is required')
  const absolutePath = path.resolve(reportPath)
  return {
    absolutePath,
    report: JSON.parse(fsImpl.readFileSync(absolutePath, 'utf-8'))
  }
}

const valueOrPlaceholder = (value, placeholder = '<fill during packaged-app picker validation>') => {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : placeholder
  if (value === true) return 'yes'
  if (value === false) return 'no'
  return String(value || '').trim() || placeholder
}

const createRunbook = ({ report, reportPath, generatedAt = new Date() }) => {
  const validation = validateReport(report, { allowPending: true })
  if (!validation.ok) {
    throw new Error(`Cannot create desktop picker smoke runbook from an invalid report: ${validation.errors.join('; ')}`)
  }

  const reportCommandPath = reportPath ? path.relative(process.cwd(), path.resolve(reportPath)) || path.basename(reportPath) : '<report.json>'
  const lines = []

  lines.push('# OpenPet Desktop Native Picker Smoke Runbook')
  lines.push('')
  lines.push(`Generated: ${generatedAt.toISOString()}`)
  lines.push(`Platform: ${valueOrPlaceholder(report.platform)}`)
  lines.push(`Architecture: ${valueOrPlaceholder(report.arch)}`)
  lines.push(`Version: ${valueOrPlaceholder(report.artifact?.version)}`)
  lines.push(`Artifact: ${valueOrPlaceholder(report.artifact?.appPath || report.artifact?.installer || report.artifact?.zip)}`)
  lines.push(`Signed: ${valueOrPlaceholder(report.artifact?.signed)}`)
  lines.push('')
  lines.push('Use this runbook only during a real packaged macOS or Windows validation run. This file does not prove native picker success by itself; readiness requires the JSON report to pass validation after every required check has real evidence.')
  lines.push('')
  lines.push('## Fixture Inputs')
  lines.push('')
  lines.push(`- Plugin package: ${valueOrPlaceholder(report.fixture?.pluginPackage)}`)
  lines.push(`- Frame folder: ${valueOrPlaceholder(report.fixture?.frameFolder)}`)
  lines.push(`- Pet pack: ${valueOrPlaceholder(report.fixture?.petPack)}`)
  lines.push('')
  lines.push('## Required Checks')
  lines.push('')

  for (const check of REQUIRED_CHECKS) {
    const command = `npm run update-desktop-picker-smoke-report -- ${reportCommandPath} --check ${check.id} --status pass --evidence "<real evidence>"`
    lines.push(`### \`${check.id}\` - ${check.label}`)
    lines.push('')
    lines.push(CHECK_GUIDANCE[check.id] || 'Record concrete evidence from the packaged-app picker validation run.')
    lines.push('')
    lines.push('```bash')
    lines.push(command)
    lines.push('```')
    lines.push('')
  }

  lines.push('## Validation Commands')
  lines.push('')
  lines.push('Run these commands only after every check has real evidence. The first command is the packaged-app smoke gate. The second command additionally verifies artifact signature integrity; Gatekeeper and SmartScreen trust are separate observations.')
  lines.push('')
  lines.push('```bash')
  lines.push(`npm run validate-desktop-picker-smoke-report -- ${reportCommandPath}`)
  lines.push(`npm run validate-desktop-picker-smoke-report -- ${reportCommandPath} --require-signature-integrity`)
  lines.push('```')
  lines.push('')
  lines.push('Do not mark desktop picker validation complete while any check is pending, blocked, failed, or missing evidence. Signature integrity does not establish OS trust.')

  return lines.join('\n')
}

const writeRunbook = ({ content, outputPath, fsImpl = fs }) => {
  const absoluteOutputPath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  fsImpl.writeFileSync(absoluteOutputPath, content.endsWith('\n') ? content : `${content}\n`)
  return absoluteOutputPath
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const { absolutePath, report } = loadReport(options.reportPath)
  const outputPath = options.outputPath || defaultOutputPath(absolutePath)
  const runbook = createRunbook({ report, reportPath: absolutePath })
  const writtenPath = writeRunbook({ content: runbook, outputPath })

  console.log(`Desktop picker smoke runbook created: ${writtenPath}`)
  console.log('This runbook is an operator guide; it does not prove native picker smoke validation passed.')
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
  CHECK_GUIDANCE,
  createRunbook,
  defaultOutputPath,
  parseArgs,
  writeRunbook
}
