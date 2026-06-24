const ACTIVE_COMMAND_STATUSES = new Set(['running', 'stopping'])

const createPluginCommandRuntimeKey = (pluginId, commandId) => `${pluginId}:${commandId}`

const createPluginCommandRuntimeManager = ({
  appendLog = () => {},
  stopRuntimeProcess
} = {}) => {
  if (typeof stopRuntimeProcess !== 'function') throw new Error('stopRuntimeProcess is required')

  const runtimes = new Map()

  const getRuntime = (pluginId, commandId) => runtimes.get(createPluginCommandRuntimeKey(pluginId, commandId))

  const setRuntime = (runtime) => {
    if (!runtime?.pluginId) throw new Error('Plugin command runtime pluginId is required')
    if (!runtime?.commandId) throw new Error('Plugin command runtime commandId is required')
    runtimes.set(createPluginCommandRuntimeKey(runtime.pluginId, runtime.commandId), runtime)
    return runtime
  }

  const deleteRuntime = (pluginId, commandId) => runtimes.delete(createPluginCommandRuntimeKey(pluginId, commandId))

  const assertNotActive = (pluginId, commandId, message = 'Plugin command is already running') => {
    const existingRuntime = getRuntime(pluginId, commandId)
    if (ACTIVE_COMMAND_STATUSES.has(existingRuntime?.status)) throw new Error(message)
  }

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

  const stopPlugin = (pluginId) => {
    for (const [key, runtime] of runtimes.entries()) {
      if (key.startsWith(`${pluginId}:`)) {
        stopRuntime(pluginId, runtime.commandId, runtime)
      }
    }
  }

  const stopAll = () => {
    for (const runtime of runtimes.values()) {
      stopRuntime(runtime.pluginId, runtime.commandId, runtime)
    }
  }

  const size = () => runtimes.size

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
