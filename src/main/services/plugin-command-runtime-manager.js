const { ACTIVE_PLUGIN_RUNTIME_STATUSES } = require('./plugin-runtime-status')
const { createPluginRuntimeKey, createPluginRuntimeRegistry } = require('./plugin-runtime-registry')

const ACTIVE_COMMAND_STATUSES = ACTIVE_PLUGIN_RUNTIME_STATUSES

const createPluginCommandRuntimeKey = createPluginRuntimeKey

const createPluginCommandRuntimeManager = ({
  appendLog = () => {},
  stopRuntimeProcess
} = {}) => {
  if (typeof stopRuntimeProcess !== 'function') throw new Error('stopRuntimeProcess is required')

  const stopRuntime = (pluginId, commandId, runtime = getRuntime(pluginId, commandId)) => {
    if (!runtime || runtime.status !== 'running') return runtime
    try {
      runtime.stop?.({ reason: 'Command stopped' })
      appendLog({ pluginId, commandId, level: 'info', message: 'Command stop requested' })
    } catch (error) {
      runtime.status = 'failed'
      runtime.error = error.message || 'Plugin command stop failed'
      error.openpetLogged = true
      appendLog({ pluginId, commandId, level: 'error', message: runtime.error })
      runtime.failStop?.(error)
    }
    return runtime
  }

  const runtimeRegistry = createPluginRuntimeRegistry({
    runtimeIdKey: 'commandId',
    alreadyRunningMessage: 'Plugin command is already running',
    stopRuntime
  })
  const {
    assertNotActive,
    deleteRuntime,
    getRuntime,
    setRuntime,
    size,
    stopAll,
    stopPlugin
  } = runtimeRegistry

  const attachStopHandler = (runtime) => {
    runtime.stop = ({ reason = 'Command stopped', signal = 'SIGTERM' } = {}) => {
      runtime.status = 'stopping'
      runtime.error = ''
      runtime.stopReason = reason
      stopRuntimeProcess(runtime, signal)
      return true
    }
    return runtime
  }

  return {
    assertNotActive,
    attachStopHandler,
    deleteRuntime,
    getRuntime,
    setRuntime,
    size,
    stopAll,
    stopPlugin,
    stopRuntime
  }
}

module.exports = {
  ACTIVE_COMMAND_STATUSES,
  createPluginCommandRuntimeKey,
  createPluginCommandRuntimeManager
}
