const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createWindowsSmokeReport,
  parseAuthenticodeStatus,
  pickWindowsArtifacts,
  writeReport
} = require('../../scripts/create-windows-smoke-report')
const { REQUIRED_CHECKS, validateReport } = require('../../scripts/validate-windows-smoke-report')

const createReleaseDir = () => {
  const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-windows-smoke-report-'))
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.exe'), 'installer')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.zip'), 'zip')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.1-win32-x64.exe-unsigned.blockmap'), 'blockmap')
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.1-darwin-arm64.zip'), 'mac zip')
  fs.writeFileSync(path.join(releaseDir, 'latest.yml'), 'path: OpenPet-1.0.1-rc.1-win32-x64-unsigned.exe')
  return releaseDir
}

test('pickWindowsArtifacts selects installer, zip, blockmap, and latest.yml', () => {
  const releaseDir = createReleaseDir()
  const files = fs.readdirSync(releaseDir).sort()

  const artifacts = pickWindowsArtifacts({ releaseDir, files })

  assert.equal(artifacts.installer, 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.exe')
  assert.equal(artifacts.zip, 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.zip')
  assert.deepEqual(artifacts.blockmaps, ['OpenPet-1.0.1-rc.1-win32-x64.exe-unsigned.blockmap'])
  assert.equal(artifacts.latestYml, 'latest.yml')
  assert.deepEqual(artifacts.files.map((file) => file.name), [
    'OpenPet-1.0.1-rc.1-win32-x64-unsigned.exe',
    'OpenPet-1.0.1-rc.1-win32-x64-unsigned.zip',
    'latest.yml',
    'OpenPet-1.0.1-rc.1-win32-x64.exe-unsigned.blockmap'
  ])
})

test('parseAuthenticodeStatus extracts status from PowerShell output', () => {
  const output = [
    'SignerCertificate      :',
    'TimeStamperCertificate :',
    'Status                 : Valid',
    'StatusMessage          : Signature verified.'
  ].join('\n')

  assert.equal(parseAuthenticodeStatus(output), 'Valid')
  assert.equal(parseAuthenticodeStatus(''), '')
})

test('createWindowsSmokeReport writes a pending report that passes structural validation', () => {
  const releaseDir = createReleaseDir()
  const outputPath = path.join(releaseDir, 'windows-smoke-report.json')

  const report = createWindowsSmokeReport({
    releaseDir,
    platform: 'win32',
    env: {
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'dengyie/OpenPet',
      GITHUB_RUN_ID: '12345',
      RUNNER_NAME: 'GitHub Actions 1'
    },
    execFile: () => 'Status                 : NotSigned',
    osRelease: () => '10.0.22631',
    hostname: () => 'windows-smoke-vm',
    now: () => new Date('2026-06-14T00:00:00.000Z')
  })

  assert.equal(report.platform, 'win32')
  assert.equal(report.arch, 'x64')
  assert.equal(report.generatedAt, '2026-06-14T00:00:00.000Z')
  assert.equal(report.environment.windowsVersion, 'Windows 10.0.22631')
  assert.equal(report.environment.machine, 'windows-smoke-vm')
  assert.equal(report.environment.evidence, 'https://github.com/dengyie/OpenPet/actions/runs/12345')
  assert.equal(report.artifact.version, '1.0.1-rc.1')
  assert.equal(report.artifact.signed, false)
  assert.equal(report.artifact.authenticodeStatus, 'NotSigned')
  assert.equal(report.checks.length, REQUIRED_CHECKS.length)
  assert.equal(report.checks.every((check) => check.status === 'pending'), true)

  const validation = validateReport(report, { allowPending: true })
  assert.equal(validation.ok, true)

  const writtenPath = writeReport({ report, outputPath })
  const written = JSON.parse(fs.readFileSync(writtenPath, 'utf-8'))
  assert.equal(written.artifact.installer, 'OpenPet-1.0.1-rc.1-win32-x64-unsigned.exe')
})

test('createWindowsSmokeReport refuses non-Windows generation unless explicitly allowed', () => {
  const releaseDir = createReleaseDir()

  assert.throws(
    () => createWindowsSmokeReport({ releaseDir, platform: 'darwin' }),
    /must be generated on Windows/
  )

  const report = createWindowsSmokeReport({
    releaseDir,
    platform: 'darwin',
    allowNonWindows: true,
    now: () => new Date('2026-06-14T00:00:00.000Z')
  })

  assert.equal(report.environment.machine, 'non-Windows structure check')
  assert.equal(validateReport(report, { allowPending: true }).ok, true)
})

test('createWindowsSmokeReport reports missing required artifacts', () => {
  const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-windows-smoke-report-missing-'))
  fs.writeFileSync(path.join(releaseDir, 'OpenPet-1.0.1-rc.1-win32-x64.exe'), 'installer')

  assert.throws(
    () => createWindowsSmokeReport({ releaseDir, platform: 'win32' }),
    /Missing required Windows release artifact\(s\): Windows \.zip archive, latest\.yml/
  )
})
