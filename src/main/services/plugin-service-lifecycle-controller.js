const PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS = 1500

const createPluginServiceLifecycleController = ({
  appendLog = () => {},
  clearStopTimer = () => {},
  clearHealthSchedule = () => {},
  createHealthView = (health) => health || {},
  fallbackStopGracePeriodMs = PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS
} = {}) => {
  const createRuntime = ({
    pluginId,
    serviceId,
    child,
    command,
    cwd,
    existingHealth,
    serviceEntry,
    stopGracePeriodMs
  }) => ({
    pluginId,
    serviceId,
    status: 'running',
    pid: Number(child?.pid) || 0,
    startedAt: new Date().toISOString(),
    stoppedAt: '',
    command: command || '',
    cwd: cwd || '',
    exitCode: null,
    signal: '',
    error: '',
    child,
    stopTimer: null,
    stopCompleted: null,
    resolveStopCompleted: null,
    healthTimer: null,
    healthChecking: false,
    stopGracePeriodMs: Number.isFinite(Number(stopGracePeriodMs))
      ? Math.max(0, Number(stopGracePeriodMs))
      : fallbackStopGracePeriodMs,
    health: existingHealth || createHealthView({}, serviceEntry)
  })

  const attachChildHandlers = ({ pluginId, serviceId, runtime, child }) => {
    const commandId = `service:${serviceId || ''}`

    child.stdout?.on?.('data', (chunk) => {
      const message = String(chunk || '').trim()
      if (message) appendLog({ pluginId, commandId, level: 'info', message: `Service stdout: ${message}`.slice(0, 500) })
    })

    child.stderr?.on?.('data', (chunk) => {
      const message = String(chunk || '').trim()
      if (message) appendLog({ pluginId, commandId, level: 'error', message: `Service stderr: ${message}`.slice(0, 500) })
    })

    child.on?.('error', (error) => {
      clearStopTimer(runtime)
      clearHealthSchedule(runtime)
      runtime.status = 'failed'
      runtime.error = error?.message || 'Plugin service failed'
      runtime.stoppedAt = new Date().toISOString()
      runtime.resolveStopCompleted?.()
      runtime.resolveStopCompleted = null
      appendLog({ pluginId, commandId, level: 'error', message: runtime.error })
    })

    child.on?.('exit', (code, signal) => {
      clearStopTimer(runtime)
      clearHealthSchedule(runtime)
      const stoppedByRequest = runtime.status === 'stopping'
      let forcedStop = false

      if (runtime.status === 'stopping') {
        forcedStop = /force kill/i.test(String(runtime.error || ''))
        runtime.status = forcedStop
          ? 'failed'
          : (Number.isFinite(Number(code)) && Number(code) !== 0 && !signal ? 'failed' : 'stopped')
      } else if (runtime.status === 'running') {
        runtime.status = code === 0 && !signal ? 'exited' : 'failed'
      }

      runtime.exitCode = Number.isFinite(Number(code)) ? Number(code) : null
      runtime.signal = signal || ''
      runtime.child = null
      runtime.stoppedAt = runtime.stoppedAt || new Date().toISOString()
      runtime.resolveStopCompleted?.()
      runtime.resolveStopCompleted = null

      if (stoppedByRequest) {
        appendLog({
          pluginId,
          commandId,
          level: runtime.status === 'failed' ? 'error' : 'info',
          message: runtime.status === 'stopped'
            ? 'Service stopped'
            : (forcedStop ? 'Service exited after force stop' : 'Service exited')
        })
        return
      }

      appendLog({
        pluginId,
        commandId,
        level: runtime.status === 'failed' ? 'error' : 'info',
        message: 'Service exited'
      })
    })

    return runtime
  }

  return {
    attachChildHandlers,
    createRuntime
  }
}

module.exports = {
  createPluginServiceLifecycleController
}
