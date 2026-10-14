const { IPC } = require('../shared/ipc-channels')
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
