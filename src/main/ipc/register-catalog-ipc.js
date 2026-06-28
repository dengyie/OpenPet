const { IPC } = require('../../shared/ipc-channels')

const registerCatalogIpc = ({
  ipcMainService,
  catalogService,
  getPetWindow,
  petService,
  reloadAndSendAnimations,
  createCatalogView,
  createCatalogBlocklistResult
}) => {
  ipcMainService.handle(IPC.CATALOG_GET, () => createCatalogView(catalogService.listCatalog()))
  ipcMainService.handle(IPC.CATALOG_PREPARE_INSTALL, (_event, payload) => catalogService.prepareInstall(payload))
  ipcMainService.handle(IPC.CATALOG_INSTALL_SELECTION, (_event, payload) => {
    const result = catalogService.installSelection(payload.selectionId)
    if (result.kind === 'pet-pack' && result.petPacks?.activePackId === result.itemId) {
      reloadAndSendAnimations(getPetWindow, petService)
      return { ...result, animations: petService.getPreviewAnimations(), catalog: createCatalogView(catalogService.listCatalog()) }
    }
    return { ...result, catalog: createCatalogView(catalogService.listCatalog()) }
  })
  ipcMainService.handle(IPC.CATALOG_CLEAR_SELECTION, (_event, payload) => catalogService.clearSelection(payload?.selectionId))
  ipcMainService.handle(IPC.CATALOG_ADD_BLOCKLIST, (_event, payload) => (
    createCatalogBlocklistResult(catalogService.listCatalog(), catalogService.addBlocklistEntry(payload))
  ))
  ipcMainService.handle(IPC.CATALOG_REMOVE_BLOCKLIST, (_event, payload) => (
    createCatalogBlocklistResult(catalogService.listCatalog(), catalogService.removeBlocklistEntry(payload))
  ))
}

module.exports = { registerCatalogIpc }
