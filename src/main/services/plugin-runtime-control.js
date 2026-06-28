const PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS = 1500

const createPluginRuntimeControl = ({
  appendLog = () => {},
  stopServiceProcess = () => {},
  forceStopServiceProcess = () => {},
  stopRuntimeProcessWithFallback = () => {},
  clearServiceHealthSchedule = () => {},
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  serviceStopGracePeriodMs = PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS
} = {}) => {
  const ensureStopWaiter = (runtime) => {
    if (!runtime) return null
    if (!runtime.stopCompleted) {
      runtime.stopCompleted = new Promise((resolve) => {
        runtime.resolveStopCompleted = resolve
      })
    }
    return runtime.stopCompleted
  }

  const resolveStopWaiter = (runtime) => {
    runtime?.resolveStopCompleted?.()
    if (runtime) runtime.resolveStopCompleted = null
  }

  const clearServiceStopTimer = (runtime) => {
    if (!runtime?.stopTimer) return
    clearTimeoutImpl(runtime.stopTimer)
    runtime.stopTimer = null
  }

  const stopPluginServiceRuntime = (pluginId, serviceId, runtime, { log = true } = {}) => {
    if (!runtime || runtime.status !== 'running') return runtime
    ensureStopWaiter(runtime)
    runtime.status = 'stopping'
    runtime.stoppedAt = new Date().toISOString()
    runtime.error = ''
    let stopped = false
    try {
      stopServiceProcess(runtime, 'SIGTERM')
      stopped = true
    } catch (error) {
      runtime.error = error.message || 'Plugin service stop failed'
      runtime.status = 'failed'
      resolveStopWaiter(runtime)
    }
    clearServiceStopTimer(runtime)
    clearServiceHealthSchedule(runtime)
    if (runtime.status === 'stopping') {
      const gracePeriodMs = Number.isFinite(Number(runtime.stopGracePeriodMs))
        ? Math.max(0, Number(runtime.stopGracePeriodMs))
        : serviceStopGracePeriodMs
      const requestForceStop = () => {
        if (runtime.status !== 'stopping') return
        try {
          forceStopServiceProcess(runtime, 'SIGKILL')
          runtime.error = 'Service did not stop before force kill'
          appendLog({
            pluginId,
            commandId: `service:${serviceId}`,
            level: 'error',
            message: 'Service stop grace period expired; force stop requested'
          })
        } catch (error) {
          runtime.error = error.message || 'Plugin service force stop failed'
          runtime.status = 'failed'
          resolveStopWaiter(runtime)
          appendLog({
            pluginId,
            commandId: `service:${serviceId}`,
            level: 'error',
            message: runtime.error
          })
        }
      }
      if (gracePeriodMs === 0) requestForceStop()
      else {
        runtime.stopTimer = setTimeoutImpl(requestForceStop, gracePeriodMs)
        runtime.stopTimer.unref?.()
      }
    }
    if (log) {
      appendLog({
        pluginId,
        commandId: `service:${serviceId}`,
        level: stopped ? 'info' : 'error',
        message: stopped ? 'Service stop requested' : 'Service stop failed'
      })
    }
    return runtime
  }

  const stopPluginSetupRuntime = (pluginId, setupId, runtime, { log = true } = {}) => {
    if (!runtime || runtime.status !== 'running') return runtime
    ensureStopWaiter(runtime)
    runtime.status = 'stopping'
    runtime.error = ''
    runtime.exitCode = null
    runtime.lastRunAt = new Date().toISOString()
    try {
      stopRuntimeProcessWithFallback(runtime, 'SIGTERM')
    } catch (error) {
      runtime.error = error.message || 'Plugin setup stop failed'
      runtime.status = 'failed'
      resolveStopWaiter(runtime)
    }
    if (log) {
      appendLog({
        pluginId,
        commandId: `setup:${setupId}`,
        level: runtime.status === 'failed' ? 'error' : 'info',
        message: runtime.status === 'failed' ? runtime.error : 'Setup stop requested'
      })
    }
    if (runtime.status === 'failed') runtime.failStop?.(new Error(runtime.error))
    return runtime
  }

  const stopPluginCommandRuntime = (pluginId, commandId, runtime, _options = {}) => {
    if (!runtime || runtime.status !== 'running') return runtime
    try {
      ensureStopWaiter(runtime)
      runtime.stop?.({ reason: 'Command stopped' })
      appendLog({ pluginId, commandId, level: 'info', message: 'Command stop requested' })
    } catch (error) {
      runtime.status = 'failed'
      runtime.error = error.message || 'Plugin command stop failed'
      resolveStopWaiter(runtime)
      error.openpetLogged = true
      appendLog({ pluginId, commandId, level: 'error', message: runtime.error })
      runtime.failStop?.(error)
    }
    return runtime
  }

  return {
    ensureStopWaiter,
    resolveStopWaiter,
    clearServiceStopTimer,
    stopPluginServiceRuntime,
    stopPluginSetupRuntime,
    stopPluginCommandRuntime
  }
}

module.exports = {
  createPluginRuntimeControl,
  PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS
}
