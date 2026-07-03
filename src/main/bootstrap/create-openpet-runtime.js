const { createCoreServices } = require('./create-core-services')
const { createPluginServices } = require('./create-plugin-services')
const { createWindowServices } = require('./create-window-services')
const { registerDisplayLifecycle, registerPetWindowLifecycle, registerRuntimeAppLifecycle } = require('./runtime-lifecycle')
const { registerCursorRepair, runPostPluginStartupSideEffects } = require('./startup-side-effects')

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
  const core = createCoreServices({
    app,
    projectRoot,
    packageJson,
    settingsRuntime,
    factories,
    screen
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
      creatorReferenceService,
      imageGenerationModelService,
      localHttpService,
      petMovementPolicy,
      petPackService,
      petService,
      petUtteranceLogService,
      triggerRuleRuntimeService,
      settingsService
    },
    syncLoginItemSettings,
    setCatalogService
  } = core

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
    getPluginService: () => pluginService
  })

  registerCursorRepair({ cursorAssetService, petService, appLogService })

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
  const creatorStudioDefaultFlowService = factories.createCreatorStudioDefaultFlowService({
    pluginService,
    imageGenerationModelService
  })
  const creatorWorkflowService = factories.createCreatorWorkflowService({
    pluginService,
    imageGenerationModelService,
    actionService,
    creatorReferenceService,
    appLogService
  })

  runPostPluginStartupSideEffects({
    petService,
    localHttpService,
    normalizeLocalHttpConfig,
    syncLoginItemSettings,
    triggerRuleRuntimeService
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
    pluginService,
    pluginInstallService: pluginServices.pluginInstallService,
    pluginGithubImportService: pluginServices.pluginGithubImportService,
    catalogService: pluginServices.catalogService,
    localHttpService,
    aboutService,
    actionService,
    actionImportService,
    cursorAssetService,
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
