/**
 * ibot 宠物窗口预加载脚本。
 *
 * 职责：通过 contextBridge 暴露 window.petAPI，是渲染进程访问主进程的唯一安全通道。
 * contextIsolation: true 确保渲染进程无法直接访问 Node.js / 文件系统。
 *
 * IPC 通道名在此内联定义（非 require），因为 Electron 沙盒 preload 环境
 * 的 require 路径解析受限，无法加载项目子目录的模块。
 */
const { contextBridge, ipcRenderer } = require('electron')

const IPC = {
  PET_GET_ANIMATIONS: 'pet:get-animations',
  PET_GET_BOUNDS: 'pet:get-bounds',
  PET_GET_MOVEMENT_STATE: 'pet:get-movement-state',
  PET_SET_POSITION: 'pet:set-position',
  PET_MOVE_BY: 'pet:move-by',
  PET_QUIT: 'pet:quit',
  SETTINGS_OPEN: 'settings:open',
  SETTINGS_CHANGED: 'settings:changed'
}

contextBridge.exposeInMainWorld('petAPI', {
  getAnimations: () => ipcRenderer.invoke(IPC.PET_GET_ANIMATIONS),
  getBounds: () => ipcRenderer.invoke(IPC.PET_GET_BOUNDS),
  getMovementState: () => ipcRenderer.invoke(IPC.PET_GET_MOVEMENT_STATE),
  setPosition: (point) => ipcRenderer.send(IPC.PET_SET_POSITION, point),
  moveBy: (delta) => ipcRenderer.invoke(IPC.PET_MOVE_BY, delta),
  quit: () => ipcRenderer.send(IPC.PET_QUIT),
  openSettings: () => ipcRenderer.send(IPC.SETTINGS_OPEN),
  onSettingsChanged: (callback) => {
    ipcRenderer.on(IPC.SETTINGS_CHANGED, (_event, settings) => callback(settings))
  }
})
