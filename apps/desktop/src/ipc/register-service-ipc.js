const { IPC } = require('../shared/ipc-channels')

const registerServiceIpc = ({
  ipcMainService,
  petService,
  localHttpService,
  normalizeLocalHttpConfig,
  createLocalHttpToken,
  createServiceStatusView,
  sidecarRuntimeCoordinator = null,
  fetchImpl = globalThis.fetch
}) => {
  const sidecarConfigured = sidecarRuntimeCoordinator !== null
  const getBackend = () => sidecarRuntimeCoordinator?.getBackend?.() || null

  const requestSidecar = async (path, method = 'GET', body) => {
    const backend = getBackend()
    if (!backend || typeof fetchImpl !== 'function') throw new Error('sidecar unavailable')
    const response = await fetchImpl(`${backend.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${backend.sessionToken}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { throw new Error(`sidecar returned invalid JSON (${response.status})`) }
    if (!response.ok || payload?.ok !== true) {
      throw new Error(payload?.error?.message || `sidecar request failed (${response.status})`)
    }
    return payload.data
  }

  const createSidecarStatusView = async () => {
    const config = petService.getSettings().localHttp
    const runtime = await requestSidecar('/service/status')
    return createServiceStatusView(config, runtime)
  }

  const getSidecarServiceConfig = (config) => ({
    enabled: Boolean(config.enabled),
    host: config.host,
    port: config.port,
    token: config.token
  })

  const backendTargetChanged = (current, next) => {
    const currentMode = current?.backendMode === 'remote' ? 'remote' : 'local'
    if (currentMode !== next.backendMode) return true
    return next.backendMode === 'remote' && (
      (current?.sshAlias || 'gz-cvm') !== next.sshAlias
      || (Number(current?.backendPort) || 48330) !== next.backendPort
    )
  }

  const getServiceStatusView = () => sidecarConfigured
    ? createSidecarStatusView()
    : createServiceStatusView(petService.getSettings().localHttp, localHttpService.getStatus())

  ipcMainService.handle(IPC.SERVICE_GET_STATUS, getServiceStatusView)
  ipcMainService.handle(IPC.SERVICE_GET_LOGS, (_event, filters) => sidecarConfigured
    ? requestSidecar(`/service/logs?${new URLSearchParams(filters || {})}`)
    : localHttpService.getLogPage(filters))
  ipcMainService.handle(IPC.SERVICE_EXPORT_LOGS, (_event, filters) => sidecarConfigured
    ? requestSidecar(`/service/logs?operation=export&${new URLSearchParams(filters || {})}`)
    : localHttpService.exportLogs(filters))
  ipcMainService.handle(IPC.SERVICE_CLEAR_LOGS, () => sidecarConfigured
    ? requestSidecar('/service/logs', 'DELETE')
    : localHttpService.clearLogs())

  ipcMainService.handle(IPC.SERVICE_ROTATE_TOKEN, async () => {
    const currentSettings = petService.getSettings()
    const nextConfig = normalizeLocalHttpConfig(currentSettings.localHttp, {
      ...currentSettings.localHttp,
      token: createLocalHttpToken()
    })
    let runtime
    if (sidecarConfigured) {
      await requestSidecar('/service/token/rotate', 'POST', { token: nextConfig.token })
      runtime = await requestSidecar('/service/status')
    } else {
      runtime = nextConfig.enabled ? await localHttpService.start(nextConfig) : localHttpService.getStatus()
    }
    const savedSettings = petService.saveSettings({ ...currentSettings, localHttp: nextConfig })
    return createServiceStatusView(savedSettings.localHttp, sidecarConfigured ? runtime : (localHttpService.getStatus() || runtime))
  })

  ipcMainService.handle(IPC.SERVICE_REVOKE_MCP_SESSIONS, async () => {
    if (sidecarConfigured) {
      await requestSidecar('/service/token/revoke-sessions', 'POST', {})
      return createSidecarStatusView()
    }
    const mcp = localHttpService.revokeMcpSessions()
    return createServiceStatusView(petService.getSettings().localHttp, { ...localHttpService.getStatus(), mcp })
  })

  ipcMainService.handle(IPC.SERVICE_SAVE_CONFIG, async (_event, config) => {
    const currentSettings = petService.getSettings()
    const nextConfig = normalizeLocalHttpConfig(currentSettings.localHttp, config)
    nextConfig.backendMode = nextConfig.backendMode === 'remote' ? 'remote' : 'local'
    nextConfig.sshAlias = typeof nextConfig.sshAlias === 'string' && nextConfig.sshAlias.trim()
      ? nextConfig.sshAlias.trim()
      : currentSettings.localHttp?.sshAlias || 'gz-cvm'
    if (nextConfig.backendMode === 'remote') validateAlias(nextConfig.sshAlias)
    const configuredBackendPort = nextConfig.backendPort === undefined || nextConfig.backendPort === null || nextConfig.backendPort === ''
      ? currentSettings.localHttp?.backendPort || 48330
      : Number(nextConfig.backendPort)
    const validBackendPort = Number.isInteger(configuredBackendPort) && configuredBackendPort >= 1 && configuredBackendPort <= 65535
    if (nextConfig.backendMode === 'remote' && !validBackendPort) {
      throw new TypeError('remote Backend host port must be between 1 and 65535')
    }
    nextConfig.backendPort = validBackendPort ? configuredBackendPort : 48330
    let runtime
    if (sidecarConfigured) {
      const coordinatorState = sidecarRuntimeCoordinator.getState?.()
      const reconnectingUnavailableBackend = coordinatorState && coordinatorState.status !== 'ready'
      if (backendTargetChanged(currentSettings.localHttp, nextConfig) || reconnectingUnavailableBackend) {
        const savedSettings = petService.saveSettings({ ...currentSettings, localHttp: nextConfig })
        await sidecarRuntimeCoordinator.stop()
        await sidecarRuntimeCoordinator.start()
        runtime = await requestSidecar('/service/status')
        return createServiceStatusView(savedSettings.localHttp, runtime)
      }
      await requestSidecar('/service/config', 'PUT', getSidecarServiceConfig(nextConfig))
      runtime = await requestSidecar('/service/status')
    } else {
      runtime = nextConfig.enabled ? await localHttpService.start(nextConfig) : await localHttpService.stop()
    }
    const savedSettings = petService.saveSettings({ ...currentSettings, localHttp: nextConfig })
    return createServiceStatusView(savedSettings.localHttp, sidecarConfigured ? runtime : (localHttpService.getStatus() || runtime))
  })
}

module.exports = { registerServiceIpc }
