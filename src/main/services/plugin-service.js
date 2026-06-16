const fs = require('fs')
const path = require('path')
const { fork } = require('child_process')
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
const LOCAL_PLUGIN_RUNNER_PATH = path.join(__dirname, '../plugins/local-plugin-runner.js')

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

const createPluginService = ({ settingsService, petService, aiService, fetchImpl = globalThis.fetch, openExternal = async () => { throw new Error('Dashboard opener is not available') }, pluginDirs = [], officialPlugins = [], getPluginBlockStatus = () => ({ blocked: false, reasons: [] }) }) => {
  if (!settingsService) throw new Error('settingsService is required')
  if (!petService) throw new Error('petService is required')

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

  const listPlugins = () => getPlugins().map((plugin) => ({
    ...plugin.manifest,
    enabled: Boolean(getEnabledMap()[plugin.manifest.id]),
    runnable: typeof plugin.activate === 'function' || Boolean(plugin.mainPath),
    signatureStatus: getPluginSignatureStatus(plugin.manifest),
    blockStatus: getPluginPolicyStatus(plugin.manifest),
    configSchema: plugin.configSchema,
    config: getPluginConfig(plugin.manifest.id, plugin.configSchema),
    storage: getPluginStorageStats(plugin.manifest.id)
  }))

  const setEnabled = (pluginId, enabled) => {
    if (enabled) assertPluginAllowed(pluginId)
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

  const getLogs = (filters = {}) => filterLogs(getLogStore(), filters).map((entry) => ({ ...entry }))

  const exportLogEntries = ({ format = 'json', ...filters } = {}) => exportLogs(getLogs(filters), format)

  const clearLogs = () => {
    saveLogStore([])
    return getLogs()
  }

  return { listPlugins, setEnabled, saveConfig, clearStorage, runCommand, openDashboard, getLogs, exportLogs: exportLogEntries, clearLogs }
}

module.exports = { createPluginService, readLocalPluginManifests }
