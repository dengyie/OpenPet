const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createCollector,
  createCommandNotes,
  createManualChecklist,
  defaultOutputPath,
  parseArgs,
  writeCollector
} = require('../../scripts/create-windows-smoke-collector')
const { CHECK_GUIDANCE } = require('../../scripts/create-windows-smoke-runbook')
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
  const options = parseArgs(['release/windows-smoke-report.json', '--output', 'release/windows-smoke-collector.ps1'])

  assert.equal(options.reportPath, 'release/windows-smoke-report.json')
  assert.equal(options.outputPath, 'release/windows-smoke-collector.ps1')
})

test('parseArgs rejects missing values and unexpected arguments', () => {
  assert.throws(() => parseArgs(['report.json', '--output']), /--output requires a value/)
  assert.throws(() => parseArgs(['report.json', 'extra.json']), /Unexpected argument/)
})

test('defaultOutputPath writes the collector next to the report', () => {
  assert.equal(
    defaultOutputPath(path.join('release', 'windows-smoke-report.json')),
    path.resolve('release', 'windows-smoke-collector.ps1')
  )
})

test('createManualChecklist documents every required check and evidence guidance', () => {
  const checklist = createManualChecklist()

  assert.match(checklist, /# OpenPet Windows Smoke Manual Checklist/)
  for (const check of REQUIRED_CHECKS) {
    assert.match(checklist, new RegExp(escapeRegExp(`\`${check.id}\``)))
    assert.match(checklist, new RegExp(escapeRegExp(check.label)))
    assert.match(checklist, new RegExp(escapeRegExp(CHECK_GUIDANCE[check.id])))
  }
})

test('createCommandNotes keeps report updates evidence-first', () => {
  const notes = createCommandNotes({ reportFileName: 'windows-smoke-report.json' })

  assert.match(notes, /npm run update-windows-smoke-report -- windows-smoke-report\.json --set-env/)
  assert.match(notes, /authenticodeEvidence/)
  assert.match(notes, /Do not use these commands to mark checks as pass/)
  assert.doesNotMatch(notes, /--status pass/)
})

test('createCollector writes a PowerShell helper without claiming readiness', () => {
  const report = createPendingReport()
  const collector = createCollector({
    report,
    reportPath: path.resolve('release/windows-smoke-report.json'),
    generatedAt: new Date('2026-06-14T01:00:00.000Z')
  })

  assert.match(collector, /Collects local Windows evidence/)
  assert.match(collector, /Generated: 2026-06-14T01:00:00.000Z/)
  assert.match(collector, /Get-AuthenticodeSignature/)
  assert.match(collector, /manual-checks\.md/)
  assert.match(collector, /update-report-commands\.md/)
  assert.match(collector, /does not prove release readiness by itself/)
  assert.doesNotMatch(collector, /--status pass/)

  for (const check of REQUIRED_CHECKS) {
    assert.equal(collector.includes(`\`${check.id}\``), true)
  }
})

test('createCollector rejects structurally invalid reports', () => {
  const report = createPendingReport()
  report.checks = report.checks.filter((check) => check.id !== 'launch')

  assert.throws(
    () => createCollector({ report, reportPath: 'release/windows-smoke-report.json' }),
    /Cannot create Windows smoke collector.*missing required check: launch/
  )
})

test('writeCollector writes PowerShell with a trailing newline', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-windows-smoke-collector-'))
  const outputPath = path.join(tempDir, 'nested', 'windows-smoke-collector.ps1')

  const writtenPath = writeCollector({ content: 'Write-Host "ok"\n', outputPath })
  const raw = fs.readFileSync(writtenPath, 'utf-8')

  assert.equal(writtenPath, outputPath)
  assert.equal(raw, 'Write-Host "ok"\n')
})
