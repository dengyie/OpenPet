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
