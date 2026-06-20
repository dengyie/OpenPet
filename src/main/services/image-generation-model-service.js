const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const DEFAULT_CONFIG = {
  defaultBackend: 'fixture',
  cloud: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-image-1',
    apiKeyRef: 'secret:model.image.openai.apiKey',
    organization: '',
    project: ''
  },
  local: {
    endpoint: 'http://127.0.0.1:7860/generate',
    healthUrl: 'http://127.0.0.1:7860/health',
    model: 'local-pet-sprite',
    timeoutMs: 120000,
    maxConcurrentJobs: 1
  }
}

const CLOUD_GENERATION_TIMEOUT_MS = 120000

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const normalizeBaseUrl = (value, fallback) => String(value || fallback || '').trim().replace(/\/+$/, '')

const normalizeConfig = (config = {}) => ({
  defaultBackend: ['fixture', 'cloud', 'local'].includes(config?.defaultBackend) ? config.defaultBackend : DEFAULT_CONFIG.defaultBackend,
  cloud: {
    ...DEFAULT_CONFIG.cloud,
    ...(isPlainObject(config.cloud) ? config.cloud : {}),
    provider: String(config?.cloud?.provider || DEFAULT_CONFIG.cloud.provider).trim() || DEFAULT_CONFIG.cloud.provider,
    baseUrl: normalizeBaseUrl(config?.cloud?.baseUrl, DEFAULT_CONFIG.cloud.baseUrl),
    model: String(config?.cloud?.model || DEFAULT_CONFIG.cloud.model).trim() || DEFAULT_CONFIG.cloud.model,
    apiKeyRef: String(config?.cloud?.apiKeyRef || DEFAULT_CONFIG.cloud.apiKeyRef).trim() || DEFAULT_CONFIG.cloud.apiKeyRef,
    organization: String(config?.cloud?.organization || '').trim(),
    project: String(config?.cloud?.project || '').trim()
  },
  local: {
    ...DEFAULT_CONFIG.local,
    ...(isPlainObject(config.local) ? config.local : {}),
    endpoint: String(config?.local?.endpoint || DEFAULT_CONFIG.local.endpoint).trim() || DEFAULT_CONFIG.local.endpoint,
    healthUrl: String(config?.local?.healthUrl || DEFAULT_CONFIG.local.healthUrl).trim() || DEFAULT_CONFIG.local.healthUrl,
    model: String(config?.local?.model || DEFAULT_CONFIG.local.model).trim() || DEFAULT_CONFIG.local.model,
    timeoutMs: Math.max(1000, Number(config?.local?.timeoutMs ?? DEFAULT_CONFIG.local.timeoutMs) || DEFAULT_CONFIG.local.timeoutMs),
    maxConcurrentJobs: Math.max(1, Number(config?.local?.maxConcurrentJobs ?? DEFAULT_CONFIG.local.maxConcurrentJobs) || DEFAULT_CONFIG.local.maxConcurrentJobs)
  }
})

const toPersistedConfig = (config = {}) => normalizeConfig({
  defaultBackend: config.defaultBackend,
  cloud: {
    provider: config?.cloud?.provider,
    baseUrl: config?.cloud?.baseUrl,
    model: config?.cloud?.model,
    apiKeyRef: config?.cloud?.apiKeyRef,
    organization: config?.cloud?.organization,
    project: config?.cloud?.project
  },
  local: {
    endpoint: config?.local?.endpoint,
    healthUrl: config?.local?.healthUrl,
    model: config?.local?.model,
    timeoutMs: config?.local?.timeoutMs,
    maxConcurrentJobs: config?.local?.maxConcurrentJobs
  }
})

const maskSecret = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  return `••••${text.slice(-4)}`
}

const assertLoopbackUrl = (value, fieldName) => {
  let parsed
  try {
    parsed = new URL(String(value || ''))
  } catch (_) {
    throw new Error(`${fieldName} must be a valid URL`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${fieldName} must use HTTP or HTTPS`)
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`${fieldName} must use a loopback host`)
  }
  return parsed.toString()
}

const ensureInsideDataDir = ({ dataDir, dataRelativeDir }) => {
  const root = path.resolve(String(dataDir || ''))
  const relativeDir = String(dataRelativeDir || '').trim()
  if (!root || !relativeDir) throw new Error('Image generation output must target the allowed data directory')
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true })
  const targetDir = path.resolve(root, relativeDir)
  const relative = path.relative(root, targetDir)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Image generation output must stay inside the allowed data directory')
  }
  const existingPath = fs.existsSync(targetDir)
    ? targetDir
    : (() => {
        let currentPath = path.dirname(targetDir)
        while (currentPath && !fs.existsSync(currentPath)) {
          const nextPath = path.dirname(currentPath)
          if (nextPath === currentPath) break
          currentPath = nextPath
        }
        return currentPath
      })()
  const realRoot = fs.realpathSync.native(root)
  const realExistingPath = fs.realpathSync.native(existingPath)
  const realRelative = path.relative(realRoot, realExistingPath)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error('Image generation output must stay inside the allowed data directory')
  }
  return { root, relativeDir, targetDir }
}

const sha256File = (filePath) => {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

const writeOutputPng = ({ targetDir, index, bytes }) => {
  fs.mkdirSync(targetDir, { recursive: true })
  const fileName = `${String(index).padStart(4, '0')}.png`
  const outputPath = path.join(targetDir, fileName)
  fs.writeFileSync(outputPath, bytes)
  return { outputPath, fileName }
}

const decodeRequiredBase64Image = ({ value, backend, fieldName }) => {
  const encoded = String(value || '').trim()
  if (!encoded) {
    throw new Error(`${backend} image generation returned an output with missing image bytes (${fieldName})`)
  }
  const bytes = Buffer.from(encoded, 'base64')
  if (!bytes.length) {
    throw new Error(`${backend} image generation returned an output with missing image bytes (${fieldName})`)
  }
  return bytes
}

const isAbortError = (error) => (
  error?.name === 'AbortError' ||
  error?.code === 'ABORT_ERR'
)

const fetchWithTimeout = async ({
  fetchImpl,
  url,
  options = {},
  timeoutMs,
  timeoutMessage
}) => {
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error(timeoutMessage))
  }, timeoutMs)
  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal
    })
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      throw new Error(timeoutMessage)
    }
    throw error
  } finally {
    clearTimeout(timeoutHandle)
  }
}

const getUrlHost = (value) => {
  try {
    return new URL(String(value || '')).host
  } catch (_) {
    return ''
  }
}

const getErrorMessage = async (response) => {
  try {
    const body = await response?.json?.()
    return String(body?.error?.message || body?.message || '').slice(0, 240)
  } catch (_) {
    return ''
  }
}

const extractCloudProviderBusinessError = (body) => {
  if (!isPlainObject(body)) return ''
  if (Array.isArray(body.data)) return ''
  const message = String(body.error?.message || body.message || body.msg || '').trim()
  if (!message) return ''
  return message.slice(0, 240)
}

const buildCloudGenerationPayload = ({ model, prompt, constraints }) => {
  const payload = {
    model,
    prompt,
    size: `${constraints.width}x${constraints.height}`
  }
  if (model !== 'gpt-image-2') {
    payload.background = constraints.transparent ? 'transparent' : 'white'
    payload.response_format = 'b64_json'
  }
  return payload
}

const getCloudGenerationBackgroundMode = ({ model, constraints }) => {
  if (model === 'gpt-image-2') return 'omitted'
  return constraints.transparent ? 'transparent' : 'white'
}

const createImageGenerationModelService = ({
  settingsService,
  secretService,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  nowMs = () => Date.now(),
  appLogService,
  idFactory = () => crypto.randomUUID(),
  cloudGenerationTimeoutMs = CLOUD_GENERATION_TIMEOUT_MS
} = {}) => {
  if (!settingsService) throw new Error('settingsService is required')
  if (!secretService) throw new Error('secretService is required')

  const getStoredConfig = () => normalizeConfig(settingsService.get().models?.imageGeneration)

  const recordLog = (entry) => {
    try {
      appLogService?.record?.({
        actor: 'system',
        scope: 'image-generation',
        ...entry
      })
    } catch (_) {
      // Diagnostics must never break the creator workflow.
    }
  }

  const saveStoredConfig = (config) => {
    const settings = settingsService.get()
    settingsService.save({
      ...settings,
      models: {
        ...(isPlainObject(settings.models) ? settings.models : {}),
        imageGeneration: config
      }
    })
  }

  const getConfig = () => {
    const config = getStoredConfig()
    const secretValue = secretService.getSecretValue(config.cloud.apiKeyRef)
    return {
      ...config,
      cloud: {
        ...config.cloud,
        hasApiKey: Boolean(secretValue),
        apiKeyPreview: maskSecret(secretValue),
        apiKeyLabel: 'Image API Key'
      }
    }
  }

  const saveConfig = (partialConfig = {}) => {
    const current = getStoredConfig()
    const next = toPersistedConfig({
      ...current,
      ...(isPlainObject(partialConfig) ? partialConfig : {}),
      cloud: {
        ...current.cloud,
        ...(isPlainObject(partialConfig.cloud) ? partialConfig.cloud : {})
      },
      local: {
        ...current.local,
        ...(isPlainObject(partialConfig.local) ? partialConfig.local : {})
      }
    })
    saveStoredConfig(next)
    return getConfig()
  }

  const saveCloudApiKey = (apiKey) => {
    const config = getStoredConfig()
    secretService.setSecret({
      id: config.cloud.apiKeyRef,
      value: String(apiKey || ''),
      label: 'Image API Key'
    })
    const saved = getConfig()
    return {
      apiKeyRef: saved.cloud.apiKeyRef,
      hasApiKey: saved.cloud.hasApiKey,
      apiKeyPreview: saved.cloud.apiKeyPreview
    }
  }

  const clearCloudApiKey = () => {
    const config = getStoredConfig()
    secretService.deleteSecret(config.cloud.apiKeyRef)
    return {
      apiKeyRef: config.cloud.apiKeyRef,
      hasApiKey: false,
      apiKeyPreview: ''
    }
  }

  const checkHealth = async ({ backend } = {}) => {
    const config = getStoredConfig()
    const targetBackend = backend || config.defaultBackend
    const requestId = idFactory()
    const startedMs = nowMs()
    const healthModel = targetBackend === 'cloud'
      ? config.cloud.model
      : targetBackend === 'local'
        ? config.local.model
        : 'fixture-image'
    recordLog({
      level: 'info',
      event: 'imageGeneration.health.started',
      message: 'Image generation health check started',
      details: {
        requestId,
        backend: targetBackend,
        model: healthModel
      }
    })

    const completeHealth = (result, extraDetails = {}) => {
      recordLog({
        level: result.ok ? 'info' : 'error',
        event: result.ok ? 'imageGeneration.health.completed' : 'imageGeneration.health.failed',
        message: result.ok ? 'Image generation health check completed' : 'Image generation health check failed',
        details: {
          requestId,
          backend: targetBackend,
          model: healthModel,
          durationMs: nowMs() - startedMs,
          errorCode: result.ok ? '' : result.code,
          ...extraDetails
        }
      })
      return result
    }

    try {
      if (targetBackend === 'fixture') {
        return completeHealth({ ok: true, backend: 'fixture', code: 'fixture_ready', message: 'Fixture backend is available' })
      }

      if (targetBackend === 'cloud') {
        const apiKey = secretService.getSecretValue(config.cloud.apiKeyRef)
        if (!apiKey) {
          return completeHealth({ ok: false, backend: 'cloud', code: 'missing_api_key', message: 'Cloud image generation API key is missing' })
        }
        const response = await fetchImpl(`${config.cloud.baseUrl}/models`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        })
        const status = response?.status || 'error'
        if (!response?.ok) {
          return completeHealth(
            { ok: false, backend: 'cloud', code: 'provider_unhealthy', message: `Cloud provider responded with HTTP ${status}` },
            { status, baseUrlHost: getUrlHost(config.cloud.baseUrl) }
          )
        }
        return completeHealth(
          { ok: true, backend: 'cloud', code: 'provider_healthy', message: 'Cloud provider is reachable' },
          { status, baseUrlHost: getUrlHost(config.cloud.baseUrl) }
        )
      }

      if (targetBackend === 'local') {
        const healthUrl = assertLoopbackUrl(config.local.healthUrl, 'Local health URL')
        const endpoint = assertLoopbackUrl(config.local.endpoint, 'Local endpoint URL')
        void endpoint
        const response = await fetchImpl(healthUrl, { method: 'GET' })
        const status = response?.status || 'error'
        if (!response?.ok) {
          return completeHealth(
            { ok: false, backend: 'local', code: 'endpoint_unhealthy', message: `Local endpoint responded with HTTP ${status}` },
            { status, baseUrlHost: getUrlHost(healthUrl) }
          )
        }
        return completeHealth(
          { ok: true, backend: 'local', code: 'endpoint_healthy', message: 'Local endpoint is reachable' },
          { status, baseUrlHost: getUrlHost(healthUrl) }
        )
      }

      throw new Error(`Unsupported image generation backend: ${targetBackend}`)
    } catch (error) {
      recordLog({
        level: 'error',
        event: 'imageGeneration.health.failed',
        message: 'Image generation health check failed',
        details: {
          requestId,
          backend: targetBackend,
          model: healthModel,
          durationMs: nowMs() - startedMs,
          errorCode: 'health_check_error',
          errorMessage: String(error?.message || error).slice(0, 240)
        }
      })
      throw error
    }
  }

  const generateFixtureImage = ({ targetDir, relativeDir, requestId }) => {
    const bytes = Buffer.from('fixture-image')
    const { outputPath, fileName } = writeOutputPng({ targetDir, index: 1, bytes })
    return {
      ok: true,
      requestId,
      backend: 'fixture',
      model: 'fixture-image',
      generatedAt: now().toISOString(),
      outputs: [{
        dataRelativePath: path.posix.join(relativeDir.replace(/\\/g, '/'), fileName),
        mimeType: 'image/png',
        sha256: sha256File(outputPath)
      }],
      usage: {
        estimatedCostUsd: 0
      }
    }
  }

  const generateCloudImage = async ({ config, prompt, targetDir, relativeDir, constraints, requestId }) => {
    const apiKey = secretService.getSecretValue(config.cloud.apiKeyRef)
    if (!apiKey) throw new Error('Cloud image generation API key is missing')
    const providerStartMs = nowMs()
    const timeoutMs = cloudGenerationTimeoutMs
    const backgroundMode = getCloudGenerationBackgroundMode({ model: config.cloud.model, constraints })
    recordLog({
      level: 'info',
      event: 'imageGeneration.provider.request.started',
      message: 'Cloud image provider request started',
      details: {
        requestId,
        backend: 'cloud',
        provider: config.cloud.provider,
        model: config.cloud.model,
        baseUrlHost: getUrlHost(config.cloud.baseUrl),
        width: constraints.width,
        height: constraints.height,
        requestedTransparent: Boolean(constraints.transparent),
        backgroundMode,
        timeoutMs
      }
    })
    let response
    try {
      response = await fetchWithTimeout({
        fetchImpl,
        url: `${config.cloud.baseUrl}/images/generations`,
        timeoutMs,
        timeoutMessage: `Cloud image generation timed out after ${timeoutMs}ms`,
        options: {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(buildCloudGenerationPayload({
            model: config.cloud.model,
            prompt,
            constraints
          }))
        }
      })
    } catch (error) {
      recordLog({
        level: 'error',
        event: 'imageGeneration.provider.request.failed',
        message: 'Cloud image provider request failed',
        details: {
          requestId,
          backend: 'cloud',
          provider: config.cloud.provider,
          model: config.cloud.model,
          baseUrlHost: getUrlHost(config.cloud.baseUrl),
          durationMs: nowMs() - providerStartMs,
          timeoutMs,
          errorCode: /timed out/i.test(String(error?.message || '')) ? 'provider_timeout' : 'provider_request_error',
          errorMessage: String(error?.message || error).slice(0, 240)
        }
      })
      throw error
    }
    if (!response?.ok) {
      const status = response?.status || 'error'
      const errorMessage = await getErrorMessage(response)
      recordLog({
        level: 'error',
        event: 'imageGeneration.provider.request.failed',
        message: 'Cloud image provider request failed',
        details: {
          requestId,
          backend: 'cloud',
          provider: config.cloud.provider,
          model: config.cloud.model,
          baseUrlHost: getUrlHost(config.cloud.baseUrl),
          status,
          durationMs: nowMs() - providerStartMs,
          errorCode: 'provider_http_error',
          errorMessage
        }
      })
      throw new Error(`Cloud image generation failed with HTTP ${status}`)
    }
    const body = await response.json()
    const items = Array.isArray(body?.data) ? body.data : []
    if (!items.length) {
      const businessError = extractCloudProviderBusinessError(body)
      if (businessError) {
        recordLog({
          level: 'error',
          event: 'imageGeneration.provider.request.failed',
          message: 'Cloud image provider returned a business error',
          details: {
            requestId,
            backend: 'cloud',
            provider: config.cloud.provider,
            model: config.cloud.model,
            baseUrlHost: getUrlHost(config.cloud.baseUrl),
            status: response.status || 200,
            durationMs: nowMs() - providerStartMs,
            outputCount: 0,
            errorCode: 'provider_business_error',
            errorMessage: businessError
          }
        })
        throw new Error(businessError)
      }
      recordLog({
        level: 'error',
        event: 'imageGeneration.provider.request.failed',
        message: 'Cloud image provider returned no outputs',
        details: {
          requestId,
          backend: 'cloud',
          provider: config.cloud.provider,
          model: config.cloud.model,
          baseUrlHost: getUrlHost(config.cloud.baseUrl),
          status: response.status || 200,
          durationMs: nowMs() - providerStartMs,
          outputCount: 0,
          errorCode: 'provider_invalid_response',
          errorMessage: 'Cloud image generation returned no outputs'
        }
      })
      throw new Error('Cloud image generation returned no outputs')
    }

    let outputs
    try {
      outputs = items.map((item, index) => {
        const bytes = decodeRequiredBase64Image({
          value: item?.b64_json,
          backend: 'Cloud',
          fieldName: 'b64_json'
        })
        const { outputPath, fileName } = writeOutputPng({ targetDir, index: index + 1, bytes })
        return {
          dataRelativePath: path.posix.join(relativeDir.replace(/\\/g, '/'), fileName),
          mimeType: 'image/png',
          sha256: sha256File(outputPath)
        }
      })
    } catch (error) {
      recordLog({
        level: 'error',
        event: 'imageGeneration.provider.request.failed',
        message: 'Cloud image provider returned invalid image bytes',
        details: {
          requestId,
          backend: 'cloud',
          provider: config.cloud.provider,
          model: config.cloud.model,
          baseUrlHost: getUrlHost(config.cloud.baseUrl),
          status: response.status || 200,
          durationMs: nowMs() - providerStartMs,
          outputCount: 0,
          errorCode: 'provider_invalid_response',
          errorMessage: String(error?.message || error).slice(0, 240)
        }
      })
      throw error
    }

    recordLog({
      level: 'info',
      event: 'imageGeneration.provider.request.completed',
      message: 'Cloud image provider request completed',
      details: {
        requestId,
        backend: 'cloud',
        provider: config.cloud.provider,
        model: config.cloud.model,
        baseUrlHost: getUrlHost(config.cloud.baseUrl),
        status: response.status || 200,
        durationMs: nowMs() - providerStartMs,
        outputCount: outputs.length
      }
    })

    return {
      ok: true,
      requestId,
      backend: 'cloud',
      model: config.cloud.model,
      generatedAt: now().toISOString(),
      outputs,
      usage: {
        estimatedCostUsd: 0
      }
    }
  }

  const generateLocalImage = async ({ config, prompt, targetDir, relativeDir, constraints, requestId }) => {
    const endpoint = assertLoopbackUrl(config.local.endpoint, 'Local endpoint URL')
    const providerStartMs = nowMs()
    const timeoutMs = config.local.timeoutMs
    recordLog({
      level: 'info',
      event: 'imageGeneration.provider.request.started',
      message: 'Local image provider request started',
      details: {
        requestId,
        backend: 'local',
        provider: 'local',
        model: config.local.model,
        baseUrlHost: getUrlHost(endpoint),
        width: constraints.width,
        height: constraints.height,
        requestedTransparent: Boolean(constraints.transparent),
        timeoutMs
      }
    })
    let response
    try {
      response = await fetchWithTimeout({
        fetchImpl,
        url: endpoint,
        timeoutMs,
        timeoutMessage: `Local image generation timed out after ${timeoutMs}ms`,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt,
            model: config.local.model,
            width: constraints.width,
            height: constraints.height,
            transparent: Boolean(constraints.transparent)
          })
        }
      })
    } catch (error) {
      recordLog({
        level: 'error',
        event: 'imageGeneration.provider.request.failed',
        message: 'Local image provider request failed',
        details: {
          requestId,
          backend: 'local',
          provider: 'local',
          model: config.local.model,
          baseUrlHost: getUrlHost(endpoint),
          durationMs: nowMs() - providerStartMs,
          timeoutMs,
          errorCode: /timed out/i.test(String(error?.message || '')) ? 'endpoint_timeout' : 'endpoint_request_error',
          errorMessage: String(error?.message || error).slice(0, 240)
        }
      })
      throw error
    }
    if (!response?.ok) {
      recordLog({
        level: 'error',
        event: 'imageGeneration.provider.request.failed',
        message: 'Local image provider request failed',
        details: {
          requestId,
          backend: 'local',
          provider: 'local',
          model: config.local.model,
          baseUrlHost: getUrlHost(endpoint),
          status: response?.status || 'error',
          durationMs: nowMs() - providerStartMs,
          timeoutMs,
          errorCode: 'endpoint_http_error',
          errorMessage: `Local image generation failed with HTTP ${response?.status || 'error'}`
        }
      })
      throw new Error(`Local image generation failed with HTTP ${response?.status || 'error'}`)
    }
    const body = await response.json()
    const items = Array.isArray(body?.outputs) ? body.outputs : []
    if (!items.length) {
      recordLog({
        level: 'error',
        event: 'imageGeneration.provider.request.failed',
        message: 'Local image provider returned no outputs',
        details: {
          requestId,
          backend: 'local',
          provider: 'local',
          model: config.local.model,
          baseUrlHost: getUrlHost(endpoint),
          status: response.status || 200,
          durationMs: nowMs() - providerStartMs,
          timeoutMs,
          outputCount: 0,
          errorCode: 'endpoint_invalid_response',
          errorMessage: 'Local image generation returned no outputs'
        }
      })
      throw new Error('Local image generation returned no outputs')
    }

    let outputs
    try {
      outputs = items.map((item, index) => {
        const bytes = decodeRequiredBase64Image({
          value: item?.b64,
          backend: 'Local',
          fieldName: 'b64'
        })
        const { outputPath, fileName } = writeOutputPng({ targetDir, index: index + 1, bytes })
        return {
          dataRelativePath: path.posix.join(relativeDir.replace(/\\/g, '/'), fileName),
          mimeType: 'image/png',
          sha256: sha256File(outputPath)
        }
      })
    } catch (error) {
      recordLog({
        level: 'error',
        event: 'imageGeneration.provider.request.failed',
        message: 'Local image provider returned invalid image bytes',
        details: {
          requestId,
          backend: 'local',
          provider: 'local',
          model: config.local.model,
          baseUrlHost: getUrlHost(endpoint),
          status: response.status || 200,
          durationMs: nowMs() - providerStartMs,
          timeoutMs,
          outputCount: 0,
          errorCode: 'endpoint_invalid_response',
          errorMessage: String(error?.message || error).slice(0, 240)
        }
      })
      throw error
    }

    recordLog({
      level: 'info',
      event: 'imageGeneration.provider.request.completed',
      message: 'Local image provider request completed',
      details: {
        requestId,
        backend: 'local',
        provider: 'local',
        model: config.local.model,
        baseUrlHost: getUrlHost(endpoint),
        status: response.status || 200,
        durationMs: nowMs() - providerStartMs,
        timeoutMs,
        outputCount: outputs.length
      }
    })

    return {
      ok: true,
      requestId,
      backend: 'local',
      model: config.local.model,
      generatedAt: now().toISOString(),
      outputs,
      usage: {
        estimatedCostUsd: 0
      }
    }
  }

  const generateImage = async ({ backend, prompt, output, constraints }) => {
    const config = getStoredConfig()
    const selectedBackend = backend || config.defaultBackend
    const requestId = idFactory()
    const startedMs = nowMs()
    const { relativeDir, targetDir } = ensureInsideDataDir({
      dataDir: output?.dataDir,
      dataRelativeDir: output?.dataRelativeDir
    })
    const model = selectedBackend === 'cloud'
      ? config.cloud.model
      : selectedBackend === 'local'
        ? config.local.model
        : 'fixture-image'

    recordLog({
      level: 'info',
      event: 'imageGeneration.request.started',
      message: 'Image generation request started',
      details: {
        requestId,
        backend: selectedBackend,
        model,
        width: constraints?.width,
        height: constraints?.height,
        requestedTransparent: Boolean(constraints?.transparent)
      }
    })

    try {
      let result
      if (selectedBackend === 'fixture') {
        result = generateFixtureImage({ targetDir, relativeDir, requestId })
      } else if (selectedBackend === 'cloud') {
        result = await generateCloudImage({ config, prompt, targetDir, relativeDir, constraints, requestId })
      } else if (selectedBackend === 'local') {
        result = await generateLocalImage({ config, prompt, targetDir, relativeDir, constraints, requestId })
      } else {
        throw new Error(`Unsupported image generation backend: ${selectedBackend}`)
      }
      recordLog({
        level: 'info',
        event: 'imageGeneration.request.completed',
        message: 'Image generation request completed',
        details: {
          requestId,
          backend: selectedBackend,
          model,
          durationMs: nowMs() - startedMs,
          outputCount: result.outputs?.length || 0
        }
      })
      return result
    } catch (error) {
      recordLog({
        level: 'error',
        event: 'imageGeneration.request.failed',
        message: 'Image generation request failed',
        details: {
          requestId,
          backend: selectedBackend,
          model,
          durationMs: nowMs() - startedMs,
          errorMessage: String(error?.message || error).slice(0, 240)
        }
      })
      throw error
    }
  }

  return {
    getConfig,
    saveConfig,
    saveCloudApiKey,
    clearCloudApiKey,
    checkHealth,
    generateImage
  }
}

module.exports = {
  DEFAULT_IMAGE_GENERATION_MODEL_CONFIG: DEFAULT_CONFIG,
  createImageGenerationModelService
}
