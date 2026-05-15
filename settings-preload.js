/**
 * ibot 设置窗口预加载脚本。
 *
 * 职责：暴露 window.settingsAPI，仅包含设置相关的最小接口。
 * 独立于 preload.js 遵循最小权限原则。
 */
const { contextBridge, ipcRenderer } = require('electron')

const IPC = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_PREVIEW_SCALE: 'settings:preview-scale',
  SETTINGS_CLOSE: 'settings:close'
}

contextBridge.exposeInMainWorld('settingsAPI', {
  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  saveSettings: (settings) => ipcRenderer.invoke(IPC.SETTINGS_SAVE, settings),
  previewScale: (scale) => ipcRenderer.send(IPC.SETTINGS_PREVIEW_SCALE, scale),
  close: () => ipcRenderer.send(IPC.SETTINGS_CLOSE)
})
