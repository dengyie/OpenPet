const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  buildChecklist,
  createPluginSubmissionPr,
  parseArgs,
  renderMarkdownPr,
  writePr
} = require('../../scripts/create-plugin-submission-pr')

const EXAMPLE_PLUGIN_PATH = path.join(__dirname, '../../examples/plugins/focus-timer')

test('parseArgs accepts source, output, signing, json, update, and blocklist flags', () => {
  const options = parseArgs([
    'plugin.zip',
    '--output',
    'pr.md',
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
  assert.equal(options.outputPath, 'pr.md')
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

test('createPluginSubmissionPr summarizes a valid unsigned package for PR review', () => {
  const pr = createPluginSubmissionPr({
    sourcePath: EXAMPLE_PLUGIN_PATH,
    now: () => new Date('2026-06-16T00:00:00.000Z')
  })

  assert.equal(pr.readyForHumanReview, true)
  assert.equal(pr.title, 'Plugin submission: Focus Timer')
  assert.match(pr.body, /## Reviewer Checklist/)
  assert.match(pr.body, /plugin-submission-report\.md/)
  assert.deepEqual(pr.labels, ['plugin-submission', 'ready-for-review'])
})

test('createPluginSubmissionPr blocks packages that fail strict signature readiness', () => {
  const pr = createPluginSubmissionPr({
    sourcePath: EXAMPLE_PLUGIN_PATH,
    requireSignature: true
  })

  assert.equal(pr.readyForHumanReview, false)
  assert.equal(pr.labels[1], 'needs-fix')
  assert.match(pr.body, /Do not merge until manual review and approval are complete/)
})

test('renderMarkdownPr keeps the PR packet readable', () => {
  const pr = createPluginSubmissionPr({ sourcePath: EXAMPLE_PLUGIN_PATH })
  const markdown = renderMarkdownPr(pr)

  assert.match(markdown, /^# Plugin submission: Focus Timer/)
  assert.match(markdown, /## Summary/)
  assert.match(markdown, /## Reviewer Notes/)
  assert.match(markdown, /Do not treat this packet as a trust chain/)
})

test('buildChecklist reflects review state', () => {
  const pr = createPluginSubmissionPr({ sourcePath: EXAMPLE_PLUGIN_PATH })
  const checklist = buildChecklist(pr)

  assert.match(checklist, /Plugin package review passed/)
  assert.match(checklist, /Human reviewer approval recorded/)
})

test('writePr writes Markdown or JSON packets', () => {
  const pr = createPluginSubmissionPr({ sourcePath: EXAMPLE_PLUGIN_PATH })
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-submission-pr-'))
  const markdownPath = path.join(outputDir, 'submission-pr.md')
  const jsonPath = path.join(outputDir, 'submission-pr.json')

  writePr({ pr, outputPath: markdownPath })
  writePr({ pr, outputPath: jsonPath, json: true })

  assert.match(fs.readFileSync(markdownPath, 'utf-8'), /Plugin submission: Focus Timer/)
  assert.equal(JSON.parse(fs.readFileSync(jsonPath, 'utf-8')).title, 'Plugin submission: Focus Timer')
})
