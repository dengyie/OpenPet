const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  CHECK_GUIDANCE,
  createRunbook,
  defaultOutputPath,
  parseArgs: parseRunbookArgs,
  writeRunbook
} = require('../../scripts/create-desktop-picker-smoke-runbook')
const {
  listChecks,
  parseArgs: parseUpdateArgs,
  updateReport,
  validateUpdatedReport,
  writeReport
} = require('../../scripts/update-desktop-picker-smoke-report')
const { REQUIRED_CHECKS } = require('../../scripts/validate-desktop-picker-smoke-report')

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const createPendingReport = () => ({
  platform: 'darwin',
  arch: 'arm64',
  generatedAt: '2026-06-15T00:00:00.000Z',
  environment: {
    osRelease: 'Darwin 25.0.0',
    machine: 'mac-smoke-host',
    runner: 'manual packaged smoke',
    evidence: 'local validation transcript'
  },
  artifact: {
    version: '1.0.1-rc.1',
    releaseDir: '/tmp/release',
    appPath: 'mac-arm64/OpenPet.app',
    installer: 'OpenPet-1.0.1-rc.1-mac.dmg',
    zip: 'OpenPet-1.0.1-rc.1-mac.zip',
    latestYml: 'latest-mac.yml',
    signed: false,
    signatureStatus: 'NotSigned',
    signatureEvidence: 'code object is not signed at all'
  },
  fixture: {
    pluginPackage: 'fixtures/focus-timer.openpet-plugin.zip',
    frameFolder: 'fixtures/wave-frames',
    petPack: 'fixtures/pet-pack'
  },
  checks: REQUIRED_CHECKS.map((check) => ({
    id: check.id,
    status: 'pending',
    evidence: '',
    notes: check.label
  }))
})

test('runbook parseArgs accepts report and output paths', () => {
  const options = parseRunbookArgs(['release/desktop-picker-smoke-report.json', '--output', 'release/desktop-picker-smoke-runbook.md'])

  assert.equal(options.reportPath, 'release/desktop-picker-smoke-report.json')
  assert.equal(options.outputPath, 'release/desktop-picker-smoke-runbook.md')
})

test('runbook parseArgs rejects missing values and unexpected arguments', () => {
  assert.throws(() => parseRunbookArgs(['report.json', '--output']), /--output requires a value/)
  assert.throws(() => parseRunbookArgs(['report.json', 'extra.json']), /Unexpected argument/)
})

test('defaultOutputPath writes the runbook next to the report', () => {
  assert.equal(
    defaultOutputPath(path.join('release', 'desktop-picker-smoke-report.json')),
    path.resolve('release', 'desktop-picker-smoke-runbook.md')
  )
})

test('createRunbook documents every required desktop picker smoke check', () => {
  const report = createPendingReport()
  const runbook = createRunbook({
    report,
    reportPath: path.resolve('release/desktop-picker-smoke-report.json'),
    generatedAt: new Date('2026-06-15T01:00:00.000Z')
  })

  assert.match(runbook, /# OpenPet Desktop Native Picker Smoke Runbook/)
  assert.match(runbook, /Generated: 2026-06-15T01:00:00.000Z/)
  assert.match(runbook, /Artifact: mac-arm64\/OpenPet\.app/)
  assert.match(runbook, /This file does not prove native picker success by itself/)
  assert.match(runbook, /npm run validate-desktop-picker-smoke-report -- release\/desktop-picker-smoke-report\.json/)
  assert.match(runbook, /--require-signed/)

  for (const check of REQUIRED_CHECKS) {
    assert.equal(runbook.includes(`\`${check.id}\``), true)
    assert.match(runbook, new RegExp(escapeRegExp(check.label)))
    assert.match(runbook, new RegExp(escapeRegExp(CHECK_GUIDANCE[check.id])))
  }
})

test('createRunbook rejects structurally invalid reports', () => {
  const report = createPendingReport()
  report.checks = report.checks.filter((check) => check.id !== 'packaged-launch')

  assert.throws(
    () => createRunbook({ report, reportPath: 'release/desktop-picker-smoke-report.json' }),
    /Cannot create desktop picker smoke runbook.*missing required check: packaged-launch/
  )
})

test('writeRunbook writes markdown with a trailing newline', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-desktop-picker-runbook-'))
  const outputPath = path.join(tempDir, 'nested', 'desktop-picker-smoke-runbook.md')

  const writtenPath = writeRunbook({ content: '# Runbook', outputPath })
  const raw = fs.readFileSync(writtenPath, 'utf-8')

  assert.equal(writtenPath, outputPath)
  assert.equal(raw, '# Runbook\n')
})

test('update parseArgs accepts metadata and check updates', () => {
  const options = parseUpdateArgs([
    'report.json',
    '--set-env', 'machine=mac-smoke-host',
    '--set-artifact', 'signed=true',
    '--set-fixture', 'pluginPackage=fixtures/focus.openpet-plugin.zip',
    '--check', 'plugin-picker-cancel',
    '--status', 'pass',
    '--evidence', 'Canceled native picker without state change',
    '--notes', 'Observed in packaged app'
  ])

  assert.equal(options.reportPath, 'report.json')
  assert.deepEqual(options.envUpdates, [{ key: 'machine', value: 'mac-smoke-host' }])
  assert.deepEqual(options.artifactUpdates, [{ key: 'signed', value: 'true' }])
  assert.deepEqual(options.fixtureUpdates, [{ key: 'pluginPackage', value: 'fixtures/focus.openpet-plugin.zip' }])
  assert.equal(options.checkId, 'plugin-picker-cancel')
  assert.equal(options.status, 'pass')
})

test('update parseArgs rejects incomplete or unsafe flag combinations', () => {
  assert.throws(() => parseUpdateArgs(['report.json', '--check']), /--check requires a value/)
  assert.throws(() => parseUpdateArgs(['report.json', '--check', 'plugin-picker-cancel', '--status', 'done']), /Invalid check status/)
  assert.throws(() => parseUpdateArgs(['report.json', '--status', 'pass']), /--check is required/)
  assert.throws(() => parseUpdateArgs(['report.json', '--require-signed']), /--require-signed must be used with --validate-ready/)
})

test('updateReport updates environment, artifact, fixture, and selected check evidence', () => {
  const report = createPendingReport()
  const updated = updateReport(report, {
    envUpdates: [{ key: 'machine', value: 'mac-smoke-host-2' }],
    artifactUpdates: [
      { key: 'signed', value: 'true' },
      { key: 'signatureStatus', value: 'Valid' },
      { key: 'releaseDir', value: '/tmp/custom-release' }
    ],
    fixtureUpdates: [{ key: 'pluginPackage', value: '/tmp/focus.openpet-plugin.zip' }],
    checkId: 'plugin-picker-cancel',
    status: 'pass',
    evidence: 'Canceled native picker without side effects',
    notes: 'Observed in packaged app'
  })

  assert.equal(updated.environment.machine, 'mac-smoke-host-2')
  assert.equal(updated.artifact.signed, true)
  assert.equal(updated.artifact.signatureStatus, 'Valid')
  assert.equal(updated.artifact.releaseDir, 'release')
  assert.equal(updated.fixture.pluginPackage, 'focus.openpet-plugin.zip')
  const check = updated.checks.find((item) => item.id === 'plugin-picker-cancel')
  assert.equal(check.status, 'pass')
  assert.equal(check.evidence, 'Canceled native picker without side effects')
  assert.equal(validateUpdatedReport(updated, { validateReady: false }).ok, true)
})

test('updateReport reads selected check evidence from a text file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-desktop-picker-update-'))
  const evidencePath = path.join(tempDir, 'evidence.txt')
  fs.writeFileSync(evidencePath, 'Review panel showed hash-verified signature\n')

  const updated = updateReport(createPendingReport(), {
    checkId: 'plugin-picker-zip-review',
    status: 'pass',
    evidenceFile: evidencePath
  })

  const check = updated.checks.find((item) => item.id === 'plugin-picker-zip-review')
  assert.equal(check.evidence, 'Review panel showed hash-verified signature')
})

test('updateReport rejects unknown metadata and check ids', () => {
  assert.throws(
    () => updateReport(createPendingReport(), { envUpdates: [{ key: 'os', value: 'macOS' }] }),
    /Unknown environment key: os/
  )
  assert.throws(
    () => updateReport(createPendingReport(), { artifactUpdates: [{ key: 'path', value: 'OpenPet.app' }] }),
    /Unknown artifact key: path/
  )
  assert.throws(
    () => updateReport(createPendingReport(), { fixtureUpdates: [{ key: 'plugin', value: 'plugin.zip' }] }),
    /Unknown fixture key: plugin/
  )
  assert.throws(
    () => updateReport(createPendingReport(), { checkId: 'unknown-check', status: 'pass' }),
    /Unknown check id: unknown-check/
  )
})

test('validateUpdatedReport allows incremental reports but rejects readiness with pending checks', () => {
  const report = createPendingReport()
  const incremental = validateUpdatedReport(report, { validateReady: false })
  assert.equal(incremental.ok, true)

  const ready = validateUpdatedReport(report, { validateReady: true })
  assert.equal(ready.ok, false)
  assert.match(ready.errors.join('\n'), /packaged-launch must pass/)
})

test('listChecks prints every required desktop picker smoke check', () => {
  const output = listChecks()
  for (const check of REQUIRED_CHECKS) {
    assert.match(output, new RegExp(escapeRegExp(`${check.id}\t${check.label}`)))
  }
})

test('writeReport writes pretty JSON to the requested path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-desktop-picker-write-'))
  const outputPath = path.join(tempDir, 'nested', 'desktop-picker-smoke-report.json')

  const writtenPath = writeReport({ report: createPendingReport(), outputPath })
  const raw = fs.readFileSync(writtenPath, 'utf-8')

  assert.equal(writtenPath, outputPath)
  assert.match(raw, /\n  "platform": "darwin"/)
  assert.equal(raw.endsWith('\n'), true)
})
