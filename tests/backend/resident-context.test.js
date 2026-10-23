const test = require("node:test")
const assert = require("node:assert/strict")

test("resident AI context provides a server-owned default pack and action list", async () => {
		const { createResidentAiContext } = await import("../../services/backend/resident-context.js")
		const context = createResidentAiContext({
			getPetAnimations: () => ({
				defaultAction: "idle",
				clickAction: "wave",
				actions: [
					{ id: "idle", label: "Idle", loop: true, frameMs: 100, frameWidth: 1, frameHeight: 1, frameCount: 1, sprite: "sprites/idle.png" },
					{ id: "wave", label: "Wave", loop: false, frameMs: 100, frameWidth: 1, frameHeight: 1, frameCount: 1, sprite: "sprites/wave.png" },
				],
			}),
		})
		assert.equal(context.pack.manifest.id, "legacy-cat")
		assert.deepEqual(context.actions.map(({ id, label }) => ({ id, label })), [
			{ id: "idle", label: "Idle" },
			{ id: "wave", label: "Wave" },
		])
})
