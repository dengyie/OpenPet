#!/usr/bin/env node

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_API_KEY_ENV = 'OPENPET_IMAGE_PROVIDER_API_KEY'
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'release', 'image-edits-provider-probe')
const DEFAULT_TIMEOUT_MS = 300000
const DEFAULT_MODELS = [
  'gpt-image-2',
  'gpt-image-1.5'
]
const DEFAULT_PROMPT = 'OpenPet provider probe: keep the same pet identity, transparent background, simple centered pose, no text.'

const usage = () => [
  'Usage: node scripts/run-image-edits-provider-probe.js --base-url <url> --reference-image <file> [options]',
  '',
  'Options:',
  `  --api-key-env <name>       Environment variable containing the Provider API key (default: ${DEFAULT_API_KEY_ENV})`,
  '  --api-key <key>            Direct API key value; prefer --api-key-env for shell history safety',
  '  --models <a,b,c>           Comma-separated image-edit model candidates',
  '  --model <name>             Add one image-edit model candidate (repeatable)',
  `  --timeout-ms <ms>          Per-model timeout (default: ${DEFAULT_TIMEOUT_MS})`,
  '  --prompt <text>            Override the edit prompt used for every request',
  '  --output <report.json>     Write the sanitized JSON report to this path',
  '  --json                     Print the sanitized JSON report to stdout',
  '  --help',
  '',
  'This script talks directly to /v1/images/edits. It is meant to separate gateway/provider',
  'behavior from OpenPet runtime behavior, so it does not depend on OpenPet services.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parsePositiveInt = (value, label) => {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`)
  return number
}

const normalizeBaseUrl = (value) => {
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

const maskApiKey = (value) => {
  const key = String(value || '')
  if (!key) return ''
  if (key.length <= 8) return 'configured'
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}

const sanitizeText = (value, maxChars = 240) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxChars)

const sanitizeErrorMessage = (message, apiKey) => {
  const secret = String(apiKey || '')
  const value = String(message || '')
  return sanitizeText(secret ? value.replaceAll(secret, '[redacted]') : value)
}

const createMultipartBoundary = () => `----OpenPetProbeBoundary${crypto.randomBytes(12).toString('hex')}`

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

const appendMultipartFilePart = (buffers, boundary, name, fileName, mimeType, bytes) => {
  buffers.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${sanitizeMultipartToken(name, 'image')}"; filename="${sanitizeMultipartToken(fileName, 'reference.png')}"\r\n` +
    `Content-Type: ${sanitizeMultipartToken(mimeType, 'application/octet-stream')}\r\n\r\n`
  ))
  buffers.push(bytes)
  buffers.push(Buffer.from('\r\n'))
}

const getImageMimeType = (filePath) => {
  const extension = path.extname(String(filePath || '')).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.gif') return 'image/gif'
  return 'image/png'
}

const parseModelList = (value) => String(value || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)

const parseArgs = (argv, env = process.env) => {
  const options = {
    baseUrl: '',
    referenceImagePath: '',
    apiKey: '',
    apiKeyEnv: DEFAULT_API_KEY_ENV,
    models: [],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    prompt: DEFAULT_PROMPT,
    outputPath: '',
    json: false,
    help: false
  }
  let hasExplicitModels = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--base-url') {
      options.baseUrl = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--reference-image') {
      options.referenceImagePath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--api-key-env') {
      options.apiKeyEnv = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--api-key') {
      options.apiKey = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--models') {
      hasExplicitModels = true
      options.models = parseModelList(readValue(argv, index, arg))
      index += 1
    } else if (arg === '--model') {
      if (!hasExplicitModels) {
        options.models = []
        hasExplicitModels = true
      }
      options.models.push(readValue(argv, index, arg).trim())
      index += 1
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--prompt') {
      options.prompt = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--output') {
      options.outputPath = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (options.help) return options
  const apiKey = options.apiKey || env[options.apiKeyEnv] || ''
  const referenceImagePath = path.resolve(String(options.referenceImagePath || '').trim())
  if (!referenceImagePath) throw new Error('Reference image is required')
  if (!fs.existsSync(referenceImagePath)) throw new Error(`Reference image does not exist: ${referenceImagePath}`)
  const modelSource = hasExplicitModels ? options.models : DEFAULT_MODELS
  const models = Array.from(new Set(modelSource.map((entry) => String(entry || '').trim()).filter(Boolean)))
  if (!models.length) throw new Error('At least one model is required')
  return {
    ...options,
    baseUrl: normalizeBaseUrl(options.baseUrl),
    referenceImagePath,
    apiKey: String(apiKey || '').trim(),
    models,
    timeoutMs: parsePositiveInt(options.timeoutMs, 'Timeout MS'),
    prompt: String(options.prompt || '').trim()
  }
}

const nowMs = () => Date.now()

const parseJsonResponse = async (response) => {
  const text = await response.text().catch(() => '')
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch (_) {
    return { message: text.slice(0, 240) }
  }
}

const extractProviderMessage = (data, apiKey) => (
  sanitizeErrorMessage(data?.error?.message || data?.message || data?.msg || '', apiKey)
)

const buildEditMultipartRequest = ({ model, prompt, referenceImagePath }) => {
  const boundary = createMultipartBoundary()
  const bytes = fs.readFileSync(referenceImagePath)
  const fileName = path.basename(referenceImagePath)
  const mimeType = getImageMimeType(referenceImagePath)
  const buffers = []
  appendMultipartFilePart(buffers, boundary, 'image', fileName, mimeType, bytes)
  appendMultipartTextPart(buffers, boundary, 'model', model)
  appendMultipartTextPart(buffers, boundary, 'prompt', prompt)
  appendMultipartTextPart(buffers, boundary, 'size', '1024x1024')
  if (model !== 'gpt-image-2') {
    appendMultipartTextPart(buffers, boundary, 'background', 'transparent')
    appendMultipartTextPart(buffers, boundary, 'response_format', 'b64_json')
  }
  buffers.push(Buffer.from(`--${boundary}--\r\n`))
  const body = Buffer.concat(buffers)
  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
    contentLength: String(body.byteLength),
    referenceMimeType: mimeType,
    referenceFileName: fileName
  }
}

const fetchEdit = async ({
  fetchImpl,
  baseUrl,
  apiKey,
  model,
  prompt,
  referenceImagePath,
  timeoutMs
}) => {
  const { body, contentType, contentLength, referenceMimeType, referenceFileName } = buildEditMultipartRequest({
    model,
    prompt,
    referenceImagePath
  })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = nowMs()
  try {
    const response = await fetchImpl(`${baseUrl}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': contentType,
        'Content-Length': contentLength
      },
      body,
      signal: controller.signal
    })
    const data = await parseJsonResponse(response)
    return {
      ok: response.ok,
      statusCode: response.status,
      elapsedMs: nowMs() - startedAt,
      data,
      request: {
        model,
        contentType,
        contentLength,
        promptChars: prompt.length,
        referenceFileName,
        referenceMimeType
      }
    }
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      elapsedMs: nowMs() - startedAt,
      data: {},
      errorName: error?.name || 'Error',
      errorMessage: error?.name === 'AbortError' ? 'request timed out' : String(error?.message || error),
      request: {
        model,
        contentType,
        contentLength,
        promptChars: prompt.length,
        referenceFileName,
        referenceMimeType
      }
    }
  } finally {
    clearTimeout(timeout)
  }
}

const classifyProbeResult = ({ response, apiKey }) => {
  if (!response.ok) {
    const message = sanitizeErrorMessage(
      response.errorMessage || extractProviderMessage(response.data, apiKey) || `HTTP ${response.statusCode}`,
      apiKey
    )
    if (message.includes('failed to parse multipart form') || message.includes('convert_request_failed')) {
      return { status: 'multipart-failed', message }
    }
    if (message.includes('timed out')) {
      return { status: 'timeout', message }
    }
    if (message.includes('fetch failed')) {
      return { status: 'request-error', message }
    }
    if (response.statusCode >= 500) {
      return { status: 'provider-error', message }
    }
    return { status: 'http-error', message }
  }
  const items = Array.isArray(response.data?.data) ? response.data.data : []
  const outputCount = items.filter((entry) => entry?.b64_json || entry?.url).length
  return {
    status: outputCount > 0 ? 'pass' : 'empty',
    message: outputCount > 0 ? 'image edit returned output metadata' : 'image edit returned no outputs'
  }
}

const runImageEditsProviderProbe = async ({
  baseUrl,
  apiKey,
  models = DEFAULT_MODELS,
  referenceImagePath,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  prompt = DEFAULT_PROMPT,
  outputPath = '',
  fetchImpl = globalThis.fetch,
  now = () => new Date()
} = {}) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const normalizedApiKey = String(apiKey || '').trim()
  if (!normalizedApiKey) throw new Error('API key is required. Prefer --api-key-env over --api-key.')
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available')
  const normalizedReferenceImagePath = path.resolve(String(referenceImagePath || '').trim())
  if (!normalizedReferenceImagePath || !fs.existsSync(normalizedReferenceImagePath)) {
    throw new Error(`Reference image does not exist: ${normalizedReferenceImagePath}`)
  }
  const normalizedModels = Array.from(new Set((Array.isArray(models) ? models : []).map((entry) => String(entry || '').trim()).filter(Boolean)))
  if (!normalizedModels.length) throw new Error('At least one model is required')
  const normalizedTimeoutMs = parsePositiveInt(timeoutMs, 'Timeout MS')
  const normalizedPrompt = String(prompt || '').trim() || DEFAULT_PROMPT

  const results = []
  for (const model of normalizedModels) {
    const response = await fetchEdit({
      fetchImpl,
      baseUrl: normalizedBaseUrl,
      apiKey: normalizedApiKey,
      model,
      prompt: normalizedPrompt,
      referenceImagePath: normalizedReferenceImagePath,
      timeoutMs: normalizedTimeoutMs
    })
    const classification = classifyProbeResult({ response, apiKey: normalizedApiKey })
    results.push({
      model,
      status: classification.status,
      statusCode: response.statusCode,
      elapsedMs: response.elapsedMs,
      message: classification.message,
      outputCount: Array.isArray(response.data?.data)
        ? response.data.data.filter((entry) => entry?.b64_json || entry?.url).length
        : 0,
      request: response.request
    })
  }

  const report = {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    evidenceType: 'image-edits-provider-probe',
    claimBoundary: 'Direct gateway probe for /images/edits only. This isolates provider and gateway behavior from OpenPet runtime behavior.',
    baseUrl: normalizedBaseUrl,
    endpoint: '/images/edits',
    timeoutMs: normalizedTimeoutMs,
    promptChars: normalizedPrompt.length,
    referenceImage: {
      path: normalizedReferenceImagePath,
      fileName: path.basename(normalizedReferenceImagePath),
      byteLength: fs.statSync(normalizedReferenceImagePath).size,
      mimeType: getImageMimeType(normalizedReferenceImagePath)
    },
    secret: {
      apiKeyConfigured: true,
      apiKeyPreview: maskApiKey(normalizedApiKey)
    },
    results,
    ok: results.some((entry) => entry.status === 'pass'),
    supportedModels: results.filter((entry) => entry.status === 'pass').map((entry) => entry.model)
  }

  if (outputPath) {
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true })
    fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`)
  }
  return report
}

const createDefaultOutputPath = () => {
  const sessionId = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(DEFAULT_OUTPUT_DIR, `${sessionId}.json`)
}

const renderSummary = (report) => [
  `Image edits provider probe ${report.ok ? 'found a passing model' : 'found no passing models'} for ${report.baseUrl}`,
  `Reference image: ${report.referenceImage.fileName} (${report.referenceImage.mimeType}, ${report.referenceImage.byteLength} bytes)`,
  `Endpoint: ${report.endpoint}`,
  ...report.results.map((entry) => `- ${entry.model}: ${entry.status} (${entry.statusCode || 0}, ${entry.elapsedMs}ms)${entry.message ? ` - ${entry.message}` : ''}`)
].join('\n')

const main = async () => {
  try {
    const options = parseArgs(process.argv.slice(2), process.env)
    if (options.help) {
      console.log(usage())
      return
    }
    const report = await runImageEditsProviderProbe({
      ...options,
      outputPath: options.outputPath || createDefaultOutputPath()
    })
    if (options.json) console.log(JSON.stringify(report, null, 2))
    else console.log(renderSummary(report))
    if (!report.ok) process.exitCode = 1
  } catch (error) {
    console.error(`Image edits provider probe failed: ${sanitizeText(error?.message || error)}`)
    console.error(usage())
    process.exitCode = 1
  }
}

if (require.main === module) {
  main()
}

module.exports = {
  DEFAULT_API_KEY_ENV,
  DEFAULT_MODELS,
  maskApiKey,
  normalizeBaseUrl,
  parseArgs,
  runImageEditsProviderProbe
}
