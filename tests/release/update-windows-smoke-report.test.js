const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  ARTIFACT_KEYS,
  ENVIRONMENT_KEYS,
  listChecks,
  parseArgs,
  updateReport,
  validateUpdatedReport,
  writeReport
} = require('../../scripts/update-windows-smoke-report')
const { REQUIRED_CHECKS } = require('../../scripts/validate-windows-smoke-report')

const createPendingReport = () => ({
  platform: 'win32',
  arch: 'x64',
  environment: {},
  artifact: {},
  checks: REQUIRED_CHECKS.map((check) => ({
    id: check.id,
    status: 'pending',
    evidence: '',
    notes: check.label
  }))
})

const createPassingReport = () => ({
  platform: 'win32',
  arch: 'x64',
  environment: {
    windowsVersion: 'Windows 11 23H2',
    machine: 'clean Windows VM',
    evidence: 'Manual validation session 2026-06-14'
  },
  artifact: {
    version: '1.0.1-rc.1',
    installer: 'OpenPet-1.0.1-rc.1-win32-x64.exe',
    zip: 'OpenPet-1.0.1-rc.1-win32-x64.zip',
    latestYml: 'latest.yml',
    signed: false,
    authenticodeStatus: 'NotSigned'
  },
  checks: REQUIRED_CHECKS.map((check) => ({
    id: check.id,
    status: 'pass',
    evidence: `${check.id} evidence`
  }))
})

test('listChecks prints every required Windows smoke check', () => {
  const output = listChecks()

  for (const check of REQUIRED_CHECKS) {
    assert.match(output, new RegExp(`${check.id}\\t${check.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  }
})

test('parseArgs accepts metadata, check updates, and readiness flags', () => {
  const options = parseArgs([
    'report.json',
    '--output', 'updated.json',
    '--set-env', 'windowsVersion=Windows 11 23H2',
    '--set-artifact', 'signed=true',
    '--check', 'launch',
    '--status', 'pass',
    '--evidence', 'Launched from Start menu',
    '--notes', 'No crash',
    '--validate-ready',
    '--require-signed'
  ])

  assert.equal(options.reportPath, 'report.json')
  assert.equal(options.outputPath, 'updated.json')
  assert.deepEqual(options.envUpdates, [{ key: 'windowsVersion', value: 'Windows 11 23H2' }])
  assert.deepEqual(options.artifactUpdates, [{ key: 'signed', value: 'true' }])
  assert.equal(options.checkId, 'launch')
  assert.equal(options.status, 'pass')
  assert.equal(options.evidence, 'Launched from Start menu')
  assert.equal(options.notes, 'No crash')
  assert.equal(options.validateReady, true)
  assert.equal(options.requireSigned, true)
})

test('parseArgs rejects incomplete or unsafe flag combinations', () => {
  assert.throws(() => parseArgs(['report.json', '--output']), /--output requires a value/)
  assert.throws(() => parseArgs(['report.json', '--status', 'pass']), /--check is required/)
  assert.throws(() => parseArgs(['report.json', '--check', 'launch', '--status', 'done']), /Invalid check status/)
  assert.throws(() => parseArgs(['report.json', '--require-signed']), /must be used with --validate-ready/)
})

test('updateReport updates environment, artifact, and selected check evidence', () => {
  const report = createPendingReport()
  const updated = updateReport(report, {
    envUpdates: [
      { key: 'windowsVersion', value: 'Windows 11 23H2' },
      { key: 'machine', value: 'clean Windows VM' },
      { key: 'runner', value: 'manual smoke session' },
      { key: 'evidence', value: 'screen recording link' }
    ],
    artifactUpdates: [
      { key: 'version', value: '1.0.1-rc.1' },
      { key: 'installer', value: 'OpenPet-1.0.1-rc.1-win32-x64.exe' },
      { key: 'zip', value: 'OpenPet-1.0.1-rc.1-win32-x64.zip' },
      { key: 'latestYml', value: 'latest.yml' },
      { key: 'signed', value: 'false' },
      { key: 'authenticodeStatus', value: 'NotSigned' },
      { key: 'authenticodeEvidence', value: 'Get-AuthenticodeSignature Status : NotSigned' }
    ],
    checkId: 'launch',
    status: 'pass',
    evidence: 'Installed app launched and stayed running for 60 seconds',
    notes: 'Observed on clean Windows VM'
  })

  assert.equal(updated.environment.windowsVersion, 'Windows 11 23H2')
  assert.equal(updated.environment.evidence, 'screen recording link')
  assert.equal(updated.artifact.signed, false)
  assert.equal(updated.artifact.latestYml, 'latest.yml')
  assert.equal(updated.checks.find((check) => check.id === 'launch').status, 'pass')
  assert.equal(updated.checks.find((check) => check.id === 'launch').evidence, 'Installed app launched and stayed running for 60 seconds')
})

test('updateReport reads selected check evidence from a text file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-windows-smoke-update-'))
  const evidencePath = path.join(tempDir, 'launch.txt')
  fs.writeFileSync(evidencePath, 'PowerShell transcript path\n')

  const report = createPendingReport()
  const updated = updateReport(report, {
    checkId: 'launch',
    status: 'pass',
    evidenceFile: evidencePath
  })

  assert.equal(updated.checks.find((check) => check.id === 'launch').evidence, 'PowerShell transcript path')
})

test('updateReport creates a missing required check and rejects unknown fields', () => {
  const report = createPendingReport()
  report.checks = report.checks.filter((check) => check.id !== 'launch')

  const updated = updateReport(report, {
    checkId: 'launch',
    status: 'blocked',
    notes: 'Launch blocked by missing artifact'
  })

  assert.equal(updated.checks.find((check) => check.id === 'launch').status, 'blocked')

  assert.throws(
    () => updateReport(createPendingReport(), { checkId: 'not-a-check' }),
    /Unknown check id/
  )
  assert.throws(
    () => updateReport(createPendingReport(), { envUpdates: [{ key: 'os', value: 'Windows' }] }),
    /Unknown environment key/
  )
  assert.throws(
    () => updateReport(createPendingReport(), { artifactUpdates: [{ key: 'dmg', value: 'OpenPet.dmg' }] }),
    /Unknown artifact key/
  )
  assert.throws(
    () => updateReport(createPendingReport(), { artifactUpdates: [{ key: 'signed', value: 'maybe' }] }),
    /signed must be a boolean value/
  )
})

test('validateUpdatedReport allows incremental reports but rejects readiness with pending checks', () => {
  const report = createPendingReport()

  assert.equal(validateUpdatedReport(report, { validateReady: false }).ok, true)

  const ready = validateUpdatedReport(report, { validateReady: true })
  assert.equal(ready.ok, false)
  assert.match(ready.errors.join('\n'), /install must pass before Windows release readiness can be claimed/)
})

test('validateUpdatedReport enforces signed official readiness only when requested', () => {
  const unsigned = createPassingReport()
  assert.equal(validateUpdatedReport(unsigned, { validateReady: true }).ok, true)
  assert.equal(validateUpdatedReport(unsigned, { validateReady: true, requireSigned: true }).ok, false)

  const signed = createPassingReport()
  signed.artifact.signed = true
  signed.artifact.authenticodeStatus = 'Valid'
  signed.artifact.authenticodeEvidence = 'Get-AuthenticodeSignature Status : Valid'

  assert.equal(validateUpdatedReport(signed, { validateReady: true, requireSigned: true }).ok, true)
})

test('writeReport writes pretty JSON to the requested path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-windows-smoke-write-'))
  const outputPath = path.join(tempDir, 'nested', 'report.json')
  const report = createPendingReport()

  const writtenPath = writeReport({ report, outputPath })
  const raw = fs.readFileSync(writtenPath, 'utf-8')

  assert.equal(writtenPath, outputPath)
  assert.equal(raw.endsWith('\n'), true)
  assert.equal(JSON.parse(raw).checks.length, REQUIRED_CHECKS.length)
})

test('metadata key allowlists include the documented update fields', () => {
  assert.deepEqual([...ENVIRONMENT_KEYS].sort(), ['evidence', 'machine', 'runner', 'windowsVersion'])
  assert.deepEqual([...ARTIFACT_KEYS].sort(), [
    'authenticodeEvidence',
    'authenticodeStatus',
    'installer',
    'latestYml',
    'signed',
    'version',
    'zip'
  ])
})
