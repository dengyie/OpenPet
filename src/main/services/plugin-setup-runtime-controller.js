const createPluginSetupRuntimeController = ({
  runtimeManager,
  processController
} = {}) => {
  if (!runtimeManager) throw new Error('runtimeManager is required')
  if (!processController?.run) throw new Error('processController.run is required')

  const run = ({ pluginId, manifest, setupId, setupEntry }) => {
    runtimeManager.assertNotActive(pluginId, setupId)
    return processController.run({
      pluginId,
      manifest,
      setupId,
      setupEntry
    })
  }

  const stopPlugin = (pluginId, options = {}) => runtimeManager.stopPlugin(pluginId, options)

  return {
    run,
    stopPlugin
  }
}

module.exports = {
  createPluginSetupRuntimeController
}
