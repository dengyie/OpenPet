const createPluginShutdownController = ({
  stopServices,
  stopSetups,
  stopCommands,
  closeCommandBridge
} = {}) => {
  if (typeof stopServices !== 'function') throw new Error('stopServices is required')
  if (typeof stopSetups !== 'function') throw new Error('stopSetups is required')
  if (typeof stopCommands !== 'function') throw new Error('stopCommands is required')
  if (typeof closeCommandBridge !== 'function') throw new Error('closeCommandBridge is required')

  const stopAll = () => {
    stopServices({ log: false })
    stopSetups({ log: false })
    stopCommands()
    closeCommandBridge()
    return { ok: true }
  }

  return {
    stopAll
  }
}

module.exports = {
  createPluginShutdownController
}
