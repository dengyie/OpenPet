const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginSubmissionBundle,
  defaultOutputDir,
  parseArgs,
  writeText
} = require('../../scripts/create-plugin-submission-bundle')

const EXAMPLE_PLUGIN_PATH = path.join(__dirname, '../../examples/plugins/focus-timer')

test('parseArgs accepts source, output directory, signing, json, update, and blocklist flags', () => {
  const options = parseArgs([
    'plugin.zip',
    '--output-dir',
    'submission-bundle',
    '--json',
    '--require-signature',
    '--installed-dir',
    'installed/plugin',
    '--block-id',
    'com.example.blocked',
    '--block-sha256',
    'ABCDEF'
  ])

  assert.equal(options.sourcePath, 'plugin.zip')
  assert.equal(options.outputDir, 'submission-bundle')
  assert.equal(options.json, true)
  assert.equal(options.requireSignature, true)
  assert.equal(options.installedDir, 'installed/plugin')
  assert.deepEqual(options.blockedIds, ['com.example.blocked'])
  assert.deepEqual(options.blockedHashes, ['abcdef'])
})

test('parseArgs rejects missing values and unexpected arguments', () => {
  assert.throws(() => parseArgs(['plugin.zip', '--output-dir']), /--output-dir requires a value/)
  assert.throws(() => parseArgs(['plugin.zip', '--installed-dir']), /--installed-dir requires a value/)
  assert.throws(() => parseArgs(['plugin.zip', 'extra.zip']), /Unexpected argument/)
})

test('defaultOutputDir writes inside plugin directories by default', () => {
  assert.equal(defaultOutputDir(EXAMPLE_PLUGIN_PATH), path.join(path.resolve(EXAMPLE_PLUGIN_PATH), 'plugin-submission-bundle'))
})

test('createPluginSubmissionBundle writes report, PR packet, and summary', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-submission-bundle-'))
  const summary = createPluginSubmissionBundle({
    sourcePath: EXAMPLE_PLUGIN_PATH,
    outputDir,
    now: () => new Date('2026-06-16T00:00:00.000Z')
  })

  assert.equal(summary.generatedAt, '2026-06-16T00:00:00.000Z')
  assert.equal(summary.readyForHumanReview, true)
  assert.equal(summary.plugin.id, 'openpet.example.focus-timer')
  assert.match(fs.readFileSync(summary.files.report, 'utf-8'), /Plugin Submission Report/)
  assert.match(fs.readFileSync(summary.files.pr, 'utf-8'), /Plugin submission: Focus Timer/)
  assert.equal(JSON.parse(fs.readFileSync(summary.files.summary, 'utf-8')).plugin.id, 'openpet.example.focus-timer')
})

test('createPluginSubmissionBundle blocks strict signature failures while preserving artifacts', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-submission-bundle-blocked-'))
  const summary = createPluginSubmissionBundle({
    sourcePath: EXAMPLE_PLUGIN_PATH,
    outputDir,
    requireSignature: true
  })

  assert.equal(summary.readyForHumanReview, false)
  assert.equal(summary.decision, 'blocked-before-review')
  assert.match(summary.validation.errors.join('\n'), /Signature hash metadata must be verified/)
  assert.equal(fs.existsSync(summary.files.summary), true)
})

test('writeText creates parent directories and trailing newline', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-submission-write-'))
  const outputPath = path.join(outputDir, 'nested', 'file.txt')

  writeText({ outputPath, content: 'hello' })

  assert.equal(fs.readFileSync(outputPath, 'utf-8'), 'hello\n')
})
