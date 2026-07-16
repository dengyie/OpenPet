const test = require('node:test')
const assert = require('node:assert/strict')

const {
  DEFAULT_HATCH_PET_AGENT_CONFIG,
  normalizeHatchPetAgentConfig,
  resolveHatchPetCompletionConfig,
  createHatchPetAgentPublicConfig,
  validateHatchPetDecision
} = require('../../src/main/services/hatch-pet-agent-contracts')

test('hatch-pet contracts default disabled and fixed shadow while clamping budgets', () => {
  assert.equal(DEFAULT_HATCH_PET_AGENT_CONFIG.enabled, false)
  assert.equal(DEFAULT_HATCH_PET_AGENT_CONFIG.executionMode, 'shadow')
  const value = normalizeHatchPetAgentConfig({ enabled: true, executionMode: 'execute', apiKeyRef: 'attacker', budgets: { maxIdentityRegenerations: 99, maxActionAttemptsPerAction: 0, maxEvaluationAttemptsPerArtifact: 9, maxProviderCalls: 999, maxElapsedMs: 1, maxEstimatedCost: -2 } })
  assert.equal(value.executionMode, 'shadow')
  assert.deepEqual(value.budgets, { maxIdentityRegenerations: 3, maxActionAttemptsPerAction: 1, maxEvaluationAttemptsPerArtifact: 3, maxProviderCalls: 200, maxElapsedMs: 60000, maxEstimatedCost: 0.01 })
})

test('hatch-pet resolution separates follow-chat from dedicated and public URLs remove credentials query and fragment', () => {
  const follow = resolveHatchPetCompletionConfig({ aiConfig: { provider: 'chat', baseUrl: 'https://u:p@chat.test/v1?q=x#f', model: 'chat-model', apiKeyRef: 'ai.default' }, hatchPetConfig: { configMode: 'follow-chat' } })
  assert.equal(follow.apiKeyRef, 'ai.default')
  assert.equal(follow.source, 'chat-fallback')
  const dedicated = resolveHatchPetCompletionConfig({ hatchPetConfig: { configMode: 'override', provider: 'dedicated', baseUrl: 'https://u:p@dedicated.test/v1?q=x#f', model: 'planner', apiKeyRef: 'ai.hatch-pet' } })
  assert.equal(dedicated.apiKeyRef, 'ai.hatch-pet')
  assert.equal(createHatchPetAgentPublicConfig(dedicated, true).baseUrl, 'https://dedicated.test/v1')
})

test('hatch-pet decisions reject unknown and illegal fields and clamp confidence', () => {
  const base = { schemaVersion: 1, decision: 'generate-action', scope: { actionId: 'wave' }, reasonCodes: ['ready'], confidence: 7 }
  assert.equal(validateHatchPetDecision(base, { legalDecisions: ['generate-action'] }).confidence, 1)
  assert.throws(() => validateHatchPetDecision({ ...base, secret: 'x' }, { legalDecisions: ['generate-action'] }), /unknown field/)
  assert.throws(() => validateHatchPetDecision({ ...base, decision: 'accept-stage' }, { legalDecisions: ['generate-action'] }), /illegal/)
  assert.throws(() => validateHatchPetDecision({ ...base, scope: { actionId: '../wave' } }, { legalDecisions: ['generate-action'] }), /invalid/)
})
