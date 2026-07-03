const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createImageGenerationModelService } = require('../../src/main/services/image-generation-model-service')

const createSettingsService = (initialSettings = {}) => {
  let current = {
    models: {},
    ...initialSettings
  }

  return {
    get: () => current,
    save: (next) => {
      current = next
      return current
    }
  }
}

const createSecretService = (initial = {}) => {
  const store = new Map(Object.entries(initial))
  return {
    setSecret: ({ id, value, label }) => {
      store.set(id, { value, label: label || id })
      return { id, label: label || id, hasValue: Boolean(value) }
    },
    getSecretValue: (id) => store.get(id)?.value || '',
    deleteSecret: (id) => {
      store.delete(id)
    },
    listSecretRefs: () => Array.from(store.entries()).map(([id, secret]) => ({
      id,
      label: secret.label || id,
      hasValue: Boolean(secret.value)
    }))
  }
}

const providerSettings = (overrides = {}) => ({
  models: {
    imageGeneration: {
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8317/v1',
      model: 'gpt-image-2',
      apiKeyRef: 'secret:model.image.openai.apiKey',
      timeoutMs: 120000,
      maxConcurrentJobs: 1,
      ...overrides
    }
  }
})

const waitForTurn = () => new Promise((resolve) => setImmediate(resolve))

const waitForRequestCount = async (requests, expectedCount) => {
  for (let index = 0; index < 20; index += 1) {
    if (requests.length >= expectedCount) return
    await waitForTurn()
  }
  assert.fail(`Timed out waiting for ${expectedCount} provider request(s); saw ${requests.length}`)
}

test('image generation model service exposes a renderer-safe unified provider config view and migrates legacy cloud config', () => {
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'cloud',
          cloud: {
            provider: 'openai',
            baseUrl: 'https://api.openai.com/v1/',
            model: 'gpt-image-1',
            apiKeyRef: 'secret:model.image.openai.apiKey'
          }
        }
      }
    }),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-abcd', label: 'Image API Key' }
    })
  })

  const config = service.getConfig()

  assert.equal(config.provider, 'openai')
  assert.equal(config.baseUrl, 'https://api.openai.com/v1')
  assert.equal(config.model, 'gpt-image-1')
  assert.equal(config.hasApiKey, true)
  assert.equal(config.apiKeyPreview, '••••abcd')
  assert.equal(Object.hasOwn(config, 'apiKey'), false)
  assert.equal(Object.hasOwn(config, 'cloud'), false)
  assert.equal(Object.hasOwn(config, 'local'), false)
  assert.equal(Object.hasOwn(config, 'defaultBackend'), false)
})

test('image generation model service saves unified config without persisting derived secret fields', () => {
  const settingsService = createSettingsService()
  const service = createImageGenerationModelService({
    settingsService,
    secretService: createSecretService()
  })

  const saved = service.saveConfig({
    provider: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:8317/v1/',
    model: 'gpt-image-2',
    apiKeyRef: 'secret:model.image.openai.apiKey',
    timeoutMs: 90000,
    maxConcurrentJobs: 2,
    hasApiKey: true,
    apiKeyPreview: '••••abcd'
  })

  assert.equal(saved.baseUrl, 'http://127.0.0.1:8317/v1')
  assert.equal(saved.timeoutMs, 90000)
  assert.equal(settingsService.get().models.imageGeneration.model, 'gpt-image-2')
  assert.equal(Object.hasOwn(settingsService.get().models.imageGeneration, 'hasApiKey'), false)
  assert.equal(Object.hasOwn(settingsService.get().models.imageGeneration, 'apiKeyPreview'), false)
})

test('image generation model service does not let config saves retarget the provider api key ref', () => {
  const settingsService = createSettingsService()
  const service = createImageGenerationModelService({
    settingsService,
    secretService: createSecretService()
  })

  const saved = service.saveConfig({
    baseUrl: 'https://images.example.test/v1',
    model: 'custom-image-model',
    apiKeyRef: 'ai.default'
  })

  assert.equal(saved.apiKeyRef, 'secret:model.image.openai.apiKey')
  assert.equal(settingsService.get().models.imageGeneration.apiKeyRef, 'secret:model.image.openai.apiKey')
})

test('image generation model service rejects non-image secret refs from persisted settings', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  let requested = false
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ apiKeyRef: 'ai.default' })),
    secretService: createSecretService({
      'ai.default': { value: 'sk-chat-secret', label: 'AI API Key' }
    }),
    fetchImpl: async () => {
      requested = true
      return { ok: true, status: 200, json: async () => ({ data: [] }) }
    }
  })

  assert.equal(service.getConfig().apiKeyRef, 'secret:model.image.openai.apiKey')
  assert.equal(service.getConfig().hasApiKey, false)
  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      output: {
        dataDir,
        dataRelativeDir: 'runs/rejected-secret-ref/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /API key is missing/
  )
  assert.equal(requested, false)
})

test('image generation model service saves and clears provider api keys through secret service', () => {
  const secretService = createSecretService()
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(),
    secretService
  })

  const saved = service.saveProviderApiKey('sk-demo-1234')
  assert.equal(saved.hasApiKey, true)
  assert.equal(saved.apiKeyPreview, '••••1234')

  const cleared = service.clearProviderApiKey()
  assert.equal(cleared.hasApiKey, false)
  assert.equal(cleared.apiKeyPreview, '')
})

test('image generation model service reports missing provider api key in health checks', async () => {
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService(),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'health-missing-key'
  })

  const result = await service.checkHealth()

  assert.equal(result.ok, false)
  assert.equal(result.provider, 'openai-compatible')
  assert.equal(result.code, 'missing_api_key')
  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.health.started',
    'imageGeneration.health.failed'
  ])
  assert.equal(logs[1].details.requestId, 'health-missing-key')
  assert.equal(logs[1].details.errorCode, 'missing_api_key')
})

test('image generation model service treats missing models endpoint as reachable for custom image providers', async () => {
  const requests = []
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({
      baseUrl: 'https://images.example.test/v1',
      model: 'custom-image-model'
    })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-custom', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'health-custom-models-unavailable',
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'not found' } })
      }
    }
  })

  const result = await service.checkHealth()

  assert.equal(result.ok, true)
  assert.equal(result.code, 'provider_reachable_models_unavailable')
  assert.equal(requests[0].url, 'https://images.example.test/v1/models')
  assert.equal(logs[1].event, 'imageGeneration.health.completed')
  assert.equal(logs[1].details.modelsProbe, 'unavailable')
  assert.equal(logs[1].details.status, 404)
})

test('image generation model service returns discovered models when the optional models probe succeeds', async () => {
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({
      baseUrl: 'https://images.example.test/v1',
      model: 'openpet-image-test'
    })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-custom', label: 'Image API Key' }
    }),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'gpt-image-2' },
          { id: 'openpet-image-test' },
          { id: 'flux-dev-transparent' },
          { name: 'missing-id-ignored' }
        ]
      })
    })
  })

  const result = await service.checkHealth()

  assert.equal(result.ok, true)
  assert.equal(result.code, 'provider_healthy')
  assert.deepEqual(result.availableModels, [
    'gpt-image-2',
    'openpet-image-test',
    'flux-dev-transparent'
  ])
  assert.equal(result.currentModelDiscovered, true)
})

test('image generation model service discovers available models through the optional /models probe', async () => {
  const requests = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({
      baseUrl: 'https://images-models.example.test/v1',
      model: 'gpt-image-2'
    })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-image', label: 'Image API Key' }
    }),
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'gpt-image-2' },
            { id: 'openpet-image-test' },
            { id: 'gpt-image-2' },
            {}
          ]
        })
      }
    }
  })

  const result = await service.discoverModels()

  assert.equal(result.ok, true)
  assert.equal(result.code, 'ok')
  assert.deepEqual(result.models, ['gpt-image-2', 'openpet-image-test'])
  assert.equal(requests[0].url, 'https://images-models.example.test/v1/models')
  assert.equal(requests[0].options.method, 'GET')
})

test('image generation model service can bound health probe time with an explicit timeout override', async () => {
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({
      baseUrl: 'https://images.example.test/v1',
      model: 'openpet-image-test'
    })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-custom', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'health-timeout-test',
    fetchImpl: async () => new Promise(() => {})
  })

  const result = await service.checkHealth({ timeoutMs: 25 })

  assert.equal(result.ok, false)
  assert.equal(result.code, 'health_check_timeout')
  assert.match(result.message, /timed out/i)
  assert.equal(logs[1].event, 'imageGeneration.health.failed')
  assert.equal(logs[1].details.errorCode, 'health_check_timeout')
})

test('image generation model service maps legacy local settings into the unified provider view', () => {
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'local',
          local: {
            endpoint: 'http://127.0.0.1:7860/v1',
            model: 'local-openai-compatible-image',
            timeoutMs: 90000,
            maxConcurrentJobs: 2
          }
        }
      }
    }),
    secretService: createSecretService()
  })

  const config = service.getConfig()

  assert.equal(config.provider, 'openai-compatible')
  assert.equal(config.baseUrl, 'http://127.0.0.1:7860/v1')
  assert.equal(config.model, 'local-openai-compatible-image')
  assert.equal(config.timeoutMs, 90000)
  assert.equal(config.maxConcurrentJobs, 2)
})

test('image generation model service prefers legacy local settings when flat defaults were merged in', () => {
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          provider: 'openai-compatible',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-image-2',
          apiKeyRef: 'secret:model.image.openai.apiKey',
          timeoutMs: 120000,
          maxConcurrentJobs: 1,
          defaultBackend: 'local',
          local: {
            endpoint: 'http://127.0.0.1:7860/v1',
            model: 'local-openai-compatible-image',
            timeoutMs: 90000,
            maxConcurrentJobs: 2
          }
        }
      }
    }),
    secretService: createSecretService()
  })

  const config = service.getConfig()

  assert.equal(config.baseUrl, 'http://127.0.0.1:7860/v1')
  assert.equal(config.model, 'local-openai-compatible-image')
  assert.equal(config.timeoutMs, 90000)
  assert.equal(config.maxConcurrentJobs, 2)
})

test('image generation model service writes generated provider outputs under the allowed data directory', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const requests = []
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ model: 'gpt-image-1' })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-1',
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { b64_json: Buffer.from('fake-image-bytes').toString('base64') }
          ]
        })
      }
    },
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })

  const result = await service.generateImage({
    prompt: 'small mint helper cat, transparent background',
    output: {
      dataDir,
      dataRelativeDir: 'runs/2026-06-19-sprout-cat/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.requestId, 'img-run-1')
  assert.equal(result.provider, 'openai-compatible')
  assert.equal(result.outputs.length, 1)
  assert.match(result.outputs[0].dataRelativePath, /^runs\/2026-06-19-sprout-cat\/frames\/base\/0001\.png$/)
  assert.equal(fs.existsSync(path.join(dataDir, result.outputs[0].dataRelativePath)), true)
  assert.equal(requests[0].url, 'http://127.0.0.1:8317/v1/images/generations')
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    model: 'gpt-image-1',
    prompt: 'small mint helper cat, transparent background',
    size: '1024x1024',
    background: 'transparent',
    response_format: 'b64_json'
  })
  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.request.started',
    'imageGeneration.provider.request.started',
    'imageGeneration.provider.request.completed',
    'imageGeneration.request.completed'
  ])
  assert.equal(logs[0].details.requestId, 'img-run-1')
  assert.equal(logs[0].details.provider, 'openai-compatible')
  assert.equal(logs[0].details.model, 'gpt-image-1')
  assert.equal(logs[0].details.requestedTransparent, true)
  assert.equal(logs[1].details.baseUrlHost, '127.0.0.1:8317')
  assert.equal(logs[1].details.backgroundMode, 'transparent')
  assert.equal(logs[2].details.status, 200)
  assert.equal(logs[3].details.outputCount, 1)
  assert.equal(JSON.stringify(logs).includes('sk-test-1234'), false)
  assert.equal(JSON.stringify(logs).includes('small mint helper cat'), false)
  assert.equal(JSON.stringify(logs).includes(dataDir), false)
})

test('image generation model service honors per-request timeout overrides', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ timeoutMs: 120000 })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ b64_json: Buffer.from('fake-image-bytes').toString('base64') }]
      })
    })
  })

  await service.generateImage({
    prompt: 'small mint helper cat, transparent background',
    timeoutMs: 300000,
    output: {
      dataDir,
      dataRelativeDir: 'runs/2026-06-19-sprout-cat/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    }
  })

  assert.equal(logs[1].event, 'imageGeneration.provider.request.started')
  assert.equal(logs[1].details.timeoutMs, 300000)
})

test('image generation model service uses a gpt-image-2 compatible generation payload', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const requests = []
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { b64_json: Buffer.from('fake-image-2-bytes').toString('base64') }
          ]
        })
      }
    },
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })

  const result = await service.generateImage({
    prompt: 'small mint helper cat, transparent background',
    output: {
      dataDir,
      dataRelativeDir: 'runs/2026-06-19-gpt-image-2/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    }
  })

  const payload = JSON.parse(requests[0].options.body)
  assert.equal(result.ok, true)
  assert.equal(payload.model, 'gpt-image-2')
  assert.equal(payload.prompt, 'small mint helper cat, transparent background')
  assert.equal(payload.size, '1024x1024')
  assert.equal(Object.hasOwn(payload, 'background'), false)
  assert.equal(Object.hasOwn(payload, 'response_format'), false)
  assert.equal(logs[0].details.requestedTransparent, true)
  assert.equal(logs[1].details.backgroundMode, 'omitted')
  assert.equal(logs[1].details.requestedTransparent, true)
})

test('image generation model service uses image edits when reference conditioning inputs are provided', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-edit-'))
  const referencePath = path.join(dataDir, 'canonical-reference.png')
  fs.writeFileSync(referencePath, Buffer.from('reference-image-bytes'))
  const requests = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ model: 'gpt-image-2' })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
    }),
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { b64_json: Buffer.from('edited-image-bytes').toString('base64') }
          ]
        })
      }
    }
  })

  const result = await service.generateImage({
    prompt: 'keep the same orange cat identity and create a waving action sheet',
    output: {
      dataDir,
      dataRelativeDir: 'runs/reference-conditioned/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    },
    referenceImages: [{
      path: referencePath,
      fileName: 'canonical-reference.png',
      relativePath: 'runs/reference-conditioned/inputs/references/canonical-reference.png',
      metadataRelativePath: 'runs/reference-conditioned/inputs/references/reference.json',
      role: 'canonical-reference'
    }]
  })

  const request = requests[0]
  const form = request.options.body
  const imageField = form.get('image')
  assert.equal(request.url, 'http://127.0.0.1:8317/v1/images/edits')
  assert.ok(form instanceof FormData)
  assert.equal(form.get('model'), 'gpt-image-2')
  assert.equal(form.get('prompt'), 'keep the same orange cat identity and create a waving action sheet')
  assert.equal(form.get('size'), '1024x1024')
  assert.equal(Object.prototype.toString.call(imageField), '[object File]')
  assert.equal(imageField.name, 'canonical-reference.png')
  assert.equal(result.conditioning.mode, 'image-edit')
  assert.equal(result.conditioning.endpoint, '/images/edits')
  assert.equal(result.conditioning.referenceImageCount, 1)
  assert.equal(result.conditioning.references[0].fileName, 'canonical-reference.png')
  assert.equal(result.conditioning.references[0].relativePath, 'runs/reference-conditioned/inputs/references/canonical-reference.png')
  assert.equal(result.conditioning.references[0].metadataRelativePath, 'runs/reference-conditioned/inputs/references/reference.json')
  assert.equal(result.conditioning.references[0].role, 'canonical-reference')
})

test('image generation model service enforces provider maxConcurrentJobs by queueing requests', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const requests = []
  const logs = []
  let releaseFirstRequest
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ maxConcurrentJobs: 1 })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-1234', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: (() => {
      const ids = ['img-run-queue-1', 'img-run-queue-2']
      return () => ids.shift() || 'img-run-queue-extra'
    })(),
    fetchImpl: async (url, options) => {
      const requestIndex = requests.length + 1
      requests.push({ url, options })
      if (requestIndex === 1) {
        await new Promise((resolve) => {
          releaseFirstRequest = resolve
        })
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { b64_json: Buffer.from(`fake-image-${requestIndex}`).toString('base64') }
          ]
        })
      }
    }
  })

  const first = service.generateImage({
    prompt: 'first queued custom pet prompt',
    output: {
      dataDir,
      dataRelativeDir: 'runs/concurrency/first/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    }
  })
  await waitForRequestCount(requests, 1)

  const second = service.generateImage({
    prompt: 'second queued custom pet prompt',
    output: {
      dataDir,
      dataRelativeDir: 'runs/concurrency/second/frames/base'
    },
    constraints: {
      width: 1024,
      height: 1024,
      transparent: true
    }
  })
  await waitForTurn()
  await waitForTurn()

  assert.equal(requests.length, 1)
  assert.equal(logs.some((entry) => entry.event === 'imageGeneration.provider.queue.waiting' && entry.details.requestId === 'img-run-queue-2'), true)

  releaseFirstRequest()
  const results = await Promise.all([first, second])

  assert.equal(requests.length, 2)
  assert.equal(results[0].ok, true)
  assert.equal(results[1].ok, true)
  assert.equal(logs.some((entry) => entry.event === 'imageGeneration.provider.queue.acquired' && entry.details.requestId === 'img-run-queue-2'), true)
  assert.equal(JSON.stringify(logs).includes('sk-test-1234'), false)
  assert.equal(JSON.stringify(logs).includes('queued custom pet prompt'), false)
})

test('image generation model service rejects output paths outside the allowed data directory', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(),
    secretService: createSecretService()
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'no-op',
      output: {
        dataDir,
        dataRelativeDir: '../escape'
      },
      constraints: {
        width: 512,
        height: 512,
        transparent: true
      }
    }),
    /allowed data directory/i
  )
})

test('image generation model service rejects output directory symlinks escaping the data directory', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-outside-'))
  const symlinkDir = path.join(dataDir, 'runs', 'symlink-output')
  fs.mkdirSync(path.dirname(symlinkDir), { recursive: true })
  try {
    fs.symlinkSync(outsideDir, symlinkDir, 'dir')
  } catch (error) {
    t.skip(`Directory symlinks are unavailable: ${error.message}`)
    return
  }
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(),
    secretService: createSecretService()
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'no-op',
      output: {
        dataDir,
        dataRelativeDir: 'runs/symlink-output'
      },
      constraints: {
        width: 512,
        height: 512,
        transparent: true
      }
    }),
    /allowed data directory/i
  )
  assert.equal(fs.existsSync(path.join(outsideDir, '0001.png')), false)
})

test('image generation model service records failed provider calls without leaking secrets or prompt text', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-failed',
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'unsupported model for image generation' }
      })
    }),
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      output: {
        dataDir,
        dataRelativeDir: 'runs/failure-case/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /HTTP 400/
  )

  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.request.started',
    'imageGeneration.provider.request.started',
    'imageGeneration.provider.request.failed',
    'imageGeneration.request.failed'
  ])
  assert.equal(logs[2].level, 'error')
  assert.equal(logs[2].details.requestId, 'img-run-failed')
  assert.equal(logs[2].details.status, 400)
  assert.equal(logs[2].details.errorCode, 'provider_http_error')
  assert.equal(logs[2].details.errorMessage, 'unsupported model for image generation')
  assert.equal(logs[3].details.provider, 'openai-compatible')
  assert.equal(JSON.stringify(logs).includes('sk-test-secret'), false)
  assert.equal(JSON.stringify(logs).includes('private detailed custom pet prompt'), false)
  assert.equal(JSON.stringify(logs).includes(dataDir), false)
})

test('image generation model service surfaces provider business errors from HTTP 200 responses', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-business-error',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        msg: '该接口未接入公益站独立网关，旧转发链路已关闭',
        data: null
      })
    }),
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      output: {
        dataDir,
        dataRelativeDir: 'runs/business-error/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /旧转发链路已关闭/
  )

  assert.equal(logs[2].event, 'imageGeneration.provider.request.failed')
  assert.equal(logs[2].details.errorCode, 'provider_business_error')
  assert.equal(logs[2].details.status, 200)
  assert.equal(logs[2].details.errorMessage, '该接口未接入公益站独立网关，旧转发链路已关闭')
  assert.equal(logs[3].details.errorMessage, '该接口未接入公益站独立网关，旧转发链路已关闭')
  assert.equal(JSON.stringify(logs).includes('sk-test-secret'), false)
  assert.equal(JSON.stringify(logs).includes('private detailed custom pet prompt'), false)
})

test('image generation model service rejects provider outputs with missing image bytes', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-missing-bytes',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ revised_prompt: 'no image attached' }] })
    }),
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      output: {
        dataDir,
        dataRelativeDir: 'runs/missing-bytes/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /missing image bytes/
  )

  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.request.started',
    'imageGeneration.provider.request.started',
    'imageGeneration.provider.request.failed',
    'imageGeneration.request.failed'
  ])
  assert.equal(logs[2].details.errorCode, 'provider_invalid_response')
  assert.equal(logs[2].details.outputCount, 0)
  assert.equal(JSON.stringify(logs).includes('sk-test-secret'), false)
  assert.equal(JSON.stringify(logs).includes('private detailed custom pet prompt'), false)
})

test('image generation model service times out provider generation requests and records timeout logs', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-provider-timeout',
    providerGenerationTimeoutMs: 25,
    nowMs: (() => {
      let current = 1000
      return () => {
        current += 25
        return current
      }
    })(),
    fetchImpl: async (_url, options) => new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      }, { once: true })
    })
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      output: {
        dataDir,
        dataRelativeDir: 'runs/provider-timeout/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /timed out/i
  )

  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.request.started',
    'imageGeneration.provider.request.started',
    'imageGeneration.provider.request.failed',
    'imageGeneration.request.failed'
  ])
  assert.equal(logs[2].details.errorCode, 'provider_timeout')
  assert.equal(logs[2].details.timeoutMs, 25)
  assert.equal(JSON.stringify(logs).includes('sk-test-secret'), false)
  assert.equal(JSON.stringify(logs).includes('private detailed custom pet prompt'), false)
  assert.equal(JSON.stringify(logs).includes(dataDir), false)
})

test('image generation model service uses the saved provider timeout for generation requests', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings({ timeoutMs: 1500 })),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'temporarily unavailable' } })
    })
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      output: {
        dataDir,
        dataRelativeDir: 'runs/provider-config-timeout/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /HTTP 503/
  )

  assert.equal(logs[1].event, 'imageGeneration.provider.request.started')
  assert.equal(logs[1].details.timeoutMs, 1500)
})

test('image generation model service keeps the production provider timeout by default', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(providerSettings()),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'temporarily unavailable' } })
    })
  })

  await assert.rejects(
    () => service.generateImage({
      prompt: 'private detailed custom pet prompt',
      output: {
        dataDir,
        dataRelativeDir: 'runs/provider-default-timeout/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /HTTP 503/
  )

  assert.equal(logs[1].event, 'imageGeneration.provider.request.started')
  assert.equal(logs[1].details.timeoutMs, 120000)
})
