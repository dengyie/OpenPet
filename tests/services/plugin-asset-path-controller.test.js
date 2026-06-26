const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  createPluginAssetPathController
} = require('../../src/main/services/plugin-asset-path-controller')

const makeTempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-asset-path-'))

const createController = (overrides = {}) => {
  const creatorDirs = []
  const controller = createPluginAssetPathController({
    ensureCreatorDirs: (manifest) => {
      const dataDir = path.join(path.dirname(manifest.basePath), '.openpet', manifest.id, 'data')
      fs.mkdirSync(dataDir, { recursive: true })
      creatorDirs.push(dataDir)
      return { dataDir }
    },
    assertDirectoryHasNoSymlinks: (dirPath) => {
      for (const entry of fs.readdirSync(dirPath)) {
        const entryPath = path.join(dirPath, entry)
        if (fs.lstatSync(entryPath).isSymbolicLink()) {
          throw new Error('Selected frame folder must not contain symlinks')
        }
      }
    },
    selectCreatorAssetFrameFolder: async () => ({ canceled: true }),
    ...overrides
  })
  return { controller, creatorDirs }
}

test('asset path controller resolves plugin asset directories inside the plugin base path', () => {
  const root = makeTempRoot()
  const pluginDir = path.join(root, 'weather-declaration')
  const assetDir = path.join(pluginDir, 'assets', 'actions', 'wave')
  fs.mkdirSync(assetDir, { recursive: true })
  const manifest = { id: 'weather-declaration', basePath: pluginDir }
  const { controller } = createController()

  const result = controller.resolvePluginAssetPath(manifest, 'assets/actions/wave')

  assert.equal(result, fs.realpathSync(assetDir))
})

test('asset path controller rejects plugin asset traversal outside the plugin directory', () => {
  const root = makeTempRoot()
  const pluginDir = path.join(root, 'weather-declaration')
  fs.mkdirSync(pluginDir, { recursive: true })
  const manifest = { id: 'weather-declaration', basePath: pluginDir }
  const { controller } = createController()

  assert.throws(
    () => controller.resolvePluginAssetPath(manifest, '../outside-wave'),
    /safe relative path/
  )
})

test('asset path controller rejects plugin asset symlink escapes', (t) => {
  const root = makeTempRoot()
  const pluginDir = path.join(root, 'weather-declaration')
  const outsideDir = path.join(root, 'outside-wave')
  const assetLink = path.join(pluginDir, 'assets', 'escape')
  fs.mkdirSync(outsideDir, { recursive: true })
  fs.mkdirSync(path.dirname(assetLink), { recursive: true })
  try {
    fs.symlinkSync(outsideDir, assetLink, 'dir')
  } catch (error) {
    t.skip(`Directory symlinks are unavailable: ${error.message}`)
    return
  }
  const manifest = { id: 'weather-declaration', basePath: pluginDir }
  const { controller } = createController()

  assert.throws(
    () => controller.resolvePluginAssetPath(manifest, 'assets/escape'),
    /must stay inside the plugin directory/
  )
})

test('asset path controller resolves creator data paths inside host-owned plugin data dirs', () => {
  const root = makeTempRoot()
  const pluginDir = path.join(root, 'weather-declaration')
  fs.mkdirSync(pluginDir, { recursive: true })
  const manifest = { id: 'weather-declaration', basePath: pluginDir }
  const { controller, creatorDirs } = createController()
  const { dataDir } = controller.ensureCreatorDirs(manifest)
  const framesDir = path.join(dataDir, 'generated', 'wave')
  fs.mkdirSync(framesDir, { recursive: true })

  const result = controller.resolvePluginDataPath(manifest, 'generated/wave')

  assert.equal(result, fs.realpathSync(framesDir))
  assert.ok(creatorDirs.length >= 1)
})

test('asset path controller rejects picked folders that are themselves symlinks', (t) => {
  const root = makeTempRoot()
  const realDir = path.join(root, 'picked-real-wave')
  const linkDir = path.join(root, 'picked-link-wave')
  fs.mkdirSync(realDir, { recursive: true })
  try {
    fs.symlinkSync(realDir, linkDir, 'dir')
  } catch (error) {
    t.skip(`Directory symlinks are unavailable: ${error.message}`)
    return
  }
  const { controller } = createController()

  assert.throws(
    () => controller.resolvePickedAssetPath(linkDir),
    /must not be a symlink/
  )
})

test('asset path controller returns canceled picker results unchanged', async () => {
  const { controller } = createController({
    selectCreatorAssetFrameFolder: async () => ({ canceled: true })
  })

  const result = await controller.selectCreatorAssetSourceDir()

  assert.deepEqual(result, { canceled: true })
})

test('asset path controller resolves selected picker folders before returning them', async () => {
  const root = makeTempRoot()
  const pickedDir = path.join(root, 'picked-wave')
  fs.mkdirSync(pickedDir, { recursive: true })
  const { controller } = createController({
    selectCreatorAssetFrameFolder: async () => ({ canceled: false, sourceDir: pickedDir })
  })

  const result = await controller.selectCreatorAssetSourceDir()

  assert.deepEqual(result, {
    canceled: false,
    sourceDir: fs.realpathSync(pickedDir)
  })
})
