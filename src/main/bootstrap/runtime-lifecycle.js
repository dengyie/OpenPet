const { IPC } = require('../../shared/ipc-channels')

const PLUGIN_SHUTDOWN_TIMEOUT_MS = 2000
const noop = () => {}

const registerRuntimeAppLifecycle = ({
  app,
  appLogService,
  registerAppLifecycleLogs,
  safeRecordAppLog,
  triggerRuleRuntimeService,
  getPluginService,
  shutdownTimeoutMs = PLUGIN_SHUTDOWN_TIMEOUT_MS
}) => {
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
        .then(() => getPluginService()?.stopAllServices?.())
      const shutdownTimeout = new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          safeRecordAppLog(appLogService, {
            scope: 'plugins',
            level: 'error',
            actor: 'system',
            event: 'plugins.shutdown.timed_out',
            message: `Plugin shutdown exceeded ${shutdownTimeoutMs}ms; continuing app quit`
          })
          resolve()
        }, shutdownTimeoutMs)
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
}

const normalizePetWindowForDisplayChange = ({
  getPetWindow,
  petService,
  petMovementPolicy,
  createPetRendererSettings
}) => {
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

const registerDisplayLifecycle = ({
  screen,
  getPetWindow,
  petService,
  petMovementPolicy,
  createPetRendererSettings
}) => {
  const normalizeForDisplayChange = () => normalizePetWindowForDisplayChange({
    getPetWindow,
    petService,
    petMovementPolicy,
    createPetRendererSettings
  })

  screen?.on?.('display-metrics-changed', normalizeForDisplayChange)
  screen?.on?.('display-removed', normalizeForDisplayChange)
  screen?.on?.('display-added', normalizeForDisplayChange)

  return normalizeForDisplayChange
}

const registerPetWindowLifecycle = ({
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
  pluginInstallService,
  pluginService,
  applyWindowScale,
  createPetRendererSettings,
  maybeRunPackagedRuntimeSmoke = noop,
  maybeRunPackagedPluginCleanupEvidence = noop,
  maybeRunPackagedCreatorStudioEvidence = noop,
  maybeRunPackagedCreatorStudioUiE2e = noop,
  maybeRunPackagedCreateUiSmoke = noop
}) => {
  let activePetWindow = petWindow

  activePetWindow.webContents.on('did-finish-load', () => {
    const settings = petService.getSettings()
    applyWindowScale(activePetWindow, settings.scale)
    activePetWindow.webContents.send(IPC.SETTINGS_CHANGED, createPetRendererSettings(settings))
    maybeRunPackagedRuntimeSmoke({ app, petWindow: activePetWindow, petService, petPackService, petBubbleChatWindowService })
    maybeRunPackagedPluginCleanupEvidence({ app, pluginInstallService, pluginService })
    maybeRunPackagedCreatorStudioEvidence({ app, pluginService })
    maybeRunPackagedCreatorStudioUiE2e({
      app,
      pluginService,
      openControlCenter: () => createSettingsWindow(getPetWindow())
    })
    maybeRunPackagedCreateUiSmoke({
      app,
      openControlCenter: () => createSettingsWindow(getPetWindow())
    })
  })
  loadPetWindow(activePetWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      activePetWindow = createWindow()
      setPetWindow(activePetWindow)
    }
  })
}

module.exports = {
  PLUGIN_SHUTDOWN_TIMEOUT_MS,
  normalizePetWindowForDisplayChange,
  registerDisplayLifecycle,
  registerPetWindowLifecycle,
  registerRuntimeAppLifecycle
}
