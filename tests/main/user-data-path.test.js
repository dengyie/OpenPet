const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { LEGACY_USER_DATA_DIR_NAME, configureUserDataPath } = require('../../src/main/user-data-path')

const createFakeApp = ({ appData, userData }) => {
  const paths = { appData, userData }
  const setPathCalls = []
  return {
    setPathCalls,
    getPath(name) {
      if (!(name in paths)) throw new Error(`Unknown path: ${name}`)
      return paths[name]
    },
    setPath(name, value) {
      setPathCalls.push([name, value])
      paths[name] = value
    }
  }
}

const createTempAppData = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-user-data-'))

test('main configures legacy userData before requesting the single instance lock', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'main.js'), 'utf8')
  const configureIndex = mainSource.indexOf('configureUserDataPath({ app })')
  const lockIndex = mainSource.indexOf('configureSingleInstanceLock({ app, getPetWindow })')

  assert.notEqual(configureIndex, -1)
  assert.notEqual(lockIndex, -1)
  assert.ok(configureIndex < lockIndex)
})

test('main syncs bundled creator studio plugin before plugin services read pluginDir', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'main.js'), 'utf8')
  const syncIndex = mainSource.indexOf('syncBundledPlugins({')
  const installIndex = mainSource.indexOf('createPluginInstallService({')
  const serviceIndex = mainSource.indexOf('createPluginService({')

  assert.notEqual(syncIndex, -1)
  assert.notEqual(installIndex, -1)
  assert.notEqual(serviceIndex, -1)
  assert.ok(syncIndex < installIndex)
  assert.ok(syncIndex < serviceIndex)
})

test('configureUserDataPath keeps OpenPet upgrades on the legacy ibot userData directory', () => {
  const appData = createTempAppData()
  const app = createFakeApp({
    appData,
    userData: path.join(appData, 'OpenPet')
  })

  const configuredPath = configureUserDataPath({ app })

  assert.equal(configuredPath, path.join(appData, LEGACY_USER_DATA_DIR_NAME))
  assert.deepEqual(app.setPathCalls, [['userData', configuredPath]])
  assert.equal(app.getPath('userData'), configuredPath)
  assert.equal(fs.existsSync(configuredPath), true)
})

test('configureUserDataPath handles package-name derived lowercase userData directories', () => {
  const appData = createTempAppData()
  const app = createFakeApp({
    appData,
    userData: path.join(appData, 'openpet')
  })

  const configuredPath = configureUserDataPath({ app })

  assert.equal(configuredPath, path.join(appData, LEGACY_USER_DATA_DIR_NAME))
  assert.deepEqual(app.setPathCalls, [['userData', configuredPath]])
})

test('configureUserDataPath leaves the legacy userData directory untouched when already configured', () => {
  const appData = createTempAppData()
  const legacyPath = path.join(appData, LEGACY_USER_DATA_DIR_NAME)
  const app = createFakeApp({ appData, userData: legacyPath })

  const configuredPath = configureUserDataPath({ app })

  assert.equal(configuredPath, legacyPath)
  assert.deepEqual(app.setPathCalls, [])
  assert.equal(fs.existsSync(configuredPath), true)
})

test('configureUserDataPath uses isolated automation userData when desktop automation mode is enabled', () => {
  const appData = createTempAppData()
  const app = createFakeApp({
    appData,
    userData: path.join(appData, 'OpenPet')
  })
  const previousIsolation = process.env.OPENPET_AUTOMATION_ISOLATION
  const previousDesktop = process.env.OPENPET_AUTOMATION_TARGET_DESKTOP
  const previousUserDataDir = process.env.OPENPET_USER_DATA_DIR
  process.env.OPENPET_AUTOMATION_ISOLATION = '1'
  process.env.OPENPET_AUTOMATION_TARGET_DESKTOP = '2'
  delete process.env.OPENPET_USER_DATA_DIR

  try {
    const configuredPath = configureUserDataPath({ app })

    assert.equal(configuredPath, path.join(appData, 'ibot-automation-desktop-2'))
    assert.deepEqual(app.setPathCalls, [['userData', configuredPath]])
    assert.equal(process.env.OPENPET_USER_DATA_DIR, configuredPath)
    assert.equal(fs.existsSync(configuredPath), true)
  } finally {
    if (previousIsolation === undefined) delete process.env.OPENPET_AUTOMATION_ISOLATION
    else process.env.OPENPET_AUTOMATION_ISOLATION = previousIsolation
    if (previousDesktop === undefined) delete process.env.OPENPET_AUTOMATION_TARGET_DESKTOP
    else process.env.OPENPET_AUTOMATION_TARGET_DESKTOP = previousDesktop
    if (previousUserDataDir === undefined) delete process.env.OPENPET_USER_DATA_DIR
    else process.env.OPENPET_USER_DATA_DIR = previousUserDataDir
  }
})

test('configureUserDataPath requires an Electron app-like object', () => {
  assert.throws(() => configureUserDataPath(), /Electron app is required/)
  assert.throws(() => configureUserDataPath({ app: { getPath: () => '/tmp' } }), /Electron app is required/)
  assert.throws(() => configureUserDataPath({ app: { setPath: () => {} } }), /Electron app is required/)
})
