const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const DEFAULT_CONFIG = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-image-2',
  apiKeyRef: 'secret:model.image.openai.apiKey',
  organization: '',
  project: '',
  timeoutMs: 120000,
  maxConcurrentJobs: 1
}

const PROVIDER_GENERATION_TIMEOUT_MS = 120000

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const normalizeBaseUrl = (value, fallback) => String(value || fallback || '').trim().replace(/\/+$/, '')

const normalizeImageApiKeyRef = (value, fallback = DEFAULT_CONFIG.apiKeyRef) => {
  const candidate = String(value || '').trim()
  if (/^secret:model\.image\.[A-Za-z0-9._:-]+$/.test(candidate)) return candidate
  return fallback
}

const hasLegacyProviderConfig = (config = {}) => (
  Object.hasOwn(config, 'defaultBackend') ||
  isPlainObject(config.cloud) ||
  isPlainObject(config.local)
)

const flatConfigLooksDefault = (config = {}) => (
  String(config?.provider || DEFAULT_CONFIG.provider).trim() === DEFAULT_CONFIG.provider &&
  normalizeBaseUrl(config?.baseUrl, DEFAULT_CONFIG.baseUrl) === DEFAULT_CONFIG.baseUrl &&
  String(config?.model || DEFAULT_CONFIG.model).trim() === DEFAULT_CONFIG.model &&
  normalizeImageApiKeyRef(config?.apiKeyRef) === DEFAULT_CONFIG.apiKeyRef &&
  Number(config?.timeoutMs ?? DEFAULT_CONFIG.timeoutMs) === DEFAULT_CONFIG.timeoutMs &&
  Number(config?.maxConcurrentJobs ?? DEFAULT_CONFIG.maxConcurrentJobs) === DEFAULT_CONFIG.maxConcurrentJobs
)

const pickLegacyProviderConfig = (config = {}) => {
  const legacyBackend = ['cloud', 'local'].includes(config?.defaultBackend) ? config.defaultBackend : 'cloud'
  const legacyCloud = isPlainObject(config.cloud) ? config.cloud : {}
  const legacyLocal = isPlainObject(config.local) ? config.local : {}
  if (legacyBackend === 'local') {
    return {
      provider: legacyLocal.provider || 'openai-compatible',
      baseUrl: legacyLocal.baseUrl || legacyLocal.endpoint || DEFAULT_CONFIG.baseUrl,
      model: legacyLocal.model || DEFAULT_CONFIG.model,
      apiKeyRef: normalizeImageApiKeyRef(legacyLocal.apiKeyRef || legacyCloud.apiKeyRef),
      organization: legacyLocal.organization || legacyCloud.organization || '',
      project: legacyLocal.project || legacyCloud.project || '',
      timeoutMs: legacyLocal.timeoutMs,
      maxConcurrentJobs: legacyLocal.maxConcurrentJobs
    }
  }
  return {
    provider: legacyCloud.provider || 'openai-compatible',
    baseUrl: legacyCloud.baseUrl || DEFAULT_CONFIG.baseUrl,
    model: legacyCloud.model || DEFAULT_CONFIG.model,
    apiKeyRef: normalizeImageApiKeyRef(legacyCloud.apiKeyRef),
    organization: legacyCloud.organization || '',
    project: legacyCloud.project || '',
    timeoutMs: legacyCloud.timeoutMs || config.timeoutMs,
    maxConcurrentJobs: legacyCloud.maxConcurrentJobs || config.maxConcurrentJobs
  }
}

const normalizeConfig = (config = {}) => {
  const legacy = pickLegacyProviderConfig(config)
  const preferLegacy = hasLegacyProviderConfig(config) && flatConfigLooksDefault(config)
  return {
    ...DEFAULT_CONFIG,
    provider: String(preferLegacy ? legacy.provider : (config?.provider || legacy.provider || DEFAULT_CONFIG.provider)).trim() || DEFAULT_CONFIG.provider,
    baseUrl: normalizeBaseUrl(preferLegacy ? legacy.baseUrl : (config?.baseUrl || legacy.baseUrl), DEFAULT_CONFIG.baseUrl),
    model: String(preferLegacy ? legacy.model : (config?.model || legacy.model || DEFAULT_CONFIG.model)).trim() || DEFAULT_CONFIG.model,
    apiKeyRef: normalizeImageApiKeyRef(preferLegacy ? legacy.apiKeyRef : (config?.apiKeyRef || legacy.apiKeyRef)),
    organization: String(config?.organization || legacy.organization || '').trim(),
    project: String(config?.project || legacy.project || '').trim(),
    timeoutMs: Math.max(1000, Number(preferLegacy ? legacy.timeoutMs : (config?.timeoutMs ?? legacy.timeoutMs ?? DEFAULT_CONFIG.timeoutMs)) || DEFAULT_CONFIG.timeoutMs),
    maxConcurrentJobs: Math.max(1, Number(preferLegacy ? legacy.maxConcurrentJobs : (config?.maxConcurrentJobs ?? legacy.maxConcurrentJobs ?? DEFAULT_CONFIG.maxConcurrentJobs)) || DEFAULT_CONFIG.maxConcurrentJobs)
  }
}

const toPersistedConfig = (config = {}) => {
  const normalized = normalizeConfig(config)
  return {
    provider: normalized.provider,
    baseUrl: normalized.baseUrl,
    model: normalized.model,
    apiKeyRef: normalized.apiKeyRef,
    organization: normalized.organization,
    project: normalized.project,
    timeoutMs: normalized.timeoutMs,
    maxConcurrentJobs: normalized.maxConcurrentJobs
  }
}

const maskSecret = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  return `••••${text.slice(-4)}`
}

const assertProviderBaseUrl = (value) => {
  let parsed
  try {
    parsed = new URL(String(value || ''))
  } catch (_) {
    throw new Error('Image Provider Base URL must be a valid URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Image Provider Base URL must use HTTP or HTTPS')
  }
  if (parsed.username || parsed.password) {
    throw new Error('Image Provider Base URL must not include credentials')
  }
  if (parsed.search || parsed.hash) {
    throw new Error('Image Provider Base URL must not include query or hash')
  }
  return parsed.toString().replace(/\/+$/, '')
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

const decodeRequiredBase64Image = ({ value, fieldName }) => {
  const encoded = String(value || '').trim()
  if (!encoded) {
    throw new Error(`Image Provider returned an output with missing image bytes (${fieldName})`)
  }
  const bytes = Buffer.from(encoded, 'base64')
  if (!bytes.length) {
    throw new Error(`Image Provider returned an output with missing image bytes (${fieldName})`)
  }
  return bytes
}

const isAbortError = (error) => (
  error?.name === 'AbortError' ||
  error?.code === 'ABORT_ERR'
)

const normalizeTimeoutMs = (value, fallback) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback
}

const fetchWithTimeout = async ({
  fetchImpl,
  url,
  options = {},
  timeoutMs,
  timeoutMessage
}) => {
  const controller = new AbortController()
  const effectiveTimeoutMs = normalizeTimeoutMs(timeoutMs, PROVIDER_GENERATION_TIMEOUT_MS)
  let timeoutHandle = null
  try {
    return await Promise.race([
      fetchImpl(url, {
        ...options,
        signal: controller.signal
      }),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          controller.abort(new Error(timeoutMessage))
          reject(new Error(timeoutMessage))
        }, effectiveTimeoutMs)
      })
    ])
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      throw new Error(timeoutMessage)
    }
    throw error
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
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

const extractProviderBusinessError = (body) => {
  if (!isPlainObject(body)) return ''
  if (Array.isArray(body.data)) return ''
  const message = String(body.error?.message || body.message || body.msg || '').trim()
  if (!message) return ''
  return message.slice(0, 240)
}

const isOptionalModelsProbeStatus = (status) => [404, 405, 501].includes(Number(status))

const extractDiscoveredModels = (body) => {
  const source = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.models)
      ? body.models
      : []
  const models = []
  for (const entry of source) {
    const modelId = typeof entry === 'string'
      ? entry.trim()
      : String(entry?.id || '').trim()
    if (!modelId || models.includes(modelId)) continue
    models.push(modelId)
  }
  return models
}

const getImageMimeType = (filePath) => {
  const extension = path.extname(String(filePath || '')).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.gif') return 'image/gif'
  return 'image/png'
}

const createSafeReferenceRelativePath = (value) => {
  const normalized = String(value || '').trim().replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || normalized.includes('../')) return ''
  return normalized
}

const normalizeReferenceImages = (referenceImages = []) => {
  if (!Array.isArray(referenceImages)) return []
  return referenceImages
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null
      const sourcePath = path.resolve(String(entry.path || '').trim())
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        throw new Error(`Reference image ${index + 1} does not exist`)
      }
      const stat = fs.statSync(sourcePath)
      if (!stat.isFile()) {
        throw new Error(`Reference image ${index + 1} must be a file`)
      }
      const fileName = String(entry.fileName || path.basename(sourcePath) || `reference-${index + 1}.png`).trim() || `reference-${index + 1}.png`
      const mimeType = String(entry.mimeType || getImageMimeType(sourcePath)).trim() || 'image/png'
      const bytes = fs.readFileSync(sourcePath)
      return {
        path: sourcePath,
        fileName,
        mimeType,
        byteLength: bytes.length,
        sha256: String(entry.sha256 || sha256File(sourcePath)).trim() || sha256File(sourcePath),
        relativePath: createSafeReferenceRelativePath(entry.relativePath),
        metadataRelativePath: createSafeReferenceRelativePath(entry.metadataRelativePath),
        role: String(entry.role || 'reference-image').trim() || 'reference-image',
        bytes
      }
    })
    .filter(Boolean)
}

const buildProviderGenerationPayload = ({ model, prompt, constraints }) => {
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

const buildProviderEditFormData = ({ model, prompt, constraints, referenceImages = [] }) => {
  const form = new FormData()
  const imageField = referenceImages.length > 1 ? 'image[]' : 'image'
  for (const referenceImage of referenceImages) {
    form.append(
      imageField,
      new Blob([referenceImage.bytes], { type: referenceImage.mimeType }),
      referenceImage.fileName
    )
  }
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('size', `${constraints.width}x${constraints.height}`)
  if (model !== 'gpt-image-2') {
    form.append('background', constraints.transparent ? 'transparent' : 'white')
    form.append('response_format', 'b64_json')
  }
  return form
}

const getProviderGenerationBackgroundMode = ({ model, constraints }) => {
  if (model === 'gpt-image-2') return 'omitted'
  return constraints.transparent ? 'transparent' : 'white'
}

const createConditioningSummary = ({
  endpoint,
  referenceImages = [],
  constraints,
  model
}) => ({
  mode: referenceImages.length > 0 ? 'image-edit' : 'text-to-image',
  endpoint,
  referenceImageCount: referenceImages.length,
  requestedTransparent: Boolean(constraints?.transparent),
  size: `${constraints?.width || 0}x${constraints?.height || 0}`,
  references: referenceImages.map((referenceImage) => ({
    fileName: referenceImage.fileName,
    mimeType: referenceImage.mimeType,
    sha256: referenceImage.sha256,
    byteLength: referenceImage.byteLength,
    relativePath: referenceImage.relativePath,
    metadataRelativePath: referenceImage.metadataRelativePath,
    role: referenceImage.role
  })),
  model: String(model || '')
})

const createImageGenerationModelService = ({
  settingsService,
  secretService,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  nowMs = () => Date.now(),
  appLogService,
  idFactory = () => crypto.randomUUID(),
  providerGenerationTimeoutMs,
  cloudGenerationTimeoutMs
} = {}) => {
  if (!settingsService) throw new Error('settingsService is required')
  if (!secretService) throw new Error('secretService is required')

  let activeProviderJobs = 0
  const queuedProviderJobs = []

  const getStoredConfig = () => normalizeConfig(settingsService.get().models?.imageGeneration)
  const getProviderTimeoutMs = (config) => Math.max(1, Number(cloudGenerationTimeoutMs ?? providerGenerationTimeoutMs ?? config.timeoutMs ?? PROVIDER_GENERATION_TIMEOUT_MS) || PROVIDER_GENERATION_TIMEOUT_MS)

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

  const createProviderJobRelease = () => {
    let released = false
    return () => {
      if (released) return
      released = true
      activeProviderJobs = Math.max(0, activeProviderJobs - 1)
      drainProviderQueue()
    }
  }

  const getMaxConcurrentJobs = (config) => Math.max(1, Number(config?.maxConcurrentJobs ?? DEFAULT_CONFIG.maxConcurrentJobs) || DEFAULT_CONFIG.maxConcurrentJobs)

  function drainProviderQueue () {
    while (queuedProviderJobs.length) {
      const next = queuedProviderJobs[0]
      if (activeProviderJobs >= next.maxConcurrentJobs) return
      queuedProviderJobs.shift()
      activeProviderJobs += 1
      next.resolve(createProviderJobRelease())
    }
  }

  const acquireProviderJobSlot = async ({ config, requestId }) => {
    const maxConcurrentJobs = getMaxConcurrentJobs(config)
    if (!queuedProviderJobs.length && activeProviderJobs < maxConcurrentJobs) {
      activeProviderJobs += 1
      return createProviderJobRelease()
    }

    const queuedAtMs = nowMs()
    recordLog({
      level: 'info',
      event: 'imageGeneration.provider.queue.waiting',
      message: 'Image Provider request is waiting for a concurrency slot',
      details: {
        requestId,
        provider: config.provider,
        model: config.model,
        activeProviderJobs,
        queuedProviderJobs: queuedProviderJobs.length + 1,
        maxConcurrentJobs
      }
    })

    return await new Promise((resolve) => {
      queuedProviderJobs.push({
        maxConcurrentJobs,
        resolve: (release) => {
          recordLog({
            level: 'info',
            event: 'imageGeneration.provider.queue.acquired',
            message: 'Image Provider request acquired a concurrency slot',
            details: {
              requestId,
              provider: config.provider,
              model: config.model,
              waitMs: nowMs() - queuedAtMs,
              activeProviderJobs,
              queuedProviderJobs: queuedProviderJobs.length,
              maxConcurrentJobs
            }
          })
          resolve(release)
        }
      })
      drainProviderQueue()
    })
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
    const secretValue = secretService.getSecretValue(config.apiKeyRef)
    return {
      ...config,
      hasApiKey: Boolean(secretValue),
      apiKeyPreview: maskSecret(secretValue),
      apiKeyLabel: 'Image API Key'
    }
  }

  const saveConfig = (partialConfig = {}) => {
    const current = getStoredConfig()
    const next = toPersistedConfig({
      ...current,
      ...(isPlainObject(partialConfig) ? partialConfig : {}),
      apiKeyRef: current.apiKeyRef
    })
    next.baseUrl = assertProviderBaseUrl(next.baseUrl)
    saveStoredConfig(next)
    return getConfig()
  }

  const saveProviderApiKey = (apiKey) => {
    const config = getStoredConfig()
    secretService.setSecret({
      id: config.apiKeyRef,
      value: String(apiKey || ''),
      label: 'Image API Key'
    })
    const saved = getConfig()
    return {
      apiKeyRef: saved.apiKeyRef,
      hasApiKey: saved.hasApiKey,
      apiKeyPreview: saved.apiKeyPreview
    }
  }

  const clearProviderApiKey = () => {
    const config = getStoredConfig()
    secretService.deleteSecret(config.apiKeyRef)
    return {
      apiKeyRef: config.apiKeyRef,
      hasApiKey: false,
      apiKeyPreview: ''
    }
  }

  const checkHealth = async (options = {}) => {
    const config = getStoredConfig()
    const requestId = idFactory()
    const startedMs = nowMs()
    const timeoutMs = normalizeTimeoutMs(options?.timeoutMs, getProviderTimeoutMs(config))
    recordLog({
      level: 'info',
      event: 'imageGeneration.health.started',
      message: 'Image Provider health check started',
      details: {
        requestId,
        provider: config.provider,
        model: config.model,
        baseUrlHost: getUrlHost(config.baseUrl),
        timeoutMs
      }
    })

    const completeHealth = (result, extraDetails = {}) => {
      recordLog({
        level: result.ok ? 'info' : 'error',
        event: result.ok ? 'imageGeneration.health.completed' : 'imageGeneration.health.failed',
        message: result.ok ? 'Image Provider health check completed' : 'Image Provider health check failed',
        details: {
          requestId,
          provider: config.provider,
          model: config.model,
          baseUrlHost: getUrlHost(config.baseUrl),
          durationMs: nowMs() - startedMs,
          errorCode: result.ok ? '' : result.code,
          timeoutMs,
          ...extraDetails
        }
      })
      return result
    }

    try {
      const baseUrl = assertProviderBaseUrl(config.baseUrl)
      const apiKey = secretService.getSecretValue(config.apiKeyRef)
      if (!apiKey) {
        return completeHealth({ ok: false, provider: config.provider, code: 'missing_api_key', message: 'Image generation API key is missing' })
      }
      const response = await fetchWithTimeout({
        fetchImpl,
        url: `${baseUrl}/models`,
        timeoutMs,
        timeoutMessage: `Image Provider health check timed out after ${timeoutMs}ms`,
        options: {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        }
      })
      const status = response?.status || 'error'
      if (!response?.ok) {
        if (isOptionalModelsProbeStatus(status)) {
          return completeHealth(
            {
              ok: true,
              provider: config.provider,
              code: 'provider_reachable_models_unavailable',
              message: 'Image Provider is reachable, but the optional /models probe is unavailable',
              modelsProbe: 'unavailable',
              availableModels: [],
              currentModelDiscovered: false
            },
            { status, modelsProbe: 'unavailable' }
          )
        }
        return completeHealth(
          {
            ok: false,
            provider: config.provider,
            code: 'provider_unhealthy',
            message: `Image Provider responded with HTTP ${status}`,
            modelsProbe: 'failed',
            availableModels: [],
            currentModelDiscovered: false
          },
          { status, modelsProbe: 'failed' }
        )
      }
      let body = {}
      try {
        body = await response.json()
      } catch (_) {}
      const availableModels = extractDiscoveredModels(body)
      return completeHealth(
        {
          ok: true,
          provider: config.provider,
          code: 'provider_healthy',
          message: 'Image Provider is reachable',
          modelsProbe: 'ok',
          availableModels,
          currentModelDiscovered: availableModels.includes(config.model)
        },
        { status, modelsProbe: 'ok', discoveredModelCount: availableModels.length }
      )
    } catch (error) {
      const errorMessage = String(error?.message || error).slice(0, 240)
      const isTimeout = /health check timed out/i.test(errorMessage)
      return completeHealth(
        {
          ok: false,
          provider: config.provider,
          code: isTimeout ? 'health_check_timeout' : 'health_check_error',
          message: errorMessage,
          modelsProbe: isTimeout ? 'timed_out' : 'failed',
          availableModels: [],
          currentModelDiscovered: false
        },
        {
          modelsProbe: isTimeout ? 'timed_out' : 'failed',
          errorMessage
        }
      )
    }
  }

  const discoverModels = async () => {
    const config = getStoredConfig()
    const requestId = idFactory()
    const startedMs = nowMs()
    const baseUrl = assertProviderBaseUrl(config.baseUrl)
    recordLog({
      level: 'info',
      event: 'imageGeneration.models.started',
      message: 'Image Provider model discovery started',
      details: {
        requestId,
        provider: config.provider,
        model: config.model,
        baseUrlHost: getUrlHost(baseUrl)
      }
    })

    const completeDiscovery = (result, extraDetails = {}) => {
      recordLog({
        level: result.ok ? 'info' : 'error',
        event: result.ok ? 'imageGeneration.models.completed' : 'imageGeneration.models.failed',
        message: result.ok ? 'Image Provider model discovery completed' : 'Image Provider model discovery failed',
        details: {
          requestId,
          provider: config.provider,
          model: config.model,
          baseUrlHost: getUrlHost(baseUrl),
          durationMs: nowMs() - startedMs,
          errorCode: result.ok ? '' : result.code,
          modelCount: Array.isArray(result.models) ? result.models.length : 0,
          ...extraDetails
        }
      })
      return result
    }

    try {
      const apiKey = secretService.getSecretValue(config.apiKeyRef)
      const baseResult = {
        provider: config.provider,
        baseUrl,
        model: config.model,
        hasApiKey: Boolean(apiKey)
      }
      if (!apiKey) {
        return completeDiscovery({
          ok: false,
          ...baseResult,
          models: [],
          code: 'missing_api_key',
          message: 'Image generation API key is missing'
        })
      }
      const response = await fetchImpl(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      })
      const status = response?.status || 'error'
      const body = response?.json ? await response.json().catch(() => ({})) : {}
      if (!response?.ok) {
        if (isOptionalModelsProbeStatus(status)) {
          return completeDiscovery(
            {
              ok: true,
              ...baseResult,
              models: [],
              code: 'provider_reachable_models_unavailable',
              message: 'Image Provider is reachable, but the optional /models probe is unavailable'
            },
            { status, modelsProbe: 'unavailable' }
          )
        }
        return completeDiscovery(
          {
            ok: false,
            ...baseResult,
            models: [],
            code: 'provider_unhealthy',
            message: `Image Provider responded with HTTP ${status}`
          },
          { status, modelsProbe: 'failed', providerMessage: extractProviderBusinessError(body) }
        )
      }
      return completeDiscovery(
        {
          ok: true,
          ...baseResult,
          models: extractDiscoveredModels(body),
          code: 'ok',
          message: 'Image Provider model discovery succeeded'
        },
        { status, modelsProbe: 'ok' }
      )
    } catch (error) {
      recordLog({
        level: 'error',
        event: 'imageGeneration.models.failed',
        message: 'Image Provider model discovery failed',
        details: {
          requestId,
          provider: config.provider,
          model: config.model,
          baseUrlHost: getUrlHost(baseUrl),
          durationMs: nowMs() - startedMs,
          errorCode: 'model_discovery_error',
          errorMessage: String(error?.message || error).slice(0, 240)
        }
      })
      throw error
    }
  }

  const generateProviderImage = async ({ config, prompt, targetDir, relativeDir, constraints, requestId, timeoutMs: timeoutOverrideMs, referenceImages = [] }) => {
    const apiKey = secretService.getSecretValue(config.apiKeyRef)
    if (!apiKey) throw new Error('Image generation API key is missing')
    const baseUrl = assertProviderBaseUrl(config.baseUrl)
    const providerStartMs = nowMs()
    const timeoutMs = normalizeTimeoutMs(timeoutOverrideMs, getProviderTimeoutMs(config))
    const backgroundMode = getProviderGenerationBackgroundMode({ model: config.model, constraints })
    const normalizedReferenceImages = normalizeReferenceImages(referenceImages)
    const endpoint = normalizedReferenceImages.length > 0 ? '/images/edits' : '/images/generations'
    const conditioning = createConditioningSummary({
      endpoint,
      referenceImages: normalizedReferenceImages,
      constraints,
      model: config.model
    })
    recordLog({
      level: 'info',
      event: 'imageGeneration.provider.request.started',
      message: 'Image Provider request started',
      details: {
        requestId,
        provider: config.provider,
        model: config.model,
        baseUrlHost: getUrlHost(baseUrl),
        width: constraints.width,
        height: constraints.height,
        requestedTransparent: Boolean(constraints.transparent),
        backgroundMode,
        endpoint,
        requestMode: conditioning.mode,
        referenceImageCount: normalizedReferenceImages.length,
        timeoutMs
      }
    })
    let response
    try {
      const requestBody = normalizedReferenceImages.length > 0
        ? buildProviderEditFormData({
            model: config.model,
            prompt,
            constraints,
            referenceImages: normalizedReferenceImages
          })
        : JSON.stringify(buildProviderGenerationPayload({
            model: config.model,
            prompt,
            constraints
          }))
      const headers = normalizedReferenceImages.length > 0
        ? {
            Authorization: `Bearer ${apiKey}`
          }
        : {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
      response = await fetchWithTimeout({
        fetchImpl,
        url: `${baseUrl}${endpoint}`,
        timeoutMs,
        timeoutMessage: `Image Provider generation timed out after ${timeoutMs}ms`,
        options: {
          method: 'POST',
          headers,
          body: requestBody
        }
      })
    } catch (error) {
      recordLog({
        level: 'error',
        event: 'imageGeneration.provider.request.failed',
        message: 'Image Provider request failed',
        details: {
          requestId,
          provider: config.provider,
          model: config.model,
          baseUrlHost: getUrlHost(baseUrl),
          durationMs: nowMs() - providerStartMs,
          endpoint,
          requestMode: conditioning.mode,
          referenceImageCount: normalizedReferenceImages.length,
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
        message: 'Image Provider request failed',
        details: {
          requestId,
          provider: config.provider,
          model: config.model,
          baseUrlHost: getUrlHost(baseUrl),
          status,
          durationMs: nowMs() - providerStartMs,
          endpoint,
          requestMode: conditioning.mode,
          referenceImageCount: normalizedReferenceImages.length,
          errorCode: 'provider_http_error',
          errorMessage
        }
      })
      throw new Error(`Image Provider generation failed with HTTP ${status}`)
    }
    const body = await response.json()
    const items = Array.isArray(body?.data) ? body.data : []
    if (!items.length) {
      const businessError = extractProviderBusinessError(body)
      if (businessError) {
        recordLog({
          level: 'error',
          event: 'imageGeneration.provider.request.failed',
          message: 'Image Provider returned a business error',
          details: {
            requestId,
            provider: config.provider,
            model: config.model,
            baseUrlHost: getUrlHost(baseUrl),
            status: response.status || 200,
            durationMs: nowMs() - providerStartMs,
            endpoint,
            requestMode: conditioning.mode,
            referenceImageCount: normalizedReferenceImages.length,
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
        message: 'Image Provider returned no outputs',
        details: {
          requestId,
          provider: config.provider,
          model: config.model,
          baseUrlHost: getUrlHost(baseUrl),
          status: response.status || 200,
          durationMs: nowMs() - providerStartMs,
          endpoint,
          requestMode: conditioning.mode,
          referenceImageCount: normalizedReferenceImages.length,
          outputCount: 0,
          errorCode: 'provider_invalid_response',
          errorMessage: 'Image Provider generation returned no outputs'
        }
      })
      throw new Error('Image Provider generation returned no outputs')
    }

    let outputs
    try {
      outputs = items.map((item, index) => {
        const bytes = decodeRequiredBase64Image({
          value: item?.b64_json,
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
        message: 'Image Provider returned invalid image bytes',
        details: {
          requestId,
          provider: config.provider,
          model: config.model,
          baseUrlHost: getUrlHost(baseUrl),
          status: response.status || 200,
          durationMs: nowMs() - providerStartMs,
          endpoint,
          requestMode: conditioning.mode,
          referenceImageCount: normalizedReferenceImages.length,
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
      message: 'Image Provider request completed',
      details: {
        requestId,
        provider: config.provider,
        model: config.model,
        baseUrlHost: getUrlHost(baseUrl),
        status: response.status || 200,
        durationMs: nowMs() - providerStartMs,
        endpoint,
        requestMode: conditioning.mode,
        referenceImageCount: normalizedReferenceImages.length,
        outputCount: outputs.length
      }
    })

    return {
      ok: true,
      requestId,
      provider: config.provider,
      model: config.model,
      generatedAt: now().toISOString(),
      conditioning,
      outputs,
      usage: {
        estimatedCostUsd: 0
      }
    }
  }

  const generateImage = async ({ prompt, output, constraints, timeoutMs, referenceImages = [] }) => {
    const config = getStoredConfig()
    const requestId = idFactory()
    const startedMs = nowMs()
    const { relativeDir, targetDir } = ensureInsideDataDir({
      dataDir: output?.dataDir,
      dataRelativeDir: output?.dataRelativeDir
    })

    recordLog({
      level: 'info',
      event: 'imageGeneration.request.started',
      message: 'Image generation request started',
      details: {
        requestId,
        provider: config.provider,
        model: config.model,
        width: constraints?.width,
        height: constraints?.height,
        requestedTransparent: Boolean(constraints?.transparent),
        referenceImageCount: Array.isArray(referenceImages) ? referenceImages.length : 0
      }
    })

    let releaseProviderJobSlot = null
    try {
      releaseProviderJobSlot = await acquireProviderJobSlot({ config, requestId })
      const result = await generateProviderImage({
        config,
        prompt,
        targetDir,
        relativeDir,
        constraints,
        requestId,
        timeoutMs,
        referenceImages
      })
      recordLog({
        level: 'info',
        event: 'imageGeneration.request.completed',
        message: 'Image generation request completed',
        details: {
          requestId,
          provider: config.provider,
          model: config.model,
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
          provider: config.provider,
          model: config.model,
          durationMs: nowMs() - startedMs,
          errorMessage: String(error?.message || error).slice(0, 240)
        }
      })
      throw error
    } finally {
      releaseProviderJobSlot?.()
    }
  }

  return {
    getConfig,
    saveConfig,
    saveProviderApiKey,
    clearProviderApiKey,
    checkHealth,
    discoverModels,
    generateImage
  }
}

module.exports = {
  DEFAULT_IMAGE_GENERATION_MODEL_CONFIG: DEFAULT_CONFIG,
  createImageGenerationModelService
}
