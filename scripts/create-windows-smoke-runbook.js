const fs = require('fs')
const path = require('path')

const { REQUIRED_CHECKS, validateReport } = require('./validate-windows-smoke-report')

const CHECK_GUIDANCE = {
  install: 'Record the installer filename, install mode, target path, and whether Start Menu/Desktop shortcuts were created.',
  launch: 'Record the launch method, app version shown in About, and a short observation that the app stayed running.',
  'transparent-window': 'Attach a screenshot or screen recording showing the pet window alpha background on the Windows desktop.',
  'drag-bounds': 'Record drag behavior, monitor bounds, always-on-top behavior, focus behavior, and taskbar visibility.',
  'control-center-tabs': 'Record that Pet, Actions, AI, Plugins, Catalog, Service, and About tabs open without renderer errors.',
  'pet-actions': 'Record built-in action playback and one imported frame-folder action regenerated from Windows paths.',
  'pet-pack-import': 'Record inspect/import/activate/delete of a pet pack under the Windows userData directory.',
  'plugin-runner': 'Record an official plugin command and a local plugin command running with restricted permissions.',
  'local-http-default-off': 'Record a fresh profile showing Local HTTP and MCP disabled before the user enables them.',
  'local-http-token-gated': 'Record loopback binding, rejected unauthenticated mutation, accepted token-authenticated mutation, and MCP token/session behavior.',
  'api-key-isolation': 'Record that AI config can save a key while renderer/plugin-visible config never exposes plaintext secret values.',
  'about-update-assets': 'Record About update results showing Windows installers and hiding macOS assets/feed metadata.',
  uninstall: 'Record uninstall result, relaunch absence, and preserved user data when uninstall is not asked to delete app data.'
}

const DEFAULT_OUTPUT_NAME = 'windows-smoke-runbook.md'

const usage = () => [
  'Usage: node scripts/create-windows-smoke-runbook.js <report.json> [--output <runbook.md>]',
  '',
  'Creates a Markdown runbook for filling a Windows smoke report during real Windows validation.',
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

const valueOrPlaceholder = (value, placeholder = '<fill during Windows validation>') => {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : placeholder
  if (value === true || value === false) return String(value)
  const text = String(value || '').trim()
  return text || placeholder
}

const createRunbook = ({ report, reportPath, generatedAt = new Date() }) => {
  const validation = validateReport(report, { allowPending: true })
  if (!validation.ok) {
    throw new Error(`Cannot create Windows smoke runbook from an invalid report: ${validation.errors.join('; ')}`)
  }

  const reportCommandPath = commandPath(reportPath)
  const reportFileName = path.basename(reportPath || 'windows-smoke-report.json')
  const lines = []
  lines.push('# OpenPet Windows Smoke Validation Runbook')
  lines.push('')
  lines.push(`Generated: ${generatedAt.toISOString()}`)
  lines.push(`Report: \`${reportCommandPath}\``)
  lines.push('')
  lines.push('## Scope')
  lines.push('')
  lines.push('Use this runbook only during a real Windows clean-machine or CI-backed manual validation run. This file does not prove Windows support by itself; readiness requires the JSON report to pass validation after every required check has real evidence.')
  lines.push('')
  lines.push('## Artifact Under Test')
  lines.push('')
  lines.push(`- Version: ${valueOrPlaceholder(report.artifact?.version)}`)
  lines.push(`- Installer: ${valueOrPlaceholder(report.artifact?.installer)}`)
  lines.push(`- ZIP: ${valueOrPlaceholder(report.artifact?.zip)}`)
  lines.push(`- latest.yml: ${valueOrPlaceholder(report.artifact?.latestYml)}`)
  lines.push(`- Blockmaps: ${valueOrPlaceholder(report.artifact?.blockmaps)}`)
  lines.push(`- Signed: ${valueOrPlaceholder(report.artifact?.signed)}`)
  lines.push(`- Authenticode status: ${valueOrPlaceholder(report.artifact?.authenticodeStatus)}`)
  lines.push('')
  lines.push('## Prepare The Report')
  lines.push('')
  lines.push('```bash')
  lines.push(`npm run update-windows-smoke-report -- ${reportCommandPath} --list-checks`)
  lines.push(`npm run update-windows-smoke-report -- ${reportCommandPath} --set-env windowsVersion="Windows 11 23H2" --set-env machine="clean Windows VM"`)
  lines.push('```')
  lines.push('')
  lines.push('## Optional Evidence Collector')
  lines.push('')
  lines.push('If this runbook was downloaded from the CI smoke evidence artifact, run the generated collector on the Windows validation machine before filling pass/fail results. The collector only writes evidence files; it does not mark any smoke check as passed.')
  lines.push('')
  lines.push('```powershell')
  lines.push(`powershell -ExecutionPolicy Bypass -File .\\windows-smoke-collector.ps1 -ReportPath .\\${reportFileName}`)
  lines.push('```')
  lines.push('')
  lines.push('## Required Checks')
  lines.push('')
  lines.push('| Check ID | What To Prove | Evidence Guidance | Fill Command |')
  lines.push('|----------|---------------|-------------------|--------------|')
  for (const check of REQUIRED_CHECKS) {
    const guidance = CHECK_GUIDANCE[check.id] || 'Record concrete evidence from the Windows validation run.'
    const command = `npm run update-windows-smoke-report -- ${reportCommandPath} --check ${check.id} --status pass --evidence "<real evidence>"`
    lines.push(`| \`${check.id}\` | ${check.label} | ${guidance} | \`${command}\` |`)
  }
  lines.push('')
  lines.push('## Validate Readiness')
  lines.push('')
  lines.push('Run these commands only after every check has real evidence. The first command is the RC/prerelease smoke gate. The second command is required before an official stable Windows release claim.')
  lines.push('')
  lines.push('```bash')
  lines.push(`npm run validate-windows-smoke-report -- ${reportCommandPath}`)
  lines.push(`npm run update-windows-smoke-report -- ${reportCommandPath} --validate-ready`)
  lines.push(`npm run validate-windows-smoke-report -- ${reportCommandPath} --require-signed`)
  lines.push(`npm run update-windows-smoke-report -- ${reportCommandPath} --validate-ready --require-signed`)
  lines.push('```')
  lines.push('')
  lines.push('Do not mark Windows release-ready while any check is pending, blocked, failed, or missing evidence. Do not use the signed readiness commands for unsigned prerelease artifacts.')
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

  console.log(`Windows smoke runbook created: ${writtenPath}`)
  console.log(`Checks documented: ${REQUIRED_CHECKS.length}`)
  console.log('This runbook is an operator guide; it does not prove Windows smoke validation passed.')
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
