const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPendingChecks,
  createPluginCleanupEvidenceReport,
  parseArgs,
  writeReport
} = require('../../scripts/create-plugin-cleanup-evidence-report')
const {
  REQUIRED_CHECKS,
  validateReport
} = require('../../scripts/validate-plugin-cleanup-evidence-report')

const createCompleteReport = (overrides = {}) => ({
  schemaVersion: 'openpet-plugin-cleanup-evidence/v1',
  generatedAt: '2026-06-18T00:00:00.000Z',
  source: 'tests',
  environment: {
    platform: 'darwin',
    arch: 'arm64',
    node: 'v24.0.0',
    machine: 'cleanup-host',
    runner: 'local terminal',
    evidence: 'terminal transcript sha256:abc123'
  },
  scenario: {
    pluginId: 'openpet.cleanup-fixture',
    hostApp: 'OpenPet packaged app',
    notes: 'Fixture cleanup run'
  },
  checks: REQUIRED_CHECKS.map((check) => ({
    id: check.id,
    status: 'pass',
    evidence: `${check.id} evidence`
  })),
  ...overrides
})

test('createPluginCleanupEvidenceReport writes a pending real-host cleanup evidence template', () => {
  const report = createPluginCleanupEvidenceReport({
    platform: 'darwin',
    arch: 'arm64',
    nodeVersion: 'v24.1.0',
    hostname: () => 'mac-cleanup-host',
    env: {
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'dengyie/OpenPet',
      GITHUB_RUN_ID: '98765',
      RUNNER_NAME: 'macos-cleanup-runner'
    },
    now: () => new Date('2026-06-18T08:00:00.000Z'),
    pluginId: 'openpet.cleanup-fixture',
    hostApp: 'OpenPet.app'
  })

  assert.equal(report.schemaVersion, 'openpet-plugin-cleanup-evidence/v1')
  assert.equal(report.generatedAt, '2026-06-18T08:00:00.000Z')
  assert.equal(report.environment.platform, 'darwin')
  assert.equal(report.environment.arch, 'arm64')
  assert.equal(report.environment.node, 'v24.1.0')
  assert.equal(report.environment.machine, 'mac-cleanup-host')
  assert.equal(report.environment.evidence, 'https://github.com/dengyie/OpenPet/actions/runs/98765')
  assert.equal(report.scenario.pluginId, 'openpet.cleanup-fixture')
  assert.equal(report.scenario.hostApp, 'OpenPet.app')
  assert.equal(report.checks.length, REQUIRED_CHECKS.length)
  assert.equal(report.checks.every((check) => check.status === 'pending'), true)

  const validation = validateReport(report, { allowPending: true })
  assert.equal(validation.ok, true)
  assert.equal(validation.summary.cleanupReady, false)
})

test('validateReport accepts complete cleanup evidence and marks cleanupReady', () => {
  const result = validateReport(createCompleteReport())

  assert.equal(result.ok, true)
  assert.equal(result.summary.passed, REQUIRED_CHECKS.length)
  assert.equal(result.summary.cleanupReady, true)
})

test('validateReport allows pending cleanup reports only with allowPending', () => {
  const report = createCompleteReport({
    checks: createPendingChecks()
  })

  assert.equal(validateReport(report).ok, false)
  assert.equal(validateReport(report, { allowPending: true }).ok, true)
})

test('validateReport rejects passed cleanup checks without evidence', () => {
  const report = createCompleteReport()
  report.checks[0].evidence = ''

  const result = validateReport(report)

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), new RegExp(`${report.checks[0].id} passed but has no evidence`))
})

test('parseArgs rejects cleanup report options without values', () => {
  assert.throws(() => parseArgs(['--output']), /--output requires a value/)
  assert.throws(() => parseArgs(['--plugin-id', '--host-app', 'OpenPet.app']), /--plugin-id requires a value/)
  assert.throws(() => parseArgs(['--host-app']), /--host-app requires a value/)
  assert.throws(() => parseArgs(['--notes']), /--notes requires a value/)
})

test('validateReport rejects unknown duplicate and missing cleanup checks', () => {
  const report = createCompleteReport({
    checks: [
      ...REQUIRED_CHECKS.slice(1).map((check) => ({
        id: check.id,
        status: 'pass',
        evidence: `${check.id} evidence`
      })),
      { id: REQUIRED_CHECKS[1].id, status: 'pass', evidence: 'duplicate' },
      { id: 'unknown-cleanup-check', status: 'pass', evidence: 'unknown' }
    ]
  })

  const result = validateReport(report)

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), new RegExp(`missing required check: ${REQUIRED_CHECKS[0].id}`))
  assert.match(result.errors.join('\n'), new RegExp(`duplicate check id: ${REQUIRED_CHECKS[1].id}`))
  assert.match(result.errors.join('\n'), /unknown check id: unknown-cleanup-check/)
})

test('writeReport writes plugin cleanup evidence JSON with a trailing newline', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-cleanup-evidence-'))
  const outputPath = path.join(tempDir, 'nested', 'plugin-cleanup-evidence-report.json')
  const report = createCompleteReport()

  const writtenPath = writeReport({ report, outputPath })
  const raw = fs.readFileSync(writtenPath, 'utf-8')

  assert.equal(writtenPath, outputPath)
  assert.equal(raw.endsWith('\n'), true)
  assert.deepEqual(JSON.parse(raw).scenario, report.scenario)
})
