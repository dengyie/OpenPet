const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { isGrokVideoModel } = require('../../examples/plugins/creator-studio/lib/video-provider-capabilities.js')

const read = (relative) => fs.readFileSync(path.resolve(__dirname, '../../', relative), 'utf8')

test('control center preload retains two Creator methods and retires hatch configuration IPC', () => {
  const source = read('apps/desktop/control-center-preload.js')
  for (const method of ['checkHatchPetAgentCapability', 'getHatchPetAgentRunStatus']) {
    assert.match(source, new RegExp(`${method}:`))
  }
  for (const method of ['getHatchPetAgentConfig', 'saveHatchPetAgentConfig', 'saveHatchPetAgentApiKey', 'clearHatchPetAgentApiKey']) {
    assert.doesNotMatch(source, new RegExp(`${method}:`))
    assert.match(read('apps/control-center/src/features/ai/api.ts'), new RegExp(`${method}:`))
  }
  assert.equal((source.match(/HATCH_PET_AGENT_[A-Z_]+:/g) || []).length, 2)
})

test('AiPane presents quality-first Hatch-pet readiness, budgets, identity checkpoint, and secret reference without secret values', () => {
  const source = read('apps/control-center/src/panes/AiPane.tsx')
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

test('AiPane video recommendations follow the live Mango catalog without dropping adapter compatibility', () => {
  const pane = read('apps/control-center/src/panes/AiPane.tsx')
  const demo = read('apps/control-center/src/api/demo-control-center-api.ts')
  for (const model of ['grok-imagine-video', 'grok-imagine-video-1.5']) {
    assert.match(pane, new RegExp(`'${model}'`))
    assert.match(demo, new RegExp(`'${model}'`))
  }
  assert.doesNotMatch(pane, /grok-imagine-video-1\.5-preview/)
  assert.doesNotMatch(demo, /grok-imagine-video-1\.5-preview/)
  assert.equal(isGrokVideoModel('grok-imagine-video-1.5-preview'), true)
})

test('useAiPane preserves known follow-chat to dedicated unsaved-key Minor as characterized evidence', () => {
  const source = read('apps/control-center/src/hooks/useAiPane.ts')
  assert.match(source, /activeHatchPetAgentConfig\.configMode === 'override' && activeHatchPetAgentConfig\.hasApiKey/)
  assert.match(source, /\? \{ hasApiKey:/)
})
