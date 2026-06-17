const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createPluginSubmissionBundle } = require('../../scripts/create-plugin-submission-bundle')
const {
  createPluginMaintainerApproval,
  parseArgs
} = require('../../scripts/create-plugin-maintainer-approval')

const EXAMPLE_PLUGIN_PATH = path.join(__dirname, '../../examples/plugins/focus-timer')

const createBundle = (options = {}) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-maintainer-approval-bundle-'))
  createPluginSubmissionBundle({
    sourcePath: EXAMPLE_PLUGIN_PATH,
    outputDir,
    now: () => new Date('2026-06-16T00:00:00.000Z'),
    ...options
  })
  return outputDir
}

test('parseArgs accepts bundle, reviewer, decision, notes, and json flags', () => {
  const options = parseArgs([
    'submission-bundle',
    '--reviewer', 'OpenPet Maintainer',
    '--decision', 'approved',
    '--notes', 'Reviewed package and bundle.',
    '--json'
  ])

  assert.equal(options.bundleDir, 'submission-bundle')
  assert.equal(options.reviewer, 'OpenPet Maintainer')
  assert.equal(options.decision, 'approved')
  assert.equal(options.notes, 'Reviewed package and bundle.')
  assert.equal(options.json, true)
})

test('parseArgs rejects missing values and unknown decisions', () => {
  assert.throws(() => parseArgs(['bundle', '--reviewer']), /--reviewer requires a value/)
  assert.throws(() => parseArgs(['bundle', '--decision']), /--decision requires a value/)
  assert.throws(() => parseArgs(['bundle', '--notes']), /--notes requires a value/)
  assert.throws(
    () => parseArgs(['bundle', '--reviewer', 'OpenPet Maintainer', '--decision', 'pending', '--notes', 'x']),
    /Unknown approval decision/
  )
})

test('createPluginMaintainerApproval writes markdown and json approval artifacts for an approved bundle', () => {
  const bundleDir = createBundle()
  const approval = createPluginMaintainerApproval({
    bundleDir,
    reviewer: 'OpenPet Maintainer',
    decision: 'approved',
    notes: 'Manifest, permissions, package hash, and submission artifacts reviewed.',
    now: () => new Date('2026-06-17T00:00:00.000Z')
  })

  assert.equal(approval.approvalReady, true)
  assert.equal(approval.plugin.id, 'openpet.example.focus-timer')
  assert.equal(fs.existsSync(approval.files.markdown), true)
  assert.equal(fs.existsSync(approval.files.json), true)
  assert.match(fs.readFileSync(approval.files.markdown, 'utf-8'), /Plugin Maintainer Approval/)
  assert.equal(JSON.parse(fs.readFileSync(approval.files.json, 'utf-8')).decision, 'approved')
})

test('createPluginMaintainerApproval records changes-requested without claiming approvalReady', () => {
  const bundleDir = createBundle()
  const approval = createPluginMaintainerApproval({
    bundleDir,
    reviewer: 'OpenPet Maintainer',
    decision: 'changes-requested',
    notes: 'Need clearer justification for network hosts.'
  })

  assert.equal(approval.approvalReady, false)
  assert.equal(approval.decision, 'changes-requested')
  assert.equal(approval.submissionDecision, 'ready-for-human-review')
})

test('create-plugin-maintainer-approval cli accepts changes-requested as a valid recorded decision', () => {
  const bundleDir = createBundle()
  const scriptPath = path.join(__dirname, '../../scripts/create-plugin-maintainer-approval.js')

  execFileSync(process.execPath, [
    scriptPath,
    bundleDir,
    '--reviewer', 'OpenPet Maintainer',
    '--decision', 'changes-requested',
    '--notes', 'Need clearer justification for network hosts.'
  ], { stdio: 'pipe' })

  const approval = JSON.parse(fs.readFileSync(path.join(bundleDir, 'plugin-maintainer-approval.json'), 'utf-8'))
  assert.equal(approval.decision, 'changes-requested')
  assert.equal(approval.approvalReady, false)
})
