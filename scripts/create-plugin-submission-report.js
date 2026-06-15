const fs = require('fs')
const path = require('path')

const { validatePluginPackage } = require('./validate-plugin-package')

const DEFAULT_OUTPUT_NAME = 'plugin-submission-report.md'

const usage = () => [
  'Usage: node scripts/create-plugin-submission-report.js <plugin-dir-or-zip> [options]',
  '',
  'Options:',
  '  --output <path>                 Write report to a Markdown or JSON file',
  '  --json                          Print or write machine-readable JSON',
  '  --require-signature             Fail readiness unless signature hash metadata is verified',
  '  --installed-dir <dir>           Compare against an installed plugin directory for update diffs',
  '  --block-id <pluginId>           Treat this plugin id as blocked; repeatable',
  '  --block-sha256 <sha256>         Treat this package hash as blocked; repeatable',
  '',
  'Creates a submission review packet from the same package validation used by the app.',
  'The command does not install, enable, or run plugin code.'
].join('\n')

const parseArgs = (argv) => {
  const options = {
    sourcePath: '',
    outputPath: '',
    json: false,
    requireSignature: false,
    installedDir: '',
    blockedIds: [],
    blockedHashes: [],
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
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--require-signature') {
      options.requireSignature = true
    } else if (arg === '--installed-dir') {
      options.installedDir = readValue(index, arg)
      index += 1
    } else if (arg === '--block-id') {
      options.blockedIds.push(readValue(index, arg))
      index += 1
    } else if (arg === '--block-sha256') {
      options.blockedHashes.push(readValue(index, arg).toLowerCase())
      index += 1
    } else if (!options.sourcePath) {
      options.sourcePath = arg
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

const defaultOutputPath = (sourcePath) => {
  const absoluteSourcePath = path.resolve(sourcePath)
  const directory = fs.existsSync(absoluteSourcePath) && fs.statSync(absoluteSourcePath).isDirectory()
    ? absoluteSourcePath
    : path.dirname(absoluteSourcePath)
  return path.join(directory, DEFAULT_OUTPUT_NAME)
}

const createChecklist = (validation) => {
  const review = validation.review
  const signatureStatus = review.signature?.status || 'unknown'
  const signatureErrors = review.signature?.errors || []
  const permissionDiff = review.permissionDiff || {}
  const addedPermissions = permissionDiff.permissions?.added || []
  const addedHosts = permissionDiff.networkAllowlist?.added || []

  return [
    {
      id: 'package-validation',
      label: 'Package validation reused app install review rules',
      status: validation.ok ? 'pass' : 'fail',
      evidence: validation.ok ? 'Validation returned no blocking errors.' : validation.errors.join('; ')
    },
    {
      id: 'signature-metadata',
      label: 'Signature hash metadata reviewed',
      status: signatureErrors.length > 0 ? 'fail' : signatureStatus === 'hash-verified' ? 'pass' : 'warn',
      evidence: signatureStatus === 'hash-verified'
        ? `Verified signer: ${review.signature.signer || '(not recorded)'}`
        : `${review.signature?.label || signatureStatus}${signatureErrors.length ? `: ${signatureErrors.join('; ')}` : ''}`
    },
    {
      id: 'permission-review',
      label: 'Permissions and network hosts are explicit',
      status: review.requiresReview || addedPermissions.length > 0 || addedHosts.length > 0 ? 'warn' : 'pass',
      evidence: `Permissions: ${review.plugin.permissions.join(', ') || 'none'}; network allowlist: ${review.plugin.network.allowlist.join(', ') || 'none'}`
    },
    {
      id: 'blocklist-review',
      label: 'Local blocklist did not reject the package',
      status: review.blockStatus?.blocked ? 'fail' : 'pass',
      evidence: review.blockStatus?.blocked ? review.blockStatus.reasons.join('; ') : 'No local blocklist hit.'
    },
    {
      id: 'manual-review-required',
      label: 'Human reviewer decision remains required before distribution',
      status: 'warn',
      evidence: 'This packet is a preflight artifact; it does not approve catalog publication or establish signing trust.'
    }
  ]
}

const createPluginSubmissionReport = ({
  sourcePath,
  requireSignature = false,
  installedDir = '',
  blockedIds = [],
  blockedHashes = [],
  now = () => new Date()
} = {}) => {
  if (!sourcePath) throw new Error('Plugin source path is required')

  const validation = validatePluginPackage(sourcePath, {
    requireSignature,
    installedDir,
    blockedIds,
    blockedHashes
  })
  const review = validation.review
  const checklist = createChecklist(validation)

  return {
    generatedAt: now().toISOString(),
    sourcePath: path.resolve(sourcePath),
    requireSignature,
    readyForHumanReview: validation.ok,
    decision: validation.ok ? 'ready-for-human-review' : 'blocked-before-review',
    validation: {
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings
    },
    plugin: {
      id: review.plugin.id,
      name: review.plugin.name,
      version: review.plugin.version,
      description: review.plugin.description || '',
      permissions: review.plugin.permissions,
      networkAllowlist: review.plugin.network.allowlist,
      commands: review.plugin.commands.map((command) => ({
        id: command.id,
        title: command.title || command.id
      }))
    },
    package: {
      sourceType: review.sourceType,
      installMode: review.installMode,
      sha256: review.packageHash,
      fileCount: review.fileCount,
      byteSize: review.byteSize,
      riskLevel: review.riskLevel,
      requiresReview: review.requiresReview
    },
    signature: review.signature,
    permissionDiff: review.permissionDiff,
    blockStatus: review.blockStatus,
    checklist,
    reviewerActions: [
      'Confirm the plugin purpose matches the manifest description and command titles.',
      'Review every requested permission and network host against the submitted source.',
      'For distribution, require trusted signing evidence beyond local hash metadata.',
      'Install only through Control Center review flow and keep the plugin disabled until a user explicitly enables it.'
    ]
  }
}

const escapeCell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>')
const listText = (items, empty = 'none') => (items && items.length > 0 ? items.join(', ') : empty)
const boolText = (value) => (value ? 'yes' : 'no')

const renderMarkdownSubmissionReport = (report) => {
  const lines = [
    '# OpenPet Plugin Submission Report',
    '',
    `Generated at: ${report.generatedAt}`,
    `Source path: ${report.sourcePath}`,
    `Decision: ${report.decision}`,
    `Ready for human review: ${boolText(report.readyForHumanReview)}`,
    `Require verified signature metadata: ${boolText(report.requireSignature)}`,
    '',
    'This report is a submission preflight artifact. It reuses OpenPet package validation but does not approve catalog publication, prove signer identity, install the plugin, enable the plugin, or run plugin code.',
    '',
    '## Plugin',
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| id | ${escapeCell(report.plugin.id)} |`,
    `| name | ${escapeCell(report.plugin.name)} |`,
    `| version | ${escapeCell(report.plugin.version)} |`,
    `| description | ${escapeCell(report.plugin.description || '(not provided)')} |`,
    `| permissions | ${escapeCell(listText(report.plugin.permissions))} |`,
    `| network allowlist | ${escapeCell(listText(report.plugin.networkAllowlist))} |`,
    `| commands | ${escapeCell(listText(report.plugin.commands.map((command) => `${command.id} (${command.title})`)))} |`,
    '',
    '## Package Review',
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| source type | ${escapeCell(report.package.sourceType)} |`,
    `| install mode | ${escapeCell(report.package.installMode)} |`,
    `| package sha256 | ${escapeCell(report.package.sha256)} |`,
    `| files | ${report.package.fileCount} |`,
    `| bytes | ${report.package.byteSize} |`,
    `| risk level | ${escapeCell(report.package.riskLevel)} |`,
    `| requires permission review | ${boolText(report.package.requiresReview)} |`,
    '',
    '## Signature',
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| status | ${escapeCell(report.signature.status)} |`,
    `| label | ${escapeCell(report.signature.label)} |`,
    `| signer | ${escapeCell(report.signature.signer || '(not recorded)')} |`,
    `| algorithm | ${escapeCell(report.signature.algorithm || '(not recorded)')} |`,
    `| errors | ${escapeCell(listText(report.signature.errors, 'none'))} |`,
    '',
    '## Validation',
    '',
    '| Type | Messages |',
    '|------|----------|',
    `| errors | ${escapeCell(listText(report.validation.errors, 'none'))} |`,
    `| warnings | ${escapeCell(listText(report.validation.warnings, 'none'))} |`,
    '',
    '## Reviewer Checklist',
    '',
    '| Status | Check | Evidence |',
    '|--------|-------|----------|'
  ]

  for (const item of report.checklist) {
    lines.push(`| ${escapeCell(item.status)} | ${escapeCell(item.label)} | ${escapeCell(item.evidence)} |`)
  }

  lines.push('', '## Reviewer Actions', '')
  for (const action of report.reviewerActions) lines.push(`- ${action}`)

  return `${lines.join('\n')}\n`
}

const writeReport = ({ report, outputPath, json = false, fsImpl = fs }) => {
  const absoluteOutputPath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  const content = json ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdownSubmissionReport(report)
  fsImpl.writeFileSync(absoluteOutputPath, content)
  return absoluteOutputPath
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const report = createPluginSubmissionReport(options)
  if (options.outputPath) {
    const writtenPath = writeReport({ report, outputPath: options.outputPath, json: options.json })
    console.log(`Plugin submission report created: ${writtenPath}`)
  } else if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    const outputPath = defaultOutputPath(options.sourcePath)
    const writtenPath = writeReport({ report, outputPath })
    console.log(`Plugin submission report created: ${writtenPath}`)
  }

  if (!report.readyForHumanReview) process.exit(1)
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
  createChecklist,
  createPluginSubmissionReport,
  defaultOutputPath,
  parseArgs,
  renderMarkdownSubmissionReport,
  writeReport
}
