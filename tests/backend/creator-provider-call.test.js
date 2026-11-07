"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { createHatchPetAgentService } = require("../../apps/desktop/src/services/hatch-pet-agent-service")
const { createBudgetLedger } = require("../../apps/desktop/src/services/hatch-pet-agent-budget-ledger")

let runCreatorProviderCall

test.before(async () => {
	({ runCreatorProviderCall } = await import("../../services/backend/bridge/creator-provider-call.js"))
})

test("resident Creator Provider calls settle successful usage with the operation result", async () => {
	const calls = []
	const result = await runCreatorProviderCall({
		pluginId: "openpet.creator-studio",
		payload: { runId: "run-video", timeoutMs: 300000 },
		hatchAgentFactory: () => ({
			reserveProviderCall: (input) => {
				calls.push(["reserve", input])
				return { reservationId: "provider-1", budgetLedger: { marker: "reserved" } }
			},
			recordProviderCall: (input) => calls.push(["record", input]),
		}),
		operation: async ({ signal }) => {
			assert.equal(signal, null)
			return { ok: true, usage: { estimatedCostUsd: 0.12 } }
		},
	})

	assert.equal(result.ok, true)
	assert.deepEqual(calls, [
		["reserve", { runId: "run-video", timeoutMs: 300000 }],
		["record", { runId: "run-video", reservationId: "provider-1", budgetLedger: { marker: "reserved" }, ok: true, code: "ok", estimatedCost: 0.12 }],
	])
})

test("resident Creator Provider failures settle a bounded HTTP failure code", async () => {
	const calls = []
	const failure = Object.assign(new Error("Provider returned HTTP 524"), { code: "provider_http_error" })
	await assert.rejects(
		runCreatorProviderCall({
			pluginId: "openpet.creator-studio",
			payload: { runId: "run-video", timeoutMs: 1 },
			hatchAgentFactory: () => ({
				reserveProviderCall: () => ({ reservationId: "provider-2", budgetLedger: {} }),
				recordProviderCall: (input) => calls.push(input),
			}),
			operation: async () => { throw failure },
		}),
		(error) => error === failure,
	)
	assert.deepEqual(calls, [{ runId: "run-video", reservationId: "provider-2", budgetLedger: {}, ok: false, code: "http-524" }])
})

test("non-Creator Provider calls do not acquire Hatch reservations", async () => {
	let factoryCalls = 0
	const result = await runCreatorProviderCall({
		pluginId: "other-plugin",
		payload: { runId: "run-video" },
		hatchAgentFactory: () => { factoryCalls += 1; return null },
		operation: async () => ({ ok: true }),
	})
	assert.deepEqual(result, { ok: true })
	assert.equal(factoryCalls, 0)
})

test("resident Creator refuses an exhausted downstream evaluator before contacting a paid Provider", async () => {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpet-creator-budget-admission-"))
	const ledgerPath = path.join(dataDir, "runs/run-exhausted/budgets/ledger.json")
	fs.mkdirSync(path.dirname(ledgerPath), { recursive: true })
	const ledger = createBudgetLedger({ limits: { maxEvaluatorCalls: 1 } })
	const bytes = JSON.stringify({ ...ledger, usage: { ...ledger.usage, evaluatorCalls: 1 } })
	fs.writeFileSync(ledgerPath, bytes)
	const agent = createHatchPetAgentService({
		settingsService: { get: () => ({ ai: { hatchPet: { budgets: { maxEvaluatorCalls: 1 } } } }), update: () => { assert.fail("budget admission must not modify settings") } },
		secretService: { getSecretValue: () => "", setSecret: () => { assert.fail("budget admission must not modify credentials") } },
		aiService: { completeStructuredTool: async () => { assert.fail("budget admission must not call the evaluator") } },
		pluginService: { getPluginCreatorDataDir: () => dataDir },
	})
	let providerCalls = 0
	await assert.rejects(runCreatorProviderCall({
		pluginId: "openpet.creator-studio", payload: { runId: "run-exhausted" },
		hatchAgentFactory: () => agent,
		operation: async () => { providerCalls++; return { ok: true } },
	}), { code: "hatch_pet_evaluator_call_budget_exhausted" })
	assert.equal(providerCalls, 0)
	assert.equal(fs.readFileSync(ledgerPath, "utf8"), bytes)
})

test("a successful Provider call with a settlement failure is not settled a second time as a Provider failure", async () => {
	let settlementCalls = 0
	const settlementFailure = new Error("ledger persistence failed")
	await assert.rejects(
		runCreatorProviderCall({
			pluginId: "openpet.creator-studio",
			payload: { runId: "run-video" },
			hatchAgentFactory: () => ({
				reserveProviderCall: () => ({ reservationId: "provider-3", budgetLedger: {} }),
				recordProviderCall: () => { settlementCalls += 1; throw settlementFailure },
			}),
			operation: async () => ({ ok: true }),
		}),
		(error) => error === settlementFailure,
	)
	assert.equal(settlementCalls, 1)
})
