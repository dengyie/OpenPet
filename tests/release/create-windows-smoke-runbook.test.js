const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  CHECK_GUIDANCE,
  createRunbook,
  defaultOutputPath,
  parseArgs,
  writeRunbook
} = require('../../scripts/create-windows-smoke-runbook')
const { REQUIRED_CHECKS } = require('../../scripts/validate-windows-smoke-report')

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const createPendingReport = () => ({
  platform: 'win32',
  arch: 'x64',
  generatedAt: '2026-06-14T00:00:00.000Z',
  environment: {
    windowsVersion: 'Windows 10.0.22631',
    machine: 'windows-smoke-vm',
    runner: 'GitHub Actions 1',
    evidence: 'https://github.com/dengyie/OpenPet/actions/runs/12345'
  },
  artifact: {
    version: '1.0.1-rc.1',
    installer: 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.exe',
    zip: 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.zip',
    latestYml: 'latest.yml',
    blockmaps: ['OpenPet-1.0.1-rc.1-win32-x64.exe-unsigned.blockmap'],
    signed: false,
    authenticodeStatus: 'NotSigned'
  },
  checks: REQUIRED_CHECKS.map((check) => ({
    id: check.id,
    status: 'pending',
    evidence: '',
    notes: check.label
  }))
})

test('parseArgs accepts report and output paths', () => {
  const options = parseArgs(['release/windows-smoke-report.json', '--output', 'release/windows-smoke-runbook.md'])

  assert.equal(options.reportPath, 'release/windows-smoke-report.json')
  assert.equal(options.outputPath, 'release/windows-smoke-runbook.md')
})

test('parseArgs rejects missing values and unexpected arguments', () => {
  assert.throws(() => parseArgs(['report.json', '--output']), /--output requires a value/)
  assert.throws(() => parseArgs(['report.json', 'extra.json']), /Unexpected argument/)
})

test('defaultOutputPath writes the runbook next to the report', () => {
  assert.equal(
    defaultOutputPath(path.join('release', 'windows-smoke-report.json')),
    path.resolve('release', 'windows-smoke-runbook.md')
  )
})

test('createRunbook documents every required Windows smoke check', () => {
  const report = createPendingReport()
  const runbook = createRunbook({
    report,
    reportPath: path.resolve('release/windows-smoke-report.json'),
    generatedAt: new Date('2026-06-14T01:00:00.000Z')
  })

  assert.match(runbook, /# OpenPet Windows Smoke Validation Runbook/)
  assert.match(runbook, /Generated: 2026-06-14T01:00:00.000Z/)
  assert.match(runbook, /Installer: OpenPet-1\.0\.1-rc\.1-win32-x64-unsigned\.exe/)
  assert.match(runbook, /This file does not prove Windows support by itself/)
  assert.match(runbook, /## Optional Evidence Collector/)
  assert.match(runbook, /windows-smoke-collector\.ps1 -ReportPath \.\\windows-smoke-report\.json/)
  assert.match(runbook, /it does not mark any smoke check as passed/)
  assert.match(runbook, /npm run validate-windows-smoke-report -- release\/windows-smoke-report\.json/)
  assert.match(runbook, /--validate-ready --require-signed/)

  for (const check of REQUIRED_CHECKS) {
    assert.equal(runbook.includes(`\`${check.id}\``), true)
    assert.match(runbook, new RegExp(escapeRegExp(check.label)))
    assert.match(runbook, new RegExp(escapeRegExp(CHECK_GUIDANCE[check.id])))
  }
})

test('createRunbook rejects structurally invalid reports', () => {
  const report = createPendingReport()
  report.checks = report.checks.filter((check) => check.id !== 'launch')

  assert.throws(
    () => createRunbook({ report, reportPath: 'release/windows-smoke-report.json' }),
    /Cannot create Windows smoke runbook.*missing required check: launch/
  )
})

test('writeRunbook writes markdown with a trailing newline', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-windows-smoke-runbook-'))
  const outputPath = path.join(tempDir, 'nested', 'windows-smoke-runbook.md')

  const writtenPath = writeRunbook({ content: '# Runbook\n', outputPath })
  const raw = fs.readFileSync(writtenPath, 'utf-8')

  assert.equal(writtenPath, outputPath)
  assert.equal(raw, '# Runbook\n')
})
