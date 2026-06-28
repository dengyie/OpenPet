const { IPC } = require('../../shared/ipc-channels')

const registerSystemIpc = ({
  ipcMainService,
  getPetWindow,
  createSettingsWindow,
  requestAppQuit
}) => {
  ipcMainService.on(IPC.PET_QUIT, () => requestAppQuit('pet-renderer'))

  ipcMainService.on(IPC.SETTINGS_OPEN, () => {
    createSettingsWindow(getPetWindow())
  })
}

module.exports = { registerSystemIpc }
