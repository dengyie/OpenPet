const createPluginServiceRuntimeController = ({
  resolvePlugin,
  getServiceEntry,
  getRuntime,
  assertNotActive,
  spawnRuntime,
  createRuntime,
  setRuntime,
  attachChildHandlers,
  appendLog = () => {},
  scheduleHealthCheck = () => {},
  createRuntimeView = (runtime) => runtime,
  createHealthView = (health) => health,
  getOrCreateRuntime,
  checkHealth,
  stopRuntime
} = {}) => {
  if (typeof resolvePlugin !== 'function') throw new Error('resolvePlugin is required')
  if (typeof getServiceEntry !== 'function') throw new Error('getServiceEntry is required')
  if (typeof getRuntime !== 'function') throw new Error('getRuntime is required')
  if (typeof assertNotActive !== 'function') throw new Error('assertNotActive is required')
  if (typeof spawnRuntime !== 'function') throw new Error('spawnRuntime is required')
  if (typeof createRuntime !== 'function') throw new Error('createRuntime is required')
  if (typeof setRuntime !== 'function') throw new Error('setRuntime is required')
  if (typeof attachChildHandlers !== 'function') throw new Error('attachChildHandlers is required')
  if (typeof getOrCreateRuntime !== 'function') throw new Error('getOrCreateRuntime is required')
  if (typeof checkHealth !== 'function') throw new Error('checkHealth is required')
  if (typeof stopRuntime !== 'function') throw new Error('stopRuntime is required')

  const start = ({ pluginId, serviceId, stopGracePeriodMs }) => {
    const commandId = `service:${serviceId || ''}`
    try {
      const plugin = resolvePlugin(pluginId)
      const serviceEntry = getServiceEntry(plugin, serviceId)
      const existingRuntime = getRuntime(pluginId, serviceId)
      assertNotActive(pluginId, serviceId)
      const { child, cwd, declaration } = spawnRuntime({
        pluginManifest: plugin.manifest,
        serviceEntry
      })
      const runtime = setRuntime(createRuntime({
        pluginId,
        serviceId,
        child,
        command: declaration.command,
        cwd,
        existingHealth: existingRuntime?.health,
        serviceEntry,
        stopGracePeriodMs
      }))

      attachChildHandlers({
        pluginId,
        serviceId,
        runtime,
        child
      })

      appendLog({ pluginId, commandId, level: 'info', message: 'Service started' })
      scheduleHealthCheck(pluginId, serviceId, runtime, serviceEntry)
      return {
        ok: true,
        pluginId,
        serviceId,
        runtime: createRuntimeView(runtime, serviceEntry)
      }
    } catch (error) {
      appendLog({ pluginId, commandId, level: 'error', message: error.message || 'Service start failed' })
      throw error
    }
  }

  const stop = ({ pluginId, serviceId }) => {
    const plugin = resolvePlugin(pluginId, { requireEnabled: false, requireAllowed: false })
    const serviceEntry = getServiceEntry(plugin, serviceId)
    const runtime = getRuntime(pluginId, serviceId)
    if (!runtime || runtime.status !== 'running') throw new Error('Plugin service is not running')
    stopRuntime(pluginId, serviceId, runtime)
    return {
      ok: true,
      pluginId,
      serviceId,
      runtime: createRuntimeView(runtime, serviceEntry)
    }
  }

  const check = async ({ pluginId, serviceId, reschedule = true }) => {
    const commandId = `service:${serviceId || ''}`
    try {
      const plugin = resolvePlugin(pluginId)
      const serviceEntry = getServiceEntry(plugin, serviceId)
      const runtime = getOrCreateRuntime(pluginId, serviceId, serviceEntry)
      await checkHealth(pluginId, serviceId, runtime, serviceEntry, { reschedule })

      return {
        ok: true,
        pluginId,
        serviceId,
        health: createHealthView(runtime.health, serviceEntry),
        runtime: createRuntimeView(runtime, serviceEntry)
      }
    } catch (error) {
      appendLog({ pluginId, commandId, level: 'error', message: error.message || 'Service health check failed' })
      throw error
    }
  }

  return {
    check,
    start,
    stop
  }
}

module.exports = {
  createPluginServiceRuntimeController
}
