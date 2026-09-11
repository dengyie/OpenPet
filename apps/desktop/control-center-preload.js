/**
 * OpenPet Control Center 预加载脚本。
 *
 * 暴露配置管理 UI 需要的最小主进程接口。AI、插件和本地服务后续也从这里扩展，
 * 不让管理页面直接接触 Node.js / Electron API。
 */
const { contextBridge, ipcRenderer } = require('electron')

const IPC = {
  SETTINGS_CHANGED: 'settings:changed',
  SETTINGS_IMPORT_CURSOR: 'settings:import-cursor',
  SETTINGS_PREVIEW_SCALE: 'settings:preview-scale',
  SETTINGS_CLOSE: 'settings:close',
  PET_PACKS_INSPECT_DIRECTORY: 'pet-packs:inspect-directory',
  ACTIONS_INSPECT_FRAMES: 'actions:inspect-frames',
  HATCH_PET_AGENT_CHECK_CAPABILITY: 'hatch-pet-agent:check-capability',
  HATCH_PET_AGENT_GET_RUN_STATUS: 'hatch-pet-agent:get-run-status',
  IMAGE_GENERATION_GET_CONFIG: 'image-generation:get-config',
  IMAGE_GENERATION_SAVE_CONFIG: 'image-generation:save-config',
  IMAGE_GENERATION_SAVE_API_KEY: 'image-generation:save-api-key',
  IMAGE_GENERATION_CLEAR_API_KEY: 'image-generation:clear-api-key',
  IMAGE_GENERATION_CHECK_HEALTH: 'image-generation:check-health',
  IMAGE_GENERATION_DISCOVER_MODELS: 'image-generation:discover-models',
  PET_PLAY_ACTION: 'pet:play-action',
  PET_BUBBLE_CHAT_OPEN: 'pet-bubble-chat:open',
  PET_CHAT_OPEN: 'pet-chat:open',
  PET_CHAT_GET_STATE: 'pet-chat:get-state',
  PET_CHAT_SEND_MESSAGE: 'pet-chat:send-message',
  PLUGINS_SAVE_IM_GATEWAY_QQ_CREDENTIALS: 'plugins:im-gateway:save-qq-credentials',
  PLUGINS_CLEAR_IM_GATEWAY_QQ_CREDENTIALS: 'plugins:im-gateway:clear-qq-credentials',
  PLUGINS_SAVE_IM_GATEWAY_WECOM_CREDENTIALS: 'plugins:im-gateway:save-wecom-credentials',
  PLUGINS_CLEAR_IM_GATEWAY_WECOM_CREDENTIALS: 'plugins:im-gateway:clear-wecom-credentials',
  PLUGINS_OPEN_DASHBOARD: 'plugins:open-dashboard',
  PLUGINS_INSPECT_PACKAGE: 'plugins:inspect-package',
  CREATOR_PICK_REFERENCE_IMAGE: 'creator:pick-reference-image',
  SERVICE_GET_STATUS: 'service:get-status',
  SERVICE_SAVE_CONFIG: 'service:save-config',
  SERVICE_GET_LOGS: 'service:get-logs',
  SERVICE_EXPORT_LOGS: 'service:export-logs',
  SERVICE_CLEAR_LOGS: 'service:clear-logs',
  SERVICE_ROTATE_TOKEN: 'service:rotate-token',
  SERVICE_REVOKE_MCP_SESSIONS: 'service:revoke-mcp-sessions',
}

contextBridge.exposeInMainWorld('controlCenterAPI', {
  importCursor: () => ipcRenderer.invoke(IPC.SETTINGS_IMPORT_CURSOR),
  previewScale: (scale) => ipcRenderer.send(IPC.SETTINGS_PREVIEW_SCALE, scale),
  inspectPetPackDirectory: () => ipcRenderer.invoke(IPC.PET_PACKS_INSPECT_DIRECTORY),
  inspectActionFrames: (payload) => ipcRenderer.invoke(IPC.ACTIONS_INSPECT_FRAMES, payload),
  checkHatchPetAgentCapability: () => ipcRenderer.invoke(IPC.HATCH_PET_AGENT_CHECK_CAPABILITY),
  getHatchPetAgentRunStatus: (runId) => ipcRenderer.invoke(IPC.HATCH_PET_AGENT_GET_RUN_STATUS, { runId }),
  getImageGenerationConfig: () => ipcRenderer.invoke(IPC.IMAGE_GENERATION_GET_CONFIG),
  saveImageGenerationConfig: (config) => ipcRenderer.invoke(IPC.IMAGE_GENERATION_SAVE_CONFIG, config),
  saveImageGenerationApiKey: (apiKey) => ipcRenderer.invoke(IPC.IMAGE_GENERATION_SAVE_API_KEY, apiKey),
  clearImageGenerationApiKey: () => ipcRenderer.invoke(IPC.IMAGE_GENERATION_CLEAR_API_KEY),
  checkImageGenerationHealth: (payload) => ipcRenderer.invoke(IPC.IMAGE_GENERATION_CHECK_HEALTH, payload),
  discoverImageGenerationModels: () => ipcRenderer.invoke(IPC.IMAGE_GENERATION_DISCOVER_MODELS),
  getPetChatState: () => ipcRenderer.invoke(IPC.PET_CHAT_GET_STATE),
  openPetBubbleChat: () => ipcRenderer.invoke(IPC.PET_BUBBLE_CHAT_OPEN),
  openPetChatWindow: () => ipcRenderer.invoke(IPC.PET_CHAT_OPEN),
  sendPetChatMessage: (payload) => ipcRenderer.invoke(IPC.PET_CHAT_SEND_MESSAGE, { ...(payload || {}), source: 'control-center' }),
  saveImGatewayQqOfficialCredentials: (credentials) => ipcRenderer.invoke(IPC.PLUGINS_SAVE_IM_GATEWAY_QQ_CREDENTIALS, credentials),
  clearImGatewayQqOfficialCredentials: () => ipcRenderer.invoke(IPC.PLUGINS_CLEAR_IM_GATEWAY_QQ_CREDENTIALS),
  saveImGatewayWecomCredentials: (credentials) => ipcRenderer.invoke(IPC.PLUGINS_SAVE_IM_GATEWAY_WECOM_CREDENTIALS, credentials),
  clearImGatewayWecomCredentials: () => ipcRenderer.invoke(IPC.PLUGINS_CLEAR_IM_GATEWAY_WECOM_CREDENTIALS),
  pickCreatorReferenceImage: () => ipcRenderer.invoke(IPC.CREATOR_PICK_REFERENCE_IMAGE),
  playPetAction: (actionId) => ipcRenderer.invoke(IPC.PET_PLAY_ACTION, { actionId }),
  openPluginDashboard: (pluginId, dashboardId, options) => ipcRenderer.invoke(IPC.PLUGINS_OPEN_DASHBOARD, { pluginId, dashboardId, ...(options ? { options } : {}) }),
  inspectPluginPackage: () => ipcRenderer.invoke(IPC.PLUGINS_INSPECT_PACKAGE),
  getServiceStatus: () => ipcRenderer.invoke(IPC.SERVICE_GET_STATUS),
  saveServiceConfig: (config) => ipcRenderer.invoke(IPC.SERVICE_SAVE_CONFIG, config),
  getServiceLogs: (filters) => ipcRenderer.invoke(IPC.SERVICE_GET_LOGS, filters),
  exportServiceLogs: (filters) => ipcRenderer.invoke(IPC.SERVICE_EXPORT_LOGS, filters),
  clearServiceLogs: () => ipcRenderer.invoke(IPC.SERVICE_CLEAR_LOGS),
  rotateServiceToken: () => ipcRenderer.invoke(IPC.SERVICE_ROTATE_TOKEN),
  revokeMcpSessions: () => ipcRenderer.invoke(IPC.SERVICE_REVOKE_MCP_SESSIONS),
  close: () => ipcRenderer.send(IPC.SETTINGS_CLOSE)
})

let currentBackend = null
let currentRuntimeStatus = { supported: false, platform: 'unknown', active: false, helperPid: 0 }
let currentSecretStorageSecurity = null
const backendListeners = new Set(), runtimeListeners = new Set(), secretStorageSecurityListeners = new Set()
const notifyRuntimeStatus = (status) => {
  if (!status || typeof status !== 'object') return
  currentRuntimeStatus = {
    supported: Boolean(status.supported),
    platform: typeof status.platform === 'string' ? status.platform : 'unknown',
    active: Boolean(status.active),
    helperPid: Number.isFinite(Number(status.helperPid)) ? Number(status.helperPid) : 0
  }
  runtimeListeners.forEach((listener) => listener(currentRuntimeStatus))
}
const notifyBackend = (backend, runtimeStatus) => {
  currentBackend = backend || null
  notifyRuntimeStatus(runtimeStatus)
  backendListeners.forEach((listener) => listener(currentBackend))
}
const notifySecretStorageSecurity = (state) => {
  if (!state || typeof state !== 'object') {
    currentSecretStorageSecurity = null
  } else {
    currentSecretStorageSecurity = {
      encryptionAvailable: Boolean(state.encryptionAvailable),
      storage: typeof state.storage === 'string' ? state.storage : '',
      warning: typeof state.warning === 'string' ? state.warning : ''
    }
  }
  secretStorageSecurityListeners.forEach((listener) => listener(currentSecretStorageSecurity))
}
const addListener = (listeners, listener) => {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => listeners.delete(listener)
}
contextBridge.exposeInMainWorld('openpetBackend', {
  getBackend: () => currentBackend,
  onChanged: (listener) => addListener(backendListeners, listener),
  getRuntimeStatus: () => currentRuntimeStatus,
  onRuntimeStatusChanged: (listener) => addListener(runtimeListeners, listener),
  getSecretStorageSecurity: () => currentSecretStorageSecurity,
  onSecretStorageSecurityChanged: (listener) => addListener(secretStorageSecurityListeners, listener)
})
const isBackendPayload = (payload) => Boolean(
  payload && typeof payload === 'object' && Object.hasOwn(payload, '__openpetBackend')
)
ipcRenderer.on(IPC.SETTINGS_CHANGED, (_event, payload) => {
  if (isBackendPayload(payload)) notifyBackend(payload.__openpetBackend, payload.__openpetRuntimeStatus)
  else if (payload?.systemCursorStatus) notifyRuntimeStatus(payload.systemCursorStatus)
  if (payload && typeof payload === 'object' && Object.hasOwn(payload, '__openpetSecretStorageSecurity')) {
    notifySecretStorageSecurity(payload.__openpetSecretStorageSecurity)
  }
})
