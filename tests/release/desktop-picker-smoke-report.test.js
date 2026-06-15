const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const packageJson = require('../../package.json')

const {
  createDesktopPickerSmokeReport,
  parseAuthenticodeStatus,
  parseMacSignatureStatus,
  pickArtifacts,
  writeReport
} = require('../../scripts/create-desktop-picker-smoke-report')
const { REQUIRED_CHECKS, validateReport } = require('../../scripts/validate-desktop-picker-smoke-report')

const createReleaseDir = () => {
  const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-desktop-picker-report-'))
  fs.mkdirSync(path.join(releaseDir, 'mac-arm64', 'OpenPet.app'), { recursive: true })
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.1-mac.dmg'), 'dmg')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.1-mac.zip'), 'mac zip')
  fs.writeFileSync(path.join(releaseDir, 'latest-mac.yml'), 'path: OpenPet-1.0.1-rc.1-mac.zip')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.exe'), 'installer')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.zip'), 'zip')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.1-win32-x64.exe-unsigned.blockmap'), 'blockmap')
  fs.writeFileSync(path.join(releaseDir, 'latest.yml'), 'path: OpenPet-1.0.1-rc.1-win32-x64-unsigned.exe')
  return releaseDir
}

test('pickArtifacts selects macOS packaged app and release assets', () => {
  const releaseDir = createReleaseDir()
  const files = fs.readdirSync(releaseDir).sort()

  const artifacts = pickArtifacts({ releaseDir, platform: 'darwin', files })

  assert.equal(artifacts.appPath, path.join('mac-arm64', 'OpenPet.app'))
  assert.equal(artifacts.installer, 'OpenPet-1.0.1-rc.1-mac.dmg')
  assert.equal(artifacts.zip, 'OpenPet-1.0.1-rc.1-mac.zip')
  assert.equal(artifacts.latestYml, 'latest-mac.yml')
  assert.deepEqual(artifacts.files.map((file) => file.name), [
    path.join('mac-arm64', 'OpenPet.app'),
    'OpenPet-1.0.1-rc.1-mac.dmg',
    'OpenPet-1.0.1-rc.1-mac.zip',
    'latest-mac.yml'
  ])
})

test('pickArtifacts selects Windows installer, archive, feed, and blockmaps', () => {
  const releaseDir = createReleaseDir()
  const files = fs.readdirSync(releaseDir).sort()

  const artifacts = pickArtifacts({ releaseDir, platform: 'win32', files })

  assert.equal(artifacts.installer, 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.exe')
  assert.equal(artifacts.zip, 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.zip')
  assert.equal(artifacts.latestYml, 'latest.yml')
  assert.deepEqual(artifacts.blockmaps, ['OpenPet-1.0.1-rc.1-win32-x64.exe-unsigned.blockmap'])
})

test('pickArtifacts treats whitespace as a platform token delimiter', () => {
  const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-desktop-picker-spaces-'))
  fs.writeFileSync(path.join(releaseDir, 'OpenPet 1.0.1 mac.zip'), 'mac zip')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet 1.0.1 windows.zip'), 'windows zip')
  const files = fs.readdirSync(releaseDir).sort()

  const macArtifacts = pickArtifacts({ releaseDir, platform: 'darwin', files })
  const windowsArtifacts = pickArtifacts({ releaseDir, platform: 'win32', files })

  assert.equal(macArtifacts.zip, 'OpenPet 1.0.1 mac.zip')
  assert.equal(windowsArtifacts.zip, 'OpenPet 1.0.1 windows.zip')
})

test('signature parsers extract macOS and Windows status hints', () => {
  assert.equal(parseMacSignatureStatus('OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement'), 'Valid')
  assert.equal(parseMacSignatureStatus('code object is not signed at all'), 'NotSigned')
  assert.equal(parseMacSignatureStatus(''), 'NotChecked')
  assert.equal(parseAuthenticodeStatus('Status                 : Valid'), 'Valid')
})

test('createDesktopPickerSmokeReport writes a pending macOS report that passes structural validation', () => {
  const releaseDir = createReleaseDir()
  const report = createDesktopPickerSmokeReport({
    releaseDir,
    platform: 'darwin',
    arch: 'arm64',
    allowAnyPlatform: true,
    execFile: () => 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement',
    hostname: () => 'mac-smoke-host',
    now: () => new Date('2026-06-15T00:00:00.000Z')
  })

  assert.equal(report.platform, 'darwin')
  assert.equal(report.arch, 'arm64')
  assert.equal(report.generatedAt, '2026-06-15T00:00:00.000Z')
  assert.equal(report.environment.machine, 'mac-smoke-host')
  assert.equal(report.artifact.version, packageJson.version)
  assert.equal(report.artifact.appPath, path.join('mac-arm64', 'OpenPet.app'))
  assert.equal(report.artifact.signed, true)
  assert.equal(report.artifact.signatureStatus, 'Valid')
  assert.equal(report.checks.length, REQUIRED_CHECKS.length)
  assert.equal(report.checks.every((check) => check.status === 'pending'), true)

  const validation = validateReport(report, { allowPending: true })
  assert.equal(validation.ok, true)

  const outputPath = path.join(releaseDir, 'desktop-picker-smoke-report.json')
  const writtenPath = writeReport({ report, outputPath })
  const written = JSON.parse(fs.readFileSync(writtenPath, 'utf-8'))
  assert.equal(written.artifact.appPath, path.join('mac-arm64', 'OpenPet.app'))
})

test('validateReport requires every picker check to pass before readiness', () => {
  const report = createDesktopPickerSmokeReport({
    releaseDir: createReleaseDir(),
    platform: 'darwin',
    allowAnyPlatform: true,
    execFile: () => 'code object is not signed at all',
    now: () => new Date('2026-06-15T00:00:00.000Z')
  })

  const pending = validateReport(report)
  assert.equal(pending.ok, false)
  assert.match(pending.errors.join('\n'), /packaged-launch must pass/)

  for (const check of report.checks) {
    check.status = 'pass'
    check.evidence = `Evidence for ${check.id}`
  }

  const ready = validateReport(report)
  assert.equal(ready.ok, true)
  assert.equal(ready.summary.smokeReady, true)

  const signedReady = validateReport(report, { requireSigned: true })
  assert.equal(signedReady.ok, false)
  assert.match(signedReady.errors.join('\n'), /artifact\.signed must be true/)
})

test('validateReport accepts a signed all-pass Windows picker smoke report', () => {
  const report = createDesktopPickerSmokeReport({
    releaseDir: createReleaseDir(),
    platform: 'win32',
    arch: 'x64',
    allowAnyPlatform: true,
    now: () => new Date('2026-06-15T00:00:00.000Z')
  })
  report.artifact.signed = true
  report.artifact.authenticodeStatus = 'Valid'
  report.artifact.authenticodeEvidence = 'Status                 : Valid'
  report.artifact.signatureEvidence = report.artifact.authenticodeEvidence
  for (const check of report.checks) {
    check.status = 'pass'
    check.evidence = `Windows evidence for ${check.id}`
  }

  const result = validateReport(report, { requireSigned: true })
  assert.equal(result.ok, true)
  assert.equal(result.summary.officialReady, true)
})

test('createDesktopPickerSmokeReport rejects unsupported platforms', () => {
  assert.throws(
    () => createDesktopPickerSmokeReport({ platform: 'linux', allowAnyPlatform: true }),
    /only support darwin and win32/
  )
})
