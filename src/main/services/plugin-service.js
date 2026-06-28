const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { createServiceProcessTree } = require('./service-process-tree')
const { normalizePluginManifest } = require('../plugins/manifest')
const { coerceConfigValue, normalizeConfigSchema } = require('../plugins/config-schema')
const { hasOwn, cloneJsonValue, getJsonByteSize } = require('./plugin-json-utils')
const { MAX_PLUGIN_LOG_ENTRIES, normalizePluginLog, filterLogs, exportLogs } = require('./plugin-log-store')
const { normalizeNetworkRequest, readLimitedResponseText } = require('./plugin-network-client')
const { LOCAL_PLUGIN_COMMAND_TIMEOUT_MS, runLocalPluginCommand } = require('./local-plugin-runner-client')
const { readLocalPluginManifests } = require('./plugin-discovery')
const { createPluginCommandRuntimeManager } = require('./plugin-command-runtime-manager')
const { createPluginCommandBridgeService } = require('./plugin-command-bridge-service')
const { createPluginSetupRuntimeManager } = require('./plugin-setup-runtime-manager')
const { createPluginServiceRuntimeManager } = require('./plugin-service-runtime-manager')
const { createPluginServiceStopController } = require('./plugin-service-stop-controller')
const { createPluginServiceHealthController } = require('./plugin-service-health-controller')
const { createPluginServiceLifecycleController } = require('./plugin-service-lifecycle-controller')
const { createPluginServiceLaunchController } = require('./plugin-service-launch-controller')
const { createPluginCommandEntryProcessController } = require('./plugin-command-entry-process-controller')
const { createPluginDeclarationCommandController } = require('./plugin-declaration-command-controller')
const { createPluginSetupProcessController } = require('./plugin-setup-process-controller')
const { createPluginSetupRuntimeController } = require('./plugin-setup-runtime-controller')
const { createPluginCommandRunController } = require('./plugin-command-run-controller')
const { createPluginCommandOrchestrationController } = require('./plugin-command-orchestration-controller')
const { createPluginDashboardOpenController } = require('./plugin-dashboard-open-controller')
const { createPluginResolutionController } = require('./plugin-resolution-controller')
const { createPluginConfigStorageController } = require('./plugin-config-storage-controller')
const { createPluginRuntimeSdkController } = require('./plugin-runtime-sdk-controller')
const { createPluginBridgeHandlersController } = require('./plugin-bridge-handlers-controller')
const { createPluginAssetPathController } = require('./plugin-asset-path-controller')
const { createPluginListingController } = require('./plugin-listing-controller')
const { createPluginPolicyController } = require('./plugin-policy-controller')
const { createPluginManagementController } = require('./plugin-management-controller')

const STORAGE_KEY_PATTERN = /^[a-zA-Z0-9_.:-]{1,128}$/
const MAX_PLUGIN_STORAGE_BYTES = 64 * 1024
const MAX_PLUGIN_STORAGE_VALUE_BYTES = 16 * 1024
const MAX_PLUGIN_COMMAND_OUTPUT_BYTES = 64 * 1024
const MAX_PLUGIN_ASSET_IMPORT_FRAMES = 240
const MAX_PLUGIN_ASSET_IMPORT_FRAME_PIXELS = 1024 * 1024
const MAX_PLUGIN_ASSET_IMPORT_TOTAL_PIXELS = 48 * 1000 * 1000
const MAX_PLUGIN_ASSET_IMPORT_BYTES = 50 * 1024 * 1024
const PLUGIN_SERVICE_HEALTH_TIMEOUT_MS = 3000
const PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS = 1500
const MIN_PLUGIN_SERVICE_HEALTH_INTERVAL_MS = 15000
const DEFAULT_PLUGIN_SERVICE_HEALTH_INTERVAL_MS = 30000
const MAX_PLUGIN_SERVICE_HEALTH_INTERVAL_MS = 300000
const defaultServiceProcessTree = createServiceProcessTree()

const getDirectoryByteSize = (folderPath) => {
  let totalBytes = 0
  for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
    const entryPath = path.join(folderPath, entry.name)
    const stat = fs.lstatSync(entryPath)
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      totalBytes += getDirectoryByteSize(entryPath)
    } else {
      totalBytes += stat.size
    }
  }
  return totalBytes
}

const assertDirectoryHasNoSymlinks = (folderPath) => {
  for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
    const entryPath = path.join(folderPath, entry.name)
    const stat = fs.lstatSync(entryPath)
    if (stat.isSymbolicLink()) {
      throw new Error('Plugin asset folder must not contain symlinks')
    }
    if (stat.isDirectory()) assertDirectoryHasNoSymlinks(entryPath)
  }
}

const assertCreatorAssetImportWithinLimits = (inspection = {}, sourceDir = '') => {
  if (!inspection.valid) throw new Error((inspection.errors || []).join('; ') || 'Frame folder is invalid')
  const frameCount = Number(inspection.frameCount) || 0
  const maxWidth = Number(inspection.maxWidth) || 0
  const maxHeight = Number(inspection.maxHeight) || 0
  const framePixels = maxWidth * maxHeight
  const totalPixels = framePixels * frameCount
  const totalBytes = sourceDir ? getDirectoryByteSize(sourceDir) : 0

  if (frameCount > MAX_PLUGIN_ASSET_IMPORT_FRAMES) {
    throw new Error(`Frame folder has too many frames: ${frameCount}/${MAX_PLUGIN_ASSET_IMPORT_FRAMES}`)
  }
  if (framePixels > MAX_PLUGIN_ASSET_IMPORT_FRAME_PIXELS) {
    throw new Error(`Frame dimensions are too large: ${maxWidth}x${maxHeight}`)
  }
  if (totalPixels > MAX_PLUGIN_ASSET_IMPORT_TOTAL_PIXELS) {
    throw new Error(`Frame folder is too large to import: ${totalPixels} pixels`)
  }
  if (totalBytes > MAX_PLUGIN_ASSET_IMPORT_BYTES) {
    throw new Error(`Frame folder is too large to import: ${totalBytes} bytes`)
  }
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

const createPluginService = ({ settingsService, petService, actionService, actionImportService, petPackService, aiService, imageGenerationModelService, fetchImpl = globalThis.fetch, serviceHealthTimeoutMs, healthCheckTimeoutMs = serviceHealthTimeoutMs ?? PLUGIN_SERVICE_HEALTH_TIMEOUT_MS, serviceStopGracePeriodMs = PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS, commandProcessTimeoutMs = LOCAL_PLUGIN_COMMAND_TIMEOUT_MS, openExternal = async () => { throw new Error('Dashboard opener is not available') }, selectCreatorAssetFrameFolder = async () => { throw new Error('Creator asset folder picker is not available') }, onPetPackActivated = () => {}, spawnServiceProcess = spawn, spawnSetupProcess = spawnServiceProcess, spawnCommandProcess = spawnServiceProcess, killServiceProcess = process.kill, signalServiceProcessTree = defaultServiceProcessTree.signalServiceProcessTree, setServiceHealthTimer = setTimeout, clearServiceHealthTimer = clearTimeout, pluginDirs = [], officialPlugins = [], getPluginBlockStatus = () => ({ blocked: false, reasons: [] }) }) => {
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

  const getLogs = (filters = {}) => filterLogs(getLogStore(), filters).map((entry) => ({ ...entry }))

  const exportLogEntries = ({ format = 'json', ...filters } = {}) => exportLogs(getLogs(filters), format)

  const clearLogs = () => {
    saveLogStore([])
    return getLogs()
  }

  const commandBridgeService = createPluginCommandBridgeService({ appendLog })

  const ensurePluginCreatorDirs = (manifest) => {
    const baseDir = path.join(path.dirname(manifest.basePath || process.cwd()), '.openpet', manifest.id)
    const dataDir = path.join(baseDir, 'data')
    const cacheDir = path.join(baseDir, 'cache')
    const logDir = path.join(baseDir, 'logs')
    fs.mkdirSync(dataDir, { recursive: true })
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.mkdirSync(logDir, { recursive: true })
    return { dataDir, cacheDir, logDir }
  }

  const assetPathController = createPluginAssetPathController({
    ensureCreatorDirs: ensurePluginCreatorDirs,
    assertDirectoryHasNoSymlinks,
    selectCreatorAssetFrameFolder
  })

  const resolvePluginAssetPath = assetPathController.resolvePluginAssetPath
  const resolvePluginDataPath = assetPathController.resolvePluginDataPath
  const resolvePickedAssetPath = assetPathController.resolvePickedAssetPath
  const selectCreatorAssetSourceDir = assetPathController.selectCreatorAssetSourceDir

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

  const normalizeServiceHealthPolicy = (policy = {}) => {
    const intervalMs = Number(policy.intervalMs)
    return {
      enabled: policy.enabled === true,
      intervalMs: Number.isFinite(intervalMs)
        ? Math.min(MAX_PLUGIN_SERVICE_HEALTH_INTERVAL_MS, Math.max(MIN_PLUGIN_SERVICE_HEALTH_INTERVAL_MS, intervalMs))
        : DEFAULT_PLUGIN_SERVICE_HEALTH_INTERVAL_MS
    }
  }

  const getServiceHealthPolicyMap = () => settingsService.get().plugins?.serviceHealthPolicies || {}

  const getPluginServiceHealthPolicy = (pluginId, serviceId) => normalizeServiceHealthPolicy(
    getServiceHealthPolicyMap()?.[pluginId]?.[serviceId]
  )

  const policyController = createPluginPolicyController({
    getInstalledMap,
    getPluginBlockStatus,
    getSignatureStatus
  })

  const getPluginPolicyStatus = policyController.getPluginPolicyStatus
  const assertPluginAllowed = policyController.assertPluginAllowed
  const getPluginSignatureStatus = policyController.getPluginSignatureStatus

  const normalizePluginConfig = (schema, config = {}) => {
    if (!schema) return {}
    return Object.fromEntries(schema.properties.map((field) => [field.key, coerceConfigValue(config[field.key], field)]))
  }

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

  const configStorageController = createPluginConfigStorageController({
    settingsService,
    normalizePluginConfig,
    cloneJsonValue,
    getJsonByteSize,
    assertStorageSize
  })

  const getPluginConfig = configStorageController.getConfig
  const getPluginStorage = configStorageController.getStorage
  const savePluginStorage = configStorageController.saveStorage
  const getPluginStorageStats = configStorageController.getStorageStats

  const bridgeHandlersController = createPluginBridgeHandlersController({
    appendLog,
    assertPermission,
    getBridgeContext: createPluginBridgeContext,
    getActionsSnapshot: () => actionService?.getPreviewConfig?.()
      || actionService?.getConfig?.()
      || { defaultAction: '', clickAction: '', actions: [] },
    validateActionMutation: actionService?.validateCreatorActionMutation,
    applyActionMutation: actionService?.applyCreatorActionMutation,
    submitTriggerProposal: actionService?.submitTriggerProposal,
    readPackManifest: petPackService?.getActiveCreatorPackManifest,
    validatePackManifestMutation: petPackService?.validateActiveCreatorPackManifestMutation,
    applyPackManifestMutation: petPackService?.applyActiveCreatorPackManifestMutation,
    inspectFrames: actionImportService?.inspectActionFrames,
    importFrames: actionImportService?.importActionFrames,
    inspectPackOutput: petPackService?.inspectPackSource,
    importPackOutput: petPackService?.importPack,
    setActivePack: petPackService?.setActivePack,
    onPetPackActivated,
    readModelSettings: imageGenerationModelService?.getConfig,
    checkModelHealth: imageGenerationModelService?.checkHealth,
    generateModelImage: imageGenerationModelService?.generateImage,
    petService,
    resolveAssetPath: resolvePluginAssetPath,
    resolveDataPath: resolvePluginDataPath,
    selectAssetSourceDir: selectCreatorAssetSourceDir,
    assertDirectoryHasNoSymlinks,
    assertCreatorAssetImportWithinLimits,
    ensureCreatorDirs: ensurePluginCreatorDirs
  })

  const createPluginBridgeHandlers = bridgeHandlersController.createHandlers

  const listingController = createPluginListingController({
    getSetupRuntime: (pluginId, setupId) => setupRuntimeManager.getRuntime(pluginId, setupId),
    getServiceRuntime: (pluginId, serviceId) => serviceRuntimeManager.getRuntime(pluginId, serviceId),
    createHealthView: createServiceHealthView,
    getHealthPolicy: getPluginServiceHealthPolicy,
    getEnabledMap,
    getPluginConfig,
    getPluginStorageStats,
    getPluginSignatureStatus,
    getPluginPolicyStatus
  })

  const createRuntimeView = listingController.createRuntimeView
  const createSetupRuntimeView = listingController.createSetupRuntimeView
  const decorateEntriesWithRuntime = listingController.decorateEntriesWithRuntime
  const listPlugins = () => listingController.listPlugins(getPlugins())

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

  const resolutionController = createPluginResolutionController({
    getPlugins,
    getEnabledMap,
    assertPluginAllowed
  })

  const findPluginForService = resolutionController.resolvePlugin
  const getServiceEntry = resolutionController.getServiceEntry
  const getSetupEntry = resolutionController.getSetupEntry
  const getCommandEntry = resolutionController.getCommandEntry

  const getOrCreateServiceRuntime = (pluginId, serviceId, serviceEntry) => {
    return serviceRuntimeManager.getOrCreateRuntime(pluginId, serviceId, () => ({
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
      stopTimer: null,
      healthTimer: null,
      healthChecking: false,
      stopGracePeriodMs: Number.isFinite(Number(serviceStopGracePeriodMs)) ? Math.max(0, Number(serviceStopGracePeriodMs)) : PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS,
      health: createServiceHealthView({}, serviceEntry)
    }))
  }

  const stopServiceProcess = (runtime, signal = 'SIGTERM') => {
    const pid = Number(runtime?.pid) || 0
    if (pid > 0) {
      try {
        killServiceProcess(-pid, signal)
        return
      } catch (_) {
        try {
          if (signalServiceProcessTree(pid, signal)) return
        } catch (_) {}
      }
    }
    runtime.child?.kill?.(signal)
  }

  const forceStopServiceProcess = (runtime, signal = 'SIGKILL') => {
    const pid = Number(runtime?.pid) || 0
    if (pid > 0) {
      try {
        killServiceProcess(-pid, signal)
        return
      } catch (_) {
        try {
          if (signalServiceProcessTree(pid, signal)) return
        } catch (_) {}
      }
    }
    runtime.child?.kill?.(signal)
  }

  const stopRuntimeProcessWithFallback = (runtime, signal = 'SIGTERM') => {
    const pid = Number(runtime?.pid) || 0
    if (pid > 0) {
      try {
        if (signalServiceProcessTree(pid, signal)) return
      } catch (_) {}
    }
    runtime.child?.kill?.(signal)
  }

  const commandRuntimeManager = createPluginCommandRuntimeManager({
    appendLog,
    stopRuntimeProcess: stopRuntimeProcessWithFallback
  })

  const setupRuntimeManager = createPluginSetupRuntimeManager({
    appendLog,
    stopRuntimeProcess: stopRuntimeProcessWithFallback
  })

  const healthController = createPluginServiceHealthController({
    appendLog,
    fetchImpl,
    getPolicy: getPluginServiceHealthPolicy,
    createHealthView: createServiceHealthView,
    setHealthTimer: setServiceHealthTimer,
    clearHealthTimer: clearServiceHealthTimer,
    timeoutMs: healthCheckTimeoutMs
  })

  const clearServiceHealthSchedule = healthController.clearSchedule
  const scheduleServiceHealthCheck = healthController.scheduleCheck

  const stopController = createPluginServiceStopController({
    appendLog,
    killServiceProcess,
    signalServiceProcessTree,
    setStopTimer: setTimeout,
    clearStopTimer: clearTimeout,
    clearHealthSchedule: clearServiceHealthSchedule,
    fallbackGracePeriodMs: PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS
  })

  const serviceRuntimeManager = createPluginServiceRuntimeManager({
    stopRuntime: stopController.stopRuntime
  })

  const lifecycleController = createPluginServiceLifecycleController({
    appendLog,
    clearStopTimer: stopController.clearStopTimer,
    clearHealthSchedule: stopController.clearHealthSchedule,
    createHealthView: createServiceHealthView,
    fallbackStopGracePeriodMs: PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS
  })

  const launchController = createPluginServiceLaunchController({
    parseCommand: parseServiceCommand,
    resolveCwd: resolveServiceCwd,
    createEnv: createServiceProcessEnv,
    spawnServiceProcess
  })

  const commandEntryProcessController = createPluginCommandEntryProcessController({
    appendLog,
    appendLimitedOutput,
    cloneJsonValue,
    createBridgeRun: ({ pluginId, commandId, handlers }) => commandBridgeService.createRun({ pluginId, commandId, handlers }),
    deleteBridgeRun: (pluginId, commandId, runId) => commandBridgeService.deleteRun(pluginId, commandId, runId),
    createBridgeHandlers: createPluginBridgeHandlers,
    ensureCreatorDirs: ensurePluginCreatorDirs,
    createEnv: createServiceProcessEnv,
    parseCommand: parseServiceCommand,
    resolveCwd: resolveCommandCwd,
    spawnCommandProcess,
    setRuntime: (runtime) => commandRuntimeManager.setRuntime(runtime),
    deleteRuntime: (pluginId, commandId) => commandRuntimeManager.deleteRuntime(pluginId, commandId),
    attachStopHandler: (runtime) => commandRuntimeManager.attachStopHandler(runtime),
    readCommandResult,
    commandProcessTimeoutMs
  })

  const setupProcessController = createPluginSetupProcessController({
    appendLog,
    parseCommand: parseServiceCommand,
    resolveCwd: resolveSetupCwd,
    createEnv: createServiceProcessEnv,
    spawnSetupProcess,
    setRuntime: (runtime) => setupRuntimeManager.setRuntime(runtime),
    attachStopHandler: (runtime) => setupRuntimeManager.attachStopHandler(runtime),
    createRuntimeView: createSetupRuntimeView
  })

  const setupRuntimeController = createPluginSetupRuntimeController({
    runtimeManager: setupRuntimeManager,
    processController: setupProcessController
  })

  const stopPluginServices = (pluginId, options = {}) => serviceRuntimeManager.stopPlugin(pluginId, options)

  const stopPluginSetups = (pluginId, options = {}) => setupRuntimeController.stopPlugin(pluginId, options)

  const runtimeSdkController = createPluginRuntimeSdkController({
    getConfig: getPluginConfig,
    getStorage: getPluginStorage,
    saveStorage: savePluginStorage,
    assertPermission,
    assertStorageKey,
    assertStorageValueSize,
    runAiChat: runPluginAiChat,
    runNetworkRequest: runPluginNetworkRequest,
    petService,
    cloneJsonValue
  })

  const createSdk = runtimeSdkController.createSdk

  const declarationCommandController = createPluginDeclarationCommandController({
    runtimeManager: commandRuntimeManager,
    entryProcessController: commandEntryProcessController
  })

  const commandRunController = createPluginCommandRunController({
    appendLog,
    createSdk,
    getConfig: (pluginId) => getPluginConfig(pluginId, getPlugins().find((candidate) => candidate.manifest.id === pluginId)?.configSchema),
    runLocalCommand: (args) => runLocalPluginCommand(args),
    runCommandEntryProcess: (args) => declarationCommandController.run(args),
    getCommandEntry,
    getRegisteredCommands: (sdk) => sdk[runtimeSdkController.registeredCommandsSymbol]?.() || {}
  })
  const commandOrchestrationController = createPluginCommandOrchestrationController({
    resolvePlugin: findPluginForService,
    runCommand: ({ plugin, pluginId, commandId, payload }) => commandRunController.run({
      plugin,
      pluginId,
      commandId,
      payload
    }),
    appendLog,
    getLogs
  })

  const dashboardOpenController = createPluginDashboardOpenController({
    appendLog,
    openExternal,
    getDashboardEntry: resolutionController.getDashboardEntry
  })

  const managementController = createPluginManagementController({
    settingsService,
    assertPluginAllowed,
    stopPluginCommands: (pluginId) => declarationCommandController.stopPlugin(pluginId),
    stopPluginServices,
    stopPluginSetups,
    appendLog,
    listPlugins,
    getPlugins,
    saveConfig: configStorageController.saveConfig,
    clearStorage: configStorageController.clearStorage,
    findPluginForService,
    getServiceEntry,
    normalizeServiceHealthPolicy,
    getServiceRuntime: (pluginId, serviceId) => serviceRuntimeManager.getRuntime(pluginId, serviceId),
    clearServiceHealthSchedule,
    scheduleServiceHealthCheck
  })

  const setEnabled = managementController.setEnabled
  const saveConfig = managementController.saveConfig
  const saveServiceHealthPolicy = managementController.saveServiceHealthPolicy
  const clearStorage = managementController.clearStorage

  const runCommand = async (pluginId, commandId, payload = {}) => {
    return commandOrchestrationController.run(pluginId, commandId, payload)
  }

  const runSetup = (pluginId, setupId) => {
    const commandId = `setup:${setupId || ''}`
    try {
      const plugin = findPluginForService(pluginId)
      const setupEntry = getSetupEntry(plugin, setupId)
      return setupRuntimeController.run({
        pluginId,
        manifest: plugin.manifest,
        setupId,
        setupEntry
      })
    } catch (error) {
      appendLog({ pluginId, commandId, level: 'error', message: error.message || 'Setup failed' })
      throw error
    }
  }

  const openDashboard = async (pluginId, dashboardId) => {
    const commandId = `dashboard:${dashboardId || ''}`
    try {
      const plugin = findPluginForService(pluginId)
      return await dashboardOpenController.open({
        plugin,
        pluginId,
        dashboardId
      })
    } catch (error) {
      if (!error?.openpetLogged) {
        appendLog({
          pluginId,
          commandId,
          level: 'error',
          message: error.message || 'Dashboard open failed'
        })
      }
      throw error
    }
  }

  const startService = (pluginId, serviceId) => {
    const commandId = `service:${serviceId || ''}`
    try {
      const plugin = findPluginForService(pluginId)
      const serviceEntry = getServiceEntry(plugin, serviceId)
      const existingRuntime = serviceRuntimeManager.getRuntime(pluginId, serviceId)
      serviceRuntimeManager.assertNotActive(pluginId, serviceId)
      const { child, cwd, declaration } = launchController.spawnRuntime({
        pluginManifest: plugin.manifest,
        serviceEntry
      })
      const runtime = serviceRuntimeManager.setRuntime(lifecycleController.createRuntime({
        pluginId,
        serviceId,
        child,
        command: declaration.command,
        cwd,
        existingHealth: existingRuntime?.health,
        serviceEntry,
        stopGracePeriodMs: serviceStopGracePeriodMs
      }))

      lifecycleController.attachChildHandlers({
        pluginId,
        serviceId,
        runtime,
        child
      })

      appendLog({ pluginId, commandId, level: 'info', message: 'Service started' })
      scheduleServiceHealthCheck(pluginId, serviceId, runtime, serviceEntry)
      return {
        ok: true,
        pluginId,
        serviceId,
        runtime: createRuntimeView(runtime, serviceEntry)
      }
    } catch (error) {
      appendLog({ pluginId, commandId, level: 'error', message: error.message || 'Service start failed' })
      throw error
    }
  }

  const stopService = (pluginId, serviceId) => {
    const plugin = findPluginForService(pluginId, { requireEnabled: false, requireAllowed: false })
    const serviceEntry = getServiceEntry(plugin, serviceId)
    const runtime = serviceRuntimeManager.getRuntime(pluginId, serviceId)
    if (!runtime || runtime.status !== 'running') throw new Error('Plugin service is not running')
    stopController.stopRuntime(pluginId, serviceId, runtime)
    return {
      ok: true,
      pluginId,
      serviceId,
      runtime: createRuntimeView(runtime, serviceEntry)
    }
  }

  const checkServiceHealth = async (pluginId, serviceId, { reschedule = true } = {}) => {
    const commandId = `service:${serviceId || ''}`
    try {
      const plugin = findPluginForService(pluginId)
      const serviceEntry = getServiceEntry(plugin, serviceId)
      const runtime = getOrCreateServiceRuntime(pluginId, serviceId, serviceEntry)
      await healthController.checkHealth(pluginId, serviceId, runtime, serviceEntry, { reschedule })

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

  const stopAllServices = () => {
    serviceRuntimeManager.stopAll({ log: false })
    setupRuntimeManager.stopAll({ log: false })
    declarationCommandController.stopAll()
    commandBridgeService.close()
    return { ok: true }
  }

  return { listPlugins, setEnabled, saveConfig, saveServiceHealthPolicy, clearStorage, runCommand, runSetup, openDashboard, startService, stopService, checkServiceHealth, stopAllServices, getLogs, exportLogs: exportLogEntries, clearLogs }
}

module.exports = { createPluginService, readLocalPluginManifests }
