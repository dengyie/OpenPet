const { IPC } = require('../shared/ipc-channels')

const validationError = (message) => Object.assign(new Error(message), { code: 'VALIDATION_FAILED' })

const createSettingsCommandHandler = ({
  petService,
  getPetWindow,
  cursorAssetService,
  showOpenDialogForEvent,
  sendToPetWindow,
  recordAppLog
}) => async ({ operation, payload = {}, event = null } = {}) => {
  if (operation === 'preview-scale') {
    if (!payload || Object.keys(payload).length !== 1 || typeof payload.scale !== 'number' || !Number.isFinite(payload.scale) || payload.scale < 0.5 || payload.scale > 1.5) {
      throw validationError('Settings preview scale is invalid')
    }
    const result = { scale: payload.scale }
    petService.previewSettings(result)
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, result)
    return result
  }

  if (operation === 'import-cursor') {
    if (!payload || Object.keys(payload).length !== 0) throw validationError('Cursor import payload is invalid')
    if (!cursorAssetService?.importCursor) throw Object.assign(new Error('Cursor asset import is not available'), { code: 'BACKEND_UNAVAILABLE' })
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
      if (selected?.canceled || !selected?.filePaths?.[0]) {
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
  }

  throw validationError('Unsupported Settings command')
}

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
  const handleCommand = createSettingsCommandHandler({
    petService, getPetWindow, cursorAssetService, showOpenDialogForEvent, sendToPetWindow, recordAppLog
  })
  ipcMainService.handle(IPC.SETTINGS_IMPORT_CURSOR, async (event) => {
    return handleCommand({ operation: 'import-cursor', payload: {}, event })
  })

  ipcMainService.on(IPC.SETTINGS_PREVIEW_SCALE, (_event, scale) => {
    void handleCommand({ operation: 'preview-scale', payload: { scale } }).catch(() => {})
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

  return handleCommand
}

module.exports = { createSettingsCommandHandler, registerSettingsIpc }
