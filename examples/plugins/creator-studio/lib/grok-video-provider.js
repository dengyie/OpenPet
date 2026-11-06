const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const {
  DEFAULT_REQUEST_TIMEOUT_MS,
  discoverVideoModels,
  fetchBytes,
  fetchJson,
  isGrokVideoModel,
  normalizeApiKey,
  normalizeBaseUrl,
  providerCapabilityError
} = require('./video-provider-capabilities')

const DEFAULT_POLL_INTERVAL_MS = 5_000
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024 * 1024
const MAX_PROMPT_LENGTH = 8_000
const SAFE_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
const TERMINAL_SUCCESS = new Set(['completed', 'complete', 'succeeded', 'success', 'done'])
const TERMINAL_FAILURE = new Set(['failed', 'failure', 'canceled', 'cancelled', 'error'])

const grokVideoError = (message, code = 'grok_video_provider_invalid', details = {}) => {
  const error = providerCapabilityError(message, code, details)
  error.name = 'GrokVideoProviderError'
  return error
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(signal.reason || grokVideoError('video generation was canceled', 'video_provider_canceled'))
    return
  }
  const cleanup = () => signal?.removeEventListener('abort', onAbort)
  const onResolve = () => {
    cleanup()
    resolve()
  }
  const onAbort = () => {
    clearTimeout(timer)
    cleanup()
    reject(signal.reason || grokVideoError('video generation was canceled', 'video_provider_canceled'))
  }
  const timer = setTimeout(onResolve, ms)
  signal?.addEventListener('abort', onAbort, { once: true })
})

const normalizeTaskId = (payload) => {
  const value = payload?.id || payload?.task_id || payload?.taskId || payload?.data?.id || payload?.data?.task_id
  const taskId = String(value || '').trim()
  if (!taskId || taskId.length > 256 || /[\u0000-\u001f\u007f]/.test(taskId)) throw grokVideoError('video provider did not return a task id', 'video_provider_invalid_response')
  return taskId
}

const normalizeStatus = (payload) => String(payload?.status || payload?.state || payload?.data?.status || '').trim().toLowerCase()

const scrubFailureText = (value, secret = '') => String(value || '')
  .replace(secret ? new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : /$^/, '[redacted]')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
  .replace(/data:[^,\s]+,[A-Za-z0-9+/=]{24,}/gi, 'data:[redacted]')
  .replace(/\b(?:api[\s_-]*key|secret|credential|token)\b/gi, '[redacted]')
  .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/gi, '[redacted]')
  .replace(/https?:\/\/\S+/gi, '[url]')
  .trim()
  .slice(0, 240)

const terminalFailureDetail = (payload, secret = '') => {
  const nested = payload?.error && typeof payload.error === 'object' ? payload.error : payload
  const code = scrubFailureText(nested?.code || payload?.code, secret)
  const message = scrubFailureText(nested?.message || payload?.message || (typeof payload?.error === 'string' ? payload.error : ''), secret)
  if (!code && !message) return { detail: '', retryable: false }
  const retryable = typeof nested?.retryable === 'boolean'
    ? nested.retryable
    : typeof payload?.retryable === 'boolean'
      ? payload.retryable
      : /(?:timeout|timed out|deadline|connect|connection|temporar|overload|rate.?limit|\b429\b|\b5\d\d\b|unavailable|try again)/i.test(`${code} ${message}`)
  return { detail: [code, message].filter(Boolean).join(': '), retryable }
}

const normalizePrompt = (value) => {
  const prompt = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) throw grokVideoError('video prompt is invalid')
  return prompt
}

const normalizePositiveInteger = (value, label, min, max) => {
  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) throw grokVideoError(`${label} is invalid`)
  return normalized
}

const VIDEO_ASPECT_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'])

const normalizeAspectRatio = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return '16:9'
  if (VIDEO_ASPECT_RATIOS.has(raw)) return raw
  const match = /^(\d{2,5})x(\d{2,5})$/i.exec(raw)
  if (!match) throw grokVideoError('video aspect ratio is invalid')
  const width = Number(match[1])
  const height = Number(match[2])
  const divisor = (a, b) => {
    while (b) [a, b] = [b, a % b]
    return a
  }
  const ratio = `${width / divisor(width, height)}:${height / divisor(width, height)}`
  if (!VIDEO_ASPECT_RATIOS.has(ratio)) throw grokVideoError('video aspect ratio is invalid')
  return ratio
}

const createRequestBody = ({ model, prompt, referenceDataUrl, seconds, size, request = {} } = {}) => {
  const body = { model, prompt }
  // Use Grok's native first-frame contract. A top-level image_url can be
  // discarded by generic gateway task parsing, silently generating without it.
  if (referenceDataUrl) body.image = { url: referenceDataUrl }
  if (seconds !== undefined) body.duration = seconds
  body.aspect_ratio = normalizeAspectRatio(request.aspect_ratio || size)
  body.resolution = String(request.resolution || '720p').trim().toLowerCase()
  if (!['480p', '720p', '1080p'].includes(body.resolution)) throw grokVideoError('video resolution is invalid')
  return body
}

const readReferenceDataUrl = async ({ referenceDataUrl, referencePath, referenceMimeType = 'image/png' } = {}) => {
  if (referenceDataUrl !== undefined) {
    const value = String(referenceDataUrl || '').trim()
    if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(value)) throw grokVideoError('video reference data URL is invalid')
    return value
  }
  if (!referencePath) return undefined
  const absolute = path.resolve(String(referencePath))
  const mimeType = String(referenceMimeType || '').toLowerCase()
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw grokVideoError('video reference MIME type is invalid')
  let bytes
  try {
    bytes = await fs.readFile(absolute)
  } catch {
    throw grokVideoError('video reference could not be read', 'video_reference_unavailable')
  }
  if (!bytes.length || bytes.length > 16 * 1024 * 1024) throw grokVideoError('video reference size is invalid')
  return `data:${mimeType};base64,${bytes.toString('base64')}`
}

const extractContentUrl = (payload) => {
  const value = payload?.url || payload?.content_url || payload?.download_url || payload?.data?.url || payload?.data?.content_url
  if (!value) return ''
  try {
    const url = new URL(String(value))
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    return url.toString()
  } catch {
    return ''
  }
}

const validateDownloadUrl = (value, baseUrl) => {
  let url
  let base
  try {
    url = new URL(String(value || ''))
    base = new URL(baseUrl)
  } catch {
    return ''
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return ''
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0' || hostname.startsWith('10.') || hostname.startsWith('192.168.') || /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname)) return ''
  if (url.origin === base.origin) return url.toString()
  return url.toString()
}

const throwIfAborted = (signal) => {
  if (signal?.aborted) throw signal.reason || grokVideoError('video generation was canceled', 'video_provider_canceled')
}

const createGrokVideoProvider = ({ baseUrl, apiKey, fetchImpl = globalThis.fetch, sleepImpl = sleep } = {}) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const normalizedApiKey = normalizeApiKey(apiKey)
  if (typeof fetchImpl !== 'function') throw grokVideoError('video provider fetch implementation is required')
  if (typeof sleepImpl !== 'function') throw grokVideoError('video provider sleep implementation is required')

  const requestJson = (options) => fetchJson({
    fetchImpl,
    baseUrl: normalizedBaseUrl,
    apiKey: normalizedApiKey,
    ...options
  })

  const discoverModels = (options = {}) => discoverVideoModels({
    baseUrl: normalizedBaseUrl,
    apiKey: normalizedApiKey,
    fetchImpl,
    ...options
  })

  const generateVideo = async ({
    model,
    prompt,
    referenceDataUrl,
    referencePath,
    referenceMimeType,
    seconds,
    size,
    request,
    outputDir,
    outputFileName = 'video.mp4',
    signal,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxPolls = 120,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    onProgress
  } = {}) => {
    const normalizedModel = String(model || '').trim()
    if (!isGrokVideoModel(normalizedModel)) throw grokVideoError('video model is not supported', 'video_model_unsupported')
    const normalizedPrompt = normalizePrompt(prompt)
    const normalizedOutputDir = path.resolve(String(outputDir || ''))
    if (!outputDir || normalizedOutputDir === path.parse(normalizedOutputDir).root) throw grokVideoError('video output directory is invalid')
    const normalizedFileName = String(outputFileName || '').trim()
    if (!SAFE_FILENAME.test(normalizedFileName) || !/\.(?:mp4|webm|mov)$/i.test(normalizedFileName)) throw grokVideoError('video output file name is invalid')
    const normalizedPollInterval = normalizePositiveInteger(pollIntervalMs, 'pollIntervalMs', 100, 60_000)
    const normalizedMaxPolls = normalizePositiveInteger(maxPolls, 'maxPolls', 1, 720)
    const normalizedMaxBytes = normalizePositiveInteger(maxOutputBytes, 'maxOutputBytes', 1, 2 * 1024 * 1024 * 1024)
    const normalizedSeconds = seconds === undefined ? undefined : normalizePositiveInteger(seconds, 'seconds', 1, 30)
    const normalizedSize = size === undefined ? undefined : String(size).trim()
    if (normalizedSize !== undefined && !/^\d{2,5}x\d{2,5}$/.test(normalizedSize)) throw grokVideoError('video size is invalid')

    const outputPath = path.join(normalizedOutputDir, normalizedFileName)
    // A repair must never spend another Provider call on an occupied destination.
    // Keep the exclusive write below as the final guard against concurrent writes.
    try {
      await fs.lstat(outputPath)
      throw grokVideoError('video output file already exists', 'video_output_conflict', { retryable: false })
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await fs.mkdir(normalizedOutputDir, { recursive: true })
    const reference = await readReferenceDataUrl({ referenceDataUrl, referencePath, referenceMimeType })
    throwIfAborted(signal)
    let submit
    try {
      submit = await requestJson({
        url: `${normalizedBaseUrl}/videos`,
        method: 'POST',
        body: createRequestBody({ model: normalizedModel, prompt: normalizedPrompt, referenceDataUrl: reference, seconds: normalizedSeconds, size: normalizedSize, request }),
        signal,
        timeoutMs
      })
    } catch (error) {
      throwIfAborted(signal)
      // A timeout or intermediary 5xx does not prove POST was rejected. The
      // caller retries whole generations, so replay would risk a second task.
      error.retryable = false
      error.stage = 'submit'
      throw error
    }
    throwIfAborted(signal)
    const taskId = normalizeTaskId(submit)
    const readAcceptedTask = async (stage, read) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await read()
        } catch (error) {
          throwIfAborted(signal)
          if (attempt === 0 && error.retryable === true && !signal?.aborted) {
            await sleepImpl(normalizedPollInterval, signal)
            throwIfAborted(signal)
            continue
          }
          // Keep the paid task identity available for diagnosis. Exhausted
          // reads must never become a fresh POST in runVideoAction's retry.
          error.retryable = false
          error.taskId = taskId
          error.stage = stage
          throw error
        }
      }
    }
    let statusPayload = submit
    for (let poll = 0; poll < normalizedMaxPolls; poll += 1) {
      const status = normalizeStatus(statusPayload)
      onProgress?.({ taskId, status: status || 'queued', poll: poll + 1, maxPolls: normalizedMaxPolls })
      if (TERMINAL_SUCCESS.has(status)) break
      if (TERMINAL_FAILURE.has(status)) {
        const failure = terminalFailureDetail(statusPayload, normalizedApiKey)
        throw Object.assign(grokVideoError(
          failure.detail ? `video provider generation failed: ${failure.detail}` : 'video provider generation failed',
          'video_generation_failed',
          { retryable: failure.retryable }
        ), { taskId, stage: 'poll' })
      }
      if (poll === normalizedMaxPolls - 1) {
        throw Object.assign(grokVideoError('video provider polling timed out', 'video_provider_timeout', { retryable: false }), { taskId, stage: 'poll' })
      }
      await sleepImpl(normalizedPollInterval, signal)
      throwIfAborted(signal)
      statusPayload = await readAcceptedTask('poll', () => requestJson({ url: `${normalizedBaseUrl}/videos/${encodeURIComponent(taskId)}`, signal, timeoutMs }))
    }

    throwIfAborted(signal)
    let contentResult = await readAcceptedTask('content', () => fetchBytes({
      fetchImpl,
      url: `${normalizedBaseUrl}/videos/${encodeURIComponent(taskId)}/content`,
      apiKey: normalizedApiKey,
      signal,
      timeoutMs,
      accept: 'video/*,application/json',
      maxBytes: normalizedMaxBytes
    }))
    throwIfAborted(signal)
    let contentBytes = contentResult.bytes
    let contentType = String(contentResult.response.headers?.get?.('content-type') || '').split(';')[0].toLowerCase()
    if (contentType === 'application/json' || contentType.endsWith('+json')) {
      let contentPayload
      try {
        contentPayload = JSON.parse(contentBytes.toString('utf8'))
      } catch {
        throw grokVideoError('video provider content response is invalid', 'video_provider_invalid_response')
      }
      const contentUrl = validateDownloadUrl(extractContentUrl(contentPayload), normalizedBaseUrl)
      if (!contentUrl) throw grokVideoError('video provider content response is invalid', 'video_provider_invalid_response')
      contentResult = await readAcceptedTask('content', () => fetchBytes({ fetchImpl, url: contentUrl, apiKey: '', signal, timeoutMs, accept: 'video/*', maxBytes: normalizedMaxBytes }))
      throwIfAborted(signal)
      contentBytes = contentResult.bytes
      contentType = String(contentResult.response.headers?.get?.('content-type') || '').split(';')[0].toLowerCase()
    }
    if (!contentBytes.length || contentBytes.length > normalizedMaxBytes) throw grokVideoError('video content size is invalid', 'video_content_too_large')
    if (!VIDEO_MIME_TYPES.has(contentType)) contentType = normalizedFileName.endsWith('.webm') ? 'video/webm' : normalizedFileName.endsWith('.mov') ? 'video/quicktime' : 'video/mp4'
    await fs.writeFile(outputPath, contentBytes, { flag: 'wx' }).catch(async (error) => {
      if (error.code !== 'EEXIST') throw error
      throw grokVideoError('video output file already exists', 'video_output_conflict', { retryable: false })
    })
    const sha256 = crypto.createHash('sha256').update(contentBytes).digest('hex')
    onProgress?.({ taskId, status: 'downloaded', poll: undefined, maxPolls: normalizedMaxPolls })
    return Object.freeze({ taskId, relativePath: normalizedFileName, absolutePath: outputPath, sha256, mimeType: contentType, byteLength: contentBytes.length, model: normalizedModel })
  }

  return Object.freeze({ provider: 'mango-api', baseUrl: normalizedBaseUrl, discoverModels, generateVideo })
}

module.exports = {
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_POLL_INTERVAL_MS,
  createGrokVideoProvider,
  grokVideoError,
  readReferenceDataUrl
}
