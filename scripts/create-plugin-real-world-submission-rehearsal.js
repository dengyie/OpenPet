const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const { validatePluginPackage } = require('./validate-plugin-package')
const { createPluginSubmissionBundle } = require('./create-plugin-submission-bundle')
const { loadBundle, validateBundle } = require('./validate-plugin-submission-bundle')
const {
  createPluginMaintainerApproval,
  VALID_DECISIONS
} = require('./create-plugin-maintainer-approval')
const {
  loadApprovalBundle,
  validateMaintainerApproval
} = require('./validate-plugin-maintainer-approval')
const {
  assertSafeRehearsalOutputDir,
  zipPluginDirectory
} = require('./create-plugin-author-rehearsal')

const DEFAULT_OUTPUT_ROOT = path.join('docs', 'release-evidence', 'plugin-real-world-submission-rehearsal')

const usage = () => [
  'Usage: node scripts/create-plugin-real-world-submission-rehearsal.js --source <plugin-dir> [options]',
  '',
  'Options:',
  '  --source <dir>                 Existing plugin directory to rehearse',
  '  --output-dir <dir>             Directory for rehearsal artifacts',
  '  --reviewer <name>              Maintainer or reviewer name',
  '  --decision <approved|changes-requested>',
  '  --notes <text>                 Review notes recorded by the maintainer',
  '  --json                         Print the machine-readable rehearsal summary',
  '  --help',
  '',
  'Packages an existing plugin, creates a submission bundle, records maintainer approval,',
  'and writes local real-world submission rehearsal evidence without installing or running plugin code.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    sourcePath: '',
    outputDir: '',
    reviewer: 'OpenPet Maintainer',
    decision: 'approved',
    notes: 'Manifest, permissions, package hash, and submission artifacts reviewed.',
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--source') {
      options.sourcePath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--reviewer') {
      options.reviewer = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--decision') {
      options.decision = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--notes') {
      options.notes = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (options.decision && !VALID_DECISIONS.has(options.decision)) {
    throw new Error(`Unknown approval decision: ${options.decision}`)
  }

  return options
}

const sessionIdFromDate = (date) => date.toISOString().replace(/[:.]/g, '-').replace(/-000Z$/, 'Z')

const writeJson = (filePath, value, fsImpl = fs) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const writeText = (filePath, content, fsImpl = fs) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`)
}

const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`

const commandList = ({ sourcePath, zipPath, bundleDir, reviewer, decision, notes }) => [
  `npm run validate:plugin -- ${shellQuote(sourcePath)}`,
  `cd ${shellQuote(sourcePath)} && zip -qr ${shellQuote(zipPath)} .`,
  `npm run validate:plugin -- ${shellQuote(zipPath)}`,
  `npm run create-plugin-submission-bundle -- ${shellQuote(zipPath)} --output-dir ${shellQuote(bundleDir)}`,
  `npm run validate-plugin-submission-bundle -- ${shellQuote(bundleDir)} --require-ready`,
  `npm run create-plugin-maintainer-approval -- ${shellQuote(bundleDir)} --reviewer ${shellQuote(reviewer)} --decision ${decision} --notes ${shellQuote(notes)}`,
  `npm run validate-plugin-maintainer-approval -- ${shellQuote(bundleDir)} --require-approved`
]

const renderReadme = ({ generatedAt, summary, commands }) => [
  '# OpenPet Plugin Real-World Submission Rehearsal',
  '',
  `Generated: ${generatedAt}`,
  '',
  'This rehearsal uses an existing plugin directory as a local stand-in for a real third-party submission.',
  'It validates, packages, creates a submission bundle, and records maintainer approval without installing, enabling, or running plugin code.',
  '',
  '## Source Plugin',
  '',
  `- Name: ${summary.sourcePlugin.name}`,
  `- Id: ${summary.sourcePlugin.id}`,
  `- Version: ${summary.sourcePlugin.version}`,
  `- Source: ${summary.sourcePath}`,
  `- Package: ${summary.packagePath}`,
  `- Submission bundle: ${summary.submission.bundleDir}`,
  `- Approval decision: ${summary.approval.record.decision}`,
  '',
  '## Commands',
  '',
  '```bash',
  ...commands,
  '```',
  '',
  '## Boundary',
  '',
  '- This is local workflow evidence, not proof of external community provenance.',
  '- Maintainer approval is a human review artifact.',
  '- The archive does not prove signing trust, catalog publication, runtime safety, or release readiness.',
  ''
].join('\n')

const renderChecklist = ({ summary }) => [
  '# Real-World Plugin Submission Checklist',
  '',
  `- [${summary.sourceValidation.ok ? 'x' : ' '}] Existing source plugin validated.`,
  `- [${summary.packageValidation.ok ? 'x' : ' '}] Plugin packaged as .openpet-plugin.zip and validated.`,
  `- [${summary.submission.bundleValidation.ok ? 'x' : ' '}] Submission bundle created and validated.`,
  `- [${summary.approval.validation.ok ? 'x' : ' '}] Maintainer approval record created and validated.`,
  '- [ ] Maintainer verifies signature/trust policy before catalog distribution.',
  '- [ ] Runtime smoke evidence is collected separately before release claims.',
  '',
  'Review reminder: this archive is local workflow evidence and does not establish signing trust or catalog publication.',
  ''
].join('\n')

const createPluginRealWorldSubmissionRehearsal = ({
  sourcePath,
  outputDir = '',
  reviewer = 'OpenPet Maintainer',
  decision = 'approved',
  notes = 'Manifest, permissions, package hash, and submission artifacts reviewed.',
  now = () => new Date(),
  fsImpl = fs,
  execFile = execFileSync
} = {}) => {
  if (!sourcePath) throw new Error('Source plugin directory is required')
  if (!VALID_DECISIONS.has(decision)) throw new Error(`Unknown approval decision: ${decision || '(missing)'}`)

  const generatedAt = now().toISOString()
  const absoluteSourcePath = path.resolve(sourcePath)
  const resolvedOutputDir = outputDir || path.join(DEFAULT_OUTPUT_ROOT, sessionIdFromDate(new Date(generatedAt)))
  const absoluteOutputDir = assertSafeRehearsalOutputDir(resolvedOutputDir)
  const packagesDir = path.join(absoluteOutputDir, 'packages')
  const bundleDir = path.join(absoluteOutputDir, 'submission-bundle')

  fsImpl.rmSync(absoluteOutputDir, { recursive: true, force: true })
  fsImpl.mkdirSync(packagesDir, { recursive: true })

  const sourceValidation = validatePluginPackage(absoluteSourcePath)
  if (!sourceValidation.ok) {
    throw new Error(`Source plugin validation failed: ${sourceValidation.errors.join('; ')}`)
  }

  const sourcePlugin = {
    id: sourceValidation.review.plugin.id,
    name: sourceValidation.review.plugin.name,
    version: sourceValidation.review.plugin.version,
    permissions: sourceValidation.review.plugin.permissions,
    networkAllowlist: sourceValidation.review.plugin.network.allowlist
  }
  const packagePath = zipPluginDirectory({
    pluginDir: absoluteSourcePath,
    outputDir: packagesDir,
    pluginId: sourcePlugin.id,
    execFile,
    fsImpl
  })
  const packageValidation = validatePluginPackage(packagePath)
  if (!packageValidation.ok) {
    throw new Error(`Packaged plugin validation failed: ${packageValidation.errors.join('; ')}`)
  }

  const bundle = createPluginSubmissionBundle({
    sourcePath: packagePath,
    outputDir: bundleDir,
    now: () => new Date(generatedAt),
    fsImpl
  })
  const bundleValidation = validateBundle(loadBundle({ bundleDir, fsImpl }), { requireReady: true })
  if (!bundleValidation.ok) {
    throw new Error(`Submission bundle validation failed: ${bundleValidation.errors.join('; ')}`)
  }

  const approvalRecord = createPluginMaintainerApproval({
    bundleDir,
    reviewer,
    decision,
    notes,
    now: () => new Date(generatedAt),
    fsImpl
  })
  const approvalValidation = validateMaintainerApproval(loadApprovalBundle({ bundleDir, fsImpl }), { requireApproved: true })
  if (!approvalValidation.ok) {
    throw new Error(`Maintainer approval validation failed: ${approvalValidation.errors.join('; ')}`)
  }

  const commands = commandList({
    sourcePath: absoluteSourcePath,
    zipPath: packagePath,
    bundleDir,
    reviewer,
    decision,
    notes
  })
  const summary = {
    generatedAt,
    outputDir: absoluteOutputDir,
    sourcePath: absoluteSourcePath,
    sourcePlugin,
    sourceValidation: {
      ok: sourceValidation.ok,
      warnings: sourceValidation.warnings,
      errors: sourceValidation.errors,
      riskLevel: sourceValidation.review.riskLevel
    },
    packagePath,
    packageValidation: {
      ok: packageValidation.ok,
      warnings: packageValidation.warnings,
      errors: packageValidation.errors,
      riskLevel: packageValidation.review.riskLevel,
      sha256: packageValidation.review.packageHash
    },
    submission: {
      bundleDir,
      bundle,
      bundleValidation
    },
    approval: {
      record: approvalRecord,
      validation: approvalValidation
    },
    files: {
      readme: path.join(absoluteOutputDir, 'README.md'),
      checklist: path.join(absoluteOutputDir, 'submission-checklist.md'),
      commands: path.join(absoluteOutputDir, 'commands.json'),
      summary: path.join(absoluteOutputDir, 'plugin-real-world-submission-rehearsal-summary.json')
    }
  }

  writeText(summary.files.readme, renderReadme({ generatedAt, summary, commands }), fsImpl)
  writeText(summary.files.checklist, renderChecklist({ summary }), fsImpl)
  writeJson(summary.files.commands, { commands }, fsImpl)
  writeJson(summary.files.summary, summary, fsImpl)

  return summary
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const summary = createPluginRealWorldSubmissionRehearsal(options)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  } else {
    console.log(`Plugin real-world submission rehearsal created: ${summary.outputDir}`)
    console.log(`README: ${summary.files.readme}`)
    console.log(`Checklist: ${summary.files.checklist}`)
    console.log(`Submission bundle: ${summary.submission.bundleDir}`)
  }
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message || error)
    process.exit(1)
  }
}

module.exports = {
  createPluginRealWorldSubmissionRehearsal,
  parseArgs,
  renderChecklist,
  renderReadme,
  sessionIdFromDate
}
