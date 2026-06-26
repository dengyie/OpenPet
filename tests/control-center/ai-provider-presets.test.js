const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { pathToFileURL } = require('node:url')

let aiProviderConfig

test.before(async () => {
  aiProviderConfig = await import(pathToFileURL(path.resolve(__dirname, '../../src/control-center/src/lib/ai-provider-config.ts')).href)
})

test('chat provider presets expose common OpenAI-compatible endpoints', () => {
  assert.deepEqual(
    aiProviderConfig.chatProviderPresets.map((preset) => ({
      id: preset.id,
      baseUrl: preset.baseUrl,
      model: preset.model
    })),
    [
      {
        id: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini'
      },
      {
        id: 'local-openai-compatible',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'qwen2.5:7b-instruct'
      }
    ]
  )
})

test('image provider compatibility hint explains transparent background support heuristics', () => {
  const gptImageHint = aiProviderConfig.getImageProviderCompatibilityHint({
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-image-2',
    hasApiKey: true
  })
  const customModelHint = aiProviderConfig.getImageProviderCompatibilityHint({
    provider: 'openai-compatible',
    baseUrl: 'https://image.example.test/v1',
    model: 'openpet-image-test',
    hasApiKey: false
  })

  assert.match(gptImageHint, /gpt-image-2/)
  assert.match(gptImageHint, /transparent/i)
  assert.match(customModelHint, /openpet-image-test/)
  assert.match(customModelHint, /transparent/i)
  assert.match(customModelHint, /兼容性取决于当前网关/i)
})

test('connection status copy maps optional chat models probe fallback into user-safe wording', async () => {
  const { formatConnectionTestStatus } = aiProviderConfig

  const text = formatConnectionTestStatus({
    ok: true,
    provider: 'openai-compatible',
    baseUrl: 'https://chat.example.test/v1',
    model: 'example-model',
    hasApiKey: true,
    elapsedMs: 15,
    code: 'provider_reachable_models_unavailable',
    message: 'AI provider is reachable, but the optional /models probe is unavailable'
  })

  assert.match(text, /连接测试通过/)
  assert.match(text, /chat\.example\.test/)
  assert.match(text, /example-model/)
})

test('provider config helpers format discovered model options for the AI pane', async () => {
  const { getDiscoveredModelOptions } = aiProviderConfig

  assert.deepEqual(
    getDiscoveredModelOptions({
      model: 'gpt-4o-mini',
      availableModels: ['gpt-4o-mini', 'gpt-4.1-mini', '', 'gpt-4.1-mini']
    }),
    [
      { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' }
    ]
  )
})
