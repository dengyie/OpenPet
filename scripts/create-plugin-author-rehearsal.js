const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createOpenPetPlugin } = require('./create-openpet-plugin')
const { validatePluginPackage } = require('./validate-plugin-package')
const { createPluginSubmissionBundle } = require('./create-plugin-submission-bundle')
const { loadBundle, validateBundle } = require('./validate-plugin-submission-bundle')

const TEMPLATES = ['minimal', 'network', 'storage', 'ai']
const DEFAULT_OUTPUT_DIR = path.join('docs', 'release-evidence', 'plugin-author-rehearsal')

const usage = () => [
  'Usage: node scripts/create-plugin-author-rehearsal.js [options]',
  '',
  'Options:',
  '  --output-dir <dir>       Directory for rehearsal artifacts',
  '  --submission-template <minimal|network|storage|ai>  Template used for the full submission rehearsal. Defaults to ai.',
  '  --json                   Print the machine-readable rehearsal summary',
  '  --help',
  '',
  'Generates scaffolded plugin templates, validates them, packages one plugin,',
  'creates a submission bundle, and writes author-facing rehearsal docs.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    submissionTemplate: 'ai',
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--submission-template') {
      options.submissionTemplate = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!TEMPLATES.includes(options.submissionTemplate)) {
    throw new Error(`Unknown submission template: ${options.submissionTemplate}`)
  }
  return options
}

const writeJson = (filePath, value, fsImpl = fs) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const writeText = (filePath, content, fsImpl = fs) => {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`)
}

const isInside = (parent, child) => {
  const relative = path.relative(parent, child)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

const assertSafeRehearsalOutputDir = (outputDir, { cwd = process.cwd(), tmpDir = os.tmpdir(), homeDir = os.homedir() } = {}) => {
  const absoluteOutputDir = path.resolve(outputDir)
  const rootDir = path.parse(absoluteOutputDir).root
  const blockedDirs = new Set([
    rootDir,
    path.resolve(cwd),
    path.resolve(cwd, '..'),
    homeDir ? path.resolve(homeDir) : ''
  ].filter(Boolean))

  if (blockedDirs.has(absoluteOutputDir)) {
    throw new Error(`Refusing to clear unsafe rehearsal output directory: ${absoluteOutputDir}`)
  }

  if (isInside(path.resolve(cwd), absoluteOutputDir)) {
    const relativeParts = path.relative(path.resolve(cwd), absoluteOutputDir).split(path.sep).filter(Boolean)
    if (relativeParts.length < 2) {
      throw new Error(`Refusing to clear top-level project directory: ${absoluteOutputDir}`)
    }
    return absoluteOutputDir
  }

  if (isInside(path.resolve(tmpDir), absoluteOutputDir)) return absoluteOutputDir

  throw new Error(`Refusing to clear rehearsal output directory outside the project or temp directory: ${absoluteOutputDir}`)
}

const zipPluginDirectory = ({ pluginDir, outputDir, pluginId, execFile = execFileSync, fsImpl = fs }) => {
  fsImpl.mkdirSync(outputDir, { recursive: true })
  const zipPath = path.join(outputDir, `${pluginId}.openpet-plugin.zip`)
  fsImpl.rmSync(zipPath, { force: true })
  execFile('zip', ['-qr', zipPath, '.'], { cwd: pluginDir })
  return zipPath
}

const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`

const commandList = ({ outputDir, selectedPluginDir, zipPath, bundleDir }) => [
  `npm run create-openpet-plugin -- "Author Minimal" --template minimal --output-dir ${shellQuote(path.join(outputDir, 'scaffolded'))}`,
  `npm run create-openpet-plugin -- "Author Network" --template network --output-dir ${shellQuote(path.join(outputDir, 'scaffolded'))}`,
  `npm run create-openpet-plugin -- "Author Storage" --template storage --output-dir ${shellQuote(path.join(outputDir, 'scaffolded'))}`,
  `npm run create-openpet-plugin -- "Author Ai" --template ai --output-dir ${shellQuote(path.join(outputDir, 'scaffolded'))}`,
  `npm run validate:plugin -- ${shellQuote(selectedPluginDir)}`,
  `cd ${shellQuote(selectedPluginDir)} && zip -qr ${shellQuote(zipPath)} .`,
  `npm run validate:plugin -- ${shellQuote(zipPath)}`,
  `npm run create-plugin-submission-bundle -- ${shellQuote(zipPath)} --output-dir ${shellQuote(bundleDir)}`,
  `npm run validate-plugin-submission-bundle -- ${shellQuote(bundleDir)} --require-ready`
]

const renderAuthorReadme = ({ generatedAt, templates, submission, commands }) => [
  '# OpenPet Plugin Author Rehearsal',
  '',
  `Generated: ${generatedAt}`,
  '',
  'This rehearsal follows the third-party author path without installing, enabling, or running untrusted plugin code.',
  '',
  '## Scaffolded Templates',
  '',
  '| Template | Plugin ID | Permissions | Validation |',
  '|----------|-----------|-------------|------------|',
  ...templates.map((item) => `| ${item.template} | ${item.plugin.id} | ${item.plugin.permissions.join(', ') || 'none'} | ${item.validation.ok ? 'pass' : 'fail'} |`),
  '',
  '## Submission Rehearsal',
  '',
  `- Selected template: ${submission.template}`,
  `- Package: ${submission.packagePath}`,
  `- Bundle: ${submission.bundleDir}`,
  `- Bundle decision: ${submission.bundleValidation.summary.decision}`,
  '',
  '## Commands',
  '',
  '```bash',
  ...commands,
  '```',
  '',
  '## Security Notes',
  '',
  '- Plugin config is public settings, not a secret store.',
  '- Do not put API keys, tokens, passwords, cookies, private keys, or credentials in config schema, plugin storage, network headers, or bundled files.',
  '- The bundle is for human review. It does not establish signing trust, catalog approval, runtime smoke success, or unrestricted sandbox safety.',
  ''
].join('\n')

const renderChecklist = ({ templates, submission }) => [
  '# Plugin Submission Checklist',
  '',
  '- [x] Scaffolded minimal template.',
  '- [x] Scaffolded network template with HTTPS allowlist guidance.',
  '- [x] Scaffolded storage template with non-secret storage guidance.',
  '- [x] Scaffolded AI-assisted template using app-owned AI configuration.',
  `- [${templates.every((item) => item.validation.ok) ? 'x' : ' '}] Validated every scaffolded template.`,
  `- [${submission.packageValidation.ok ? 'x' : ' '}] Packaged selected plugin as .openpet-plugin.zip and validated the package.`,
  `- [${submission.bundleValidation.ok ? 'x' : ' '}] Created and validated submission bundle.`,
  '- [ ] Human reviewer approves the report and PR packet.',
  '- [ ] Maintainer verifies signature/trust policy before catalog distribution.',
  '',
  'Review reminder: unsigned plugins may be acceptable for local manual review, but they are not trusted catalog artifacts.',
  ''
].join('\n')

const createPluginAuthorRehearsal = ({
  outputDir = DEFAULT_OUTPUT_DIR,
  submissionTemplate = 'ai',
  now = () => new Date(),
  fsImpl = fs,
  execFile = execFileSync
} = {}) => {
  if (!TEMPLATES.includes(submissionTemplate)) throw new Error(`Unknown submission template: ${submissionTemplate}`)
  const generatedAt = now().toISOString()
  const absoluteOutputDir = assertSafeRehearsalOutputDir(outputDir)
  const scaffoldDir = path.join(absoluteOutputDir, 'scaffolded')
  const packagesDir = path.join(absoluteOutputDir, 'packages')
  const bundleDir = path.join(absoluteOutputDir, 'submission-bundle')
  fsImpl.rmSync(absoluteOutputDir, { recursive: true, force: true })
  fsImpl.mkdirSync(scaffoldDir, { recursive: true })

  const templates = TEMPLATES.map((template) => {
    const result = createOpenPetPlugin({
      name: `Author ${template}`,
      template,
      outputDir: scaffoldDir,
      now: () => new Date(generatedAt),
      fsImpl
    })
    const validation = validatePluginPackage(result.pluginDir)
    return {
      template,
      pluginDir: result.pluginDir,
      plugin: result.plugin,
      validation: {
        ok: validation.ok,
        warnings: validation.warnings,
        errors: validation.errors,
        riskLevel: validation.review.riskLevel
      }
    }
  })

  const selected = templates.find((item) => item.template === submissionTemplate)
  const packagePath = zipPluginDirectory({
    pluginDir: selected.pluginDir,
    outputDir: packagesDir,
    pluginId: selected.plugin.id,
    execFile,
    fsImpl
  })
  const packageValidation = validatePluginPackage(packagePath)
  const bundle = createPluginSubmissionBundle({
    sourcePath: packagePath,
    outputDir: bundleDir,
    now: () => new Date(generatedAt),
    fsImpl
  })
  const bundleValidation = validateBundle(loadBundle({ bundleDir, fsImpl }), { requireReady: true })
  const commands = commandList({
    outputDir: absoluteOutputDir,
    selectedPluginDir: selected.pluginDir,
    zipPath: packagePath,
    bundleDir
  })
  const summary = {
    generatedAt,
    outputDir: absoluteOutputDir,
    templates,
    submission: {
      template: selected.template,
      plugin: selected.plugin,
      packagePath,
      packageValidation: {
        ok: packageValidation.ok,
        warnings: packageValidation.warnings,
        errors: packageValidation.errors,
        riskLevel: packageValidation.review.riskLevel,
        sha256: packageValidation.review.packageHash
      },
      bundleDir,
      bundle,
      bundleValidation
    },
    files: {
      readme: path.join(absoluteOutputDir, 'README.md'),
      checklist: path.join(absoluteOutputDir, 'submission-checklist.md'),
      commands: path.join(absoluteOutputDir, 'commands.json'),
      summary: path.join(absoluteOutputDir, 'plugin-author-rehearsal-summary.json')
    }
  }

  writeText(summary.files.readme, renderAuthorReadme({ generatedAt, templates, submission: summary.submission, commands }), fsImpl)
  writeText(summary.files.checklist, renderChecklist({ templates, submission: summary.submission }), fsImpl)
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
  const summary = createPluginAuthorRehearsal(options)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  } else {
    console.log(`Plugin author rehearsal created: ${summary.outputDir}`)
    console.log(`README: ${summary.files.readme}`)
    console.log(`Checklist: ${summary.files.checklist}`)
    console.log(`Submission bundle: ${summary.submission.bundleDir}`)
  }
  if (!summary.submission.bundleValidation.ok) process.exit(1)
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
  TEMPLATES,
  assertSafeRehearsalOutputDir,
  createPluginAuthorRehearsal,
  parseArgs,
  renderAuthorReadme,
  renderChecklist,
  zipPluginDirectory
}
