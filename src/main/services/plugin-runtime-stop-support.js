const createPluginRuntimeStopSupport = ({
  killProcess = process.kill,
  signalProcessTree = () => false
} = {}) => {
  const stopDetachedProcess = (runtime, signal = 'SIGTERM') => {
    const pid = Number(runtime?.pid) || 0
    if (pid > 0) {
      try {
        killProcess(-pid, signal)
        return
      } catch (_) {
        try {
          if (signalProcessTree(pid, signal)) return
        } catch (_) {}
      }
    }
    runtime.child?.kill?.(signal)
  }

  const stopRuntimeProcessWithFallback = (runtime, signal = 'SIGTERM') => {
    const pid = Number(runtime?.pid) || 0
    if (pid > 0) {
      try {
        if (signalProcessTree(pid, signal)) return
      } catch (_) {}
    }
    runtime.child?.kill?.(signal)
  }

  return {
    forceStopDetachedProcess: stopDetachedProcess,
    stopDetachedProcess,
    stopRuntimeProcessWithFallback
  }
}

module.exports = {
  createPluginRuntimeStopSupport
}
