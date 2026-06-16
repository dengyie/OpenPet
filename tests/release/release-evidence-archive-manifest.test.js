const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { REQUIRED_CHECKS: WINDOWS_CHECKS } = require('../../scripts/validate-windows-smoke-report')
const { REQUIRED_CHECKS: PICKER_CHECKS } = require('../../scripts/validate-desktop-picker-smoke-report')
const { REQUIRED_CHECKS: RUNTIME_CHECKS, BUILT_IN_PACKS } = require('../../scripts/validate-packaged-runtime-smoke-report')
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

const createArchive = ({ signed = false, status = 'pending', includeMacosEvidence = true } = {}) => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-release-evidence-archive-'))
  writeJson(path.join(archiveDir, 'windows-smoke-report.json'), createWindowsSmokeReport({ signed, status }))
  writeJson(path.join(archiveDir, 'desktop-picker-smoke-report.json'), createDesktopPickerReport({ signed, status }))
  writeJson(path.join(archiveDir, 'packaged-runtime-smoke-report.json'), createPackagedRuntimeReport({ signed, status }))

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
    '--desktop-picker-report', 'archive/picker.json',
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
  assert.equal(options.desktopPickerReportPath, 'archive/picker.json')
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
  assert.equal(paths.desktopPickerReportPath, path.resolve('archive/desktop-picker-smoke-report.json'))
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
  assert.equal(manifest.files.length, 6)
  assert.equal(manifest.reports.windowsSmoke.structuralValidation.ok, true)
  assert.equal(manifest.reports.windowsSmoke.readinessValidation.ok, false)
  assert.match(manifest.warnings.join('\n'), /windowsSmokeReport is archived but not release-ready/)
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
      ['desktopPickerReport', 'string', 'boolean', 'number', 'string'],
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
  assert.equal(manifest.reports.windowsSmoke.readinessValidation.summary.officialReady, true)
  assert.equal(manifest.reports.desktopPicker.readinessValidation.summary.officialReady, true)
  assert.equal(manifest.reports.packagedRuntime.readinessValidation.summary.officialReady, true)
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
