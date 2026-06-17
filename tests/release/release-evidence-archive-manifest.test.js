const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { REQUIRED_CHECKS: WINDOWS_CHECKS } = require('../../scripts/validate-windows-smoke-report')
const { REQUIRED_CHECKS: PICKER_CHECKS } = require('../../scripts/validate-desktop-picker-smoke-report')
const { REQUIRED_CHECKS: RUNTIME_CHECKS, BUILT_IN_PACKS } = require('../../scripts/validate-packaged-runtime-smoke-report')
const { createRunbook: createDesktopPickerRunbook } = require('../../scripts/create-desktop-picker-smoke-runbook')
const { createRunbook: createWindowsSmokeRunbook } = require('../../scripts/create-windows-smoke-runbook')
const {
  createDesktopPickerEvidenceSummary,
  writeSummary: writeDesktopPickerEvidenceSummary
} = require('../../scripts/create-desktop-picker-evidence-summary')
const {
  createWindowsSmokeEvidenceSummary,
  writeSummary: writeWindowsSmokeEvidenceSummary
} = require('../../scripts/create-windows-smoke-evidence-summary')
const {
  createDesktopPickerArchiveManifest,
  writeManifest: writeDesktopPickerArchiveManifest
} = require('../../scripts/create-desktop-picker-archive-manifest')
const {
  createWindowsSmokeArchiveManifest,
  writeManifest: writeWindowsSmokeArchiveManifest
} = require('../../scripts/create-windows-smoke-archive-manifest')
const {
  createReleaseEvidenceArchiveManifest,
  macosEvidenceStatus,
  parseArgs,
  resolveArchivePaths,
  writeManifest
} = require('../../scripts/create-release-evidence-archive-manifest')

const fixedNow = () => new Date('2026-06-16T02:00:00.000Z')

const createChecks = (checks, status = 'pending') => checks.map((check) => ({
  id: check.id,
  status,
  evidence: status === 'pass' ? `Evidence for ${check.id}` : '',
  notes: check.label
}))

const createWindowsSmokeReport = ({ signed = false, status = 'pending' } = {}) => ({
  platform: 'win32',
  arch: 'x64',
  generatedAt: '2026-06-16T02:00:00.000Z',
  environment: {
    windowsVersion: 'Windows 11 23H2',
    machine: 'windows-release-vm',
    runner: 'manual release evidence archive',
    evidence: 'release evidence transcript'
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

const createDesktopPickerReport = ({ platform = 'darwin', signed = false, status = 'pending' } = {}) => ({
  platform,
  arch: platform === 'darwin' ? 'arm64' : 'x64',
  generatedAt: '2026-06-16T02:00:00.000Z',
  environment: {
    osRelease: platform === 'darwin' ? 'Darwin 25.0.0' : 'Windows 11',
    machine: `${platform}-release-host`,
    runner: 'manual picker smoke',
    evidence: 'picker evidence transcript'
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

const createPackagedRuntimeReport = ({ platform = 'darwin', signed = false, status = 'pending' } = {}) => ({
  platform,
  arch: platform === 'darwin' ? 'arm64' : 'x64',
  generatedAt: '2026-06-16T02:00:00.000Z',
  environment: {
    osRelease: platform === 'darwin' ? 'Darwin 25.0.0' : 'Windows 11',
    machine: `${platform}-runtime-host`,
    runner: 'manual runtime smoke',
    evidence: 'runtime evidence transcript'
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

const createWindowsSmokeArchive = ({ archiveDir, reportPath, signed, tamperReportPath = false }) => {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
  const runbookPath = path.join(archiveDir, 'windows-smoke-runbook.md')
  fs.writeFileSync(runbookPath, `${createWindowsSmokeRunbook({ report, reportPath, generatedAt: fixedNow() })}\n`)

  const evidenceDir = path.join(archiveDir, 'windows-smoke-evidence')
  fs.mkdirSync(evidenceDir)
  fs.writeFileSync(path.join(evidenceDir, 'environment.txt'), 'Windows smoke host evidence\n')
  fs.writeFileSync(path.join(evidenceDir, 'process.txt'), 'OpenPet.exe running\n')
  fs.writeFileSync(path.join(evidenceDir, 'install-registry.txt'), 'OpenPet uninstall key present\n')
  fs.writeFileSync(
    path.join(evidenceDir, 'manual-checks.md'),
    `# Manual Checks\n\n${WINDOWS_CHECKS.map((check) => `- \`${check.id}\`: reviewed`).join('\n')}\n`
  )
  fs.writeFileSync(path.join(evidenceDir, 'update-report-commands.md'), 'Use update-windows-smoke-report with reviewed evidence snippets only.\n')
  fs.writeFileSync(path.join(evidenceDir, 'authenticode.txt'), signed ? 'SignerCertificate : OpenPet\nStatus : Valid\n' : 'Status : NotSigned\n')

  const summaryPath = path.join(archiveDir, 'windows-smoke-evidence-summary.md')
  const summary = createWindowsSmokeEvidenceSummary({
    evidenceDir,
    reportPath,
    requireSigned: signed,
    now: fixedNow
  })
  writeWindowsSmokeEvidenceSummary({ summary, outputPath: summaryPath })

  const manifest = createWindowsSmokeArchiveManifest({
    archiveDir,
    reportPath: tamperReportPath ? path.join(archiveDir, 'other-windows-smoke-report.json') : reportPath,
    evidenceDir,
    runbookPath,
    collectorPath: path.join(archiveDir, 'windows-smoke-collector.ps1'),
    summaryPath,
    requireSigned: signed,
    now: fixedNow
  })

  writeWindowsSmokeArchiveManifest({
    manifest,
    outputPath: path.join(archiveDir, 'windows-smoke-archive-manifest.json')
  })
}

const createArchive = ({
  signed = false,
  status = 'pending',
  includeMacosEvidence = true,
  includeDesktopPickerArchiveManifest = true,
  includeWindowsSmokeArchiveManifest = true,
  tamperPickerArchiveReportPath = false,
  tamperWindowsArchiveReportPath = false
} = {}) => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-release-evidence-archive-'))
  const windowsSmokeReportPath = path.join(archiveDir, 'windows-smoke-report.json')
  writeJson(windowsSmokeReportPath, createWindowsSmokeReport({ signed, status }))
  const desktopPickerReport = createDesktopPickerReport({ signed, status })
  const desktopPickerReportPath = path.join(archiveDir, 'desktop-picker-smoke-report.json')
  writeJson(desktopPickerReportPath, desktopPickerReport)
  writeJson(path.join(archiveDir, 'packaged-runtime-smoke-report.json'), createPackagedRuntimeReport({ signed, status }))

  fs.writeFileSync(path.join(archiveDir, 'windows-smoke-collector.ps1'), 'Write-Output "collector"\n')

  if (includeDesktopPickerArchiveManifest) {
    createDesktopPickerArchive({
      archiveDir,
      report: desktopPickerReport,
      reportPath: desktopPickerReportPath,
      signed,
      tamperReportPath: tamperPickerArchiveReportPath
    })
  }

  if (includeWindowsSmokeArchiveManifest) {
    createWindowsSmokeArchive({
      archiveDir,
      reportPath: windowsSmokeReportPath,
      signed,
      tamperReportPath: tamperWindowsArchiveReportPath
    })
  }

  if (includeMacosEvidence) {
    fs.writeFileSync(path.join(archiveDir, 'macos-codesign.txt'), signed ? 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement\n' : 'code object is not signed at all\n')
    fs.writeFileSync(path.join(archiveDir, 'macos-notarization.txt'), signed ? 'status: Accepted\nid: notarization-request\n' : 'status: NotSubmitted\n')
    fs.writeFileSync(path.join(archiveDir, 'macos-gatekeeper.txt'), signed ? 'release/mac-arm64/OpenPet.app: accepted\nsource=Notarized Developer ID\n' : 'rejected\n')
  }

  return archiveDir
}

test('parseArgs accepts archive inputs and output controls', () => {
  const options = parseArgs([
    '--archive-dir', 'archive',
    '--windows-smoke-report', 'archive/windows.json',
    '--windows-smoke-archive-manifest', 'archive/windows-archive.json',
    '--desktop-picker-report', 'archive/picker.json',
    '--desktop-picker-archive-manifest', 'archive/picker-archive.json',
    '--packaged-runtime-report', 'archive/runtime.json',
    '--macos-codesign', 'archive/codesign.txt',
    '--macos-notarization', 'archive/notary.txt',
    '--macos-gatekeeper', 'archive/spctl.txt',
    '--output', 'archive/manifest.json',
    '--require-signed',
    '--json'
  ])

  assert.equal(options.archiveDir, 'archive')
  assert.equal(options.windowsSmokeReportPath, 'archive/windows.json')
  assert.equal(options.windowsSmokeArchiveManifestPath, 'archive/windows-archive.json')
  assert.equal(options.desktopPickerReportPath, 'archive/picker.json')
  assert.equal(options.desktopPickerArchiveManifestPath, 'archive/picker-archive.json')
  assert.equal(options.packagedRuntimeReportPath, 'archive/runtime.json')
  assert.equal(options.macosCodesignPath, 'archive/codesign.txt')
  assert.equal(options.macosNotarizationPath, 'archive/notary.txt')
  assert.equal(options.macosGatekeeperPath, 'archive/spctl.txt')
  assert.equal(options.outputPath, 'archive/manifest.json')
  assert.equal(options.requireSigned, true)
  assert.equal(options.json, true)
})

test('parseArgs rejects missing values and unexpected flags', () => {
  assert.throws(() => parseArgs(['--archive-dir']), /--archive-dir requires a value/)
  assert.throws(() => parseArgs(['--nope']), /Unexpected argument/)
})

test('resolveArchivePaths defaults to the standard release evidence archive shape', () => {
  const paths = resolveArchivePaths({ archiveDir: 'archive' })

  assert.equal(paths.windowsSmokeReportPath, path.resolve('archive/windows-smoke-report.json'))
  assert.equal(paths.windowsSmokeArchiveManifestPath, path.resolve('archive/windows-smoke-archive-manifest.json'))
  assert.equal(paths.desktopPickerReportPath, path.resolve('archive/desktop-picker-smoke-report.json'))
  assert.equal(paths.desktopPickerArchiveManifestPath, path.resolve('archive/desktop-picker-archive-manifest.json'))
  assert.equal(paths.packagedRuntimeReportPath, path.resolve('archive/packaged-runtime-smoke-report.json'))
  assert.equal(paths.macosCodesignPath, path.resolve('archive/macos-codesign.txt'))
  assert.equal(paths.macosNotarizationPath, path.resolve('archive/macos-notarization.txt'))
  assert.equal(paths.macosGatekeeperPath, path.resolve('archive/macos-gatekeeper.txt'))
  assert.equal(paths.outputPath, path.resolve('archive/release-evidence-archive-manifest.json'))
})

test('macosEvidenceStatus detects signing, notarization, and Gatekeeper success markers', () => {
  assert.equal(macosEvidenceStatus({ kind: 'codesign', content: 'valid on disk\nsatisfies its Designated Requirement' }), 'pass')
  assert.equal(macosEvidenceStatus({ kind: 'notarization', content: 'status: Accepted' }), 'pass')
  assert.equal(macosEvidenceStatus({ kind: 'gatekeeper', content: 'accepted\nsource=Notarized Developer ID' }), 'pass')
  assert.equal(macosEvidenceStatus({ kind: 'gatekeeper', content: 'release/mac-arm64/OpenPet.app: accepted\nsource=Notarized Developer ID' }), 'pass')
  assert.equal(macosEvidenceStatus({ kind: 'notarization', content: 'status: Invalid\nnot accepted' }), 'pending')
  assert.equal(macosEvidenceStatus({ kind: 'gatekeeper', content: 'not accepted\nsource=Unnotarized Developer ID' }), 'pending')
  assert.equal(macosEvidenceStatus({ kind: 'gatekeeper', content: 'rejected' }), 'pending')
})

test('createReleaseEvidenceArchiveManifest archives pending evidence without readiness claim', () => {
  const archiveDir = createArchive({ signed: false, status: 'pending' })

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, true)
  assert.equal(manifest.releaseReady, false)
  assert.equal(manifest.macos.releaseReady, false)
  assert.equal(manifest.reports.releaseReady, false)
  assert.equal(manifest.files.length, 8)
  assert.equal(manifest.reports.windowsSmoke.structuralValidation.ok, true)
  assert.equal(manifest.reports.windowsSmoke.readinessValidation.ok, false)
  assert.equal(manifest.archives.windowsSmoke.ok, true)
  assert.equal(manifest.archives.windowsSmoke.releaseReady, false)
  assert.equal(manifest.archives.desktopPicker.ok, true)
  assert.equal(manifest.archives.desktopPicker.releaseReady, false)
  assert.match(manifest.warnings.join('\n'), /windowsSmokeArchiveManifest is archived but not release-ready/)
  assert.match(manifest.warnings.join('\n'), /windowsSmokeReport is archived but not release-ready/)
  assert.match(manifest.warnings.join('\n'), /desktopPickerArchiveManifest is archived but not release-ready/)
  assert.match(manifest.warnings.join('\n'), /macosCodesignEvidence does not prove codesign success/)
})

test('createReleaseEvidenceArchiveManifest returns the shared release evidence manifest contract shape', () => {
  const archiveDir = createArchive({ signed: false, status: 'pending' })

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.equal(manifest.generatedAt, fixedNow().toISOString())
  assert.equal(manifest.requireSigned, true)
  assert.equal(typeof manifest.ok, 'boolean')
  assert.equal(typeof manifest.releaseReady, 'boolean')
  assert.equal(manifest.archive.archiveDir, archiveDir)
  assert.match(manifest.archive.outputPath, /release-evidence-archive-manifest\.json$/)
  assert.deepEqual(
    manifest.files.map((file) => [file.role, typeof file.path, typeof file.exists, typeof file.bytes, typeof file.sha256]),
    [
      ['windowsSmokeReport', 'string', 'boolean', 'number', 'string'],
      ['windowsSmokeArchiveManifest', 'string', 'boolean', 'number', 'string'],
      ['desktopPickerReport', 'string', 'boolean', 'number', 'string'],
      ['desktopPickerArchiveManifest', 'string', 'boolean', 'number', 'string'],
      ['packagedRuntimeReport', 'string', 'boolean', 'number', 'string'],
      ['macosCodesignEvidence', 'string', 'boolean', 'number', 'string'],
      ['macosNotarizationEvidence', 'string', 'boolean', 'number', 'string'],
      ['macosGatekeeperEvidence', 'string', 'boolean', 'number', 'string']
    ]
  )
  assert.deepEqual(Object.keys(manifest.macos), ['releaseReady', 'codesign', 'notarization', 'gatekeeper'])
  assert.ok(['missing', 'pending', 'pass'].includes(manifest.macos.codesign.status))
  assert.equal(manifest.reports.windowsSmoke.file.role, 'windowsSmokeReport')
  assert.equal(manifest.reports.windowsSmoke.report.platform, 'win32')
  assert.equal(typeof manifest.reports.windowsSmoke.structuralValidation.ok, 'boolean')
  assert.equal(typeof manifest.reports.windowsSmoke.readinessValidation.ok, 'boolean')
  assert.equal(manifest.archives.windowsSmoke.file.role, 'windowsSmokeArchiveManifest')
  assert.equal(typeof manifest.archives.windowsSmoke.ok, 'boolean')
  assert.equal(typeof manifest.archives.windowsSmoke.releaseReady, 'boolean')
  assert.equal(typeof manifest.archives.windowsSmoke.matchesReport, 'boolean')
  assert.equal(manifest.archives.desktopPicker.file.role, 'desktopPickerArchiveManifest')
  assert.equal(typeof manifest.archives.desktopPicker.ok, 'boolean')
  assert.equal(typeof manifest.archives.desktopPicker.releaseReady, 'boolean')
  assert.equal(typeof manifest.archives.desktopPicker.matchesReport, 'boolean')
  assert.ok(Array.isArray(manifest.errors))
  assert.ok(Array.isArray(manifest.warnings))
})

test('createReleaseEvidenceArchiveManifest requires macOS evidence when signed readiness is requested', () => {
  const archiveDir = createArchive({ signed: true, status: 'pass', includeMacosEvidence: false })

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.releaseReady, false)
  assert.match(manifest.errors.join('\n'), /missing macosCodesignEvidence/)
  assert.match(manifest.errors.join('\n'), /missing macosNotarizationEvidence/)
  assert.match(manifest.errors.join('\n'), /missing macosGatekeeperEvidence/)
})

test('createReleaseEvidenceArchiveManifest marks signed all-pass archives as release ready', () => {
  const archiveDir = createArchive({ signed: true, status: 'pass' })

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.equal(manifest.ok, true)
  assert.equal(manifest.releaseReady, true)
  assert.equal(manifest.macos.releaseReady, true)
  assert.equal(manifest.reports.releaseReady, true)
  assert.equal(manifest.archives.windowsSmoke.releaseReady, true)
  assert.equal(manifest.reports.windowsSmoke.readinessValidation.summary.officialReady, true)
  assert.equal(manifest.reports.desktopPicker.readinessValidation.summary.officialReady, true)
  assert.equal(manifest.reports.packagedRuntime.readinessValidation.summary.officialReady, true)
  assert.equal(manifest.archives.desktopPicker.releaseReady, true)
})

test('createReleaseEvidenceArchiveManifest requires a Windows smoke archive manifest', () => {
  const archiveDir = createArchive({ signed: true, status: 'pass', includeWindowsSmokeArchiveManifest: false })

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.releaseReady, false)
  assert.match(manifest.errors.join('\n'), /missing windowsSmokeArchiveManifest/)
})

test('createReleaseEvidenceArchiveManifest uses Windows-specific signed archive warnings', () => {
  const archiveDir = createArchive({ signed: false, status: 'pending' })

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.match(manifest.warnings.join('\n'), /windowsSmokeArchiveManifest does not prove signed Windows smoke report archive readiness/)
})

test('createReleaseEvidenceArchiveManifest rejects Windows archive manifests for a different Windows report', () => {
  const archiveDir = createArchive({ signed: true, status: 'pass', tamperWindowsArchiveReportPath: true })

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.releaseReady, false)
  assert.equal(manifest.archives.releaseReady, false)
  assert.equal(manifest.archives.windowsSmoke.ok, false)
  assert.equal(manifest.archives.windowsSmoke.releaseReady, false)
  assert.equal(manifest.archives.windowsSmoke.matchesReport, false)
  assert.match(manifest.errors.join('\n'), /windowsSmokeArchiveManifest references a different Windows smoke report/)
})

test('createReleaseEvidenceArchiveManifest requires a desktop picker archive manifest', () => {
  const archiveDir = createArchive({ signed: true, status: 'pass', includeDesktopPickerArchiveManifest: false })

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.releaseReady, false)
  assert.match(manifest.errors.join('\n'), /missing desktopPickerArchiveManifest/)
})

test('createReleaseEvidenceArchiveManifest rejects picker archive manifests for a different picker report', () => {
  const archiveDir = createArchive({ signed: true, status: 'pass', tamperPickerArchiveReportPath: true })

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.releaseReady, false)
  assert.equal(manifest.archives.releaseReady, false)
  assert.equal(manifest.archives.desktopPicker.ok, false)
  assert.equal(manifest.archives.desktopPicker.releaseReady, false)
  assert.equal(manifest.archives.desktopPicker.matchesReport, false)
  assert.match(manifest.errors.join('\n'), /desktopPickerArchiveManifest references a different desktop picker report/)
})

test('createReleaseEvidenceArchiveManifest rejects runtime evidence that does not link a ready desktop picker report', () => {
  const archiveDir = createArchive({ signed: true, status: 'pass' })
  const runtimePath = path.join(archiveDir, 'packaged-runtime-smoke-report.json')
  const runtimeReport = JSON.parse(fs.readFileSync(runtimePath, 'utf-8'))
  runtimeReport.linkedEvidence.desktopPickerSmokeReport = ''
  fs.writeFileSync(runtimePath, `${JSON.stringify(runtimeReport, null, 2)}\n`)

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.releaseReady, false)
  assert.match(manifest.errors.join('\n'), /packagedRuntimeReport: linkedEvidence\.desktopPickerSmokeReport is required/)
})

test('createReleaseEvidenceArchiveManifest rejects runtime evidence linked to a different desktop picker report path', () => {
  const archiveDir = createArchive({ signed: true, status: 'pass' })
  const runtimePath = path.join(archiveDir, 'packaged-runtime-smoke-report.json')
  const runtimeReport = JSON.parse(fs.readFileSync(runtimePath, 'utf-8'))
  runtimeReport.linkedEvidence.desktopPickerSmokeReport = 'other-desktop-picker-smoke-report.json'
  fs.writeFileSync(runtimePath, `${JSON.stringify(runtimeReport, null, 2)}\n`)

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.releaseReady, false)
  assert.match(manifest.errors.join('\n'), /packagedRuntimeReport links a different desktop picker report/)
})

test('createReleaseEvidenceArchiveManifest does not mark release ready without requireSigned', () => {
  const archiveDir = createArchive({ signed: true, status: 'pass' })

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, true)
  assert.equal(manifest.macos.releaseReady, true)
  assert.equal(manifest.reports.releaseReady, true)
  assert.equal(manifest.releaseReady, false)
})

test('createReleaseEvidenceArchiveManifest fails on structurally invalid reports', () => {
  const archiveDir = createArchive()
  fs.writeFileSync(path.join(archiveDir, 'desktop-picker-smoke-report.json'), '{"platform":"darwin"}\n')

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.releaseReady, false)
  assert.match(manifest.errors.join('\n'), /desktopPickerReport: arch is required/)
  assert.match(manifest.errors.join('\n'), /desktopPickerReport: artifact object is required/)
})

test('writeManifest writes a pretty release evidence archive manifest', () => {
  const archiveDir = createArchive()
  const outputPath = path.join(archiveDir, 'nested', 'manifest.json')
  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, outputPath, now: fixedNow })

  assert.equal(writeManifest({ manifest, outputPath }), outputPath)
  const written = JSON.parse(fs.readFileSync(outputPath, 'utf-8'))
  assert.equal(written.releaseReady, false)
  assert.equal(written.archive.outputPath, outputPath)
})
