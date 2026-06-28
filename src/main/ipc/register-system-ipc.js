const { IPC } = require('../../shared/ipc-channels')

const registerSystemIpc = (context) => {
  const {
    ipcMainService,
    catalogService,
    localHttpService,
    aboutService,
    petService,
    getPetWindow,
    helpers
  } = context
  const {
    createAboutInfoView,
    createUpdateCheckView,
    createCatalogBlocklistResult,
    createServiceStatusView,
    normalizeLocalHttpConfig,
    createLocalHttpToken,
    reloadAndSendAnimations
  } = helpers

  const getServiceStatusView = () => createServiceStatusView(
    petService.getSettings().localHttp,
    localHttpService.getStatus()
  )

  ipcMainService.handle(IPC.SERVICE_GET_STATUS, getServiceStatusView)
  ipcMainService.handle(IPC.SERVICE_GET_LOGS, (_event, filters) => localHttpService.getLogs(filters))
  ipcMainService.handle(IPC.SERVICE_EXPORT_LOGS, (_event, filters) => localHttpService.exportLogs(filters))
  ipcMainService.handle(IPC.SERVICE_CLEAR_LOGS, () => localHttpService.clearLogs())
  ipcMainService.handle(IPC.SERVICE_ROTATE_TOKEN, async () => {
    const currentSettings = petService.getSettings()
    const nextConfig = normalizeLocalHttpConfig(currentSettings.localHttp, {
      ...currentSettings.localHttp,
      token: createLocalHttpToken()
    })
    const runtime = nextConfig.enabled
      ? await localHttpService.start(nextConfig)
      : localHttpService.getStatus()
    const savedSettings = petService.saveSettings({ ...currentSettings, localHttp: nextConfig })
    return createServiceStatusView(savedSettings.localHttp, localHttpService.getStatus() || runtime)
  })
  ipcMainService.handle(IPC.SERVICE_REVOKE_MCP_SESSIONS, () => {
    const mcp = localHttpService.revokeMcpSessions()
    return createServiceStatusView(petService.getSettings().localHttp, { ...localHttpService.getStatus(), mcp })
  })
  ipcMainService.handle(IPC.SERVICE_SAVE_CONFIG, async (_event, config) => {
    const currentSettings = petService.getSettings()
    const nextConfig = normalizeLocalHttpConfig(currentSettings.localHttp, config)
    const runtime = nextConfig.enabled
      ? await localHttpService.start(nextConfig)
      : await localHttpService.stop()
    const savedSettings = petService.saveSettings({ ...currentSettings, localHttp: nextConfig })
    return createServiceStatusView(savedSettings.localHttp, localHttpService.getStatus() || runtime)
  })

  ipcMainService.handle(IPC.ABOUT_GET_INFO, () => createAboutInfoView(aboutService.getInfo()))
  ipcMainService.handle(IPC.ABOUT_CHECK_UPDATES, async () => createUpdateCheckView(await aboutService.checkForUpdates()))
  ipcMainService.handle(IPC.CATALOG_GET, () => catalogService.listCatalog())
  ipcMainService.handle(IPC.CATALOG_PREPARE_INSTALL, (_event, payload) => catalogService.prepareInstall(payload))
  ipcMainService.handle(IPC.CATALOG_INSTALL_SELECTION, (_event, payload) => {
    const result = catalogService.installSelection(payload.selectionId)
    if (result.kind === 'pet-pack' && result.petPacks?.activePackId === result.itemId) {
      reloadAndSendAnimations(getPetWindow, petService)
      return { ...result, animations: petService.getPreviewAnimations(), catalog: catalogService.listCatalog() }
    }
    return { ...result, catalog: catalogService.listCatalog() }
  })
  ipcMainService.handle(IPC.CATALOG_CLEAR_SELECTION, (_event, payload) => catalogService.clearSelection(payload?.selectionId))
  ipcMainService.handle(IPC.CATALOG_ADD_BLOCKLIST, (_event, payload) => {
    const blocklist = catalogService.addBlocklistEntry(payload)
    return createCatalogBlocklistResult(catalogService.listCatalog(), blocklist)
  })
  ipcMainService.handle(IPC.CATALOG_REMOVE_BLOCKLIST, (_event, payload) => {
    const blocklist = catalogService.removeBlocklistEntry(payload)
    return createCatalogBlocklistResult(catalogService.listCatalog(), blocklist)
  })
}

module.exports = {
  registerSystemIpc
}
