const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createPluginSubmissionBundle } = require('../../scripts/create-plugin-submission-bundle')
const { createPluginMaintainerApproval } = require('../../scripts/create-plugin-maintainer-approval')
const {
  loadApprovalBundle,
  parseArgs,
  validateMaintainerApproval
} = require('../../scripts/validate-plugin-maintainer-approval')

const EXAMPLE_PLUGIN_PATH = path.join(__dirname, '../../examples/plugins/focus-timer')

const createBundle = (options = {}) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-maintainer-approval-validate-'))
  createPluginSubmissionBundle({
    sourcePath: EXAMPLE_PLUGIN_PATH,
    outputDir,
    now: () => new Date('2026-06-16T00:00:00.000Z'),
    ...options
  })
  return outputDir
}

const createApprovedApprovalBundle = () => {
  const bundleDir = createBundle()
  createPluginMaintainerApproval({
    bundleDir,
    reviewer: 'OpenPet Maintainer',
    decision: 'approved',
    notes: 'Manifest, permissions, package hash, and submission artifacts reviewed.',
    now: () => new Date('2026-06-17T00:00:00.000Z')
  })
  return bundleDir
}

const createChangesRequestedApprovalBundle = () => {
  const bundleDir = createBundle()
  createPluginMaintainerApproval({
    bundleDir,
    reviewer: 'OpenPet Maintainer',
    decision: 'changes-requested',
    notes: 'Need clearer justification for network hosts.',
    now: () => new Date('2026-06-17T00:00:00.000Z')
  })
  return bundleDir
}

test('parseArgs accepts bundle directory, json, and require-approved flags', () => {
  const options = parseArgs(['submission-bundle', '--json', '--require-approved'])

  assert.equal(options.bundleDir, 'submission-bundle')
  assert.equal(options.json, true)
  assert.equal(options.requireApproved, true)
})

test('parseArgs rejects unexpected arguments', () => {
  assert.throws(() => parseArgs(['bundle-a', 'bundle-b']), /Unexpected argument/)
})

test('validateMaintainerApproval accepts a matching approved approval record', () => {
  const bundleDir = createApprovedApprovalBundle()
  const result = validateMaintainerApproval(loadApprovalBundle({ bundleDir }), { requireApproved: true })

  assert.equal(result.ok, true)
  assert.equal(result.summary.approved, true)
})

test('validateMaintainerApproval rejects mismatched package hash', () => {
  const bundle = loadApprovalBundle({ bundleDir: createApprovedApprovalBundle() })
  bundle.approval.package.sha256 = 'a'.repeat(64)
  const result = validateMaintainerApproval(bundle)

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /package sha256 does not match submission bundle/)
})

test('validateMaintainerApproval rejects require-approved when decision is changes-requested', () => {
  const bundleDir = createChangesRequestedApprovalBundle()
  const result = validateMaintainerApproval(loadApprovalBundle({ bundleDir }), { requireApproved: true })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /approval is not marked approved/)
})

test('validateMaintainerApproval reports missing required approval files', () => {
  const bundleDir = createApprovedApprovalBundle()
  fs.rmSync(path.join(bundleDir, 'plugin-maintainer-approval.md'))
  const result = validateMaintainerApproval(loadApprovalBundle({ bundleDir }))

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /missing required file: plugin-maintainer-approval\.md/)
})
