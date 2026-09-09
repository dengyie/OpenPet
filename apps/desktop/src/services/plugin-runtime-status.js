const ACTIVE_PLUGIN_RUNTIME_STATUSES = new Set(['running', 'stopping'])

const isActivePluginRuntimeStatus = (status) => ACTIVE_PLUGIN_RUNTIME_STATUSES.has(status)

module.exports = {
  ACTIVE_PLUGIN_RUNTIME_STATUSES,
  isActivePluginRuntimeStatus
}
