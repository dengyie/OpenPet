const fs = require('fs')
const path = require('path')

const { loadBundle, validateBundle } = require('./validate-plugin-submission-bundle')

const VALID_DECISIONS = new Set(['approved', 'changes-requested'])

const DEFAULT_FILES = {
  markdown: 'plugin-maintainer-approval.md',
  json: 'plugin-maintainer-approval.json'
}

const usage = () => [
  'Usage: node scripts/create-plugin-maintainer-approval.js <bundle-dir> [options]',
  '',
  'Options:',
  '  --reviewer <name>              Maintainer or reviewer name',
  '  --decision <approved|changes-requested>',
  '  --notes <text>                Review notes recorded by the maintainer',
  '  --json                        Print the approval record as JSON',
  '',
  'Creates a maintainer approval rehearsal record from an existing plugin submission bundle.',
  'The command does not install, enable, or run plugin code.'
].join('\n')

const parseArgs = (argv) => {
  const options = {
    bundleDir: '',
    reviewer: '',
    decision: '',
    notes: '',
    json: false,
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
    } else if (arg === '--reviewer') {
      options.reviewer = readValue(index, arg)
      index += 1
    } else if (arg === '--decision') {
      options.decision = readValue(index, arg)
      index += 1
    } else if (arg === '--notes') {
      options.notes = readValue(index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else if (!options.bundleDir) {
      options.bundleDir = arg
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (options.decision && !VALID_DECISIONS.has(options.decision)) {
    throw new Error(`Unknown approval decision: ${options.decision}`)
  }

  return options
}

const writeText = ({ outputPath, content, fsImpl = fs }) => {
  const absoluteOutputPath = path.resolve(outputPath)
  fsImpl.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
  fsImpl.writeFileSync(absoluteOutputPath, content.endsWith('\n') ? content : `${content}\n`)
  return absoluteOutputPath
}

const renderMarkdownApproval = (approval) => [
  '# OpenPet Plugin Maintainer Approval',
  '',
  `Generated at: ${approval.generatedAt}`,
  `Source bundle: ${approval.sourceBundleDir}`,
  `Reviewer: ${approval.reviewer}`,
  `Decision: ${approval.decision}`,
  `Approval ready: ${approval.approvalReady ? 'yes' : 'no'}`,
  '',
  '## Plugin',
  '',
  `- Name: ${approval.plugin.name}`,
  `- Id: ${approval.plugin.id}`,
  `- Version: ${approval.plugin.version}`,
  '',
  '## Package',
  '',
  `- Package hash: ${approval.package.sha256}`,
  `- Submission decision: ${approval.submissionDecision}`,
  '',
  '## Notes',
  '',
  approval.notes,
  '',
  '## Review Boundary',
  '',
  '- This approval record documents a human review decision.',
  '- It does not prove signing trust, catalog publication, runtime safety, or release readiness.',
  ''
].join('\n')

const createPluginMaintainerApproval = ({
  bundleDir,
  reviewer,
  decision,
  notes,
  now = () => new Date(),
  fsImpl = fs
} = {}) => {
  if (!bundleDir) throw new Error('Submission bundle directory is required')
  if (!reviewer || !reviewer.trim()) throw new Error('Reviewer is required')
  if (!decision || !VALID_DECISIONS.has(decision)) throw new Error(`Unknown approval decision: ${decision || '(missing)'}`)
  if (!notes || !notes.trim()) throw new Error('Approval notes are required')

  const bundle = loadBundle({ bundleDir, fsImpl })
  const validation = validateBundle(bundle, { requireReady: false })
  if (!validation.ok) {
    throw new Error(`Submission bundle is invalid: ${validation.errors.join('; ')}`)
  }

  const summary = bundle.summary
  const absoluteBundleDir = path.resolve(bundleDir)
  const approval = {
    generatedAt: now().toISOString(),
    reviewer: reviewer.trim(),
    decision,
    notes: notes.trim(),
    sourceBundleDir: absoluteBundleDir,
    plugin: {
      id: summary.plugin.id,
      name: summary.plugin.name,
      version: summary.plugin.version
    },
    package: {
      sha256: summary.package.sha256
    },
    submissionDecision: summary.decision,
    approvalReady: validation.summary.readyForHumanReview && decision === 'approved',
    files: {
      markdown: path.join(absoluteBundleDir, DEFAULT_FILES.markdown),
      json: path.join(absoluteBundleDir, DEFAULT_FILES.json)
    }
  }

  writeText({
    outputPath: approval.files.markdown,
    content: renderMarkdownApproval(approval),
    fsImpl
  })
  writeText({
    outputPath: approval.files.json,
    content: JSON.stringify(approval, null, 2),
    fsImpl
  })

  return approval
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const approval = createPluginMaintainerApproval(options)
  if (options.json) process.stdout.write(`${JSON.stringify(approval, null, 2)}\n`)
  else {
    console.log(`Plugin maintainer approval created: ${approval.sourceBundleDir}`)
    console.log(`Markdown: ${approval.files.markdown}`)
    console.log(`JSON: ${approval.files.json}`)
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
  createPluginMaintainerApproval,
  parseArgs,
  renderMarkdownApproval,
  VALID_DECISIONS,
  writeText
}
