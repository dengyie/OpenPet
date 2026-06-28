const fs = require('fs')
const path = require('path')

const createCoreServices = ({
  app,
  projectRoot,
  packageJson,
  settingsRuntime,
  factories,
  screen
}) => {
  const {
    createEventBus,
    createSettingsService,
    createActionService,
    createPetPackService,
    createPetService,
    createSecretService,
    createAiService,
    createAiTalkStore,
    createAiTalkService,
    createPetUtteranceLogService,
    createImageGenerationModelService,
    createTriggerRuleRuntimeService,
    createBehaviorOrchestratorService,
    createLocalHttpService,
    createActionImportService,
    createCursorAssetService,
    createAppLogService,
    createAboutService,
    createPetMovementPolicy
  } = factories

  const { loadSettings, saveSettings, syncLoginItemSettings } = settingsRuntime
  const eventBus = createEventBus()
  const settingsService = createSettingsService({
    eventBus,
    loadSettings,
    saveSettings,
    syncSideEffects: (settings) => syncLoginItemSettings(settings.autoStart)
  })

  let catalogService = null
  const petPackService = createPetPackService({
    settingsService,
    userPacksDir: path.join(app.getPath('userData'), 'pet-packs'),
    projectRoot,
    getPetPackBlockStatus: (candidate) => catalogService?.getPetPackBlockStatus(candidate) || { blocked: false, reasons: [] }
  })
  const actionService = createActionService({
    petPackService,
    saveLegacyAnimations: (config) => {
      const configPath = path.join(projectRoot, 'cat_anime', 'animations.json')
      fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
      return config
    }
  })
  const secretService = createSecretService()
  const appLogService = createAppLogService({
    logDir: path.join(app.getPath('userData'), 'logs')
  })
  const petService = createPetService({ eventBus, settingsService, actionService, appLogService })
  const aiService = createAiService({ settingsService, secretService, appLogService })
  const aiTalkStore = createAiTalkStore({ storePath: path.join(app.getPath('userData'), 'ai-talk-store.json') })
  const petUtteranceLogService = createPetUtteranceLogService({ aiTalkStore, appLogService })
  const aiTalkService = createAiTalkService({ aiService, aiTalkStore, petPackService, appLogService, petUtteranceLogService })
  const imageGenerationModelService = createImageGenerationModelService({ settingsService, secretService, appLogService })
  const triggerRuleRuntimeService = createTriggerRuleRuntimeService({ actionService, petService, appLogService })
  const behaviorOrchestratorService = createBehaviorOrchestratorService({ settingsService })
  const localHttpService = createLocalHttpService({ petService, settingsService })
  const aboutService = createAboutService({ app, packageJson })
  const petMovementPolicy = createPetMovementPolicy({ screen })
  const actionImportService = createActionImportService({
    framesRoot: path.join(projectRoot, 'cat_anime', 'flames'),
    spritesDir: path.join(projectRoot, 'cat_anime', 'sprites'),
    configPath: path.join(projectRoot, 'cat_anime', 'animations.json')
  })
  const cursorAssetService = createCursorAssetService({
    cursorDir: path.join(app.getPath('userData'), 'cursors')
  })

  return {
    setCatalogService: (nextCatalogService) => {
      catalogService = nextCatalogService
    },
    syncLoginItemSettings,
    services: {
      aboutService,
      actionImportService,
      actionService,
      aiService,
      aiTalkService,
      aiTalkStore,
      appLogService,
      behaviorOrchestratorService,
      cursorAssetService,
      imageGenerationModelService,
      triggerRuleRuntimeService,
      localHttpService,
      petMovementPolicy,
      petPackService,
      petService,
      petUtteranceLogService,
      secretService,
      settingsService
    }
  }
}

module.exports = {
  createCoreServices
}
