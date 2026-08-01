const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

const { createCatalogService } = require('../../src/main/services/catalog-service')
const { createPluginInstallService } = require('../../src/main/services/plugin-install-service')
const { createPluginService } = require('../../src/main/services/plugin-service')
const { createPetPackService, BUILT_IN_PACK_ID } = require('../../src/main/services/pet-pack-service')

const sha256Buffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

const createTempDir = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `openpet-${name}-`))

const createSettingsService = (initialSettings = {}) => {
  let settings = {
    plugins: { enabled: {}, config: {}, storage: {}, logs: {}, installed: {} },
    petPacks: { activePackId: BUILT_IN_PACK_ID, installed: {} },
    ecosystem: { blocklist: { pluginIds: [], packIds: [], sha256: [] } },
    ...initialSettings
  }
  return {
    get: () => settings,
    save: (nextSettings) => {
      settings = nextSettings
      return settings
    }
  }
}

const writeCatalog = (catalog) => {
  const root = createTempDir('catalog')
  const catalogPath = path.join(root, 'catalog.json')
  fs.writeFileSync(catalogPath, JSON.stringify({ schemaVersion: 1, ...catalog }, null, 2))
  return catalogPath
}

const zipDirectory = (sourceDir) => {
  const zipPath = path.join(createTempDir('catalog-zip'), 'package.zip')
  execFileSync('zip', ['-qr', zipPath, '.'], { cwd: sourceDir })
  const buffer = fs.readFileSync(zipPath)
  return { zipPath, buffer, sha256: sha256Buffer(buffer) }
}

const createPluginPackage = ({ id = 'focus-timer', version = '1.0.0' } = {}) => {
  const root = createTempDir('catalog-plugin')
  fs.writeFileSync(path.join(root, 'plugin.json'), JSON.stringify({
    id,
    name: 'Focus Timer',
    version,
    main: 'index.js',
    permissions: ['pet:say'],
    commands: [{ id: 'start', title: 'Start' }]
  }, null, 2))
  fs.writeFileSync(path.join(root, 'index.js'), `
    module.exports = function activate(ctx) {
      return { start: async () => ctx.pet.say('focus') }
    }
  `)
  return root
}

const createPetPackDirectory = ({ id = 'pixel-cat', version = '1.0.0' } = {}) => {
  const root = createTempDir('catalog-pet-pack')
  fs.mkdirSync(path.join(root, 'sprites'), { recursive: true })
  fs.writeFileSync(path.join(root, 'sprites', 'idle.png'), '')
  fs.writeFileSync(path.join(root, 'pet.json'), JSON.stringify({
    schemaVersion: 1,
    id,
    displayName: 'Pixel Cat',
    version,
    defaultAction: 'idle',
    clickAction: 'idle',
    actions: [{ id: 'idle', label: 'Idle', kind: 'idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }]
  }, null, 2))
  return root
}

const createResponse = (buffer, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  headers: { get: (name) => (name === 'content-length' ? String(buffer.byteLength) : '') },
  arrayBuffer: async () => buffer
})

const createRealServices = ({ settingsService = createSettingsService(), catalogPath, fetchImpl, downloadTimeoutMs, maxPackageBytes } = {}) => {
  const pluginDir = createTempDir('catalog-installed-plugins')
  const userPacksDir = createTempDir('catalog-installed-packs')
  let catalogService = null
  const pluginInstallService = createPluginInstallService({
    settingsService,
    pluginDir,
    getPluginBlockStatus: (candidate) => catalogService?.getPluginBlockStatus(candidate) || { blocked: false, reasons: [] }
  })
  const pluginService = createPluginService({
    settingsService,
    petService: { say: async (payload) => payload },
    pluginDirs: [pluginDir],
    getPluginBlockStatus: (candidate) => catalogService?.getPluginBlockStatus(candidate) || { blocked: false, reasons: [] }
  })
  const petPackService = createPetPackService({
    settingsService,
    userPacksDir,
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [{ id: 'idle', sprite: 'cat_anime/sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 1, frameHeight: 1 }] }),
    getPetPackBlockStatus: (candidate) => catalogService?.getPetPackBlockStatus(candidate) || { blocked: false, reasons: [] }
  })
  catalogService = createCatalogService({
    settingsService,
    pluginInstallService,
    pluginService,
    petPackService,
    catalogPath,
    fetchImpl,
    tempRoot: createTempDir('catalog-temp'),
    downloadTimeoutMs,
    maxPackageBytes
  })
  return { catalogService, settingsService, pluginService, petPackService }
}

test('catalog service annotates installed entries and update availability', () => {
  const catalogPath = writeCatalog({
    plugins: [{ id: 'focus-timer', name: 'Focus Timer', version: '1.1.0' }],
    petPacks: [{ id: 'pixel-cat', displayName: 'Pixel Cat', version: '1.0.0' }]
  })
  const catalogService = createCatalogService({
    settingsService: createSettingsService(),
    pluginInstallService: { clearPendingSelection: () => ({ ok: true }) },
    pluginService: { listPlugins: () => [{ id: 'focus-timer', version: '1.0.0' }] },
    petPackService: { listPacks: () => ({ packs: [{ id: 'pixel-cat', version: '1.0.0' }] }) },
    catalogPath,
    fetchImpl: async () => { throw new Error('not used') }
  })

  const catalog = catalogService.listCatalog()

  assert.equal(catalog.plugins[0].installed, true)
  assert.equal(catalog.plugins[0].updateAvailable, true)
  assert.equal(catalog.petPacks[0].installed, true)
  assert.equal(catalog.petPacks[0].updateAvailable, false)
})

test('catalog service rejects downloaded packages with mismatched hashes', async () => {
  const buffer = Buffer.from('not a zip')
  const catalogPath = writeCatalog({
    plugins: [{ id: 'focus-timer', name: 'Focus Timer', version: '1.0.0', packageUrl: 'https://catalog.test/focus.zip', sha256: '0'.repeat(64) }]
  })
  const { catalogService } = createRealServices({
    catalogPath,
    fetchImpl: async () => createResponse(buffer)
  })

  await assert.rejects(
    () => catalogService.prepareInstall({ kind: 'plugin', itemId: 'focus-timer' }),
    /sha256 does not match/
  )
})

test('catalog service cancels failed package responses before preserving the HTTP error', async () => {
  let canceled = false
  const catalogPath = writeCatalog({
    plugins: [{ id: 'focus-timer', name: 'Focus Timer', version: '1.0.0', packageUrl: 'https://catalog.test/focus.zip', sha256: '0'.repeat(64) }]
  })
  const { catalogService } = createRealServices({
    catalogPath,
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      body: {
        cancel: async () => {
          canceled = true
          throw new Error('catalog body cancellation failed')
        }
      }
    })
  })

  await assert.rejects(
    () => catalogService.prepareInstall({ kind: 'plugin', itemId: 'focus-timer' }),
    { message: 'Catalog download failed with HTTP 503' }
  )
  assert.equal(canceled, true)
})

test('catalog service does not wait for failed response cancellation before rejecting', async () => {
  let canceled = false
  const catalogPath = writeCatalog({
    plugins: [{ id: 'focus-timer', name: 'Focus Timer', version: '1.0.0', packageUrl: 'https://catalog.test/focus.zip', sha256: '0'.repeat(64) }]
  })
  const { catalogService } = createRealServices({
    catalogPath,
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      body: {
        cancel: () => {
          canceled = true
          return new Promise(() => {})
        }
      }
    })
  })

  let watchdog
  const outcome = await Promise.race([
    catalogService.prepareInstall({ kind: 'plugin', itemId: 'focus-timer' })
      .then(() => ({ status: 'resolved' }), (error) => ({ status: 'rejected', error })),
    new Promise((resolve) => {
      watchdog = setTimeout(() => resolve({ status: 'pending' }), 50)
    })
  ])
  clearTimeout(watchdog)

  assert.equal(canceled, true)
  assert.equal(outcome.status, 'rejected')
  assert.equal(outcome.error.message, 'Catalog download failed with HTTP 503')
})

test('catalog service times out stalled package downloads', async () => {
  const catalogPath = writeCatalog({
    plugins: [{ id: 'focus-timer', name: 'Focus Timer', version: '1.0.0', packageUrl: 'https://catalog.test/focus.zip', sha256: '0'.repeat(64) }]
  })
  const { catalogService } = createRealServices({
    catalogPath,
    downloadTimeoutMs: 1,
    fetchImpl: async () => new Promise(() => {})
  })

  await assert.rejects(
    () => catalogService.prepareInstall({ kind: 'plugin', itemId: 'focus-timer' }),
    /timed out/
  )
})

test('catalog service cancels an archive stream as soon as it exceeds the byte limit without content-length', async () => {
  let index = 0
  let canceled = false
  const chunks = [Buffer.alloc(4, 1), Buffer.alloc(5, 2)]
  const response = {
    ok: true,
    status: 200,
    headers: { get: () => '' },
    body: {
      getReader: () => ({
        read: async () => index < chunks.length
          ? { done: false, value: chunks[index++] }
          : { done: true, value: undefined },
        cancel: async () => { canceled = true },
        releaseLock: () => {}
      })
    },
    arrayBuffer: async () => { throw new Error('streaming responses must not be fully buffered') }
  }
  const catalogPath = writeCatalog({
    plugins: [{ id: 'focus-timer', name: 'Focus Timer', version: '1.0.0', packageUrl: 'https://catalog.test/focus.zip', sha256: '0'.repeat(64) }]
  })
  const { catalogService } = createRealServices({
    catalogPath,
    fetchImpl: async () => response,
    maxPackageBytes: 8
  })

  await assert.rejects(
    () => catalogService.prepareInstall({ kind: 'plugin', itemId: 'focus-timer' }),
    /exceeds 8 bytes/
  )
  assert.equal(canceled, true)
})

test('catalog service downloads, reviews, and installs a plugin package', async () => {
  const pluginZip = zipDirectory(createPluginPackage())
  const catalogPath = writeCatalog({
    plugins: [{ id: 'focus-timer', name: 'Focus Timer', version: '1.0.0', packageUrl: 'https://catalog.test/focus.zip', sha256: pluginZip.sha256 }]
  })
  const { catalogService, settingsService, pluginService } = createRealServices({
    catalogPath,
    fetchImpl: async () => createResponse(pluginZip.buffer)
  })

  const selection = await catalogService.prepareInstall({ kind: 'plugin', itemId: 'focus-timer' })
  const installed = catalogService.installSelection(selection.selectionId)

  assert.equal(selection.pluginReview.plugin.id, 'focus-timer')
  assert.equal(installed.ok, true)
  assert.equal(settingsService.get().plugins.installed['focus-timer'].sourcePackageHash, pluginZip.sha256)
  assert.equal(pluginService.listPlugins().some((plugin) => plugin.id === 'focus-timer'), true)
})

test('catalog service downloads and installs a pet pack package', async () => {
  const packZip = zipDirectory(createPetPackDirectory())
  const catalogPath = writeCatalog({
    petPacks: [{ id: 'pixel-cat', displayName: 'Pixel Cat', version: '1.0.0', packageUrl: 'https://catalog.test/pixel.zip', sha256: packZip.sha256 }]
  })
  const { catalogService, settingsService, petPackService } = createRealServices({
    catalogPath,
    fetchImpl: async () => createResponse(packZip.buffer)
  })

  const selection = await catalogService.prepareInstall({ kind: 'pet-pack', itemId: 'pixel-cat' })
  const installed = catalogService.installSelection(selection.selectionId)

  assert.equal(selection.petPackReview.pack.id, 'pixel-cat')
  assert.equal(installed.ok, true)
  assert.equal(settingsService.get().petPacks.installed['pixel-cat'].packageHash, selection.petPackReview.pack.packageHash)
  assert.equal(settingsService.get().petPacks.installed['pixel-cat'].sourcePackageHash, packZip.sha256)

  catalogService.addBlocklistEntry({ type: 'sha256', value: selection.petPackReview.pack.packageHash })
  catalogService.addBlocklistEntry({ type: 'sha256', value: packZip.sha256 })

  const catalog = catalogService.listCatalog()
  assert.equal(catalog.petPacks[0].blockStatus.blocked, true)
  assert.equal(catalog.petPacks[0].blockStatus.reasons.some((reason) => reason === `sha256:${selection.petPackReview.pack.packageHash}`), true)
  assert.equal(catalog.petPacks[0].blockStatus.reasons.some((reason) => reason === `sha256:${packZip.sha256}`), true)
  assert.throws(() => petPackService.setActivePack('pixel-cat'), /blocked/)
})

test('catalog service rejects unsafe catalog item ids', () => {
  const catalogPath = writeCatalog({
    plugins: [{ id: '../focus-timer', name: 'Focus Timer', version: '1.0.0' }]
  })
  const catalogService = createCatalogService({
    settingsService: createSettingsService(),
    pluginInstallService: { clearPendingSelection: () => ({ ok: true }) },
    pluginService: { listPlugins: () => [] },
    petPackService: { listPacks: () => ({ packs: [] }) },
    catalogPath,
    fetchImpl: async () => { throw new Error('not used') }
  })

  assert.throws(() => catalogService.listCatalog(), /safe id/)
})

test('catalog service blocks install by local plugin id blocklist', async () => {
  const pluginZip = zipDirectory(createPluginPackage())
  const catalogPath = writeCatalog({
    plugins: [{ id: 'focus-timer', name: 'Focus Timer', version: '1.0.0', packageUrl: 'https://catalog.test/focus.zip', sha256: pluginZip.sha256 }]
  })
  const { catalogService } = createRealServices({
    settingsService: createSettingsService({ ecosystem: { blocklist: { pluginIds: ['focus-timer'], packIds: [], sha256: [] } } }),
    catalogPath,
    fetchImpl: async () => createResponse(pluginZip.buffer)
  })

  await assert.rejects(
    () => catalogService.prepareInstall({ kind: 'plugin', itemId: 'focus-timer' }),
    /blocked/
  )
})

test('catalog service manages local blocklist entries', () => {
  const catalogService = createCatalogService({
    settingsService: createSettingsService(),
    pluginInstallService: { clearPendingSelection: () => ({ ok: true }) },
    pluginService: { listPlugins: () => [] },
    petPackService: { listPacks: () => ({ packs: [] }) },
    catalogPath: writeCatalog({}),
    fetchImpl: async () => { throw new Error('not used') }
  })

  catalogService.addBlocklistEntry({ type: 'pluginId', value: 'focus-timer' })
  catalogService.addBlocklistEntry({ type: 'packId', value: 'pack_cat' })
  catalogService.addBlocklistEntry({ type: 'sha256', value: 'A'.repeat(64) })
  catalogService.removeBlocklistEntry({ type: 'pluginId', value: 'focus-timer' })

  assert.deepEqual(catalogService.getLocalBlocklist(), {
    pluginIds: [],
    packIds: ['pack_cat'],
    sha256: ['a'.repeat(64)]
  })
})
