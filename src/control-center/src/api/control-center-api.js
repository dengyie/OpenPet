import { defaultActionsConfig, defaultAiConfig, defaultServiceStatus, defaultSettings } from '../lib/defaults.js'

const createDemoInspection = (actionId = 'wave') => ({
  canceled: false,
  selectionId: 'demo-selection',
  folderName: 'demo-wave',
  actionId,
  inspection: {
    valid: true,
    frameCount: 2,
    maxWidth: 8,
    maxHeight: 8,
    frames: [
      { fileName: '01_no_bg.png', width: 8, height: 8, hasAlpha: true },
      { fileName: '02_no_bg.png', width: 8, height: 8, hasAlpha: true }
    ],
    skippedFiles: [],
    errors: [],
    warnings: []
  }
})

const demoApi = {
  getSettings: async () => defaultSettings,
  saveSettings: async (settings) => settings,
  previewScale: () => {},
  getActions: async () => defaultActionsConfig,
  inspectActionFrames: async ({ actionId } = {}) => createDemoInspection(actionId),
  reinspectActionFrames: async ({ selectionId, actionId } = {}) => ({ ...createDemoInspection(actionId), selectionId: selectionId || 'demo-selection' }),
  clearActionFrameSelection: async () => ({ ok: true }),
  importActionFrames: async ({ actionId, label } = {}) => ({ ok: true, result: { importedAction: { id: actionId, label: label || actionId } }, animations: defaultActionsConfig }),
  saveActionsConfig: async (config) => ({ animations: config }),
  deleteAction: async () => ({ animations: defaultActionsConfig }),
  getAiConfig: async () => defaultAiConfig,
  saveAiConfig: async (config) => ({ ...defaultAiConfig, ...config }),
  saveAiApiKey: async () => ({ apiKeyRef: 'ai.default', hasApiKey: true }),
  testAiConnection: async () => ({ ok: true, reply: 'ok' }),
  getAiConversation: async () => [],
  chat: async ({ message }) => ({ reply: `Echo: ${message}` }),
  getPlugins: async () => [],
  setPluginEnabled: async (pluginId, enabled) => ({ id: pluginId, enabled }),
  savePluginConfig: async (pluginId, config) => ({ id: pluginId, config }),
  runPluginCommand: async () => ({ ok: true }),
  getPluginLogs: async () => [],
  exportPluginLogs: async () => '[]',
  clearPluginLogs: async () => [],
  clearPluginStorage: async (pluginId) => ({ id: pluginId, storage: { keyCount: 0, byteSize: 2 } }),
  getServiceStatus: async () => defaultServiceStatus,
  saveServiceConfig: async (config) => ({ config, runtime: { ...config, enabled: config.enabled } }),
  getServiceLogs: async () => [],
  exportServiceLogs: async () => '[]',
  clearServiceLogs: async () => [],
  rotateServiceToken: async () => defaultServiceStatus,
  close: () => {}
}

export const controlCenterAPI = window.controlCenterAPI || demoApi
