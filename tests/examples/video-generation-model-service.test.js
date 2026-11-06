const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const { createVideoGenerationModelService } = require('../../apps/desktop/src/services/video-generation-model-service')

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  async json() { return payload },
  async arrayBuffer() { return Buffer.from(JSON.stringify(payload)) }
})

const videoResponse = (bytes) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'video/mp4' },
  async arrayBuffer() { return bytes }
})

test('video generation defaults to the live-tested Grok 1.5 model', () => {
  const service = createVideoGenerationModelService({
    settingsService: { get: () => ({}) },
    secretService: { getSecretValue: () => '' }
  })

  assert.equal(service.getConfig().model, 'grok-imagine-video-1.5')
})

test('video generation model service keeps credentials in the secret boundary and writes a run-owned artifact', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openpet-video-service-'))
  const referencePath = path.join(root, 'canonical.png')
  await fs.writeFile(referencePath, Buffer.from('reference-bytes'))
  const settingsService = {
    get: () => ({ models: { videoGeneration: { provider: 'openai-compatible', baseUrl: 'https://api.mangoqwq.com/v1', model: 'grok-imagine-video', apiKeyRef: 'video-secret', timeoutMs: 10_000 } } })
  }
  const secretService = { getSecretValue: (ref) => ref === 'video-secret' ? 'runtime-video-key' : '' }
  const calls = []
  const service = createVideoGenerationModelService({
    settingsService,
    secretService,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      if (url.endsWith('/videos')) return jsonResponse({ id: 'task-service', status: 'completed' })
      if (url.endsWith('/videos/task-service/content')) return videoResponse(Buffer.from('service-video'))
      throw new Error(`unexpected URL ${url}`)
    }
  })

  const result = await service.generateVideo({
    model: 'grok-imagine-video',
    prompt: 'Animate the exact reference with a small wave.',
    referenceImages: [{ path: referencePath, relativePath: 'canonical.png', mimeType: 'image/png' }],
    output: { dataDir: root, dataRelativeDir: 'runs/run-1/video/raw', fileName: 'waving.mp4' },
    runId: 'run-1'
  })

  assert.equal(result.ok, true)
  assert.equal(result.result.outputs[0].dataRelativePath, 'runs/run-1/video/raw/waving.mp4')
  assert.equal(await fs.readFile(path.join(root, 'runs/run-1/video/raw/waving.mp4'), 'utf8'), 'service-video')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer runtime-video-key')
  assert.doesNotMatch(JSON.stringify(result), /runtime-video-key/)
})

test('video generation uses the saved model when caller omits model', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openpet-video-service-model-'))
  const referencePath = path.join(root, 'canonical.png')
  await fs.writeFile(referencePath, Buffer.from('reference-bytes'))
  const requests = []
  const service = createVideoGenerationModelService({
    settingsService: { get: () => ({ models: { videoGeneration: { baseUrl: 'https://api.mangoqwq.com/v1', model: 'grok-imagine-video-1.5', apiKeyRef: 'video-key' } } }) },
    secretService: { getSecretValue: () => 'runtime-key' },
    fetchImpl: async (url, init) => {
      requests.push({ url, init })
      if (url.endsWith('/videos')) return jsonResponse({ id: 'task-config-model', status: 'completed' })
      if (url.endsWith('/videos/task-config-model/content')) return videoResponse(Buffer.from('video'))
      throw new Error(`unexpected URL ${url}`)
    }
  })
  await service.generateVideo({
    prompt: 'Animate the exact reference.',
    referenceImages: [{ path: referencePath, relativePath: 'canonical.png', mimeType: 'image/png' }],
    output: { dataDir: root, dataRelativeDir: 'runs/model-config', fileName: 'action.mp4' }
  })
  assert.equal(JSON.parse(requests[0].init.body).model, 'grok-imagine-video-1.5')
})

test('video generation model service rejects multiple references before provider dispatch', async () => {
  const service = createVideoGenerationModelService({
    settingsService: { get: () => ({ models: { videoGeneration: { baseUrl: 'https://api.mangoqwq.com/v1', apiKeyRef: 'key' } } }) },
    secretService: { getSecretValue: () => 'key' },
    fetchImpl: async () => { throw new Error('provider must not be called') }
  })
  await assert.rejects(
    service.generateVideo({ model: 'grok-imagine-video', prompt: 'test', referenceImages: [{}, {}], output: { dataDir: '/tmp', dataRelativeDir: 'runs/test' } }),
    (error) => error.code === 'video_reference_contract_invalid'
  )
})

test('video service uses an independent config and persists only its own model catalog', async () => {
  const persisted = []
  const settingsService = {
    get: () => ({ models: {
      imageGeneration: { baseUrl: 'https://images.example.test/v1', model: 'gpt-image-2' },
      videoGeneration: { baseUrl: 'https://api.mangoqwq.com/v1', model: 'grok-imagine-video', apiKeyRef: 'video-key', timeoutMs: 300_000 }
    } }),
    saveVideo: (next) => { persisted.push(next); return next }
  }
  const service = createVideoGenerationModelService({
    settingsService,
    secretService: { getSecretValue: (ref) => ref === 'video-key' ? 'runtime-key' : '' },
    fetchImpl: async (url) => {
      if (url.endsWith('/models')) return jsonResponse({ data: [{ id: 'grok-imagine-video' }, { id: 'grok-imagine-video-1.5' }, { id: 'gpt-image-2' }] })
      throw new Error(`unexpected URL ${url}`)
    }
  })

  assert.equal(service.getConfig().baseUrl, 'https://api.mangoqwq.com/v1')
  assert.equal(service.getConfig().model, 'grok-imagine-video')
  await service.discoverModels()
  assert.equal(persisted.length, 1)
  assert.equal(persisted[0].model, 'grok-imagine-video')
  assert.deepEqual(persisted[0].modelCatalog.models, ['grok-imagine-video', 'grok-imagine-video-1.5'])
  assert.equal(persisted[0].baseUrl, 'https://api.mangoqwq.com/v1')
})

test('video failure diagnostics retain only the accepted task ID and code-owned phase', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openpet-video-diagnostics-'))
  await fs.writeFile(path.join(root, 'reference.png'), 'reference')
  const logs = []
  const service = createVideoGenerationModelService({
    settingsService: { get: () => ({}) }, secretService: { getSecretValue: () => 'runtime-secret-key' },
    appLogService: { record: entry => logs.push(entry) },
    fetchImpl: async () => jsonResponse({ id: 'video_retained-task', status: 'queued' })
  })
  await assert.rejects(service.generateVideo({ prompt: 'jump once', referenceImages: [{ relativePath: 'reference.png' }], output: { dataDir: root, dataRelativeDir: 'output' }, maxPolls: 1 }), error => error.retryable === false)
  const failed = logs.find(entry => entry.event === 'videoGeneration.request.failed')
  assert.equal(failed.details.taskId, 'video_retained-task')
  assert.equal(failed.details.stage, 'poll')
  assert.doesNotMatch(JSON.stringify(logs), /runtime-secret-key/)
})
