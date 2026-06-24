const { cloneJsonValue, getJsonByteSize } = require('./plugin-json-utils')
const { MAX_PLUGIN_LOG_ENTRIES, normalizePluginLog, filterLogs, exportLogs } = require('./plugin-log-store')

const STORAGE_KEY_PATTERN = /^[a-zA-Z0-9_.:-]{1,128}$/
const MAX_PLUGIN_STORAGE_BYTES = 64 * 1024
const MAX_PLUGIN_STORAGE_VALUE_BYTES = 16 * 1024

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

const createPluginStorageService = ({ settingsService }) => {
  if (!settingsService) throw new Error('settingsService is required')

  const getPluginSettings = () => settingsService.get().plugins || {}

  const savePluginSettings = (pluginPatch) => {
    const settings = settingsService.get()
    settingsService.save({
      ...settings,
      plugins: {
        ...(settings.plugins || {}),
        ...pluginPatch
      }
    })
  }

  const getLogStore = () => {
    const logs = getPluginSettings().logs
    return Array.isArray(logs) ? logs.map(normalizePluginLog) : []
  }

  const saveLogStore = (logs) => {
    savePluginSettings({
      logs: logs.slice(0, MAX_PLUGIN_LOG_ENTRIES).map((entry, index) => normalizePluginLog(entry, index))
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

  const getEnabledMap = () => getPluginSettings().enabled || {}

  const saveEnabled = (pluginId, enabled) => {
    const plugins = getPluginSettings()
    savePluginSettings({
      enabled: {
        ...(plugins.enabled || {}),
        [pluginId]: Boolean(enabled)
      }
    })
  }

  const getConfigMap = () => getPluginSettings().config || {}

  const saveConfig = (pluginId, config = {}) => {
    const plugins = getPluginSettings()
    savePluginSettings({
      config: {
        ...(plugins.config || {}),
        [pluginId]: cloneJsonValue(config, 'config')
      }
    })
  }

  const getStorageMap = () => getPluginSettings().storage || {}

  const getPluginStorage = (pluginId) => cloneJsonValue(getStorageMap()[pluginId] || {}, 'value')

  const savePluginStorage = (pluginId, storage) => {
    assertStorageSize(storage)
    const plugins = getPluginSettings()
    savePluginSettings({
      storage: {
        ...(plugins.storage || {}),
        [pluginId]: cloneJsonValue(storage, 'value')
      }
    })
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

  const getInstalledMap = () => getPluginSettings().installed || {}

  const getServiceHealthPolicyMap = () => getPluginSettings().serviceHealthPolicies || {}

  const saveServiceHealthPolicy = (pluginId, serviceId, policy = {}) => {
    const plugins = getPluginSettings()
    savePluginSettings({
      serviceHealthPolicies: {
        ...(plugins.serviceHealthPolicies || {}),
        [pluginId]: {
          ...(plugins.serviceHealthPolicies?.[pluginId] || {}),
          [serviceId]: cloneJsonValue(policy, 'policy')
        }
      }
    })
  }

  const getLogs = (filters = {}) => filterLogs(getLogStore(), filters).map((entry) => ({ ...entry }))

  const exportLogEntries = ({ format = 'json', ...filters } = {}) => exportLogs(getLogs(filters), format)

  const clearLogs = () => {
    saveLogStore([])
    return getLogs()
  }

  return {
    appendLog,
    assertStorageKey,
    assertStorageValueSize,
    clearLogs,
    exportLogEntries,
    getConfigMap,
    getEnabledMap,
    getInstalledMap,
    getLogs,
    getPluginStorage,
    getPluginStorageStats,
    getServiceHealthPolicyMap,
    saveConfig,
    saveEnabled,
    saveLogStore,
    savePluginStorage,
    saveServiceHealthPolicy
  }
}

module.exports = {
  MAX_PLUGIN_STORAGE_BYTES,
  MAX_PLUGIN_STORAGE_VALUE_BYTES,
  STORAGE_KEY_PATTERN,
  assertStorageKey,
  assertStorageSize,
  assertStorageValueSize,
  createPluginStorageService
}
