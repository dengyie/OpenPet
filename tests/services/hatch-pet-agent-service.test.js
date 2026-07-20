const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sharp = require('sharp')

const { createHatchPetAgentService } = require('../../src/main/services/hatch-pet-agent-service')
const { createBudgetLedger } = require('../../src/main/services/hatch-pet-agent-budget-ledger')
const { getQualityFirstQualityProfile } = require('../../examples/plugins/creator-studio/lib/pet-generation-quality-profile')

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

test('sprite evaluation uses one local review board and records a code-owned gate', async () => {
  const completion = {
    arguments: { schemaVersion: 1, recommendation: 'pass', confidence: 0.95, scores: { identity: 96, silhouette: 94, smallScale: 90, completeness: 98, style: 92, overall: 94 }, defects: [] },
    provider: 'openai-compatible',
    model: 'chat-model',
    elapsedMs: 10
  }
  const h = createHarness({ completions: [completion] })
  const boardPath = path.join(h.dataDir, 'board.png')
  await sharp({ create: { width: 8, height: 8, channels: 4, background: '#fff' } }).png().toFile(boardPath)
  const result = await h.service.evaluateSprite({
    runId: 'run-evaluate',
    scope: 'canonical',
    board: { path: boardPath, sha256: 'a'.repeat(64), regions: [{ regionId: 'source', role: 'source-identity' }, { regionId: 'candidate-1', role: 'canonical-candidate' }] },
    qa: { ok: true, failures: [], metrics: {} },
    profile: getQualityFirstQualityProfile(),
    budgetLedger: createBudgetLedger({ startedAtMs: Date.now() })
  })
  assert.equal(result.gate.ok, true)
  assert.equal(result.budgetLedger.usage.evaluatorCalls, 1)
  assert.equal(h.calls.length, 1)
  assert.equal(JSON.stringify(h.calls[0]).includes(boardPath), false)
  assert.equal(fs.existsSync(path.join(h.dataDir, result.evidenceRelativePath)), true)
})

test('sprite evaluation allows exactly one invalid-output repair and charges both calls', async () => {
  const invalid = { arguments: { schemaVersion: 1, recommendation: 'pass', confidence: 0.95, scores: {}, defects: [] }, provider: 'p', model: 'm', elapsedMs: 1 }
  const valid = { arguments: { schemaVersion: 1, recommendation: 'pass', confidence: 0.95, scores: { identity: 96, silhouette: 94, smallScale: 90, completeness: 98, style: 92, overall: 94 }, defects: [] }, provider: 'p', model: 'm', elapsedMs: 1 }
  const h = createHarness({ completions: [invalid, valid] })
  const boardPath = path.join(h.dataDir, 'board.png')
  await sharp({ create: { width: 8, height: 8, channels: 4, background: '#fff' } }).png().toFile(boardPath)
  const result = await h.service.evaluateSprite({
    runId: 'run-repair-evaluation',
    scope: 'canonical',
    board: { path: boardPath, sha256: 'a'.repeat(64), regions: [{ regionId: 'source' }, { regionId: 'candidate-1' }] },
    qa: { ok: true, failures: [], metrics: {} },
    profile: getQualityFirstQualityProfile(),
    budgetLedger: createBudgetLedger({ startedAtMs: Date.now() })
  })
  assert.equal(h.calls.length, 2)
  assert.equal(result.budgetLedger.usage.evaluatorCalls, 2)
  assert.match(h.calls[1].messages[0].content, /previous evaluation was invalid/i)
})

test('sprite evaluation repairs a provider response that omits the required tool call', async () => {
  const valid = { arguments: { schemaVersion: 1, recommendation: 'pass', confidence: 0.95, scores: { identity: 96, silhouette: 94, smallScale: 90, completeness: 98, style: 92, overall: 94 }, defects: [] }, provider: 'p', model: 'm', elapsedMs: 1 }
  const h = createHarness({ completions: [new Error('AI provider did not return required tool call: hatch_pet_sprite_evaluation'), valid] })
  const boardPath = path.join(h.dataDir, 'board.png')
  await sharp({ create: { width: 8, height: 8, channels: 4, background: '#fff' } }).png().toFile(boardPath)
  const result = await h.service.evaluateSprite({
    runId: 'run-missing-tool',
    scope: 'canonical',
    board: { path: boardPath, sha256: 'a'.repeat(64), regions: [{ regionId: 'source' }, { regionId: 'candidate-1' }] },
    qa: { ok: true, failures: [], metrics: {} },
    profile: getQualityFirstQualityProfile(),
    budgetLedger: createBudgetLedger({ startedAtMs: Date.now() })
  })
  assert.equal(result.gate.outcome, 'pass')
  assert.equal(h.calls.length, 2)
})

const validSpritePlanProposal = () => ({
  schemaVersion: 1,
  assetClass: 'grounded-compact-character',
  actions: [
    { actionId: 'idle', motionPresetId: 'idle-subtle-loop-v1', motionParameters: { intensity: 'subtle', leadSide: 'viewer-left' } },
    { actionId: 'running-right', motionPresetId: 'running-right-gait-v1', motionParameters: { intensity: 'normal', leadSide: 'viewer-left' } }
  ]
})

test('sprite planning returns only registered morphology, presets, and bounded enums', async () => {
  const h = createHarness({ completions: [{ arguments: validSpritePlanProposal(), provider: 'p', model: 'm', elapsedMs: 1 }] })
  const result = await h.service.planSprite({
    runId: 'run-plan',
    userIntent: 'keep the source identity and make a compact pet',
    budgetLedger: createBudgetLedger({ startedAtMs: Date.now() })
  })
  assert.equal(result.proposal.assetClass, 'grounded-compact-character')
  assert.deepEqual(result.proposal.actions.map((action) => action.actionId), ['idle', 'running-right'])
  assert.equal(result.budgetLedger.usage.plannerCalls, 1)
  const serialized = JSON.stringify(h.calls[0])
  assert.equal(serialized.includes('framePoses'), false)
  assert.equal(serialized.includes('threshold'), false)
})

test('sprite planning repairs one invalid proposal and rejects free-form or mismatched preset fields', async () => {
  const invalid = { ...validSpritePlanProposal(), actions: [{ actionId: 'idle', motionPresetId: 'running-right-gait-v1', motionParameters: { intensity: 'normal', leadSide: 'viewer-left' }, framePoses: ['bad'] }] }
  const h = createHarness({ completions: [
    { arguments: invalid, provider: 'p', model: 'm', elapsedMs: 1 },
    { arguments: validSpritePlanProposal(), provider: 'p', model: 'm', elapsedMs: 1 }
  ] })
  const result = await h.service.planSprite({ runId: 'run-plan-repair', userIntent: 'pet', budgetLedger: createBudgetLedger({ startedAtMs: Date.now() }) })
  assert.equal(h.calls.length, 2)
  assert.equal(result.budgetLedger.usage.plannerCalls, 2)
  assert.match(h.calls[1].messages[0].content, /previous sprite plan was invalid/i)
})

test('sprite planning persists host-owned budget usage across separate bridge calls', async () => {
  const completion = () => ({ arguments: validSpritePlanProposal(), provider: 'p', model: 'm', elapsedMs: 1 })
  const h = createHarness({ completions: [completion(), completion()] })
  const first = await h.service.planSprite({ runId: 'run-persisted-budget', userIntent: 'pet' })
  const second = await h.service.planSprite({ runId: 'run-persisted-budget', userIntent: 'pet' })
  assert.equal(first.budgetLedger.usage.plannerCalls, 1)
  assert.equal(second.budgetLedger.usage.plannerCalls, 2)
  const stored = JSON.parse(fs.readFileSync(path.join(h.dataDir, 'runs/run-persisted-budget/budgets/ledger.json'), 'utf8'))
  assert.equal(stored.usage.plannerCalls, 2)
})
