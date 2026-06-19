const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

const { createActionService } = require('../../src/main/services/action-service')
const { BUILT_IN_PACK_ID, createPetPackService } = require('../../src/main/services/pet-pack-service')
const { createMinimalWebp: createFixtureWebp } = require('../../examples/plugins/creator-studio/lib/fake-hatch-pet')

const createSettingsService = (initialSettings = {}) => {
  let settings = {
    petPacks: {
      activePackId: BUILT_IN_PACK_ID,
      installed: {}
    },
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

const createTempDir = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `openpet-${name}-`))

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const FIXTURE_ATLAS_WEBP = Buffer.from(
  'UklGRkIUAABXRUJQVlA4IDYUAACwXwKdASoABlAHPm02mUmkIqKhIAgAgA2JaW7hd2EbQAoMdOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ychvAAP7+Wb/0l0t5H//9ZX//zK//+ZX+8mbIAApNAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
  'base64'
)

const TRANSPARENT_FIXTURE_ATLAS_WEBP = Buffer.from([
  'UklGRpgAAABXRUJQVlA4TIsAAAAv/8XTEQcQEREAUKT//ymi/6n//e9///vf//73',
  'v//973//+9///ve///3vf//73//+97///e9///vf//73v//973//+9///ve///3',
  'vf//73//+97///e9///vf//73v//973//+9///ve///3vf//73//+97///e9///',
  'vf//73v//973//+9///q8CAA=='
].join(''), 'base64')

const createPetPackDirectory = (root, manifest = {}) => {
  fs.mkdirSync(path.join(root, 'sprites'), { recursive: true })
  const actions = manifest.actions || [
    { id: 'idle', label: 'Idle', kind: 'idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
    { id: 'wave', label: 'Wave', kind: 'greeting', sprite: 'sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
  ]
  for (const action of actions) {
    fs.writeFileSync(path.join(root, action.sprite), '')
  }
  fs.writeFileSync(path.join(root, 'pet.json'), JSON.stringify({
    schemaVersion: 1,
    id: manifest.id || 'pack-cat',
    displayName: manifest.displayName || 'Pack Cat',
    version: manifest.version || '1.0.0',
    ...(manifest.sourceUrl ? { sourceUrl: manifest.sourceUrl } : {}),
    ...(manifest.assetAuthor ? { assetAuthor: manifest.assetAuthor } : {}),
    ...(manifest.license ? { license: manifest.license } : {}),
    ...(manifest.licenseUrl ? { licenseUrl: manifest.licenseUrl } : {}),
    defaultAction: manifest.defaultAction || actions[0].id,
    clickAction: manifest.clickAction || actions[1]?.id || actions[0].id,
    actions
  }))
}

const createMinimalWebp = ({ width, height }) => {
  if (width === 1536 && height === 1872) return createFixtureWebp()
  const buffer = Buffer.alloc(30)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(22, 4)
  buffer.write('WEBP', 8, 'ascii')
  buffer.write('VP8X', 12, 'ascii')
  buffer.writeUInt32LE(10, 16)
  buffer.writeUInt8(0, 20)
  buffer.writeUIntLE(width - 1, 24, 3)
  buffer.writeUIntLE(height - 1, 27, 3)
  return buffer
}

const createCodexPetDirectory = (root, manifest = {}) => {
  fs.writeFileSync(
    path.join(root, manifest.spritesheetPath || 'spritesheet.webp'),
    manifest.spritesheet || createMinimalWebp({ width: 1536, height: 1872 })
  )
  fs.writeFileSync(path.join(root, 'pet.json'), JSON.stringify({
    id: manifest.id || 'codex-cat',
    displayName: manifest.displayName || 'Codex Cat',
    description: manifest.description || 'A Codex-compatible pet.',
    spritesheetPath: manifest.spritesheetPath || 'spritesheet.webp'
  }))
}

const createZipFromDirectory = (sourceDir, zipName = 'pet.codex-pet.zip') => {
  const zipRoot = createTempDir('pet-pack-zip')
  const zipPath = path.join(zipRoot, zipName)
  execFileSync('zip', ['-qr', zipPath, '.'], { cwd: sourceDir })
  return zipPath
}

const createUnsafeZip = () => {
  const sourceRoot = createTempDir('pet-pack-unsafe-src')
  const nested = path.join(sourceRoot, 'nested')
  fs.mkdirSync(nested)
  fs.writeFileSync(path.join(sourceRoot, 'evil.txt'), 'evil')
  const zipPath = path.join(sourceRoot, 'unsafe.codex-pet.zip')
  execFileSync('zip', ['-q', zipPath, '../evil.txt'], { cwd: nested })
  return zipPath
}

const createService = (settingsService = createSettingsService()) => createPetPackService({
  settingsService,
  userPacksDir: createTempDir('pet-packs'),
  projectRoot: '/app/openpet',
  loadLegacyAnimations: () => ({
    defaultAction: 'bai_no_bg',
    clickAction: 'eat_no_bg',
    actions: [
      { id: 'bai_no_bg', label: '待机', loop: true, frameCount: 16, frameMs: 95, frameWidth: 191, frameHeight: 453, sprite: 'cat_anime/sprites/bai_no_bg.png' },
      { id: 'eat_no_bg', label: '喂食', loop: false, frameCount: 16, frameMs: 85, frameWidth: 381, frameHeight: 253, sprite: 'cat_anime/sprites/eat_no_bg.png' }
    ]
  }),
  now: () => new Date('2026-06-12T00:00:00.000Z')
})

const createServiceWithBundledPacks = ({ settingsService = createSettingsService(), bundledPacksDir, getPetPackBlockStatus }) => createPetPackService({
  settingsService,
  userPacksDir: createTempDir('pet-packs'),
  projectRoot: '/app/openpet',
  bundledPacksDir,
  loadLegacyAnimations: () => ({
    defaultAction: 'bai_no_bg',
    clickAction: 'eat_no_bg',
    actions: [
      { id: 'bai_no_bg', label: '待机', loop: true, frameCount: 16, frameMs: 95, frameWidth: 191, frameHeight: 453, sprite: 'cat_anime/sprites/bai_no_bg.png' },
      { id: 'eat_no_bg', label: '喂食', loop: false, frameCount: 16, frameMs: 85, frameWidth: 381, frameHeight: 253, sprite: 'cat_anime/sprites/eat_no_bg.png' }
    ]
  }),
  now: () => new Date('2026-06-12T00:00:00.000Z'),
  getPetPackBlockStatus
})

test('pet pack service lists the built-in legacy pack and bundled choices', () => {
  const service = createService()

  const result = service.listPacks()
  const packs = new Map(result.packs.map((pack) => [pack.id, pack]))

  assert.equal(result.activePackId, BUILT_IN_PACK_ID)
  assert.equal(result.packs.length, 4)
  assert.equal(packs.get(BUILT_IN_PACK_ID).source, 'built-in')
  assert.equal(packs.get(BUILT_IN_PACK_ID).active, true)
  assert.equal(packs.get(BUILT_IN_PACK_ID).actionCount, 2)
  assert.equal(packs.get('doro').source, 'built-in')
  assert.equal(packs.get('duodong').source, 'built-in')
  assert.equal(packs.get('chispa').source, 'built-in')
  assert.equal(packs.get('doro').previewAction.atlas.columns, 8)
})

test('pet pack service lists bundled pet packs as built-in choices', () => {
  const bundledPacksDir = createTempDir('bundled-pet-packs')
  const doroDir = path.join(bundledPacksDir, 'doro')
  const duodongDir = path.join(bundledPacksDir, 'duodong')
  fs.mkdirSync(doroDir)
  fs.mkdirSync(duodongDir)
  createCodexPetDirectory(doroDir, { id: 'doro', displayName: 'Doro' })
  createCodexPetDirectory(duodongDir, { id: 'duodong', displayName: '多栋' })
  const service = createServiceWithBundledPacks({ bundledPacksDir })

  const result = service.listPacks()
  const packs = new Map(result.packs.map((pack) => [pack.id, pack]))

  assert.equal(result.activePackId, BUILT_IN_PACK_ID)
  assert.equal(packs.get(BUILT_IN_PACK_ID).source, 'built-in')
  assert.equal(packs.get('doro').source, 'built-in')
  assert.equal(packs.get('duodong').source, 'built-in')
  assert.equal(packs.get('doro').actionCount, 9)
  assert.match(packs.get('doro').previewSprite, /doro\/spritesheet\.webp$/)
})

test('pet pack service activates bundled pet packs without installing them', () => {
  const bundledPacksDir = createTempDir('bundled-pet-pack-active')
  const doroDir = path.join(bundledPacksDir, 'doro')
  fs.mkdirSync(doroDir)
  createCodexPetDirectory(doroDir, { id: 'doro', displayName: 'Doro' })
  const settingsService = createSettingsService()
  const service = createServiceWithBundledPacks({ settingsService, bundledPacksDir })
  const actionService = createActionService({ petPackService: service })

  const result = service.setActivePack('doro')
  actionService.reload()

  assert.equal(result.activePackId, 'doro')
  assert.equal(settingsService.get().petPacks.activePackId, 'doro')
  assert.equal(settingsService.get().petPacks.installed.doro, undefined)
  assert.equal(actionService.getPetPack().manifest.id, 'doro')
  assert.equal(actionService.getConfig().actions.length, 9)
})

test('pet pack service falls back to built-in when active installed Codex atlas is transparent', () => {
  const userPacksDir = createTempDir('pet-packs-transparent-active')
  const badPackDir = path.join(userPacksDir, 'transparent-pet')
  fs.mkdirSync(badPackDir)
  createCodexPetDirectory(badPackDir, {
    id: 'transparent-pet',
    displayName: 'Transparent Pet',
    spritesheet: TRANSPARENT_FIXTURE_ATLAS_WEBP
  })
  const settingsService = createSettingsService({
    petPacks: {
      activePackId: 'transparent-pet',
      installed: {
        'transparent-pet': {
          id: 'transparent-pet',
          displayName: 'Transparent Pet',
          version: '1.0.0',
          installedAt: '2026-06-12T00:00:00.000Z'
        }
      }
    }
  })
  const service = createPetPackService({
    settingsService,
    userPacksDir,
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({
      defaultAction: 'bai_no_bg',
      clickAction: 'eat_no_bg',
      actions: [
        { id: 'bai_no_bg', label: '待机', loop: true, frameCount: 16, frameMs: 95, frameWidth: 191, frameHeight: 453, sprite: 'cat_anime/sprites/bai_no_bg.png' },
        { id: 'eat_no_bg', label: '喂食', loop: false, frameCount: 16, frameMs: 85, frameWidth: 381, frameHeight: 253, sprite: 'cat_anime/sprites/eat_no_bg.png' }
      ]
    })
  })

  const pack = service.getActivePetPack()

  assert.equal(pack.manifest.id, BUILT_IN_PACK_ID)
  assert.equal(settingsService.get().petPacks.activePackId, BUILT_IN_PACK_ID)
})

test('pet pack service blocks bundled pet packs denied by content hash policy', () => {
  const bundledPacksDir = createTempDir('bundled-pet-pack-policy')
  const doroDir = path.join(bundledPacksDir, 'doro')
  fs.mkdirSync(doroDir)
  createCodexPetDirectory(doroDir, { id: 'doro', displayName: 'Doro' })
  const service = createServiceWithBundledPacks({
    bundledPacksDir,
    getPetPackBlockStatus: ({ packageHash }) => packageHash
      ? { blocked: true, reasons: ['sha256:bundled-doro'] }
      : { blocked: false, reasons: [] }
  })

  assert.throws(() => service.setActivePack('doro'), /blocked/)
})

test('pet pack service protects bundled pet packs from removal', () => {
  const bundledPacksDir = createTempDir('bundled-pet-pack-remove')
  const chispaDir = path.join(bundledPacksDir, 'chispa')
  fs.mkdirSync(chispaDir)
  createCodexPetDirectory(chispaDir, { id: 'chispa', displayName: 'Chispa' })
  const service = createServiceWithBundledPacks({ bundledPacksDir })

  assert.throws(() => service.removePack('chispa'), /built-in/)
})

test('pet pack service inspects and imports a valid pack directory', () => {
  const sourceDir = createTempDir('pet-pack-source')
  createPetPackDirectory(sourceDir)
  const settingsService = createSettingsService()
  const service = createService(settingsService)

  const inspection = service.inspectPackDirectory(sourceDir)
  const imported = service.importPack(inspection.selectionId)
  const listed = service.listPacks()

  assert.equal(inspection.valid, true)
  assert.equal(inspection.pack.id, 'pack-cat')
  assert.equal(imported.pack.id, 'pack-cat')
  assert.equal(settingsService.get().petPacks.installed['pack-cat'].version, '1.0.0')
  assert.equal(listed.packs.some((pack) => pack.id === 'pack-cat'), true)
})

test('pet pack service stores provenance metadata when importing a pack', () => {
  const sourceDir = createTempDir('pet-pack-provenance')
  createPetPackDirectory(sourceDir, {
    id: 'provenance-cat',
    displayName: 'Provenance Cat',
    version: '1.2.0',
    sourceUrl: 'https://example.com/provenance-cat',
    assetAuthor: 'OpenPet Test Assets',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://example.com/license'
  })
  const settingsService = createSettingsService()
  const service = createService(settingsService)

  const inspection = service.inspectPackDirectory(sourceDir)
  const imported = service.importPack(inspection.selectionId)
  const listedPack = service.listPacks().packs.find((pack) => pack.id === 'provenance-cat')

  assert.equal(imported.pack.provenance.sourceUrl, 'https://example.com/provenance-cat')
  assert.equal(imported.pack.provenance.assetAuthor, 'OpenPet Test Assets')
  assert.equal(imported.pack.provenance.license, 'CC-BY-4.0')
  assert.equal(imported.pack.provenance.licenseUrl, 'https://example.com/license')
  assert.equal(imported.pack.provenance.originalFormat, 'directory')
  assert.equal(imported.pack.provenance.importedAt, '2026-06-12T00:00:00.000Z')
  assert.equal(settingsService.get().petPacks.installed['provenance-cat'].provenance.sourceUrl, 'https://example.com/provenance-cat')
  assert.equal(listedPack.provenance.assetAuthor, 'OpenPet Test Assets')
})

test('pet pack service reports deterministic version conflict decisions during inspection', () => {
  const firstSource = createTempDir('pet-pack-version-first')
  const nextSource = createTempDir('pet-pack-version-next')
  createPetPackDirectory(firstSource, { id: 'versioned-cat', version: '1.2.0' })
  createPetPackDirectory(nextSource, { id: 'versioned-cat', version: '1.1.0' })
  const service = createService()

  const firstInspection = service.inspectPackDirectory(firstSource)
  service.importPack(firstInspection.selectionId)
  const nextInspection = service.inspectPackDirectory(nextSource)

  assert.equal(nextInspection.pack.conflict.installed, true)
  assert.equal(nextInspection.pack.conflict.installedVersion, '1.2.0')
  assert.equal(nextInspection.pack.conflict.incomingVersion, '1.1.0')
  assert.equal(nextInspection.pack.conflict.decision, 'downgrade')
  assert.equal(nextInspection.pack.conflict.requiresReview, true)
})

test('pet pack service exports installed user packs as re-importable zip packages', () => {
  const sourceDir = createTempDir('pet-pack-export-source')
  createPetPackDirectory(sourceDir, {
    id: 'exportable-cat',
    displayName: 'Exportable Cat',
    sourceUrl: 'https://example.com/exportable-cat',
    assetAuthor: 'OpenPet Test Assets',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://example.com/license'
  })
  const outputDir = createTempDir('pet-pack-export-output')
  const settingsService = createSettingsService()
  const service = createService(settingsService)

  const inspection = service.inspectPackDirectory(sourceDir)
  service.importPack(inspection.selectionId)
  const exported = service.exportPack('exportable-cat', outputDir)

  assert.equal(exported.packId, 'exportable-cat')
  assert.equal(exported.fileName, 'exportable-cat-1.0.0.openpet-pet.zip')
  assert.equal(fs.existsSync(exported.outputPath), true)
  assert.equal(exported.sha256, sha256(exported.outputPath))

  service.removePack('exportable-cat')
  const reinspection = service.inspectPackSource(exported.outputPath)
  const reimported = service.importPack(reinspection.selectionId)
  const exportedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-pet-pack-export-check-'))
  execFileSync('unzip', ['-qq', exported.outputPath, '-d', exportedRoot])
  const exportedManifest = JSON.parse(fs.readFileSync(path.join(exportedRoot, 'pet.json'), 'utf-8'))

  assert.equal(reinspection.valid, true)
  assert.equal(reinspection.pack.id, 'exportable-cat')
  assert.equal(reinspection.pack.provenance.originalFormat, 'openpet-pet-zip')
  assert.equal(exportedManifest.provenance.sourceUrl, 'https://example.com/exportable-cat')
  assert.equal(exportedManifest.provenance.assetAuthor, 'OpenPet Test Assets')
  assert.equal(exportedManifest.provenance.license, 'CC-BY-4.0')
  assert.equal(exportedManifest.provenance.licenseUrl, 'https://example.com/license')
  assert.equal(exportedManifest.provenance.originalFormat, 'directory')
  assert.equal(reimported.pack.id, 'exportable-cat')
})

test('pet pack service refuses to export built-in packs', () => {
  const service = createService()

  assert.throws(() => service.exportPack(BUILT_IN_PACK_ID, createTempDir('pet-pack-export-built-in')), /built-in/)
})

test('pet pack service inspects and imports a Codex-compatible pet directory', () => {
  const sourceDir = createTempDir('codex-pet-source')
  createCodexPetDirectory(sourceDir)
  const settingsService = createSettingsService()
  const service = createService(settingsService)

  const inspection = service.inspectPackDirectory(sourceDir)
  const imported = service.importPack(inspection.selectionId)
  const listed = service.listPacks()

  assert.equal(inspection.valid, true)
  assert.equal(inspection.pack.id, 'codex-cat')
  assert.equal(inspection.pack.source, 'codex-pet')
  assert.equal(inspection.pack.actionCount, 9)
  assert.equal(inspection.pack.previewAction.frameWidth, 192)
  assert.equal(imported.pack.id, 'codex-cat')
  assert.equal(settingsService.get().petPacks.installed['codex-cat'].displayName, 'Codex Cat')
  assert.equal(listed.packs.some((pack) => pack.id === 'codex-cat'), true)
})

test('pet pack service inspects and imports a Codex-compatible pet zip package', () => {
  const sourceDir = createTempDir('codex-pet-zip-source')
  createCodexPetDirectory(sourceDir, { id: 'zip-codex-cat', displayName: 'Zip Codex Cat' })
  const zipPath = createZipFromDirectory(sourceDir)
  const settingsService = createSettingsService()
  const userPacksDir = createTempDir('pet-packs')
  const service = createPetPackService({
    settingsService,
    userPacksDir,
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [] }),
    now: () => new Date('2026-06-12T00:00:00.000Z')
  })

  const inspection = service.inspectPackSource(zipPath)
  const extractedRoot = inspection.rootPath
  const imported = service.importPack(inspection.selectionId)

  assert.equal(inspection.valid, true)
  assert.equal(inspection.folderName, path.basename(zipPath))
  assert.equal(inspection.pack.id, 'zip-codex-cat')
  assert.equal(inspection.pack.source, 'codex-pet')
  assert.equal(inspection.pack.sourcePackageHash, sha256(zipPath))
  assert.equal(imported.pack.id, 'zip-codex-cat')
  assert.equal(settingsService.get().petPacks.installed['zip-codex-cat'].sourcePackageHash, sha256(zipPath))
  assert.equal(fs.existsSync(path.join(userPacksDir, 'zip-codex-cat', 'pet.json')), true)
  assert.equal(fs.existsSync(extractedRoot), false)
})

test('pet pack service clears extracted zip selections', () => {
  const sourceDir = createTempDir('codex-pet-zip-clear-source')
  createCodexPetDirectory(sourceDir, { id: 'clear-codex-cat' })
  const zipPath = createZipFromDirectory(sourceDir)
  const service = createService()

  const inspection = service.inspectPackSource(zipPath)
  const extractedRoot = inspection.rootPath
  const result = service.clearPendingSelection(inspection.selectionId)

  assert.equal(result.ok, true)
  assert.equal(fs.existsSync(extractedRoot), false)
})

test('pet pack service removes expired extracted zip selections', () => {
  const sourceDir = createTempDir('codex-pet-zip-expire-source')
  createCodexPetDirectory(sourceDir, { id: 'expire-codex-cat' })
  const zipPath = createZipFromDirectory(sourceDir)
  const settingsService = createSettingsService()
  let nowMs = 0
  const service = createPetPackService({
    settingsService,
    userPacksDir: createTempDir('pet-packs'),
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [] }),
    now: () => new Date('2026-06-12T00:00:00.000Z'),
    nowMs: () => nowMs
  })

  const inspection = service.inspectPackSource(zipPath)
  const extractedRoot = inspection.rootPath
  nowMs += 11 * 60 * 1000

  assert.throws(() => service.importPack(inspection.selectionId), /expired/)
  assert.equal(fs.existsSync(extractedRoot), false)
})

test('pet pack service rejects unsafe pet pack zip entries before extraction', () => {
  const zipPath = createUnsafeZip()
  const service = createService()

  const inspection = service.inspectPackSource(zipPath)

  assert.equal(inspection.valid, false)
  assert.match(inspection.errors[0], /unsafe paths/)
})

test('pet pack service rejects zip packages with multiple pet roots', () => {
  const sourceRoot = createTempDir('codex-pet-zip-multiple')
  fs.mkdirSync(path.join(sourceRoot, 'one'))
  fs.mkdirSync(path.join(sourceRoot, 'two'))
  createCodexPetDirectory(path.join(sourceRoot, 'one'), { id: 'one-cat' })
  createCodexPetDirectory(path.join(sourceRoot, 'two'), { id: 'two-cat' })
  const zipPath = createZipFromDirectory(sourceRoot)
  const service = createService()

  const inspection = service.inspectPackSource(zipPath)

  assert.equal(inspection.valid, false)
  assert.match(inspection.errors[0], /exactly one pet.json root/)
})

test('pet pack service blocks zip packages denied by source package hash', () => {
  const sourceDir = createTempDir('codex-pet-zip-blocked-source')
  createCodexPetDirectory(sourceDir, { id: 'hash-blocked-codex-cat' })
  const zipPath = createZipFromDirectory(sourceDir)
  const blockedHash = sha256(zipPath)
  const service = createPetPackService({
    settingsService: createSettingsService(),
    userPacksDir: createTempDir('pet-packs'),
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [] }),
    getPetPackBlockStatus: ({ sourceSha256 }) => sourceSha256 === blockedHash
      ? { blocked: true, reasons: [`sha256:${blockedHash}`] }
      : { blocked: false, reasons: [] }
  })

  const inspection = service.inspectPackSource(zipPath)

  assert.equal(inspection.valid, false)
  assert.match(inspection.errors[0], /blocked/)
})

test('action service loads the active installed pet pack and uses its root for previews', () => {
  const sourceDir = createTempDir('pet-pack-action-source')
  createPetPackDirectory(sourceDir, { id: 'active-cat', displayName: 'Active Cat' })
  const settingsService = createSettingsService()
  const petPackService = createService(settingsService)
  const actionService = createActionService({ petPackService })

  const inspection = petPackService.inspectPackDirectory(sourceDir)
  petPackService.importPack(inspection.selectionId)
  petPackService.setActivePack('active-cat')
  actionService.reload()

  assert.equal(actionService.getPetPack().manifest.id, 'active-cat')
  assert.deepEqual(actionService.getConfig().actions.map((action) => action.id), ['idle', 'wave'])
  assert.match(actionService.getPreviewConfig().actions[0].previewSprite, /file:\/\/.*active-cat\/sprites\/idle\.png$/)
})

test('pet pack service updates the active installed pack manifest action fields', () => {
  const sourceDir = createTempDir('pet-pack-update-active')
  createPetPackDirectory(sourceDir, { id: 'editable-cat', displayName: 'Editable Cat' })
  const settingsService = createSettingsService()
  const petPackService = createService(settingsService)

  const inspection = petPackService.inspectPackDirectory(sourceDir)
  petPackService.importPack(inspection.selectionId)
  petPackService.setActivePack('editable-cat')

  const updated = petPackService.updateActivePetPackManifest({
    defaultAction: 'wave',
    clickAction: 'wave',
    actions: [
      { id: 'idle', label: 'Idle', kind: 'idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
      { id: 'wave', label: 'Wave Updated', kind: 'greeting', sprite: 'sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
    ]
  })

  const installedManifestPath = path.join(petPackService.listPacks().packs.find((pack) => pack.id === 'editable-cat').rootPath, 'pet.json')
  const persisted = JSON.parse(fs.readFileSync(installedManifestPath, 'utf-8'))

  assert.equal(updated.defaultAction, 'wave')
  assert.equal(persisted.clickAction, 'wave')
  assert.equal(persisted.actions.find((action) => action.id === 'wave').label, 'Wave Updated')
})

test('pet pack service reads validates and applies creator pack manifest metadata for the active installed pack', () => {
  const sourceDir = createTempDir('pet-pack-creator-view')
  createPetPackDirectory(sourceDir, {
    id: 'creator-cat',
    displayName: 'Creator Cat',
    version: '1.2.3',
    sourceUrl: 'https://example.com/creator-cat',
    assetAuthor: 'OpenPet Creator',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://example.com/license'
  })
  const settingsService = createSettingsService()
  const petPackService = createService(settingsService)

  const inspection = petPackService.inspectPackDirectory(sourceDir)
  petPackService.importPack(inspection.selectionId)
  petPackService.setActivePack('creator-cat')

  const view = petPackService.getActiveCreatorPackManifest()
  const validation = petPackService.validateActiveCreatorPackManifestMutation({
    displayName: 'Creator Cat v2',
    version: '2.0.0',
    provenance: {
      sourceUrl: 'https://example.com/creator-cat-v2',
      assetAuthor: 'Creator Team',
      license: 'MIT',
      licenseUrl: 'https://example.com/mit'
    }
  })
  const applied = petPackService.applyActiveCreatorPackManifestMutation({
    displayName: 'Creator Cat v2',
    version: '2.0.0',
    provenance: {
      sourceUrl: 'https://example.com/creator-cat-v2',
      assetAuthor: 'Creator Team',
      license: 'MIT',
      licenseUrl: 'https://example.com/mit'
    }
  })

  assert.equal(view.id, 'creator-cat')
  assert.equal(view.displayName, 'Creator Cat')
  assert.equal(validation.ok, true)
  assert.deepEqual(validation.errors, [])
  assert.equal(validation.manifest.displayName, 'Creator Cat v2')
  assert.equal(validation.manifest.version, '2.0.0')
  assert.equal(validation.manifest.provenance.assetAuthor, 'Creator Team')
  assert.equal(applied.displayName, 'Creator Cat v2')
  assert.equal(applied.provenance.sourceUrl, 'https://example.com/creator-cat-v2')
})

test('pet pack service rejects creator manifest mutation for built-in packs', () => {
  const petPackService = createService()

  assert.throws(
    () => petPackService.getActiveCreatorPackManifest(),
    /active installed pet pack/
  )
  const validation = petPackService.validateActiveCreatorPackManifestMutation({ displayName: 'Nope' })

  assert.equal(validation.ok, false)
  assert.match(validation.errors.join('\n'), /active installed pet pack/)
  assert.throws(
    () => petPackService.applyActiveCreatorPackManifestMutation({ displayName: 'Nope' }),
    /active installed pet pack/
  )
})

test('pet pack service rejects unsupported creator manifest keys', () => {
  const sourceDir = createTempDir('pet-pack-creator-immutable')
  createPetPackDirectory(sourceDir, { id: 'creator-immutable-cat' })
  const settingsService = createSettingsService()
  const petPackService = createService(settingsService)

  const inspection = petPackService.inspectPackDirectory(sourceDir)
  petPackService.importPack(inspection.selectionId)
  petPackService.setActivePack('creator-immutable-cat')

  const validation = petPackService.validateActiveCreatorPackManifestMutation({
    id: 'other-cat',
    defaultAction: 'wave',
    actions: [],
    provenance: {
      importedAt: '2026-06-18T00:00:00.000Z',
      originalFormat: 'manual'
    }
  })

  assert.equal(validation.ok, false)
  assert.match(validation.errors.join('\n'), /Unsupported creator pack manifest field: id/)
  assert.match(validation.errors.join('\n'), /Unsupported creator pack manifest field: defaultAction/)
  assert.match(validation.errors.join('\n'), /Unsupported creator pack manifest field: actions/)
  assert.match(validation.errors.join('\n'), /Unsupported creator pack manifest provenance field: importedAt/)
  assert.match(validation.errors.join('\n'), /Unsupported creator pack manifest provenance field: originalFormat/)
})

test('pet pack service rejects non-object creator manifest mutations', () => {
  const sourceDir = createTempDir('pet-pack-creator-invalid-payload')
  createPetPackDirectory(sourceDir, { id: 'creator-invalid-payload-cat' })
  const settingsService = createSettingsService()
  const petPackService = createService(settingsService)

  const inspection = petPackService.inspectPackDirectory(sourceDir)
  petPackService.importPack(inspection.selectionId)
  petPackService.setActivePack('creator-invalid-payload-cat')

  for (const payload of [null, [], 'display name']) {
    const validation = petPackService.validateActiveCreatorPackManifestMutation(payload)

    assert.equal(validation.ok, false)
    assert.match(validation.errors.join('\n'), /Creator pack manifest mutation must be an object/)
    assert.throws(
      () => petPackService.applyActiveCreatorPackManifestMutation(payload),
      /Creator pack manifest mutation must be an object/
    )
  }
})

test('pet pack service preserves host-owned and action fields during creator manifest apply', () => {
  const sourceDir = createTempDir('pet-pack-creator-apply')
  createPetPackDirectory(sourceDir, { id: 'creator-apply-cat', displayName: 'Creator Apply Cat' })
  const settingsService = createSettingsService()
  const petPackService = createService(settingsService)

  const inspection = petPackService.inspectPackDirectory(sourceDir)
  petPackService.importPack(inspection.selectionId)
  petPackService.setActivePack('creator-apply-cat')

  const installedManifestPath = path.join(
    petPackService.listPacks().packs.find((pack) => pack.id === 'creator-apply-cat').rootPath,
    'pet.json'
  )
  const original = JSON.parse(fs.readFileSync(installedManifestPath, 'utf-8'))
  const applied = petPackService.applyActiveCreatorPackManifestMutation({
    displayName: 'Creator Apply Cat Updated',
    version: '1.1.0',
    provenance: {
      assetAuthor: 'Creator Apply Team',
      sourceUrl: 'https://example.com/creator-apply-cat'
    }
  })
  const persisted = JSON.parse(fs.readFileSync(installedManifestPath, 'utf-8'))

  assert.equal(applied.id, 'creator-apply-cat')
  assert.equal(applied.displayName, 'Creator Apply Cat Updated')
  assert.equal(applied.version, '1.1.0')
  assert.equal(applied.provenance.assetAuthor, 'Creator Apply Team')
  assert.equal(persisted.id, original.id)
  assert.equal(persisted.defaultAction, original.defaultAction)
  assert.equal(persisted.clickAction, original.clickAction)
  assert.deepEqual(persisted.actions, original.actions)
  assert.equal(persisted.displayName, 'Creator Apply Cat Updated')
  assert.equal(persisted.version, '1.1.0')
  assert.equal(persisted.sourceUrl, 'https://example.com/creator-apply-cat')
  assert.equal(persisted.assetAuthor, 'Creator Apply Team')
  assert.equal(persisted.provenance.sourceUrl, 'https://example.com/creator-apply-cat')
})

test('pet pack service rejects invalid packs before import', () => {
  const sourceDir = createTempDir('pet-pack-invalid')
  fs.mkdirSync(path.join(sourceDir, 'sprites'), { recursive: true })
  fs.writeFileSync(path.join(sourceDir, 'pet.json'), JSON.stringify({
    id: 'broken-cat',
    defaultAction: 'idle',
    actions: [
      { id: 'idle', sprite: 'sprites/missing.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
    ]
  }))
  const service = createService()

  const inspection = service.inspectPackDirectory(sourceDir)

  assert.equal(inspection.valid, false)
  assert.match(inspection.errors[0], /sprite does not exist/)
})

test('pet pack service rejects source folders containing symlinks', () => {
  const sourceDir = createTempDir('pet-pack-symlink')
  createPetPackDirectory(sourceDir, { id: 'symlink-cat' })
  const targetPath = path.join(sourceDir, 'sprites', 'idle.png')
  const linkPath = path.join(sourceDir, 'sprites', 'idle-link.png')
  fs.symlinkSync(targetPath, linkPath)
  const service = createService()

  const inspection = service.inspectPackDirectory(sourceDir)

  assert.equal(inspection.valid, false)
  assert.match(inspection.errors[0], /symlinks/)
})

test('pet pack service rejects a source folder that is itself a symlink', () => {
  const sourceDir = createTempDir('pet-pack-root-target')
  createPetPackDirectory(sourceDir, { id: 'root-symlink-cat' })
  const linkParent = createTempDir('pet-pack-root-link')
  const linkDir = path.join(linkParent, 'pack-link')
  fs.symlinkSync(sourceDir, linkDir, 'dir')
  const service = createService()

  const inspection = service.inspectPackDirectory(linkDir)

  assert.equal(inspection.valid, false)
  assert.match(inspection.errors[0], /symlinks/)
})

test('pet pack service protects built-in and active packs from removal', () => {
  const sourceDir = createTempDir('pet-pack-remove')
  createPetPackDirectory(sourceDir, { id: 'remove-cat' })
  const service = createService()

  const inspection = service.inspectPackDirectory(sourceDir)
  service.importPack(inspection.selectionId)

  assert.throws(() => service.removePack(BUILT_IN_PACK_ID), /built-in/)
  service.setActivePack('remove-cat')
  assert.throws(() => service.removePack('remove-cat'), /active/)
})

test('pet pack service blocks importing and activating packs denied by ecosystem policy', () => {
  const sourceDir = createTempDir('pet-pack-blocked')
  createPetPackDirectory(sourceDir, { id: 'blocked-cat' })
  const settingsService = createSettingsService({
    petPacks: {
      activePackId: BUILT_IN_PACK_ID,
      installed: {
        'blocked-cat': { id: 'blocked-cat', displayName: 'Blocked Cat', version: '1.0.0' }
      }
    }
  })
  const service = createPetPackService({
    settingsService,
    userPacksDir: createTempDir('pet-packs'),
    projectRoot: '/app/openpet',
    loadLegacyAnimations: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [{ id: 'idle', sprite: 'cat_anime/sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 1, frameHeight: 1 }] }),
    getPetPackBlockStatus: ({ id }) => id === 'blocked-cat'
      ? { blocked: true, reasons: ['packId:blocked-cat'] }
      : { blocked: false, reasons: [] }
  })

  const inspection = service.inspectPackDirectory(sourceDir)

  assert.equal(inspection.valid, false)
  assert.match(inspection.errors[0], /blocked/)
  assert.throws(() => service.setActivePack('blocked-cat'), /blocked/)
})

test('pet pack service removes non-active installed packs', () => {
  const sourceDir = createTempDir('pet-pack-removable')
  createPetPackDirectory(sourceDir, { id: 'removable-cat' })
  const settingsService = createSettingsService()
  const service = createService(settingsService)

  const inspection = service.inspectPackDirectory(sourceDir)
  service.importPack(inspection.selectionId)
  const result = service.removePack('removable-cat')

  assert.equal(result.petPacks.installed['removable-cat'], undefined)
  assert.equal(settingsService.get().petPacks.installed['removable-cat'], undefined)
})

test('pet pack service self-heals invalid active installed packs to the built-in pack', () => {
  const settingsService = createSettingsService({
    petPacks: {
      activePackId: 'broken-cat',
      installed: {
        'broken-cat': { id: 'broken-cat', displayName: 'Broken Cat', version: '1.0.0' }
      }
    }
  })
  const service = createService(settingsService)

  const activePack = service.getActivePetPack()
  const listed = service.listPacks()

  assert.equal(activePack.manifest.id, BUILT_IN_PACK_ID)
  assert.equal(settingsService.get().petPacks.activePackId, BUILT_IN_PACK_ID)
  assert.equal(listed.activePackId, BUILT_IN_PACK_ID)
  assert.equal(listed.packs.find((pack) => pack.id === BUILT_IN_PACK_ID).active, true)
  assert.equal(listed.packs.find((pack) => pack.id === 'broken-cat').active, false)
})

test('pet pack service self-heals invalid active installed packs when listing packs', () => {
  const settingsService = createSettingsService({
    petPacks: {
      activePackId: 'broken-cat',
      installed: {
        'broken-cat': { id: 'broken-cat', displayName: 'Broken Cat', version: '1.0.0' }
      }
    }
  })
  const service = createService(settingsService)

  const listed = service.listPacks()

  assert.equal(settingsService.get().petPacks.activePackId, BUILT_IN_PACK_ID)
  assert.equal(listed.activePackId, BUILT_IN_PACK_ID)
  assert.equal(listed.packs.find((pack) => pack.id === BUILT_IN_PACK_ID).active, true)
  assert.equal(listed.packs.find((pack) => pack.id === 'broken-cat').active, false)
})
