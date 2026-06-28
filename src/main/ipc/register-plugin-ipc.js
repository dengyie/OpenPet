const { IPC } = require('../../shared/ipc-channels')

const registerPluginIpc = (context) => {
  const {
    ipcMainService,
    dialogService,
    pluginService,
    pluginInstallService,
    pluginGithubImportService,
    helpers
  } = context
  const { createPluginMutationResult } = helpers

  ipcMainService.handle(IPC.PLUGINS_LIST, () => pluginService.listPlugins())
  ipcMainService.handle(IPC.PLUGINS_SET_ENABLED, (_event, payload) => pluginService.setEnabled(payload.pluginId, payload.enabled))
  ipcMainService.handle(IPC.PLUGINS_SAVE_CONFIG, (_event, payload) => pluginService.saveConfig(payload.pluginId, payload.config))
  ipcMainService.handle(IPC.PLUGINS_RUN_COMMAND, (_event, payload) => pluginService.runCommand(payload.pluginId, payload.commandId, payload.payload))
  ipcMainService.handle(IPC.PLUGINS_RUN_SETUP, (_event, payload) => pluginService.runSetup(payload.pluginId, payload.setupId))
  ipcMainService.handle(IPC.PLUGINS_OPEN_DASHBOARD, (_event, payload) => pluginService.openDashboard(payload.pluginId, payload.dashboardId))
  ipcMainService.handle(IPC.PLUGINS_START_SERVICE, (_event, payload) => pluginService.startService(payload.pluginId, payload.serviceId))
  ipcMainService.handle(IPC.PLUGINS_STOP_SERVICE, (_event, payload) => pluginService.stopService(payload.pluginId, payload.serviceId))
  ipcMainService.handle(IPC.PLUGINS_CHECK_SERVICE_HEALTH, (_event, payload) => pluginService.checkServiceHealth(payload.pluginId, payload.serviceId))
  ipcMainService.handle(IPC.PLUGINS_SAVE_SERVICE_HEALTH_POLICY, (_event, payload) => pluginService.saveServiceHealthPolicy(payload.pluginId, payload.serviceId, payload.policy))
  ipcMainService.handle(IPC.PLUGINS_INSPECT_PACKAGE, async () => {
    const selected = await dialogService.showOpenDialog({
      title: '选择插件目录或 OpenPet 插件包',
      properties: ['openFile', 'openDirectory'],
      filters: [
        { name: 'OpenPet Plugin Package', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true }
    return { canceled: false, ...pluginInstallService.inspectPluginPackage(selected.filePaths[0]) }
  })
  ipcMainService.handle(IPC.PLUGINS_INSPECT_GITHUB_REPOSITORY, async (_event, payload) => {
    if (!pluginGithubImportService?.inspectRepositoryUrl) throw new Error('GitHub plugin import is not available')
    return { canceled: false, ...await pluginGithubImportService.inspectRepositoryUrl(payload?.repositoryUrl) }
  })
  ipcMainService.handle(IPC.PLUGINS_CLEAR_SELECTION, (_event, payload) => pluginInstallService.clearPendingSelection(payload?.selectionId))
  ipcMainService.handle(IPC.PLUGINS_INSTALL, (_event, payload) => createPluginMutationResult(pluginInstallService.installPlugin(payload.selectionId), pluginService.listPlugins()))
  ipcMainService.handle(IPC.PLUGINS_UPDATE, (_event, payload) => createPluginMutationResult(pluginInstallService.updatePlugin(payload.selectionId), pluginService.listPlugins()))
  ipcMainService.handle(IPC.PLUGINS_UNINSTALL, (_event, payload) => {
    const result = pluginInstallService.uninstallPlugin(payload.pluginId, { removeStorage: Boolean(payload.removeStorage) })
    return createPluginMutationResult(result, pluginService.listPlugins())
  })
  ipcMainService.handle(IPC.PLUGINS_GET_LOGS, (_event, filters) => pluginService.getLogs(filters))
  ipcMainService.handle(IPC.PLUGINS_EXPORT_LOGS, (_event, filters) => pluginService.exportLogs(filters))
  ipcMainService.handle(IPC.PLUGINS_CLEAR_LOGS, () => pluginService.clearLogs())
  ipcMainService.handle(IPC.PLUGINS_CLEAR_STORAGE, (_event, payload) => pluginService.clearStorage(payload.pluginId))
}

module.exports = {
  registerPluginIpc
}
