const PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS = 1500
const { createPluginRuntimeStopSupport } = require('./plugin-runtime-stop-support')

const resolveStopGracePeriodMs = (runtime, fallbackMs = PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS) => {
  const value = Number(runtime?.stopGracePeriodMs)
  return Number.isFinite(value) ? Math.max(0, value) : fallbackMs
}

const createPluginServiceStopController = ({
  appendLog = () => {},
  killServiceProcess = process.kill,
  signalServiceProcessTree = () => false,
  setStopTimer = setTimeout,
  clearStopTimer = clearTimeout,
  clearHealthSchedule = () => {},
  fallbackGracePeriodMs = PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS
} = {}) => {
  const runtimeStopSupport = createPluginRuntimeStopSupport({
    killProcess: killServiceProcess,
    signalProcessTree: signalServiceProcessTree
  })
  const stopServiceProcess = runtimeStopSupport.stopDetachedProcess
  const forceStopServiceProcess = runtimeStopSupport.forceStopDetachedProcess

  const clearStopTimerForRuntime = (runtime) => {
    if (!runtime?.stopTimer) return
    clearStopTimer(runtime.stopTimer)
    runtime.stopTimer = null
  }

  const ensureStopWaiter = (runtime) => {
    if (!runtime) return null
    if (!runtime.stopCompleted) {
      runtime.stopCompleted = new Promise((resolve) => {
        runtime.resolveStopCompleted = resolve
      })
    }
    return runtime.stopCompleted
  }

  const stopRuntime = (pluginId, serviceId, runtime, { log = true } = {}) => {
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
      runtime.resolveStopCompleted?.()
      runtime.resolveStopCompleted = null
    }
    clearStopTimerForRuntime(runtime)
    clearHealthSchedule(runtime)
    if (runtime.status === 'stopping') {
      const gracePeriodMs = resolveStopGracePeriodMs(runtime, fallbackGracePeriodMs)
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
          runtime.resolveStopCompleted?.()
          runtime.resolveStopCompleted = null
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
        runtime.stopTimer = setStopTimer(requestForceStop, gracePeriodMs)
        runtime.stopTimer?.unref?.()
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

  return {
    clearStopTimer: clearStopTimerForRuntime,
    clearHealthSchedule,
    ensureStopWaiter,
    forceStopServiceProcess,
    stopRuntime,
    stopServiceProcess
  }
}

module.exports = {
  createPluginServiceStopController,
  resolveStopGracePeriodMs
}
