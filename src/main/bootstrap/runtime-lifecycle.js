const { IPC } = require('../../shared/ipc-channels')

// 必须大于 plugin-service stopAllServices 内部的 5000ms 等待
//（SIGTERM→SIGKILL 宽限期 + 落盘余量），否则应用先于插件优雅关停退出。
const PLUGIN_SHUTDOWN_TIMEOUT_MS = 6000
const noop = () => {}

const registerRuntimeAppLifecycle = ({
  app,
  appLogService,
  registerAppLifecycleLogs,
  safeRecordAppLog,
  triggerRuleRuntimeService,
  aiTalkService,
  systemCursorService,
  sidecarRuntimeCoordinator,
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

      safeRecordAppLog(appLogService, {
        scope: 'ai-talk',
        level: 'info',
        actor: 'system',
        event: 'ai-talk.shutdown.started',
        message: 'AI talk shutdown started'
      })
      try {
        aiTalkService?.dispose?.()
      } catch (error) {
        safeRecordAppLog(appLogService, {
          scope: 'ai-talk',
          level: 'error',
          actor: 'system',
          event: 'ai-talk.shutdown.failed',
          message: error?.message || 'AI talk disposal failed before app quit'
        })
      }

      const pluginShutdown = Promise.resolve()
        .then(() => getPluginService()?.stopAllServices?.())
        .catch((error) => {
          safeRecordAppLog(appLogService, {
            scope: 'plugins',
            level: 'error',
            actor: 'system',
            event: 'plugins.shutdown.failed',
            message: error?.message || 'Plugin shutdown failed before app quit'
          })
        })
      const aiTalkShutdown = Promise.resolve()
        .then(() => aiTalkService?.flushMemoryJobs?.())
        .then(() => {
          safeRecordAppLog(appLogService, {
            scope: 'ai-talk',
            level: 'info',
            actor: 'system',
            event: 'ai-talk.shutdown.completed',
            message: 'AI talk shutdown completed'
          })
        })
        .catch((error) => {
          safeRecordAppLog(appLogService, {
            scope: 'ai-talk',
            level: 'error',
            actor: 'system',
            event: 'ai-talk.shutdown.failed',
            message: error?.message || 'AI talk memory job shutdown failed before app quit'
          })
        })
      const systemCursorShutdown = Promise.resolve()
        .then(() => systemCursorService?.dispose?.())
        .catch((error) => {
          safeRecordAppLog(appLogService, {
            scope: 'system-cursor',
            level: 'error',
            actor: 'system',
            event: 'system-cursor.shutdown.failed',
            message: error?.message || 'System cursor restoration failed before app quit'
          })
        })
      const sidecarShutdown = Promise.resolve()
        .then(() => sidecarRuntimeCoordinator?.stop?.())
        .catch((error) => {
          safeRecordAppLog(appLogService, {
            scope: 'sidecar',
            level: 'error',
            actor: 'system',
            event: 'sidecar.shutdown.failed',
            message: error?.message || 'Sidecar shutdown failed before app quit'
          })
        })
      const runtimeShutdown = Promise.all([pluginShutdown, aiTalkShutdown, systemCursorShutdown, sidecarShutdown])
      let shutdownTimedOut = false
      const shutdownTimeout = new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          shutdownTimedOut = true
          safeRecordAppLog(appLogService, {
            scope: 'runtime',
            level: 'error',
            actor: 'system',
            event: 'runtime.shutdown.timed_out',
            message: `Runtime cleanup exceeded ${shutdownTimeoutMs}ms; continuing app quit`
          })
          resolve()
        }, shutdownTimeoutMs)
        timeoutId?.unref?.()
        runtimeShutdown.finally(() => clearTimeout(timeoutId))
      })

      Promise.resolve()
        .then(() => Promise.race([runtimeShutdown, shutdownTimeout]))
        .then(() => {
          if (!shutdownTimedOut) return
          try {
            const result = aiTalkService?.interruptPendingMemoryJobs?.('shutdown_interrupted')
            safeRecordAppLog(appLogService, {
              scope: 'ai-talk',
              level: 'warn',
              actor: 'system',
              event: 'ai-talk.memory.jobs.interrupted',
              message: 'AI talk pending memory jobs interrupted during shutdown',
              details: {
                interruptedCount: Number(result?.interruptedCount) || 0,
                errorCode: 'shutdown_interrupted'
              }
            })
          } catch (error) {
            safeRecordAppLog(appLogService, {
              scope: 'ai-talk',
              level: 'error',
              actor: 'system',
              event: 'ai-talk.shutdown.failed',
              message: error?.message || 'AI talk pending memory jobs could not be interrupted'
            })
          }
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
  systemCursorService,
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
    activePetWindow.webContents.send(IPC.SETTINGS_CHANGED, createPetRendererSettings(
      petService.getSettings(),
      systemCursorService?.getStatus?.()
    ))
  }
}

const registerDisplayLifecycle = ({
  screen,
  getPetWindow,
  petService,
  systemCursorService,
  petMovementPolicy,
  createPetRendererSettings
}) => {
  const normalizeForDisplayChange = () => normalizePetWindowForDisplayChange({
    getPetWindow,
    petService,
    systemCursorService,
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
  systemCursorService,
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
    activePetWindow.webContents.send(IPC.SETTINGS_CHANGED, createPetRendererSettings(
      settings,
      systemCursorService?.getStatus?.()
    ))
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
