const { ACTIVE_PLUGIN_RUNTIME_STATUSES, isActivePluginRuntimeStatus } = require('./plugin-runtime-status')

const createPluginRuntimeKey = (pluginId, runtimeId) => `${pluginId}:${runtimeId}`

const createPluginRuntimeRegistry = ({
  pluginIdKey = 'pluginId',
  runtimeIdKey,
  activeStatuses = ACTIVE_PLUGIN_RUNTIME_STATUSES,
  alreadyRunningMessage = 'Plugin runtime is already running',
  stopRuntime
} = {}) => {
  if (typeof runtimeIdKey !== 'string' || !runtimeIdKey) throw new Error('runtimeIdKey is required')
  if (typeof stopRuntime !== 'function') throw new Error('stopRuntime is required')

  const runtimes = new Map()

  const getRuntimeIdentity = (runtime = {}) => ({
    pluginId: runtime?.[pluginIdKey],
    runtimeId: runtime?.[runtimeIdKey]
  })

  const getRuntime = (pluginId, runtimeId) => runtimes.get(createPluginRuntimeKey(pluginId, runtimeId))

  const setRuntime = (runtime) => {
    const { pluginId, runtimeId } = getRuntimeIdentity(runtime)
    if (!pluginId) throw new Error(`Plugin runtime ${pluginIdKey} is required`)
    if (!runtimeId) throw new Error(`Plugin runtime ${runtimeIdKey} is required`)
    runtimes.set(createPluginRuntimeKey(pluginId, runtimeId), runtime)
    return runtime
  }

  const deleteRuntime = (pluginId, runtimeId) => runtimes.delete(createPluginRuntimeKey(pluginId, runtimeId))

  const getOrCreateRuntime = (pluginId, runtimeId, createRuntime) => {
    const existingRuntime = getRuntime(pluginId, runtimeId)
    if (existingRuntime) return existingRuntime
    if (typeof createRuntime !== 'function') throw new Error('createRuntime is required')
    return setRuntime(createRuntime())
  }

  const assertNotActive = (pluginId, runtimeId, message = alreadyRunningMessage) => {
    const existingRuntime = getRuntime(pluginId, runtimeId)
    const isActive = activeStatuses === ACTIVE_PLUGIN_RUNTIME_STATUSES
      ? isActivePluginRuntimeStatus(existingRuntime?.status)
      : activeStatuses.has(existingRuntime?.status)
    if (isActive) throw new Error(message)
  }

  const stopPlugin = (pluginId, options = {}) => {
    for (const runtime of runtimes.values()) {
      if (runtime?.[pluginIdKey] === pluginId) {
        stopRuntime(pluginId, runtime[runtimeIdKey], runtime, options)
      }
    }
  }

  const stopAll = (options = {}) => {
    for (const runtime of runtimes.values()) {
      stopRuntime(runtime[pluginIdKey], runtime[runtimeIdKey], runtime, options)
    }
  }

  const size = () => runtimes.size

  return {
    assertNotActive,
    deleteRuntime,
    getOrCreateRuntime,
    getRuntime,
    setRuntime,
    size,
    stopAll,
    stopPlugin
  }
}

module.exports = {
  createPluginRuntimeKey,
  createPluginRuntimeRegistry
}
