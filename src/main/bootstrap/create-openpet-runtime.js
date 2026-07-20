const { createCoreServices } = require('./create-core-services')
const { createPluginServices } = require('./create-plugin-services')
const { createWindowServices } = require('./create-window-services')
const { registerDisplayLifecycle, registerPetWindowLifecycle, registerRuntimeAppLifecycle } = require('./runtime-lifecycle')
const { registerCursorRepair, runPostPluginStartupSideEffects } = require('./startup-side-effects')
const { IPC } = require('../../shared/ipc-channels')

const createOpenPetRuntime = ({
  app,
  BrowserWindow,
  dialog,
  shell,
  screen,
  projectRoot,
  packageJson,
  settingsRuntime,
  getPetWindow,
  createSettingsWindow,
  createWindow,
  loadPetWindow,
  registerAppLifecycleLogs,
  safeRecordAppLog,
  registerIpcHandlers,
  createPetRendererSettings,
  normalizeLocalHttpConfig,
  reloadAndSendAnimations,
  applyWindowScale,
  applyPetViewport,
  clampToWorkArea,
  getMovementState,
  maybeRunPackagedRuntimeSmoke,
  maybeRunPackagedPluginCleanupEvidence,
  maybeRunPackagedCreatorStudioEvidence,
  maybeRunPackagedCreatorStudioUiE2e,
  maybeRunPackagedCreateUiSmoke,
  factories,
  setPetWindow
}) => {
  let handleSystemCursorUnexpectedExit = async () => {}
  const core = createCoreServices({
    app,
    projectRoot,
    packageJson,
    settingsRuntime,
    factories,
    screen,
    onSystemCursorUnexpectedExit: (event) => handleSystemCursorUnexpectedExit(event)
  })
  const {
    services: {
      aboutService,
      actionImportService,
      actionService,
      aiService,
      aiTalkService,
      appLogService,
      behaviorOrchestratorService,
      cursorAssetService,
      systemCursorService,
      creatorReferenceService,
      imageGenerationModelService,
      localHttpService,
      petMovementPolicy,
      petPackService,
      petService,
      petUtteranceLogService,
      secretService,
      triggerRuleRuntimeService,
      settingsService
    },
    syncLoginItemSettings,
    setCatalogService
  } = core

  const broadcastCursorSettings = (settings) => {
    const payload = createPetRendererSettings(settings, systemCursorService?.getStatus?.())
    const activePetWindow = getPetWindow()
    if (activePetWindow && !activePetWindow.isDestroyed?.()) {
      activePetWindow.webContents?.send?.(IPC.SETTINGS_CHANGED, payload)
      const settingsWindow = activePetWindow.settingsWindow
      if (settingsWindow && !settingsWindow.isDestroyed?.()) {
        settingsWindow.webContents?.send?.(IPC.SETTINGS_CHANGED, payload)
      }
    }
    return payload
  }

  handleSystemCursorUnexpectedExit = async () => {
    const currentSettings = petService.getSettings()
    if (currentSettings.customCursorScope !== 'system') return currentSettings
    const fallbackSettings = petService.saveSettings({ ...currentSettings, customCursorScope: 'openpet' })
    broadcastCursorSettings(fallbackSettings)
    return fallbackSettings
  }

  const { petChatWindowService, petBubbleChatWindowService } = createWindowServices({
    BrowserWindow,
    app,
    screen,
    getPetWindow,
    createSettingsWindow,
    createPetChatWindowManager: factories.createPetChatWindowManager,
    createPetBubbleChatWindowManager: factories.createPetBubbleChatWindowManager,
    petMovementPolicy,
    settingsService,
    appLogService
  })

  try {
    console.log(`OpenPet app log: ${appLogService.logPath}`)
  } catch (error) {
    console.warn(`OpenPet app log unavailable: ${error.message}`)
  }

  let pluginService = null
  registerRuntimeAppLifecycle({
    app,
    appLogService,
    registerAppLifecycleLogs,
    safeRecordAppLog,
    triggerRuleRuntimeService,
    aiTalkService,
    systemCursorService,
    getPluginService: () => pluginService
  })

  const cursorRepairPromise = registerCursorRepair({ cursorAssetService, petService, appLogService })

  let ipcRuntimeHelpers = {
    broadcastActivePetPackChanged: () => {}
  }
  const pluginServices = createPluginServices({
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
    secretService,
    triggerRuleRuntimeService,
    settingsService,
    appLogService,
    createBasicBehaviorPlugin: factories.createBasicBehaviorPlugin,
    syncBundledPlugins: factories.syncBundledPlugins,
    createPluginInstallService: factories.createPluginInstallService,
    createPluginGithubImportService: factories.createPluginGithubImportService,
    createPluginService: factories.createPluginService,
    createCatalogService: factories.createCatalogService,
    reloadAndSendAnimations,
    onActivePetPackChanged: () => ipcRuntimeHelpers.broadcastActivePetPackChanged({ source: 'plugin-service:onPetPackActivated' })
  })
  pluginService = pluginServices.pluginService
  setCatalogService(pluginServices.catalogService)
  const hatchPetAgentService = factories.createHatchPetAgentService({
    aiService,
    settingsService,
    secretService,
    pluginService,
    appLogService
  })
  pluginService.setHatchPetAgentService?.(hatchPetAgentService)
  const creatorStudioDefaultFlowService = factories.createCreatorStudioDefaultFlowService({
    pluginService,
    imageGenerationModelService
  })
  const creatorWorkflowService = factories.createCreatorWorkflowService({
    pluginService,
    imageGenerationModelService,
    actionService,
    creatorReferenceService,
    petPackService,
    hatchPetAgentService,
    appLogService
  })

  void runPostPluginStartupSideEffects({
    petService,
    localHttpService,
    normalizeLocalHttpConfig,
    syncLoginItemSettings,
    triggerRuleRuntimeService,
    cursorRepairPromise,
    systemCursorService,
    appLogService,
    onSystemCursorFallback: broadcastCursorSettings
  })

  ipcRuntimeHelpers = registerIpcHandlers({
    getPetWindow,
    petService,
    petPackService,
    aiService,
    aiTalkService,
    petUtteranceLogService,
    petBubbleChatWindowService,
    imageGenerationModelService,
    behaviorOrchestratorService,
    triggerRuleRuntimeService,
    creatorStudioDefaultFlowService,
    creatorWorkflowService,
    hatchPetAgentService,
    pluginService,
    pluginInstallService: pluginServices.pluginInstallService,
    pluginGithubImportService: pluginServices.pluginGithubImportService,
    catalogService: pluginServices.catalogService,
    localHttpService,
    aboutService,
    actionService,
    actionImportService,
    cursorAssetService,
    systemCursorService,
    appLogService,
    applyWindowScale: (targetWindow, scale) => applyWindowScale(targetWindow, scale),
    applyPetViewport,
    clampToWorkArea,
    getMovementState,
    createSettingsWindow: () => createSettingsWindow(getPetWindow()),
    petMovementPolicy,
    petChatWindowService
  }) || ipcRuntimeHelpers

  let petWindow = createWindow({ load: false })
  setPetWindow(petWindow)

  registerDisplayLifecycle({
    screen,
    getPetWindow,
    petService,
    systemCursorService,
    petMovementPolicy,
    createPetRendererSettings
  })
  registerPetWindowLifecycle({
    app,
    BrowserWindow,
    petWindow,
    getPetWindow,
    setPetWindow,
    createWindow,
    loadPetWindow,
    createSettingsWindow,
    petService,
    petPackService,
    petBubbleChatWindowService,
    pluginInstallService: pluginServices.pluginInstallService,
    pluginService,
    systemCursorService,
    applyWindowScale,
    createPetRendererSettings,
    maybeRunPackagedRuntimeSmoke,
    maybeRunPackagedPluginCleanupEvidence,
    maybeRunPackagedCreatorStudioEvidence,
    maybeRunPackagedCreatorStudioUiE2e,
    maybeRunPackagedCreateUiSmoke
  })

  return {
    appLogService,
    pluginService
  }
}

module.exports = {
  createOpenPetRuntime
}
