#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_CHAT_MODEL = 'gpt-5.5'
const DEFAULT_IMAGE_MODEL = 'gpt-image-2'
const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_API_KEY_ENV = 'OPENPET_AI_PROVIDER_API_KEY'

const usage = () => [
  'Usage: node scripts/run-ai-provider-smoke.js --base-url <url> [options]',
  '',
  'Options:',
  `  --api-key-env <name>       Environment variable containing the Provider API key (default: ${DEFAULT_API_KEY_ENV})`,
  '  --api-key <key>            Direct API key value; prefer --api-key-env for shell history safety',
  `  --chat-model <model>       Chat model to test (default: ${DEFAULT_CHAT_MODEL})`,
  `  --image-model <model>      Image model to test when --include-image is set (default: ${DEFAULT_IMAGE_MODEL})`,
  '  --include-image            Run /images/generations. This may spend real provider credits.',
  '  --output <report.json>     Write the sanitized JSON smoke report to this path',
  `  --timeout-ms <ms>          Per-request timeout (default: ${DEFAULT_TIMEOUT_MS})`,
  '  --json                     Print the sanitized JSON report to stdout',
  '  --help',
  '',
  'The report never writes the raw API key. Real provider success still requires',
  'a reachable gateway, a valid key, and provider support for the selected models.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const normalizeProviderBaseUrl = (value) => {
  const raw = String(value || '').trim().replace(/\/+$/, '')
  if (!raw) throw new Error('Base URL is required')
  let parsed
  try {
    parsed = new URL(raw)
  } catch (_) {
    throw new Error('Base URL must be a valid URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Base URL must use HTTP or HTTPS')
  if (parsed.username || parsed.password) throw new Error('Base URL must not include credentials')
  if (parsed.search || parsed.hash) throw new Error('Base URL must not include query or hash')
  return parsed.toString().replace(/\/+$/, '')
}

const assertModel = (value, label) => {
  const model = String(value || '').trim()
  if (!model) throw new Error(`${label} is required`)
  return model
}

const parsePositiveInt = (value, label) => {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`)
  return number
}

const maskApiKey = (value) => {
  const key = String(value || '')
  if (!key) return ''
  if (key.length <= 8) return 'configured'
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}

const parseArgs = (argv, env = process.env) => {
  const options = {
    baseUrl: '',
    apiKey: '',
    apiKeyEnv: DEFAULT_API_KEY_ENV,
    chatModel: DEFAULT_CHAT_MODEL,
    imageModel: DEFAULT_IMAGE_MODEL,
    includeImage: false,
    outputPath: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--base-url') {
      options.baseUrl = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--api-key-env') {
      options.apiKeyEnv = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--api-key') {
      options.apiKey = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--chat-model') {
      options.chatModel = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--image-model') {
      options.imageModel = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--include-image') {
      options.includeImage = true
    } else if (arg === '--output') {
      options.outputPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (options.help) return options
  const apiKey = options.apiKey || env[options.apiKeyEnv] || ''
  return {
    ...options,
    baseUrl: normalizeProviderBaseUrl(options.baseUrl),
    apiKey: String(apiKey || '').trim(),
    chatModel: assertModel(options.chatModel, 'Chat model'),
    imageModel: assertModel(options.imageModel, 'Image model'),
    timeoutMs: parsePositiveInt(options.timeoutMs, 'Timeout MS')
  }
}

const nowMs = () => Date.now()

const sanitizeMessage = (message, apiKey) => {
  const key = String(apiKey || '')
  const text = key
    ? String(message || '').replaceAll(key, '[redacted]').trim()
    : String(message || '').trim()
  return text.slice(0, 240)
}

const parseJsonResponse = async (response) => {
  const text = await response.text().catch(() => '')
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch (_) {
    return { message: text.slice(0, 240) }
  }
}

const fetchJson = async ({ fetchImpl, baseUrl, apiKey, timeoutMs, method, endpoint, body }) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = nowMs()
  try {
    const response = await fetchImpl(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: body ? JSON.stringify(body) : undefined
    })
    const data = await parseJsonResponse(response)
    return {
      ok: response.ok,
      statusCode: response.status,
      elapsedMs: nowMs() - startedAt,
      data
    }
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      elapsedMs: nowMs() - startedAt,
      data: {},
      errorName: error?.name || 'Error',
      errorMessage: error?.name === 'AbortError' ? 'request timed out' : error?.message
    }
  } finally {
    clearTimeout(timeout)
  }
}

const extractProviderMessage = (data, apiKey) => sanitizeMessage(data?.error?.message || data?.message || data?.msg || '', apiKey)

const extractModels = (data) => {
  const source = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.models)
      ? data.models
      : []
  const models = []
  for (const entry of source) {
    const id = typeof entry === 'string' ? entry.trim() : String(entry?.id || '').trim()
    if (id && !models.includes(id)) models.push(id)
  }
  return models
}

const createFailCheck = ({ id, response, apiKey, message }) => ({
  id,
  status: 'fail',
  statusCode: response?.statusCode || 0,
  elapsedMs: response?.elapsedMs || 0,
  message: sanitizeMessage(message || response?.errorMessage || extractProviderMessage(response?.data, apiKey) || 'request failed', apiKey)
})

const checkModels = async (context) => {
  const response = await fetchJson({ ...context, method: 'GET', endpoint: '/models' })
  if (!response.ok) {
    if ([404, 405, 501].includes(Number(response.statusCode))) {
      return {
        id: 'models',
        status: 'warning',
        statusCode: response.statusCode,
        elapsedMs: response.elapsedMs,
        message: 'optional /models probe is unavailable on this provider'
      }
    }
    return createFailCheck({ id: 'models', response, apiKey: context.apiKey })
  }

  const discovered = extractModels(response.data)
  const containsChatModel = discovered.includes(context.chatModel)
  const containsImageModel = discovered.includes(context.imageModel)
  const missing = []
  if (!containsChatModel) missing.push(`chat model ${context.chatModel}`)
  if (context.includeImage && !containsImageModel) missing.push(`image model ${context.imageModel}`)
  return {
    id: 'models',
    status: missing.length ? 'fail' : 'pass',
    statusCode: response.statusCode,
    elapsedMs: response.elapsedMs,
    discoveredModelCount: discovered.length,
    containsChatModel,
    containsImageModel,
    models: discovered.slice(0, 20),
    message: missing.length ? `missing ${missing.join(' and ')} in /models response` : 'selected models are present or image check is disabled'
  }
}

const checkChat = async (context) => {
  const response = await fetchJson({
    ...context,
    method: 'POST',
    endpoint: '/chat/completions',
    body: {
      model: context.chatModel,
      messages: [
        { role: 'system', content: 'You are an OpenPet provider smoke test. Reply concisely.' },
        { role: 'user', content: 'Reply with OK.' }
      ]
    }
  })
  if (!response.ok) return createFailCheck({ id: 'chat-completions', response, apiKey: context.apiKey })
  const reply = String(response.data?.choices?.[0]?.message?.content || response.data?.choices?.[0]?.text || '')
  return {
    id: 'chat-completions',
    status: reply ? 'pass' : 'fail',
    statusCode: response.statusCode,
    elapsedMs: response.elapsedMs,
    replyChars: reply.length,
    message: reply ? 'chat completion returned text' : 'chat completion returned no text'
  }
}

const buildImagePayload = ({ imageModel }) => {
  const payload = {
    model: imageModel,
    prompt: 'OpenPet provider smoke test: a tiny transparent desktop pet silhouette, simple shape, no text.',
    size: '1024x1024'
  }
  if (imageModel !== DEFAULT_IMAGE_MODEL) {
    payload.background = 'transparent'
    payload.response_format = 'b64_json'
  }
  return payload
}

const checkImage = async (context) => {
  if (!context.includeImage) {
    return {
      id: 'image-generations',
      status: 'skipped',
      message: 'image generation is opt-in; pass --include-image to run this potentially billable check'
    }
  }
  const payload = buildImagePayload(context)
  const response = await fetchJson({
    ...context,
    method: 'POST',
    endpoint: '/images/generations',
    body: payload
  })
  if (!response.ok) return createFailCheck({ id: 'image-generations', response, apiKey: context.apiKey })
  const data = Array.isArray(response.data?.data) ? response.data.data : []
  const imageCount = data.filter((entry) => entry?.b64_json || entry?.url).length
  return {
    id: 'image-generations',
    status: imageCount > 0 ? 'pass' : 'fail',
    statusCode: response.statusCode,
    elapsedMs: response.elapsedMs,
    imageCount,
    backgroundMode: Object.hasOwn(payload, 'background') ? payload.background : 'omitted',
    message: imageCount > 0 ? 'image generation returned image output metadata' : 'image generation returned no image output'
  }
}

const runAiProviderSmoke = async ({
  baseUrl,
  apiKey,
  chatModel = DEFAULT_CHAT_MODEL,
  imageModel = DEFAULT_IMAGE_MODEL,
  includeImage = false,
  outputPath = '',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  now = () => new Date()
} = {}) => {
  const normalizedBaseUrl = normalizeProviderBaseUrl(baseUrl)
  const normalizedChatModel = assertModel(chatModel, 'Chat model')
  const normalizedImageModel = assertModel(imageModel, 'Image model')
  const normalizedTimeoutMs = parsePositiveInt(timeoutMs, 'Timeout MS')
  const normalizedApiKey = String(apiKey || '').trim()
  if (!normalizedApiKey) throw new Error('API key is required. Prefer --api-key-env over --api-key.')
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available')

  const context = {
    fetchImpl,
    baseUrl: normalizedBaseUrl,
    apiKey: normalizedApiKey,
    chatModel: normalizedChatModel,
    imageModel: normalizedImageModel,
    includeImage: Boolean(includeImage),
    timeoutMs: normalizedTimeoutMs
  }
  const checks = [
    await checkModels(context),
    await checkChat(context),
    await checkImage(context)
  ]
  const report = {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    evidenceType: 'ai-provider-smoke',
    claimBoundary: includeImage
      ? 'OpenPet development gateway model discovery, chat completion, and opt-in image generation smoke only; image quality and asset readiness still require human review.'
      : 'OpenPet development gateway model discovery and chat completion smoke only; image generation was not executed.',
    provider: 'openai-compatible',
    baseUrl: normalizedBaseUrl,
    chatModel: normalizedChatModel,
    imageModel: normalizedImageModel,
    includeImage: Boolean(includeImage),
    secret: {
      apiKeyConfigured: true,
      apiKeyPreview: maskApiKey(normalizedApiKey)
    },
    checks,
    ok: checks.every((check) => ['pass', 'warning', 'skipped'].includes(check.status))
  }

  if (outputPath) {
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true })
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  }
  return report
}

const renderSummary = (report) => [
  `AI Provider smoke ${report.ok ? 'passed' : 'failed'} for ${report.baseUrl}`,
  `Chat model: ${report.chatModel}`,
  `Image model: ${report.imageModel}${report.includeImage ? '' : ' (image generation skipped)'}`,
  ...report.checks.map((check) => `- ${check.id}: ${check.status}${check.message ? ` - ${check.message}` : ''}`)
].join('\n')

const main = async () => {
  try {
    const options = parseArgs(process.argv.slice(2), process.env)
    if (options.help) {
      console.log(usage())
      return
    }
    const report = await runAiProviderSmoke(options)
    if (options.json) console.log(JSON.stringify(report, null, 2))
    else console.log(renderSummary(report))
    if (!report.ok) process.exitCode = 1
  } catch (error) {
    console.error(`AI provider smoke failed: ${sanitizeMessage(error?.message || error, '')}`)
    console.error(usage())
    process.exitCode = 1
  }
}

if (require.main === module) {
  main()
}

module.exports = {
  DEFAULT_API_KEY_ENV,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  maskApiKey,
  normalizeProviderBaseUrl,
  parseArgs,
  runAiProviderSmoke
}
