const { IPC } = require('../../shared/ipc-channels')

const registerSystemAboutIpc = (context) => {
  const {
    ipcMainService,
    aboutService,
    helpers
  } = context
  const {
    createAboutInfoView,
    createUpdateCheckView
  } = helpers

  ipcMainService.handle(IPC.ABOUT_GET_INFO, () => createAboutInfoView(aboutService.getInfo()))
  ipcMainService.handle(IPC.ABOUT_CHECK_UPDATES, async () => createUpdateCheckView(await aboutService.checkForUpdates()))
}

module.exports = {
  registerSystemAboutIpc
}
