const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createRunbook } = require('../../scripts/create-desktop-picker-smoke-runbook')
const { REQUIRED_CHECKS } = require('../../scripts/validate-desktop-picker-smoke-report')
const {
  createDesktopPickerEvidenceSummary,
  writeSummary
} = require('../../scripts/create-desktop-picker-evidence-summary')
const {
  createDesktopPickerArchiveManifest,
  parseArgs,
  resolveArchivePaths,
  writeManifest
} = require('../../scripts/create-desktop-picker-archive-manifest')

const fixedNow = () => new Date('2026-06-17T00:00:00.000Z')

const createReport = ({ platform = 'darwin', signed = false, status = 'pending' } = {}) => ({
  platform,
  arch: platform === 'darwin' ? 'arm64' : 'x64',
  generatedAt: '2026-06-17T00:00:00.000Z',
  environment: {
    osRelease: platform === 'darwin' ? 'Darwin 25.0.0' : 'Windows 11 23H2',
    machine: `${platform}-picker-host`,
    runner: 'manual picker validation',
    evidence: 'desktop-picker-evidence/environment.txt'
  },
  artifact: {
    version: '1.0.1-rc.2',
    appPath: platform === 'darwin' ? 'release/mac-arm64/OpenPet.app' : '',
    installer: platform === 'win32' ? 'OpenPet-1.0.1-rc.2-win32-x64.exe' : 'OpenPet-1.0.1-rc.2-mac.dmg',
    zip: platform === 'darwin' ? 'OpenPet-1.0.1-rc.2-mac.zip' : 'OpenPet-1.0.1-rc.2-win32-x64.zip',
    latestYml: platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml',
    signed,
    signatureStatus: platform === 'darwin' ? (signed ? 'Valid' : 'NotSigned') : '',
    signatureEvidence: platform === 'darwin' ? 'desktop-picker-evidence/signature.txt' : '',
    authenticodeStatus: platform === 'win32' ? (signed ? 'Valid' : 'NotSigned') : '',
    authenticodeEvidence: platform === 'win32' ? 'desktop-picker-evidence/authenticode.txt' : ''
  },
  fixture: {
    pluginPackage: 'fixtures/focus-timer.openpet-plugin.zip',
    frameFolder: 'fixtures/wave-frames',
    petPack: 'fixtures/doro.pet-pack'
  },
  checks: REQUIRED_CHECKS.map((check) => ({
    id: check.id,
    status,
    evidence: status === 'pass' ? `Evidence for ${check.id}` : '',
    notes: check.label
  }))
})

const createArchive = ({ platform = 'darwin', signed = false, status = 'pending', summaryFormat = 'markdown' } = {}) => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-desktop-picker-archive-'))
  const evidenceDir = path.join(archiveDir, 'desktop-picker-evidence')
  fs.mkdirSync(evidenceDir)

  const report = createReport({ platform, signed, status })
  const reportPath = path.join(archiveDir, 'desktop-picker-smoke-report.json')
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const runbook = createRunbook({ report, reportPath, generatedAt: fixedNow() })
  fs.writeFileSync(path.join(archiveDir, 'desktop-picker-smoke-runbook.md'), `${runbook}\n`)

  const files = {
    'environment.txt': `CollectedAt: 2026-06-17T00:00:00.000Z\nPlatform: ${platform}`,
    'manual-checks.md': '# Manual Checks\n- picker smoke completed',
    'notes.txt': 'Picker validation notes',
    'plugin-review.txt': 'Plugin review panel captured',
    'invalid-package.txt': 'Invalid package error captured'
  }

  if (platform === 'darwin') {
    files['signature.txt'] = signed
      ? 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement\n'
      : 'code object is not signed at all\n'
  } else {
    files['authenticode.txt'] = signed
      ? 'SignerCertificate : OpenPet\nStatus : Valid\n'
      : 'Status : NotSigned\n'
  }

  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(evidenceDir, fileName), content)
  }

  const summary = createDesktopPickerEvidenceSummary({ evidenceDir, reportPath, requireSigned: signed, now: fixedNow })
  const summaryPath = path.join(
    archiveDir,
    summaryFormat === 'json' ? 'desktop-picker-evidence-summary.json' : 'desktop-picker-evidence-summary.md'
  )
  writeSummary({ summary, outputPath: summaryPath, json: summaryFormat === 'json' })

  return { archiveDir }
}

test('parseArgs accepts archive inputs and output controls', () => {
  const options = parseArgs([
    '--archive-dir', 'archive',
    '--report', 'archive/report.json',
    '--evidence-dir', 'archive/evidence',
    '--runbook', 'archive/runbook.md',
    '--summary', 'archive/summary.json',
    '--output', 'archive/manifest.json',
    '--require-signed',
    '--json'
  ])

  assert.equal(options.archiveDir, 'archive')
  assert.equal(options.reportPath, 'archive/report.json')
  assert.equal(options.evidenceDir, 'archive/evidence')
  assert.equal(options.runbookPath, 'archive/runbook.md')
  assert.equal(options.summaryPath, 'archive/summary.json')
  assert.equal(options.outputPath, 'archive/manifest.json')
  assert.equal(options.requireSigned, true)
  assert.equal(options.json, true)
})

test('parseArgs rejects incomplete and unexpected arguments', () => {
  assert.throws(() => parseArgs(['--archive-dir']), /--archive-dir requires a value/)
  assert.throws(() => parseArgs(['--wat']), /Unexpected argument/)
})

test('resolveArchivePaths defaults to the desktop picker archive shape', () => {
  const paths = resolveArchivePaths({ archiveDir: 'archive' })

  assert.equal(paths.reportPath, path.resolve('archive/desktop-picker-smoke-report.json'))
  assert.equal(paths.evidenceDir, path.resolve('archive/desktop-picker-evidence'))
  assert.equal(paths.runbookPath, path.resolve('archive/desktop-picker-smoke-runbook.md'))
  assert.equal(paths.summaryPath, path.resolve('archive/desktop-picker-evidence-summary.md'))
  assert.equal(paths.outputPath, path.resolve('archive/desktop-picker-archive-manifest.json'))
})

test('createDesktopPickerArchiveManifest records a complete pending archive without readiness claim', () => {
  const { archiveDir } = createArchive()

  const manifest = createDesktopPickerArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, true)
  assert.equal(manifest.releaseReady, false)
  assert.equal(manifest.files.length, 3)
  assert.equal(manifest.summary.matchesComputedSummary, true)
  assert.equal(manifest.report.structuralValidation.ok, true)
  assert.equal(manifest.report.readinessValidation.ok, false)
})

test('createDesktopPickerArchiveManifest fails when required archive files are missing', () => {
  const { archiveDir } = createArchive()
  fs.unlinkSync(path.join(archiveDir, 'desktop-picker-smoke-runbook.md'))

  const manifest = createDesktopPickerArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.releaseReady, false)
  assert.match(manifest.errors.join('\n'), /missing archive file: .*desktop-picker-smoke-runbook\.md/)
})

test('createDesktopPickerArchiveManifest fails when summary does not match recomputed evidence state', () => {
  const { archiveDir } = createArchive()
  const summaryPath = path.join(archiveDir, 'desktop-picker-evidence-summary.md')
  fs.writeFileSync(summaryPath, '# Desktop Picker Evidence Summary\n\nDesktop picker smoke ready: yes\n')

  const manifest = createDesktopPickerArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.match(manifest.errors.join('\n'), /summary Markdown must include Desktop picker smoke ready: no/)
})

test('createDesktopPickerArchiveManifest fails when Markdown summary has stale evidence hashes', () => {
  const { archiveDir } = createArchive()
  fs.writeFileSync(path.join(archiveDir, 'desktop-picker-evidence', 'notes.txt'), 'Changed after summary creation\n')

  const manifest = createDesktopPickerArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.match(manifest.errors.join('\n'), /summary Markdown is missing recomputed evidence hash for notes\.txt/)
})

test('createDesktopPickerArchiveManifest fails when JSON summary has stale evidence hashes', () => {
  const { archiveDir } = createArchive({ summaryFormat: 'json' })
  fs.writeFileSync(path.join(archiveDir, 'desktop-picker-evidence', 'notes.txt'), 'Changed after JSON summary creation\n')

  const manifest = createDesktopPickerArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.match(manifest.errors.join('\n'), /summary JSON evidence files do not match recomputed evidence state/)
})

test('createDesktopPickerArchiveManifest fails when the evidence directory is missing', () => {
  const { archiveDir } = createArchive()
  fs.rmSync(path.join(archiveDir, 'desktop-picker-evidence'), { recursive: true, force: true })

  const manifest = createDesktopPickerArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.releaseReady, false)
  assert.match(manifest.errors.join('\n'), /evidence directory is missing/)
})

test('createDesktopPickerArchiveManifest can mark signed all-pass archives as ready', () => {
  const { archiveDir } = createArchive({ signed: true, status: 'pass' })

  const manifest = createDesktopPickerArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.equal(manifest.ok, true)
  assert.equal(manifest.releaseReady, true)
  assert.equal(manifest.report.readinessValidation.summary.officialReady, true)
})

test('writeManifest writes a pretty JSON desktop picker archive manifest', () => {
  const { archiveDir } = createArchive()
  const outputPath = path.join(archiveDir, 'manifest', 'desktop-picker-archive-manifest.json')
  const manifest = createDesktopPickerArchiveManifest({ archiveDir, outputPath, now: fixedNow })

  assert.equal(writeManifest({ manifest, outputPath }), outputPath)
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf-8')).releaseReady, false)
})
