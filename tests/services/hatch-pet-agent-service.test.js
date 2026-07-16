const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createHatchPetAgentService } = require('../../src/main/services/hatch-pet-agent-service')

const validDecision = (decision = 'generate-identity') => ({ schemaVersion: 1, decision, scope: {}, reasonCodes: ['ready'], confidence: 0.8 })

const createHarness = ({ enabled = true, configMode = 'follow-chat', completions = [], secret = 'sk-host-owned' } = {}) => {
  let settings = { ai: { provider: 'openai-compatible', baseUrl: 'https://chat.test/v1', model: 'chat-model', apiKeyRef: 'ai.default', conversations: { untouched: [{ role: 'user', content: 'keep' }] }, memory: { enabled: true }, behavior: { enabled: true }, hatchPet: { enabled, configMode, provider: 'openai-compatible', baseUrl: 'https://dedicated.test/v1', model: 'planner', apiKeyRef: 'wrong-ref' } } }
  const calls = []
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-hatch-service-'))
  const queue = [...completions]
  const service = createHatchPetAgentService({
    aiService: { completeStructuredTool: async (request) => { calls.push(request); const next = queue.shift(); if (next instanceof Error) throw next; return next } },
    settingsService: { get: () => settings, update: (updater) => { settings = updater(settings); return settings } },
    secretService: { getSecretValue: () => secret, setSecret: () => {}, deleteSecret: () => {} },
    pluginService: { getPluginCreatorDataDir: () => dataDir },
    idFactory: () => 'decision-1', now: () => '2026-07-15T00:00:00.000Z'
  })
  return { service, calls, dataDir, getSettings: () => settings }
}

test('disabled hatch-pet performs no model work and creates no run artifacts', async () => {
  const h = createHarness({ enabled: false })
  const result = await h.service.createShadowDecision({ runId: 'run-disabled', mode: 'full-pet', stage: 'planning' })
  assert.equal(result.status, 'disabled')
  assert.equal(h.calls.length, 0)
  assert.equal(fs.existsSync(path.join(h.dataDir, 'runs')), false)
})

test('shadow planning is stateless text-only and preserves ordinary chat state', async () => {
  const h = createHarness({ completions: [{ arguments: validDecision(), provider: 'openai-compatible', model: 'chat-model', elapsedMs: 5 }] })
  const before = JSON.stringify(h.getSettings().ai)
  const result = await h.service.createShadowDecision({ runId: 'run-ok', mode: 'full-pet', userIntent: 'make a pet', stage: 'planning', workflowEvidence: { provider: { ready: true } } })
  assert.equal(result.status, 'shadow-recorded')
  assert.equal(h.calls.length, 1)
  const serialized = JSON.stringify(h.calls[0])
  assert.equal(serialized.includes('sk-host-owned'), false)
  assert.equal(serialized.includes('untouched'), false)
  assert.equal(serialized.includes('memory'), false)
  assert.equal(serialized.includes('image_url'), false)
  assert.equal(JSON.stringify(h.getSettings().ai), before)
})

for (const invalid of [
  { name: 'missing or differently named required tool', first: new Error('AI provider did not return required tool call: hatch_pet_decision') },
  { name: 'malformed or non-object arguments', first: new Error('AI provider returned invalid tool arguments for hatch_pet_decision') },
  { name: 'contract-invalid arguments', first: { arguments: { ...validDecision(), unknown: true }, provider: 'p', model: 'm', elapsedMs: 1 } }
]) {
  test(`invalid output ${invalid.name} receives exactly one successful repair`, async () => {
    const h = createHarness({ completions: [invalid.first, { arguments: validDecision(), provider: 'p', model: 'm', elapsedMs: 1 }] })
    const result = await h.service.createShadowDecision({ runId: `run-repair-${invalid.name.length}`, mode: 'full-pet', stage: 'planning' })
    assert.equal(result.status, 'shadow-recorded')
    assert.equal(h.calls.length, 2)
    assert.match(h.calls[1].messages[1].content, /previous tool arguments were invalid/i)
  })

  test(`invalid output ${invalid.name} stops after a second invalid response`, async () => {
    const second = new Error('AI provider did not return required tool call: hatch_pet_decision')
    const h = createHarness({ completions: [invalid.first, second, { arguments: validDecision(), provider: 'p', model: 'm', elapsedMs: 1 }] })
    const runId = `run-fail-${invalid.name.length}`
    const result = await h.service.createShadowDecision({ runId, mode: 'full-pet', stage: 'planning' })
    assert.equal(result.status, 'shadow-failed')
    assert.equal(h.calls.length, 2)
    const status = h.service.getRunStatus(runId)
    assert.equal(status.state.failureCode, 'invalid_model_decision')
    assert.equal(status.decisions.at(-1).resultCode, 'invalid_model_decision')
  })
}

test('dedicated mode uses only fixed ai.hatch-pet secret reference', () => {
  const h = createHarness({ configMode: 'override' })
  const saved = h.service.saveConfig({ apiKeyRef: 'attacker-controlled', configMode: 'override' })
  assert.equal(saved.apiKeyRef, 'ai.hatch-pet')
  assert.equal(h.getSettings().ai.hatchPet.apiKeyRef, 'ai.hatch-pet')
})
