const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const packageJson = require('../../package.json')
const { createPluginServices } = require('../../src/main/bootstrap/create-plugin-services')

test('packaged app build files cover every bundled plugin synchronized at bootstrap', () => {
  const projectRoot = path.resolve(__dirname, '../..')
  let bundledPluginSyncDependencies = null

  createPluginServices({
    app: { getPath: () => path.join(projectRoot, '.tmp-create-plugin-services-packaging') },
    projectRoot,
    shell: { openExternal: () => {} },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getPetWindow: () => null,
    petService: {},
    actionService: {},
    actionImportService: {},
    petPackService: {},
    aiService: {},
    aiTalkService: {},
    imageGenerationModelService: {},
    triggerRuleRuntimeService: {},
    settingsService: {},
    appLogService: { record: () => {} },
    createBasicBehaviorPlugin: () => ({}),
    syncBundledPlugins: (dependencies) => {
      bundledPluginSyncDependencies = dependencies
      return { synced: [] }
    },
    createPluginInstallService: () => ({}),
    createPluginGithubImportService: () => ({}),
    createPluginService: () => ({}),
    createCatalogService: () => ({}),
    reloadAndSendAnimations: () => {}
  })

  assert.ok(bundledPluginSyncDependencies)
  const buildFiles = Array.isArray(packageJson.build?.files) ? packageJson.build.files : []
  const missingPatterns = bundledPluginSyncDependencies.bundledPluginDirs
    .map((dirPath) => path.posix.join(path.relative(projectRoot, dirPath).split(path.sep).join('/'), '**/*'))
    .filter((pattern) => !buildFiles.includes(pattern))

  assert.deepEqual(missingPatterns, [])
})
