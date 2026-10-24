const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { sanitizeLogText } = require('./log-safety')
const { readBoundedResponseBuffer } = require('./bounded-response-body')
const { normalizeProviderResponseLimits } = require('./provider-response-limits')
const {
  assertResolvedAddressesSafe,
  connectPinnedHttps,
  isPrivateAddress
} = require('./plugin-network-client')
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
const MAX_PROVIDER_OUTPUT_COUNT = 3
const VERIFIED_CREATOR_WORKFLOW_IMAGE_MODELS = Object.freeze(['gpt-image-2', 'gpt-image-1', 'gpt-image-1.5'])
const DIRECT_TRANSPARENT_IMAGE_MODELS = new Set(['gpt-image-1', 'gpt-image-1.5'])
const MAX_PROVIDER_IMAGE_URL_REDIRECTS = 3
// Reference images are conditioning inputs, not final assets. Keeping them
// bounded avoids multi-megabyte multipart uploads that can spend the whole
// provider timeout in the upstream image edit queue.
const MAX_REFERENCE_IMAGE_DIMENSION = 768
const MAX_REFERENCE_IMAGE_BYTES = 512 * 1024
const REFERENCE_IMAGE_WEBP_QUALITY = 85
const SAFE_TRACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/

const normalizeImageModelCapabilityKey = (value) => String(value || '').trim().toLowerCase()
const isGptImage2Model = (value) => normalizeImageModelCapabilityKey(value) === 'gpt-image-2'

const normalizeTraceId = (value) => {
  const normalized = String(value || '').trim()
  return SAFE_TRACE_ID_PATTERN.test(normalized) ? normalized : ''
}

const normalizeImageTraceContext = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries([
    ['runId', normalizeTraceId(value.runId)],
    ['actionId', normalizeTraceId(value.actionId)],
    ['stage', normalizeTraceId(value.stage)],
    ['candidateId', normalizeTraceId(value.candidateId)]
  ].filter(([, entry]) => entry))
}

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

const decodeRequiredBase64Image = ({ value, fieldName, maxBytes = Infinity }) => {
  const encoded = String(value || '').trim()
  if (!encoded) {
    throw new Error(`Image Provider returned an output with missing image bytes (${fieldName})`)
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error(`Image Provider returned invalid image bytes (${fieldName})`)
  }
  const estimatedBytes = Math.max(0, Math.floor(encoded.length * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0))
  if (estimatedBytes > maxBytes) {
    const error = new Error('Image Provider response exceeded the configured byte limit')
    error.code = 'provider_response_too_large'
    throw error
  }
  const bytes = Buffer.from(encoded, 'base64')
  if (!bytes.length) {
    throw new Error(`Image Provider returned an output with missing image bytes (${fieldName})`)
  }
  if (bytes.byteLength > maxBytes) {
    const error = new Error('Image Provider response exceeded the configured byte limit')
    error.code = 'provider_response_too_large'
    throw error
  }
  return bytes
}

const parseProviderImageUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  let parsed
  try {
    parsed = new URL(raw)
  } catch (_) {
    throw new Error('Image Provider returned an invalid image URL')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('Image Provider returned an invalid image URL')
  }
  return parsed.toString()
}

const isPublicImageAddress = (address) => {
  if (isPrivateAddress(address)) return false
  const normalized = String(address || '').replace(/^\[|]$/g, '')
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    const octets = normalized.split('.').map(Number)
    const ranges = [
      [[0, 0, 0, 0], 8],
      [[192, 0, 0, 0], 24],
      [[192, 0, 2, 0], 24],
      [[192, 88, 99, 0], 24],
      [[198, 18, 0, 0], 15],
      [[198, 51, 100, 0], 24],
      [[203, 0, 113, 0], 24]
    ]
    for (const [network, prefixLength] of ranges) {
      const fullOctets = Math.floor(prefixLength / 8)
      const partialBits = prefixLength % 8
      if (octets.slice(0, fullOctets).every((octet, index) => octet === network[index])) {
        if (!partialBits || (octets[fullOctets] >> (8 - partialBits)) === (network[fullOctets] >> (8 - partialBits))) return false
      }
    }
    return true
  }
  const firstWord = Number.parseInt(normalized.split(':')[0], 16)
  if (!Number.isInteger(firstWord) || firstWord < 0x2000 || firstWord > 0x3fff) return false
  const secondWord = Number.parseInt(normalized.split(':')[1] || '0', 16)
  if (firstWord === 0x2001 && (secondWord <= 0x01ff || secondWord === 0x0db8)) return false
  if (firstWord === 0x2002 || (firstWord === 0x3fff && secondWord <= 0x0fff)) return false
  return true
}

const fetchProviderImageUrl = async ({ url, signal, resolveAddress, connect }) => {
  let currentUrl = new URL(url)
  for (let redirectCount = 0; redirectCount <= MAX_PROVIDER_IMAGE_URL_REDIRECTS; redirectCount += 1) {
    if (currentUrl.protocol !== 'https:' || currentUrl.username || currentUrl.password) {
      throw new Error('Image Provider returned an unsafe image URL')
    }
    const addresses = await assertResolvedAddressesSafe(currentUrl.hostname, resolveAddress)
    if (signal?.aborted) throw signal.reason || new Error('Image URL download aborted')
    const nonPublicAddresses = addresses
      .map(({ address }) => String(address || '').slice(0, 64))
      .filter((address) => !isPublicImageAddress(address))
    if (nonPublicAddresses.length) {
      const host = currentUrl.hostname.slice(0, 253)
      throw new Error(`Image Provider image URL host ${host} resolves to a non-public address (${nonPublicAddresses.join(', ')})`)
    }
    const selected = addresses[0]
    const response = await connect({
      url: currentUrl.toString(),
      request: { method: 'GET', headers: {} },
      address: selected.address,
      family: selected.family,
      servername: currentUrl.hostname,
      hostHeader: currentUrl.host,
      port: Number(currentUrl.port) || 443,
      signal
    })
    const location = response.headers?.get?.('location') || ''
    if (![301, 302, 303, 307, 308].includes(Number(response.status)) || !location) return response
    cancelProviderResponseBody(response)
    if (redirectCount === MAX_PROVIDER_IMAGE_URL_REDIRECTS) throw new Error('Image Provider image URL exceeded the redirect limit')
    currentUrl = new URL(location, currentUrl)
  }
  throw new Error('Image Provider image URL exceeded the redirect limit')
}

const downloadProviderImageUrl = async ({ url, timeoutMs, signal, maxBytes, resolveAddress, connect }) => {
  const response = await fetchWithTimeout({
    fetchImpl: (_url, options) => fetchProviderImageUrl({
      url,
      signal: options.signal,
      resolveAddress,
      connect
    }),
    url,
    timeoutMs,
    timeoutMessage: `Image Provider image URL download timed out after ${timeoutMs}ms`,
    signal,
    options: { method: 'GET' },
    consumeResponse: async (nextResponse, controller) => {
      if (!nextResponse?.ok) {
        cancelProviderResponseBody(nextResponse)
        throw new Error(`Image Provider image URL returned HTTP ${nextResponse?.status || 'error'}`)
      }
      return readBoundedResponseBuffer(nextResponse, {
        maxBytes,
        sizeErrorMessage: 'Image Provider image URL exceeded the configured byte limit',
        controller
      })
    }
  })
  return Buffer.isBuffer(response) ? response : Buffer.from(response)
}

const isAbortError = (error) => (
  error?.name === 'AbortError' ||
  error?.code === 'ABORT_ERR'
)

const createAbortError = (reason) => {
  if (reason instanceof Error) return reason
  const error = new Error('Image generation request was canceled')
  error.name = 'AbortError'
  error.code = 'ABORT_ERR'
  return error
}

const cancelProviderResponseBody = (response) => {
  try {
    Promise.resolve(response?.body?.cancel?.()).catch(() => {})
  } catch (_) {
    // Releasing a failed Provider response must not replace the original retry outcome.
  }
}

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
  return isGptImage2Model(model) ? DEFAULT_GPT_IMAGE_2_QUALITY : ''
}

const fetchWithTimeout = async ({
  fetchImpl,
  url,
  options = {},
  timeoutMs,
  timeoutMessage,
  signal,
  consumeResponse = async (response) => response
}) => {
  if (signal?.aborted) throw createAbortError(signal.reason)
  const controller = new AbortController()
  const effectiveTimeoutMs = normalizeTimeoutMs(timeoutMs, PROVIDER_GENERATION_TIMEOUT_MS)
  let timeoutHandle = null
  let externalAbortListener = null
  let rejectExternalAbort = null
  let timedOut = false
  if (signal) {
    externalAbortListener = () => {
      const error = createAbortError(signal.reason)
      controller.abort(error)
      rejectExternalAbort(error)
    }
    signal.addEventListener('abort', externalAbortListener, { once: true })
  }
  try {
    const aborted = signal
      ? new Promise((_, reject) => { rejectExternalAbort = reject })
      : null
    const request = (async () => {
      const response = await fetchImpl(url, {
        ...options,
        signal: controller.signal
      })
      return await consumeResponse(response, controller)
    })()
    const timed = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true
          controller.abort(new Error(timeoutMessage))
          reject(new Error(timeoutMessage))
        }, effectiveTimeoutMs)
    })
    const pending = signal
      ? [request, timed, aborted]
      : [request, timed]
    return await Promise.race(pending)
  } catch (error) {
    if (error?.code === 'provider_response_too_large') throw error
    if (signal?.aborted) throw createAbortError(signal.reason)
    if (timedOut) {
      const timeoutError = new Error(timeoutMessage)
      timeoutError.code = 'provider_timeout'
      throw timeoutError
    }
    if (isAbortError(error) || controller.signal.aborted) {
      const timeoutError = new Error(timeoutMessage)
      timeoutError.code = 'provider_timeout'
      throw timeoutError
    }
    throw error
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    if (externalAbortListener) signal.removeEventListener('abort', externalAbortListener)
  }
}

// parsed 用于区分"provider 返回了合法的空模型列表"与"响应体解析失败"。
// 两者都会得到空 body，但只有前者可以覆盖已保存的模型目录；解析失败时
// 必须保留旧目录，否则一次坏响应就会把用户已发现的模型清空。
const readOptionalJsonResponse = async (response, controller, maxBytes) => {
  if (!response?.ok) return { parsed: false, body: {} }
  try {
    const bytes = await readBoundedResponseBuffer(response, {
      maxBytes,
      sizeErrorMessage: 'Image Provider response exceeded the configured byte limit',
      controller
    })
    return { parsed: true, body: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) }
  } catch (error) {
    if (error?.code === 'RESPONSE_BODY_TOO_LARGE') {
      const sizeError = new Error('Image Provider response exceeded the configured byte limit')
      sizeError.code = 'provider_response_too_large'
      throw sizeError
    }
    if (controller?.signal?.aborted) throw error
    return { parsed: false, body: {} }
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
  .includes(normalizeImageModelCapabilityKey(sanitizeModelId(value)))

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
  const verifiedModelsByCapability = new Map()
  const addVerifiedModel = (modelId) => {
    const capabilityKey = normalizeImageModelCapabilityKey(modelId)
    if (!capabilityKey || verifiedModelsByCapability.has(capabilityKey)) return
    verifiedModelsByCapability.set(capabilityKey, modelId)
  }
  if (isVerifiedCreatorWorkflowImageModel(preferredModel)) addVerifiedModel(preferredModel)
  discoveredModels.filter(isVerifiedCreatorWorkflowImageModel).forEach(addVerifiedModel)
  const verifiedModels = uniqueModelIds([...verifiedModelsByCapability.values()])
  const preferredCapabilityKey = normalizeImageModelCapabilityKey(preferredModel)
  return {
    evidenceScope: 'creator-one-click-default',
    preferredModel,
    verifiedModels,
    fallbackModels: verifiedModels.filter((modelId) => (
      normalizeImageModelCapabilityKey(modelId) !== preferredCapabilityKey
    )),
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

const classifyImageProviderHttpFailure = (status) => {
  const normalizedStatus = Number(status)
  if (normalizedStatus === 401 || normalizedStatus === 403) {
    return {
      code: 'auth_failed',
      message: 'Image Provider rejected the API key'
    }
  }
  return {
    code: 'provider_unhealthy',
    message: `Image Provider responded with HTTP ${status}`
  }
}

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

const normalizeReferenceImages = async (referenceImages = [], { dataDir } = {}) => {
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
  return Promise.all(referenceImages
    .map(async (entry, index) => {
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
      const sourceBytes = fs.readFileSync(sourcePath)
      let bytes = sourceBytes
      let normalizedFileName = fileName
      let normalizedMimeType = mimeType
      // Avoid decoding ordinary small references on the request path. The
      // production failure is caused by large uploads; those are always
      // decoded and bounded before the multipart request is built.
      const needsCompression = sourceBytes.byteLength > MAX_REFERENCE_IMAGE_BYTES
      if (needsCompression) {
        try {
          const normalizedBytes = await sharp(sourceBytes)
            .rotate()
            .resize({
              width: MAX_REFERENCE_IMAGE_DIMENSION,
              height: MAX_REFERENCE_IMAGE_DIMENSION,
              fit: 'inside',
              withoutEnlargement: true
            })
            .webp({ quality: REFERENCE_IMAGE_WEBP_QUALITY, alphaQuality: REFERENCE_IMAGE_WEBP_QUALITY })
            .toBuffer()
          bytes = normalizedBytes
          normalizedFileName = `${path.basename(fileName, path.extname(fileName)) || `reference-${index + 1}`}.webp`
          normalizedMimeType = 'image/webp'
        } catch (error) {
          throw createReferenceContractError(
            'reference_image_unusable',
            `Reference image ${index + 1} could not be normalized: ${error?.message || error}`
          )
        }
      }
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
      return {
        path: realSourcePath,
        fileName: normalizedFileName,
        mimeType: normalizedMimeType,
        byteLength: bytes.length,
        sha256,
        relativePath: createSafeReferenceRelativePath(entry.relativePath),
        metadataRelativePath: createSafeReferenceRelativePath(entry.metadataRelativePath),
        role: String(entry.role || 'reference-image').trim() || 'reference-image',
        bytes
      }
    }))
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

const buildProviderEditMultipartRequest = ({ model, prompt, constraints, referenceImages = [], outputCount = REQUESTED_PROVIDER_OUTPUT_COUNT }) => {
  assertExactlyOneReferenceImage(referenceImages)
  const boundary = createMultipartBoundary()
  const buffers = []
  const quality = getProviderImageQuality({ model, constraints })
  const backgroundMode = getProviderGenerationBackgroundMode({ model, constraints })
  appendMultipartFilePart(buffers, boundary, 'image', referenceImages[0])
  appendMultipartTextPart(buffers, boundary, 'model', model)
  appendMultipartTextPart(buffers, boundary, 'prompt', prompt)
  appendMultipartTextPart(buffers, boundary, 'size', `${constraints.width}x${constraints.height}`)
  appendMultipartTextPart(buffers, boundary, 'n', outputCount)
  if (quality) appendMultipartTextPart(buffers, boundary, 'quality', quality)
  if (!isGptImage2Model(model)) {
    appendMultipartTextPart(buffers, boundary, 'background', backgroundMode)
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

const buildProviderGenerationJsonRequest = ({ model, prompt, constraints, outputCount }) => {
  const quality = getProviderImageQuality({ model, constraints })
  const body = {
    model,
    prompt,
    n: outputCount,
    size: `${constraints.width}x${constraints.height}`,
    ...(quality ? { quality } : {})
  }
  return {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  }
}

const normalizeProviderOutputCount = (value) => {
  if (!Number.isInteger(value) || value < 1 || value > MAX_PROVIDER_OUTPUT_COUNT) {
    throw new Error(`Image outputCount must be an integer from 1 to ${MAX_PROVIDER_OUTPUT_COUNT}`)
  }
  return value
}

const getProviderGenerationBackgroundMode = ({ model, constraints }) => {
  const capabilityKey = normalizeImageModelCapabilityKey(model)
  if (capabilityKey === 'gpt-image-2') return 'omitted'
  return DIRECT_TRANSPARENT_IMAGE_MODELS.has(capabilityKey) && constraints.transparent
    ? 'transparent'
    : 'white'
}

const shouldTryFallbackImageModel = (error) => {
  // A fallback is safe only after the Provider explicitly rejected this model.
  // Transport failures and 5xx responses may hide a completed, billable request.
  return [400, 404, 422].includes(Number(error?.httpStatus))
}

const normalizePromptCompilerEvidence = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const taskType = String(value.taskType || '').trim()
  const stage = String(value.stage || '').trim()
  const aspectRatio = String(value.aspectRatio || '').trim()
  const normalizeIdentifier = (entry, maxLength = 120) => {
    const text = String(entry || '').trim().slice(0, maxLength)
    return /^[a-z0-9][a-z0-9._:-]*$/i.test(text) ? text : ''
  }
  const promptClauseIds = Array.isArray(value.promptClauseIds)
    ? value.promptClauseIds.map((entry) => normalizeIdentifier(entry)).filter(Boolean).slice(0, 64)
    : []
  return {
    visualPlanVersion: Math.max(0, Number(value.visualPlanVersion) || 0),
    providerImageTaskVersion: Math.max(0, Number(value.providerImageTaskVersion) || 0),
    promptCompilerVersion: Math.max(0, Number(value.promptCompilerVersion || value.version) || 0),
    promptRenderer: normalizeIdentifier(value.promptRenderer),
    modelCapabilityProfile: normalizeIdentifier(value.modelCapabilityProfile),
    taskType: /^[a-z][a-z-]{0,79}$/.test(taskType) ? taskType : '',
    stage: /^[a-z][a-z-]{0,79}$/.test(stage) ? stage : '',
    width: Math.max(0, Number(value.width) || 0),
    height: Math.max(0, Number(value.height) || 0),
    aspectRatio: /^\d+:\d+$/.test(aspectRatio) ? aspectRatio : '',
    referenceImageCount: Math.max(0, Number(value.referenceImageCount) || 0),
    requestedOutputCount: Math.max(0, Number(value.requestedOutputCount) || 0),
    backgroundStrategy: normalizeIdentifier(value.backgroundStrategy),
    frameBeatCount: Math.max(0, Number(value.frameBeatCount) || 0),
    promptCharacterCount: Math.max(0, Number(value.promptCharacterCount) || 0),
    promptClauseIds,
    promptSafety: String(value.promptSafety || '').trim()
  }
}

const normalizePromptVariantConstraints = (value = {}, fallback = {}) => ({
  width: Math.max(0, Number(value.width ?? fallback.width) || 0),
  height: Math.max(0, Number(value.height ?? fallback.height) || 0),
  transparent: Boolean(value.transparent ?? fallback.transparent),
  backgroundStrategy: String(value.backgroundStrategy || fallback.backgroundStrategy || '').trim(),
  ...(normalizeProviderQuality(value.quality || fallback.quality)
    ? { quality: normalizeProviderQuality(value.quality || fallback.quality) }
    : {})
})

const resolvePromptVariantCapabilityContract = (model) => {
  const capabilityKey = normalizeImageModelCapabilityKey(model)
  if (capabilityKey === 'gpt-image-2') {
    return {
      profile: 'gpt-image-2-v1',
      backgroundStrategy: 'solid-background-then-local-removal',
      transparent: false
    }
  }
  if (DIRECT_TRANSPARENT_IMAGE_MODELS.has(capabilityKey)) {
    return {
      profile: 'gpt-image-edit-transparent-v1',
      backgroundStrategy: 'direct-transparent-output',
      transparent: true
    }
  }
  return {
    profile: `generic-image-edit-v1:${capabilityKey.slice(0, 80)}`,
    backgroundStrategy: 'solid-background-then-local-removal',
    transparent: false
  }
}

const assertPromptVariantCapabilityContract = ({ model, prompt, promptCompiler, constraints }) => {
  if (!promptCompiler) return
  const hasCapabilityEvidence = (
    Number(promptCompiler.promptCompilerVersion) >= 3 ||
    Boolean(promptCompiler.modelCapabilityProfile) ||
    Boolean(promptCompiler.backgroundStrategy)
  )
  if (!hasCapabilityEvidence) return
  const expected = resolvePromptVariantCapabilityContract(model)
  if (
    promptCompiler.modelCapabilityProfile !== expected.profile ||
    promptCompiler.backgroundStrategy !== expected.backgroundStrategy ||
    Boolean(constraints.transparent) !== expected.transparent ||
    (constraints.backgroundStrategy && constraints.backgroundStrategy !== expected.backgroundStrategy) ||
    (!expected.transparent && /\btransparent\b/i.test(prompt))
  ) {
    const error = new Error(`Image Provider prompt variant capability contract does not match model ${sanitizeModelId(model)}`)
    error.code = 'image_prompt_capability_conflict'
    throw error
  }
}

const normalizeProviderPromptVariants = ({ variants, prompt, promptCompiler, constraints, model }) => {
  const source = Array.isArray(variants) && variants.length
    ? variants.slice(0, 8)
    : [{ model, prompt, promptCompiler, constraints }]
  const seen = new Set()
  const normalized = []
  for (const entry of source) {
    if (!isPlainObject(entry)) continue
    const candidateModel = sanitizeModelId(entry.model)
    const capabilityKey = normalizeImageModelCapabilityKey(candidateModel)
    const candidatePrompt = String(entry.prompt || '').trim()
    if (!candidateModel || !capabilityKey || !candidatePrompt || candidatePrompt.length > 12000 || seen.has(capabilityKey)) continue
    const candidateConstraints = normalizePromptVariantConstraints(entry.constraints, constraints)
    if (!candidateConstraints.width || !candidateConstraints.height) continue
    const normalizedPromptCompiler = normalizePromptCompilerEvidence(entry.promptCompiler)
    assertPromptVariantCapabilityContract({
      model: candidateModel,
      prompt: candidatePrompt,
      promptCompiler: normalizedPromptCompiler,
      constraints: candidateConstraints
    })
    seen.add(capabilityKey)
    normalized.push({
      model: candidateModel,
      prompt: candidatePrompt,
      promptCompiler: normalizedPromptCompiler,
      constraints: candidateConstraints
    })
  }
  return normalized
}

const createProviderModelAttempt = ({ model, ok, timeoutMs, durationMs, error = '', errorCode = '', httpStatus = 0, requestId = '', traceContext = null }) => ({
  model: sanitizeModelId(model),
  ok: Boolean(ok),
  timeoutMs: Math.max(0, Number(timeoutMs) || 0),
  durationMs: Math.max(0, Number(durationMs) || 0),
  ...(errorCode ? { errorCode: String(errorCode).slice(0, 80) } : {}),
  ...(Number(httpStatus) > 0 ? { httpStatus: Math.min(599, Number(httpStatus)) } : {}),
  ...(requestId ? { requestId: normalizeTraceId(requestId) } : {}),
  ...(traceContext && Object.keys(traceContext).length ? { traceContext } : {}),
  ...(error ? { error: sanitizeLogText(error, { maxChars: 240 }) } : {})
})

const createConditioningSummary = ({
  endpoint,
  referenceImages = [],
  constraints,
  model,
  promptCompiler = null,
  textToImage = false,
  outputCount = REQUESTED_PROVIDER_OUTPUT_COUNT
}) => ({
  mode: textToImage ? 'text-to-image' : 'image-edit',
  endpoint,
  referenceImageCount: referenceImages.length,
  ...(!textToImage ? { multipartImageField: 'image' } : {}),
  requestedOutputCount: outputCount,
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
  resolveImageUrlAddress,
  connectImageUrl = connectPinnedHttps,
  now = () => new Date(),
  nowMs = () => Date.now(),
  appLogService,
  idFactory = () => crypto.randomUUID(),
  providerGenerationTimeoutMs,
  cloudGenerationTimeoutMs,
  providerResponseLimits = {},
  awaitPersistence = false
} = {}) => {
  if (!settingsService) throw new Error('settingsService is required')
  if (!secretService) throw new Error('secretService is required')

  let activeProviderJobs = 0
  let healthCacheRevision = 0
  const queuedProviderJobs = []
  const responseLimits = normalizeProviderResponseLimits(providerResponseLimits)

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

  const acquireProviderJobSlot = async ({ config, requestId, signal }) => {
    if (signal?.aborted) throw createAbortError(signal.reason)
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

    return await new Promise((resolve, reject) => {
      const queued = {
        maxConcurrentJobs,
        abortListener: null,
        resolve: (release) => {
          if (queued.abortListener) signal?.removeEventListener('abort', queued.abortListener)
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
      }
      if (signal) {
        queued.abortListener = () => {
          const index = queuedProviderJobs.indexOf(queued)
          if (index !== -1) queuedProviderJobs.splice(index, 1)
          signal.removeEventListener('abort', queued.abortListener)
          reject(createAbortError(signal.reason))
        }
        signal.addEventListener('abort', queued.abortListener, { once: true })
      }
      queuedProviderJobs.push(queued)
      drainProviderQueue()
    })
  }

  const saveStoredConfig = (config) => {
    const settings = settingsService.get()
    const saved = settingsService.save({
      ...settings,
      models: {
        ...(isPlainObject(settings.models) ? settings.models : {}),
        imageGeneration: config
      }
    })
    return awaitPersistence ? Promise.resolve(saved) : saved
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
    const saved = saveStoredConfig({
      ...toPersistedConfig(current),
      modelCatalog: nextCatalog
    })
    return awaitPersistence ? Promise.resolve(saved).then(() => nextCatalog) : nextCatalog
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

  const getHealthCacheRevision = () => healthCacheRevision

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
    const saved = saveStoredConfig(next)
    const complete = () => {
      healthCacheRevision += 1
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
    return awaitPersistence ? Promise.resolve(saved).then(complete) : complete()
  }

  const saveProviderApiKey = (apiKey) => {
    const config = getStoredConfig()
    const requestId = idFactory()
    const value = String(apiKey || '').trim()
    if (!value) throw new Error('Image Provider API Key 不能为空')
    const savedSecret = secretService.setSecret({
      id: config.apiKeyRef,
      value,
      label: 'Image API Key'
    })
    const complete = () => {
      healthCacheRevision += 1
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
    return awaitPersistence ? Promise.resolve(savedSecret).then(complete) : complete()
  }

  const clearProviderApiKey = () => {
    const config = getStoredConfig()
    const requestId = idFactory()
    const deletedSecret = secretService.deleteSecret(config.apiKeyRef)
    const complete = () => {
      healthCacheRevision += 1
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
    return awaitPersistence ? Promise.resolve(deletedSecret).then(complete) : complete()
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
      const { response, body, bodyParsed } = await fetchWithTimeout({
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
        consumeResponse: async (response, controller) => {
          const { parsed, body } = await readOptionalJsonResponse(response, controller, responseLimits.imageJsonBytes)
          return { response, body, bodyParsed: parsed }
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
        const classifiedError = classifyImageProviderHttpFailure(status)
        return completeHealth(
          {
            ok: false,
            provider: config.provider,
            code: classifiedError.code,
            message: classifiedError.message,
            modelsProbe: 'failed',
            availableModels: [],
            currentModelDiscovered: false
          },
          { status, modelsProbe: 'failed' }
        )
      }
      if (!bodyParsed || !isPlainObject(body) || (!Array.isArray(body.data) && !Array.isArray(body.models))) {
        // 响应体不可解析：探针视为不可用，保留已保存的模型目录，
        // 否则一次坏响应会把用户已发现的模型清空。
        return completeHealth(
          {
            ok: true,
            provider: config.provider,
            code: 'provider_reachable_models_unavailable',
            message: 'Image Provider is reachable, but the optional /models probe returned an unreadable or invalid response',
            modelsProbe: 'unavailable',
            availableModels: [],
            currentModelDiscovered: false
          },
          { status, modelsProbe: 'unavailable' }
        )
      }
      const availableModels = extractDiscoveredModels(body, { secrets: [apiKey] })
      await persistModelCatalog(runtimeConfig, availableModels)
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
      const { response, body, bodyParsed } = await fetchWithTimeout({
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
        consumeResponse: async (response, controller) => {
          const { parsed, body } = await readOptionalJsonResponse(response, controller, responseLimits.imageJsonBytes)
          return { response, body, bodyParsed: parsed }
        }
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
        const classifiedError = classifyImageProviderHttpFailure(status)
        return completeDiscovery(
          {
            ok: false,
            ...baseResult,
            models: [],
            code: classifiedError.code,
            message: classifiedError.message
          },
          { status, modelsProbe: 'failed' }
        )
      }
      if (!bodyParsed || !isPlainObject(body) || (!Array.isArray(body.data) && !Array.isArray(body.models))) {
        // 同 checkHealth：解析失败不覆盖已保存的模型目录。
        return completeDiscovery(
          {
            ok: true,
            ...baseResult,
            models: [],
            code: 'provider_reachable_models_unavailable',
            message: 'Image Provider is reachable, but the optional /models probe returned an unreadable or invalid response'
          },
          { status, modelsProbe: 'unavailable' }
        )
      }
      const discoveredModels = extractDiscoveredModels(body, { secrets: [apiKey] })
      await persistModelCatalog(runtimeConfig, discoveredModels)
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

  const generateProviderImage = async ({ config, prompt, promptCompiler = null, targetDir, relativeDir, constraints, requestId, timeoutMs: timeoutOverrideMs, referenceImages = [], textToImage = false, outputCount = REQUESTED_PROVIDER_OUTPUT_COUNT, traceContext = null, signal }) => {
    const requestedOutputCount = normalizeProviderOutputCount(outputCount)
    if (textToImage ? referenceImages.length !== 0 : referenceImages.length !== 1) {
      throw new Error(textToImage ? 'Text-to-image requests cannot contain reference images' : 'Image edits require exactly one reference image')
    }
    const normalizedTraceContext = normalizeImageTraceContext(traceContext)
    const recordProviderLog = (entry) => recordLog({
      ...entry,
      details: {
        ...(entry.details || {}),
        traceContext: normalizedTraceContext
      }
    })
    const runtimeConfig = resolveImageRuntimeConfig(config)
    const apiKey = secretService.getSecretValue(runtimeConfig.apiKeyRef)
    if (!apiKey) throw new Error('Image generation API key is missing')
    const baseUrl = assertProviderBaseUrl(runtimeConfig.baseUrl, 'Image Provider')
    const providerStartMs = nowMs()
    const timeoutMs = normalizeTimeoutMs(timeoutOverrideMs, getProviderTimeoutMs(runtimeConfig))
    const backgroundMode = textToImage ? 'omitted' : getProviderGenerationBackgroundMode({ model: runtimeConfig.model, constraints })
    const normalizedReferenceImages = referenceImages
    const endpoint = textToImage ? '/images/generations' : '/images/edits'
    const quality = getProviderImageQuality({ model: runtimeConfig.model, constraints })
    const conditioning = createConditioningSummary({
      endpoint,
      referenceImages: normalizedReferenceImages,
      constraints,
      model: runtimeConfig.model,
      promptCompiler,
      textToImage,
      outputCount: requestedOutputCount
    })
    recordProviderLog({
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
        ...(!textToImage ? { multipartImageField: 'image' } : {}),
        requestedOutputCount,
        timeoutMs
      }
    })
    let response
    let responseBody = {}
    const requestDeadlineMs = Date.now() + timeoutMs
    try {
      const providerRequest = textToImage
        ? buildProviderGenerationJsonRequest({ model: runtimeConfig.model, prompt, constraints, outputCount: requestedOutputCount })
        : buildProviderEditMultipartRequest({ model: runtimeConfig.model, prompt, constraints, referenceImages: normalizedReferenceImages, outputCount: requestedOutputCount })
      const requestBody = providerRequest.body
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        ...providerRequest.headers
      }
      const providerResponse = await fetchWithTimeout({
        fetchImpl,
        url: `${baseUrl}${endpoint}`,
        timeoutMs,
        timeoutMessage: `Image Provider generation timed out after ${timeoutMs}ms`,
        signal,
        options: {
          method: 'POST',
          headers,
          body: requestBody
        },
        consumeResponse: async (response, controller) => ({
          response,
          body: response?.ok
            ? (await readOptionalJsonResponse(response, controller, responseLimits.imageJsonBytes)).body
            : {}
        })
      })
      response = providerResponse.response
      responseBody = providerResponse.body
    } catch (error) {
      if (signal?.aborted) throw createAbortError(signal.reason)
      if (error?.code === 'provider_response_too_large') {
        const providerError = new Error('Image Provider response exceeded the configured byte limit')
        providerError.code = 'provider_response_too_large'
        throw providerError
      }
      const isTimeout = /timed out/i.test(String(error?.message || ''))
      recordProviderLog({
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
      const providerError = new Error(isTimeout
        ? `Image Provider generation timed out after ${timeoutMs}ms`
        : 'Image Provider request failed')
      providerError.code = isTimeout ? 'provider_timeout' : 'provider_request_error'
      providerError.cause = error
      throw providerError
    }
    if (!response?.ok) {
      // 非重试的失败响应同样要释放响应体，否则连接会一直挂在这里泄漏。
      cancelProviderResponseBody(response)
      const status = response?.status || 'error'
      const classifiedError = classifyImageProviderHttpFailure(status)
      const errorMessage = 'Image Provider returned an error response'
      recordProviderLog({
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
          errorCode: classifiedError.code === 'auth_failed' ? classifiedError.code : 'provider_http_error',
          errorMessage: sanitizeLogText(errorMessage, { maxChars: 240 })
        }
      })
      const providerError = new Error(classifiedError.code === 'auth_failed'
        ? classifiedError.message
        : `Image Provider generation failed with HTTP ${status}`)
      providerError.code = classifiedError.code === 'auth_failed' ? classifiedError.code : 'provider_http_error'
      providerError.httpStatus = Number(response?.status) || 0
      throw providerError
    }
    const body = responseBody
    const items = Array.isArray(body?.data) ? body.data : []
    if (!items.length) {
      const businessError = extractProviderBusinessError(body)
      if (businessError) {
        const errorMessage = 'Image Provider returned a business error'
        recordProviderLog({
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
      recordProviderLog({
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
    const outputPaths = []
    try {
      const decodedImages = []
      for (const item of items.slice(0, requestedOutputCount)) {
        if (String(item?.b64_json || '').trim()) {
          decodedImages.push(decodeRequiredBase64Image({
            value: item.b64_json,
            fieldName: 'b64_json',
            maxBytes: responseLimits.imageBytes
          }))
          continue
        }
        const imageUrl = parseProviderImageUrl(item?.url)
        if (!imageUrl) throw new Error('Image Provider returned an output with missing image bytes (b64_json or url)')
        decodedImages.push(await downloadProviderImageUrl({
          url: imageUrl,
          timeoutMs: Math.max(1, requestDeadlineMs - Date.now()),
          signal,
          maxBytes: responseLimits.imageBytes,
          resolveAddress: resolveImageUrlAddress,
          connect: connectImageUrl
        }))
      }
      outputs = decodedImages.map((bytes, index) => {
        const { outputPath, fileName } = writeOutputPng({ targetDir, index: index + 1, bytes })
        outputPaths.push(outputPath)
        return {
          dataRelativePath: path.posix.join(relativeDir.replace(/\\/g, '/'), fileName),
          mimeType: 'image/png',
          sha256: sha256File(outputPath)
        }
      })
    } catch (error) {
      for (const outputPath of outputPaths) fs.rmSync(outputPath, { force: true })
      recordProviderLog({
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

    recordProviderLog({
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
      traceContext: normalizedTraceContext,
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
    const requestId = idFactory()
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
      expectedModel,
      prompt,
      promptCompiler,
      promptVariants,
      output,
      constraints,
      timeoutMs,
      signal,
      traceContext,
      referenceImages = [],
      referenceDataDir,
      textToImage = false,
      outputCount = REQUESTED_PROVIDER_OUTPUT_COUNT
    } = request
    const requestedOutputCount = normalizeProviderOutputCount(outputCount)
    const normalizedTraceContext = normalizeImageTraceContext(traceContext)
    const recordRequestLog = (entry) => recordLog({
      ...entry,
      details: {
        ...(entry.details || {}),
        traceContext: normalizedTraceContext
      }
    })
    const expectedModelKey = normalizeImageModelCapabilityKey(expectedModel)
    const configuredModelKey = normalizeImageModelCapabilityKey(config.model)
    if (expectedModelKey && expectedModelKey !== configuredModelKey) {
      const error = new Error('Image Provider model configuration changed; recompile the image prompt for the current Host model')
      error.code = 'image_model_configuration_changed'
      throw error
    }
    let normalizedReferenceImages
    if (textToImage === true) {
      if (!Array.isArray(referenceImages) || referenceImages.length !== 0) {
        throw new Error('Text-to-image requests cannot contain reference images')
      }
      normalizedReferenceImages = []
    } else {
      assertExactlyOneReferenceImage(referenceImages)
      normalizedReferenceImages = await normalizeReferenceImages(referenceImages, {
        dataDir: referenceDataDir || output?.dataDir
      })
      assertExactlyOneReferenceImage(normalizedReferenceImages)
    }
    const variants = normalizeProviderPromptVariants({
      variants: promptVariants,
      prompt,
      promptCompiler,
      constraints,
      model: config.model
    })
    const variantByModel = new Map(variants.map((variant) => [
      normalizeImageModelCapabilityKey(variant.model),
      variant
    ]))
    const primaryVariant = variantByModel.get(configuredModelKey)
    if (!primaryVariant) {
      throw new Error('Image Provider prompt variants do not include the current Host model')
    }
    const storedState = getStoredImageGenerationState()
    const workflowPolicy = createCreatorWorkflowModelPolicy({ config, storedState })
    const candidateModels = [
      config.model,
      ...(Array.isArray(workflowPolicy.fallbackModels) ? workflowPolicy.fallbackModels : [])
    ]
    const candidateVariants = candidateModels
      .map((model) => variantByModel.get(normalizeImageModelCapabilityKey(model)))
      .filter(Boolean)
    const normalizedPromptCompiler = primaryVariant.promptCompiler
    const startedMs = nowMs()
    const { relativeDir, targetDir } = ensureInsideDataDir({
      dataDir: output?.dataDir,
      dataRelativeDir: output?.dataRelativeDir
    })

    recordRequestLog({
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
        width: primaryVariant.constraints.width,
        height: primaryVariant.constraints.height,
        requestedTransparent: Boolean(primaryVariant.constraints.transparent),
        referenceImageCount: normalizedReferenceImages.length,
        ...(textToImage === true ? {} : { multipartImageField: 'image' }),
        requestedOutputCount
      }
    })

    let releaseProviderJobSlot = null
    try {
      releaseProviderJobSlot = await acquireProviderJobSlot({ config, requestId, signal })
      const totalTimeoutMs = normalizeTimeoutMs(timeoutMs, getProviderTimeoutMs(config))
      const deadlineMs = Date.now() + totalTimeoutMs
      const modelAttempts = []
      let result = null
      for (const [index, variant] of candidateVariants.entries()) {
        const remainingTimeoutMs = index === 0
          ? totalTimeoutMs
          : Math.max(1, deadlineMs - Date.now())
        const attemptStartedMs = Date.now()
        try {
          result = await generateProviderImage({
            config: { ...config, model: variant.model },
            prompt: variant.prompt,
            promptCompiler: variant.promptCompiler,
            targetDir,
            relativeDir,
            constraints: variant.constraints,
            requestId,
            timeoutMs: remainingTimeoutMs,
            referenceImages: normalizedReferenceImages,
            textToImage: textToImage === true,
            outputCount: requestedOutputCount,
            traceContext: normalizedTraceContext,
            signal
          })
          modelAttempts.push(createProviderModelAttempt({
            model: variant.model,
            ok: true,
            timeoutMs: remainingTimeoutMs,
            durationMs: Date.now() - attemptStartedMs,
            requestId,
            traceContext: normalizedTraceContext
          }))
          break
        } catch (error) {
          if (signal?.aborted) throw createAbortError(signal.reason)
          modelAttempts.push(createProviderModelAttempt({
            model: variant.model,
            ok: false,
            timeoutMs: remainingTimeoutMs,
            durationMs: Date.now() - attemptStartedMs,
            error: error?.message || error,
            errorCode: error?.code,
            httpStatus: error?.httpStatus,
            requestId,
            traceContext: normalizedTraceContext
          }))
          const hasFallback = index < candidateVariants.length - 1 && Date.now() < deadlineMs
          if (!hasFallback || !shouldTryFallbackImageModel(error)) {
            error.modelAttempts = modelAttempts
            throw error
          }
        }
      }
      if (!result) throw new Error('Image Provider generation exhausted all Host model candidates')
      result.modelAttempts = modelAttempts
      recordRequestLog({
        level: 'info',
        event: 'imageGeneration.request.completed',
        message: 'Image generation request completed',
        details: {
          ...createProviderOperationDetails({
            capability: 'image',
            operation: 'generate',
            config: { ...config, model: result.model },
            configSource: 'image',
            requestId,
            outcome: 'completed'
          }),
          requestId,
          provider: config.provider,
          model: result.model,
          durationMs: nowMs() - startedMs,
          outputCount: result.outputs?.length || 0
        }
      })
      return result
    } catch (error) {
      recordRequestLog({
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
    getHealthCacheRevision,
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
