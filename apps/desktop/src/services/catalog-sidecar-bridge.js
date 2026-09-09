"use strict"

const {
	createCatalogBlocklistResult: defaultCreateCatalogBlocklistResult,
	createCatalogView: defaultCreateCatalogView,
} = require("./control-center-adapters")

function createCatalogSidecarBridge({
	catalogService,
	getPetWindow = () => null,
	petService,
	reloadAndSendAnimations = () => {},
	refreshTriggerRuleRuntime = () => {},
	getActionsViewState = () => petService?.getPreviewAnimations?.() || { actions: [] },
	createCatalogView = defaultCreateCatalogView,
	createCatalogBlocklistResult = defaultCreateCatalogBlocklistResult,
} = {}) {
	if (!catalogService) throw new TypeError("catalogService is required")

	const listCatalog = () => createCatalogView(catalogService.listCatalog())

	const installSelection = async (selectionId) => {
		const result = await catalogService.installSelection(selectionId)
		if (result.kind === "pet-pack" && result.petPacks?.activePackId === result.itemId) {
			reloadAndSendAnimations(getPetWindow, petService)
			refreshTriggerRuleRuntime()
			return { ...result, animations: getActionsViewState(), catalog: listCatalog() }
		}
		return { ...result, catalog: listCatalog() }
	}

	const mutateBlocklist = async (operation, request) => {
		const mutation = { type: request.type, value: request.value }
		const blocklist = operation === "addBlocklistEntry"
			? await catalogService.addBlocklistEntry(mutation)
			: await catalogService.removeBlocklistEntry(mutation)
		return createCatalogBlocklistResult(listCatalog(), blocklist)
	}

	async function handle(request = {}) {
		switch (request.operation) {
			case "listCatalog":
				return listCatalog()
			case "prepareInstall":
				return catalogService.prepareInstall({ kind: request.kind, itemId: request.itemId })
			case "installSelection":
				return installSelection(request.selectionId)
			case "clearSelection":
				return catalogService.clearSelection(request.selectionId)
			case "addBlocklistEntry":
			case "removeBlocklistEntry":
				return mutateBlocklist(request.operation, request)
			default:
				throw new Error(`Unsupported Catalog bridge operation: ${String(request.operation || "")}`)
		}
	}

	return { handle }
}

module.exports = { createCatalogSidecarBridge }
