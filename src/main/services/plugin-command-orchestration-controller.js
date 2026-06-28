const createPluginCommandOrchestrationController = ({
  resolvePlugin,
  runCommand,
  appendLog = () => {},
  getLogs = () => []
} = {}) => {
  if (typeof resolvePlugin !== 'function') throw new Error('resolvePlugin is required')
  if (typeof runCommand !== 'function') throw new Error('runCommand is required')
  if (typeof getLogs !== 'function') throw new Error('getLogs is required')

  const run = async (pluginId, commandId, payload = {}) => {
    try {
      const plugin = resolvePlugin(pluginId)
      return await runCommand({
        plugin,
        pluginId,
        commandId,
        payload
      })
    } catch (error) {
      if (error?.openpetLogged) throw error
      const hasErrorLog = getLogs({
        level: 'error',
        pluginId,
        commandId
      }).some((entry) => entry.message === (error.message || 'Command failed'))
      if (!hasErrorLog) {
        appendLog({
          pluginId,
          commandId,
          level: 'error',
          message: error.message || 'Command failed'
        })
      }
      throw error
    }
  }

  return {
    run
  }
}

module.exports = {
  createPluginCommandOrchestrationController
}
