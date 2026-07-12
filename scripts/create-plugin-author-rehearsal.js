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

const toPosixPath = (value) => String(value || '').split(path.sep).join('/')
const isSafeMetadataPath = (value) => {
  const normalized = toPosixPath(String(value || '').trim())
  if (!normalized) return false
  if (normalized.startsWith('/')) return false
  if (/^[A-Za-z]:\//.test(normalized)) return false
  return !normalized.split('/').some((segment) => segment === '..')
}

const createSafeProjectPath = (targetPath, fallback) => {
  const relative = toPosixPath(path.relative(process.cwd(), String(targetPath || '').trim()))
  return isSafeMetadataPath(relative) ? relative : fallback
}

const createSafeOutputFilePath = ({ filePath, outputDir, fallback }) => {
  const relative = toPosixPath(path.relative(outputDir, String(filePath || '').trim()))
  if (isSafeMetadataPath(relative)) return relative
  return createSafeProjectPath(filePath, fallback)
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
  `npm run validate-plugin-submission-bundle -- ${shellQuote(bundleDir)} --require-ready`,
  `npm run create-plugin-maintainer-approval -- ${shellQuote(bundleDir)} --reviewer 'OpenPet Maintainer' --decision approved --notes 'Manifest, permissions, package hash, and submission artifacts reviewed.'`,
  `npm run validate-plugin-maintainer-approval -- ${shellQuote(bundleDir)} --require-approved`
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
  '- Maintainer approval remains a separate human review step recorded after the submission bundle is prepared.',
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
  '- [ ] Maintainer approval record is archived separately.',
  '- [ ] Maintainer verifies signature/trust policy before catalog distribution.',
  '',
  'Review reminder: unsigned plugins may be acceptable for local manual review, but they are not trusted catalog artifacts.',
  ''
].join('\n')

const createPluginAuthorRehearsal = async ({
  outputDir = DEFAULT_OUTPUT_DIR,
  submissionTemplate = 'ai',
  now = () => new Date(),
  fsImpl = fs,
  execFile = execFileSync
} = {}) => {
  if (!TEMPLATES.includes(submissionTemplate)) throw new Error(`Unknown submission template: ${submissionTemplate}`)
  const generatedAt = now().toISOString()
  const absoluteOutputDir = assertSafeRehearsalOutputDir(outputDir)
  const safeOutputDir = createSafeProjectPath(absoluteOutputDir, path.basename(DEFAULT_OUTPUT_DIR))
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
      absolutePluginDir: result.pluginDir,
      pluginDir: createSafeOutputFilePath({
        filePath: result.pluginDir,
        outputDir: absoluteOutputDir,
        fallback: path.basename(result.pluginDir)
      }),
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
    pluginDir: selected.absolutePluginDir,
    outputDir: packagesDir,
    pluginId: selected.plugin.id,
    execFile,
    fsImpl
  })
  const packageValidation = await validatePluginPackage(packagePath)
  const bundle = await createPluginSubmissionBundle({
    sourcePath: packagePath,
    outputDir: bundleDir,
    now: () => new Date(generatedAt),
    fsImpl
  })
  const bundleValidation = validateBundle(loadBundle({ bundleDir, fsImpl }), { requireReady: true })
  const commands = commandList({
    outputDir: safeOutputDir,
    selectedPluginDir: selected.pluginDir,
    zipPath: createSafeOutputFilePath({
      filePath: packagePath,
      outputDir: absoluteOutputDir,
      fallback: path.basename(packagePath)
    }),
    bundleDir: createSafeOutputFilePath({
      filePath: bundleDir,
      outputDir: absoluteOutputDir,
      fallback: 'submission-bundle'
    })
  })
  const outputFiles = {
    readme: path.join(absoluteOutputDir, 'README.md'),
    checklist: path.join(absoluteOutputDir, 'submission-checklist.md'),
    commands: path.join(absoluteOutputDir, 'commands.json'),
    summary: path.join(absoluteOutputDir, 'plugin-author-rehearsal-summary.json')
  }
  const summary = {
    generatedAt,
    outputDir: safeOutputDir,
    templates: templates.map(({ absolutePluginDir, ...item }) => item),
    submission: {
      template: selected.template,
      plugin: selected.plugin,
      packagePath: createSafeOutputFilePath({
        filePath: packagePath,
        outputDir: absoluteOutputDir,
        fallback: path.basename(packagePath)
      }),
      packageValidation: {
        ok: packageValidation.ok,
        warnings: packageValidation.warnings,
        errors: packageValidation.errors,
        riskLevel: packageValidation.review.riskLevel,
        sha256: packageValidation.review.packageHash
      },
      bundleDir: createSafeOutputFilePath({
        filePath: bundleDir,
        outputDir: absoluteOutputDir,
        fallback: 'submission-bundle'
      }),
      bundle,
      bundleValidation
    },
    files: {
      readme: createSafeOutputFilePath({ filePath: outputFiles.readme, outputDir: absoluteOutputDir, fallback: 'README.md' }),
      checklist: createSafeOutputFilePath({ filePath: outputFiles.checklist, outputDir: absoluteOutputDir, fallback: 'submission-checklist.md' }),
      commands: createSafeOutputFilePath({ filePath: outputFiles.commands, outputDir: absoluteOutputDir, fallback: 'commands.json' }),
      summary: createSafeOutputFilePath({
        filePath: outputFiles.summary,
        outputDir: absoluteOutputDir,
        fallback: 'plugin-author-rehearsal-summary.json'
      })
    }
  }

  writeText(outputFiles.readme, renderAuthorReadme({ generatedAt, templates: summary.templates, submission: summary.submission, commands }), fsImpl)
  writeText(outputFiles.checklist, renderChecklist({ templates: summary.templates, submission: summary.submission }), fsImpl)
  writeJson(outputFiles.commands, { commands }, fsImpl)
  writeJson(outputFiles.summary, summary, fsImpl)
  return summary
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }
  const summary = await createPluginAuthorRehearsal(options)
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
  main().catch((error) => {
    console.error(error.message || error)
    process.exit(1)
  })
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
