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

const createHarness = ({ enabled = true, configMode = 'follow-chat', requireIdentityReviewBeforeActions = false, completions = [], secret = 'sk-host-owned', dataDir: suppliedDataDir = '', budgets = {} } = {}) => {
  let settings = { ai: { provider: 'openai-compatible', baseUrl: 'https://chat.test/v1', model: 'chat-model', apiKeyRef: 'ai.default', conversations: { untouched: [{ role: 'user', content: 'keep' }] }, memory: { enabled: true }, behavior: { enabled: true }, hatchPet: { enabled, configMode, provider: 'openai-compatible', baseUrl: 'https://dedicated.test/v1', model: 'planner', apiKeyRef: 'wrong-ref', requireIdentityReviewBeforeActions, budgets } } }
  const calls = []
  const logs = []
  const dataDir = suppliedDataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-hatch-service-'))
  const queue = [...completions]
  let secretReads = 0
  const service = createHatchPetAgentService({
    aiService: { completeStructuredTool: async (request) => { calls.push(request); const next = queue.shift(); if (next instanceof Error) throw next; return next } },
    settingsService: { get: () => settings, update: (updater) => { settings = updater(settings); return settings } },
    secretService: { getSecretValue: () => { secretReads += 1; return secret }, setSecret: () => {}, deleteSecret: () => {} },
    pluginService: { getPluginCreatorDataDir: () => dataDir },
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'decision-1', now: () => '2026-07-15T00:00:00.000Z'
  })
  return { service, calls, logs, dataDir, getSettings: () => settings, getSecretReads: () => secretReads }
}

test('disabled hatch-pet performs no model work and creates no run artifacts', async () => {
  const h = createHarness({ enabled: false })
  const result = await h.service.createShadowDecision({ runId: 'run-disabled', mode: 'full-pet', stage: 'planning' })
  assert.equal(result.status, 'disabled')
  assert.equal(h.calls.length, 0)
  assert.equal(fs.existsSync(path.join(h.dataDir, 'runs')), false)
})

test('generation readiness rejects a disabled hatch-pet agent without model work', async () => {
  const h = createHarness({ enabled: false })

  assert.deepEqual(h.service.getGenerationReadiness(), {
    ok: false,
    code: 'hatch_pet_disabled',
    message: 'Hatch-pet Agent 未启用',
    enabled: false,
    configSource: 'chat-fallback',
    provider: 'openai-compatible',
    model: 'chat-model'
  })
  assert.deepEqual(await h.service.checkGenerationCapability(), h.service.getGenerationReadiness())
  assert.equal(h.calls.length, 0)
  assert.equal(h.getSecretReads(), 0)
})

test('generation readiness rejects a missing effective hatch-pet key', async () => {
  const h = createHarness({ secret: '' })
  const readiness = h.service.getGenerationReadiness()

  assert.equal(readiness.ok, false)
  assert.equal(readiness.code, 'hatch_pet_api_key_missing')
  assert.equal(readiness.enabled, true)
  assert.equal(readiness.configSource, 'chat-fallback')
  assert.equal(readiness.provider, 'openai-compatible')
  assert.equal(readiness.model, 'chat-model')
  assert.equal(h.calls.length, 0)
})

test('generation capability probes the configured follow-chat model only after static readiness passes', async () => {
  const h = createHarness({
    completions: [{
      arguments: { schemaVersion: 1, supported: true },
      provider: 'openai-compatible',
      model: 'chat-model',
      elapsedMs: 4
    }]
  })

  const readiness = h.service.getGenerationReadiness()
  assert.equal(readiness.ok, true)
  assert.equal(readiness.code, 'hatch_pet_ready')

  const capability = await h.service.checkGenerationCapability()
  assert.equal(capability.ok, true)
  assert.equal(capability.code, 'ok')
  assert.equal(capability.provider, 'openai-compatible')
  assert.equal(capability.model, 'chat-model')
  assert.equal(h.calls.length, 1)
})

test('generation capability retries one same-model timeout before succeeding', async () => {
  const timeout = Object.assign(new Error('AI provider request timed out'), { name: 'TimeoutError' })
  const h = createHarness({
    completions: [timeout, {
      arguments: { schemaVersion: 1, supported: true },
      provider: 'openai-compatible',
      model: 'chat-model',
      elapsedMs: 4
    }]
  })

  const capability = await h.service.checkGenerationCapability()

  assert.equal(capability.ok, true)
  assert.equal(h.calls.length, 2)
  assert.equal(h.calls[0].timeoutMs, 60000)
  assert.deepEqual(h.calls[1], h.calls[0])
  assert.equal(h.logs.some((entry) => entry.event === 'hatch-pet.capability.retrying' && entry.details?.attempt === 1), true)
})

test('generation capability does not retry a non-transient provider 4xx even when its message resembles a timeout', async () => {
  const badRequest = Object.assign(new Error('Invalid request timed out upstream'), { providerStatus: 400, providerCode: 'invalid_request' })
  const h = createHarness({
    completions: [badRequest, {
      arguments: { schemaVersion: 1, supported: true },
      provider: 'openai-compatible',
      model: 'chat-model',
      elapsedMs: 4
    }]
  })

  const capability = await h.service.checkGenerationCapability()

  assert.equal(capability.ok, false)
  assert.equal(capability.code, 'capability_check_failed')
  assert.equal(h.calls.length, 1)
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
  assert.equal(h.calls[0].timeoutMs, 120000)
  assert.equal(JSON.stringify(h.calls[0]).includes(boardPath), false)
  assert.equal(fs.existsSync(path.join(h.dataDir, result.evidenceRelativePath)), true)
})

test('sprite evaluation retries one same-model timeout and preserves the request contract', async () => {
  const timeout = Object.assign(new Error('AI provider request timed out'), { name: 'TimeoutError' })
  const valid = {
    arguments: { schemaVersion: 1, recommendation: 'pass', confidence: 0.95, scores: { identity: 96, silhouette: 94, smallScale: 90, completeness: 98, style: 92, overall: 94 }, defects: [] },
    provider: 'openai-compatible',
    model: 'chat-model',
    elapsedMs: 10
  }
  const h = createHarness({ completions: [timeout, valid] })
  const boardPath = path.join(h.dataDir, 'board.png')
  await sharp({ create: { width: 8, height: 8, channels: 4, background: '#fff' } }).png().toFile(boardPath)

  const result = await h.service.evaluateSprite({
    runId: 'run-timeout-retry-evaluation',
    scope: 'canonical',
    board: { path: boardPath, sha256: 'a'.repeat(64), regions: [{ regionId: 'source' }, { regionId: 'candidate-1' }] },
    qa: { ok: true, failures: [], metrics: {} },
    profile: getQualityFirstQualityProfile(),
    budgetLedger: createBudgetLedger({ startedAtMs: Date.now() })
  })

  assert.equal(result.gate.outcome, 'pass')
  assert.equal(h.calls.length, 2)
  assert.equal(result.budgetLedger.usage.evaluatorCalls, 2)
  assert.deepEqual(h.calls[1], h.calls[0])
  assert.equal(h.logs.some((entry) => entry.event === 'hatch-pet.evaluation.retrying' && entry.details?.runId === 'run-timeout-retry-evaluation'), true)
})

test('sprite evaluation respects a one-attempt artifact budget for transient failures', async () => {
  const timeout = Object.assign(new Error('AI provider request timed out'), { name: 'TimeoutError' })
  const h = createHarness({
    budgets: { maxEvaluationAttemptsPerArtifact: 1 },
    completions: [timeout, {
      arguments: { schemaVersion: 1, recommendation: 'pass', confidence: 0.95, scores: { identity: 96, silhouette: 94, smallScale: 90, completeness: 98, style: 92, overall: 94 }, defects: [] },
      provider: 'openai-compatible',
      model: 'chat-model',
      elapsedMs: 10
    }]
  })
  const boardPath = path.join(h.dataDir, 'board.png')
  await sharp({ create: { width: 8, height: 8, channels: 4, background: '#fff' } }).png().toFile(boardPath)

  await assert.rejects(
    h.service.evaluateSprite({
      runId: 'run-one-attempt-evaluation',
      scope: 'canonical',
      board: { path: boardPath, sha256: 'a'.repeat(64), regions: [{ regionId: 'source' }, { regionId: 'candidate-1' }] },
      qa: { ok: true, failures: [], metrics: {} },
      profile: getQualityFirstQualityProfile(),
      budgetLedger: createBudgetLedger({ startedAtMs: Date.now() })
    }),
    (error) => error?.name === 'TimeoutError'
  )
  assert.equal(h.calls.length, 1)
})

test('sprite evaluation retries one transient provider 524 response', async () => {
  const unavailable = Object.assign(new Error('AI provider is temporarily unavailable'), { providerStatus: 524 })
  const valid = {
    arguments: { schemaVersion: 1, recommendation: 'pass', confidence: 0.95, scores: { identity: 96, silhouette: 94, smallScale: 90, completeness: 98, style: 92, overall: 94 }, defects: [] },
    provider: 'openai-compatible',
    model: 'chat-model',
    elapsedMs: 10
  }
  const h = createHarness({ completions: [unavailable, valid] })
  const boardPath = path.join(h.dataDir, 'board.png')
  await sharp({ create: { width: 8, height: 8, channels: 4, background: '#fff' } }).png().toFile(boardPath)

  const result = await h.service.evaluateSprite({
    runId: 'run-524-retry-evaluation',
    scope: 'canonical',
    board: { path: boardPath, sha256: 'a'.repeat(64), regions: [{ regionId: 'source' }, { regionId: 'candidate-1' }] },
    qa: { ok: true, failures: [], metrics: {} },
    profile: getQualityFirstQualityProfile(),
    budgetLedger: createBudgetLedger({ startedAtMs: Date.now() })
  })

  assert.equal(result.gate.outcome, 'pass')
  assert.equal(h.calls.length, 2)
  assert.deepEqual(h.calls[1], h.calls[0])
})

test('sprite evaluation permits only one transient retry even when the artifact budget allows three calls', async () => {
  const firstTimeout = Object.assign(new Error('AI provider request timed out'), { name: 'TimeoutError' })
  const secondTimeout = Object.assign(new Error('AI provider request timed out'), { name: 'TimeoutError' })
  const valid = {
    arguments: { schemaVersion: 1, recommendation: 'pass', confidence: 0.95, scores: { identity: 96, silhouette: 94, smallScale: 90, completeness: 98, style: 92, overall: 94 }, defects: [] },
    provider: 'openai-compatible',
    model: 'chat-model',
    elapsedMs: 10
  }
  const h = createHarness({ budgets: { maxEvaluationAttemptsPerArtifact: 3 }, completions: [firstTimeout, secondTimeout, valid] })
  const boardPath = path.join(h.dataDir, 'board.png')
  await sharp({ create: { width: 8, height: 8, channels: 4, background: '#fff' } }).png().toFile(boardPath)

  await assert.rejects(
    h.service.evaluateSprite({
      runId: 'run-one-transient-retry-only',
      scope: 'canonical',
      board: { path: boardPath, sha256: 'a'.repeat(64), regions: [{ regionId: 'source' }, { regionId: 'candidate-1' }] },
      qa: { ok: true, failures: [], metrics: {} },
      profile: getQualityFirstQualityProfile(),
      budgetLedger: createBudgetLedger({ startedAtMs: Date.now() })
    }),
    (error) => error?.name === 'TimeoutError'
  )
  assert.equal(h.calls.length, 2)
})

test('sprite evaluation does not retry a non-transient provider 4xx even when its message resembles a timeout', async () => {
  const badRequest = Object.assign(new Error('Invalid request timed out upstream'), { providerStatus: 400, providerCode: 'invalid_request' })
  const h = createHarness({ completions: [badRequest] })
  const boardPath = path.join(h.dataDir, 'board.png')
  await sharp({ create: { width: 8, height: 8, channels: 4, background: '#fff' } }).png().toFile(boardPath)

  await assert.rejects(
    h.service.evaluateSprite({
      runId: 'run-4xx-evaluation',
      scope: 'canonical',
      board: { path: boardPath, sha256: 'a'.repeat(64), regions: [{ regionId: 'source' }, { regionId: 'candidate-1' }] },
      qa: { ok: true, failures: [], metrics: {} },
      profile: getQualityFirstQualityProfile(),
      budgetLedger: createBudgetLedger({ startedAtMs: Date.now() })
    }),
    (error) => error?.providerStatus === 400
  )
  assert.equal(h.calls.length, 1)
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

test('sprite evaluation still stops after a second invalid output when the artifact budget allows three calls', async () => {
  const invalid = { arguments: { schemaVersion: 1, recommendation: 'pass', confidence: 0.95, scores: {}, defects: [] }, provider: 'p', model: 'm', elapsedMs: 1 }
  const valid = { arguments: { schemaVersion: 1, recommendation: 'pass', confidence: 0.95, scores: { identity: 96, silhouette: 94, smallScale: 90, completeness: 98, style: 92, overall: 94 }, defects: [] }, provider: 'p', model: 'm', elapsedMs: 1 }
  const h = createHarness({ budgets: { maxEvaluationAttemptsPerArtifact: 3 }, completions: [invalid, invalid, valid] })
  const boardPath = path.join(h.dataDir, 'board.png')
  await sharp({ create: { width: 8, height: 8, channels: 4, background: '#fff' } }).png().toFile(boardPath)

  await assert.rejects(
    h.service.evaluateSprite({
      runId: 'run-invalid-twice-three-call-budget',
      scope: 'canonical',
      board: { path: boardPath, sha256: 'a'.repeat(64), regions: [{ regionId: 'source' }, { regionId: 'candidate-1' }] },
      qa: { ok: true, failures: [], metrics: {} },
      profile: getQualityFirstQualityProfile(),
      budgetLedger: createBudgetLedger({ startedAtMs: Date.now() })
    }),
    /Invalid sprite evaluation/
  )
  assert.equal(h.calls.length, 2)
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
  actions: Object.entries({
    idle: 'idle-subtle-loop-v1',
    'running-right': 'running-right-gait-v1',
    waving: 'waving-four-phase-v1',
    jumping: 'jumping-five-phase-v1',
    failed: 'failed-eight-phase-v1',
    waiting: 'waiting-six-phase-v1',
    running: 'working-six-phase-v1',
    review: 'review-six-phase-v1'
  }).map(([actionId, motionPresetId]) => ({
    actionId,
    motionPresetId,
    motionParameters: { intensity: actionId === 'idle' ? 'subtle' : 'normal', leadSide: 'viewer-left' }
  }))
})

test('sprite planning returns only registered morphology, presets, and bounded enums', async () => {
  const h = createHarness({ completions: [{ arguments: validSpritePlanProposal(), provider: 'p', model: 'm', elapsedMs: 1 }] })
  const result = await h.service.planSprite({
    runId: 'run-plan',
    userIntent: 'keep the source identity and make a compact pet',
    budgetLedger: createBudgetLedger({ startedAtMs: Date.now() })
  })
  assert.equal(result.proposal.assetClass, 'grounded-compact-character')
  assert.deepEqual(result.proposal.actions.map((action) => action.actionId), ['idle', 'running-right', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'])
  assert.equal(result.requireIdentityReviewBeforeActions, false)
  assert.equal(result.budgetLedger.usage.plannerCalls, 1)
  const serialized = JSON.stringify(h.calls[0])
  assert.equal(serialized.includes('framePoses'), false)
  assert.equal(serialized.includes('threshold'), false)
})

test('sprite planning exposes an explicit identity-review pause to the Creator runtime', async () => {
  const h = createHarness({
    requireIdentityReviewBeforeActions: true,
    completions: [{ arguments: validSpritePlanProposal(), provider: 'p', model: 'm', elapsedMs: 1 }]
  })
  const result = await h.service.planSprite({ runId: 'run-plan-review', userIntent: 'pet' })
  assert.equal(result.requireIdentityReviewBeforeActions, true)
})

test('sprite planning rejects a partial official action plan', async () => {
  const partial = { ...validSpritePlanProposal(), actions: validSpritePlanProposal().actions.slice(0, 2) }
  const h = createHarness({ completions: [
    { arguments: partial, provider: 'p', model: 'm', elapsedMs: 1 },
    { arguments: partial, provider: 'p', model: 'm', elapsedMs: 1 }
  ] })
  await assert.rejects(() => h.service.planSprite({ runId: 'run-partial-plan', userIntent: 'full pet' }), /all registered official actions/i)
  assert.equal(h.calls.length, 2)
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

test('host-owned provider reservations persist every image HTTP attempt including failures', () => {
  const h = createHarness()
  const first = h.service.reserveProviderCall({ runId: 'run-provider-budget', timeoutMs: 480000 })
  const failed = h.service.recordProviderCall({
    runId: 'run-provider-budget',
    reservationId: first.reservationId,
    budgetLedger: first.budgetLedger,
    ok: false,
    code: 'http-524'
  })
  const second = h.service.reserveProviderCall({ runId: 'run-provider-budget', timeoutMs: 352000 })
  const succeeded = h.service.recordProviderCall({
    runId: 'run-provider-budget',
    reservationId: second.reservationId,
    budgetLedger: second.budgetLedger,
    ok: true,
    code: 'ok',
    estimatedCost: 0.08
  })

  assert.equal(failed.budgetLedger.usage.providerCalls, 1)
  assert.equal(failed.budgetLedger.usage.providerFailures, 1)
  assert.equal(succeeded.budgetLedger.usage.providerCalls, 2)
  assert.equal(succeeded.budgetLedger.usage.providerFailures, 1)
  assert.equal(succeeded.budgetLedger.usage.estimatedCost, 0.08)
  const stored = JSON.parse(fs.readFileSync(path.join(h.dataDir, 'runs/run-provider-budget/budgets/ledger.json'), 'utf8'))
  assert.equal(stored.usage.providerCalls, 2)
  assert.deepEqual(stored.reservations, {})
})

test('restarting the hatch-pet service reconciles an abandoned provider reservation as a failed attempt', () => {
  const first = createHarness()
  const reservation = first.service.reserveProviderCall({ runId: 'run-restart-ledger', timeoutMs: 480000 })
  assert.equal(reservation.reservationId, 'provider-1')

  const restarted = createHarness({ dataDir: first.dataDir })
  const next = restarted.service.reserveProviderCall({ runId: 'run-restart-ledger', timeoutMs: 480000 })
  assert.equal(next.reservationId, 'provider-2')
  assert.equal(next.budgetLedger.usage.providerCalls, 1)
  assert.equal(next.budgetLedger.usage.providerFailures, 1)
  assert.equal(next.budgetLedger.usage.costKnown, false)
  const stored = JSON.parse(fs.readFileSync(path.join(first.dataDir, 'runs/run-restart-ledger/budgets/ledger.json'), 'utf8'))
  assert.equal(stored.usage.providerCalls, 1)
  assert.equal(stored.usage.providerFailures, 1)
  assert.deepEqual(stored.reservations, { 'provider-2': stored.reservations['provider-2'] })
})

test('live provider reservations in the same service instance are not reconciled as abandoned', () => {
  const h = createHarness()
  const first = h.service.reserveProviderCall({ runId: 'run-live-reservations', timeoutMs: 480000 })
  const second = h.service.reserveProviderCall({ runId: 'run-live-reservations', timeoutMs: 480000 })
  assert.equal(first.reservationId, 'provider-1')
  assert.equal(second.reservationId, 'provider-2')
  assert.equal(second.budgetLedger.usage.providerCalls, 0)
  assert.equal(second.budgetLedger.usage.providerFailures, 0)
  assert.deepEqual(Object.keys(second.budgetLedger.reservations), ['provider-1', 'provider-2'])
})

test('planner repair accounting preserves provider entries recorded during the failed attempt', async () => {
  let releaseFirstPlannerCall = () => {}
  const firstPlannerCall = new Promise((resolve) => { releaseFirstPlannerCall = resolve })
  const h = createHarness()
  const dataDir = h.dataDir
  const invalidProposal = { ...validSpritePlanProposal(), actions: [{ actionId: 'idle', motionPresetId: 'running-right-gait-v1', motionParameters: { intensity: 'normal', leadSide: 'viewer-left' }, framePoses: ['bad'] }] }
  let plannerCallCount = 0
  const service = createHatchPetAgentService({
    aiService: {
      // 第一次 planner 调用挂起，期间 Provider 预约与结算落盘；随后返回无效提案触发修复重试。
      completeStructuredTool: async () => {
        plannerCallCount += 1
        if (plannerCallCount === 1) {
          await firstPlannerCall
          return { arguments: invalidProposal, provider: 'p', model: 'm', elapsedMs: 1 }
        }
        return { arguments: validSpritePlanProposal(), provider: 'p', model: 'm', elapsedMs: 1 }
      }
    },
    settingsService: { get: () => h.getSettings(), update: (updater) => updater(h.getSettings()) },
    secretService: { getSecretValue: () => 'sk-host-owned', setSecret: () => {}, deleteSecret: () => {} },
    pluginService: { getPluginCreatorDataDir: () => dataDir },
    appLogService: { record: () => {} },
    idFactory: () => 'decision-1',
    now: () => '2026-07-15T00:00:00.000Z'
  })

  const planning = service.planSprite({ runId: 'run-interleaved', userIntent: 'pet' })
  await Promise.resolve()
  const reservation = service.reserveProviderCall({ runId: 'run-interleaved', timeoutMs: 480000 })
  service.recordProviderCall({
    runId: 'run-interleaved',
    reservationId: reservation.reservationId,
    budgetLedger: reservation.budgetLedger,
    ok: true,
    code: 'ok',
    estimatedCost: 0.05
  })
  releaseFirstPlannerCall()
  const planned = await planning

  // 旧实现下修复重试会用第一次 await 之前的快照记账，把 Provider 结算写没。
  assert.equal(plannerCallCount, 2)
  assert.equal(planned.budgetLedger.usage.plannerCalls, 2)
  assert.equal(planned.budgetLedger.usage.providerCalls, 1)
  const stored = JSON.parse(fs.readFileSync(path.join(dataDir, 'runs/run-interleaved/budgets/ledger.json'), 'utf8'))
  assert.equal(stored.usage.plannerCalls, 2)
  assert.equal(stored.usage.providerCalls, 1)
  assert.equal(stored.usage.estimatedCost, 0.05)
  assert.deepEqual(stored.reservations, {})
})

test('shadow planning charges the planner budget for every model call including repairs', async () => {
  const h = createHarness({
    budgets: { maxPlannerCalls: 3 },
    completions: [
      { arguments: { ...validDecision(), unknown: true }, provider: 'p', model: 'm', elapsedMs: 1 },
      { arguments: validDecision(), provider: 'p', model: 'm', elapsedMs: 1 }
    ]
  })

  const result = await h.service.createShadowDecision({ runId: 'run-shadow-budget', mode: 'full-pet', stage: 'planning' })

  assert.equal(result.status, 'shadow-recorded')
  assert.equal(h.calls.length, 2)
  // 影子调用必须记账，否则影子模式可以无限绕过 planner 上限。
  const stored = JSON.parse(fs.readFileSync(path.join(h.dataDir, 'runs/run-shadow-budget/budgets/ledger.json'), 'utf8'))
  assert.equal(stored.usage.plannerCalls, 2)
})

test('shadow planning refuses model work once the planner budget is exhausted', async () => {
  const h = createHarness({
    budgets: { maxPlannerCalls: 1 },
    completions: [
      { arguments: validDecision(), provider: 'p', model: 'm', elapsedMs: 1 },
      { arguments: validDecision(), provider: 'p', model: 'm', elapsedMs: 1 }
    ]
  })

  const first = await h.service.createShadowDecision({ runId: 'run-shadow-exhausted', mode: 'full-pet', stage: 'planning' })
  assert.equal(first.status, 'shadow-recorded')

  const second = await h.service.createShadowDecision({ runId: 'run-shadow-exhausted', mode: 'full-pet', stage: 'planning' })

  assert.equal(second.status, 'shadow-failed')
  assert.equal(h.calls.length, 1)
  const status = h.service.getRunStatus('run-shadow-exhausted')
  assert.equal(status.state.failureCode, 'hatch_pet_planner_call_budget_exhausted')
})
