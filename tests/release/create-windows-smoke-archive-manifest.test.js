const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createCollector, createManualChecklist, createCommandNotes } = require('../../scripts/create-windows-smoke-collector')
const { createRunbook } = require('../../scripts/create-windows-smoke-runbook')
const { REQUIRED_CHECKS } = require('../../scripts/validate-windows-smoke-report')
const {
  createWindowsSmokeEvidenceSummary,
  renderMarkdownSummary,
  writeSummary
} = require('../../scripts/create-windows-smoke-evidence-summary')
const {
  createWindowsSmokeArchiveManifest,
  parseArgs,
  resolveArchivePaths,
  writeManifest
} = require('../../scripts/create-windows-smoke-archive-manifest')

const fixedNow = () => new Date('2026-06-14T00:00:00.000Z')

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
    blockmaps: ['OpenPet-1.0.1-rc.1-win32-x64.exe.blockmap'],
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

const createArchive = ({ signed = false, status = 'pending', summaryFormat = 'markdown' } = {}) => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-windows-smoke-archive-'))
  const evidenceDir = path.join(archiveDir, 'windows-smoke-evidence')
  fs.mkdirSync(evidenceDir)

  const report = createReport({ signed, status })
  const reportPath = path.join(archiveDir, 'windows-smoke-report.json')
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const runbook = createRunbook({ report, reportPath, generatedAt: fixedNow() })
  fs.writeFileSync(path.join(archiveDir, 'windows-smoke-runbook.md'), `${runbook}\n`)

  const collector = createCollector({ report, reportPath, generatedAt: fixedNow() })
  fs.writeFileSync(path.join(archiveDir, 'windows-smoke-collector.ps1'), `${collector}\n`)

  const files = {
    'environment.txt': 'CollectedAt: 2026-06-14T00:00:00.000Z\nComputerName: WIN-SMOKE',
    'authenticode.txt': signed ? 'SignerCertificate : OpenPet\nStatus : Valid\n' : 'Status : NotSigned\n',
    'process.txt': 'Name : OpenPet\nId : 42',
    'install-registry.txt': 'DisplayName : OpenPet\nDisplayVersion : 1.0.1-rc.1',
    'manual-checks.md': createManualChecklist(),
    'update-report-commands.md': createCommandNotes({ reportFileName: 'windows-smoke-report.json' })
  }
  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(evidenceDir, fileName), content)
  }

  const summary = createWindowsSmokeEvidenceSummary({ evidenceDir, reportPath, requireSigned: signed, now: fixedNow })
  const summaryPath = path.join(archiveDir, summaryFormat === 'json' ? 'windows-smoke-evidence-summary.json' : 'windows-smoke-evidence-summary.md')
  writeSummary({ summary, outputPath: summaryPath, json: summaryFormat === 'json' })

  return { archiveDir, evidenceDir, reportPath, summaryPath }
}

test('parseArgs accepts archive paths, signing, and json flags', () => {
  const options = parseArgs([
    '--archive-dir',
    'archive',
    '--report',
    'archive/report.json',
    '--evidence-dir',
    'archive/evidence',
    '--runbook',
    'archive/runbook.md',
    '--collector',
    'archive/collector.ps1',
    '--summary',
    'archive/summary.json',
    '--output',
    'archive/manifest.json',
    '--require-signed',
    '--json'
  ])

  assert.equal(options.archiveDir, 'archive')
  assert.equal(options.reportPath, 'archive/report.json')
  assert.equal(options.evidenceDir, 'archive/evidence')
  assert.equal(options.runbookPath, 'archive/runbook.md')
  assert.equal(options.collectorPath, 'archive/collector.ps1')
  assert.equal(options.summaryPath, 'archive/summary.json')
  assert.equal(options.outputPath, 'archive/manifest.json')
  assert.equal(options.requireSigned, true)
  assert.equal(options.json, true)
})

test('parseArgs rejects incomplete and unexpected arguments', () => {
  assert.throws(() => parseArgs(['--archive-dir']), /--archive-dir requires a value/)
  assert.throws(() => parseArgs(['--wat']), /Unexpected argument/)
})

test('resolveArchivePaths defaults to the standard archive shape', () => {
  const paths = resolveArchivePaths({ archiveDir: 'archive' })

  assert.equal(paths.reportPath, path.resolve('archive/windows-smoke-report.json'))
  assert.equal(paths.evidenceDir, path.resolve('archive/windows-smoke-evidence'))
  assert.equal(paths.runbookPath, path.resolve('archive/windows-smoke-runbook.md'))
  assert.equal(paths.collectorPath, path.resolve('archive/windows-smoke-collector.ps1'))
  assert.equal(paths.summaryPath, path.resolve('archive/windows-smoke-evidence-summary.md'))
  assert.equal(paths.outputPath, path.resolve('archive/windows-smoke-archive-manifest.json'))
})

test('createWindowsSmokeArchiveManifest records a complete pending archive without readiness claim', () => {
  const { archiveDir } = createArchive()

  const manifest = createWindowsSmokeArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, true)
  assert.equal(manifest.releaseReady, false)
  assert.equal(manifest.files.length, 4)
  assert.equal(manifest.evidence.files.length, 6)
  assert.equal(manifest.summary.matchesComputedSummary, true)
  assert.equal(manifest.report.structuralValidation.ok, true)
  assert.equal(manifest.report.readinessValidation.ok, false)
  assert.match(manifest.files[0].sha256, /^[a-f0-9]{64}$/)
  assert.match(manifest.warnings.join('\n'), /cannot prove signed official readiness/)
})

test('createWindowsSmokeArchiveManifest validates JSON summaries too', () => {
  const { archiveDir } = createArchive({ summaryFormat: 'json' })

  const manifest = createWindowsSmokeArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, true)
  assert.equal(manifest.summary.format, 'json')
  assert.equal(manifest.summary.matchesComputedSummary, true)
})

test('createWindowsSmokeArchiveManifest fails when required archive files are missing', () => {
  const { archiveDir } = createArchive()
  fs.unlinkSync(path.join(archiveDir, 'windows-smoke-runbook.md'))

  const manifest = createWindowsSmokeArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.releaseReady, false)
  assert.match(manifest.errors.join('\n'), /missing archive file: .*windows-smoke-runbook\.md/)
})

test('createWindowsSmokeArchiveManifest fails when summary does not match recomputed evidence state', () => {
  const { archiveDir, summaryPath } = createArchive()
  const badSummary = renderMarkdownSummary({
    ...createWindowsSmokeEvidenceSummary({
      evidenceDir: path.join(archiveDir, 'windows-smoke-evidence'),
      reportPath: path.join(archiveDir, 'windows-smoke-report.json'),
      now: fixedNow
    }),
    releaseReady: true
  })
  fs.writeFileSync(summaryPath, badSummary)

  const manifest = createWindowsSmokeArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.match(manifest.errors.join('\n'), /summary Markdown must include Windows release-ready: no/)
})

test('createWindowsSmokeArchiveManifest requires signed evidence when requested', () => {
  const { archiveDir } = createArchive({ signed: false })

  const manifest = createWindowsSmokeArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.releaseReady, false)
  assert.match(manifest.errors.join('\n'), /authenticode\.txt must contain Authenticode evidence/)
  assert.match(manifest.errors.join('\n'), /artifact\.signed must be true/)
})

test('createWindowsSmokeArchiveManifest can mark signed all-pass archives as ready', () => {
  const { archiveDir } = createArchive({ signed: true, status: 'pass' })

  const manifest = createWindowsSmokeArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.equal(manifest.ok, true)
  assert.equal(manifest.releaseReady, true)
  assert.equal(manifest.evidence.signed, true)
  assert.equal(manifest.report.readinessValidation.summary.officialReady, true)
})

test('writeManifest writes a pretty JSON archive manifest', () => {
  const { archiveDir } = createArchive()
  const outputPath = path.join(archiveDir, 'manifest', 'archive-manifest.json')
  const manifest = createWindowsSmokeArchiveManifest({ archiveDir, outputPath, now: fixedNow })

  assert.equal(writeManifest({ manifest, outputPath }), outputPath)
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf-8')).releaseReady, false)
})
