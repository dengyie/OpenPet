const createPluginConfigStorageController = ({
  settingsService,
  normalizePluginConfig,
  cloneJsonValue,
  getJsonByteSize,
  assertStorageSize
} = {}) => {
  if (!settingsService) throw new Error('settingsService is required')
  if (typeof normalizePluginConfig !== 'function') throw new Error('normalizePluginConfig is required')
  if (typeof cloneJsonValue !== 'function') throw new Error('cloneJsonValue is required')
  if (typeof getJsonByteSize !== 'function') throw new Error('getJsonByteSize is required')
  if (typeof assertStorageSize !== 'function') throw new Error('assertStorageSize is required')

  const getConfigMap = () => settingsService.get().plugins?.config || {}
  const getStorageMap = () => settingsService.get().plugins?.storage || {}

  const getConfig = (pluginId, schema) => normalizePluginConfig(schema, getConfigMap()[pluginId] || {})

  const saveConfig = (pluginId, schema, config = {}) => {
    const normalizedConfig = normalizePluginConfig(schema, config)
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
    return normalizedConfig
  }

  const getStorage = (pluginId) => cloneJsonValue(getStorageMap()[pluginId] || {}, 'value')

  const saveStorage = (pluginId, storage) => {
    assertStorageSize(storage)
    const settings = settingsService.get()
    const nextStorage = cloneJsonValue(storage, 'value')
    settingsService.save({
      ...settings,
      plugins: {
        ...(settings.plugins || {}),
        storage: {
          ...(settings.plugins?.storage || {}),
          [pluginId]: nextStorage
        }
      }
    })
    return getStorage(pluginId)
  }

  const clearStorage = (pluginId) => saveStorage(pluginId, {})

  const getStorageStats = (pluginId) => {
    try {
      const storage = getStorage(pluginId)
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

  return {
    getConfig,
    saveConfig,
    getStorage,
    saveStorage,
    clearStorage,
    getStorageStats
  }
}

module.exports = {
  createPluginConfigStorageController
}
