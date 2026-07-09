const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { syncBundledPlugins } = require('../../src/main/services/bundled-plugin-sync-service')

const createSettingsService = (initialSettings = {}) => {
  let current = {
    ...initialSettings,
    plugins: {
      enabled: {},
      config: {},
      storage: {},
      logs: [],
      installed: {},
      ...(initialSettings.plugins || {})
    }
  }

  return {
    get: () => current,
    save: (settings) => {
      current = settings
      return current
    }
  }
}

const writePlugin = ({ root, folderName, id = 'openpet.creator-studio', version = '0.1.0', marker = 'fresh' }) => {
  const pluginPath = path.join(root, folderName)
  fs.mkdirSync(path.join(pluginPath, 'commands'), { recursive: true })
  fs.writeFileSync(path.join(pluginPath, 'plugin.json'), JSON.stringify({
    id,
    name: 'Creator Studio',
    version,
    entries: {
      commands: [{ id: 'create-run', title: 'Create Run', command: 'node ./commands/create-run.js', cwd: '.' }]
    }
  }, null, 2))
  fs.writeFileSync(path.join(pluginPath, 'commands', 'create-run.js'), `module.exports = ${JSON.stringify(marker)}\n`)
  return pluginPath
}

test('syncBundledPlugins replaces stale same-id plugin copies with the bundled version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-bundled-plugin-sync-'))
  const pluginDir = path.join(root, 'plugins')
  const bundledRoot = path.join(root, 'bundled')
  const settingsService = createSettingsService({
    plugins: {
      enabled: { 'openpet.creator-studio': true },
      config: { 'openpet.creator-studio': { backend: 'local' } },
      storage: { 'openpet.creator-studio': { latestRunId: 'run-1' } },
      installed: {
        'openpet.creator-studio': {
          packageHash: 'stale',
          custom: 'preserved',
          signatureStatus: 'unsigned',
          updatedAt: '2026-06-19T00:00:00.000Z'
        }
      }
    }
  })
  const bundledPlugin = writePlugin({ root: bundledRoot, folderName: 'creator-studio', marker: 'fresh' })
  const stalePlugin = writePlugin({ root: pluginDir, folderName: 'creator-studio', marker: 'stale' })

  const result = syncBundledPlugins({
    pluginDir,
    bundledPluginDirs: [bundledPlugin],
    settingsService
  })

  const targetDir = path.join(pluginDir, 'openpet.creator-studio')
  assert.equal(result.synced.length, 1)
  assert.equal(result.synced[0].pluginId, 'openpet.creator-studio')
  assert.equal(fs.existsSync(stalePlugin), false)
  assert.equal(fs.readFileSync(path.join(targetDir, 'commands', 'create-run.js'), 'utf8'), 'module.exports = "fresh"\n')
  assert.equal(settingsService.get().plugins.enabled['openpet.creator-studio'], true)
  assert.deepEqual(settingsService.get().plugins.config['openpet.creator-studio'], { backend: 'local' })
  assert.deepEqual(settingsService.get().plugins.storage['openpet.creator-studio'], { latestRunId: 'run-1' })
  assert.notEqual(settingsService.get().plugins.installed['openpet.creator-studio'].packageHash, 'stale')
  assert.equal(settingsService.get().plugins.installed['openpet.creator-studio'].custom, 'preserved')
  assert.equal(settingsService.get().plugins.installed['openpet.creator-studio'].id, 'openpet.creator-studio')
  assert.equal(settingsService.get().plugins.installed['openpet.creator-studio'].name, 'Creator Studio')
  assert.equal(settingsService.get().plugins.installed['openpet.creator-studio'].managedBy, 'bundled')
})

test('syncBundledPlugins enables newly bundled plugins by default', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-bundled-plugin-enabled-'))
  const pluginDir = path.join(root, 'plugins')
  const bundledRoot = path.join(root, 'bundled')
  const settingsService = createSettingsService()
  const bundledPlugin = writePlugin({ root: bundledRoot, folderName: 'creator-studio', marker: 'fresh' })

  syncBundledPlugins({
    pluginDir,
    bundledPluginDirs: [bundledPlugin],
    settingsService
  })

  assert.equal(settingsService.get().plugins.enabled['openpet.creator-studio'], true)
})

test('syncBundledPlugins leaves current bundled plugin copies unchanged', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-bundled-plugin-current-'))
  const pluginDir = path.join(root, 'plugins')
  const bundledRoot = path.join(root, 'bundled')
  const settingsService = createSettingsService()
  const bundledPlugin = writePlugin({ root: bundledRoot, folderName: 'creator-studio', marker: 'fresh' })

  syncBundledPlugins({ pluginDir, bundledPluginDirs: [bundledPlugin], settingsService })
  const targetFile = path.join(pluginDir, 'openpet.creator-studio', 'commands', 'create-run.js')
  const firstMtimeMs = fs.statSync(targetFile).mtimeMs
  const result = syncBundledPlugins({ pluginDir, bundledPluginDirs: [bundledPlugin], settingsService })

  assert.deepEqual(result.synced, [])
  assert.equal(fs.statSync(targetFile).mtimeMs, firstMtimeMs)
})

test('syncBundledPlugins copies bundled plugins even when fs.cpSync cannot copy the source tree directly', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-bundled-plugin-fallback-'))
  const pluginDir = path.join(root, 'plugins')
  const bundledRoot = path.join(root, 'bundled')
  const settingsService = createSettingsService()
  const bundledPlugin = writePlugin({ root: bundledRoot, folderName: 'creator-studio', marker: 'asar-safe-copy' })
  const originalCpSync = fs.cpSync

  fs.cpSync = (sourceDir, targetDir, options) => {
    if (path.resolve(sourceDir) === path.resolve(bundledPlugin)) {
      const error = new Error(`ENOENT, ${path.basename(sourceDir)} not found in ${sourceDir}`)
      error.code = 'ENOENT'
      throw error
    }
    return originalCpSync(sourceDir, targetDir, options)
  }

  try {
    const result = syncBundledPlugins({
      pluginDir,
      bundledPluginDirs: [bundledPlugin],
      settingsService
    })

    const targetDir = path.join(pluginDir, 'openpet.creator-studio')
    assert.equal(result.synced.length, 1)
    assert.equal(
      fs.readFileSync(path.join(targetDir, 'commands', 'create-run.js'), 'utf8'),
      'module.exports = "asar-safe-copy"\n'
    )
  } finally {
    fs.cpSync = originalCpSync
  }
})

test('syncBundledPlugins prefers fs.cpSync when direct recursive copy succeeds', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-bundled-plugin-cpsync-'))
  const pluginDir = path.join(root, 'plugins')
  const bundledRoot = path.join(root, 'bundled')
  const settingsService = createSettingsService()
  const bundledPlugin = writePlugin({ root: bundledRoot, folderName: 'creator-studio', marker: 'native-copy' })
  const originalCpSync = fs.cpSync
  let cpSyncCalls = 0

  fs.cpSync = (sourceDir, targetDir, options) => {
    cpSyncCalls += 1
    return originalCpSync(sourceDir, targetDir, options)
  }

  try {
    syncBundledPlugins({
      pluginDir,
      bundledPluginDirs: [bundledPlugin],
      settingsService
    })

    assert.equal(cpSyncCalls, 1)
    assert.equal(
      fs.readFileSync(path.join(pluginDir, 'openpet.creator-studio', 'commands', 'create-run.js'), 'utf8'),
      'module.exports = "native-copy"\n'
    )
  } finally {
    fs.cpSync = originalCpSync
  }
})
