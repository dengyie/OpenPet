const createPluginResolutionController = ({
  getPlugins,
  getEnabledMap,
  assertPluginAllowed
} = {}) => {
  if (typeof getPlugins !== 'function') throw new Error('getPlugins is required')
  if (typeof getEnabledMap !== 'function') throw new Error('getEnabledMap is required')
  if (typeof assertPluginAllowed !== 'function') throw new Error('assertPluginAllowed is required')

  const resolvePlugin = (pluginId, { requireEnabled = true, requireAllowed = true } = {}) => {
    const plugin = getPlugins().find((candidate) => candidate.manifest.id === pluginId)
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
    if (requireAllowed) assertPluginAllowed(plugin.manifest)
    if (requireEnabled && !getEnabledMap()[pluginId]) throw new Error('Plugin is disabled')
    return plugin
  }

  const getServiceEntry = (plugin, serviceId) => {
    const serviceEntry = (plugin.manifest.entries?.services || []).find((entry) => entry.id === serviceId)
    if (!serviceEntry) throw new Error(`Plugin service not found: ${serviceId}`)
    return serviceEntry
  }

  const getSetupEntry = (plugin, setupId) => {
    const setupEntry = (plugin.manifest.entries?.setup || []).find((entry) => entry.id === setupId)
    if (!setupEntry) throw new Error(`Plugin setup entry not found: ${setupId}`)
    return setupEntry
  }

  const getCommandEntry = (plugin, commandId) => {
    const commandEntry = (plugin.manifest.entries?.commands || []).find((entry) => entry.id === commandId)
    if (!commandEntry) throw new Error(`Plugin command entry not found: ${commandId}`)
    return commandEntry
  }

  const getDashboardEntry = (plugin, dashboardId) => {
    const dashboardEntry = (plugin.manifest.entries?.dashboards || []).find((entry) => entry.id === dashboardId)
    if (!dashboardEntry) throw new Error(`Plugin dashboard not found: ${dashboardId}`)
    return dashboardEntry
  }

  return {
    resolvePlugin,
    getServiceEntry,
    getSetupEntry,
    getCommandEntry,
    getDashboardEntry
  }
}

module.exports = {
  createPluginResolutionController
}
