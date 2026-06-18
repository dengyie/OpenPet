const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginRealWorldSubmissionRehearsal,
  parseArgs,
  sessionIdFromDate
} = require('../../scripts/create-plugin-real-world-submission-rehearsal')

const EXAMPLE_PLUGIN_PATH = path.join(__dirname, '../../examples/plugins/weather-status')

test('parseArgs accepts source, output, reviewer, decision, notes, and json flags', () => {
  const options = parseArgs([
    '--source', 'examples/plugins/weather-status',
    '--output-dir', 'docs/release-evidence/session-a',
    '--reviewer', 'OpenPet Maintainer',
    '--decision', 'approved',
    '--notes', 'Reviewed manifest and package evidence.',
    '--json'
  ])

  assert.equal(options.sourcePath, 'examples/plugins/weather-status')
  assert.equal(options.outputDir, 'docs/release-evidence/session-a')
  assert.equal(options.reviewer, 'OpenPet Maintainer')
  assert.equal(options.decision, 'approved')
  assert.equal(options.notes, 'Reviewed manifest and package evidence.')
  assert.equal(options.json, true)
})

test('parseArgs leaves output directory unset by default so sessions get isolated archives', () => {
  const options = parseArgs(['--source', 'examples/plugins/weather-status'])

  assert.equal(options.outputDir, '')
})

test('parseArgs rejects missing values and unexpected arguments', () => {
  assert.throws(() => parseArgs(['--source']), /--source requires a value/)
  assert.throws(() => parseArgs(['--output-dir']), /--output-dir requires a value/)
  assert.throws(() => parseArgs(['--reviewer']), /--reviewer requires a value/)
  assert.throws(() => parseArgs(['--decision']), /--decision requires a value/)
  assert.throws(() => parseArgs(['--notes']), /--notes requires a value/)
  assert.throws(() => parseArgs(['--source', 'a', '--decision', 'pending']), /Unknown approval decision/)
  assert.throws(() => parseArgs(['--source', 'a', 'extra']), /Unexpected argument/)
})

test('sessionIdFromDate formats a stable archive-safe timestamp', () => {
  assert.equal(sessionIdFromDate(new Date('2026-06-17T15:14:15.000Z')), '2026-06-17T15-14-15Z')
})

test('createPluginRealWorldSubmissionRehearsal packages an existing plugin through author and maintainer handoff', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-real-world-rehearsal-'))
  const summary = createPluginRealWorldSubmissionRehearsal({
    sourcePath: EXAMPLE_PLUGIN_PATH,
    outputDir,
    reviewer: 'OpenPet Maintainer',
    decision: 'approved',
    notes: 'Manifest, package hash, network hosts, and submission artifacts reviewed.',
    now: () => new Date('2026-06-17T15:14:15.000Z')
  })

  assert.equal(summary.sourcePlugin.id, 'openpet.example.weather-status')
  assert.equal(summary.packageValidation.ok, true)
  assert.equal(summary.submission.bundleValidation.ok, true)
  assert.equal(summary.submission.bundleValidation.summary.readyForHumanReview, true)
  assert.equal(summary.approval.validation.ok, true)
  assert.equal(summary.approval.record.decision, 'approved')
  assert.equal(summary.approval.record.approvalReady, true)
  assert.equal(fs.existsSync(summary.files.readme), true)
  assert.equal(fs.existsSync(summary.files.checklist), true)
  assert.equal(fs.existsSync(summary.files.commands), true)
  assert.equal(fs.existsSync(summary.files.summary), true)
  assert.equal(fs.existsSync(summary.packagePath), true)
  assert.equal(fs.existsSync(summary.submission.bundleDir), true)
  assert.equal(fs.existsSync(summary.approval.record.files.markdown), true)
  assert.equal(fs.existsSync(summary.approval.record.files.json), true)
  assert.equal(summary.outputDir, outputDir)

  const readme = fs.readFileSync(summary.files.readme, 'utf-8')
  assert.match(readme, /OpenPet Plugin Real-World Submission Rehearsal/)
  assert.match(readme, /openpet\.example\.weather-status/)
  assert.match(readme, /create-plugin-maintainer-approval/)

  const commands = JSON.parse(fs.readFileSync(summary.files.commands, 'utf-8')).commands
  assert.equal(commands.some((command) => command.includes('create-plugin-submission-bundle')), true)
  assert.equal(commands.some((command) => command.includes('validate-plugin-maintainer-approval')), true)
})
