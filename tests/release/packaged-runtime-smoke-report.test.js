const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const packageJson = require('../../package.json')

const {
  createPackagedRuntimeSmokeReport,
  defaultBuiltInPackFixtures,
  parseAuthenticodeStatus,
  parseMacSignatureStatus,
  pickArtifacts,
  writeReport
} = require('../../scripts/create-packaged-runtime-smoke-report')
const {
  BUILT_IN_PACKS,
  REQUIRED_CHECKS,
  validateReport
} = require('../../scripts/validate-packaged-runtime-smoke-report')

const createReleaseDir = () => {
  const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-packaged-runtime-report-'))
  fs.mkdirSync(path.join(releaseDir, 'mac-arm64', 'OpenPet.app'), { recursive: true })
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.2-mac.dmg'), 'dmg')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.2-mac.zip'), 'mac zip')
  fs.writeFileSync(path.join(releaseDir, 'latest-mac.yml'), 'path: OpenPet-1.0.1-rc.2-mac.zip')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.2-win32-x64-unsigned.exe'), 'installer')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.2-win32-x64-unsigned.zip'), 'zip')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.2-win32-x64.exe-unsigned.blockmap'), 'blockmap')
  fs.writeFileSync(path.join(releaseDir, 'latest.yml'), 'path: OpenPet-1.0.1-rc.2-win32-x64-unsigned.exe')
  return releaseDir
}

test('pickArtifacts selects macOS packaged runtime artifacts', () => {
  const releaseDir = createReleaseDir()
  const files = fs.readdirSync(releaseDir).sort()

  const artifacts = pickArtifacts({ releaseDir, platform: 'darwin', files })

  assert.equal(artifacts.appPath, path.join('mac-arm64', 'OpenPet.app'))
  assert.equal(artifacts.installer, 'OpenPet-1.0.1-rc.2-mac.dmg')
  assert.equal(artifacts.zip, 'OpenPet-1.0.1-rc.2-mac.zip')
  assert.equal(artifacts.latestYml, 'latest-mac.yml')
})

test('pickArtifacts selects Windows packaged runtime artifacts', () => {
  const releaseDir = createReleaseDir()
  const files = fs.readdirSync(releaseDir).sort()

  const artifacts = pickArtifacts({ releaseDir, platform: 'win32', files })

  assert.equal(artifacts.installer, 'OpenPet-1.0.1-rc.2-win32-x64-unsigned.exe')
  assert.equal(artifacts.zip, 'OpenPet-1.0.1-rc.2-win32-x64-unsigned.zip')
  assert.equal(artifacts.latestYml, 'latest.yml')
  assert.deepEqual(artifacts.blockmaps, ['OpenPet-1.0.1-rc.2-win32-x64.exe-unsigned.blockmap'])
})

test('signature parsers extract macOS and Windows status hints', () => {
  assert.equal(parseMacSignatureStatus('OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement'), 'Valid')
  assert.equal(parseMacSignatureStatus('code object is not signed at all'), 'NotSigned')
  assert.equal(parseMacSignatureStatus(''), 'NotChecked')
  assert.equal(parseAuthenticodeStatus('Status                 : Valid'), 'Valid')
})

test('defaultBuiltInPackFixtures documents the required built-in pack evidence targets', () => {
  const fixtures = defaultBuiltInPackFixtures()
  assert.deepEqual(Object.keys(fixtures).sort(), [...BUILT_IN_PACKS].sort())
  assert.equal(fixtures['legacy-cat'], 'cat_anime/')
  assert.equal(fixtures.doro, 'assets/pet-packs/doro/')
})

test('createPackagedRuntimeSmokeReport writes a pending macOS report that passes structural validation', () => {
  const releaseDir = createReleaseDir()
  const report = createPackagedRuntimeSmokeReport({
    releaseDir,
    platform: 'darwin',
    arch: 'arm64',
    allowAnyPlatform: true,
    execFile: () => 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement',
    hostname: () => 'mac-runtime-host',
    now: () => new Date('2026-06-16T00:00:00.000Z')
  })

  assert.equal(report.platform, 'darwin')
  assert.equal(report.arch, 'arm64')
  assert.equal(report.generatedAt, '2026-06-16T00:00:00.000Z')
  assert.equal(report.environment.machine, 'mac-runtime-host')
  assert.equal(report.artifact.version, packageJson.version)
  assert.equal(report.artifact.appPath, path.join('mac-arm64', 'OpenPet.app'))
  assert.equal(report.artifact.signed, true)
  assert.equal(report.artifact.signatureStatus, 'Valid')
  assert.equal(report.checks.length, REQUIRED_CHECKS.length)
  assert.equal(report.checks.every((check) => check.status === 'pending'), true)

  const validation = validateReport(report, { allowPending: true })
  assert.equal(validation.ok, true)

  const outputPath = path.join(releaseDir, 'packaged-runtime-smoke-report.json')
  const writtenPath = writeReport({ report, outputPath })
  const written = JSON.parse(fs.readFileSync(writtenPath, 'utf-8'))
  assert.equal(written.artifact.appPath, path.join('mac-arm64', 'OpenPet.app'))
})

test('validateReport requires every runtime check to pass before readiness', () => {
  const report = createPackagedRuntimeSmokeReport({
    releaseDir: createReleaseDir(),
    platform: 'darwin',
    allowAnyPlatform: true,
    execFile: () => 'code object is not signed at all',
    now: () => new Date('2026-06-16T00:00:00.000Z')
  })

  const pending = validateReport(report)
  assert.equal(pending.ok, false)
  assert.match(pending.errors.join('\n'), /packaged-launch must pass/)

  for (const check of report.checks) {
    check.status = 'pass'
    check.evidence = `Evidence for ${check.id}`
  }

  const ready = validateReport(report)
  assert.equal(ready.ok, false)
  assert.match(ready.errors.join('\n'), /linkedEvidence\.desktopPickerSmokeReport is required/)

  report.linkedEvidence.desktopPickerSmokeReport = 'desktop-picker-smoke-report.json'

  const linkedReady = validateReport(report)
  assert.equal(linkedReady.ok, true)
  assert.equal(linkedReady.summary.smokeReady, true)

  const signedReady = validateReport(report, { requireSigned: true })
  assert.equal(signedReady.ok, false)
  assert.match(signedReady.errors.join('\n'), /artifact\.signed must be true/)
})

test('validateReport accepts a signed all-pass Windows runtime smoke report', () => {
  const report = createPackagedRuntimeSmokeReport({
    releaseDir: createReleaseDir(),
    platform: 'win32',
    arch: 'x64',
    allowAnyPlatform: true,
    now: () => new Date('2026-06-16T00:00:00.000Z')
  })
  report.artifact.signed = true
  report.artifact.authenticodeStatus = 'Valid'
  report.artifact.authenticodeEvidence = 'Status                 : Valid'
  report.artifact.signatureEvidence = report.artifact.authenticodeEvidence
  report.linkedEvidence.desktopPickerSmokeReport = 'desktop-picker-smoke-report.json'
  for (const check of report.checks) {
    check.status = 'pass'
    check.evidence = `Windows evidence for ${check.id}`
  }

  const result = validateReport(report, { requireSigned: true })
  assert.equal(result.ok, true)
  assert.equal(result.summary.officialReady, true)
})

test('validateReport rejects ready runtime reports without a linked desktop picker report', () => {
  const report = createPackagedRuntimeSmokeReport({
    releaseDir: createReleaseDir(),
    platform: 'darwin',
    arch: 'arm64',
    allowAnyPlatform: true,
    execFile: () => 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement',
    now: () => new Date('2026-06-16T00:00:00.000Z')
  })

  report.artifact.signed = true
  report.artifact.signatureStatus = 'Valid'
  report.artifact.signatureEvidence = 'OpenPet.app: valid on disk\nOpenPet.app: satisfies its Designated Requirement'
  for (const check of report.checks) {
    check.status = 'pass'
    check.evidence = `Evidence for ${check.id}`
  }

  const result = validateReport(report, { requireSigned: true })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /linkedEvidence\.desktopPickerSmokeReport is required/)
})

test('createPackagedRuntimeSmokeReport rejects unsupported platforms', () => {
  assert.throws(
    () => createPackagedRuntimeSmokeReport({ platform: 'linux', allowAnyPlatform: true }),
    /only support darwin and win32/
  )
})
