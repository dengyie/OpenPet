const createPluginShutdownController = ({
  stopServices,
  listServiceRuntimes,
  stopSetups,
  listSetupRuntimes,
  stopCommands,
  listCommandRuntimes,
  ensureSetupStopWaiter = () => null,
  ensureCommandStopWaiter = () => null,
  closeCommandBridge,
  shutdownWaitTimeoutMs = 2000,
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) => {
  if (typeof stopServices !== 'function') throw new Error('stopServices is required')
  if (typeof listServiceRuntimes !== 'function') throw new Error('listServiceRuntimes is required')
  if (typeof stopSetups !== 'function') throw new Error('stopSetups is required')
  if (typeof listSetupRuntimes !== 'function') throw new Error('listSetupRuntimes is required')
  if (typeof stopCommands !== 'function') throw new Error('stopCommands is required')
  if (typeof listCommandRuntimes !== 'function') throw new Error('listCommandRuntimes is required')
  if (typeof closeCommandBridge !== 'function') throw new Error('closeCommandBridge is required')

  const stopAll = async () => {
    const setupWaiters = listSetupRuntimes()
      .filter((runtime) => runtime?.status === 'running')
      .map((runtime) => ensureSetupStopWaiter(runtime))
      .filter(Boolean)
    const commandWaiters = listCommandRuntimes()
      .filter((runtime) => runtime?.status === 'running')
      .map((runtime) => ensureCommandStopWaiter(runtime))
      .filter(Boolean)

    stopServices({ log: false })
    stopSetups({ log: false })
    stopCommands()
    closeCommandBridge()

    const serviceWaiters = listServiceRuntimes()
      .filter((runtime) => runtime?.status === 'stopping' && runtime.stopCompleted instanceof Promise)
      .map((runtime) => runtime.stopCompleted)

    const waitForShutdown = Promise.allSettled([
      ...serviceWaiters,
      ...setupWaiters,
      ...commandWaiters
    ])
    const timeoutMs = Number.isFinite(Number(shutdownWaitTimeoutMs))
      ? Math.max(0, Number(shutdownWaitTimeoutMs))
      : 0

    if (timeoutMs === 0) {
      await waitForShutdown
      return { ok: true }
    }

    await Promise.race([
      waitForShutdown,
      new Promise((resolve) => {
        const timer = setTimer(resolve, timeoutMs)
        timer?.unref?.()
        waitForShutdown.finally(() => clearTimer(timer))
      })
    ])

    return { ok: true }
  }

  return {
    stopAll
  }
}

module.exports = {
  createPluginShutdownController
}
