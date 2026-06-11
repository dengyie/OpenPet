/**
 * IPC 注册模块 —— 集中注册所有主进程侧 IPC 处理器。
 *
 * 为什么独立存在：
 * — 13 条 IPC 通道的注册逻辑如果散落在 main.js 中，会淹没应用生命周期代码。
 * — 依赖通过参数注入而非直接 import，避免与 window/settings/screen 模块形成硬耦合。
 * — 修改或新增 IPC 通道时，只需改这一个文件 + shared/ipc-channels.js。
 */
const { ipcMain, BrowserWindow, app, dialog } = require('electron')
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

const reloadAndSendAnimations = (getPetWindow, petService) => {
  const animations = petService.reloadAnimations()
  sendToPetWindow(getPetWindow, IPC.PET_ANIMATIONS_CHANGED, animations)
  return animations
}

/**
 * 注册所有 IPC 处理器。接收依赖注入对象，各 handler 只通过注入的函数访问外部能力。
 */
const registerIpcHandlers = ({ getPetWindow, petService, aiService, pluginService, localHttpService, actionImportService, applyWindowScale,
  clampToWorkArea, getMovementState, createSettingsWindow }) => {
  petService.onSay?.((payload) => {
    sendToPetWindow(getPetWindow, IPC.PET_SAY, payload)
  })
  petService.onAction?.((payload) => {
    sendToPetWindow(getPetWindow, IPC.PET_PLAY_ACTION, payload)
  })
  petService.onEvent?.((payload) => {
    if (payload?.message) sendToPetWindow(getPetWindow, IPC.PET_SAY, { text: payload.message, ttlMs: payload.ttlMs, source: payload.source })
  })

  // 渲染进程启动时请求动作列表（通过 preload 暴露的 getAnimations 调用）
  ipcMain.handle(IPC.PET_GET_ANIMATIONS, () => petService.getAnimations())

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
  ipcMain.handle(IPC.SETTINGS_GET, () => petService.getSettings())

  ipcMain.handle(IPC.ACTIONS_GET, () => petService.getAnimations())

  ipcMain.handle(IPC.ACTIONS_IMPORT_FRAMES, async (_event, payload) => {
    const selected = await dialog.showOpenDialog({
      title: '选择动作帧文件夹',
      properties: ['openDirectory']
    })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true }

    const result = await actionImportService.importActionFrames({
      sourceDir: selected.filePaths[0],
      actionId: payload.actionId,
      label: payload.label
    })
    const animations = reloadAndSendAnimations(getPetWindow, petService)
    return { canceled: false, result, animations }
  })

  ipcMain.handle(IPC.ACTIONS_SAVE_CONFIG, async (_event, payload) => {
    const result = await actionImportService.updateActionConfig(payload)
    const animations = reloadAndSendAnimations(getPetWindow, petService)
    return { result, animations }
  })

  ipcMain.handle(IPC.ACTIONS_DELETE, async (_event, payload) => {
    const result = await actionImportService.deleteAction(payload.actionId)
    const animations = reloadAndSendAnimations(getPetWindow, petService)
    return { result, animations }
  })

  // 设置面板点击"保存"：持久化并通知宠物窗口应用变更
  ipcMain.handle(IPC.SETTINGS_SAVE, (_event, settings) => {
    const savedSettings = petService.saveSettings(settings)
    sendToPetWindow(getPetWindow, IPC.SETTINGS_CHANGED, savedSettings)
    applyWindowScale(getPetWindow(), savedSettings.scale)
    return savedSettings
  })

  ipcMain.handle(IPC.AI_GET_CONFIG, () => aiService.getConfig())

  ipcMain.handle(IPC.AI_SAVE_CONFIG, (_event, config) => aiService.saveConfig(config))

  ipcMain.handle(IPC.AI_SAVE_API_KEY, (_event, apiKey) => aiService.saveApiKey(apiKey))

  ipcMain.handle(IPC.AI_TEST_CONNECTION, () => aiService.testConnection())

  ipcMain.handle(IPC.AI_CHAT, async (_event, payload) => {
    const result = await aiService.chat(payload)
    petService.say({ text: result.reply, source: 'ai' })
    return result
  })

  ipcMain.handle(IPC.PLUGINS_LIST, () => pluginService.listPlugins())

  ipcMain.handle(IPC.PLUGINS_SET_ENABLED, (_event, payload) => {
    return pluginService.setEnabled(payload.pluginId, payload.enabled)
  })

  ipcMain.handle(IPC.PLUGINS_RUN_COMMAND, (_event, payload) => {
    return pluginService.runCommand(payload.pluginId, payload.commandId, payload.payload)
  })

  ipcMain.handle(IPC.SERVICE_GET_STATUS, () => ({
    config: petService.getSettings().localHttp,
    runtime: localHttpService.getStatus()
  }))

  ipcMain.handle(IPC.SERVICE_SAVE_CONFIG, async (_event, config) => {
    const currentSettings = petService.getSettings()
    const nextConfig = {
      ...currentSettings.localHttp,
      ...config,
      host: '127.0.0.1',
      port: Number(config.port || 0),
      enabled: Boolean(config.enabled)
    }
    const savedSettings = petService.saveSettings({ ...currentSettings, localHttp: nextConfig })
    const runtime = nextConfig.enabled
      ? await localHttpService.start(nextConfig)
      : await localHttpService.stop()
    return { config: savedSettings.localHttp, runtime }
  })

  // 设置面板拖动滑块：实时预览缩放（不持久化）
  ipcMain.on(IPC.SETTINGS_PREVIEW_SCALE, (_event, scale) => {
    petService.previewSettings({ scale })
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
