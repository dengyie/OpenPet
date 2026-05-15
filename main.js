/**
 * ibot 应用入口 — Electron 主进程。
 *
 * 职责：
 * 1. 应用生命周期（启动、退出、单实例锁、macOS Dock 激活）
 * 2. 组装 src/main/ 各模块并注入依赖
 *
 * 不包含：窗口创建细节、IPC 处理、设置读写、屏幕计算 —— 均在 src/main/ 中。
 */
const { app, BrowserWindow } = require('electron')
const { IPC } = require('./src/shared/ipc-channels')
const { loadSettings, saveSettings } = require('./src/main/settings')
const { clampToWorkArea, getMovementState } = require('./src/main/screen')
const { getPetAnimations } = require('./src/main/animations')
const { applyWindowScale, createWindow, createSettingsWindow } = require('./src/main/window')
const { registerIpcHandlers } = require('./src/main/ipc')

let petWindow = null
const getPetWindow = () => petWindow

// ── 单实例锁：同一时间只允许一个宠物窗口 ──
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (petWindow) {
      if (petWindow.isMinimized()) petWindow.restore()
      petWindow.focus()
    }
  })
}

// ── 应用就绪 ──
app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: loadSettings().autoStart })

  // 注册 IPC 处理器（依赖注入：主模块只负责"连接"，不负责"实现"）
  registerIpcHandlers({
    getPetWindow,
    loadSettings,
    saveSettings,
    applyWindowScale: (scale) => applyWindowScale(petWindow, scale),
    getPetAnimations,
    clampToWorkArea,
    getMovementState,
    createSettingsWindow: () => createSettingsWindow(petWindow)
  })

  petWindow = createWindow()

  // 页面加载完成后推送初始设置到渲染进程
  petWindow.webContents.on('did-finish-load', () => {
    const settings = loadSettings()
    applyWindowScale(petWindow, settings.scale)
    petWindow.webContents.send(IPC.SETTINGS_CHANGED, settings)
  })

  // macOS：Dock 图标点击时若窗口已关闭则重建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      petWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => app.quit())
