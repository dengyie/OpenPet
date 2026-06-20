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

test('image generation model service exposes a renderer-safe config view', () => {
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

  assert.equal(config.defaultBackend, 'cloud')
  assert.equal(config.cloud.baseUrl, 'https://api.openai.com/v1')
  assert.equal(config.cloud.hasApiKey, true)
  assert.equal(config.cloud.apiKeyPreview, '••••abcd')
  assert.equal(Object.hasOwn(config.cloud, 'apiKey'), false)
})

test('image generation model service saves config without persisting derived secret fields', () => {
  const settingsService = createSettingsService()
  const service = createImageGenerationModelService({
    settingsService,
    secretService: createSecretService()
  })

  const saved = service.saveConfig({
    defaultBackend: 'local',
    cloud: {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-image-1',
      apiKeyRef: 'secret:model.image.openai.apiKey',
      hasApiKey: true,
      apiKeyPreview: '••••abcd'
    },
    local: {
      endpoint: 'http://127.0.0.1:7860/generate',
      healthUrl: 'http://127.0.0.1:7860/health',
      model: 'local-pet-sprite',
      timeoutMs: 90000,
      maxConcurrentJobs: 2
    }
  })

  assert.equal(saved.defaultBackend, 'local')
  assert.equal(saved.local.timeoutMs, 90000)
  assert.equal(Object.hasOwn(settingsService.get().models.imageGeneration.cloud, 'hasApiKey'), false)
  assert.equal(Object.hasOwn(settingsService.get().models.imageGeneration.cloud, 'apiKeyPreview'), false)
})

test('image generation model service saves and clears cloud api keys through secret service', () => {
  const secretService = createSecretService()
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(),
    secretService
  })

  const saved = service.saveCloudApiKey('sk-demo-1234')
  assert.equal(saved.hasApiKey, true)
  assert.equal(saved.apiKeyPreview, '••••1234')

  const cleared = service.clearCloudApiKey()
  assert.equal(cleared.hasApiKey, false)
  assert.equal(cleared.apiKeyPreview, '')
})

test('image generation model service reports missing cloud api key in health checks', async () => {
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'cloud',
          cloud: {
            provider: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-image-1',
            apiKeyRef: 'secret:model.image.openai.apiKey'
          }
        }
      }
    }),
    secretService: createSecretService(),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'health-missing-key'
  })

  const result = await service.checkHealth({ backend: 'cloud' })

  assert.equal(result.ok, false)
  assert.equal(result.code, 'missing_api_key')
  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.health.started',
    'imageGeneration.health.failed'
  ])
  assert.equal(logs[1].details.requestId, 'health-missing-key')
  assert.equal(logs[1].details.errorCode, 'missing_api_key')
})

test('image generation model service checks local endpoints through loopback-only health urls', async () => {
  const requests = []
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'local',
          local: {
            endpoint: 'http://127.0.0.1:7860/generate',
            healthUrl: 'http://127.0.0.1:7860/health',
            model: 'local-pet-sprite',
            timeoutMs: 120000,
            maxConcurrentJobs: 1
          }
        }
      }
    }),
    secretService: createSecretService(),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'health-local',
    fetchImpl: async (url) => {
      requests.push(url)
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true })
      }
    }
  })

  const result = await service.checkHealth({ backend: 'local' })

  assert.equal(result.ok, true)
  assert.equal(requests[0], 'http://127.0.0.1:7860/health')
  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.health.started',
    'imageGeneration.health.completed'
  ])
  assert.equal(logs[1].details.requestId, 'health-local')
  assert.equal(logs[1].details.backend, 'local')
  assert.equal(logs[1].details.status, 200)
})

test('image generation model service rejects non-loopback local urls', async () => {
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'local',
          local: {
            endpoint: 'http://192.168.1.20:7860/generate',
            healthUrl: 'http://192.168.1.20:7860/health',
            model: 'local-pet-sprite',
            timeoutMs: 120000,
            maxConcurrentJobs: 1
          }
        }
      }
    }),
    secretService: createSecretService()
  })

  await assert.rejects(
    () => service.checkHealth({ backend: 'local' }),
    /loopback/i
  )
})

test('image generation model service writes generated cloud outputs under the allowed data directory', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const requests = []
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'cloud',
          cloud: {
            provider: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-image-1',
            apiKeyRef: 'secret:model.image.openai.apiKey'
          }
        }
      }
    }),
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
    backend: 'cloud',
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
  assert.equal(result.outputs.length, 1)
  assert.match(result.outputs[0].dataRelativePath, /^runs\/2026-06-19-sprout-cat\/frames\/base\/0001\.png$/)
  assert.equal(fs.existsSync(path.join(dataDir, result.outputs[0].dataRelativePath)), true)
  assert.equal(requests[0].url, 'https://api.openai.com/v1/images/generations')
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
  assert.equal(logs[0].details.backend, 'cloud')
  assert.equal(logs[0].details.model, 'gpt-image-1')
  assert.equal(logs[0].details.requestedTransparent, true)
  assert.equal(logs[1].details.baseUrlHost, 'api.openai.com')
  assert.equal(logs[1].details.backgroundMode, 'transparent')
  assert.equal(logs[2].details.status, 200)
  assert.equal(logs[3].details.outputCount, 1)
  assert.equal(JSON.stringify(logs).includes('sk-test-1234'), false)
  assert.equal(JSON.stringify(logs).includes('small mint helper cat'), false)
  assert.equal(JSON.stringify(logs).includes(dataDir), false)
})

test('image generation model service uses a gpt-image-2 compatible generation payload', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const requests = []
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'cloud',
          cloud: {
            provider: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:8317/v1',
            model: 'gpt-image-2',
            apiKeyRef: 'secret:model.image.openai.apiKey'
          }
        }
      }
    }),
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
    backend: 'cloud',
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

test('image generation model service rejects output paths outside the allowed data directory', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const service = createImageGenerationModelService({
    settingsService: createSettingsService(),
    secretService: createSecretService()
  })

  await assert.rejects(
    () => service.generateImage({
      backend: 'fixture',
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

test('image generation model service records failed provider calls without leaking secrets or prompt text', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'cloud',
          cloud: {
            provider: 'openai',
            baseUrl: 'http://127.0.0.1:8317/v1',
            model: 'gpt-image-2',
            apiKeyRef: 'secret:model.image.openai.apiKey'
          }
        }
      }
    }),
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
      backend: 'cloud',
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
  assert.equal(logs[3].details.backend, 'cloud')
  assert.equal(JSON.stringify(logs).includes('sk-test-secret'), false)
  assert.equal(JSON.stringify(logs).includes('private detailed custom pet prompt'), false)
  assert.equal(JSON.stringify(logs).includes(dataDir), false)
})

test('image generation model service records invalid successful provider responses as provider failures', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'cloud',
          cloud: {
            provider: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:8317/v1',
            model: 'gpt-image-2',
            apiKeyRef: 'secret:model.image.openai.apiKey'
          }
        }
      }
    }),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-empty',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ created: 1, data: [] })
    }),
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })

  await assert.rejects(
    () => service.generateImage({
      backend: 'cloud',
      prompt: 'private detailed custom pet prompt',
      output: {
        dataDir,
        dataRelativeDir: 'runs/empty-case/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /returned no outputs/
  )

  assert.equal(logs[2].event, 'imageGeneration.provider.request.failed')
  assert.equal(logs[2].details.errorCode, 'provider_invalid_response')
  assert.equal(logs[2].details.status, 200)
  assert.equal(logs[2].details.outputCount, 0)
  assert.equal(JSON.stringify(logs).includes('sk-test-secret'), false)
  assert.equal(JSON.stringify(logs).includes('private detailed custom pet prompt'), false)
})

test('image generation model service rejects cloud outputs with missing image bytes', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'cloud',
          cloud: {
            provider: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:8317/v1',
            model: 'gpt-image-2',
            apiKeyRef: 'secret:model.image.openai.apiKey'
          }
        }
      }
    }),
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
      backend: 'cloud',
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

test('image generation model service rejects local outputs with missing image bytes', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'local',
          local: {
            endpoint: 'http://127.0.0.1:7860/generate',
            healthUrl: 'http://127.0.0.1:7860/health',
            model: 'local-pet-sprite',
            timeoutMs: 120000,
            maxConcurrentJobs: 1
          }
        }
      }
    }),
    secretService: createSecretService(),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-local-missing-bytes',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ outputs: [{ mimeType: 'image/png' }] })
    }),
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })

  await assert.rejects(
    () => service.generateImage({
      backend: 'local',
      prompt: 'private detailed custom pet prompt',
      output: {
        dataDir,
        dataRelativeDir: 'runs/local-missing-bytes/frames/base'
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
  assert.equal(logs[1].details.requestId, 'img-run-local-missing-bytes')
  assert.equal(logs[2].details.errorCode, 'endpoint_invalid_response')
  assert.equal(logs[2].details.outputCount, 0)
  assert.equal(JSON.stringify(logs).includes('private detailed custom pet prompt'), false)
})

test('image generation model service records empty local outputs as provider failures', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'local',
          local: {
            endpoint: 'http://127.0.0.1:7860/generate',
            healthUrl: 'http://127.0.0.1:7860/health',
            model: 'local-pet-sprite',
            timeoutMs: 120000,
            maxConcurrentJobs: 1
          }
        }
      }
    }),
    secretService: createSecretService(),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-local-empty',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ outputs: [] })
    }),
    now: () => new Date('2026-06-19T00:00:00.000Z')
  })

  await assert.rejects(
    () => service.generateImage({
      backend: 'local',
      prompt: 'private detailed custom pet prompt',
      output: {
        dataDir,
        dataRelativeDir: 'runs/local-empty/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /returned no outputs/
  )

  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.request.started',
    'imageGeneration.provider.request.started',
    'imageGeneration.provider.request.failed',
    'imageGeneration.request.failed'
  ])
  assert.equal(logs[2].details.errorCode, 'endpoint_invalid_response')
  assert.equal(logs[2].details.outputCount, 0)
  assert.equal(JSON.stringify(logs).includes('private detailed custom pet prompt'), false)
})

test('image generation model service times out cloud generation requests and records provider timeout logs', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'cloud',
          cloud: {
            provider: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:8317/v1',
            model: 'gpt-image-2',
            apiKeyRef: 'secret:model.image.openai.apiKey'
          }
        }
      }
    }),
    secretService: createSecretService({
      'secret:model.image.openai.apiKey': { value: 'sk-test-secret', label: 'Image API Key' }
    }),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-cloud-timeout',
    cloudGenerationTimeoutMs: 25,
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
      backend: 'cloud',
      prompt: 'private detailed custom pet prompt',
      output: {
        dataDir,
        dataRelativeDir: 'runs/cloud-timeout/frames/base'
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

test('image generation model service keeps the production cloud timeout by default', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'cloud',
          cloud: {
            provider: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:8317/v1',
            model: 'gpt-image-2',
            apiKeyRef: 'secret:model.image.openai.apiKey'
          }
        }
      }
    }),
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
      backend: 'cloud',
      prompt: 'private detailed custom pet prompt',
      output: {
        dataDir,
        dataRelativeDir: 'runs/cloud-default-timeout/frames/base'
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

test('image generation model service times out local generation requests using local timeoutMs', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-image-generation-'))
  const logs = []
  const service = createImageGenerationModelService({
    settingsService: createSettingsService({
      models: {
        imageGeneration: {
          defaultBackend: 'local',
          local: {
            endpoint: 'http://127.0.0.1:7860/generate',
            healthUrl: 'http://127.0.0.1:7860/health',
            model: 'local-pet-sprite',
            timeoutMs: 1500,
            maxConcurrentJobs: 1
          }
        }
      }
    }),
    secretService: createSecretService(),
    appLogService: { record: (entry) => logs.push(entry) },
    idFactory: () => 'img-run-local-timeout',
    nowMs: (() => {
      let current = 2000
      return () => {
        current += 10
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
      backend: 'local',
      prompt: 'private detailed custom pet prompt',
      output: {
        dataDir,
        dataRelativeDir: 'runs/local-timeout/frames/base'
      },
      constraints: {
        width: 1024,
        height: 1024,
        transparent: true
      }
    }),
    /timed out after 1500ms/i
  )

  assert.deepEqual(logs.map((entry) => entry.event), [
    'imageGeneration.request.started',
    'imageGeneration.provider.request.started',
    'imageGeneration.provider.request.failed',
    'imageGeneration.request.failed'
  ])
  assert.equal(logs[2].details.errorCode, 'endpoint_timeout')
  assert.equal(logs[2].details.timeoutMs, 1500)
  assert.equal(JSON.stringify(logs).includes('private detailed custom pet prompt'), false)
  assert.equal(JSON.stringify(logs).includes(dataDir), false)
})
