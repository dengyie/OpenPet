/**
 * OpenPet 宠物窗口预加载脚本。
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
  PET_ANIMATIONS_CHANGED: 'pet:animations-changed',
  PET_GET_BOUNDS: 'pet:get-bounds',
  PET_GET_MOVEMENT_STATE: 'pet:get-movement-state',
  PET_SET_VIEWPORT: 'pet:set-viewport',
  PET_SET_POSITION: 'pet:set-position',
  PET_SET_MOUSE_PASSTHROUGH: 'pet:set-mouse-passthrough',
  PET_RECORD_APP_LOG: 'pet:record-app-log',
  PET_DRAG_ENDED: 'pet:drag-ended',
  PET_MOVE_BY: 'pet:move-by',
  PET_SAY: 'pet:say',
  PET_PLAY_ACTION: 'pet:play-action',
  PET_QUIT: 'pet:quit',
  SETTINGS_OPEN: 'settings:open',
  SETTINGS_CHANGED: 'settings:changed'
}

contextBridge.exposeInMainWorld('petAPI', {
  getAnimations: () => ipcRenderer.invoke(IPC.PET_GET_ANIMATIONS),
  getBounds: () => ipcRenderer.invoke(IPC.PET_GET_BOUNDS),
  getMovementState: () => ipcRenderer.invoke(IPC.PET_GET_MOVEMENT_STATE),
  setViewport: (viewport) => ipcRenderer.send(IPC.PET_SET_VIEWPORT, viewport),
  setPosition: (point) => ipcRenderer.send(IPC.PET_SET_POSITION, point),
  setMousePassthrough: (passthrough) => ipcRenderer.send(IPC.PET_SET_MOUSE_PASSTHROUGH, Boolean(passthrough)),
  recordAppLog: (entry) => ipcRenderer.send(IPC.PET_RECORD_APP_LOG, entry),
  dragEnded: () => ipcRenderer.send(IPC.PET_DRAG_ENDED),
  moveBy: (delta) => ipcRenderer.invoke(IPC.PET_MOVE_BY, delta),
  quit: () => ipcRenderer.send(IPC.PET_QUIT),
  openSettings: () => ipcRenderer.send(IPC.SETTINGS_OPEN),
  onPetSay: (callback) => {
    ipcRenderer.on(IPC.PET_SAY, (_event, payload) => callback(payload))
  },
  onPetAction: (callback) => {
    ipcRenderer.on(IPC.PET_PLAY_ACTION, (_event, payload) => callback(payload))
  },
  onAnimationsChanged: (callback) => {
    ipcRenderer.on(IPC.PET_ANIMATIONS_CHANGED, (_event, payload) => callback(payload))
  },
  onSettingsChanged: (callback) => {
    ipcRenderer.on(IPC.SETTINGS_CHANGED, (_event, settings) => callback(settings))
  }
})
