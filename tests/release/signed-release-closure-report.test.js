const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { REQUIRED_CHECKS: WINDOWS_CHECKS } = require('../../scripts/validate-windows-smoke-report')
const { REQUIRED_CHECKS: PICKER_CHECKS } = require('../../scripts/validate-desktop-picker-smoke-report')
const { REQUIRED_CHECKS: RUNTIME_CHECKS, BUILT_IN_PACKS } = require('../../scripts/validate-packaged-runtime-smoke-report')
const { createRunbook: createDesktopPickerRunbook } = require('../../scripts/create-desktop-picker-smoke-runbook')
const {
  createDesktopPickerEvidenceSummary,
  writeSummary: writeDesktopPickerEvidenceSummary
} = require('../../scripts/create-desktop-picker-evidence-summary')
const {
  createDesktopPickerArchiveManifest,
  writeManifest: writeDesktopPickerArchiveManifest
} = require('../../scripts/create-desktop-picker-archive-manifest')
const {
  createSignedReleaseClosureReport,
  parseArgs,
  renderMarkdown,
  runSignedReleaseClosureReport
} = require('../../scripts/create-signed-release-closure-report')
const { createReleaseEvidenceArchiveManifest } = require('../../scripts/create-release-evidence-archive-manifest')

const fixedNow = () => new Date('2026-06-16T04:00:00.000Z')

const createChecks = (checks, status = 'pending') => checks.map((check) => ({
  id: check.id,
  status,
  evidence: status === 'pass' ? `Evidence for ${check.id}` : '',
  notes: check.label
}))

const createWindowsSmokeReport = ({ signed = false, status = 'pending' } = {}) => ({
  platform: 'win32',
  arch: 'x64',
  generatedAt: '2026-06-16T04:00:00.000Z',
  environment: {
    windowsVersion: 'Windows 11 23H2',
    machine: 'windows-release-vm',
    runner: 'manual release evidence closure',
    evidence: 'windows evidence transcript'
  },
  artifact: {
    version: '1.0.1-rc.2',
    installer: 'OpenPet-1.0.1-rc.2-win32-x64.exe',
    zip: 'OpenPet-1.0.1-rc.2-win32-x64.zip',
    latestYml: 'latest.yml',
    signed,
    authenticodeStatus: signed ? 'Valid' : 'NotSigned',
    authenticodeEvidence: signed ? 'Status : Valid' : 'Status : NotSigned',
    signatureEvidence: signed ? 'Status : Valid' : ''
  },
  checks: createChecks(WINDOWS_CHECKS, status)
})

const createPickerReport = ({ platform = 'win32', signed = false, status = 'pending' } = {}) => ({
  platform,
  arch: platform === 'win32' ? 'x64' : 'arm64',
  generatedAt: '2026-06-16T04:00:00.000Z',
  environment: {
    osRelease: platform === 'win32' ? 'Windows 11' : 'Darwin 25.0.0',
    machine: `${platform}-picker-host`,
    runner: 'manual picker smoke',
    evidence: 'picker transcript'
  },
  artifact: {
    version: '1.0.1-rc.2',
    appPath: platform === 'darwin' ? 'mac-arm64/OpenPet.app' : '',
    installer: platform === 'win32' ? 'OpenPet-1.0.1-rc.2-win32-x64.exe' : '',
    zip: platform === 'darwin' ? 'OpenPet-1.0.1-rc.2-mac.zip' : 'OpenPet-1.0.1-rc.2-win32-x64.zip',
    signed,
    signatureStatus: platform === 'darwin' && signed ? 'Valid' : 'NotSigned',
    signatureEvidence: platform === 'darwin' && signed ? 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement' : '',
    authenticodeStatus: platform === 'win32' && signed ? 'Valid' : 'NotSigned',
    authenticodeEvidence: platform === 'win32' && signed ? 'Status : Valid' : ''
  },
  checks: createChecks(PICKER_CHECKS, status)
})

const createRuntimeReport = ({ platform = 'win32', signed = false, status = 'pending' } = {}) => ({
  platform,
  arch: platform === 'win32' ? 'x64' : 'arm64',
  generatedAt: '2026-06-16T04:00:00.000Z',
  environment: {
    osRelease: platform === 'win32' ? 'Windows 11' : 'Darwin 25.0.0',
    machine: `${platform}-runtime-host`,
    runner: 'manual runtime smoke',
    evidence: 'runtime transcript'
  },
  artifact: {
    version: '1.0.1-rc.2',
    appPath: platform === 'darwin' ? 'mac-arm64/OpenPet.app' : '',
    installer: platform === 'win32' ? 'OpenPet-1.0.1-rc.2-win32-x64.exe' : '',
    zip: platform === 'darwin' ? 'OpenPet-1.0.1-rc.2-mac.zip' : 'OpenPet-1.0.1-rc.2-win32-x64.zip',
    signed,
    signatureStatus: platform === 'darwin' && signed ? 'Valid' : 'NotSigned',
    signatureEvidence: platform === 'darwin' && signed ? 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement' : '',
    authenticodeStatus: platform === 'win32' && signed ? 'Valid' : 'NotSigned',
    authenticodeEvidence: platform === 'win32' && signed ? 'Status : Valid' : ''
  },
  fixtures: {
    builtInPacks: Object.fromEntries(BUILT_IN_PACKS.map((packId) => [packId, packId === 'legacy-cat' ? 'cat_anime/' : `assets/pet-packs/${packId}/`])),
    pluginPackage: 'fixtures/focus.openpet-plugin.zip',
    petPackZip: 'fixtures/doro.codex-pet.zip',
    invalidPackage: 'fixtures/invalid.zip'
  },
  linkedEvidence: {
    desktopPickerSmokeReport: 'desktop-picker-smoke-report.json',
    desktopPickerSmokeRunbook: 'desktop-picker-smoke-runbook.md',
    screenshots: status === 'pass' ? ['screenshots/runtime.png'] : [],
    recordings: []
  },
  checks: createChecks(RUNTIME_CHECKS, status)
})

const writeJson = (filePath, value) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const createDesktopPickerArchive = ({ archiveDir, report, reportPath, signed, tamperReportPath = false }) => {
  const runbookPath = path.join(archiveDir, 'desktop-picker-smoke-runbook.md')
  fs.writeFileSync(runbookPath, `${createDesktopPickerRunbook({ report, reportPath, generatedAt: fixedNow() })}\n`)

  const evidenceDir = path.join(archiveDir, 'desktop-picker-evidence')
  fs.mkdirSync(evidenceDir)
  fs.writeFileSync(path.join(evidenceDir, 'environment.txt'), 'Desktop picker host evidence\n')
  fs.writeFileSync(path.join(evidenceDir, 'manual-checks.md'), 'Manual picker checks reviewed\n')
  fs.writeFileSync(path.join(evidenceDir, 'notes.txt'), 'Picker evidence notes\n')
  fs.writeFileSync(path.join(evidenceDir, 'signature.txt'), signed ? 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement\n' : 'code object is not signed at all\n')

  const summary = createDesktopPickerEvidenceSummary({
    evidenceDir,
    reportPath,
    requireSigned: signed,
    now: fixedNow
  })
  const summaryPath = path.join(archiveDir, 'desktop-picker-evidence-summary.md')
  writeDesktopPickerEvidenceSummary({ summary, outputPath: summaryPath })

  const manifest = createDesktopPickerArchiveManifest({
    archiveDir,
    reportPath: tamperReportPath ? path.join(archiveDir, 'other-desktop-picker-smoke-report.json') : reportPath,
    evidenceDir,
    runbookPath,
    summaryPath,
    requireSigned: signed,
    now: fixedNow
  })
  writeDesktopPickerArchiveManifest({
    manifest,
    outputPath: path.join(archiveDir, 'desktop-picker-archive-manifest.json')
  })
}

const createArchive = ({
  signed = false,
  status = 'pending',
  pickerPlatform = 'win32',
  runtimePlatform = 'win32',
  includeMacosEvidence = true,
  includeDesktopPickerArchiveManifest = true,
  tamperPickerArchiveReportPath = false
} = {}) => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-signed-release-closure-'))
  writeJson(path.join(archiveDir, 'windows-smoke-report.json'), createWindowsSmokeReport({ signed, status }))
  const pickerReport = createPickerReport({ platform: pickerPlatform, signed, status })
  const pickerReportPath = path.join(archiveDir, 'desktop-picker-smoke-report.json')
  writeJson(pickerReportPath, pickerReport)
  writeJson(path.join(archiveDir, 'packaged-runtime-smoke-report.json'), createRuntimeReport({ platform: runtimePlatform, signed, status }))
  if (includeDesktopPickerArchiveManifest) {
    createDesktopPickerArchive({
      archiveDir,
      report: pickerReport,
      reportPath: pickerReportPath,
      signed,
      tamperReportPath: tamperPickerArchiveReportPath
    })
  }
  if (includeMacosEvidence) {
    fs.writeFileSync(path.join(archiveDir, 'macos-codesign.txt'), signed ? 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement\n' : 'code object is not signed at all\n')
    fs.writeFileSync(path.join(archiveDir, 'macos-notarization.txt'), signed ? 'status: Accepted\nid: notary\n' : 'status: NotSubmitted\n')
    fs.writeFileSync(path.join(archiveDir, 'macos-gatekeeper.txt'), signed ? 'release/mac-arm64/OpenPet.app: accepted\nsource=Notarized Developer ID\n' : 'rejected\n')
  }
  return archiveDir
}

test('parseArgs accepts closure report inputs and outputs', () => {
  const options = parseArgs([
    '--archive-dir', 'archive',
    '--manifest', 'archive/manifest.json',
    '--manifest-output', 'archive/generated-manifest.json',
    '--windows-smoke-report', 'archive/windows.json',
    '--desktop-picker-report', 'archive/picker.json',
    '--desktop-picker-archive-manifest', 'archive/picker-archive.json',
    '--packaged-runtime-report', 'archive/runtime.json',
    '--macos-codesign', 'archive/codesign.txt',
    '--macos-notarization', 'archive/notary.txt',
    '--macos-gatekeeper', 'archive/spctl.txt',
    '--output', 'archive/report.md',
    '--json-output', 'archive/report.json',
    '--fail-on-not-ready',
    '--json'
  ])

  assert.equal(options.archiveDir, 'archive')
  assert.equal(options.manifestPath, 'archive/manifest.json')
  assert.equal(options.manifestOutput, 'archive/generated-manifest.json')
  assert.equal(options.windowsSmokeReportPath, 'archive/windows.json')
  assert.equal(options.desktopPickerReportPath, 'archive/picker.json')
  assert.equal(options.desktopPickerArchiveManifestPath, 'archive/picker-archive.json')
  assert.equal(options.packagedRuntimeReportPath, 'archive/runtime.json')
  assert.equal(options.macosCodesignPath, 'archive/codesign.txt')
  assert.equal(options.macosNotarizationPath, 'archive/notary.txt')
  assert.equal(options.macosGatekeeperPath, 'archive/spctl.txt')
  assert.equal(options.outputPath, 'archive/report.md')
  assert.equal(options.jsonOutputPath, 'archive/report.json')
  assert.equal(options.failOnNotReady, true)
  assert.equal(options.json, true)
})

test('parseArgs rejects missing values and unexpected flags', () => {
  assert.throws(() => parseArgs(['--archive-dir']), /--archive-dir requires a value/)
  assert.throws(() => parseArgs(['--unknown']), /Unexpected argument/)
})

test('closure report keeps unsigned pending archives not release-ready', () => {
  const archiveDir = createArchive({ signed: false, status: 'pending', runtimePlatform: 'darwin' })
  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })
  const report = createSignedReleaseClosureReport({ manifest, now: fixedNow })

  assert.equal(report.releaseReady, false)
  assert.equal(report.claims.officialDesktopRelease.status, 'not-ready')
  assert.match(report.claims.officialDesktopRelease.claim, /Do not claim official/)
  assert.match(report.claims.macos.blockers.join('\n'), /macOS codesign evidence/)
  assert.match(report.claims.windows.blockers.join('\n'), /Windows smoke evidence/)
  assert.match(report.smartScreen.claim, /observed result only/)
})

test('closure report returns the shared signed release closure contract shape', () => {
  const archiveDir = createArchive({ signed: false, status: 'pending', runtimePlatform: 'darwin' })
  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })
  const report = createSignedReleaseClosureReport({ manifest, now: fixedNow })

  assert.equal(report.schemaVersion, 1)
  assert.equal(report.generatedAt, fixedNow().toISOString())
  assert.equal(typeof report.releaseReady, 'boolean')
  assert.deepEqual(report.manifest, {
    ok: manifest.ok,
    releaseReady: manifest.releaseReady,
    requireSigned: manifest.requireSigned,
    archiveDir: manifest.archive.archiveDir,
    outputPath: manifest.archive.outputPath
  })
  for (const claim of [
    report.claims.officialDesktopRelease,
    report.claims.macos,
    report.claims.windows
  ]) {
    assert.equal(typeof claim.key, 'string')
    assert.ok(['ready', 'not-ready'].includes(claim.status))
    assert.equal(typeof claim.claim, 'string')
    assert.ok(Array.isArray(claim.blockers))
  }
  assert.ok(['document-observed-result', 'not-proven'].includes(report.smartScreen.status))
  assert.equal(typeof report.smartScreen.claim, 'string')
  assert.ok(Array.isArray(report.nextActions))
})

test('closure report requires Windows-specific picker and runtime evidence', () => {
  const archiveDir = createArchive({
    signed: true,
    status: 'pass',
    pickerPlatform: 'darwin',
    runtimePlatform: 'darwin'
  })
  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })
  const report = createSignedReleaseClosureReport({ manifest, now: fixedNow })

  assert.equal(report.claims.macos.status, 'ready')
  assert.equal(report.claims.windows.status, 'not-ready')
  assert.match(report.claims.windows.blockers.join('\n'), /not win32/)
  assert.equal(report.releaseReady, false)
})

test('closure report requires the desktop picker archive manifest evidence chain', () => {
  const archiveDir = createArchive({
    signed: true,
    status: 'pass',
    pickerPlatform: 'win32',
    runtimePlatform: 'win32',
    tamperPickerArchiveReportPath: true
  })
  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })
  const report = createSignedReleaseClosureReport({ manifest, now: fixedNow })

  assert.equal(report.claims.windows.status, 'not-ready')
  assert.match(report.claims.windows.blockers.join('\n'), /desktopPickerArchiveManifest references a different desktop picker report/)
  assert.equal(report.releaseReady, false)
})

test('closure report keeps official desktop not-ready when a signed archive only proves Windows runtime', () => {
  const archiveDir = createArchive({ signed: true, status: 'pass', pickerPlatform: 'win32', runtimePlatform: 'win32' })
  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })
  const report = createSignedReleaseClosureReport({ manifest, now: fixedNow })

  assert.equal(report.releaseReady, false)
  assert.equal(report.claims.officialDesktopRelease.status, 'not-ready')
  assert.equal(report.claims.macos.status, 'not-ready')
  assert.equal(report.claims.windows.status, 'ready')
  assert.match(report.claims.macos.blockers.join('\n'), /not darwin/)
  assert.match(report.claims.officialDesktopRelease.blockers.join('\n'), /not darwin/)
})

test('renderMarkdown exposes claim status and blockers', () => {
  const archiveDir = createArchive({ signed: false, status: 'pending' })
  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })
  const report = createSignedReleaseClosureReport({ manifest, now: fixedNow })
  const markdown = renderMarkdown(report)

  assert.match(markdown, /^# Signed Release Evidence Closure/)
  assert.match(markdown, /Overall release-ready: no/)
  assert.match(markdown, /officialDesktopRelease/)
  assert.match(markdown, /Do not claim official signed desktop release readiness/)
  assert.match(markdown, /SmartScreen/)
})

test('runSignedReleaseClosureReport writes markdown and json without failing pending archives', () => {
  const archiveDir = createArchive({ signed: false, status: 'pending' })
  const outputPath = path.join(archiveDir, 'closure.md')
  const jsonOutputPath = path.join(archiveDir, 'closure.json')
  const manifestOutput = path.join(archiveDir, 'manifest.json')

  const result = runSignedReleaseClosureReport({
    options: {
      archiveDir,
      manifestPath: '',
      manifestOutput,
      windowsSmokeReportPath: null,
      desktopPickerReportPath: null,
      packagedRuntimeReportPath: null,
      macosCodesignPath: null,
      macosNotarizationPath: null,
      macosGatekeeperPath: null,
      outputPath,
      jsonOutputPath
    },
    now: fixedNow
  })

  assert.equal(result.report.releaseReady, false)
  assert.equal(fs.existsSync(outputPath), true)
  assert.equal(fs.existsSync(jsonOutputPath), true)
  assert.equal(fs.existsSync(manifestOutput), true)
  assert.match(fs.readFileSync(outputPath, 'utf-8'), /Overall release-ready: no/)
  assert.equal(JSON.parse(fs.readFileSync(jsonOutputPath, 'utf-8')).releaseReady, false)
})

test('cli fail-on-not-ready exits non-zero after writing the audit report', () => {
  const archiveDir = createArchive({ signed: false, status: 'pending' })
  const outputPath = path.join(archiveDir, 'closure.md')
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', '..', 'scripts', 'create-signed-release-closure-report.js'),
    '--archive-dir', archiveDir,
    '--output', outputPath,
    '--fail-on-not-ready'
  ], { encoding: 'utf-8' })

  assert.equal(result.status, 1)
  assert.match(result.stdout, /Release-ready: no/)
  assert.equal(fs.existsSync(outputPath), true)
  assert.match(fs.readFileSync(outputPath, 'utf-8'), /Do not claim official signed desktop release readiness/)
})
