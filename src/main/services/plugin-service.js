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
const { createPluginSetupProcessController } = require('./plugin-setup-process-controller')
const { createPluginCommandRunController } = require('./plugin-command-run-controller')
const { createPluginDashboardOpenController } = require('./plugin-dashboard-open-controller')
const { createPluginResolutionController } = require('./plugin-resolution-controller')

const SDK_REGISTERED_COMMANDS = Symbol('openpet.registeredCommands')
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

  const resolvePluginAssetPath = (manifest, relativePath) => {
    if (!manifest.basePath) throw new Error('Plugin assets require a local plugin directory')
    if (typeof relativePath !== 'string' || !relativePath.trim()) {
      throw new Error('Plugin asset relativePath is required')
    }
    const normalized = relativePath.replace(/\\/g, '/')
    if (
      normalized.startsWith('/') ||
      /^[a-zA-Z]:\//.test(normalized) ||
      normalized.includes('\0') ||
      normalized.split('/').includes('..')
    ) {
      throw new Error('Plugin asset path must be a safe relative path')
    }
    const basePath = path.resolve(manifest.basePath)
    const targetPath = path.resolve(basePath, normalized)
    if (targetPath !== basePath && !targetPath.startsWith(`${basePath}${path.sep}`)) {
      throw new Error('Plugin asset path must stay inside the plugin directory')
    }
    if (!fs.existsSync(targetPath)) throw new Error('Plugin asset path does not exist')
    const realTargetPath = fs.realpathSync(targetPath)
    const realBasePath = fs.realpathSync(basePath)
    if (realTargetPath !== realBasePath && !realTargetPath.startsWith(`${realBasePath}${path.sep}`)) {
      throw new Error('Plugin asset path must stay inside the plugin directory')
    }
    if (!fs.statSync(realTargetPath).isDirectory()) throw new Error('Plugin asset path must be a folder')
    assertDirectoryHasNoSymlinks(realTargetPath)
    return realTargetPath
  }

  const resolvePluginDataPath = (manifest, relativePath) => {
    if (typeof relativePath !== 'string' || !relativePath.trim()) {
      throw new Error('Plugin data relative path is required')
    }
    const normalized = relativePath.replace(/\\/g, '/')
    if (
      normalized.startsWith('/') ||
      /^[a-zA-Z]:\//.test(normalized) ||
      normalized.includes('\0') ||
      normalized.split('/').includes('..')
    ) {
      throw new Error('Plugin data path must be a safe relative path')
    }
    const { dataDir } = ensurePluginCreatorDirs(manifest)
    const basePath = path.resolve(dataDir)
    const targetPath = path.resolve(basePath, normalized)
    if (targetPath !== basePath && !targetPath.startsWith(`${basePath}${path.sep}`)) {
      throw new Error('Plugin data path must stay inside plugin data directory')
    }
    if (!fs.existsSync(targetPath)) throw new Error('Plugin data path does not exist')
    const realTargetPath = fs.realpathSync(targetPath)
    const realBasePath = fs.realpathSync(basePath)
    if (realTargetPath !== realBasePath && !realTargetPath.startsWith(`${realBasePath}${path.sep}`)) {
      throw new Error('Plugin data path must stay inside plugin data directory')
    }
    if (fs.statSync(realTargetPath).isDirectory()) assertDirectoryHasNoSymlinks(realTargetPath)
    return realTargetPath
  }

  const resolvePickedAssetPath = (sourceDir) => {
    if (typeof sourceDir !== 'string' || !sourceDir.trim()) {
      throw new Error('Selected frame folder is required')
    }
    const targetPath = path.resolve(sourceDir)
    if (!fs.existsSync(targetPath)) throw new Error('Selected frame folder does not exist')
    if (fs.lstatSync(targetPath).isSymbolicLink()) throw new Error('Selected frame folder must not be a symlink')
    const realTargetPath = fs.realpathSync(targetPath)
    if (!fs.statSync(realTargetPath).isDirectory()) throw new Error('Selected frame folder must be a folder')
    assertDirectoryHasNoSymlinks(realTargetPath)
    return realTargetPath
  }

  const selectCreatorAssetSourceDir = async () => {
    const selected = await selectCreatorAssetFrameFolder()
    if (selected?.canceled || !selected?.sourceDir) return { canceled: true }
    return { canceled: false, sourceDir: resolvePickedAssetPath(selected.sourceDir) }
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

  const createPluginBridgeHandlers = (plugin, commandId) => ({
    context: async () => {
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge context requested' })
      return { ok: true, context: createPluginBridgeContext() }
    },
    creatorActionsRead: async () => {
      assertPermission(plugin.manifest, 'actions:read')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.actions read invoked' })
      if (!actionService?.getPreviewConfig && !actionService?.getConfig) {
        throw new Error('Creator action read is not available')
      }
      const actions = actionService?.getPreviewConfig?.()
        || actionService?.getConfig?.()
        || { defaultAction: '', clickAction: '', actions: [] }
      return { ok: true, actions }
    },
    creatorActionsValidate: async (payload = {}) => {
      assertPermission(plugin.manifest, 'actions:write')
      if (!actionService?.validateCreatorActionMutation) throw new Error('Creator action validation is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.actions validate invoked' })
      return { ok: true, validation: actionService.validateCreatorActionMutation(payload) }
    },
    creatorActionsApply: async (payload = {}) => {
      assertPermission(plugin.manifest, 'actions:write')
      if (!actionService?.applyCreatorActionMutation) throw new Error('Creator action apply is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.actions apply invoked' })
      const actions = actionService.applyCreatorActionMutation(payload)
      return { ok: true, actions }
    },
    creatorActionsSubmitTriggerProposal: async (payload = {}) => {
      assertPermission(plugin.manifest, 'actions:write')
      if (!actionService?.submitTriggerProposal) throw new Error('Creator action trigger proposal submission is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.actions submit-trigger-proposal invoked' })
      const result = actionService.submitTriggerProposal(payload)
      return { ok: true, ...result }
    },
    creatorPackManifestRead: async () => {
      assertPermission(plugin.manifest, 'pack-manifest:read')
      if (!petPackService?.getActiveCreatorPackManifest) throw new Error('Creator pack manifest read is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pack-manifest read invoked' })
      return { ok: true, manifest: petPackService.getActiveCreatorPackManifest() }
    },
    creatorPackManifestValidate: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pack-manifest:write')
      if (!petPackService?.validateActiveCreatorPackManifestMutation) throw new Error('Creator pack manifest validation is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pack-manifest validate invoked' })
      return { ok: true, validation: petPackService.validateActiveCreatorPackManifestMutation(payload) }
    },
    creatorPackManifestApply: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pack-manifest:write')
      if (!petPackService?.applyActiveCreatorPackManifestMutation) throw new Error('Creator pack manifest apply is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pack-manifest apply invoked' })
      return { ok: true, manifest: petPackService.applyActiveCreatorPackManifestMutation(payload) }
    },
    creatorAssetsInspectFrames: async (payload = {}) => {
      assertPermission(plugin.manifest, 'assets:inspect')
      if (!actionImportService?.inspectActionFrames) throw new Error('Creator asset inspection is not available')
      const sourceDir = payload.dataRelativePath
        ? resolvePluginDataPath(plugin.manifest, payload.dataRelativePath)
        : resolvePluginAssetPath(plugin.manifest, payload.relativePath)
      assertDirectoryHasNoSymlinks(sourceDir)
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.assets inspect-frames invoked' })
      const result = await actionImportService.inspectActionFrames({
        sourceDir,
        actionId: payload.actionId
      })
      return { ok: true, result }
    },
    creatorAssetsImportFrames: async (payload = {}) => {
      assertPermission(plugin.manifest, 'assets:generate')
      if (!actionImportService?.inspectActionFrames || !actionImportService?.importActionFrames) {
        throw new Error('Creator asset import is not available')
      }
      const sourceDir = payload.dataRelativePath
        ? resolvePluginDataPath(plugin.manifest, payload.dataRelativePath)
        : resolvePluginAssetPath(plugin.manifest, payload.relativePath)
      assertDirectoryHasNoSymlinks(sourceDir)
      const actionId = String(payload.actionId || '')
      const label = payload.label == null || payload.label === '' ? undefined : String(payload.label)
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.assets import-frames invoked' })
      const preflight = await actionImportService.inspectActionFrames({ sourceDir, actionId })
      assertCreatorAssetImportWithinLimits(preflight.inspection, sourceDir)
      const result = await actionImportService.importActionFrames({ sourceDir, actionId, label })
      const { importedAction, ...actions } = result
      return { ok: true, actions, importedAction }
    },
    creatorAssetsPickFramesInspect: async (payload = {}) => {
      assertPermission(plugin.manifest, 'assets:inspect')
      if (!actionImportService?.inspectActionFrames) throw new Error('Creator asset inspection is not available')
      const selected = await selectCreatorAssetSourceDir()
      if (selected.canceled) return { ok: true, canceled: true }
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.assets pick-frames inspect invoked' })
      const result = await actionImportService.inspectActionFrames({
        sourceDir: selected.sourceDir,
        actionId: payload.actionId
      })
      return { ok: true, canceled: false, result }
    },
    creatorAssetsPickFramesImport: async (payload = {}) => {
      assertPermission(plugin.manifest, 'assets:generate')
      if (!actionImportService?.inspectActionFrames || !actionImportService?.importActionFrames) {
        throw new Error('Creator asset import is not available')
      }
      const selected = await selectCreatorAssetSourceDir()
      if (selected.canceled) return { ok: true, canceled: true }
      const actionId = String(payload.actionId || '')
      const label = payload.label == null || payload.label === '' ? undefined : String(payload.label)
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.assets pick-frames import invoked' })
      const preflight = await actionImportService.inspectActionFrames({ sourceDir: selected.sourceDir, actionId })
      assertCreatorAssetImportWithinLimits(preflight.inspection, selected.sourceDir)
      const result = await actionImportService.importActionFrames({ sourceDir: selected.sourceDir, actionId, label })
      const { importedAction, ...actions } = result
      return { ok: true, canceled: false, actions, importedAction }
    },
    creatorPetPackInspectOutput: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pet-pack:import')
      if (!petPackService?.inspectPackSource) throw new Error('Creator pet pack inspection is not available')
      const sourcePath = payload.dataRelativePath
        ? resolvePluginDataPath(plugin.manifest, payload.dataRelativePath)
        : resolvePluginAssetPath(plugin.manifest, payload.relativePath)
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pet-pack inspect-output invoked' })
      return { ok: true, inspection: petPackService.inspectPackSource(sourcePath) }
    },
    creatorPetPackImportOutput: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pet-pack:import')
      if (!petPackService?.importPack) throw new Error('Creator pet pack import is not available')
      const selectionId = String(payload.selectionId || '')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.pet-pack import-output invoked' })
      const imported = petPackService.importPack(selectionId)
      const activated = payload.activate && imported?.pack?.id && petPackService?.setActivePack
        ? petPackService.setActivePack(imported.pack.id)
        : null
      if (activated) {
        onPetPackActivated({
          pluginId: plugin.manifest.id,
          commandId,
          packId: imported.pack.id,
          imported,
          activated
        })
      }
      return { ok: true, imported, activated }
    },
    creatorModelSettingsRead: async () => {
      assertPermission(plugin.manifest, 'model:image-generate')
      if (!imageGenerationModelService?.getConfig) throw new Error('Creator model settings are not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.model-settings read invoked' })
      return { ok: true, config: imageGenerationModelService.getConfig() }
    },
    creatorModelHealthCheck: async () => {
      assertPermission(plugin.manifest, 'model:image-generate')
      if (!imageGenerationModelService?.checkHealth) throw new Error('Creator model health check is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.model-health-check invoked' })
      return { ok: true, result: await imageGenerationModelService.checkHealth({}) }
    },
    creatorModelImageGenerate: async (payload = {}) => {
      assertPermission(plugin.manifest, 'model:image-generate')
      if (!imageGenerationModelService?.generateImage) throw new Error('Creator model image generation is not available')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge creator.model-image-generate invoked' })
      const { backend: _ignoredBackend, ...providerPayload } = payload
      return {
        ok: true,
        result: await imageGenerationModelService.generateImage({
          ...providerPayload,
          output: {
            ...(payload.output || {}),
            dataDir: ensurePluginCreatorDirs(plugin.manifest).dataDir
          }
        })
      }
    },
    petSay: async (payload = {}) => {
      assertPermission(plugin.manifest, 'pet:say')
      appendLog({ pluginId: plugin.manifest.id, commandId, level: 'info', message: 'Bridge pet.say invoked' })
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
        commandId,
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
        commandId,
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
      runtime: createSetupRuntimeView(setupRuntimeManager.getRuntime(manifest.id, setupEntry.id))
    })),
    services: (manifest.entries?.services || []).map((serviceEntry) => ({
      ...serviceEntry,
      healthPolicy: getPluginServiceHealthPolicy(manifest.id, serviceEntry.id),
      runtime: createRuntimeView(serviceRuntimeManager.getRuntime(manifest.id, serviceEntry.id), serviceEntry)
    }))
  })

  const listPlugins = () => getPlugins().map((plugin) => ({
    ...plugin.manifest,
    profile: plugin.manifest.profile || 'runtime',
    entries: decorateEntriesWithRuntime(plugin.manifest),
    enabled: Boolean(getEnabledMap()[plugin.manifest.id]),
    runnable: typeof plugin.activate === 'function' || Boolean(plugin.mainPath) || Boolean(plugin.manifest.entries?.commands?.length),
    signatureStatus: getPluginSignatureStatus(plugin.manifest),
    blockStatus: getPluginPolicyStatus(plugin.manifest),
    configSchema: plugin.configSchema,
    config: getPluginConfig(plugin.manifest.id, plugin.configSchema),
    storage: getPluginStorageStats(plugin.manifest.id)
  }))

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

  const stopPluginServices = (pluginId, options = {}) => serviceRuntimeManager.stopPlugin(pluginId, options)

  const stopPluginSetups = (pluginId, options = {}) => setupRuntimeManager.stopPlugin(pluginId, options)

  const stopPluginCommands = (pluginId) => commandRuntimeManager.stopPlugin(pluginId)

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

  const saveServiceHealthPolicy = (pluginId, serviceId, policy = {}) => {
    const plugin = findPluginForService(pluginId)
    const serviceEntry = getServiceEntry(plugin, serviceId)
    if (!serviceEntry.health?.url) throw new Error('Plugin service health check is not configured')
    const normalizedPolicy = normalizeServiceHealthPolicy(policy)
    const settings = settingsService.get()
    settingsService.save({
      ...settings,
      plugins: {
        ...(settings.plugins || {}),
        serviceHealthPolicies: {
          ...(settings.plugins?.serviceHealthPolicies || {}),
          [pluginId]: {
            ...(settings.plugins?.serviceHealthPolicies?.[pluginId] || {}),
            [serviceId]: normalizedPolicy
          }
        }
      }
    })

    const runtime = serviceRuntimeManager.getRuntime(pluginId, serviceId)
    if (runtime) {
      clearServiceHealthSchedule(runtime)
      scheduleServiceHealthCheck(pluginId, serviceId, runtime, serviceEntry)
    }
    appendLog({
      pluginId,
      commandId: `service:${serviceId}`,
      level: 'info',
      message: normalizedPolicy.enabled ? 'Service health policy saved' : 'Service health policy cleared'
    })
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
    commandRuntimeManager.assertNotActive(plugin.manifest.id, commandId)
    return commandEntryProcessController.run({
      plugin,
      commandEntry,
      commandId,
      payload,
      config
    })
  }

  const commandRunController = createPluginCommandRunController({
    appendLog,
    createSdk,
    getConfig: (pluginId) => getPluginConfig(pluginId, getPlugins().find((candidate) => candidate.manifest.id === pluginId)?.configSchema),
    runLocalCommand: (args) => runLocalPluginCommand(args),
    runCommandEntryProcess,
    getCommandEntry,
    getRegisteredCommands: (sdk) => sdk[SDK_REGISTERED_COMMANDS]?.() || {}
  })

  const dashboardOpenController = createPluginDashboardOpenController({
    appendLog,
    openExternal,
    getDashboardEntry: resolutionController.getDashboardEntry
  })

  const runCommand = async (pluginId, commandId, payload = {}) => {
    try {
      const plugin = findPluginForService(pluginId)
      return await commandRunController.run({
        plugin,
        pluginId,
        commandId,
        payload
      })
    } catch (error) {
      if (error?.openpetLogged) throw error
      const hasErrorLog = getLogs({
        level: 'error',
        pluginId,
        commandId
      }).some((entry) => entry.message === (error.message || 'Command failed'))
      if (!hasErrorLog) {
        appendLog({
          pluginId,
          commandId,
          level: 'error',
          message: error.message || 'Command failed'
        })
      }
      throw error
    }
  }

  const runSetup = (pluginId, setupId) => {
    const commandId = `setup:${setupId || ''}`
    try {
      const plugin = findPluginForService(pluginId)
      const setupEntry = getSetupEntry(plugin, setupId)
      setupRuntimeManager.assertNotActive(pluginId, setupId)
      return setupProcessController.run({
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

  const getLogs = (filters = {}) => filterLogs(getLogStore(), filters).map((entry) => ({ ...entry }))

  const exportLogEntries = ({ format = 'json', ...filters } = {}) => exportLogs(getLogs(filters), format)

  const clearLogs = () => {
    saveLogStore([])
    return getLogs()
  }

  const stopAllServices = () => {
    serviceRuntimeManager.stopAll({ log: false })
    setupRuntimeManager.stopAll({ log: false })
    commandRuntimeManager.stopAll()
    commandBridgeService.close()
    return { ok: true }
  }

  return { listPlugins, setEnabled, saveConfig, saveServiceHealthPolicy, clearStorage, runCommand, runSetup, openDashboard, startService, stopService, checkServiceHealth, stopAllServices, getLogs, exportLogs: exportLogEntries, clearLogs }
}

module.exports = { createPluginService, readLocalPluginManifests }
