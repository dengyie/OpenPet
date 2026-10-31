const fs = require('fs')
const path = require('path')
const { safeStorage } = require('electron')
const { createAiSidecarProxy } = require('../ai-sidecar-proxy')
const { createPetIntentDispatcher } = require('../pet-service')
const { createCompanionIntentBroker: createDefaultCompanionIntentBroker } = require('../companion-intent-broker-service')
const { SETTINGS_CHANGED } = require('../settings-service')

const createCoreServices = ({
  app,
  projectRoot,
  settingsRuntime,
  factories,
  screen,
  getBackend,
  fetchImpl,
  onAiSnapshot,
  onSystemCursorUnexpectedExit = () => {}
}) => {
  const {
    createEventBus,
    createSettingsService,
    createActionService,
    createPetPackService,
    createPetService,
    createCompanionIntentBroker = createDefaultCompanionIntentBroker,
    createCompanionAudioLeaseService,
    createSecretService,
    createImageGenerationModelService,
    createTriggerRuleRuntimeService,
    createCreatorReferenceService,
    createLocalHttpService,
    createActionImportService,
    createCursorAssetService,
    createSystemCursorService,
    createAppLogService,
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
  const companionAudioLeaseService = typeof createCompanionAudioLeaseService === 'function'
    ? createCompanionAudioLeaseService({ getSettings: () => settingsService.get() })
    : null

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
  const secretService = createSecretService({ safeStorage })
  const appLogService = createAppLogService({
    logDir: path.join(app.getPath('userData'), 'logs')
  })
  const companionIntentBroker = createCompanionIntentBroker({
    now: Date.now,
    isEnabled: () => settingsService.get()?.companion?.enabled !== false,
    dispatch: createPetIntentDispatcher({
      eventBus,
      now: Date.now,
      resolveAttentionPresentation: (status) => actionService.resolvePresentation?.(status)
    }),
    onTimerError: (error) => {
      try {
        appLogService.record?.({
          actor: 'system',
          scope: 'pet',
          level: 'error',
          event: 'companion.intent.expiry-dispatch.failed',
          message: 'Companion intent expiry dispatch failed',
          details: { errorCode: String(error?.code || error?.name || 'dispatch-error').slice(0, 80) }
        })
      } catch (_) {
        // Expiry diagnostics must not crash the Electron main process.
      }
    }
  })
  const syncCompanionFocus = (settings) => {
    try {
      companionIntentBroker.setFocusedSession(settings?.companion?.focusedSessionKey || '')
    } catch (error) {
      try {
        appLogService.record?.({
          actor: 'system',
          scope: 'pet',
          level: 'warn',
          event: 'companion.focus.sync.failed',
          message: 'Companion focus setting was rejected',
          details: { errorCode: String(error?.code || error?.name || 'invalid-focus').slice(0, 80) }
        })
      } catch (_) {
        // Settings synchronization must never break pet startup.
      }
    }
  }
  const syncCompanionEnabled = (settings) => {
    companionIntentBroker.setCompanionEnabled?.(settings?.companion?.enabled !== false)
  }
  syncCompanionEnabled(settingsService.get())
  syncCompanionFocus(settingsService.get())
  eventBus.on?.(SETTINGS_CHANGED, (settings) => {
    syncCompanionEnabled(settings)
    syncCompanionFocus(settings)
  })
  const petService = createPetService({
    eventBus,
    settingsService,
    actionService,
    appLogService,
    companionIntentBroker,
    companionAudioLeaseService
  })
  const aiSidecar = createAiSidecarProxy({ getBackend, fetchImpl, onSnapshot: onAiSnapshot, getActivePetPackId: () => petPackService.getActivePetPack?.()?.manifest?.id || '' })
  const { aiService, aiTalkService, petUtteranceLogService, behaviorOrchestratorService } = aiSidecar
  const imageGenerationModelService = createImageGenerationModelService({ settingsService, secretService, appLogService })
  const triggerRuleRuntimeService = createTriggerRuleRuntimeService({ actionService, petService, appLogService })
  const creatorReferenceService = createCreatorReferenceService({
    settingsService,
    referenceRoot: path.join(app.getPath('userData'), 'creator-references')
  })
  const localHttpService = createLocalHttpService({ petService, settingsService })
  const petMovementPolicy = createPetMovementPolicy({ screen })
  const createLegacyActionImportService = () => createActionImportService({
    framesRoot: path.join(projectRoot, 'cat_anime', 'flames'),
    spritesDir: path.join(projectRoot, 'cat_anime', 'sprites'),
    configPath: path.join(projectRoot, 'cat_anime', 'animations.json')
  })
  const createActiveActionImportService = () => {
    const activePack = petPackService.getActivePetPack?.()
    if (!activePack) return createLegacyActionImportService()
    const sourceType = activePack.source?.type || ''
    if (sourceType === 'user-installed') {
      return createActionImportService({
        framesRoot: path.join(activePack.rootPath, 'frames'),
        spritesDir: path.join(activePack.rootPath, 'sprites'),
        configPath: path.join(activePack.rootPath, 'pet.json'),
        configType: 'pet-pack',
        spriteRelativeDir: 'sprites'
      })
    }
    if (sourceType === 'built-in' && activePack.manifest?.id === 'legacy-cat') {
      return createLegacyActionImportService()
    }
    throw new Error('Action frame editing is only available for the built-in legacy pack or active installed pet packs')
  }
  const actionImportService = {
    inspectActionFrames: (payload) => createActiveActionImportService().inspectActionFrames(payload),
    importActionFrames: (payload) => createActiveActionImportService().importActionFrames(payload),
    regenerate: (payload) => createActiveActionImportService().regenerate(payload),
    updateActionConfig: (payload) => createActiveActionImportService().updateActionConfig(payload),
    deleteAction: (actionId) => createActiveActionImportService().deleteAction(actionId)
  }
  const cursorAssetService = createCursorAssetService({
    cursorDir: path.join(app.getPath('userData'), 'cursors')
  })
  const systemCursorService = typeof createSystemCursorService === 'function'
    ? createSystemCursorService({
        projectRoot,
        userDataPath: app.getPath('userData'),
        appLogService,
        onUnexpectedExit: onSystemCursorUnexpectedExit
      })
    : {
        getStatus: () => ({ supported: false, platform: process.platform, active: false, helperPid: 0 }),
        sync: async () => {},
        dispose: async () => {}
      }

  return {
    setCatalogService: (nextCatalogService) => {
      catalogService = nextCatalogService
    },
    syncLoginItemSettings,
    services: {
      actionImportService,
      actionService,
      aiService,
      aiTalkService,
      aiSidecar,
      appLogService,
      companionAudioLeaseService,
      behaviorOrchestratorService,
      cursorAssetService,
      systemCursorService,
      creatorReferenceService,
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
