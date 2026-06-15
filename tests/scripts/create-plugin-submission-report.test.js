const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginSubmissionReport,
  parseArgs,
  renderMarkdownSubmissionReport,
  writeReport
} = require('../../scripts/create-plugin-submission-report')

const EXAMPLE_PLUGIN_PATH = path.join(__dirname, '../../examples/plugins/focus-timer')

test('parseArgs accepts source, output, signing, json, update, and blocklist flags', () => {
  const options = parseArgs([
    'plugin.zip',
    '--output',
    'submission.md',
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
  assert.equal(options.outputPath, 'submission.md')
  assert.equal(options.json, true)
  assert.equal(options.requireSignature, true)
  assert.equal(options.installedDir, 'installed/plugin')
  assert.deepEqual(options.blockedIds, ['com.example.blocked'])
  assert.deepEqual(options.blockedHashes, ['abcdef'])
})

test('parseArgs rejects missing values and unexpected arguments', () => {
  assert.throws(() => parseArgs(['plugin.zip', '--output']), /--output requires a value/)
  assert.throws(() => parseArgs(['plugin.zip', '--installed-dir']), /--installed-dir requires a value/)
  assert.throws(() => parseArgs(['plugin.zip', 'extra.zip']), /Unexpected argument/)
})

test('createPluginSubmissionReport summarizes a valid unsigned package for human review', () => {
  const report = createPluginSubmissionReport({
    sourcePath: EXAMPLE_PLUGIN_PATH,
    now: () => new Date('2026-06-16T00:00:00.000Z')
  })

  assert.equal(report.generatedAt, '2026-06-16T00:00:00.000Z')
  assert.equal(report.readyForHumanReview, true)
  assert.equal(report.decision, 'ready-for-human-review')
  assert.equal(report.plugin.id, 'openpet.example.focus-timer')
  assert.deepEqual(report.plugin.permissions, ['pet:say', 'storage'])
  assert.equal(report.signature.status, 'unsigned')
  assert.equal(report.package.riskLevel, 'review')
  assert.match(report.validation.warnings.join('\n'), /unsigned/)
  assert.equal(report.checklist.find((item) => item.id === 'package-validation').status, 'pass')
  assert.equal(report.checklist.find((item) => item.id === 'signature-metadata').status, 'warn')
})

test('createPluginSubmissionReport blocks packages that fail strict signature readiness', () => {
  const report = createPluginSubmissionReport({
    sourcePath: EXAMPLE_PLUGIN_PATH,
    requireSignature: true
  })

  assert.equal(report.readyForHumanReview, false)
  assert.equal(report.decision, 'blocked-before-review')
  assert.match(report.validation.errors.join('\n'), /Signature hash metadata must be verified/)
  assert.equal(report.checklist.find((item) => item.id === 'package-validation').status, 'fail')
})

test('renderMarkdownSubmissionReport keeps reviewer actions and validation boundaries visible', () => {
  const report = createPluginSubmissionReport({ sourcePath: EXAMPLE_PLUGIN_PATH })
  const markdown = renderMarkdownSubmissionReport(report)

  assert.match(markdown, /^# OpenPet Plugin Submission Report/)
  assert.match(markdown, /Ready for human review: yes/)
  assert.match(markdown, /does not approve catalog publication/)
  assert.match(markdown, /openpet\.example\.focus-timer/)
  assert.match(markdown, /Human reviewer decision remains required before distribution/)
})

test('writeReport writes Markdown or JSON submission packets', () => {
  const report = createPluginSubmissionReport({ sourcePath: EXAMPLE_PLUGIN_PATH })
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-submission-report-'))
  const markdownPath = path.join(outputDir, 'submission.md')
  const jsonPath = path.join(outputDir, 'submission.json')

  writeReport({ report, outputPath: markdownPath })
  writeReport({ report, outputPath: jsonPath, json: true })

  assert.match(fs.readFileSync(markdownPath, 'utf-8'), /Plugin Submission Report/)
  assert.equal(JSON.parse(fs.readFileSync(jsonPath, 'utf-8')).plugin.id, 'openpet.example.focus-timer')
})
