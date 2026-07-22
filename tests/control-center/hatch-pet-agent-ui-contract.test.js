const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (relative) => fs.readFileSync(path.resolve(__dirname, '../../', relative), 'utf8')

test('control center preload exposes exactly six hatch-pet methods through IPC', () => {
  const source = read('control-center-preload.js')
  for (const method of ['getHatchPetAgentConfig', 'saveHatchPetAgentConfig', 'saveHatchPetAgentApiKey', 'clearHatchPetAgentApiKey', 'checkHatchPetAgentCapability', 'getHatchPetAgentRunStatus']) {
    assert.match(source, new RegExp(`${method}:`))
  }
  assert.equal((source.match(/HATCH_PET_AGENT_[A-Z_]+:/g) || []).length, 6)
})

test('AiPane presents quality-first Hatch-pet readiness, budgets, identity checkpoint, and secret reference without secret values', () => {
  const source = read('src/control-center/src/panes/AiPane.tsx')
  assert.match(source, /质量优先角色生成会在创建 run 前检查此模型的结构化工具能力/)
  assert.match(source, /关闭或未就绪时不会启动角色生成/)
  assert.match(source, /人工审批、导入和激活仍由用户明确执行/)
  assert.match(source, /value="Shadow"/)
  assert.match(source, /maxIdentityRegenerations/)
  assert.match(source, /maxActionAttemptsPerAction/)
  assert.match(source, /maxEvaluationAttemptsPerArtifact/)
  assert.match(source, /maxProviderCalls/)
  assert.match(source, /maxElapsedMs/)
  assert.match(source, /maxEstimatedCost/)
  assert.match(source, /requireIdentityReviewBeforeActions/)
  assert.match(source, /apiKeyRef/)
})

test('useAiPane preserves known follow-chat to dedicated unsaved-key Minor as characterized evidence', () => {
  const source = read('src/control-center/src/hooks/useAiPane.ts')
  assert.match(source, /activeHatchPetAgentConfig\.configMode === 'override' && activeHatchPetAgentConfig\.hasApiKey/)
  assert.match(source, /\? \{ hasApiKey:/)
})
