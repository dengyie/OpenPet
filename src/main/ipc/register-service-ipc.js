const { IPC } = require('../../shared/ipc-channels')

const registerServiceIpc = ({
  ipcMainService,
  petService,
  localHttpService,
  normalizeLocalHttpConfig,
  createLocalHttpToken,
  createServiceStatusView
}) => {
  const getServiceStatusView = () => createServiceStatusView(
    petService.getSettings().localHttp,
    localHttpService.getStatus()
  )

  ipcMainService.handle(IPC.SERVICE_GET_STATUS, getServiceStatusView)
  ipcMainService.handle(IPC.SERVICE_GET_LOGS, (_event, filters) => localHttpService.getLogs(filters))
  ipcMainService.handle(IPC.SERVICE_EXPORT_LOGS, (_event, filters) => localHttpService.exportLogs(filters))
  ipcMainService.handle(IPC.SERVICE_CLEAR_LOGS, () => localHttpService.clearLogs())

  ipcMainService.handle(IPC.SERVICE_ROTATE_TOKEN, async () => {
    const currentSettings = petService.getSettings()
    const nextConfig = normalizeLocalHttpConfig(currentSettings.localHttp, {
      ...currentSettings.localHttp,
      token: createLocalHttpToken()
    })
    const runtime = nextConfig.enabled
      ? await localHttpService.start(nextConfig)
      : localHttpService.getStatus()
    const savedSettings = petService.saveSettings({ ...currentSettings, localHttp: nextConfig })
    return createServiceStatusView(savedSettings.localHttp, localHttpService.getStatus() || runtime)
  })

  ipcMainService.handle(IPC.SERVICE_REVOKE_MCP_SESSIONS, () => {
    const mcp = localHttpService.revokeMcpSessions()
    return createServiceStatusView(petService.getSettings().localHttp, { ...localHttpService.getStatus(), mcp })
  })

  ipcMainService.handle(IPC.SERVICE_SAVE_CONFIG, async (_event, config) => {
    const currentSettings = petService.getSettings()
    const nextConfig = normalizeLocalHttpConfig(currentSettings.localHttp, config)
    const runtime = nextConfig.enabled
      ? await localHttpService.start(nextConfig)
      : await localHttpService.stop()
    const savedSettings = petService.saveSettings({ ...currentSettings, localHttp: nextConfig })
    return createServiceStatusView(savedSettings.localHttp, localHttpService.getStatus() || runtime)
  })
}

module.exports = { registerServiceIpc }
