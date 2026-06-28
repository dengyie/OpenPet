const { IPC } = require('../../shared/ipc-channels')
const { createCoreServices } = require('./create-core-services')
const { createPluginServices } = require('./create-plugin-services')
const { createWindowServices } = require('./create-window-services')

const PLUGIN_SHUTDOWN_TIMEOUT_MS = 2000

const hasCursorRepairChanged = (before = {}, after = {}) => (
  ['assetPath', 'assetUrl', 'fileName', 'width', 'height', 'hotspotX', 'hotspotY']
    .some((key) => before?.[key] !== after?.[key])
)

const applyCursorRepairToCollection = (customCursors = [], previousCursor = {}, repairedCursor = {}) => (
  Array.isArray(customCursors)
    ? customCursors.map((cursor) => {
      const isSameAssetPath = Boolean(previousCursor.assetPath && cursor?.assetPath === previousCursor.assetPath)
      const isSameAssetUrl = Boolean(previousCursor.assetUrl && cursor?.assetUrl === previousCursor.assetUrl)
      const isRepairedCursor = isSameAssetPath || isSameAssetUrl
      return isRepairedCursor
        ? {
            ...cursor,
            assetPath: repairedCursor.assetPath,
            assetUrl: repairedCursor.assetUrl,
            fileName: repairedCursor.fileName,
            width: repairedCursor.width,
            height: repairedCursor.height,
            hotspotX: repairedCursor.hotspotX,
            hotspotY: repairedCursor.hotspotY
          }
        : cursor
    })
    : []
)

const registerCursorRepair = ({ cursorAssetService, petService, appLogService }) => {
  const cursorBeforeRepair = petService.getSettings().customCursor
  cursorAssetService.repairCursor(cursorBeforeRepair).then((customCursor) => {
    const currentSettings = petService.getSettings()
    if (customCursor.assetPath && hasCursorRepairChanged(cursorBeforeRepair, customCursor)) {
      petService.saveSettings({
        ...currentSettings,
        customCursor,
        customCursors: applyCursorRepairToCollection(currentSettings.customCursors, cursorBeforeRepair, customCursor)
      })
      appLogService.record({
        scope: 'settings',
        level: 'info',
        actor: 'system',
        event: 'settings.cursor.asset.repaired',
        message: 'Cursor asset resized for browser compatibility',
        details: { fileName: customCursor.fileName, enabled: customCursor.enabled }
      })
    }
  }).catch((error) => {
    appLogService.record({
      scope: 'settings',
      level: 'error',
      actor: 'system',
      event: 'settings.cursor.asset.repair.failed',
      message: error.message
    })
  })
}

const maybeStartLocalHttp = ({ petService, localHttpService, normalizeLocalHttpConfig }) => {
  let localHttpConfig = petService.getSettings().localHttp
  if (!localHttpConfig?.enabled) return

  const normalizedConfig = normalizeLocalHttpConfig(localHttpConfig, localHttpConfig)
  if (normalizedConfig.token !== localHttpConfig.token) {
    const currentSettings = petService.getSettings()
    petService.saveSettings({ ...currentSettings, localHttp: normalizedConfig })
    localHttpConfig = normalizedConfig
  }
  localHttpService.start(localHttpConfig).catch((error) => {
    console.error('Failed to start local HTTP service:', error.message)
  })
}

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
  let pluginShutdownInFlight = false
  registerAppLifecycleLogs({
    app,
    appLogService,
    onBeforeQuit: (event) => {
      if (pluginShutdownInFlight) return
      pluginShutdownInFlight = true
      event?.preventDefault?.()

      try {
        triggerRuleRuntimeService?.stop?.()
      } catch (error) {
        safeRecordAppLog(appLogService, {
          scope: 'pet-runtime',
          level: 'error',
          actor: 'system',
          event: 'trigger-rule.runtime.stop.failed',
          message: error?.message || 'Trigger rule runtime stop failed before app quit'
        })
      }

      const pluginShutdown = Promise.resolve()
        .then(() => pluginService?.stopAllServices?.())
      const shutdownTimeout = new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          safeRecordAppLog(appLogService, {
            scope: 'plugins',
            level: 'error',
            actor: 'system',
            event: 'plugins.shutdown.timed_out',
            message: `Plugin shutdown exceeded ${PLUGIN_SHUTDOWN_TIMEOUT_MS}ms; continuing app quit`
          })
          resolve()
        }, PLUGIN_SHUTDOWN_TIMEOUT_MS)
        timeoutId?.unref?.()
        pluginShutdown.finally(() => clearTimeout(timeoutId))
      })

      Promise.resolve()
        .then(() => Promise.race([pluginShutdown, shutdownTimeout]))
        .catch((error) => {
          safeRecordAppLog(appLogService, {
            scope: 'plugins',
            level: 'error',
            actor: 'system',
            event: 'plugins.shutdown.failed',
            message: error?.message || 'Plugin shutdown failed before app quit'
          })
        })
        .finally(() => {
          app.quit()
        })
    }
  })

  registerCursorRepair({ cursorAssetService, petService, appLogService })

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
    reloadAndSendAnimations
  })
  pluginService = pluginServices.pluginService
  setCatalogService(pluginServices.catalogService)
  const creatorStudioDefaultFlowService = factories.createCreatorStudioDefaultFlowService({
    pluginService,
    imageGenerationModelService
  })

  maybeStartLocalHttp({ petService, localHttpService, normalizeLocalHttpConfig })
  syncLoginItemSettings(petService.getSettings().autoStart)
  triggerRuleRuntimeService.start()

  registerIpcHandlers({
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
  })

  let petWindow = createWindow({ load: false })
  setPetWindow(petWindow)

  const normalizePetWindowForDisplayChange = () => {
    const activePetWindow = getPetWindow()
    if (!activePetWindow || activePetWindow.isDestroyed()) return
    const currentSettings = petService.getSettings()
    const next = petMovementPolicy.normalizeWindowForDisplay({
      windowBounds: activePetWindow.getBounds(),
      settings: currentSettings.petBehavior
    })
    activePetWindow.setPosition(next.x, next.y)

    const behavior = petMovementPolicy.normalizePetBehaviorSettings(currentSettings.petBehavior)
    if (!behavior.home.enabled || !behavior.home.anchor) return
    const display = petMovementPolicy.resolveDisplayForWindow(activePetWindow.getBounds())
    const anchor = petMovementPolicy.normalizeAnchorForDisplay({
      anchor: behavior.home.anchor,
      display,
      windowBounds: activePetWindow.getBounds()
    })

    if (
      anchor.displayId !== behavior.home.anchor.displayId
      || anchor.x !== behavior.home.anchor.x
      || anchor.y !== behavior.home.anchor.y
    ) {
      petService.saveSettings({
        ...currentSettings,
        petBehavior: {
          ...behavior,
          home: {
            ...behavior.home,
            anchor
          }
        }
      })
      activePetWindow.webContents.send(IPC.SETTINGS_CHANGED, createPetRendererSettings(petService.getSettings()))
    }
  }

  screen?.on?.('display-metrics-changed', normalizePetWindowForDisplayChange)
  screen?.on?.('display-removed', normalizePetWindowForDisplayChange)
  screen?.on?.('display-added', normalizePetWindowForDisplayChange)

  petWindow.webContents.on('did-finish-load', () => {
    const settings = petService.getSettings()
    applyWindowScale(petWindow, settings.scale)
    petWindow.webContents.send(IPC.SETTINGS_CHANGED, createPetRendererSettings(settings))
    maybeRunPackagedRuntimeSmoke({ app, petWindow, petService, petPackService, petBubbleChatWindowService })
    maybeRunPackagedPluginCleanupEvidence({ app, pluginInstallService: pluginServices.pluginInstallService, pluginService })
    maybeRunPackagedCreatorStudioEvidence({ app, pluginService })
    maybeRunPackagedCreatorStudioUiE2e({
      app,
      pluginService,
      openControlCenter: () => createSettingsWindow(getPetWindow())
    })
  })
  loadPetWindow(petWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      petWindow = createWindow()
      setPetWindow(petWindow)
    }
  })

  return {
    appLogService,
    pluginService
  }
}

module.exports = {
  createOpenPetRuntime
}
