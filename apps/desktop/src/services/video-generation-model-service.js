const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const {
  createGrokVideoProvider,
  DEFAULT_MAX_OUTPUT_BYTES
} = require('../../../../examples/plugins/creator-studio/lib/grok-video-provider')
const {
  isGrokVideoModel,
  normalizeBaseUrl
} = require('../../../../examples/plugins/creator-studio/lib/video-provider-capabilities')

const DEFAULT_VIDEO_TIMEOUT_MS = 300_000
const DEFAULT_VIDEO_CONFIG = Object.freeze({
  provider: 'openai-compatible',
  baseUrl: 'https://api.mangoqwq.com/v1',
  model: 'grok-imagine-video-1.5',
  apiKeyRef: 'secret:model.video.openai-compatible.apiKey',
  timeoutMs: DEFAULT_VIDEO_TIMEOUT_MS,
  maxConcurrentJobs: 1
})
const MAX_VIDEO_PROMPT_LENGTH = 8_000
const SAFE_RELATIVE_DIR = /^(?!\/)(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/
const SAFE_FILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/

const videoServiceError = (message, code = 'video_generation_invalid') => Object.assign(new Error(message), { code })
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value))

const containedPath = ({ root, relativePath, label, mustExist = false } = {}) => {
  const rootPath = path.resolve(String(root || ''))
  const normalized = String(relativePath || '').trim().replace(/\\/g, '/')
  if (!rootPath || !SAFE_RELATIVE_DIR.test(normalized) || normalized.split('/').includes('..')) {
    throw videoServiceError(`${label} must be a safe relative path`)
  }
  const target = path.resolve(rootPath, ...normalized.split('/'))
  const relative = path.relative(rootPath, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw videoServiceError(`${label} escaped data directory`)
  if (mustExist && (!fs.existsSync(target) || !fs.statSync(target).isFile())) throw videoServiceError(`${label} is missing`)
  return target
}

const normalizeReference = ({ dataDir, reference } = {}) => {
  if (!isPlainObject(reference)) throw videoServiceError('video reference image is invalid')
  const relativePath = String(reference.relativePath || '').trim().replace(/\\/g, '/')
  const filePath = reference.path
    ? path.resolve(String(reference.path))
    : containedPath({ root: dataDir, relativePath, label: 'video reference image', mustExist: true })
  const root = path.resolve(String(dataDir || ''))
  const relative = path.relative(root, filePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw videoServiceError('video reference image must stay inside Creator data directory')
  }
  return {
    path: filePath,
    relativePath: relative.split(path.sep).join('/'),
    fileName: String(reference.fileName || path.basename(filePath)).slice(0, 256),
    mimeType: String(reference.mimeType || 'image/png').toLowerCase(),
    sha256: String(reference.sha256 || reference.contentHash || '').trim().toLowerCase()
  }
}

const createVideoGenerationModelService = ({
  settingsService,
  secretService,
  fetchImpl = globalThis.fetch,
  appLogService,
  idFactory = () => crypto.randomUUID(),
  now = () => new Date()
} = {}) => {
  if (!settingsService?.get) throw new Error('video generation settingsService is required')
  if (!secretService?.getSecretValue) throw new Error('video generation secretService is required')

  const getStoredConfig = () => {
    const values = settingsService.get() || {}
    const config = values?.models?.videoGeneration
    return { ...DEFAULT_VIDEO_CONFIG, ...(isPlainObject(config) ? config : {}) }
  }

  const getConfig = () => {
    const config = getStoredConfig()
    const apiKeyRef = String(config.apiKeyRef || DEFAULT_VIDEO_CONFIG.apiKeyRef)
    return Object.freeze({
      provider: String(config.provider || DEFAULT_VIDEO_CONFIG.provider),
      baseUrl: String(config.baseUrl || DEFAULT_VIDEO_CONFIG.baseUrl),
      model: String(config.model || DEFAULT_VIDEO_CONFIG.model),
      apiKeyRef,
      timeoutMs: Math.max(1_000, Number(config.timeoutMs) || DEFAULT_VIDEO_TIMEOUT_MS),
      maxConcurrentJobs: Math.max(1, Number(config.maxConcurrentJobs) || 1),
      hasApiKey: Boolean(secretService.getSecretValue(apiKeyRef)),
      apiKeyPreview: (() => {
        const value = String(secretService.getSecretValue(apiKeyRef) || '')
        return value ? `••••${value.slice(-4)}` : ''
      })(),
      apiKeyLabel: 'Video API Key',
      modelCatalog: isPlainObject(config.modelCatalog) ? {
        cacheKey: String(config.modelCatalog.cacheKey || ''),
        models: Array.isArray(config.modelCatalog.models) ? config.modelCatalog.models.filter((model) => typeof model === 'string') : [],
        fetchedAt: String(config.modelCatalog.fetchedAt || ''),
        source: config.modelCatalog.source === 'saved' ? 'saved' : 'none'
      } : { cacheKey: '', models: [], fetchedAt: '', source: 'none' },
      modelFamily: 'grok-video'
    })
  }

  const persistConfig = (next) => {
    const current = settingsService.get() || {}
    if (typeof settingsService.saveVideo === 'function') {
      return settingsService.saveVideo(next)
    }
    return settingsService.save({
      ...current,
      models: { ...(isPlainObject(current.models) ? current.models : {}), videoGeneration: next }
    })
  }

  const saveConfig = (partial = {}) => {
    if (!isPlainObject(partial)) throw videoServiceError('Video Provider config must be an object')
    if (Object.hasOwn(partial, 'apiKeyRef') && partial.apiKeyRef !== DEFAULT_VIDEO_CONFIG.apiKeyRef) {
      throw videoServiceError('Video Provider apiKeyRef is owner-controlled', 'video_provider_owner_field')
    }
    const current = getStoredConfig()
    const next = {
      ...current,
      ...partial,
      provider: String(partial.provider ?? current.provider).trim(),
      baseUrl: normalizeBaseUrl(partial.baseUrl ?? current.baseUrl),
      model: String(partial.model ?? current.model).trim(),
      apiKeyRef: DEFAULT_VIDEO_CONFIG.apiKeyRef,
      timeoutMs: Math.max(1_000, Math.min(600_000, Number(partial.timeoutMs ?? current.timeoutMs) || DEFAULT_VIDEO_TIMEOUT_MS)),
      maxConcurrentJobs: Math.max(1, Math.min(8, Number(partial.maxConcurrentJobs ?? current.maxConcurrentJobs) || 1))
    }
    if (!isGrokVideoModel(next.model)) throw videoServiceError('Video Provider model must be a supported Grok video model', 'video_model_unsupported')
    const saved = persistConfig(next)
    return saved && typeof saved.then === 'function' ? saved.then(() => getConfig()) : getConfig()
  }

  const saveProviderApiKey = (apiKey) => {
    const normalized = String(apiKey || '').trim()
    if (!normalized || normalized.length > 4096) throw videoServiceError('Video API key is invalid')
    if (typeof secretService.setSecret !== 'function') throw videoServiceError('Video API key persistence is unavailable', 'video_secret_unavailable')
    const result = secretService.setSecret({ id: DEFAULT_VIDEO_CONFIG.apiKeyRef, value: normalized })
    return result && typeof result.then === 'function'
      ? result.then(() => ({ apiKeyRef: DEFAULT_VIDEO_CONFIG.apiKeyRef, hasApiKey: true, apiKeyPreview: `••••${normalized.slice(-4)}` }))
      : { apiKeyRef: DEFAULT_VIDEO_CONFIG.apiKeyRef, hasApiKey: true, apiKeyPreview: `••••${normalized.slice(-4)}` }
  }

  const clearProviderApiKey = () => {
    if (typeof secretService.deleteSecret !== 'function') throw videoServiceError('Video API key persistence is unavailable', 'video_secret_unavailable')
    const result = secretService.deleteSecret(DEFAULT_VIDEO_CONFIG.apiKeyRef)
    return result && typeof result.then === 'function'
      ? result.then(() => ({ apiKeyRef: DEFAULT_VIDEO_CONFIG.apiKeyRef, hasApiKey: false, apiKeyPreview: '' }))
      : { apiKeyRef: DEFAULT_VIDEO_CONFIG.apiKeyRef, hasApiKey: false, apiKeyPreview: '' }
  }

  const recordLog = (entry) => {
    try {
      appLogService?.record?.({ actor: 'system', scope: 'video-generation', ...entry })
    } catch (_) {}
  }

  const discoverModels = async ({ signal, timeoutMs } = {}) => {
    const config = getConfig()
    const apiKey = secretService.getSecretValue(config.apiKeyRef)
    if (!apiKey) throw videoServiceError('Video generation API key is missing', 'video_missing_api_key')
    const provider = createGrokVideoProvider({ baseUrl: config.baseUrl, apiKey, fetchImpl })
    const result = await provider.discoverModels({ signal, timeoutMs: timeoutMs || config.timeoutMs })
    const models = Array.isArray(result.videoModels)
      ? result.videoModels
      : (Array.isArray(result.models) ? result.models.filter(isGrokVideoModel) : [])
    const current = getStoredConfig()
    const nextCatalog = { cacheKey: `video:${config.provider}:${config.baseUrl}`, models, fetchedAt: new Date().toISOString(), source: 'saved' }
    const persisted = persistConfig({ ...current, modelCatalog: nextCatalog })
    if (persisted && typeof persisted.then === 'function') await persisted
    return Object.freeze({ ...result, models, videoModels: models, model: config.model, hasApiKey: true })
  }

  const generateVideo = async ({
    model,
    prompt,
    referenceImages = [],
    output = {},
    seconds,
    size,
    request,
    timeoutMs,
    pollIntervalMs,
    maxPolls,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    runId = '',
    signal,
    onProgress
  } = {}) => {
    const config = getConfig()
    const normalizedModel = String(model || config.model || '').trim()
    if (!isGrokVideoModel(normalizedModel)) throw videoServiceError('Selected model is not a supported Grok video model', 'video_model_unsupported')
    const normalizedPrompt = String(prompt || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
    if (!normalizedPrompt || normalizedPrompt.length > MAX_VIDEO_PROMPT_LENGTH) throw videoServiceError('Video prompt is invalid')
    if (!Array.isArray(referenceImages) || referenceImages.length !== 1) throw videoServiceError('Video generation requires exactly one reference image', 'video_reference_contract_invalid')
    const dataDir = path.resolve(String(output.dataDir || ''))
    const reference = normalizeReference({ dataDir, reference: referenceImages[0] })
    const dataRelativeDir = String(output.dataRelativeDir || '').trim().replace(/\\/g, '/')
    const outputDir = containedPath({ root: dataDir, relativePath: dataRelativeDir, label: 'video output directory' })
    fs.mkdirSync(outputDir, { recursive: true })
    const requestId = String(runId || idFactory()).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100) || idFactory()
    const outputFileName = SAFE_FILE_NAME.test(String(output.fileName || ''))
      ? String(output.fileName)
      : `${requestId}-${Date.now()}.mp4`
    const apiKey = secretService.getSecretValue(config.apiKeyRef)
    if (!apiKey) throw videoServiceError('Video generation API key is missing', 'video_missing_api_key')
    const provider = createGrokVideoProvider({ baseUrl: normalizeBaseUrl(config.baseUrl), apiKey, fetchImpl })
    const startedAt = now()
    recordLog({ level: 'info', event: 'videoGeneration.request.started', message: 'Video Provider request started', details: { runId: String(runId || ''), model: normalizedModel, provider: config.provider, baseUrlHost: new URL(config.baseUrl).host } })
    try {
      const generated = await provider.generateVideo({
        model: normalizedModel,
        prompt: normalizedPrompt,
        referencePath: reference.path,
        referenceMimeType: reference.mimeType,
        seconds,
        size,
        request,
        outputDir,
        outputFileName,
        signal,
        timeoutMs: timeoutMs || config.timeoutMs,
        pollIntervalMs,
        maxPolls,
        maxOutputBytes,
        onProgress
      })
      const relativePath = path.relative(dataDir, generated.absolutePath).split(path.sep).join('/')
      const result = {
        ok: true,
        provider: 'mango-api',
        model: normalizedModel,
        generatedAt: now().toISOString(),
        requestId,
        result: {
          outputs: [{
            dataRelativePath: relativePath,
            mimeType: generated.mimeType,
            sha256: generated.sha256,
            byteLength: generated.byteLength,
            taskId: generated.taskId
          }],
          taskId: generated.taskId
        }
      }
      recordLog({ level: 'info', event: 'videoGeneration.request.completed', message: 'Video Provider request completed', details: { runId: String(runId || ''), model: normalizedModel, durationMs: now().getTime() - startedAt.getTime(), byteLength: generated.byteLength } })
      return result
    } catch (error) {
      recordLog({ level: 'error', event: 'videoGeneration.request.failed', message: 'Video Provider request failed', details: { runId: String(runId || ''), model: normalizedModel, durationMs: now().getTime() - startedAt.getTime(), errorCode: String(error?.code || 'video_provider_error') } })
      throw error
    }
  }

  return Object.freeze({ getConfig, saveConfig, saveProviderApiKey, clearProviderApiKey, discoverModels, generateVideo })
}

module.exports = {
  DEFAULT_VIDEO_TIMEOUT_MS,
  DEFAULT_VIDEO_CONFIG,
  createVideoGenerationModelService,
  videoServiceError
}
