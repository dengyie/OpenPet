const { IPC } = require('../../shared/ipc-channels')
const registerSettingsIpc = ({
  ipcMainService,
  petService,
  getPetWindow,
  browserWindowService,
  cursorAssetService,
  showOpenDialogForEvent,
  sendToPetWindow,
  createPetRendererSettings,
  recordAppLog
}) => {
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
