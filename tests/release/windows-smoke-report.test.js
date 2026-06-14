const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { REQUIRED_CHECKS, validateReport } = require('../../scripts/validate-windows-smoke-report')

const createReport = (overrides = {}) => ({
  platform: 'win32',
  arch: 'x64',
  environment: {
    windowsVersion: 'Windows 11 23H2',
    machine: 'clean VM',
    evidence: 'GitHub Actions windows-latest run 123'
  },
  artifact: {
    version: '1.0.1-rc.1',
    installer: 'OpenPet-1.0.1-rc.1-win32-x64.exe',
    zip: 'OpenPet-1.0.1-rc.1-win32-x64.zip',
    signed: false,
    authenticodeStatus: 'NotSigned'
  },
  checks: REQUIRED_CHECKS.map((check) => ({
    id: check.id,
    status: 'pass',
    evidence: `${check.id} evidence`
  })),
  ...overrides
})

test('validateReport accepts a complete unsigned prerelease smoke report', () => {
  const result = validateReport(createReport())

  assert.equal(result.ok, true)
  assert.equal(result.summary.passed, REQUIRED_CHECKS.length)
  assert.equal(result.warnings.length, 1)
  assert.equal(result.summary.smokeReady, true)
  assert.equal(result.summary.officialReady, false)
})

test('validateReport allows pending template reports only with allowPending', () => {
  const report = createReport({
    checks: REQUIRED_CHECKS.map((check) => ({
      id: check.id,
      status: 'pending',
      notes: 'Fill on Windows smoke validation run'
    }))
  })

  assert.equal(validateReport(report).ok, false)
  assert.equal(validateReport(report, { allowPending: true }).ok, true)
})

test('validateReport rejects missing required checks', () => {
  const report = createReport({
    checks: REQUIRED_CHECKS.slice(1).map((check) => ({
      id: check.id,
      status: 'pass',
      evidence: `${check.id} evidence`
    }))
  })

  const result = validateReport(report)

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /missing required check: install/)
})

test('validateReport rejects passed checks without evidence', () => {
  const report = createReport()
  report.checks[0].evidence = ''

  const result = validateReport(report)

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /install passed but has no evidence/)
})

test('validateReport requires signed Authenticode evidence for official Windows readiness', () => {
  const unsigned = validateReport(createReport(), { requireSigned: true })
  assert.equal(unsigned.ok, false)
  assert.match(unsigned.errors.join('\n'), /artifact.signed must be true/)

  const signed = createReport({
    artifact: {
      version: '1.0.1',
      installer: 'OpenPet-1.0.1-win32-x64.exe',
      zip: 'OpenPet-1.0.1-win32-x64.zip',
      signed: true,
      authenticodeStatus: 'Valid',
      authenticodeEvidence: 'Get-AuthenticodeSignature Status : Valid'
    }
  })

  assert.equal(validateReport(signed, { requireSigned: true }).ok, true)
})

test('template report is structurally valid with pending checks allowed', () => {
  const templatePath = path.join(__dirname, '../../docs/release-evidence/windows-smoke-report.template.json')
  const template = require(templatePath)
  const result = validateReport(template, { allowPending: true })

  assert.equal(result.ok, true)
  assert.equal(result.summary.passed, 0)
})
