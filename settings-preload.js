const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('settingsAPI', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  previewScale: (scale) => ipcRenderer.send('settings:preview-scale', scale),
  close: () => ipcRenderer.send('settings:close')
})
