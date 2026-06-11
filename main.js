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
const path = require('path')
const { IPC } = require('./src/shared/ipc-channels')
const { loadSettings, saveSettings, syncLoginItemSettings } = require('./src/main/settings')
const { clampToWorkArea, getMovementState } = require('./src/main/screen')
const { applyWindowScale, createWindow, createSettingsWindow } = require('./src/main/window')
const { createPetRendererSettings, normalizeLocalHttpConfig, registerIpcHandlers } = require('./src/main/ipc')
const { createEventBus } = require('./src/main/services/event-bus')
const { createSettingsService } = require('./src/main/services/settings-service')
const { createActionService } = require('./src/main/services/action-service')
const { createPetPackService } = require('./src/main/services/pet-pack-service')
const { createPetService } = require('./src/main/services/pet-service')
const { createSecretService } = require('./src/main/services/secret-service')
const { createAiService } = require('./src/main/services/ai-service')
const { createBehaviorOrchestratorService } = require('./src/main/services/behavior-orchestrator-service')
const { createPluginService } = require('./src/main/services/plugin-service')
const { createPluginInstallService } = require('./src/main/services/plugin-install-service')
const { createLocalHttpService } = require('./src/main/services/local-http-service')
const { createActionImportService } = require('./src/main/services/action-import-service')
const { createBasicBehaviorPlugin } = require('./src/main/plugins/official/basic-behavior')

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
  const eventBus = createEventBus()
  const settingsService = createSettingsService({
    eventBus,
    loadSettings,
    saveSettings,
    syncSideEffects: (settings) => syncLoginItemSettings(settings.autoStart)
  })
  const petPackService = createPetPackService({
    settingsService,
    userPacksDir: path.join(app.getPath('userData'), 'pet-packs'),
    projectRoot: __dirname
  })
  const actionService = createActionService({ petPackService })
  const petService = createPetService({ eventBus, settingsService, actionService })
  const secretService = createSecretService()
  const aiService = createAiService({ settingsService, secretService })
  const behaviorOrchestratorService = createBehaviorOrchestratorService({ settingsService })
  const localHttpService = createLocalHttpService({ petService, settingsService })
  const actionImportService = createActionImportService({
    framesRoot: path.join(__dirname, 'cat_anime', 'flames'),
    spritesDir: path.join(__dirname, 'cat_anime', 'sprites'),
    configPath: path.join(__dirname, 'cat_anime', 'animations.json')
  })
  const pluginDir = path.join(app.getPath('userData'), 'plugins')
  const pluginService = createPluginService({
    settingsService,
    petService,
    petPackService,
    aiService,
    pluginDirs: [pluginDir],
    officialPlugins: [createBasicBehaviorPlugin()]
  })
  const pluginInstallService = createPluginInstallService({
    settingsService,
    pluginDir
  })
  let localHttpConfig = petService.getSettings().localHttp
  if (localHttpConfig?.enabled) {
    const normalizedConfig = normalizeLocalHttpConfig(localHttpConfig, localHttpConfig)
    if (normalizedConfig.token !== localHttpConfig.token) {
      const currentSettings = petService.getSettings()
      petService.saveSettings({ ...currentSettings, localHttp: normalizedConfig })
      localHttpConfig = normalizedConfig
    }
    localHttpService.start(localHttpConfig).catch((error) => {
      console.error('Failed to start local HTTP service:', error.message)
    })
  }

  syncLoginItemSettings(petService.getSettings().autoStart)

  // 注册 IPC 处理器（依赖注入：主模块只负责"连接"，不负责"实现"）
  registerIpcHandlers({
    getPetWindow,
    petService,
    petPackService,
    aiService,
    behaviorOrchestratorService,
    pluginService,
    pluginInstallService,
    localHttpService,
    actionImportService,
    applyWindowScale: (scale) => applyWindowScale(petWindow, scale),
    clampToWorkArea,
    getMovementState,
    createSettingsWindow: () => createSettingsWindow(petWindow)
  })

  petWindow = createWindow()

  // 页面加载完成后推送初始设置到渲染进程
  petWindow.webContents.on('did-finish-load', () => {
    const settings = petService.getSettings()
    applyWindowScale(petWindow, settings.scale)
    petWindow.webContents.send(IPC.SETTINGS_CHANGED, createPetRendererSettings(settings))
  })

  // macOS：Dock 图标点击时若窗口已关闭则重建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      petWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => app.quit())
