const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const { createGrokVideoProvider } = require('../../examples/plugins/creator-studio/lib/grok-video-provider')

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  async json() { return payload },
  async arrayBuffer() { return Buffer.from(JSON.stringify(payload)) }
})

const binaryResponse = (bytes, contentType = 'video/mp4', status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : '' },
  async json() { return JSON.parse(Buffer.from(bytes).toString('utf8')) },
  async arrayBuffer() { return bytes }
})

test('Mango model discovery returns only the deployed Grok video models', async () => {
  const calls = []
  const provider = createGrokVideoProvider({
    baseUrl: 'https://api.mangoqwq.com/v1/',
    apiKey: 'runtime-only-key',
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({ data: [
        { id: 'grok-imagine-video' },
        { id: 'grok-imagine-video-1.5' },
        { id: 'grok-imagine-video-1.5-preview' },
        { id: 'grok-imagine-image-2.0' },
        { id: 'text-model' }
      ] })
    }
  })

  const result = await provider.discoverModels()
  assert.deepEqual(result.videoModels, [
    'grok-imagine-video',
    'grok-imagine-video-1.5',
    'grok-imagine-video-1.5-preview'
  ])
  assert.equal(calls[0].url, 'https://api.mangoqwq.com/v1/models')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer runtime-only-key')
  assert.equal(calls[0].init.headers['User-Agent'], 'OpenPet/1.0 (video-provider)')
})

test('Grok video provider submits, polls, downloads and hashes a video artifact', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openpet-grok-video-'))
  const outputDir = path.join(root, 'outputs')
  const videoBytes = Buffer.from('fake-mp4-content')
  const calls = []
  const progress = []
  const provider = createGrokVideoProvider({
    baseUrl: 'https://api.mangoqwq.com/v1',
    apiKey: 'runtime-only-key',
    pollIntervalMs: 1,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      if (url.endsWith('/videos')) return jsonResponse({ id: 'task-123', status: 'queued' })
      if (url.endsWith('/videos/task-123')) return jsonResponse({ id: 'task-123', status: 'completed' })
      if (url.endsWith('/videos/task-123/content')) return binaryResponse(videoBytes)
      throw new Error(`unexpected URL ${url}`)
    },
    sleepImpl: async () => {}
  })

  const result = await provider.generateVideo({
    model: 'grok-imagine-video-1.5',
    prompt: 'A small orange cat waves once on a locked camera.',
    referenceDataUrl: 'data:image/png;base64,AAAA',
    seconds: 2,
    size: '512x512',
    outputDir,
    outputFileName: 'waving.mp4',
    onProgress: (event) => progress.push(event)
  })

  assert.equal(result.taskId, 'task-123')
  assert.equal(result.relativePath, 'waving.mp4')
  assert.equal(result.mimeType, 'video/mp4')
  assert.equal(result.byteLength, videoBytes.length)
  assert.equal(await fs.readFile(path.join(outputDir, 'waving.mp4'), 'utf8'), 'fake-mp4-content')
  assert.equal(calls.length, 3)
  const submit = JSON.parse(calls[0].init.body)
  assert.equal(submit.model, 'grok-imagine-video-1.5')
  assert.deepEqual(submit.image, { url: 'data:image/png;base64,AAAA' })
  assert.equal(submit.duration, '2')
  assert.equal(submit.aspect_ratio, '1:1')
  assert.equal(submit.resolution, '720p')
  assert.equal(calls.every(({ init }) => init.headers['User-Agent'] === 'OpenPet/1.0 (video-provider)'), true)
  assert.deepEqual(progress.map((event) => event.status), ['queued', 'completed', 'downloaded'])
})

test('Grok video provider rejects failed jobs without exposing response details', async () => {
  const provider = createGrokVideoProvider({
    baseUrl: 'https://api.mangoqwq.com/v1',
    apiKey: 'runtime-only-secret',
    fetchImpl: async (url) => {
      if (url.endsWith('/videos')) return jsonResponse({ id: 'task-failed', status: 'failed', error: 'provider secret should not escape' })
      throw new Error('unexpected URL')
    }
  })

  await assert.rejects(
    provider.generateVideo({ model: 'grok-imagine-video', prompt: 'test', outputDir: '/tmp/openpet-grok-failure' }),
    (error) => {
      assert.equal(error.code, 'video_generation_failed')
      assert.doesNotMatch(error.message, /provider secret|runtime-only-secret/)
      return true
    }
  )
})

test('Grok video provider propagates cancellation before polling', async () => {
  const controller = new AbortController()
  let pollCalled = false
  const provider = createGrokVideoProvider({
    baseUrl: 'https://api.mangoqwq.com/v1',
    apiKey: 'runtime-only-key',
    fetchImpl: async (url) => {
      if (url.endsWith('/videos')) {
        controller.abort(new Error('cancelled by caller'))
        return jsonResponse({ id: 'task-cancel', status: 'queued' })
      }
      pollCalled = true
      return jsonResponse({ id: 'task-cancel', status: 'completed' })
    },
    sleepImpl: async () => {}
  })

  await assert.rejects(
    provider.generateVideo({ model: 'grok-imagine-video', prompt: 'test', outputDir: '/tmp/openpet-grok-cancel', signal: controller.signal }),
    (error) => error.message === 'cancelled by caller'
  )
  assert.equal(pollCalled, false)
})

test('Grok video provider rejects unsafe content redirects and oversized content', async () => {
  const provider = createGrokVideoProvider({
    baseUrl: 'https://api.mangoqwq.com/v1',
    apiKey: 'runtime-only-key',
    fetchImpl: async (url) => {
      if (url.endsWith('/videos')) return jsonResponse({ id: 'task-redirect', status: 'completed' })
      if (url.endsWith('/videos/task-redirect/content')) return jsonResponse({ url: 'http://127.0.0.1/private.mp4' })
      throw new Error(`unexpected URL ${url}`)
    }
  })
  await assert.rejects(
    provider.generateVideo({ model: 'grok-imagine-video', prompt: 'test', outputDir: '/tmp/openpet-grok-redirect' }),
    (error) => error.code === 'video_provider_invalid_response'
  )

  const oversized = createGrokVideoProvider({
    baseUrl: 'https://api.mangoqwq.com/v1',
    apiKey: 'runtime-only-key',
    fetchImpl: async (url) => {
      if (url.endsWith('/videos')) return jsonResponse({ id: 'task-large', status: 'completed' })
      if (url.endsWith('/videos/task-large/content')) return binaryResponse(Buffer.from('0123456789'), 'video/mp4')
      throw new Error(`unexpected URL ${url}`)
    }
  })
  await assert.rejects(
    oversized.generateVideo({ model: 'grok-imagine-video', prompt: 'test', outputDir: '/tmp/openpet-grok-large', maxOutputBytes: 4 }),
    (error) => error.code === 'video_content_too_large'
  )
})
