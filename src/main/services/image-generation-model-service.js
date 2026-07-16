const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { sanitizeLogText } = require('./log-safety')
const {
  createSavedProviderModelCatalog,
  getScopedProviderModelCatalog,
  uniqueModelIds
} = require('./provider-model-catalog')
const {
  assertProviderConfigPayload,
  assertProviderBaseUrl,
  createProviderOperationDetails,
  findOwnerFieldOverrides,
  getCapabilitySecretRef,
  sanitizeProviderBaseUrlForDisplay,
  validateProviderConfigInput
} = require('./provider-owner-policy')

const DEFAULT_CONFIG = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-image-2',
  apiKeyRef: getCapabilitySecretRef('image'),
  organization: '',
  project: '',
  timeoutMs: 120000,
  maxConcurrentJobs: 1
}

const PROVIDER_GENERATION_TIMEOUT_MS = 120000
const DEFAULT_GPT_IMAGE_2_QUALITY = 'high'
const REQUESTED_PROVIDER_OUTPUT_COUNT = 1
const VERIFIED_CREATOR_WORKFLOW_IMAGE_MODELS = Object.freeze(['gpt-image-2'])

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const normalizeBaseUrl = (value, fallback) => String(value || fallback || '').trim().replace(/\/+$/, '')

const hasLegacyProviderConfig = (config = {}) => (
  Object.hasOwn(config, 'defaultBackend') ||
  isPlainObject(config.cloud) ||
  isPlainObject(config.local)
)

const flatConfigLooksDefault = (config = {}) => (
  String(config?.provider || DEFAULT_CONFIG.provider).trim() === DEFAULT_CONFIG.provider &&
  normalizeBaseUrl(config?.baseUrl, DEFAULT_CONFIG.baseUrl) === DEFAULT_CONFIG.baseUrl &&
  String(config?.model || DEFAULT_CONFIG.model).trim() === DEFAULT_CONFIG.model &&
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
    apiKeyRef: DEFAULT_CONFIG.apiKeyRef,
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

const resolveImageRuntimeConfig = (config = {}) => ({
  ...config,
  ...validateProviderConfigInput({
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    label: 'Image',
    allowedProviders: ['openai-compatible', 'openai']
  }),
  apiKeyRef: DEFAULT_CONFIG.apiKeyRef
})

const maskSecret = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  return `••••${text.slice(-4)}`
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

const getSafeTransportCauseCode = (error) => String(
  error?.cause?.code || error?.code || ''
).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80)

const normalizeTimeoutMs = (value, fallback) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback
}

const normalizeProviderQuality = (value, fallback = '') => {
  const normalized = String(value || '').trim().toLowerCase()
  if (['low', 'medium', 'high', 'auto'].includes(normalized)) return normalized
  return fallback
}

const getProviderImageQuality = ({ model, constraints = {} }) => {
  const explicit = normalizeProviderQuality(constraints.quality)
  if (explicit) return explicit
  return model === 'gpt-image-2' ? DEFAULT_GPT_IMAGE_2_QUALITY : ''
}

const fetchWithTimeout = async ({
  fetchImpl,
  url,
  options = {},
  timeoutMs,
  timeoutMessage,
  consumeResponse = async (response) => response
}) => {
  const controller = new AbortController()
  const effectiveTimeoutMs = normalizeTimeoutMs(timeoutMs, PROVIDER_GENERATION_TIMEOUT_MS)
  let timeoutHandle = null
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, {
          ...options,
          signal: controller.signal
        })
        return await consumeResponse(response, controller.signal)
      })(),
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

const readOptionalJsonResponse = async (response, signal) => {
  if (!response?.ok || typeof response.json !== 'function') return {}
  try {
    return await response.json()
  } catch (error) {
    if (signal?.aborted) throw error
    return {}
  }
}

const getUrlHost = (value) => {
  try {
    return new URL(String(value || '')).host
  } catch (_) {
    return ''
  }
}

const sanitizeModelId = (value) => String(value || '')
  .replace(/[\u0000-\u001F\u007F]/g, '')
  .trim()

const isVerifiedCreatorWorkflowImageModel = (value) => VERIFIED_CREATOR_WORKFLOW_IMAGE_MODELS
  .includes(sanitizeModelId(value))

const createCreatorWorkflowModelPolicy = ({ config = {}, storedState = {} }) => {
  const catalog = getScopedProviderModelCatalog({
    capability: 'image',
    provider: config.provider,
    baseUrl: config.baseUrl,
    catalog: storedState.modelCatalog
  })
  const discoveredModels = Array.isArray(catalog?.models)
    ? uniqueModelIds(catalog.models.map(sanitizeModelId).filter(Boolean))
    : []
  const preferredModel = sanitizeModelId(config.model)
  const verifiedModels = uniqueModelIds([
    ...(isVerifiedCreatorWorkflowImageModel(preferredModel) ? [preferredModel] : []),
    ...discoveredModels.filter(isVerifiedCreatorWorkflowImageModel)
  ])
  return {
    evidenceScope: 'creator-one-click-default',
    preferredModel,
    verifiedModels,
    fallbackModels: verifiedModels.filter((modelId) => modelId !== preferredModel),
    discoveredModels,
    preferredModelVerified: isVerifiedCreatorWorkflowImageModel(preferredModel)
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

const extractDiscoveredModels = (body, { secrets = [] } = {}) => {
  const source = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.models)
      ? body.models
      : []
  return uniqueModelIds(
    source.map((entry) => (typeof entry === 'string' ? entry : entry?.id)),
    { secrets, sort: false }
  )
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

const createReferenceContractError = (code, message) => {
  const error = new Error(message)
  error.code = code
  return error
}

const assertExactlyOneReferenceImage = (referenceImages) => {
  if (!Array.isArray(referenceImages) || referenceImages.length === 0) {
    throw createReferenceContractError(
      'reference_image_required',
      'Image generation requires exactly one reference image'
    )
  }
  if (referenceImages.length !== 1) {
    throw createReferenceContractError(
      'reference_image_count_invalid',
      'Image generation requires exactly one reference image; compose multiple sources into one local reference image'
    )
  }
}

const normalizeReferenceImages = (referenceImages = [], { dataDir } = {}) => {
  assertExactlyOneReferenceImage(referenceImages)
  const rawDataDir = String(dataDir || '').trim()
  if (!rawDataDir) {
    throw createReferenceContractError(
      'reference_image_unusable',
      'Reference image data directory is unavailable'
    )
  }
  const root = path.resolve(rawDataDir)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw createReferenceContractError(
      'reference_image_unusable',
      'Reference image data directory is unavailable'
    )
  }
  const realRoot = fs.realpathSync.native(root)
  return referenceImages
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw createReferenceContractError(
          'reference_image_invalid',
          `Reference image ${index + 1} must be an object`
        )
      }
      const rawSourcePath = String(entry.path || '').trim()
      if (!rawSourcePath) {
        throw createReferenceContractError(
          'reference_image_invalid',
          `Reference image ${index + 1} path is required`
        )
      }
      const sourcePath = path.resolve(rawSourcePath)
      if (!fs.existsSync(sourcePath)) {
        throw createReferenceContractError(
          'reference_image_unusable',
          `Reference image ${index + 1} does not exist`
        )
      }
      if (fs.lstatSync(sourcePath).isSymbolicLink()) {
        throw createReferenceContractError(
          'reference_image_unusable',
          `Reference image ${index + 1} must not be a symbolic link`
        )
      }
      const stat = fs.statSync(sourcePath)
      if (!stat.isFile()) {
        throw createReferenceContractError(
          'reference_image_unusable',
          `Reference image ${index + 1} must be a regular file`
        )
      }
      const realSourcePath = fs.realpathSync.native(sourcePath)
      const relativeToRoot = path.relative(realRoot, realSourcePath)
      if (!relativeToRoot || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
        throw createReferenceContractError(
          'reference_image_unusable',
          `Reference image ${index + 1} must stay inside the allowed data directory`
        )
      }
      const fileName = String(entry.fileName || path.basename(sourcePath) || `reference-${index + 1}.png`).trim() || `reference-${index + 1}.png`
      const mimeType = String(entry.mimeType || getImageMimeType(sourcePath)).trim() || 'image/png'
      const bytes = fs.readFileSync(sourcePath)
      return {
        path: realSourcePath,
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
}

const createMultipartBoundary = () => `----OpenPetFormBoundary${crypto.randomBytes(12).toString('hex')}`

const sanitizeMultipartToken = (value, fallback) => {
  const normalized = String(value || '').replace(/[\r\n"]/g, '').trim()
  return normalized || fallback
}

const appendMultipartTextPart = (buffers, boundary, name, value) => {
  buffers.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${sanitizeMultipartToken(name, 'field')}"\r\n\r\n` +
    `${String(value)}\r\n`
  ))
}

const appendMultipartFilePart = (buffers, boundary, name, referenceImage) => {
  const fieldName = sanitizeMultipartToken(name, 'image')
  const fileName = sanitizeMultipartToken(referenceImage.fileName, 'reference.png')
  const mimeType = sanitizeMultipartToken(referenceImage.mimeType, 'application/octet-stream')
  buffers.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  ))
  buffers.push(referenceImage.bytes)
  buffers.push(Buffer.from('\r\n'))
}

const buildProviderEditMultipartRequest = ({ model, prompt, constraints, referenceImages = [] }) => {
  assertExactlyOneReferenceImage(referenceImages)
  const boundary = createMultipartBoundary()
  const buffers = []
  const quality = getProviderImageQuality({ model, constraints })
  appendMultipartFilePart(buffers, boundary, 'image', referenceImages[0])
  appendMultipartTextPart(buffers, boundary, 'model', model)
  appendMultipartTextPart(buffers, boundary, 'prompt', prompt)
  appendMultipartTextPart(buffers, boundary, 'size', `${constraints.width}x${constraints.height}`)
  appendMultipartTextPart(buffers, boundary, 'n', REQUESTED_PROVIDER_OUTPUT_COUNT)
  if (quality) appendMultipartTextPart(buffers, boundary, 'quality', quality)
  if (model !== 'gpt-image-2') {
    appendMultipartTextPart(buffers, boundary, 'background', constraints.transparent ? 'transparent' : 'white')
    appendMultipartTextPart(buffers, boundary, 'response_format', 'b64_json')
  }
  buffers.push(Buffer.from(`--${boundary}--\r\n`))
  const body = Buffer.concat(buffers)
  return {
    body,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.byteLength)
    }
  }
}

const getProviderGenerationBackgroundMode = ({ model, constraints }) => {
  if (model === 'gpt-image-2') return 'omitted'
  return constraints.transparent ? 'transparent' : 'white'
}

const normalizePromptCompilerEvidence = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const taskType = String(value.taskType || '').trim()
  const stage = String(value.stage || '').trim()
  const aspectRatio = String(value.aspectRatio || '').trim()
  return {
    promptCompilerVersion: Math.max(0, Number(value.promptCompilerVersion || value.version) || 0),
    taskType: /^[a-z][a-z-]{0,79}$/.test(taskType) ? taskType : '',
    stage: /^[a-z][a-z-]{0,79}$/.test(stage) ? stage : '',
    width: Math.max(0, Number(value.width) || 0),
    height: Math.max(0, Number(value.height) || 0),
    aspectRatio: /^\d+:\d+$/.test(aspectRatio) ? aspectRatio : '',
    referenceImageCount: Math.max(0, Number(value.referenceImageCount) || 0),
    requestedOutputCount: Math.max(0, Number(value.requestedOutputCount) || 0),
    promptSafety: String(value.promptSafety || '').trim()
  }
}

const createConditioningSummary = ({
  endpoint,
  referenceImages = [],
  constraints,
  model,
  promptCompiler = null
}) => ({
  mode: 'image-edit',
  endpoint,
  referenceImageCount: referenceImages.length,
  multipartImageField: 'image',
  requestedOutputCount: REQUESTED_PROVIDER_OUTPUT_COUNT,
  requestedTransparent: Boolean(constraints?.transparent),
  size: `${constraints?.width || 0}x${constraints?.height || 0}`,
  quality: getProviderImageQuality({ model, constraints }),
  ...(promptCompiler ? { promptCompiler } : {}),
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
  const getStoredImageGenerationState = () => (
    isPlainObject(settingsService.get().models?.imageGeneration)
      ? settingsService.get().models.imageGeneration
      : {}
  )
  const getModelCatalog = (config = getStoredConfig(), storedState = getStoredImageGenerationState()) => (
    getScopedProviderModelCatalog({
      capability: 'image',
      provider: config.provider,
      baseUrl: config.baseUrl,
      catalog: storedState.modelCatalog,
      secrets: [secretService.getSecretValue(config.apiKeyRef)]
    })
  )
  const getProviderTimeoutMs = (config) => Math.max(1, Number(cloudGenerationTimeoutMs ?? providerGenerationTimeoutMs ?? config.timeoutMs ?? PROVIDER_GENERATION_TIMEOUT_MS) || PROVIDER_GENERATION_TIMEOUT_MS)
  const getConfigLogDetails = (config) => ({
    provider: config.provider,
    model: config.model,
    baseUrlHost: getUrlHost(config.baseUrl),
    timeoutMs: Number(config.timeoutMs) || DEFAULT_CONFIG.timeoutMs,
    maxConcurrentJobs: getMaxConcurrentJobs(config)
  })

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

  const persistModelCatalog = (config, models) => {
    const nextCatalog = createSavedProviderModelCatalog({
      capability: 'image',
      provider: config.provider,
      baseUrl: config.baseUrl,
      models,
      fetchedAt: now().toISOString(),
      secrets: [secretService.getSecretValue(config.apiKeyRef)]
    })
    const current = getStoredImageGenerationState()
    saveStoredConfig({
      ...toPersistedConfig(current),
      modelCatalog: nextCatalog
    })
    return nextCatalog
  }

  const getConfig = () => {
    const config = getStoredConfig()
    const storedState = getStoredImageGenerationState()
    const secretValue = secretService.getSecretValue(config.apiKeyRef)
    return {
      ...config,
      baseUrl: sanitizeProviderBaseUrlForDisplay(config.baseUrl),
      hasApiKey: Boolean(secretValue),
      apiKeyPreview: maskSecret(secretValue),
      apiKeyLabel: 'Image API Key',
      modelCatalog: getModelCatalog(config, storedState),
      creatorWorkflowModelPolicy: createCreatorWorkflowModelPolicy({ config, storedState })
    }
  }

  const saveConfig = (partialConfig) => {
    assertProviderConfigPayload(partialConfig, 'Image Provider')
    const current = getStoredConfig()
    const requestId = idFactory()
    const currentState = getStoredImageGenerationState()
    const ownerFieldOverrides = Object.hasOwn(partialConfig, 'apiKeyRef') && partialConfig.apiKeyRef !== current.apiKeyRef
      ? ['apiKeyRef']
      : []
    if (ownerFieldOverrides.length) {
      recordLog({
        scope: 'image-generation-settings',
        level: 'warn',
        event: 'imageGeneration.settings.owner-fields.rejected',
        message: 'Image Provider owner-controlled config fields were rejected',
        details: {
          ...createProviderOperationDetails({
            capability: 'image',
            operation: 'save-config',
            config: current,
            configSource: 'image',
            requestId,
            outcome: 'rejected'
          }),
          fields: ownerFieldOverrides
        }
      })
      throw new Error(`Image Provider owner-controlled fields cannot be changed: ${ownerFieldOverrides.join(', ')}`)
    }
    const validated = validateProviderConfigInput({
      provider: Object.hasOwn(partialConfig, 'provider') ? partialConfig.provider : current.provider,
      baseUrl: Object.hasOwn(partialConfig, 'baseUrl')
        ? partialConfig.baseUrl
        : sanitizeProviderBaseUrlForDisplay(current.baseUrl),
      model: Object.hasOwn(partialConfig, 'model') ? partialConfig.model : current.model,
      label: 'Image',
      allowedProviders: ['openai-compatible', 'openai']
    })
    const next = toPersistedConfig({
      ...current,
      ...(isPlainObject(partialConfig) ? partialConfig : {}),
      ...validated,
      apiKeyRef: current.apiKeyRef
    })
    next.modelCatalog = currentState.modelCatalog
    next.baseUrl = assertProviderBaseUrl(next.baseUrl)
    saveStoredConfig(next)
    recordLog({
      scope: 'image-generation-settings',
      level: 'info',
      event: 'imageGeneration.settings.saved',
      message: 'Image Provider settings saved',
      details: {
        ...createProviderOperationDetails({
          capability: 'image',
          operation: 'save-config',
          config: next,
          configSource: 'image',
          requestId,
          outcome: 'completed'
        }),
        ...getConfigLogDetails(next)
      }
    })
    return getConfig()
  }

  const saveProviderApiKey = (apiKey) => {
    const config = getStoredConfig()
    const requestId = idFactory()
    const value = String(apiKey || '').trim()
    if (!value) throw new Error('Image Provider API Key 不能为空')
    secretService.setSecret({
      id: config.apiKeyRef,
      value,
      label: 'Image API Key'
    })
    recordLog({
      scope: 'image-generation-settings',
      level: 'info',
      event: 'imageGeneration.settings.api-key.saved',
      message: 'Image Provider API key saved',
      details: {
        ...createProviderOperationDetails({
          capability: 'image',
          operation: 'save-secret',
          config,
          configSource: 'image',
          requestId,
          outcome: 'completed'
        }),
        ...getConfigLogDetails(config),
        apiKeyRef: config.apiKeyRef
      }
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
    const requestId = idFactory()
    secretService.deleteSecret(config.apiKeyRef)
    recordLog({
      scope: 'image-generation-settings',
      level: 'info',
      event: 'imageGeneration.settings.api-key.cleared',
      message: 'Image Provider API key cleared',
      details: {
        ...createProviderOperationDetails({
          capability: 'image',
          operation: 'clear-secret',
          config,
          configSource: 'image',
          requestId,
          outcome: 'completed'
        }),
        ...getConfigLogDetails(config),
        apiKeyRef: config.apiKeyRef
      }
    })
    return {
      apiKeyRef: config.apiKeyRef,
      hasApiKey: false,
      apiKeyPreview: ''
    }
  }

  const checkHealth = async (options = {}) => {
    const config = getStoredConfig()
    let runtimeConfig = config
    const requestId = idFactory()
    const startedMs = nowMs()
    const timeoutMs = normalizeTimeoutMs(options?.timeoutMs, getProviderTimeoutMs(config))
    recordLog({
      level: 'info',
      event: 'imageGeneration.health.started',
      message: 'Image Provider health check started',
      details: {
        ...createProviderOperationDetails({
          capability: 'image',
          operation: 'health-check',
          config,
          configSource: 'image',
          requestId,
          outcome: 'started'
        }),
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
          ...createProviderOperationDetails({
            capability: 'image',
            operation: 'health-check',
            config: runtimeConfig,
            configSource: 'image',
            requestId,
            outcome: result.ok ? 'completed' : 'failed'
          }),
          requestId,
          provider: runtimeConfig.provider,
          model: runtimeConfig.model,
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
      runtimeConfig = resolveImageRuntimeConfig(config)
      const baseUrl = assertProviderBaseUrl(runtimeConfig.baseUrl, 'Image Provider')
      const apiKey = secretService.getSecretValue(runtimeConfig.apiKeyRef)
      if (!apiKey) {
        return completeHealth({ ok: false, provider: config.provider, code: 'missing_api_key', message: 'Image generation API key is missing' })
      }
      const { response, body } = await fetchWithTimeout({
        fetchImpl,
        url: `${baseUrl}/models`,
        timeoutMs,
        timeoutMessage: `Image Provider health check timed out after ${timeoutMs}ms`,
        options: {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        },
        consumeResponse: async (response, signal) => ({
          response,
          body: await readOptionalJsonResponse(response, signal)
        })
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
      const availableModels = extractDiscoveredModels(body, { secrets: [apiKey] })
      persistModelCatalog(runtimeConfig, availableModels)
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
      const errorMessage = sanitizeLogText(error?.message || error, { maxChars: 240 })
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
    let runtimeConfig = config
    const requestId = idFactory()
    const startedMs = nowMs()
    let baseUrl = sanitizeProviderBaseUrlForDisplay(config.baseUrl)
    const timeoutMs = getProviderTimeoutMs(config)
    const hasApiKey = Boolean(secretService.getSecretValue(config.apiKeyRef))
    recordLog({
      level: 'info',
      event: 'imageGeneration.models.started',
      message: 'Image Provider model discovery started',
      details: {
        ...createProviderOperationDetails({
          capability: 'image',
          operation: 'discover-models',
          config,
          configSource: 'image',
          requestId,
          outcome: 'started'
        }),
        requestId,
        provider: config.provider,
        model: config.model,
        baseUrlHost: getUrlHost(baseUrl),
        timeoutMs
      }
    })

    const completeDiscovery = (result, extraDetails = {}) => {
      recordLog({
        level: result.ok ? 'info' : 'error',
        event: result.ok ? 'imageGeneration.models.completed' : 'imageGeneration.models.failed',
        message: result.ok ? 'Image Provider model discovery completed' : 'Image Provider model discovery failed',
        details: {
          ...createProviderOperationDetails({
            capability: 'image',
            operation: 'discover-models',
            config: runtimeConfig,
            configSource: 'image',
            requestId,
            outcome: result.ok ? 'completed' : 'failed'
          }),
          requestId,
          provider: runtimeConfig.provider,
          model: runtimeConfig.model,
          baseUrlHost: getUrlHost(baseUrl),
          durationMs: nowMs() - startedMs,
          errorCode: result.ok ? '' : result.code,
          modelCount: Array.isArray(result.models) ? result.models.length : 0,
          timeoutMs,
          ...extraDetails
        }
      })
      return result
    }

    try {
      runtimeConfig = resolveImageRuntimeConfig(config)
      baseUrl = assertProviderBaseUrl(runtimeConfig.baseUrl, 'Image Provider')
      const apiKey = secretService.getSecretValue(runtimeConfig.apiKeyRef)
      const baseResult = {
        provider: config.provider,
        baseUrl,
        model: config.model,
        hasApiKey
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
      const { response, body } = await fetchWithTimeout({
        fetchImpl,
        url: `${baseUrl}/models`,
        timeoutMs,
        timeoutMessage: `Image Provider model discovery timed out after ${timeoutMs}ms`,
        options: {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        },
        consumeResponse: async (response, signal) => ({
          response,
          body: await readOptionalJsonResponse(response, signal)
        })
      })
      const status = response?.status || 'error'
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
          { status, modelsProbe: 'failed' }
        )
      }
      const discoveredModels = extractDiscoveredModels(body, { secrets: [apiKey] })
      persistModelCatalog(runtimeConfig, discoveredModels)
      return completeDiscovery(
        {
          ok: true,
          ...baseResult,
          models: discoveredModels,
          code: 'ok',
          message: 'Image Provider model discovery succeeded'
        },
        { status, modelsProbe: 'ok' }
      )
    } catch (error) {
      const errorMessage = sanitizeLogText(error?.message || error, { maxChars: 240 })
      const isTimeout = /model discovery timed out/i.test(errorMessage)
      return completeDiscovery({
        ok: false,
        provider: config.provider,
        baseUrl,
        model: config.model,
        hasApiKey,
        models: [],
        code: isTimeout ? 'model_discovery_timeout' : 'model_discovery_error',
        message: errorMessage
      }, {
        modelsProbe: isTimeout ? 'timed_out' : 'failed',
        errorMessage
      })
    }
  }

  const generateProviderImage = async ({ config, prompt, promptCompiler = null, targetDir, relativeDir, constraints, requestId, timeoutMs: timeoutOverrideMs, referenceImages = [] }) => {
    assertExactlyOneReferenceImage(referenceImages)
    const runtimeConfig = resolveImageRuntimeConfig(config)
    const apiKey = secretService.getSecretValue(runtimeConfig.apiKeyRef)
    if (!apiKey) throw new Error('Image generation API key is missing')
    const baseUrl = assertProviderBaseUrl(runtimeConfig.baseUrl, 'Image Provider')
    const providerStartMs = nowMs()
    const timeoutMs = normalizeTimeoutMs(timeoutOverrideMs, getProviderTimeoutMs(runtimeConfig))
    const backgroundMode = getProviderGenerationBackgroundMode({ model: runtimeConfig.model, constraints })
    const normalizedReferenceImages = referenceImages
    const endpoint = '/images/edits'
    const quality = getProviderImageQuality({ model: runtimeConfig.model, constraints })
    const conditioning = createConditioningSummary({
      endpoint,
      referenceImages: normalizedReferenceImages,
      constraints,
      model: runtimeConfig.model,
      promptCompiler
    })
    recordLog({
      level: 'info',
      event: 'imageGeneration.provider.request.started',
      message: 'Image Provider request started',
      details: {
        ...createProviderOperationDetails({
          capability: 'image',
          operation: 'provider-generate',
          config: runtimeConfig,
          configSource: 'image',
          requestId,
          outcome: 'started'
        }),
        ...(promptCompiler || {}),
        requestId,
        provider: runtimeConfig.provider,
        model: runtimeConfig.model,
        baseUrlHost: getUrlHost(baseUrl),
        width: constraints.width,
        height: constraints.height,
        requestedTransparent: Boolean(constraints.transparent),
        backgroundMode,
        quality,
        endpoint,
        requestMode: conditioning.mode,
        referenceImageCount: normalizedReferenceImages.length,
        multipartImageField: 'image',
        requestedOutputCount: REQUESTED_PROVIDER_OUTPUT_COUNT,
        timeoutMs
      }
    })
    let response
    let responseBody = {}
    try {
      const multipartRequest = buildProviderEditMultipartRequest({
        model: runtimeConfig.model,
        prompt,
        constraints,
        referenceImages: normalizedReferenceImages
      })
      const requestBody = multipartRequest.body
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        ...multipartRequest.headers
      }
      const providerResponse = await fetchWithTimeout({
        fetchImpl,
        url: `${baseUrl}${endpoint}`,
        timeoutMs,
        timeoutMessage: `Image Provider generation timed out after ${timeoutMs}ms`,
        options: {
          method: 'POST',
          headers,
          body: requestBody
        },
        consumeResponse: async (response) => ({
          response,
          body: response?.ok && typeof response.json === 'function'
            ? await response.json()
            : {}
        })
      })
      response = providerResponse.response
      responseBody = providerResponse.body
    } catch (error) {
      const isTimeout = /timed out/i.test(String(error?.message || ''))
      recordLog({
        level: 'error',
        event: 'imageGeneration.provider.request.failed',
        message: 'Image Provider request failed',
        details: {
          ...createProviderOperationDetails({
            capability: 'image',
            operation: 'provider-generate',
            config: runtimeConfig,
            configSource: 'image',
            requestId,
            outcome: 'failed'
          }),
          requestId,
          provider: runtimeConfig.provider,
          model: runtimeConfig.model,
          baseUrlHost: getUrlHost(baseUrl),
          durationMs: nowMs() - providerStartMs,
          endpoint,
          requestMode: conditioning.mode,
          referenceImageCount: normalizedReferenceImages.length,
          timeoutMs,
          errorCode: isTimeout ? 'provider_timeout' : 'provider_request_error',
          errorCauseCode: getSafeTransportCauseCode(error),
          errorMessage: sanitizeLogText(error?.message || error, { maxChars: 240 })
        }
      })
      throw new Error(isTimeout
        ? `Image Provider generation timed out after ${timeoutMs}ms`
        : 'Image Provider request failed')
    }
    if (!response?.ok) {
      const status = response?.status || 'error'
      const errorMessage = 'Image Provider returned an error response'
      recordLog({
        level: 'error',
        event: 'imageGeneration.provider.request.failed',
        message: 'Image Provider request failed',
        details: {
          ...createProviderOperationDetails({
            capability: 'image',
            operation: 'provider-generate',
            config: runtimeConfig,
            configSource: 'image',
            requestId,
            outcome: 'failed'
          }),
          requestId,
          provider: runtimeConfig.provider,
          model: runtimeConfig.model,
          baseUrlHost: getUrlHost(baseUrl),
          status,
          durationMs: nowMs() - providerStartMs,
          endpoint,
          requestMode: conditioning.mode,
          referenceImageCount: normalizedReferenceImages.length,
          errorCode: 'provider_http_error',
          errorMessage: sanitizeLogText(errorMessage, { maxChars: 240 })
        }
      })
      throw new Error(`Image Provider generation failed with HTTP ${status}`)
    }
    const body = responseBody
    const items = Array.isArray(body?.data) ? body.data : []
    if (!items.length) {
      const businessError = extractProviderBusinessError(body)
      if (businessError) {
        const errorMessage = 'Image Provider returned a business error'
        recordLog({
          level: 'error',
          event: 'imageGeneration.provider.request.failed',
          message: 'Image Provider returned a business error',
          details: {
            ...createProviderOperationDetails({
              capability: 'image',
              operation: 'provider-generate',
              config: runtimeConfig,
              configSource: 'image',
              requestId,
              outcome: 'failed'
            }),
            requestId,
            provider: runtimeConfig.provider,
            model: runtimeConfig.model,
            baseUrlHost: getUrlHost(baseUrl),
            status: response.status || 200,
            durationMs: nowMs() - providerStartMs,
            endpoint,
            requestMode: conditioning.mode,
            referenceImageCount: normalizedReferenceImages.length,
            outputCount: 0,
            errorCode: 'provider_business_error',
            errorMessage
          }
        })
        throw new Error(errorMessage)
      }
      recordLog({
        level: 'error',
        event: 'imageGeneration.provider.request.failed',
        message: 'Image Provider returned no outputs',
        details: {
          ...createProviderOperationDetails({
            capability: 'image',
            operation: 'provider-generate',
            config: runtimeConfig,
            configSource: 'image',
            requestId,
            outcome: 'failed'
          }),
          requestId,
          provider: runtimeConfig.provider,
          model: runtimeConfig.model,
          baseUrlHost: getUrlHost(baseUrl),
          status: response.status || 200,
          durationMs: nowMs() - providerStartMs,
          endpoint,
          requestMode: conditioning.mode,
          referenceImageCount: normalizedReferenceImages.length,
          outputCount: 0,
          errorCode: 'provider_invalid_response',
          errorMessage: sanitizeLogText('Image Provider generation returned no outputs', { maxChars: 240 })
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
          ...createProviderOperationDetails({
            capability: 'image',
            operation: 'provider-generate',
            config: runtimeConfig,
            configSource: 'image',
            requestId,
            outcome: 'failed'
          }),
          requestId,
          provider: runtimeConfig.provider,
          model: runtimeConfig.model,
          baseUrlHost: getUrlHost(baseUrl),
          status: response.status || 200,
          durationMs: nowMs() - providerStartMs,
          endpoint,
          requestMode: conditioning.mode,
          referenceImageCount: normalizedReferenceImages.length,
          outputCount: 0,
          errorCode: 'provider_invalid_response',
          errorMessage: sanitizeLogText(error?.message || error, { maxChars: 240 })
        }
      })
      throw error
    }

    recordLog({
      level: 'info',
      event: 'imageGeneration.provider.request.completed',
      message: 'Image Provider request completed',
      details: {
        ...createProviderOperationDetails({
          capability: 'image',
          operation: 'provider-generate',
          config: runtimeConfig,
          configSource: 'image',
          requestId,
          outcome: 'completed'
        }),
        requestId,
        provider: runtimeConfig.provider,
        model: runtimeConfig.model,
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
      provider: runtimeConfig.provider,
      model: runtimeConfig.model,
      generatedAt: now().toISOString(),
      conditioning,
      outputs,
      usage: {
        estimatedCostUsd: 0
      }
    }
  }

  const generateImage = async (request = {}) => {
    const config = getStoredConfig()
    const ownerFieldOverrides = findOwnerFieldOverrides(request, {
      topLevel: ['provider', 'baseUrl', 'apiKeyRef', 'model']
    })
    if (ownerFieldOverrides.length) {
      recordLog({
        level: 'warn',
        event: 'imageGeneration.owner-fields.rejected',
        message: 'Image Provider owner-controlled request fields were rejected',
        details: {
          ...createProviderOperationDetails({
            capability: 'image',
            operation: 'generate',
            config,
            configSource: 'image',
            requestId,
            outcome: 'rejected'
          }),
          fields: ownerFieldOverrides
        }
      })
      throw new Error(`Image Provider owner-controlled fields cannot be changed: ${ownerFieldOverrides.join(', ')}`)
    }
    const {
      prompt,
      promptCompiler,
      output,
      constraints,
      timeoutMs,
      referenceImages = []
    } = request
    assertExactlyOneReferenceImage(referenceImages)
    const normalizedReferenceImages = normalizeReferenceImages(referenceImages, {
      dataDir: output?.dataDir
    })
    assertExactlyOneReferenceImage(normalizedReferenceImages)
    const normalizedPromptCompiler = normalizePromptCompilerEvidence(promptCompiler)
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
        ...createProviderOperationDetails({
          capability: 'image',
          operation: 'generate',
          config,
          configSource: 'image',
          requestId,
          outcome: 'started'
        }),
        ...(normalizedPromptCompiler || {}),
        requestId,
        provider: config.provider,
        model: config.model,
        width: constraints?.width,
        height: constraints?.height,
        requestedTransparent: Boolean(constraints?.transparent),
        referenceImageCount: normalizedReferenceImages.length,
        multipartImageField: 'image',
        requestedOutputCount: REQUESTED_PROVIDER_OUTPUT_COUNT
      }
    })

    let releaseProviderJobSlot = null
    try {
      releaseProviderJobSlot = await acquireProviderJobSlot({ config, requestId })
      const result = await generateProviderImage({
        config,
        prompt,
        promptCompiler: normalizedPromptCompiler,
        targetDir,
        relativeDir,
        constraints,
        requestId,
        timeoutMs,
        referenceImages: normalizedReferenceImages
      })
      recordLog({
        level: 'info',
        event: 'imageGeneration.request.completed',
        message: 'Image generation request completed',
        details: {
          ...createProviderOperationDetails({
            capability: 'image',
            operation: 'generate',
            config,
            configSource: 'image',
            requestId,
            outcome: 'completed'
          }),
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
          ...createProviderOperationDetails({
            capability: 'image',
            operation: 'generate',
            config,
            configSource: 'image',
            requestId,
            outcome: 'failed'
          }),
          requestId,
          provider: config.provider,
          model: config.model,
          durationMs: nowMs() - startedMs,
          errorMessage: sanitizeLogText(error?.message || error, { maxChars: 240 })
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
  VERIFIED_CREATOR_WORKFLOW_IMAGE_MODELS,
  createCreatorWorkflowModelPolicy,
  isVerifiedCreatorWorkflowImageModel,
  createImageGenerationModelService
}
