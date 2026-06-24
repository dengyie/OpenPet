const fs = require('fs')
const path = require('path')

const { REQUIRED_CHECKS, validateReport } = require('./validate-packaged-runtime-smoke-report')

const CHECK_GUIDANCE = {
  'packaged-launch': 'Record the packaged app path, launch command or user action, app version, and that the process stays running.',
  'pet-window-created': 'Record Electron window evidence such as a screenshot, screen recording, or runtime log showing the pet window exists.',
  'transparent-background': 'Attach a screenshot showing desktop content visible around the pet sprite without an opaque window rectangle.',
  'sprite-visible': 'Attach a screenshot or pixel observation showing the pet sprite is visible and not fully transparent.',
  'speech-bubble-rendered': 'Trigger a say event and record that the floating BubbleChatWindow appears while the old inline pet bubble stays hidden.',
  'default-action-playback': 'Trigger the default action and record animation playback from the packaged renderer.',
  'pack-switch-legacy-cat': 'Activate legacy-cat and record that it renders with a visible sprite and working default action.',
  'pack-switch-doro': 'Activate doro and record that it renders with a visible sprite and working default action.',
  'pack-switch-duodong': 'Activate duodong and record that it renders with a visible sprite and working default action.',
  'pack-switch-chispa': 'Activate chispa and record that it renders with a visible sprite and working default action.',
  'plugin-picker-evidence-linked': 'Link the paired desktop picker smoke report or direct evidence for plugin zip picker cancel and review paths.',
  'pet-picker-evidence-linked': 'Link the paired desktop picker smoke report or direct evidence for pet pack picker cancel and import paths.',
  'invalid-package-feedback': 'Record a visible error when selecting an invalid plugin or pet package.',
  'state-after-runtime-smoke': 'Restart or refresh the packaged app and record that active pack, plugin enablement, settings, and Local HTTP default-off state remain consistent.'
}

const DEFAULT_OUTPUT_NAME = 'packaged-runtime-smoke-runbook.md'

const usage = () => [
  'Usage: node scripts/create-packaged-runtime-smoke-runbook.js <report.json> [--output <runbook.md>]',
  '',
  'Creates a Markdown runbook for filling packaged OpenPet runtime smoke evidence.',
  'The runbook is an operator guide only; it does not claim runtime smoke success.'
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
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--output') {
      options.outputPath = readValue(index, arg)
      index += 1
    } else if (!options.reportPath) {
      options.reportPath = arg
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

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

const defaultOutputPath = (reportPath) => path.join(path.dirname(path.resolve(reportPath)), DEFAULT_OUTPUT_NAME)

const commandPath = (reportPath) => {
  const relative = path.relative(process.cwd(), path.resolve(reportPath))
  return relative && !relative.startsWith('..') ? relative : path.resolve(reportPath)
}

const valueOrPlaceholder = (value, placeholder = '<fill during packaged runtime validation>') => {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : placeholder
  if (value === true || value === false) return String(value)
  const text = String(value || '').trim()
  return text || placeholder
}

const createRunbook = ({ report, reportPath, generatedAt = new Date() }) => {
  const validation = validateReport(report, { allowPending: true })
  if (!validation.ok) {
    throw new Error(`Cannot create packaged runtime smoke runbook from an invalid report: ${validation.errors.join('; ')}`)
  }

  const reportCommandPath = commandPath(reportPath)
  const lines = []
  lines.push('# OpenPet Packaged Runtime Smoke Runbook')
  lines.push('')
  lines.push(`Generated: ${generatedAt.toISOString()}`)
  lines.push(`Report: \`${reportCommandPath}\``)
  lines.push('')
  lines.push('## Scope')
  lines.push('')
  lines.push('Use this runbook only during a real packaged macOS or Windows validation run. This file does not prove runtime success by itself; readiness requires the JSON report to pass validation after every required check has real evidence.')
  lines.push('')
  lines.push('## Artifact Under Test')
  lines.push('')
  lines.push(`- Version: ${valueOrPlaceholder(report.artifact?.version)}`)
  lines.push(`- App path: ${valueOrPlaceholder(report.artifact?.appPath)}`)
  lines.push(`- Installer: ${valueOrPlaceholder(report.artifact?.installer)}`)
  lines.push(`- ZIP: ${valueOrPlaceholder(report.artifact?.zip)}`)
  lines.push(`- Signed: ${valueOrPlaceholder(report.artifact?.signed)}`)
  lines.push(`- Signature status: ${valueOrPlaceholder(report.artifact?.signatureStatus || report.artifact?.authenticodeStatus)}`)
  lines.push('')
  lines.push('## Linked Evidence')
  lines.push('')
  lines.push(`- Desktop picker smoke report: ${valueOrPlaceholder(report.linkedEvidence?.desktopPickerSmokeReport)}`)
  lines.push(`- Desktop picker smoke runbook: ${valueOrPlaceholder(report.linkedEvidence?.desktopPickerSmokeRunbook)}`)
  lines.push(`- Screenshots: ${valueOrPlaceholder(report.linkedEvidence?.screenshots)}`)
  lines.push(`- Recordings: ${valueOrPlaceholder(report.linkedEvidence?.recordings)}`)
  lines.push('')
  lines.push('## Required Checks')
  lines.push('')
  lines.push('| Check ID | What To Prove | Evidence Guidance | Fill Command |')
  lines.push('|----------|---------------|-------------------|--------------|')
  for (const check of REQUIRED_CHECKS) {
    const guidance = CHECK_GUIDANCE[check.id] || 'Record concrete evidence from the packaged runtime validation run.'
    const command = `npm run update-packaged-runtime-smoke-report -- ${reportCommandPath} --check ${check.id} --status pass --evidence "<real evidence>"`
    lines.push(`| \`${check.id}\` | ${check.label} | ${guidance} | \`${command}\` |`)
  }
  lines.push('')
  lines.push('## Validate Readiness')
  lines.push('')
  lines.push('Run these commands only after every check has real evidence. The first command is the packaged runtime smoke gate. The second command is required before an official signed desktop release claim.')
  lines.push('')
  lines.push('```bash')
  lines.push(`npm run validate-packaged-runtime-smoke-report -- ${reportCommandPath}`)
  lines.push(`npm run update-packaged-runtime-smoke-report -- ${reportCommandPath} --validate-ready`)
  lines.push(`npm run validate-packaged-runtime-smoke-report -- ${reportCommandPath} --require-signed`)
  lines.push(`npm run update-packaged-runtime-smoke-report -- ${reportCommandPath} --validate-ready --require-signed`)
  lines.push('```')
  lines.push('')
  lines.push('Do not mark packaged runtime smoke ready while any check is pending, blocked, failed, or missing evidence.')
  lines.push('')

  return lines.join('\n')
}

const writeRunbook = ({ content, outputPath, fsImpl = fs }) => {
  const absoluteOutputPath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  fsImpl.writeFileSync(absoluteOutputPath, `${content.trimEnd()}\n`)
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
  const content = createRunbook({ report, reportPath: absolutePath })
  const writtenPath = writeRunbook({ content, outputPath })

  console.log(`Packaged runtime smoke runbook created: ${writtenPath}`)
  console.log(`Checks documented: ${REQUIRED_CHECKS.length}`)
  console.log('This runbook is an operator guide; it does not prove packaged runtime smoke validation passed.')
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
