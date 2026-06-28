const path = require('path')

const logBundledPluginSync = ({ bundledPluginSync, appLogService }) => {
  for (const syncedPlugin of bundledPluginSync.synced) {
    try {
      appLogService.record({
        scope: 'plugins',
        level: 'info',
        actor: 'system',
        event: 'plugins.bundled.synced',
        message: 'Bundled plugin synchronized',
        details: {
          pluginId: syncedPlugin.pluginId,
          removedCount: syncedPlugin.removed.length
        }
      })
    } catch (error) {
      console.warn(`OpenPet bundled plugin sync log unavailable: ${error.message}`)
    }
  }
}

const createPluginServices = ({
  app,
  projectRoot,
  shell,
  dialog,
  getPetWindow,
  petService,
  actionService,
  actionImportService,
  petPackService,
  aiService,
  aiTalkService,
  imageGenerationModelService,
  triggerRuleRuntimeService,
  settingsService,
  appLogService,
  createBasicBehaviorPlugin,
  syncBundledPlugins,
  createPluginInstallService,
  createPluginGithubImportService,
  createPluginService,
  createCatalogService,
  reloadAndSendAnimations,
  onActivePetPackChanged = () => {}
}) => {
  const pluginDir = path.join(app.getPath('userData'), 'plugins')
  const bundledCreatorStudioDir = path.join(projectRoot, 'examples', 'plugins', 'creator-studio')
  const getCatalogBlockStatus = (candidate, catalogService, methodName) => catalogService?.[methodName]?.(candidate) || { blocked: false, reasons: [] }

  const bundledPluginSync = syncBundledPlugins({
    pluginDir,
    bundledPluginDirs: [bundledCreatorStudioDir],
    settingsService
  })
  logBundledPluginSync({ bundledPluginSync, appLogService })

  let catalogService = null
  const pluginInstallService = createPluginInstallService({
    settingsService,
    pluginDir,
    getPluginBlockStatus: (candidate) => getCatalogBlockStatus(candidate, catalogService, 'getPluginBlockStatus')
  })
  const pluginGithubImportService = createPluginGithubImportService({
    pluginInstallService
  })

  const pluginService = createPluginService({
    settingsService,
    petService,
    actionService,
    actionImportService,
    petPackService,
    aiService,
    aiTalkService,
    imageGenerationModelService,
    pluginDirs: [pluginDir],
    officialPlugins: [createBasicBehaviorPlugin()],
    openExternal: (url) => shell.openExternal(url),
    onPetPackActivated: () => {
      reloadAndSendAnimations(getPetWindow, petService)
      triggerRuleRuntimeService?.refresh?.()
      onActivePetPackChanged()
    },
    selectCreatorAssetFrameFolder: async () => {
      const selected = await dialog.showOpenDialog({
        title: '选择动作帧文件夹',
        properties: ['openDirectory']
      })
      if (selected.canceled || !selected.filePaths[0]) return { canceled: true }
      return { canceled: false, sourceDir: selected.filePaths[0] }
    },
    getPluginBlockStatus: (candidate) => getCatalogBlockStatus(candidate, catalogService, 'getPluginBlockStatus')
  })
  catalogService = createCatalogService({
    settingsService,
    pluginInstallService,
    pluginService,
    petPackService,
    catalogPath: path.join(projectRoot, 'catalog', 'openpet-catalog.json')
  })

  return {
    bundledPluginSync,
    catalogService,
    pluginDir,
    pluginGithubImportService,
    pluginInstallService,
    pluginService
  }
}

module.exports = {
  createPluginServices
}
