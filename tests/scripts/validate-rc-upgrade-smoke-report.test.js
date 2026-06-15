const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createRcUpgradeSmokeReport, defaultAppDataDir, LEGACY_USER_DATA_DIR_NAME, CURRENT_USER_DATA_DIR_NAME, writeReport } = require('../../scripts/create-rc-upgrade-smoke-report')
const { REQUIRED_CHECKS, validateReport } = require('../../scripts/validate-rc-upgrade-smoke-report')

const createTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

const seedLegacyUserData = ({ withCurrentData = false } = {}) => {
  const appDataDir = createTempDir('openpet-rc-upgrade-')
  const legacyUserDataDir = path.join(appDataDir, LEGACY_USER_DATA_DIR_NAME)
  const currentUserDataDir = path.join(appDataDir, CURRENT_USER_DATA_DIR_NAME)

  fs.mkdirSync(path.join(legacyUserDataDir, 'plugins'), { recursive: true })
  fs.mkdirSync(path.join(legacyUserDataDir, 'pet-packs'), { recursive: true })
  fs.writeFileSync(path.join(legacyUserDataDir, 'settings.json'), JSON.stringify({
    localHttp: { logs: [{ method: 'GET', path: '/api/status', status: 200 }] }
  }, null, 2))
  fs.writeFileSync(path.join(legacyUserDataDir, 'secrets.json'), JSON.stringify({ apiKeys: [{ id: 'ai.default' }] }, null, 2))
  fs.writeFileSync(path.join(legacyUserDataDir, 'plugins', 'focus-timer.json'), '{}')
  fs.writeFileSync(path.join(legacyUserDataDir, 'pet-packs', 'legacy-cat.json'), '{}')

  if (withCurrentData) {
    fs.mkdirSync(currentUserDataDir, { recursive: true })
    fs.writeFileSync(path.join(currentUserDataDir, 'settings.json'), JSON.stringify({ scale: 2 }, null, 2))
  }

  return { appDataDir, legacyUserDataDir, currentUserDataDir }
}

test('defaultAppDataDir follows desktop conventions by platform', () => {
  assert.match(defaultAppDataDir({ platform: 'darwin', homedir: () => '/Users/mango' }), /Library\/Application Support$/)
  assert.match(defaultAppDataDir({ platform: 'win32', env: { APPDATA: 'C:\\Users\\mango\\AppData\\Roaming' }, homedir: () => '/Users/mango' }), /AppData/)
  assert.match(defaultAppDataDir({ platform: 'linux', env: { XDG_CONFIG_HOME: '/home/mango/.config' }, homedir: () => '/Users/mango' }), /\.config$/)
})

test('createRcUpgradeSmokeReport emits a ready report when legacy data is seeded and observed', () => {
  const fixture = seedLegacyUserData()
  const report = createRcUpgradeSmokeReport({
    appDataDir: fixture.appDataDir,
    observedUserDataDir: fixture.legacyUserDataDir,
    platform: 'darwin',
    arch: 'arm64',
    now: () => new Date('2026-06-16T00:00:00.000Z')
  })

  assert.equal(report.platform, 'darwin')
  assert.equal(report.arch, 'arm64')
  assert.equal(report.environment.legacyUserDataDir, fixture.legacyUserDataDir)
  assert.equal(report.environment.observedUserDataDir, fixture.legacyUserDataDir)
  assert.equal(report.artifact.legacyDirName, LEGACY_USER_DATA_DIR_NAME)
  assert.equal(report.artifact.currentDirName, CURRENT_USER_DATA_DIR_NAME)
  assert.equal(report.checks.every((check) => check.status === 'pass'), true)

  const result = validateReport(report)
  assert.equal(result.ok, true)
  assert.equal(result.summary.upgradeReady, true)
  assert.equal(result.summary.passed, REQUIRED_CHECKS.length)

  const outputPath = path.join(fixture.appDataDir, 'rc-upgrade-smoke-report.json')
  const writtenPath = writeReport({ report, outputPath })
  assert.equal(writtenPath, outputPath)
  assert.equal(JSON.parse(fs.readFileSync(writtenPath, 'utf-8')).artifact.legacyDirName, LEGACY_USER_DATA_DIR_NAME)
})

test('createRcUpgradeSmokeReport can generate a pending template without seeded legacy data', () => {
  const appDataDir = createTempDir('openpet-rc-upgrade-template-')
  const report = createRcUpgradeSmokeReport({
    appDataDir,
    observedUserDataDir: '',
    platform: 'win32',
    arch: 'x64',
    now: () => new Date('2026-06-16T00:00:00.000Z')
  })

  assert.equal(report.checks.every((check) => check.status === 'pending'), true)

  const pending = validateReport(report, { allowPending: true })
  assert.equal(pending.ok, true)
  assert.equal(pending.summary.upgradeReady, false)
})

test('validateReport rejects a current OpenPet userData directory that looks active', () => {
  const fixture = seedLegacyUserData({ withCurrentData: true })
  const report = createRcUpgradeSmokeReport({
    appDataDir: fixture.appDataDir,
    observedUserDataDir: fixture.legacyUserDataDir,
    platform: 'darwin',
    arch: 'arm64',
    now: () => new Date('2026-06-16T00:00:00.000Z')
  })

  const active = validateReport(report)
  assert.equal(active.ok, false)
  assert.match(active.errors.join('\n'), /openpet-dir-not-active/)
})

test('parseArgs accepts app-data, observed, output, and help flags through the CLI module', () => {
  const { parseArgs } = require('../../scripts/create-rc-upgrade-smoke-report')
  const options = parseArgs([
    '--app-data-dir', '/tmp/appData',
    '--observed-user-data-dir', '/tmp/appData/ibot',
    '--output', '/tmp/report.json'
  ])

  assert.equal(options.appDataDir, '/tmp/appData')
  assert.equal(options.observedUserDataDir, '/tmp/appData/ibot')
  assert.equal(options.outputPath, '/tmp/report.json')
})

test('validateReport accepts pending reports only with allowPending', () => {
  const report = createRcUpgradeSmokeReport({
    appDataDir: createTempDir('openpet-rc-upgrade-pending-'),
    observedUserDataDir: '',
    platform: 'darwin',
    arch: 'arm64',
    now: () => new Date('2026-06-16T00:00:00.000Z')
  })

  assert.equal(validateReport(report).ok, false)
  assert.equal(validateReport(report, { allowPending: true }).ok, true)
})
