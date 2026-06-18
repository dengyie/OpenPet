const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { REQUIRED_CHECKS } = require('../../scripts/validate-desktop-picker-smoke-report')
const {
  createDesktopPickerEvidenceSummary,
  parseArgs,
  renderMarkdownSummary,
  writeSummary
} = require('../../scripts/create-desktop-picker-evidence-summary')

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

const createEvidenceDir = ({ platform = 'darwin', signed = false } = {}) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-desktop-picker-summary-'))
  const evidenceDir = path.join(tempDir, 'desktop-picker-evidence')
  fs.mkdirSync(evidenceDir)

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

  return { tempDir, evidenceDir }
}

test('parseArgs accepts evidence directory, report, signing, output, and json flags', () => {
  const options = parseArgs([
    '--evidence-dir',
    'desktop-picker-evidence',
    '--report',
    'desktop-picker-smoke-report.json',
    '--require-signed',
    '--output',
    'summary.md',
    '--json'
  ])

  assert.equal(options.evidenceDir, 'desktop-picker-evidence')
  assert.equal(options.reportPath, 'desktop-picker-smoke-report.json')
  assert.equal(options.requireSigned, true)
  assert.equal(options.outputPath, 'summary.md')
  assert.equal(options.json, true)
})

test('parseArgs defaults evidence directory and rejects ambiguous input', () => {
  assert.equal(parseArgs([]).evidenceDir, 'desktop-picker-evidence')
  assert.equal(parseArgs(['custom-evidence']).evidenceDir, 'custom-evidence')
  assert.throws(() => parseArgs(['one', '--evidence-dir', 'two']), /provided more than once/)
  assert.throws(() => parseArgs(['--report']), /--report requires a value/)
  assert.throws(() => parseArgs(['--wat']), /Unexpected argument/)
})

test('createDesktopPickerEvidenceSummary records pending report state without readiness claim', () => {
  const { tempDir, evidenceDir } = createEvidenceDir()
  const reportPath = path.join(tempDir, 'desktop-picker-smoke-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(createReport(), null, 2))

  const summary = createDesktopPickerEvidenceSummary({
    evidenceDir,
    reportPath,
    now: () => new Date('2026-06-17T00:00:00.000Z')
  })

  assert.equal(summary.ok, true)
  assert.equal(summary.releaseReady, false)
  assert.equal(summary.evidence.presentCount >= 5, true)
  assert.equal(summary.report.checks.counts.pending, REQUIRED_CHECKS.length)
  assert.equal(summary.report.structuralValidation.ok, true)
  assert.equal(summary.report.readinessValidation.ok, false)
})

test('renderMarkdownSummary includes evidence metadata and readiness state', () => {
  const { tempDir, evidenceDir } = createEvidenceDir()
  const reportPath = path.join(tempDir, 'desktop-picker-smoke-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(createReport(), null, 2))

  const summary = createDesktopPickerEvidenceSummary({ evidenceDir, reportPath })
  const markdown = renderMarkdownSummary(summary)

  assert.match(markdown, /^# Desktop Picker Evidence Summary/)
  assert.match(markdown, /Desktop picker smoke ready: no/)
  assert.match(markdown, /Pending or unsigned evidence does not prove desktop picker smoke readiness/)
})

test('createDesktopPickerEvidenceSummary can summarize signed all-pass evidence as ready', () => {
  const { tempDir, evidenceDir } = createEvidenceDir({ signed: true })
  const reportPath = path.join(tempDir, 'desktop-picker-smoke-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(createReport({ signed: true, status: 'pass' }), null, 2))

  const summary = createDesktopPickerEvidenceSummary({ evidenceDir, reportPath, requireSigned: true })

  assert.equal(summary.ok, true)
  assert.equal(summary.releaseReady, true)
  assert.equal(summary.report.readinessValidation.summary.officialReady, true)
})

test('createDesktopPickerEvidenceSummary preserves require-signed gate', () => {
  const { tempDir, evidenceDir } = createEvidenceDir({ signed: false })
  const reportPath = path.join(tempDir, 'desktop-picker-smoke-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(createReport({ signed: false, status: 'pass' }), null, 2))

  const summary = createDesktopPickerEvidenceSummary({ evidenceDir, reportPath, requireSigned: true })

  assert.equal(summary.ok, true)
  assert.equal(summary.releaseReady, false)
  assert.match(summary.report.readinessValidation.errors.join('\n'), /artifact\.signed must be true/)
})

test('writeSummary writes markdown and json summaries', () => {
  const { tempDir, evidenceDir } = createEvidenceDir()
  const reportPath = path.join(tempDir, 'desktop-picker-smoke-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(createReport(), null, 2))
  const summary = createDesktopPickerEvidenceSummary({ evidenceDir, reportPath })
  const markdownPath = path.join(tempDir, 'summary.md')
  const jsonPath = path.join(tempDir, 'summary.json')

  assert.equal(writeSummary({ summary, outputPath: markdownPath }), markdownPath)
  assert.equal(writeSummary({ summary, outputPath: jsonPath, json: true }), jsonPath)
  assert.match(fs.readFileSync(markdownPath, 'utf-8'), /Desktop Picker Evidence Summary/)
  assert.equal(JSON.parse(fs.readFileSync(jsonPath, 'utf-8')).releaseReady, false)
})
