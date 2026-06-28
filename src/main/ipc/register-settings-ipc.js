const { IPC } = require('../../shared/ipc-channels')

const registerSettingsIpc = ({
  ipcMainService,
  petService,
  getPetWindow,
  browserWindowService,
  cursorAssetService,
  petMovementPolicy,
  showOpenDialogForEvent,
  sendToPetWindow,
  createPetRendererSettings,
  collectCustomCursorAssetPaths,
  mergePetSettingsViewIntoHostSettings,
  recordAppLog
}) => {
  ipcMainService.handle(IPC.SETTINGS_GET, () => createPetRendererSettings(petService.getSettings()))

  ipcMainService.handle(IPC.SETTINGS_IMPORT_CURSOR, async (event) => {
    if (!cursorAssetService?.importCursor) throw new Error('Cursor asset import is not available')
    recordAppLog({
      scope: 'settings',
      level: 'info',
      actor: 'user',
      event: 'settings.cursor.import.opened',
      message: 'Cursor image picker opened'
    })
    try {
      const selected = await showOpenDialogForEvent(event, {
        title: '选择自定义鼠标指针图片',
        properties: ['openFile'],
        filters: [{ name: 'Cursor Images', extensions: ['png', 'webp'] }]
      })
      if (selected.canceled || !selected.filePaths[0]) {
        recordAppLog({
          scope: 'settings',
          level: 'info',
          actor: 'user',
          event: 'settings.cursor.import.canceled',
          message: 'Cursor image picker canceled'
        })
        return { canceled: true }
      }
      const cursor = await cursorAssetService.importCursor(selected.filePaths[0])
      recordAppLog({
        scope: 'settings',
        level: 'info',
        actor: 'system',
        event: 'settings.cursor.import.completed',
        message: 'Cursor image imported',
        details: {
          fileName: cursor.fileName,
          enabled: cursor.enabled
        }
      })
      return { canceled: false, cursor }
    } catch (error) {
      recordAppLog({
        scope: 'settings',
        level: 'error',
        actor: 'system',
        event: 'settings.cursor.import.failed',
        message: error.message
      })
      throw error
    }
  })

  ipcMainService.handle(IPC.SETTINGS_SAVE, (_event, settings) => {
    const petWindow = getPetWindow()
    const previousSettings = petService.getSettings()
    const nextSettings = mergePetSettingsViewIntoHostSettings(petService.getSettings(), settings)
    if (petMovementPolicy && petWindow && !petWindow.isDestroyed()) {
      const behavior = petMovementPolicy.normalizePetBehaviorSettings(nextSettings.petBehavior)
      const currentBehavior = petMovementPolicy.normalizePetBehaviorSettings(previousSettings.petBehavior)
      const needsInitialHomeAnchor = behavior.home.enabled && !behavior.home.anchor
      if (needsInitialHomeAnchor || (!currentBehavior.home.enabled && behavior.home.enabled)) {
        behavior.home.anchor = petMovementPolicy.createHomeAnchorFromWindow({ windowBounds: petWindow.getBounds() })
      }
      nextSettings.petBehavior = behavior
    }

    const savedSettings = petService.saveSettings(nextSettings)
    const previousAssetPaths = new Set(collectCustomCursorAssetPaths(previousSettings.customCursors))
    const nextAssetPaths = new Set(collectCustomCursorAssetPaths(savedSettings.customCursors))
    const orphanedAssetPaths = Array.from(previousAssetPaths).filter((assetPath) => !nextAssetPaths.has(assetPath))
    if (orphanedAssetPaths.length > 0) cursorAssetService?.deleteAssets?.(orphanedAssetPaths)
    const rendererSettings = createPetRendererSettings(savedSettings)
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, rendererSettings)
    recordAppLog({
      scope: 'settings',
      level: 'info',
      actor: 'user',
      event: 'settings.saved',
      message: 'Settings saved',
      details: {
        grounded: Boolean(savedSettings.petBehavior?.grounded),
        homeEnabled: Boolean(savedSettings.petBehavior?.home?.enabled),
        homeRadius: savedSettings.petBehavior?.home?.radius || 'medium',
        customCursorEnabled: Boolean(savedSettings.customCursor?.enabled),
        customCursorFileName: savedSettings.customCursor?.fileName || ''
      }
    })
    return rendererSettings
  })

  ipcMainService.on(IPC.SETTINGS_PREVIEW_SCALE, (_event, scale) => {
    petService.previewSettings({ scale })
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, { scale })
  })

  ipcMainService.on(IPC.SETTINGS_CLOSE, (_event) => {
    const win = browserWindowService.fromWebContents(_event.sender)
    if (win) {
      const petWindow = getPetWindow()
      if (petWindow && petWindow.settingsWindow === win) {
        petWindow.settingsWindow = null
      }
      win.close()
    }
  })
}

module.exports = { registerSettingsIpc }
