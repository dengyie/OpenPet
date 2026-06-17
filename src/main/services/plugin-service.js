const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const http = require('http')
const { fork, spawn } = require('child_process')
const { normalizePluginManifest } = require('../plugins/manifest')
const { coerceConfigValue, normalizeConfigSchema } = require('../plugins/config-schema')

const LOCAL_PLUGIN_COMMAND_TIMEOUT_MS = 5000
const SDK_REGISTERED_COMMANDS = Symbol('openpet.registeredCommands')
const STORAGE_KEY_PATTERN = /^[a-zA-Z0-9_.:-]{1,128}$/
const MAX_PLUGIN_STORAGE_BYTES = 64 * 1024
const MAX_PLUGIN_STORAGE_VALUE_BYTES = 16 * 1024
const MAX_PLUGIN_LOG_ENTRIES = 200
const MAX_PLUGIN_NETWORK_REQUEST_BYTES = 64 * 1024
const MAX_PLUGIN_NETWORK_RESPONSE_BYTES = 128 * 1024
const MAX_PLUGIN_COMMAND_OUTPUT_BYTES = 64 * 1024
const MAX_PLUGIN_BRIDGE_BODY_BYTES = 1024 * 1024
const PLUGIN_SERVICE_HEALTH_TIMEOUT_MS = 3000
const LOCAL_PLUGIN_RUNNER_PATH = path.join(__dirname, '../plugins/local-plugin-runner.js')
const PLUGIN_BRIDGE_HOST = '127.0.0.1'

const createPluginServiceKey = (pluginId, serviceId) => `${pluginId}:${serviceId}`

const ACTIVE_SERVICE_STATUSES = new Set(['running', 'stopping'])
const ACTIVE_SETUP_STATUSES = new Set(['running'])
const ACTIVE_COMMAND_STATUSES = new Set(['running'])

const LOOPBACK_HEALTH_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

const createPluginBridgeKey = (pluginId, entryId, runId) => `${pluginId}:${entryId}:${runId}`

const createPluginBridgeToken = () => crypto.randomBytes(24).toString('base64url')

const createPluginBridgeRunId = () => crypto.randomBytes(12).toString('base64url')

const extractBearerToken = (header = '') => {
  const match = String(header).match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : ''
}

const safeTokenEquals = (candidate, expected) => {
  const candidateBuffer = Buffer.from(String(candidate || ''))
  const expectedBuffer = Buffer.from(String(expected || ''))
  return candidateBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(candidateBuffer, expectedBuffer)
}

const isJsonRequest = (request) => {
  const contentType = String(request.headers['content-type'] || '').toLowerCase()
  return contentType.startsWith('application/json')
}

const readJsonBody = (request) => new Promise((resolve, reject) => {
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
    if (body.length > MAX_PLUGIN_BRIDGE_BODY_BYTES) {
      request.destroy()
      reject(new Error('Request body is too large'))
    }
  })
  request.on('end', () => {
    if (!body) {
      resolve({})
      return
    }
    try {
      resolve(JSON.parse(body))
    } catch (_) {
      reject(new Error('Invalid JSON body'))
    }
  })
  request.on('error', reject)
})

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify(body))
}

const createServiceHealthView = (health = {}, serviceEntry = {}) => {
  const hasConfiguredHealth = Boolean(serviceEntry.health?.url)
  const statusCode = health.statusCode == null || health.statusCode === ''
    ? null
    : Number(health.statusCode)
  return {
    status: health.status || (hasConfiguredHealth ? 'unknown' : 'not-configured'),
    checkedAt: health.checkedAt || '',
    url: health.url || serviceEntry.health?.url || '',
    statusCode: Number.isFinite(statusCode) ? statusCode : null,
    message: health.message || ''
  }
}

const parseServiceCommand = (command) => {
  const input = String(command || '').trim()
  if (!input) throw new Error('Plugin service command is required')
  const parts = []
  let current = ''
  let quote = ''
  let escaping = false

  for (const char of input) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\') {
      escaping = true
      continue
    }
    if (quote) {
      if (char === quote) quote = ''
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (escaping) current += '\\'
  if (quote) throw new Error('Plugin service command has an unterminated quote')
  if (current) parts.push(current)
  if (!parts.length) throw new Error('Plugin service command is required')
  const [file, ...args] = parts
  return { file, args }
}

const createServiceProcessEnv = () => {
  const env = {}
  if (process.env.PATH) env.PATH = process.env.PATH
  if (process.platform === 'win32') {
    if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot
    if (process.env.WINDIR) env.WINDIR = process.env.WINDIR
  }
  return env
}

const appendLimitedOutput = (current, chunk) => {
  const next = `${current}${String(chunk || '')}`
  return next.length > MAX_PLUGIN_COMMAND_OUTPUT_BYTES
    ? next.slice(0, MAX_PLUGIN_COMMAND_OUTPUT_BYTES)
    : next
}

const parseJsonLine = (line) => {
  try {
    return JSON.parse(line)
  } catch (_) {
    return null
  }
}

const readCommandResult = (stdoutText) => {
  const lines = String(stdoutText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = parseJsonLine(lines[index])
    if (parsed && typeof parsed === 'object') return parsed
  }
  return null
}

const getSignatureStatus = (manifest) => {
  if (manifest.source === 'official') {
    return { status: 'official', label: 'Official plugin', signer: 'openpet', algorithm: 'bundled' }
  }
  if (!manifest.signature) {
    return { status: 'unsigned', label: 'Unsigned plugin', signer: '', algorithm: '' }
  }
  return {
    status: 'present-unverified',
    label: 'Signature metadata present, not verified',
    signer: manifest.signature.signer || '',
    algorithm: manifest.signature.algorithm || 'unknown'
  }
}

const resolveLocalPluginFile = (manifest, fieldName) => {
  const relativePath = manifest[fieldName]
  if (!relativePath) return ''
  const targetPath = path.resolve(manifest.basePath, relativePath)
  const basePath = path.resolve(manifest.basePath)
  if (targetPath !== basePath && !targetPath.startsWith(`${basePath}${path.sep}`)) {
    throw new Error(`Plugin ${fieldName} must stay inside the plugin directory`)
  }
  if (fs.existsSync(targetPath)) {
    const realTargetPath = fs.realpathSync(targetPath)
    const realBasePath = fs.realpathSync(basePath)
    if (realTargetPath !== realBasePath && !realTargetPath.startsWith(`${realBasePath}${path.sep}`)) {
      throw new Error(`Plugin ${fieldName} must stay inside the plugin directory`)
    }
  }
  return targetPath
}

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key)

const cloneJsonValue = (value, fieldName = 'value', { allowUndefined = false } = {}) => {
  if (value === undefined && allowUndefined) return undefined
  const seen = new Set()

  const assertJsonValue = (candidate, pathLabel) => {
    if (candidate === null) return
    const type = typeof candidate
    if (type === 'string' || type === 'boolean') return
    if (type === 'number') {
      if (!Number.isFinite(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
      return
    }
    if (Array.isArray(candidate)) {
      if (seen.has(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
      seen.add(candidate)
      candidate.forEach((item, index) => assertJsonValue(item, `${pathLabel}[${index}]`))
      seen.delete(candidate)
      return
    }
    if (type === 'object') {
      const prototype = Object.getPrototypeOf(candidate)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
      }
      if (seen.has(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
      seen.add(candidate)
      for (const [key, item] of Object.entries(candidate)) {
        assertJsonValue(item, `${pathLabel}.${key}`)
      }
      seen.delete(candidate)
      return
    }
    throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
  }

  assertJsonValue(value, fieldName)
  return JSON.parse(JSON.stringify(value))
}

const getJsonByteSize = (value) => Buffer.byteLength(JSON.stringify(value), 'utf-8')

const normalizePluginLog = (entry = {}, index = 0) => ({
  id: Number.isFinite(Number(entry.id)) ? Number(entry.id) : index + 1,
  timestamp: entry.timestamp || new Date().toISOString(),
  level: entry.level === 'error' ? 'error' : 'info',
  pluginId: String(entry.pluginId || ''),
  commandId: String(entry.commandId || ''),
  message: String(entry.message || '')
})

const filterLogs = (logs, filters = {}) => {
  const pluginId = String(filters.pluginId || '').trim()
  const level = String(filters.level || '').trim()
  const query = String(filters.query || '').trim().toLowerCase()

  return logs.filter((entry) => {
    if (pluginId && entry.pluginId !== pluginId) return false
    if (level && entry.level !== level) return false
    if (query) {
      const haystack = `${entry.pluginId} ${entry.commandId} ${entry.message}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
}

const escapeCsvCell = (value) => {
  const cell = String(value ?? '')
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
}

const exportLogs = (logs, format = 'json') => {
  if (format === 'csv') {
    const rows = [
      ['timestamp', 'level', 'pluginId', 'commandId', 'message'],
      ...logs.map((entry) => [entry.timestamp, entry.level, entry.pluginId, entry.commandId, entry.message])
    ]
    return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')
  }
  return JSON.stringify(logs, null, 2)
}

const normalizeNetworkRequest = (manifest, { url, options = {} } = {}) => {
  const targetUrl = new URL(String(url || ''))
  if (targetUrl.protocol !== 'https:') throw new Error('Plugin network requests must use HTTPS')
  if (!manifest.network.allowlist.includes(targetUrl.host.toLowerCase())) {
    throw new Error(`Plugin ${manifest.id} cannot access network host: ${targetUrl.host}`)
  }
  const method = String(options.method || 'GET').toUpperCase()
  if (!['GET', 'POST'].includes(method)) throw new Error('Plugin network requests only support GET and POST')
  const headers = Object.entries(options.headers || {}).reduce((nextHeaders, [key, value]) => {
    const headerName = String(key).toLowerCase()
    if (!/^[a-z0-9-]+$/.test(headerName)) throw new Error(`Plugin network header is invalid: ${key}`)
    if (['authorization', 'cookie', 'set-cookie', 'proxy-authorization'].includes(headerName)) {
      throw new Error(`Plugin network header is not allowed: ${key}`)
    }
    nextHeaders[headerName] = String(value)
    return nextHeaders
  }, {})
  const request = { method, headers }
  if (hasOwn(options, 'body')) {
    request.body = String(options.body)
    if (Buffer.byteLength(request.body, 'utf-8') > MAX_PLUGIN_NETWORK_REQUEST_BYTES) {
      throw new Error(`Plugin network request body exceeds ${MAX_PLUGIN_NETWORK_REQUEST_BYTES} bytes`)
    }
  }
  return { url: targetUrl.toString(), request }
}

const readLimitedResponseText = async (response) => {
  const contentLength = Number(response.headers?.get?.('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_PLUGIN_NETWORK_RESPONSE_BYTES) {
    throw new Error(`Plugin network response exceeds ${MAX_PLUGIN_NETWORK_RESPONSE_BYTES} bytes`)
  }
  if (!response.body?.getReader) {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf-8') > MAX_PLUGIN_NETWORK_RESPONSE_BYTES) {
      throw new Error(`Plugin network response exceeds ${MAX_PLUGIN_NETWORK_RESPONSE_BYTES} bytes`)
    }
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let byteLength = 0
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > MAX_PLUGIN_NETWORK_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {})
      throw new Error(`Plugin network response exceeds ${MAX_PLUGIN_NETWORK_RESPONSE_BYTES} bytes`)
    }
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  return text
}

const assertStorageValueSize = (value) => {
  const byteSize = getJsonByteSize(value)
  if (byteSize > MAX_PLUGIN_STORAGE_VALUE_BYTES) {
    throw new Error(`Plugin storage value exceeds ${MAX_PLUGIN_STORAGE_VALUE_BYTES} bytes`)
  }
}

const assertStorageSize = (storage) => {
  const byteSize = getJsonByteSize(storage)
  if (byteSize > MAX_PLUGIN_STORAGE_BYTES) {
    throw new Error(`Plugin storage exceeds ${MAX_PLUGIN_STORAGE_BYTES} bytes`)
  }
}

const assertStorageKey = (key) => {
  if (typeof key !== 'string' || !STORAGE_KEY_PATTERN.test(key)) {
    throw new Error('Plugin storage key must be 1-128 characters using letters, numbers, _, ., :, or -')
  }
}

const readLocalPluginConfigSchema = (manifest) => {
  const schemaPath = resolveLocalPluginFile(manifest, 'configSchema')
  if (!schemaPath) return null
  if (!fs.existsSync(schemaPath)) throw new Error('Plugin config schema file does not exist')
  return normalizeConfigSchema(JSON.parse(fs.readFileSync(schemaPath, 'utf-8')))
}

const getRealPath = (targetPath) => fs.realpathSync(targetPath)

const createLocalPluginRunnerEnv = () => {
  const env = {}
  if (process.env.PATH) env.PATH = process.env.PATH
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot
  if (process.env.WINDIR) env.WINDIR = process.env.WINDIR
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
  return env
}

const createLocalPluginRunnerOptions = (mainPath) => {
  const runnerPath = getRealPath(LOCAL_PLUGIN_RUNNER_PATH)
  const pluginMainPath = getRealPath(mainPath)
  return {
    execPath: process.execPath,
    execArgv: [
      '--permission',
      `--allow-fs-read=${runnerPath}`,
      `--allow-fs-read=${pluginMainPath}`
    ],
    env: createLocalPluginRunnerEnv(),
    serialization: 'json',
    silent: true
  }
}

const handleLocalPluginSdkCall = async (sdk, operation, payload = {}) => {
  if (operation === 'storage:get') return sdk.storage.get(payload.key, payload.fallbackValue)
  if (operation === 'storage:set') return sdk.storage.set(payload.key, payload.value)
  if (operation === 'storage:remove') return sdk.storage.remove(payload.key)
  if (operation === 'storage:clear') return sdk.storage.clear()
  if (operation === 'pet:say') return sdk.pet.say(payload.payload)
  if (operation === 'pet:playAction') return sdk.pet.playAction(payload.payload)
  if (operation === 'pet:setEvent') return sdk.pet.setEvent(payload.payload)
  if (operation === 'ai:chat') return sdk.ai.chat(payload.payload)
  if (operation === 'network:fetch') return sdk.network.fetch(payload.url, payload.options)
  throw new Error(`Unsupported plugin SDK operation: ${operation}`)
}

const runLocalPluginCommand = ({ plugin, sdk, commandId, payload, config }) => new Promise((resolve, reject) => {
  const mainPath = getRealPath(plugin.mainPath)
  const runnerPath = getRealPath(LOCAL_PLUGIN_RUNNER_PATH)
  const child = fork(runnerPath, [], createLocalPluginRunnerOptions(mainPath))
  let settled = false
  let stderr = ''

  const finish = (error, result) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    child.removeAllListeners()
    if (!child.killed) child.kill()
    if (error) reject(error)
    else resolve(result)
  }

  const timer = setTimeout(() => {
    finish(new Error(`Plugin command timed out after ${LOCAL_PLUGIN_COMMAND_TIMEOUT_MS}ms`))
  }, LOCAL_PLUGIN_COMMAND_TIMEOUT_MS)

  child.stderr?.on('data', (chunk) => {
    stderr = `${stderr}${chunk.toString('utf-8')}`.slice(-4096)
  })

  child.on('message', (message) => {
    if (!message || typeof message !== 'object') return
    if (message.type === 'ready') {
      child.send({
        type: 'run',
        mainPath,
        commandId,
        payload: cloneJsonValue(payload, 'payload', { allowUndefined: true }),
        config: cloneJsonValue(config, 'config')
      })
      return
    }
    if (message.type === 'sdk-call') {
      handleLocalPluginSdkCall(sdk, message.operation, message.payload)
        .then((result) => {
          if (child.connected) {
            child.send({ type: 'sdk-result', id: message.id, ok: true, result: cloneJsonValue(result, 'result', { allowUndefined: true }) })
          }
        })
        .catch((error) => {
          if (child.connected) child.send({ type: 'sdk-result', id: message.id, ok: false, error: error.message || 'Plugin SDK call failed' })
        })
      return
    }
    if (message.type === 'result') {
      if (message.ok) finish(null, cloneJsonValue(message.result, 'result', { allowUndefined: true }))
      else finish(new Error(message.error || 'Plugin command failed'))
    }
  })

  child.on('error', (error) => finish(error))
  child.on('exit', (code, signal) => {
    if (settled) return
    const detail = stderr.trim() || (signal ? `signal ${signal}` : `exit code ${code}`)
    finish(new Error(`Plugin runner exited before completing command: ${detail}`))
  })
})

const readLocalPluginManifests = (pluginDirs = []) => {
  const plugins = []

  for (const rootDir of pluginDirs) {
    if (!rootDir || !fs.existsSync(rootDir)) continue
    const entries = fs.readdirSync(rootDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const basePath = path.join(rootDir, entry.name)
      const manifestPath = path.join(basePath, 'plugin.json')
      if (!fs.existsSync(manifestPath)) continue
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        const normalizedManifest = normalizePluginManifest(manifest, { source: 'local', basePath })
        const mainPath = resolveLocalPluginFile(normalizedManifest, 'main')
        const configSchema = readLocalPluginConfigSchema(normalizedManifest)
        plugins.push({
          manifest: normalizedManifest,
          configSchema,
          mainPath: mainPath && fs.existsSync(mainPath) ? mainPath : '',
          activate: null
        })
      } catch (_) {
        // A broken third-party manifest should not prevent the app from listing other plugins.
      }
    }
  }

  return plugins
}

const createPluginService = ({ settingsService, petService, aiService, fetchImpl = globalThis.fetch, serviceHealthTimeoutMs, healthCheckTimeoutMs = serviceHealthTimeoutMs ?? PLUGIN_SERVICE_HEALTH_TIMEOUT_MS, commandProcessTimeoutMs = LOCAL_PLUGIN_COMMAND_TIMEOUT_MS, openExternal = async () => { throw new Error('Dashboard opener is not available') }, spawnServiceProcess = spawn, spawnSetupProcess = spawnServiceProcess, spawnCommandProcess = spawnServiceProcess, killServiceProcess = process.kill, pluginDirs = [], officialPlugins = [], getPluginBlockStatus = () => ({ blocked: false, reasons: [] }) }) => {
  if (!settingsService) throw new Error('settingsService is required')
  if (!petService) throw new Error('petService is required')
  const serviceRuntimes = new Map()
  const setupRuntimes = new Map()
  const commandRuntimes = new Map()
  const pluginBridgeRuntimes = new Map()
  let pluginBridgeServer = null
  let pluginBridgePort = 0
  let pluginBridgeServerStarting = null

  const getLogStore = () => {
    const logs = settingsService.get().plugins?.logs
    return Array.isArray(logs) ? logs.map(normalizePluginLog) : []
  }

  const saveLogStore = (logs) => {
    const settings = settingsService.get()
    settingsService.save({
      ...settings,
      plugins: {
        ...(settings.plugins || {}),
        logs: logs.slice(0, MAX_PLUGIN_LOG_ENTRIES).map((entry, index) => normalizePluginLog(entry, index))
      }
    })
  }

  const appendLog = ({ level = 'info', pluginId = '', commandId = '', message = '' } = {}) => {
    const logs = getLogStore()
    const maxLogId = logs.reduce((maxId, entry) => Math.max(maxId, entry.id), 0)
    const entry = {
      id: maxLogId + 1,
      timestamp: new Date().toISOString(),
      level: level === 'error' ? 'error' : 'info',
      pluginId,
      commandId,
      message: String(message || '')
    }
    logs.unshift(entry)
    saveLogStore(logs)
    return entry
  }

  const createPluginBridgeContext = () => {
    const snapshot = petService.getSnapshot?.() || {}
    const settings = snapshot.settings || {}
    const actions = snapshot.actions || {}
    return {
      petName: String(settings.name || 'OpenPet'),
      selectedPetId: String(settings.petPacks?.activePackId || 'legacy-cat'),
      currentActionId: String(actions.defaultAction || ''),
      personality: {
        tone: 'friendly',
        tags: ['companion', 'playful']
      }
    }
  }

  const createPluginBridgeHandlers = (plugin, entryId) => ({
    context: async () => {
      appendLog({ pluginId: plugin.manifest.id, commandId: entryId, level: 'info', message: 'Bridge context requested' })
      return { ok: true, context: createPluginBridgeContext() }
    },
    petSay: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pet:say')
      appendLog({ pluginId: plugin.manifest.id, commandId: entryId, level: 'info', message: 'Bridge pet.say invoked' })
      return {
        ok: true,
        result: petService.say({
          text: payload.text,
          ttlMs: payload.ttlMs,
          source: `plugin:${plugin.manifest.id}:bridge`
        })
      }
    },
    petAction: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pet:action')
      const actionId = String(payload.actionId || '')
      appendLog({
        pluginId: plugin.manifest.id,
        commandId: entryId,
        level: 'info',
        message: `Bridge pet.action invoked: ${actionId}`.slice(0, 240)
      })
      return {
        ok: true,
        result: petService.playAction({
          actionId,
          source: `plugin:${plugin.manifest.id}:bridge`
        })
      }
    },
    petEvent: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pet:event')
      const eventType = String(payload.type || '')
      appendLog({
        pluginId: plugin.manifest.id,
        commandId: entryId,
        level: 'info',
        message: `Bridge pet.event invoked: ${eventType}`.slice(0, 240)
      })
      return {
        ok: true,
        result: petService.setEvent({
          type: payload.type,
          message: payload.message,
          ttlMs: payload.ttlMs,
          source: `plugin:${plugin.manifest.id}:bridge`
        })
      }
    }
  })

  const ensurePluginBridgeServer = async () => {
    if (pluginBridgeServer?.listening) return pluginBridgePort
    if (pluginBridgeServerStarting) return pluginBridgeServerStarting
    if (pluginBridgeServer && !pluginBridgeServer.listening) {
      pluginBridgeServer.removeAllListeners()
      pluginBridgeServer = null
      pluginBridgePort = 0
    }

    pluginBridgeServer = http.createServer(async (request, response) => {
      try {
        const url = new URL(request.url, `http://${PLUGIN_BRIDGE_HOST}`)
        const match = url.pathname.match(/^\/plugins\/bridge\/([^/]+)\/([^/]+)\/([^/]+)(\/context|\/pet\/say|\/pet\/action|\/pet\/event)$/)
        if (!match) {
          sendJson(response, 404, { ok: false, error: 'Not found' })
          return
        }
        const [, pluginId, entryId, runId, route] = match
        const runtimeKey = createPluginBridgeKey(pluginId, entryId, runId)
        const runtime = pluginBridgeRuntimes.get(runtimeKey)
        if (!runtime || runtime.status !== 'running') {
          sendJson(response, 401, { ok: false, error: 'Bridge token expired' })
          return
        }

        const token = extractBearerToken(request.headers.authorization)
        if (!safeTokenEquals(token, runtime.token)) {
          appendLog({ pluginId, commandId: entryId, level: 'error', message: 'Bridge request rejected: unauthorized token' })
          sendJson(response, 401, { ok: false, error: 'Unauthorized' })
          return
        }

        if (route === '/context') {
          sendJson(response, 200, await runtime.handlers.context())
          return
        }

        if (!isJsonRequest(request)) {
          sendJson(response, 415, { ok: false, error: 'Content-Type must be application/json' })
          return
        }

        const payload = await readJsonBody(request)
        if (route === '/pet/say') {
          sendJson(response, 200, await runtime.handlers.petSay(payload))
          return
        }
        if (route === '/pet/action') {
          sendJson(response, 200, await runtime.handlers.petAction(payload))
          return
        }
        if (route === '/pet/event') {
          sendJson(response, 200, await runtime.handlers.petEvent(payload))
          return
        }
        sendJson(response, 404, { ok: false, error: 'Not found' })
      } catch (error) {
        const statusCode = /does not have/.test(String(error.message || '')) ? 403 : 400
        sendJson(response, statusCode, { ok: false, error: error.message || 'Bridge request failed' })
      }
    })

    pluginBridgeServerStarting = new Promise((resolve, reject) => {
      const onError = (error) => {
        pluginBridgeServer?.off?.('listening', onListening)
        pluginBridgeServer?.removeAllListeners()
        pluginBridgeServer = null
        pluginBridgePort = 0
        pluginBridgeServerStarting = null
        reject(error)
      }
      const onListening = () => {
        pluginBridgeServer?.off?.('error', onError)
        const address = pluginBridgeServer.address()
        pluginBridgePort = typeof address === 'object' && address ? Number(address.port) || 0 : 0
        pluginBridgeServer?.unref?.()
        pluginBridgeServerStarting = null
        resolve(pluginBridgePort)
      }
      pluginBridgeServer.once('error', onError)
      pluginBridgeServer.once('listening', onListening)
      pluginBridgeServer.listen(0, PLUGIN_BRIDGE_HOST)
    })

    return pluginBridgeServerStarting
  }

  const createPluginEntryBridgeRuntime = async (plugin, entryId) => {
    const bridgePort = await ensurePluginBridgeServer()
    const bridgeRunId = createPluginBridgeRunId()
    const bridgeToken = createPluginBridgeToken()
    const bridgeRuntimeKey = createPluginBridgeKey(plugin.manifest.id, entryId, bridgeRunId)
    const bridgeBaseUrl = `http://${PLUGIN_BRIDGE_HOST}:${bridgePort}/plugins/bridge/${plugin.manifest.id}/${entryId}/${bridgeRunId}`
    pluginBridgeRuntimes.set(bridgeRuntimeKey, {
      pluginId: plugin.manifest.id,
      entryId,
      runId: bridgeRunId,
      token: bridgeToken,
      status: 'running',
      handlers: createPluginBridgeHandlers(plugin, entryId)
    })
    return {
      key: bridgeRuntimeKey,
      url: bridgeBaseUrl,
      token: bridgeToken
    }
  }

  const stopPluginEntryBridgeRuntime = (bridgeRuntimeKey) => {
    const bridgeRuntime = pluginBridgeRuntimes.get(bridgeRuntimeKey)
    if (bridgeRuntime) bridgeRuntime.status = 'stopping'
  }

  const releasePluginEntryBridgeRuntime = (bridgeRuntimeKey) => {
    if (!bridgeRuntimeKey) return
    pluginBridgeRuntimes.delete(bridgeRuntimeKey)
    if (pluginBridgeServer && pluginBridgeRuntimes.size === 0) {
      pluginBridgeServer.unref?.()
    }
  }

  const getPlugins = () => [
    ...officialPlugins.map((plugin) => ({
      manifest: normalizePluginManifest(plugin.manifest, { source: 'official' }),
      configSchema: plugin.configSchema ? normalizeConfigSchema(plugin.configSchema) : null,
      activate: plugin.activate,
      mainPath: ''
    })),
    ...readLocalPluginManifests(pluginDirs)
  ]

  const getEnabledMap = () => settingsService.get().plugins?.enabled || {}

  const getConfigMap = () => settingsService.get().plugins?.config || {}

  const getStorageMap = () => settingsService.get().plugins?.storage || {}

  const getInstalledMap = () => settingsService.get().plugins?.installed || {}

  const getPluginPolicyStatus = (manifestOrId) => {
    const pluginId = typeof manifestOrId === 'string' ? manifestOrId : manifestOrId?.id
    const installed = getInstalledMap()[pluginId] || {}
    return getPluginBlockStatus({ id: pluginId, sha256: installed.packageHash || '', sourceSha256: installed.sourcePackageHash || '' }) || { blocked: false, reasons: [] }
  }

  const assertPluginAllowed = (manifestOrId) => {
    const status = getPluginPolicyStatus(manifestOrId)
    if (status.blocked) throw new Error(`Plugin is blocked: ${status.reasons.join(', ')}`)
    return status
  }

  const getPluginSignatureStatus = (manifest) => {
    if (manifest.source === 'official') return getSignatureStatus(manifest)
    const installed = getInstalledMap()[manifest.id]
    if (installed?.signatureStatus) {
      if (installed.signatureStatus === 'hash-verified') {
        return { status: 'hash-verified', label: 'Signature hash metadata verified', signer: installed.signer || '', algorithm: '' }
      }
      if (installed.signatureStatus === 'unsigned') {
        return { status: 'unsigned', label: 'Unsigned plugin', signer: '', algorithm: '' }
      }
      return { status: installed.signatureStatus, label: 'Signature metadata present, not verified', signer: installed.signer || '', algorithm: '' }
    }
    return getSignatureStatus(manifest)
  }

  const getPluginStorageStats = (pluginId) => {
    try {
      const storage = getPluginStorage(pluginId)
      return {
        keyCount: Object.keys(storage).length,
        byteSize: getJsonByteSize(storage),
        valid: true
      }
    } catch (error) {
      return {
        keyCount: 0,
        byteSize: 0,
        valid: false,
        error: error.message || 'Plugin storage is invalid'
      }
    }
  }

  const normalizePluginConfig = (schema, config = {}) => {
    if (!schema) return {}
    return Object.fromEntries(schema.properties.map((field) => [field.key, coerceConfigValue(config[field.key], field)]))
  }

  const getPluginConfig = (pluginId, schema) => normalizePluginConfig(schema, getConfigMap()[pluginId] || {})

  const assertPermission = (manifest, permission) => {
    if (!manifest.permissions.includes(permission)) {
      throw new Error(`Plugin ${manifest.id} does not have ${permission} permission`)
    }
  }

  const runPluginNetworkRequest = async (manifest, payload) => {
    assertPermission(manifest, 'network')
    if (typeof fetchImpl !== 'function') throw new Error('Plugin network fetch is not available')
    const { url, request } = normalizeNetworkRequest(manifest, payload)
    const response = await fetchImpl(url, { ...request, redirect: 'manual' })
    if (response.url) {
      const responseUrl = new URL(response.url)
      if (responseUrl.protocol !== 'https:' || !manifest.network.allowlist.includes(responseUrl.host.toLowerCase())) {
        throw new Error(`Plugin ${manifest.id} cannot access network host: ${responseUrl.host}`)
      }
    }
    const text = await readLimitedResponseText(response)
    return {
      ok: Boolean(response.ok),
      status: response.status,
      url: response.url || url,
      headers: {
        'content-type': response.headers?.get?.('content-type') || ''
      },
      text
    }
  }

  const runPluginAiChat = async (manifest, payload = {}) => {
    assertPermission(manifest, 'ai:chat')
    if (!aiService?.chat) throw new Error('AI service is not available')
    const message = typeof payload === 'string' ? payload : payload.message
    const conversationId = typeof payload === 'object' && payload?.conversationId
      ? `plugin:${manifest.id}:${payload.conversationId}`
      : `plugin:${manifest.id}`
    return aiService.chat({ message, conversationId })
  }

  const getPluginStorage = (pluginId) => cloneJsonValue(getStorageMap()[pluginId] || {}, 'value')

  const savePluginStorage = (pluginId, storage) => {
    assertStorageSize(storage)
    const settings = settingsService.get()
    settingsService.save({
      ...settings,
      plugins: {
        ...(settings.plugins || {}),
        storage: {
          ...(settings.plugins?.storage || {}),
          [pluginId]: cloneJsonValue(storage, 'value')
        }
      }
    })
  }

  const clearStorage = (pluginId) => {
    const plugin = getPlugins().find((candidate) => candidate.manifest.id === pluginId)
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
    savePluginStorage(pluginId, {})
    appendLog({ pluginId, level: 'info', message: 'Plugin storage cleared' })
    return listPlugins().find((candidate) => candidate.id === pluginId)
  }

  const createRuntimeView = (runtime, serviceEntry = {}) => {
    if (!runtime) {
      return {
        status: 'stopped',
        health: createServiceHealthView({}, serviceEntry)
      }
    }
    return {
      status: runtime.status || 'stopped',
      pid: runtime.pid || 0,
      startedAt: runtime.startedAt || '',
      stoppedAt: runtime.stoppedAt || '',
      command: runtime.command || '',
      cwd: runtime.cwd || '',
      exitCode: Number.isFinite(runtime.exitCode) ? runtime.exitCode : null,
      signal: runtime.signal || '',
      error: runtime.error || '',
      health: createServiceHealthView(runtime.health || {}, serviceEntry)
    }
  }

  const createSetupRuntimeView = (runtime = {}) => ({
    status: runtime.status || 'not-run',
    lastRunAt: runtime.lastRunAt || '',
    exitCode: Number.isFinite(runtime.exitCode) ? runtime.exitCode : null,
    error: runtime.error || ''
  })

  const decorateEntriesWithRuntime = (manifest) => ({
    ...manifest.entries,
    setup: (manifest.entries?.setup || []).map((setupEntry) => ({
      ...setupEntry,
      runtime: createSetupRuntimeView(setupRuntimes.get(createPluginServiceKey(manifest.id, setupEntry.id)))
    })),
    services: (manifest.entries?.services || []).map((serviceEntry) => ({
      ...serviceEntry,
      runtime: createRuntimeView(serviceRuntimes.get(createPluginServiceKey(manifest.id, serviceEntry.id)), serviceEntry)
    }))
  })

  const listPlugins = () => getPlugins().map((plugin) => ({
    ...plugin.manifest,
    entries: decorateEntriesWithRuntime(plugin.manifest),
    enabled: Boolean(getEnabledMap()[plugin.manifest.id]),
    runnable: typeof plugin.activate === 'function' || Boolean(plugin.mainPath) || Boolean(plugin.manifest.entries?.commands?.length),
    signatureStatus: getPluginSignatureStatus(plugin.manifest),
    blockStatus: getPluginPolicyStatus(plugin.manifest),
    configSchema: plugin.configSchema,
    config: getPluginConfig(plugin.manifest.id, plugin.configSchema),
    storage: getPluginStorageStats(plugin.manifest.id)
  }))

  const getServiceEntry = (plugin, serviceId) => {
    const serviceEntry = (plugin.manifest.entries?.services || []).find((entry) => entry.id === serviceId)
    if (!serviceEntry) throw new Error(`Plugin service not found: ${serviceId}`)
    return serviceEntry
  }

  const getSetupEntry = (plugin, setupId) => {
    const setupEntry = (plugin.manifest.entries?.setup || []).find((entry) => entry.id === setupId)
    if (!setupEntry) throw new Error(`Plugin setup entry not found: ${setupId}`)
    return setupEntry
  }

  const getCommandEntry = (plugin, commandId) => {
    const commandEntry = (plugin.manifest.entries?.commands || []).find((entry) => entry.id === commandId)
    if (!commandEntry) throw new Error(`Plugin command entry not found: ${commandId}`)
    return commandEntry
  }

  const resolveServiceRuntimeDeclaration = (serviceEntry) => {
    const override = serviceEntry.platforms?.[process.platform] || {}
    return {
      command: override.command || serviceEntry.command,
      cwd: override.cwd || serviceEntry.cwd || '.'
    }
  }

  const resolvePluginEntryCwd = (manifest, cwd, label) => {
    if (!manifest.basePath) throw new Error('Plugin services require a local plugin directory')
    const basePath = path.resolve(manifest.basePath)
    const targetPath = path.resolve(basePath, cwd || '.')
    if (targetPath !== basePath && !targetPath.startsWith(`${basePath}${path.sep}`)) {
      throw new Error(`Plugin ${label} cwd must stay inside the plugin directory`)
    }
    if (!fs.existsSync(targetPath)) throw new Error(`Plugin ${label} cwd does not exist`)
    const realTargetPath = fs.realpathSync(targetPath)
    const realBasePath = fs.realpathSync(basePath)
    if (realTargetPath !== realBasePath && !realTargetPath.startsWith(`${realBasePath}${path.sep}`)) {
      throw new Error(`Plugin ${label} cwd must stay inside the plugin directory`)
    }
    return realTargetPath
  }

  const resolveServiceCwd = (manifest, cwd) => resolvePluginEntryCwd(manifest, cwd, 'service')

  const resolveSetupCwd = (manifest, cwd) => resolvePluginEntryCwd(manifest, cwd, 'setup')

  const resolveCommandCwd = (manifest, cwd) => resolvePluginEntryCwd(manifest, cwd, 'command')

  const normalizeServiceHealthUrl = (serviceEntry) => {
    const health = serviceEntry.health || {}
    const type = String(health.type || '').trim() || 'none'
    if (type === 'none' || !health.url) throw new Error('Plugin service health check is not configured')
    if (type !== 'http') throw new Error('Plugin service health type must be http')
    let healthUrl
    try {
      healthUrl = new URL(String(health.url || '').trim())
    } catch (_) {
      throw new Error('Plugin service health URL is invalid')
    }
    if (!['http:', 'https:'].includes(healthUrl.protocol)) {
      throw new Error('Plugin service health URL must use HTTP or HTTPS')
    }
    if (!LOOPBACK_HEALTH_HOSTS.has(healthUrl.hostname.toLowerCase())) {
      throw new Error('Plugin service health URL must use a loopback host')
    }
    return healthUrl.toString()
  }

  const findPluginForService = (pluginId, { requireEnabled = true } = {}) => {
    const plugin = getPlugins().find((candidate) => candidate.manifest.id === pluginId)
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
    assertPluginAllowed(plugin.manifest)
    if (requireEnabled && !getEnabledMap()[pluginId]) throw new Error('Plugin is disabled')
    return plugin
  }

  const getPluginServiceRuntime = (pluginId, serviceId) => serviceRuntimes.get(createPluginServiceKey(pluginId, serviceId))

  const getPluginSetupRuntime = (pluginId, setupId) => setupRuntimes.get(createPluginServiceKey(pluginId, setupId))

  const setServiceRuntime = (pluginId, serviceId, runtime) => {
    serviceRuntimes.set(createPluginServiceKey(pluginId, serviceId), runtime)
    return runtime
  }

  const setSetupRuntime = (pluginId, setupId, runtime) => {
    setupRuntimes.set(createPluginServiceKey(pluginId, setupId), runtime)
    return runtime
  }

  const getOrCreateServiceRuntime = (pluginId, serviceId, serviceEntry) => {
    const existingRuntime = getPluginServiceRuntime(pluginId, serviceId)
    if (existingRuntime) return existingRuntime
    return setServiceRuntime(pluginId, serviceId, {
      pluginId,
      serviceId,
      status: 'stopped',
      pid: 0,
      startedAt: '',
      stoppedAt: '',
      command: '',
      cwd: '',
      exitCode: null,
      signal: '',
      error: '',
      child: null,
      health: createServiceHealthView({}, serviceEntry)
    })
  }

  const stopServiceProcess = (runtime, signal = 'SIGTERM') => {
    const pid = Number(runtime?.pid) || 0
    if (pid > 0) {
      try {
        killServiceProcess(-pid, signal)
        return
      } catch (_) {}
    }
    runtime.child?.kill?.(signal)
  }

  const stopPluginServiceRuntime = (pluginId, serviceId, runtime, { log = true } = {}) => {
    if (!runtime || runtime.status !== 'running') return runtime
    runtime.status = 'stopping'
    runtime.stoppedAt = new Date().toISOString()
    stopPluginEntryBridgeRuntime(runtime.bridgeRuntimeKey)
    try {
      stopServiceProcess(runtime, 'SIGTERM')
    } catch (error) {
      runtime.error = error.message || 'Plugin service stop failed'
      runtime.status = 'failed'
      if (log) appendLog({ pluginId, commandId: `service:${serviceId}`, level: 'error', message: 'Service stop failed' })
      return runtime
    }
    if (log) appendLog({ pluginId, commandId: `service:${serviceId}`, level: 'info', message: 'Service stop requested' })
    return runtime
  }

  const stopPluginServices = (pluginId, options = {}) => {
    for (const [key, runtime] of serviceRuntimes.entries()) {
      if (key.startsWith(`${pluginId}:`)) {
        stopPluginServiceRuntime(pluginId, runtime.serviceId, runtime, options)
      }
    }
  }

  const stopPluginSetupRuntime = (pluginId, setupId, runtime, { log = true } = {}) => {
    if (!runtime || runtime.status !== 'running') return runtime
    runtime.status = 'failed'
    runtime.error = 'Setup stopped'
    runtime.exitCode = null
    runtime.lastRunAt = new Date().toISOString()
    try {
      runtime.child?.kill?.('SIGTERM')
    } catch (error) {
      runtime.error = error.message || 'Plugin setup stop failed'
    }
    if (log) appendLog({ pluginId, commandId: `setup:${setupId}`, level: 'error', message: 'Setup stopped' })
    return runtime
  }

  const stopPluginSetups = (pluginId, options = {}) => {
    for (const [key, runtime] of setupRuntimes.entries()) {
      if (key.startsWith(`${pluginId}:`)) {
        stopPluginSetupRuntime(pluginId, runtime.setupId, runtime, options)
      }
    }
  }

  const stopPluginCommandRuntime = (pluginId, commandId, runtime, _options = {}) => {
    if (!runtime || runtime.status !== 'running') return runtime
    runtime.status = 'failed'
    runtime.error = 'Command stopped'
    runtime.stop?.()
    return runtime
  }

  const stopPluginCommands = (pluginId, options = {}) => {
    for (const [key, runtime] of commandRuntimes.entries()) {
      if (key.startsWith(`${pluginId}:`)) {
        stopPluginCommandRuntime(pluginId, runtime.commandId, runtime, options)
      }
    }
  }

  const setEnabled = (pluginId, enabled) => {
    if (enabled) assertPluginAllowed(pluginId)
    if (!enabled) {
      stopPluginCommands(pluginId)
      stopPluginServices(pluginId)
      stopPluginSetups(pluginId)
    }
    const settings = settingsService.get()
    const nextSettings = {
      ...settings,
      plugins: {
        ...(settings.plugins || {}),
        enabled: {
          ...(settings.plugins?.enabled || {}),
          [pluginId]: Boolean(enabled)
        }
      }
    }
    settingsService.save(nextSettings)
    appendLog({
      pluginId,
      level: 'info',
      message: enabled ? 'Plugin enabled' : 'Plugin disabled'
    })
    return listPlugins().find((plugin) => plugin.id === pluginId)
  }

  const saveConfig = (pluginId, config = {}) => {
    const plugin = getPlugins().find((candidate) => candidate.manifest.id === pluginId)
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
    if (!plugin.configSchema) throw new Error('Plugin does not declare a config schema')
    const normalizedConfig = normalizePluginConfig(plugin.configSchema, config)
    const settings = settingsService.get()
    settingsService.save({
      ...settings,
      plugins: {
        ...(settings.plugins || {}),
        config: {
          ...(settings.plugins?.config || {}),
          [pluginId]: normalizedConfig
        }
      }
    })
    appendLog({ pluginId, level: 'info', message: 'Plugin config saved' })
    return listPlugins().find((candidate) => candidate.id === pluginId)
  }

  const createSdk = (plugin) => {
    const manifest = plugin.manifest
    const registeredCommands = {}

    return {
      [SDK_REGISTERED_COMMANDS]: () => registeredCommands,
      config: {
        get: (key) => {
          const config = getPluginConfig(manifest.id, plugin.configSchema)
          return key ? config[key] : { ...config }
        }
      },
      storage: {
        get: async (key, fallbackValue) => {
          assertPermission(manifest, 'storage')
          const storage = getPluginStorage(manifest.id)
          if (key == null) return storage
          assertStorageKey(key)
          return hasOwn(storage, key) ? cloneJsonValue(storage[key], 'value') : fallbackValue
        },
        set: async (key, value) => {
          assertPermission(manifest, 'storage')
          assertStorageKey(key)
          const storage = getPluginStorage(manifest.id)
          const nextValue = cloneJsonValue(value, 'value')
          assertStorageValueSize(nextValue)
          savePluginStorage(manifest.id, { ...storage, [key]: nextValue })
          return nextValue
        },
        remove: async (key) => {
          assertPermission(manifest, 'storage')
          assertStorageKey(key)
          const storage = getPluginStorage(manifest.id)
          delete storage[key]
          savePluginStorage(manifest.id, storage)
          return true
        },
        clear: async () => {
          assertPermission(manifest, 'storage')
          savePluginStorage(manifest.id, {})
          return true
        }
      },
      pet: {
        say: async (payload) => {
          assertPermission(manifest, 'pet:say')
          const normalizedPayload = typeof payload === 'string' ? { text: payload } : { ...payload }
          return petService.say({ ...normalizedPayload, source: `plugin:${manifest.id}` })
        },
        playAction: async (actionIdOrPayload) => {
          assertPermission(manifest, 'pet:action')
          const payload = typeof actionIdOrPayload === 'string'
            ? { actionId: actionIdOrPayload }
            : { ...actionIdOrPayload }
          return petService.playAction({ ...payload, source: `plugin:${manifest.id}` })
        },
        setEvent: async (payload) => {
          assertPermission(manifest, 'pet:event')
          return petService.setEvent({ ...payload, source: `plugin:${manifest.id}` })
        }
      },
      ai: {
        chat: async (payload) => runPluginAiChat(manifest, payload)
      },
      network: {
        fetch: async (url, options = {}) => runPluginNetworkRequest(manifest, { url, options })
      },
      commands: {
        register: (command) => {
          if (!command?.id) throw new Error('Plugin command id is required')
          if (typeof command.handler !== 'function') throw new Error(`Plugin command handler is required: ${command.id}`)
          registeredCommands[command.id] = command.handler
          return command.id
        }
      }
    }
  }

  const runCommandEntryProcess = async ({ plugin, commandEntry, commandId, payload, config }) => {
    const pluginId = plugin.manifest.id
    const runtimeKey = createPluginServiceKey(pluginId, commandId)
    const existingRuntime = commandRuntimes.get(runtimeKey)
    if (ACTIVE_COMMAND_STATUSES.has(existingRuntime?.status)) throw new Error('Plugin command is already running')
    const { file, args } = parseServiceCommand(commandEntry.command)
    const cwd = resolveCommandCwd(plugin.manifest, commandEntry.cwd)
    const commandContext = {
      pluginId,
      commandId,
      payload: cloneJsonValue(payload, 'payload', { allowUndefined: true }),
      config: cloneJsonValue(config, 'config'),
      paths: {
        extensionDir: cwd
      }
    }
    const bridgeRuntime = await createPluginEntryBridgeRuntime(plugin, commandId)
    let child
    try {
      child = spawnCommandProcess(file, args, {
        cwd,
        detached: false,
        env: {
          ...createServiceProcessEnv(),
          OPENPET_BRIDGE_URL: bridgeRuntime.url,
          OPENPET_BRIDGE_TOKEN: bridgeRuntime.token
        },
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })
    } catch (error) {
      releasePluginEntryBridgeRuntime(bridgeRuntime.key)
      throw error
    }
    const runtime = {
      pluginId,
      commandId,
      status: 'running',
      error: '',
      child,
      stop: null
    }
    commandRuntimes.set(runtimeKey, runtime)
    let stdoutText = ''
    let stderrText = ''

    return new Promise((resolve, reject) => {
      let settled = false
      const safeKillChild = () => {
        try {
          child.kill?.('SIGTERM')
        } catch (_) {}
      }
      const settle = (callback) => {
        if (settled) return
        settled = true
        if (timeoutId) clearTimeout(timeoutId)
        commandRuntimes.delete(runtimeKey)
        releasePluginEntryBridgeRuntime(bridgeRuntime.key)
        callback()
      }
      runtime.stop = () => {
        settle(() => {
          safeKillChild()
          reject(new Error('Command stopped'))
        })
      }
      const timeoutMs = Number.isFinite(Number(commandProcessTimeoutMs))
        ? Math.max(0, Number(commandProcessTimeoutMs))
        : LOCAL_PLUGIN_COMMAND_TIMEOUT_MS
      const timeoutId = timeoutMs > 0
        ? setTimeout(() => {
            settle(() => {
              safeKillChild()
              reject(new Error(`Plugin command timed out after ${timeoutMs}ms`))
            })
          }, timeoutMs)
        : null
      timeoutId?.unref?.()

      child.stdout?.on?.('data', (chunk) => {
        stdoutText = appendLimitedOutput(stdoutText, chunk)
        const message = String(chunk || '').trim()
        if (message) appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: `Command stdout: ${message}`.slice(0, 500) })
      })
      child.stderr?.on?.('data', (chunk) => {
        stderrText = appendLimitedOutput(stderrText, chunk)
        const message = String(chunk || '').trim()
        if (message) appendLog({ pluginId: plugin.manifest.id, commandId, level: 'error', message: `Command stderr: ${message}`.slice(0, 500) })
      })
      child.on?.('error', (error) => {
        settle(() => reject(error))
      })
      child.stdin?.on?.('error', (error) => {
        settle(() => {
          safeKillChild()
          reject(error)
        })
      })
      child.on?.('exit', (code, signal) => {
        settle(() => {
          const exitCode = Number.isFinite(Number(code)) ? Number(code) : null
          if (exitCode !== 0 || signal) {
            reject(new Error(signal ? `Plugin command exited with signal ${signal}` : `Plugin command exited with code ${exitCode ?? 'unknown'}`))
            return
          }
          const parsedResult = readCommandResult(stdoutText)
          resolve({
            ok: true,
            pluginId,
            commandId,
            exitCode,
            ...(parsedResult ? { result: parsedResult } : {}),
            ...(!parsedResult && stdoutText.trim() ? { stdout: stdoutText.trim() } : {}),
            ...(stderrText.trim() ? { stderr: stderrText.trim() } : {})
          })
        })
      })

      try {
        child.stdin?.end?.(`${JSON.stringify(commandContext)}\n`)
      } catch (error) {
        settle(() => {
          safeKillChild()
          reject(error)
        })
      }
    })
  }

  const runCommand = async (pluginId, commandId, payload = {}) => {
    try {
      const plugin = getPlugins().find((candidate) => candidate.manifest.id === pluginId)
      if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
      assertPluginAllowed(plugin.manifest)
      if (!getEnabledMap()[pluginId]) throw new Error('Plugin is disabled')
      appendLog({ pluginId, commandId, level: 'info', message: 'Command started' })
      let result
      const sdk = createSdk(plugin)
      if (typeof plugin.activate === 'function') {
        const returnedCommands = plugin.activate(sdk) || {}
        const commands = {
          ...returnedCommands,
          ...(sdk[SDK_REGISTERED_COMMANDS]?.() || {})
        }
        const handler = commands[commandId]
        if (typeof handler !== 'function') throw new Error(`Plugin command not found: ${commandId}`)
        result = await handler(payload)
      } else if (plugin.mainPath) {
        result = await runLocalPluginCommand({
          plugin,
          sdk,
          commandId,
          payload,
          config: getPluginConfig(plugin.manifest.id, plugin.configSchema)
        })
      } else if (plugin.manifest.entries?.commands?.length) {
        const commandEntry = getCommandEntry(plugin, commandId)
        result = await runCommandEntryProcess({
          plugin,
          commandEntry,
          commandId,
          payload,
          config: getPluginConfig(plugin.manifest.id, plugin.configSchema)
        })
      } else {
        throw new Error('Plugin is not runnable')
      }
      appendLog({ pluginId, commandId, level: 'info', message: 'Command completed' })
      return result
    } catch (error) {
      appendLog({
        pluginId,
        commandId,
        level: 'error',
        message: error.message || 'Command failed'
      })
      throw error
    }
  }

  const runSetup = (pluginId, setupId) => {
    const commandId = `setup:${setupId || ''}`
    try {
      const plugin = findPluginForService(pluginId)
      const setupEntry = getSetupEntry(plugin, setupId)
      const existingRuntime = getPluginSetupRuntime(pluginId, setupId)
      if (ACTIVE_SETUP_STATUSES.has(existingRuntime?.status)) throw new Error('Plugin setup is already running')
      const { file, args } = parseServiceCommand(setupEntry.command)
      const cwd = resolveSetupCwd(plugin.manifest, setupEntry.cwd)
      const child = spawnSetupProcess(file, args, {
        cwd,
        detached: false,
        env: createServiceProcessEnv(),
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })
      const runtime = setSetupRuntime(pluginId, setupId, {
        pluginId,
        setupId,
        status: 'running',
        lastRunAt: new Date().toISOString(),
        exitCode: null,
        error: '',
        child
      })

      appendLog({ pluginId, commandId, level: 'info', message: 'Setup started' })

      return new Promise((resolve, reject) => {
        let settled = false
        const settle = (callback) => {
          if (settled) return
          settled = true
          callback()
        }

        child.stdout?.on?.('data', (chunk) => {
          const message = String(chunk || '').trim()
          if (message) appendLog({ pluginId, commandId, level: 'info', message: `Setup stdout: ${message}`.slice(0, 500) })
        })
        child.stderr?.on?.('data', (chunk) => {
          const message = String(chunk || '').trim()
          if (message) appendLog({ pluginId, commandId, level: 'error', message: `Setup stderr: ${message}`.slice(0, 500) })
        })
        child.on?.('error', (error) => {
          settle(() => {
            runtime.status = 'failed'
            runtime.error = error.message || 'Plugin setup failed'
            runtime.exitCode = null
            runtime.lastRunAt = new Date().toISOString()
            appendLog({ pluginId, commandId, level: 'error', message: 'Setup failed' })
            reject(error)
          })
        })
        child.on?.('exit', (code, signal) => {
          settle(() => {
            const exitCode = Number.isFinite(Number(code)) ? Number(code) : null
            runtime.status = exitCode === 0 && !signal ? 'succeeded' : 'failed'
            runtime.exitCode = exitCode
            runtime.error = runtime.status === 'failed' ? (signal ? `Setup exited with signal ${signal}` : `Setup exited with code ${exitCode ?? 'unknown'}`) : ''
            runtime.lastRunAt = new Date().toISOString()
            appendLog({
              pluginId,
              commandId,
              level: runtime.status === 'failed' ? 'error' : 'info',
              message: runtime.status === 'failed' ? 'Setup failed' : 'Setup completed'
            })
            resolve({
              ok: true,
              pluginId,
              setupId,
              runtime: createSetupRuntimeView(runtime)
            })
          })
        })
      })
    } catch (error) {
      appendLog({ pluginId, commandId, level: 'error', message: error.message || 'Setup failed' })
      throw error
    }
  }

  const openDashboard = async (pluginId, dashboardId) => {
    const commandId = `dashboard:${dashboardId || ''}`
    try {
      const plugin = getPlugins().find((candidate) => candidate.manifest.id === pluginId)
      if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
      assertPluginAllowed(plugin.manifest)
      if (!getEnabledMap()[pluginId]) throw new Error('Plugin is disabled')
      const dashboard = (plugin.manifest.entries?.dashboards || []).find((entry) => entry.id === dashboardId)
      if (!dashboard) throw new Error(`Plugin dashboard not found: ${dashboardId}`)
      let dashboardUrl
      try {
        dashboardUrl = new URL(dashboard.url)
      } catch (_) {
        throw new Error('Plugin dashboard URL is invalid')
      }
      if (!['http:', 'https:'].includes(dashboardUrl.protocol)) {
        throw new Error('Plugin dashboard URL must use HTTP or HTTPS')
      }
      await openExternal(dashboardUrl.toString())
      appendLog({ pluginId, commandId, level: 'info', message: 'Dashboard opened' })
      return {
        ok: true,
        pluginId,
        dashboardId,
        url: dashboardUrl.toString()
      }
    } catch (error) {
      appendLog({
        pluginId,
        commandId,
        level: 'error',
        message: error.message || 'Dashboard open failed'
      })
      throw error
    }
  }

  const startService = async (pluginId, serviceId) => {
    const commandId = `service:${serviceId || ''}`
    let bridgeRuntime = null
    try {
      const plugin = findPluginForService(pluginId)
      const serviceEntry = getServiceEntry(plugin, serviceId)
      const existingRuntime = getPluginServiceRuntime(pluginId, serviceId)
      if (ACTIVE_SERVICE_STATUSES.has(existingRuntime?.status)) throw new Error('Plugin service is already running')
      const declaration = resolveServiceRuntimeDeclaration(serviceEntry)
      const { file, args } = parseServiceCommand(declaration.command)
      const cwd = resolveServiceCwd(plugin.manifest, declaration.cwd)
      bridgeRuntime = await createPluginEntryBridgeRuntime(plugin, commandId)
      const child = spawnServiceProcess(file, args, {
        cwd,
        detached: true,
        env: {
          ...createServiceProcessEnv(),
          OPENPET_BRIDGE_URL: bridgeRuntime.url,
          OPENPET_BRIDGE_TOKEN: bridgeRuntime.token
        },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })
      const runtime = setServiceRuntime(pluginId, serviceId, {
        pluginId,
        serviceId,
        status: 'running',
        pid: Number(child.pid) || 0,
        startedAt: new Date().toISOString(),
        stoppedAt: '',
        command: declaration.command,
        cwd,
        exitCode: null,
        signal: '',
        error: '',
        child,
        bridgeRuntimeKey: bridgeRuntime.key,
        health: existingRuntime?.health || createServiceHealthView({}, serviceEntry)
      })

      child.stdout?.on?.('data', (chunk) => {
        const message = String(chunk || '').trim()
        if (message) appendLog({ pluginId, commandId, level: 'info', message: `Service stdout: ${message}`.slice(0, 500) })
      })
      child.stderr?.on?.('data', (chunk) => {
        const message = String(chunk || '').trim()
        if (message) appendLog({ pluginId, commandId, level: 'error', message: `Service stderr: ${message}`.slice(0, 500) })
      })
      child.on?.('error', (error) => {
        runtime.status = 'failed'
        runtime.error = error.message || 'Plugin service failed'
        runtime.stoppedAt = new Date().toISOString()
        releasePluginEntryBridgeRuntime(runtime.bridgeRuntimeKey)
        runtime.bridgeRuntimeKey = ''
        appendLog({ pluginId, commandId, level: 'error', message: runtime.error })
      })
      child.on?.('exit', (code, signal) => {
        if (runtime.status === 'stopping') {
          runtime.status = code === 0 ? 'stopped' : 'failed'
          appendLog({ pluginId, commandId, level: runtime.status === 'failed' ? 'error' : 'info', message: runtime.status === 'stopped' ? 'Service stopped' : 'Service exited' })
        } else if (runtime.status === 'running') {
          runtime.status = code === 0 && !signal ? 'exited' : 'failed'
          appendLog({ pluginId, commandId, level: runtime.status === 'failed' ? 'error' : 'info', message: 'Service exited' })
        }
        runtime.exitCode = Number.isFinite(Number(code)) ? Number(code) : null
        runtime.signal = signal || ''
        runtime.stoppedAt = runtime.stoppedAt || new Date().toISOString()
        releasePluginEntryBridgeRuntime(runtime.bridgeRuntimeKey)
        runtime.bridgeRuntimeKey = ''
      })

      appendLog({ pluginId, commandId, level: 'info', message: 'Service started' })
      return {
        ok: true,
        pluginId,
        serviceId,
        runtime: createRuntimeView(runtime, serviceEntry)
      }
    } catch (error) {
      releasePluginEntryBridgeRuntime(bridgeRuntime?.key)
      appendLog({ pluginId, commandId, level: 'error', message: error.message || 'Service start failed' })
      throw error
    }
  }

  const stopService = (pluginId, serviceId) => {
    const plugin = getPlugins().find((candidate) => candidate.manifest.id === pluginId)
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
    const serviceEntry = getServiceEntry(plugin, serviceId)
    const runtime = getPluginServiceRuntime(pluginId, serviceId)
    if (!runtime || runtime.status !== 'running') throw new Error('Plugin service is not running')
    stopPluginServiceRuntime(pluginId, serviceId, runtime)
    return {
      ok: true,
      pluginId,
      serviceId,
      runtime: createRuntimeView(runtime, serviceEntry)
    }
  }

  const checkServiceHealth = async (pluginId, serviceId) => {
    const commandId = `service:${serviceId || ''}`
    try {
      const plugin = findPluginForService(pluginId)
      const serviceEntry = getServiceEntry(plugin, serviceId)
      const healthUrl = normalizeServiceHealthUrl(serviceEntry)
      const runtime = getOrCreateServiceRuntime(pluginId, serviceId, serviceEntry)
      const timeoutMs = Number.isFinite(Number(healthCheckTimeoutMs))
        ? Math.max(0, Number(healthCheckTimeoutMs))
        : PLUGIN_SERVICE_HEALTH_TIMEOUT_MS
      const abortController = timeoutMs > 0 && typeof AbortController === 'function'
        ? new AbortController()
        : null
      let timedOut = false
      const timeoutId = abortController
        ? setTimeout(() => {
            timedOut = true
            abortController.abort()
          }, timeoutMs)
        : null
      timeoutId?.unref?.()
      runtime.health = {
        ...createServiceHealthView(runtime.health || {}, serviceEntry),
        status: 'checking',
        url: healthUrl,
        checkedAt: new Date().toISOString(),
        message: ''
      }

      try {
        const response = await fetchImpl(healthUrl, {
          method: 'GET',
          ...(abortController ? { signal: abortController.signal } : {})
        })
        const statusCode = Number(response?.status)
        const hasStatusCode = Number.isFinite(statusCode)
        const healthy = hasStatusCode ? statusCode >= 200 && statusCode < 300 : Boolean(response?.ok)
        runtime.health = {
          status: healthy ? 'healthy' : 'unhealthy',
          checkedAt: new Date().toISOString(),
          url: healthUrl,
          statusCode: hasStatusCode ? statusCode : null,
          message: healthy ? 'OK' : `HTTP ${hasStatusCode ? statusCode : 'error'}`
        }
      } catch (error) {
        runtime.health = {
          status: 'unhealthy',
          checkedAt: new Date().toISOString(),
          url: healthUrl,
          statusCode: null,
          message: timedOut ? 'Health check timed out' : (error.message || 'Health check failed')
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId)
      }

      appendLog({
        pluginId,
        commandId,
        level: runtime.health.status === 'healthy' ? 'info' : 'error',
        message: runtime.health.status === 'healthy' ? 'Service health healthy' : 'Service health unhealthy'
      })

      return {
        ok: true,
        pluginId,
        serviceId,
        health: createServiceHealthView(runtime.health, serviceEntry),
        runtime: createRuntimeView(runtime, serviceEntry)
      }
    } catch (error) {
      appendLog({ pluginId, commandId, level: 'error', message: error.message || 'Service health check failed' })
      throw error
    }
  }

  const getLogs = (filters = {}) => filterLogs(getLogStore(), filters).map((entry) => ({ ...entry }))

  const exportLogEntries = ({ format = 'json', ...filters } = {}) => exportLogs(getLogs(filters), format)

  const clearLogs = () => {
    saveLogStore([])
    return getLogs()
  }

  const stopAllServices = () => {
    for (const runtime of serviceRuntimes.values()) {
      stopPluginServiceRuntime(runtime.pluginId, runtime.serviceId, runtime, { log: false })
    }
    for (const runtime of setupRuntimes.values()) {
      stopPluginSetupRuntime(runtime.pluginId, runtime.setupId, runtime, { log: false })
    }
    for (const runtime of commandRuntimes.values()) {
      stopPluginCommandRuntime(runtime.pluginId, runtime.commandId, runtime, { log: false })
    }
    pluginBridgeRuntimes.clear()
    if (pluginBridgeServer) {
      pluginBridgeServer.close?.()
      pluginBridgeServer = null
      pluginBridgePort = 0
      pluginBridgeServerStarting = null
    }
    return { ok: true }
  }

  return { listPlugins, setEnabled, saveConfig, clearStorage, runCommand, runSetup, openDashboard, startService, stopService, checkServiceHealth, stopAllServices, getLogs, exportLogs: exportLogEntries, clearLogs }
}

module.exports = { createPluginService, readLocalPluginManifests }
