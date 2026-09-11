const createWindowServices = ({
  BrowserWindow,
  app,
  screen,
  getPetWindow,
  createSettingsWindow,
  createPetChatWindowManager,
  createPetBubbleChatWindowManager,
  petMovementPolicy,
  settingsService,
  appLogService
}) => ({
  petMovementPolicy,
  petChatWindowService: createPetChatWindowManager({
    getPetWindow,
    settingsService,
    appLogService,
    BrowserWindow,
    screen,
    app,
    createSettingsWindow: () => createSettingsWindow(getPetWindow())
  }),
  petBubbleChatWindowService: createPetBubbleChatWindowManager({
    getPetWindow,
    settingsService,
    appLogService,
    BrowserWindow,
    screen
  })
})

module.exports = {
  createWindowServices
}
