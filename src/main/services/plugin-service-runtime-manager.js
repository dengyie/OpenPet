const { ACTIVE_PLUGIN_RUNTIME_STATUSES } = require('./plugin-runtime-status')
const { createPluginRuntimeKey, createPluginRuntimeRegistry } = require('./plugin-runtime-registry')

const ACTIVE_SERVICE_STATUSES = ACTIVE_PLUGIN_RUNTIME_STATUSES

const createPluginServiceRuntimeKey = createPluginRuntimeKey

const createPluginServiceRuntimeManager = ({
  stopRuntime
} = {}) => {
  const runtimeRegistry = createPluginRuntimeRegistry({
    runtimeIdKey: 'serviceId',
    alreadyRunningMessage: 'Plugin service is already running',
    stopRuntime
  })
  const {
    assertNotActive,
    getOrCreateRuntime,
    getRuntime,
    listRuntimes,
    setRuntime,
    size,
    stopAll,
    stopPlugin
  } = runtimeRegistry

  return {
    assertNotActive,
    getOrCreateRuntime,
    getRuntime,
    listRuntimes,
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
