const fs = require('fs')
const path = require('path')

const { createPluginSubmissionReport } = require('./create-plugin-submission-report')

const DEFAULT_OUTPUT_NAME = 'plugin-submission-pr.md'

const usage = () => [
  'Usage: node scripts/create-plugin-submission-pr.js <plugin-dir-or-zip> [options]',
  '',
  'Options:',
  '  --output <path>                 Write the PR body to a Markdown file',
  '  --json                          Print the PR body as structured JSON',
  '  --require-signature             Require verified signature hash metadata',
  '  --installed-dir <dir>           Compare against an installed plugin directory',
  '  --block-id <pluginId>           Treat this plugin id as blocked; repeatable',
  '  --block-sha256 <sha256>         Treat this package hash as blocked; repeatable',
  '',
  'Creates a pull-request packet for a plugin submission using the Phase 24 review report.',
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

const escapeText = (value) => String(value ?? '').replace(/\n/g, ' ').trim()

const buildChecklist = (report) => {
  const lines = []

  lines.push(`- [${report.readyForHumanReview ? 'x' : ' '}] Plugin package review passed`)
  lines.push(`- [${report.signature.status === 'hash-verified' ? 'x' : ' '}] Signature hash metadata verified`)
  lines.push(`- [${report.package.requiresReview ? ' ' : 'x'}] No new permission or network-host review required`)
  lines.push(`- [${report.blockStatus?.blocked ? ' ' : 'x'}] Package is not blocked by local policy`)
  lines.push('- [ ] Human reviewer approval recorded')

  return lines.join('\n')
}

const createPluginSubmissionPr = ({
  sourcePath,
  requireSignature = false,
  installedDir = '',
  blockedIds = [],
  blockedHashes = [],
  now = () => new Date()
} = {}) => {
  if (!sourcePath) throw new Error('Plugin source path is required')

  const report = createPluginSubmissionReport({
    sourcePath,
    requireSignature,
    installedDir,
    blockedIds,
    blockedHashes,
    now
  })

  const title = `Plugin submission: ${report.plugin.name}`
  const summary = report.readyForHumanReview
    ? 'Package validation passed and the submission packet is ready for human review.'
    : 'Package validation failed and the submission packet needs fixes before human review.'

  return {
    generatedAt: report.generatedAt,
    title,
    summary,
    sourcePath: report.sourcePath,
    readyForHumanReview: report.readyForHumanReview,
    decision: report.decision,
    plugin: report.plugin,
    package: report.package,
    signature: report.signature,
    validation: report.validation,
    checklist: report.checklist,
    reviewerActions: report.reviewerActions,
    body: [
      `## Summary`,
      ``,
      summary,
      ``,
      `## Plugin`,
      ``,
      `- Name: ${escapeText(report.plugin.name)}`,
      `- Id: ${escapeText(report.plugin.id)}`,
      `- Version: ${escapeText(report.plugin.version)}`,
      `- Permissions: ${escapeText(report.plugin.permissions.join(', ') || 'none')}`,
      `- Network allowlist: ${escapeText(report.plugin.networkAllowlist.join(', ') || 'none')}`,
      `- Commands: ${escapeText(report.plugin.commands.map((command) => `${command.id} (${command.title})`).join(', ') || 'none')}`,
      ``,
      `## Validation`,
      ``,
      `- Decision: ${escapeText(report.decision)}`,
      `- Package hash: ${escapeText(report.package.sha256)}`,
      `- Risk level: ${escapeText(report.package.riskLevel)}`,
      `- Signature: ${escapeText(report.signature.label)}`,
      ``,
      `## Reviewer Checklist`,
      ``,
      buildChecklist(report),
      ``,
      `## Reviewer Notes`,
      ``,
      `- This PR body comes from the local plugin submission packet generator.`,
      `- Do not merge until manual review and approval are complete.`,
      `- Do not treat this packet as a trust chain, published artifact, or installer execution proof.`,
      ``,
      `## Source`,
      ``,
      `- Submission packet: plugin-submission-report.md`,
      `- Source path: ${escapeText(report.sourcePath)}`
    ].join('\n'),
    assignees: [],
    labels: ['plugin-submission', report.readyForHumanReview ? 'ready-for-review' : 'needs-fix']
  }
}

const renderMarkdownPr = (pr) => [
  `# ${pr.title}`,
  ``,
  pr.body,
  ``
].join('\n')

const writePr = ({ pr, outputPath, json = false, fsImpl = fs }) => {
  const absoluteOutputPath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  const content = json ? `${JSON.stringify(pr, null, 2)}\n` : renderMarkdownPr(pr)
  fsImpl.writeFileSync(absoluteOutputPath, content)
  return absoluteOutputPath
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const pr = createPluginSubmissionPr(options)
  if (options.outputPath) {
    const writtenPath = writePr({ pr, outputPath: options.outputPath, json: options.json })
    console.log(`Plugin submission PR packet created: ${writtenPath}`)
  } else if (options.json) {
    process.stdout.write(`${JSON.stringify(pr, null, 2)}\n`)
  } else {
    const outputPath = defaultOutputPath(options.sourcePath)
    const writtenPath = writePr({ pr, outputPath })
    console.log(`Plugin submission PR packet created: ${writtenPath}`)
  }

  if (!pr.readyForHumanReview) process.exit(1)
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
  buildChecklist,
  createPluginSubmissionPr,
  defaultOutputPath,
  parseArgs,
  renderMarkdownPr,
  writePr
}
