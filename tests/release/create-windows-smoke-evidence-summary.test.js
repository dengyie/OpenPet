const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createManualChecklist, createCommandNotes } = require('../../scripts/create-windows-smoke-collector')
const { REQUIRED_CHECKS } = require('../../scripts/validate-windows-smoke-report')
const {
  createWindowsSmokeEvidenceSummary,
  parseArgs,
  renderMarkdownSummary,
  writeSummary
} = require('../../scripts/create-windows-smoke-evidence-summary')

const createReport = ({ signed = false, status = 'pending' } = {}) => ({
  platform: 'win32',
  arch: 'x64',
  generatedAt: '2026-06-14T00:00:00.000Z',
  environment: {
    windowsVersion: 'Windows 11 23H2',
    machine: 'windows-smoke-vm',
    runner: 'manual validation',
    evidence: 'windows-smoke-evidence/environment.txt'
  },
  artifact: {
    version: '1.0.1-rc.1',
    installer: 'OpenPet-1.0.1-rc.1-win32-x64.exe',
    zip: 'OpenPet-1.0.1-rc.1-win32-x64.zip',
    latestYml: 'latest.yml',
    signed,
    authenticodeStatus: signed ? 'Valid' : 'NotSigned',
    authenticodeEvidence: 'windows-smoke-evidence/authenticode.txt'
  },
  checks: REQUIRED_CHECKS.map((check) => ({
    id: check.id,
    status,
    evidence: status === 'pass' ? `Evidence for ${check.id}` : '',
    notes: check.label
  }))
})

const createEvidenceDir = ({ authenticode = 'Status : NotSigned\n' } = {}) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-windows-smoke-summary-'))
  const evidenceDir = path.join(tempDir, 'windows-smoke-evidence')
  fs.mkdirSync(evidenceDir)

  const files = {
    'environment.txt': 'CollectedAt: 2026-06-14T00:00:00.000Z\nComputerName: WIN-SMOKE',
    'authenticode.txt': authenticode,
    'process.txt': 'Name : OpenPet\nId : 42',
    'install-registry.txt': 'DisplayName : OpenPet\nDisplayVersion : 1.0.1-rc.1',
    'manual-checks.md': createManualChecklist(),
    'update-report-commands.md': createCommandNotes({ reportFileName: 'windows-smoke-report.json' })
  }

  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(evidenceDir, fileName), content)
  }

  return { tempDir, evidenceDir }
}

test('parseArgs accepts evidence directory, report, signing, output, and json flags', () => {
  const options = parseArgs([
    '--evidence-dir',
    'windows-smoke-evidence',
    '--report',
    'windows-smoke-report.json',
    '--require-signed',
    '--output',
    'summary.md',
    '--json'
  ])

  assert.equal(options.evidenceDir, 'windows-smoke-evidence')
  assert.equal(options.reportPath, 'windows-smoke-report.json')
  assert.equal(options.requireSigned, true)
  assert.equal(options.outputPath, 'summary.md')
  assert.equal(options.json, true)
})

test('parseArgs defaults evidence directory and rejects ambiguous input', () => {
  assert.equal(parseArgs([]).evidenceDir, 'windows-smoke-evidence')
  assert.equal(parseArgs(['custom-evidence']).evidenceDir, 'custom-evidence')
  assert.throws(() => parseArgs(['one', '--evidence-dir', 'two']), /provided more than once/)
  assert.throws(() => parseArgs(['--report']), /--report requires a value/)
  assert.throws(() => parseArgs(['--wat']), /Unexpected argument/)
})

test('createWindowsSmokeEvidenceSummary records hashes and pending report state without readiness claim', () => {
  const { tempDir, evidenceDir } = createEvidenceDir()
  const reportPath = path.join(tempDir, 'windows-smoke-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(createReport(), null, 2))

  const summary = createWindowsSmokeEvidenceSummary({
    evidenceDir,
    reportPath,
    now: () => new Date('2026-06-14T00:00:00.000Z')
  })

  assert.equal(summary.ok, true)
  assert.equal(summary.releaseReady, false)
  assert.equal(summary.evidence.presentCount, 6)
  assert.equal(summary.report.checks.counts.pending, REQUIRED_CHECKS.length)
  assert.equal(summary.report.structuralValidation.ok, true)
  assert.equal(summary.report.readinessValidation.ok, false)
  assert.match(summary.evidence.presentFiles[0].sha256, /^[a-f0-9]{64}$/)
  assert.match(summary.warnings.join('\n'), /cannot prove signed official readiness/)
})

test('renderMarkdownSummary includes evidence metadata, report status, and readiness warning', () => {
  const { tempDir, evidenceDir } = createEvidenceDir()
  const reportPath = path.join(tempDir, 'windows-smoke-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(createReport(), null, 2))

  const summary = createWindowsSmokeEvidenceSummary({ evidenceDir, reportPath })
  const markdown = renderMarkdownSummary(summary)

  assert.match(markdown, /^# Windows Smoke Evidence Summary/)
  assert.match(markdown, /Windows release-ready: no/)
  assert.match(markdown, /Pending or unsigned evidence does not prove Windows release readiness/)
  assert.match(markdown, /\| environment\.txt \|/)
  assert.match(markdown, /\| pending \| 13 \|/)
  assert.match(markdown, /Readiness validation: no/)
})

test('createWindowsSmokeEvidenceSummary preserves require-signed gate', () => {
  const { tempDir, evidenceDir } = createEvidenceDir({ authenticode: 'Status : NotSigned\n' })
  const reportPath = path.join(tempDir, 'windows-smoke-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(createReport({ signed: false }), null, 2))

  const summary = createWindowsSmokeEvidenceSummary({ evidenceDir, reportPath, requireSigned: true })

  assert.equal(summary.ok, false)
  assert.equal(summary.releaseReady, false)
  assert.match(summary.errors.join('\n'), /Status : Valid/)
  assert.match(summary.errors.join('\n'), /artifact\.signed must be true/)
})

test('createWindowsSmokeEvidenceSummary can summarize signed all-pass evidence as ready', () => {
  const { tempDir, evidenceDir } = createEvidenceDir({ authenticode: 'SignerCertificate : OpenPet\nStatus : Valid\n' })
  const reportPath = path.join(tempDir, 'windows-smoke-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(createReport({ signed: true, status: 'pass' }), null, 2))

  const summary = createWindowsSmokeEvidenceSummary({ evidenceDir, reportPath, requireSigned: true })

  assert.equal(summary.ok, true)
  assert.equal(summary.releaseReady, true)
  assert.equal(summary.report.readinessValidation.summary.officialReady, true)
})

test('writeSummary writes markdown and json summaries', () => {
  const { tempDir, evidenceDir } = createEvidenceDir()
  const reportPath = path.join(tempDir, 'windows-smoke-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(createReport(), null, 2))
  const summary = createWindowsSmokeEvidenceSummary({ evidenceDir, reportPath })
  const markdownPath = path.join(tempDir, 'summary.md')
  const jsonPath = path.join(tempDir, 'summary.json')

  assert.equal(writeSummary({ summary, outputPath: markdownPath }), markdownPath)
  assert.equal(writeSummary({ summary, outputPath: jsonPath, json: true }), jsonPath)
  assert.match(fs.readFileSync(markdownPath, 'utf-8'), /Windows Smoke Evidence Summary/)
  assert.equal(JSON.parse(fs.readFileSync(jsonPath, 'utf-8')).releaseReady, false)
})
