const { IPC } = require('../../shared/ipc-channels')

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
    let runtime
    if (sidecarConfigured) {
      await requestSidecar('/service/config', 'PUT', nextConfig)
      runtime = await requestSidecar('/service/status')
    } else {
      runtime = nextConfig.enabled ? await localHttpService.start(nextConfig) : await localHttpService.stop()
    }
    const savedSettings = petService.saveSettings({ ...currentSettings, localHttp: nextConfig })
    return createServiceStatusView(savedSettings.localHttp, sidecarConfigured ? runtime : (localHttpService.getStatus() || runtime))
  })
}

module.exports = { registerServiceIpc }
