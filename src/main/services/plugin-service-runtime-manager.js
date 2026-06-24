const ACTIVE_SERVICE_STATUSES = new Set(['running', 'stopping'])

const createPluginServiceRuntimeKey = (pluginId, serviceId) => `${pluginId}:${serviceId}`

const createPluginServiceRuntimeManager = ({
  stopRuntime
} = {}) => {
  if (typeof stopRuntime !== 'function') throw new Error('stopRuntime is required')

  const runtimes = new Map()

  const getRuntime = (pluginId, serviceId) => runtimes.get(createPluginServiceRuntimeKey(pluginId, serviceId))

  const setRuntime = (runtime) => {
    if (!runtime?.pluginId) throw new Error('Plugin service runtime pluginId is required')
    if (!runtime?.serviceId) throw new Error('Plugin service runtime serviceId is required')
    runtimes.set(createPluginServiceRuntimeKey(runtime.pluginId, runtime.serviceId), runtime)
    return runtime
  }

  const getOrCreateRuntime = (pluginId, serviceId, createRuntime) => {
    const existingRuntime = getRuntime(pluginId, serviceId)
    if (existingRuntime) return existingRuntime
    if (typeof createRuntime !== 'function') throw new Error('createRuntime is required')
    return setRuntime(createRuntime())
  }

  const assertNotActive = (pluginId, serviceId, message = 'Plugin service is already running') => {
    const existingRuntime = getRuntime(pluginId, serviceId)
    if (ACTIVE_SERVICE_STATUSES.has(existingRuntime?.status)) throw new Error(message)
  }

  const stopPlugin = (pluginId, options = {}) => {
    for (const runtime of runtimes.values()) {
      if (runtime.pluginId === pluginId) {
        stopRuntime(pluginId, runtime.serviceId, runtime, options)
      }
    }
  }

  const stopAll = (options = {}) => {
    for (const runtime of runtimes.values()) {
      stopRuntime(runtime.pluginId, runtime.serviceId, runtime, options)
    }
  }

  const size = () => runtimes.size

  return {
    assertNotActive,
    getOrCreateRuntime,
    getRuntime,
    setRuntime,
    size,
    stopAll,
    stopPlugin
  }
}

module.exports = {
  ACTIVE_SERVICE_STATUSES,
  createPluginServiceRuntimeKey,
  createPluginServiceRuntimeManager
}
