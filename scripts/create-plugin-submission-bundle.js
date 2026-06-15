const fs = require('fs')
const path = require('path')

const {
  createPluginSubmissionReport,
  renderMarkdownSubmissionReport
} = require('./create-plugin-submission-report')
const {
  createPluginSubmissionPr,
  renderMarkdownPr
} = require('./create-plugin-submission-pr')

const DEFAULT_BUNDLE_DIR_NAME = 'plugin-submission-bundle'

const usage = () => [
  'Usage: node scripts/create-plugin-submission-bundle.js <plugin-dir-or-zip> [options]',
  '',
  'Options:',
  '  --output-dir <dir>              Write the submission bundle to this directory',
  '  --json                          Print the bundle summary as JSON',
  '  --require-signature             Require verified signature hash metadata',
  '  --installed-dir <dir>           Compare against an installed plugin directory',
  '  --block-id <pluginId>           Treat this plugin id as blocked; repeatable',
  '  --block-sha256 <sha256>         Treat this package hash as blocked; repeatable',
  '',
  'Creates a local plugin submission workflow bundle with report, PR body, and summary.',
  'The command does not install, enable, or run plugin code.'
].join('\n')

const parseArgs = (argv) => {
  const options = {
    sourcePath: '',
    outputDir: '',
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
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(index, arg)
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

const defaultOutputDir = (sourcePath) => {
  const absoluteSourcePath = path.resolve(sourcePath)
  const directory = fs.existsSync(absoluteSourcePath) && fs.statSync(absoluteSourcePath).isDirectory()
    ? absoluteSourcePath
    : path.dirname(absoluteSourcePath)
  return path.join(directory, DEFAULT_BUNDLE_DIR_NAME)
}

const writeText = ({ outputPath, content, fsImpl = fs }) => {
  const absoluteOutputPath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  fsImpl.writeFileSync(absoluteOutputPath, content.endsWith('\n') ? content : `${content}\n`)
  return absoluteOutputPath
}

const createPluginSubmissionBundle = ({
  sourcePath,
  outputDir = '',
  requireSignature = false,
  installedDir = '',
  blockedIds = [],
  blockedHashes = [],
  now = () => new Date(),
  fsImpl = fs
} = {}) => {
  if (!sourcePath) throw new Error('Plugin source path is required')

  const generatedAt = now().toISOString()
  const fixedNow = () => new Date(generatedAt)
  const commonOptions = {
    sourcePath,
    requireSignature,
    installedDir,
    blockedIds,
    blockedHashes,
    now: fixedNow
  }
  const report = createPluginSubmissionReport(commonOptions)
  const pr = createPluginSubmissionPr(commonOptions)
  const absoluteOutputDir = path.resolve(outputDir || defaultOutputDir(sourcePath))
  const files = {
    report: path.join(absoluteOutputDir, 'plugin-submission-report.md'),
    pr: path.join(absoluteOutputDir, 'plugin-submission-pr.md'),
    summary: path.join(absoluteOutputDir, 'plugin-submission-summary.json')
  }
  const summary = {
    generatedAt,
    sourcePath: report.sourcePath,
    outputDir: absoluteOutputDir,
    readyForHumanReview: report.readyForHumanReview && pr.readyForHumanReview,
    decision: report.readyForHumanReview && pr.readyForHumanReview ? 'ready-for-human-review' : 'blocked-before-review',
    plugin: report.plugin,
    package: report.package,
    signature: {
      status: report.signature.status,
      label: report.signature.label,
      signer: report.signature.signer || ''
    },
    validation: report.validation,
    files,
    nextSteps: [
      'Attach or paste plugin-submission-report.md in the plugin PR.',
      'Use plugin-submission-pr.md as the PR body with the plugin submission template.',
      'Record manual reviewer approval before merge.',
      'Do not treat this bundle as signing trust, catalog approval, or runtime smoke evidence.'
    ]
  }

  writeText({ outputPath: files.report, content: renderMarkdownSubmissionReport(report), fsImpl })
  writeText({ outputPath: files.pr, content: renderMarkdownPr(pr), fsImpl })
  writeText({ outputPath: files.summary, content: JSON.stringify(summary, null, 2), fsImpl })

  return summary
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const summary = createPluginSubmissionBundle(options)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  } else {
    console.log(`Plugin submission bundle created: ${summary.outputDir}`)
    console.log(`Report: ${summary.files.report}`)
    console.log(`PR packet: ${summary.files.pr}`)
    console.log(`Summary: ${summary.files.summary}`)
  }

  if (!summary.readyForHumanReview) process.exit(1)
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
  createPluginSubmissionBundle,
  defaultOutputDir,
  parseArgs,
  writeText
}
