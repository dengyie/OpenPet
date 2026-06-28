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
  const bootstrapSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'main', 'bootstrap', 'create-plugin-services.js'),
    'utf8'
  )
  const syncIndex = bootstrapSource.indexOf('syncBundledPlugins({')
  const installIndex = bootstrapSource.indexOf('createPluginInstallService({')
  const serviceIndex = bootstrapSource.indexOf('createPluginService({')

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

test('configureUserDataPath requires an Electron app-like object', () => {
  assert.throws(() => configureUserDataPath(), /Electron app is required/)
  assert.throws(() => configureUserDataPath({ app: { getPath: () => '/tmp' } }), /Electron app is required/)
  assert.throws(() => configureUserDataPath({ app: { setPath: () => {} } }), /Electron app is required/)
})
