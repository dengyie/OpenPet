import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { getLegacyPetAnimations, loadLegacyPetPack } = require("../../apps/desktop/src/pet/pet-pack/loader.js")

/**
 * Resident Backend context is deterministic and server-owned: only the
 * bundled legacy pack and its animation manifest are exposed to AI.
 */
export function createResidentAiContext({ getPetAnimations = getLegacyPetAnimations } = {}) {
	if (typeof getPetAnimations !== "function") throw new TypeError("resident AI context requires an animation loader")
	const pack = loadLegacyPetPack({ id: "legacy-cat", displayName: "Legacy Cat", getPetAnimations })
	return {
		pack,
		actions: pack.manifest.actions.map((action) => structuredClone(action)),
	}
}
