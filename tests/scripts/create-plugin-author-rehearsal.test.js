const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  assertSafeRehearsalOutputDir,
  createPluginAuthorRehearsal,
  parseArgs
} = require('../../scripts/create-plugin-author-rehearsal')
const { validatePluginPackage } = require('../../scripts/validate-plugin-package')
const { loadBundle, validateBundle } = require('../../scripts/validate-plugin-submission-bundle')

test('parseArgs accepts plugin author rehearsal options', () => {
  const options = parseArgs([
    '--output-dir', 'docs/rehearsal',
    '--submission-template', 'storage',
    '--json'
  ])

  assert.equal(options.outputDir, 'docs/rehearsal')
  assert.equal(options.submissionTemplate, 'storage')
  assert.equal(options.json, true)
})

test('parseArgs rejects bad plugin author rehearsal options', () => {
  assert.throws(() => parseArgs(['--output-dir']), /--output-dir requires a value/)
  assert.throws(() => parseArgs(['--submission-template', 'secret']), /Unknown submission template/)
  assert.throws(() => parseArgs(['--unknown']), /Unexpected argument/)
})

test('createPluginAuthorRehearsal scaffolds all templates and validates an AI submission bundle', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-author-rehearsal-'))
  const summary = createPluginAuthorRehearsal({
    outputDir,
    submissionTemplate: 'ai',
    now: () => new Date('2026-06-16T05:00:00.000Z')
  })

  assert.equal(summary.templates.length, 4)
  assert.deepEqual(summary.templates.map((item) => item.template), ['minimal', 'network', 'storage', 'ai'])
  assert.equal(summary.templates.every((item) => item.validation.ok), true)
  assert.equal(summary.submission.template, 'ai')
  assert.equal(summary.submission.packageValidation.ok, true)
  assert.equal(summary.submission.bundleValidation.ok, true)
  assert.equal(summary.submission.bundleValidation.summary.readyForHumanReview, true)

  const aiTemplate = summary.templates.find((item) => item.template === 'ai')
  assert.deepEqual(aiTemplate.plugin.permissions, ['pet:say', 'ai:chat'])
  assert.equal(aiTemplate.plugin.commands[0].id, 'ask')
  assert.equal(validatePluginPackage(summary.submission.packagePath).ok, true)

  const bundleValidation = validateBundle(loadBundle({ bundleDir: summary.submission.bundleDir }), { requireReady: true })
  assert.equal(bundleValidation.ok, true)
  assert.equal(fs.existsSync(summary.files.readme), true)
  assert.equal(fs.existsSync(summary.files.checklist), true)
  assert.equal(fs.existsSync(summary.files.commands), true)
  assert.equal(fs.existsSync(summary.files.summary), true)

  const readme = fs.readFileSync(summary.files.readme, 'utf-8')
  assert.match(readme, /OpenPet Plugin Author Rehearsal/)
  assert.match(readme, /Template \| Plugin ID \| Permissions/)
  assert.match(readme, /ai/)
  assert.match(readme, /Plugin config is public settings/)
  assert.match(readme, /create-plugin-maintainer-approval/)

  const checklist = fs.readFileSync(summary.files.checklist, 'utf-8')
  assert.match(checklist, /Scaffolded AI-assisted template/)
  assert.match(checklist, /Created and validated submission bundle/)
  assert.match(checklist, /Maintainer approval record is archived separately/)

  const commands = JSON.parse(fs.readFileSync(summary.files.commands, 'utf-8')).commands
  assert.equal(commands.some((command) => command.includes('--template ai')), true)
  assert.equal(commands.some((command) => command.includes('validate-plugin-submission-bundle')), true)
  assert.equal(commands.some((command) => command.includes('create-plugin-maintainer-approval')), true)
  assert.equal(commands.some((command) => command.includes(`'${summary.outputDir}`)), true)
})

test('assertSafeRehearsalOutputDir rejects broad destructive output paths', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-safe-output-project-'))
  const projectParent = path.dirname(projectRoot)
  const tmpDir = os.tmpdir()
  const homeDir = os.homedir()

  assert.throws(
    () => assertSafeRehearsalOutputDir('/', { cwd: projectRoot, tmpDir, homeDir }),
    /unsafe rehearsal output directory/
  )
  assert.throws(
    () => assertSafeRehearsalOutputDir(projectRoot, { cwd: projectRoot, tmpDir, homeDir }),
    /unsafe rehearsal output directory/
  )
  assert.throws(
    () => assertSafeRehearsalOutputDir(projectParent, { cwd: projectRoot, tmpDir, homeDir }),
    /unsafe rehearsal output directory/
  )
  assert.throws(
    () => assertSafeRehearsalOutputDir(path.join(projectRoot, 'docs'), { cwd: projectRoot, tmpDir, homeDir }),
    /top-level project directory/
  )
  assert.throws(
    () => assertSafeRehearsalOutputDir(path.join(homeDir, 'openpet-author-rehearsal'), { cwd: projectRoot, tmpDir, homeDir }),
    /outside the project or temp directory/
  )

  assert.equal(
    assertSafeRehearsalOutputDir(path.join(projectRoot, 'docs', 'release-evidence'), { cwd: projectRoot, tmpDir, homeDir }),
    path.join(projectRoot, 'docs', 'release-evidence')
  )
  assert.equal(
    assertSafeRehearsalOutputDir(path.join(tmpDir, 'openpet-author-rehearsal-safe'), { cwd: projectRoot, tmpDir, homeDir }),
    path.join(tmpDir, 'openpet-author-rehearsal-safe')
  )
})
