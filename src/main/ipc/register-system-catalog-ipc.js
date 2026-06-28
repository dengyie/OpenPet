const { IPC } = require('../../shared/ipc-channels')

const registerSystemCatalogIpc = (context) => {
  const {
    ipcMainService,
    catalogService,
    petService,
    getPetWindow,
    helpers
  } = context
  const {
    createCatalogBlocklistResult,
    reloadAndSendAnimations
  } = helpers

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
  registerSystemCatalogIpc
}
