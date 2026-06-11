/**
 * ibot Control Center 预加载脚本。
 *
 * 暴露配置管理 UI 需要的最小主进程接口。AI、插件和本地服务后续也从这里扩展，
 * 不让管理页面直接接触 Node.js / Electron API。
 */
const { contextBridge, ipcRenderer } = require('electron')

const IPC = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_PREVIEW_SCALE: 'settings:preview-scale',
  SETTINGS_CLOSE: 'settings:close',
  ACTIONS_GET: 'actions:get',
  ACTIONS_INSPECT_FRAMES: 'actions:inspect-frames',
  ACTIONS_REINSPECT_FRAMES: 'actions:reinspect-frames',
  ACTIONS_CLEAR_FRAME_SELECTION: 'actions:clear-frame-selection',
  ACTIONS_IMPORT_FRAMES: 'actions:import-frames',
  ACTIONS_SAVE_CONFIG: 'actions:save-config',
  ACTIONS_DELETE: 'actions:delete',
  AI_GET_CONFIG: 'ai:get-config',
  AI_SAVE_CONFIG: 'ai:save-config',
  AI_SAVE_API_KEY: 'ai:save-api-key',
  AI_TEST_CONNECTION: 'ai:test-connection',
  AI_CHAT: 'ai:chat',
  PLUGINS_LIST: 'plugins:list',
  PLUGINS_SET_ENABLED: 'plugins:set-enabled',
  PLUGINS_RUN_COMMAND: 'plugins:run-command',
  SERVICE_GET_STATUS: 'service:get-status',
  SERVICE_SAVE_CONFIG: 'service:save-config'
}

contextBridge.exposeInMainWorld('controlCenterAPI', {
  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  saveSettings: (settings) => ipcRenderer.invoke(IPC.SETTINGS_SAVE, settings),
  previewScale: (scale) => ipcRenderer.send(IPC.SETTINGS_PREVIEW_SCALE, scale),
  getActions: () => ipcRenderer.invoke(IPC.ACTIONS_GET),
  inspectActionFrames: (payload) => ipcRenderer.invoke(IPC.ACTIONS_INSPECT_FRAMES, payload),
  reinspectActionFrames: (payload) => ipcRenderer.invoke(IPC.ACTIONS_REINSPECT_FRAMES, payload),
  clearActionFrameSelection: (payload) => ipcRenderer.invoke(IPC.ACTIONS_CLEAR_FRAME_SELECTION, payload),
  importActionFrames: (payload) => ipcRenderer.invoke(IPC.ACTIONS_IMPORT_FRAMES, payload),
  saveActionsConfig: (payload) => ipcRenderer.invoke(IPC.ACTIONS_SAVE_CONFIG, payload),
  deleteAction: (actionId) => ipcRenderer.invoke(IPC.ACTIONS_DELETE, { actionId }),
  getAiConfig: () => ipcRenderer.invoke(IPC.AI_GET_CONFIG),
  saveAiConfig: (config) => ipcRenderer.invoke(IPC.AI_SAVE_CONFIG, config),
  saveAiApiKey: (apiKey) => ipcRenderer.invoke(IPC.AI_SAVE_API_KEY, apiKey),
  testAiConnection: () => ipcRenderer.invoke(IPC.AI_TEST_CONNECTION),
  chat: (payload) => ipcRenderer.invoke(IPC.AI_CHAT, payload),
  getPlugins: () => ipcRenderer.invoke(IPC.PLUGINS_LIST),
  setPluginEnabled: (pluginId, enabled) => ipcRenderer.invoke(IPC.PLUGINS_SET_ENABLED, { pluginId, enabled }),
  runPluginCommand: (pluginId, commandId, payload) => ipcRenderer.invoke(IPC.PLUGINS_RUN_COMMAND, { pluginId, commandId, payload }),
  getServiceStatus: () => ipcRenderer.invoke(IPC.SERVICE_GET_STATUS),
  saveServiceConfig: (config) => ipcRenderer.invoke(IPC.SERVICE_SAVE_CONFIG, config),
  close: () => ipcRenderer.send(IPC.SETTINGS_CLOSE)
})
