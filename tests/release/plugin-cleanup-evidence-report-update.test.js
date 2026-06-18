const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginCleanupEvidenceReport
} = require('../../scripts/create-plugin-cleanup-evidence-report')
const {
  listChecks,
  parseArgs: parseUpdateArgs,
  updateReport,
  validateUpdatedReport,
  writeReport
} = require('../../scripts/update-plugin-cleanup-evidence-report')
const { REQUIRED_CHECKS } = require('../../scripts/validate-plugin-cleanup-evidence-report')

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const createPendingReport = () => createPluginCleanupEvidenceReport({
  platform: 'darwin',
  arch: 'arm64',
  nodeVersion: 'v24.1.0',
  hostname: () => 'cleanup-host',
  env: {
    RUNNER_NAME: 'manual cleanup validation'
  },
  now: () => new Date('2026-06-18T11:00:00.000Z'),
  pluginId: 'openpet.cleanup-fixture',
  hostApp: 'OpenPet packaged app',
  notes: 'Real-host cleanup report template'
})

test('cleanup evidence update parseArgs accepts metadata and check updates', () => {
  const options = parseUpdateArgs([
    'plugin-cleanup-evidence-report.json',
    '--set-env', 'machine=mac-cleanup-host',
    '--set-env', 'evidence=terminal transcript sha256:abc123',
    '--set-scenario', 'hostApp=OpenPet.app',
    '--check', 'service-exit-confirmed-stop',
    '--status', 'pass',
    '--evidence', 'Service stayed stopping until exit event',
    '--notes', 'Observed in packaged app cleanup fixture'
  ])

  assert.equal(options.reportPath, 'plugin-cleanup-evidence-report.json')
  assert.deepEqual(options.envUpdates, [
    { key: 'machine', value: 'mac-cleanup-host' },
    { key: 'evidence', value: 'terminal transcript sha256:abc123' }
  ])
  assert.deepEqual(options.scenarioUpdates, [{ key: 'hostApp', value: 'OpenPet.app' }])
  assert.equal(options.checkId, 'service-exit-confirmed-stop')
  assert.equal(options.status, 'pass')
  assert.equal(options.evidence, 'Service stayed stopping until exit event')
  assert.equal(options.notes, 'Observed in packaged app cleanup fixture')
})

test('cleanup evidence update parseArgs rejects incomplete flag combinations', () => {
  assert.throws(() => parseUpdateArgs(['report.json', '--check']), /--check requires a value/)
  assert.throws(() => parseUpdateArgs(['report.json', '--check', 'service-exit-confirmed-stop', '--status', 'done']), /Invalid check status/)
  assert.throws(() => parseUpdateArgs(['report.json', '--status', 'pass']), /--check is required/)
  assert.throws(() => parseUpdateArgs(['report.json', '--evidence-file']), /--evidence-file requires a value/)
  assert.throws(() => parseUpdateArgs(['report.json', '--set-env', 'machine']), /Expected key=value/)
})

test('updateReport updates cleanup environment scenario and selected check evidence', () => {
  const updated = updateReport(createPendingReport(), {
    envUpdates: [
      { key: 'machine', value: 'mac-cleanup-host-2' },
      { key: 'evidence', value: 'terminal transcript sha256:def456' }
    ],
    scenarioUpdates: [
      { key: 'hostApp', value: 'OpenPet.app 1.0.1' },
      { key: 'notes', value: 'Packaged cleanup validation' }
    ],
    checkId: 'service-exit-confirmed-stop',
    status: 'pass',
    evidence: 'Service runtime remained stopping until child exit confirmation',
    notes: 'Observed with controlled cleanup fixture'
  })

  assert.equal(updated.environment.machine, 'mac-cleanup-host-2')
  assert.equal(updated.environment.evidence, 'terminal transcript sha256:def456')
  assert.equal(updated.scenario.hostApp, 'OpenPet.app 1.0.1')
  assert.equal(updated.scenario.notes, 'Packaged cleanup validation')
  const check = updated.checks.find((item) => item.id === 'service-exit-confirmed-stop')
  assert.equal(check.status, 'pass')
  assert.equal(check.evidence, 'Service runtime remained stopping until child exit confirmation')
  assert.equal(check.notes, 'Observed with controlled cleanup fixture')
  assert.equal(validateUpdatedReport(updated, { validateReady: false }).ok, true)
})

test('updateReport reads cleanup check evidence from a UTF-8 text file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-cleanup-update-'))
  const evidencePath = path.join(tempDir, 'evidence.txt')
  fs.writeFileSync(evidencePath, 'Process tree fallback transcript\n')

  const updated = updateReport(createPendingReport(), {
    checkId: 'service-tree-fallback-cleanup',
    status: 'pass',
    evidenceFile: evidencePath
  })

  const check = updated.checks.find((item) => item.id === 'service-tree-fallback-cleanup')
  assert.equal(check.evidence, 'Process tree fallback transcript')
})

test('updateReport rejects unknown cleanup metadata and check ids', () => {
  assert.throws(
    () => updateReport(createPendingReport(), { envUpdates: [{ key: 'os', value: 'macOS' }] }),
    /Unknown environment key: os/
  )
  assert.throws(
    () => updateReport(createPendingReport(), { scenarioUpdates: [{ key: 'pluginName', value: 'Fixture' }] }),
    /Unknown scenario key: pluginName/
  )
  assert.throws(
    () => updateReport(createPendingReport(), { checkId: 'unknown-cleanup-check', status: 'pass' }),
    /Unknown check id: unknown-cleanup-check/
  )
})

test('validateUpdatedReport allows incremental cleanup reports but rejects readiness with pending checks', () => {
  const report = createPendingReport()
  const incremental = validateUpdatedReport(report, { validateReady: false })
  assert.equal(incremental.ok, true)

  const ready = validateUpdatedReport(report, { validateReady: true })
  assert.equal(ready.ok, false)
  assert.match(ready.errors.join('\n'), /service-exit-confirmed-stop must pass/)
})

test('listChecks prints every required plugin cleanup evidence check', () => {
  const output = listChecks()
  for (const check of REQUIRED_CHECKS) {
    assert.match(output, new RegExp(escapeRegExp(`${check.id}\t${check.label}`)))
  }
})

test('writeReport writes pretty cleanup evidence JSON to the requested path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-cleanup-write-'))
  const outputPath = path.join(tempDir, 'nested', 'plugin-cleanup-evidence-report.json')

  const writtenPath = writeReport({ report: createPendingReport(), outputPath })
  const raw = fs.readFileSync(writtenPath, 'utf-8')

  assert.equal(writtenPath, outputPath)
  assert.match(raw, /\n  "schemaVersion": "openpet-plugin-cleanup-evidence\/v1"/)
  assert.equal(raw.endsWith('\n'), true)
})

test('cleanup evidence update CLI does not write invalid ready updates', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-cleanup-cli-'))
  const reportPath = path.join(tempDir, 'plugin-cleanup-evidence-report.json')
  const original = createPendingReport()
  writeReport({ report: original, outputPath: reportPath })

  assert.throws(
    () => execFileSync(process.execPath, [
      path.join(__dirname, '../../scripts/update-plugin-cleanup-evidence-report.js'),
      reportPath,
      '--check', 'service-exit-confirmed-stop',
      '--status', 'pass',
      '--validate-ready'
    ], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }),
    /service-exit-confirmed-stop passed but has no evidence/
  )

  const afterFailedUpdate = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  const check = afterFailedUpdate.checks.find((item) => item.id === 'service-exit-confirmed-stop')
  assert.equal(check.status, 'pending')
  assert.equal(check.evidence, '')
})
