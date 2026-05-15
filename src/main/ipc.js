/**
 * IPC 注册模块 —— 集中注册所有主进程侧 IPC 处理器。
 *
 * 为什么独立存在：
 * — 13 条 IPC 通道的注册逻辑如果散落在 main.js 中，会淹没应用生命周期代码。
 * — 依赖通过参数注入而非直接 import，避免与 window/settings/screen 模块形成硬耦合。
 * — 修改或新增 IPC 通道时，只需改这一个文件 + shared/ipc-channels.js。
 */
const { ipcMain, BrowserWindow, app } = require('electron')
const { IPC } = require('../shared/ipc-channels')

/**
 * 向宠物窗口安全推送消息的薄封装。
 * 自动检查窗口是否还存在，避免向已关闭的窗口发送消息导致异常。
 */
const sendToPetWindow = (getPetWindow, channel, data) => {
  const petWindow = getPetWindow()
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send(channel, data)
  }
}

/**
 * 注册所有 IPC 处理器。接收依赖注入对象，各 handler 只通过注入的函数访问外部能力。
 */
const registerIpcHandlers = ({ getPetWindow, loadSettings, saveSettings, applyWindowScale,
  getPetAnimations, clampToWorkArea, getMovementState, createSettingsWindow }) => {

  // 渲染进程启动时请求动作列表（通过 preload 暴露的 getAnimations 调用）
  ipcMain.handle(IPC.PET_GET_ANIMATIONS, () => getPetAnimations())

  // 拖拽开始时读取窗口位置，用于计算鼠标偏移
  ipcMain.handle(IPC.PET_GET_BOUNDS, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win.getBounds()
  })

  // 散步启动时查询窗口是否贴边，用于决定初始方向
  ipcMain.handle(IPC.PET_GET_MOVEMENT_STATE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    return getMovementState(win)
  })

  // 拖拽移动：直接设置窗口位置（主进程负责钳制到工作区）
  ipcMain.on(IPC.PET_SET_POSITION, (event, point) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !point) return
    const next = clampToWorkArea(win, point.x, point.y)
    win.setPosition(next.x, next.y)
  })

  // 散步移动：增量偏移窗口，返回是否撞到边界供渲染进程决定掉头
  ipcMain.handle(IPC.PET_MOVE_BY, (event, delta) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !delta) return null
    const [x, y] = win.getPosition()
    const next = clampToWorkArea(win, x + delta.x, y + delta.y)
    win.setPosition(next.x, next.y)
    return next
  })

  // 右键菜单"退出"
  ipcMain.on(IPC.PET_QUIT, () => app.quit())

  // 右键菜单"设置"：打开设置面板
  ipcMain.on(IPC.SETTINGS_OPEN, () => {
    createSettingsWindow(getPetWindow())
  })

  // 设置面板启动时读取当前设置
  ipcMain.handle(IPC.SETTINGS_GET, () => loadSettings())

  // 设置面板点击"保存"：持久化并通知宠物窗口应用变更
  ipcMain.handle(IPC.SETTINGS_SAVE, (_event, settings) => {
    saveSettings(settings)
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, settings)
    applyWindowScale(getPetWindow(), settings.scale)
  })

  // 设置面板拖动滑块：实时预览缩放（不持久化）
  ipcMain.on(IPC.SETTINGS_PREVIEW_SCALE, (_event, scale) => {
    applyWindowScale(getPetWindow(), scale)
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, { scale })
  })

  // 设置面板关闭：清理 settingsWindow 引用
  ipcMain.on(IPC.SETTINGS_CLOSE, (_event) => {
    const win = BrowserWindow.fromWebContents(_event.sender)
    if (win) {
      const petWindow = getPetWindow()
      if (petWindow && petWindow.settingsWindow === win) {
        petWindow.settingsWindow = null
      }
      win.close()
    }
  })
}

module.exports = { registerIpcHandlers }
