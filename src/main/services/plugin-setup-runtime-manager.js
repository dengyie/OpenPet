const { ACTIVE_PLUGIN_RUNTIME_STATUSES } = require('./plugin-runtime-status')
const { createPluginRuntimeKey, createPluginRuntimeRegistry } = require('./plugin-runtime-registry')

const ACTIVE_SETUP_STATUSES = ACTIVE_PLUGIN_RUNTIME_STATUSES

const createPluginSetupRuntimeKey = createPluginRuntimeKey

const createPluginSetupRuntimeManager = ({
  appendLog = () => {},
  now = () => new Date().toISOString(),
  stopRuntimeProcess
} = {}) => {
  if (typeof stopRuntimeProcess !== 'function') throw new Error('stopRuntimeProcess is required')

  const attachStopHandler = (runtime) => {
    runtime.stop = ({ signal = 'SIGTERM' } = {}) => {
      runtime.status = 'stopping'
      runtime.error = ''
      runtime.exitCode = null
      runtime.lastRunAt = now()
      stopRuntimeProcess(runtime, signal)
      return true
    }
    return runtime
  }

  const stopRuntime = (pluginId, setupId, runtime = getRuntime(pluginId, setupId), { log = true } = {}) => {
    if (!runtime || runtime.status !== 'running') return runtime
    try {
      runtime.stop?.({ signal: 'SIGTERM' })
    } catch (error) {
      runtime.error = error.message || 'Plugin setup stop failed'
      runtime.status = 'failed'
    }
    if (log) appendLog({
      pluginId,
      commandId: `setup:${setupId}`,
      level: runtime.status === 'failed' ? 'error' : 'info',
      message: runtime.status === 'failed' ? runtime.error : 'Setup stop requested'
    })
    if (runtime.status === 'failed') runtime.failStop?.(new Error(runtime.error))
    return runtime
  }

  const runtimeRegistry = createPluginRuntimeRegistry({
    runtimeIdKey: 'setupId',
    alreadyRunningMessage: 'Plugin setup is already running',
    stopRuntime
  })
  const {
    assertNotActive,
    getRuntime,
    setRuntime,
    size,
    stopAll,
    stopPlugin
  } = runtimeRegistry

  return {
    assertNotActive,
    attachStopHandler,
    getRuntime,
    setRuntime,
    size,
    stopAll,
    stopPlugin,
    stopRuntime
  }
}

module.exports = {
  ACTIVE_SETUP_STATUSES,
  createPluginSetupRuntimeKey,
  createPluginSetupRuntimeManager
}
