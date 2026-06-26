const createPluginDashboardOpenController = ({
  appendLog = () => {},
  openExternal,
  getDashboardEntry
} = {}) => {
  if (typeof openExternal !== 'function') throw new Error('openExternal is required')
  if (typeof getDashboardEntry !== 'function') throw new Error('getDashboardEntry is required')

  const open = async ({ plugin, pluginId, dashboardId }) => {
    const commandId = `dashboard:${dashboardId || ''}`
    try {
      const dashboard = getDashboardEntry(plugin, dashboardId)
      let dashboardUrl
      try {
        dashboardUrl = new URL(dashboard.url)
      } catch (_) {
        throw new Error('Plugin dashboard URL is invalid')
      }
      if (!['http:', 'https:'].includes(dashboardUrl.protocol)) {
        throw new Error('Plugin dashboard URL must use HTTP or HTTPS')
      }
      await openExternal(dashboardUrl.toString())
      appendLog({ pluginId, commandId, level: 'info', message: 'Dashboard opened' })
      return {
        ok: true,
        pluginId,
        dashboardId,
        url: dashboardUrl.toString()
      }
    } catch (error) {
      appendLog({
        pluginId,
        commandId,
        level: 'error',
        message: error.message || 'Dashboard open failed'
      })
      error.openpetLogged = true
      throw error
    }
  }

  return {
    open
  }
}

module.exports = {
  createPluginDashboardOpenController
}
