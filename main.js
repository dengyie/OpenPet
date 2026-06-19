/**
 * OpenPet 应用入口 — Electron 主进程。
 *
 * 职责：
 * 1. 应用生命周期（启动、退出、单实例锁、macOS Dock 激活）
 * 2. 组装 src/main/ 各模块并注入依赖
 *
 * 不包含：窗口创建细节、IPC 处理、设置读写、屏幕计算 —— 均在 src/main/ 中。
 */
const { app, BrowserWindow, dialog, shell, screen } = require('electron')
const fs = require('fs')
const path = require('path')
const { IPC } = require('./src/shared/ipc-channels')
const { clampToWorkArea, getMovementState } = require('./src/main/screen')
const { applyPetViewport, applyWindowScale, createWindow, createSettingsWindow, loadPetWindow } = require('./src/main/window')
const { createPetRendererSettings, normalizeLocalHttpConfig, reloadAndSendAnimations, registerIpcHandlers } = require('./src/main/ipc')
const { configureUserDataPath } = require('./src/main/user-data-path')
const { createEventBus } = require('./src/main/services/event-bus')
const { createSettingsService } = require('./src/main/services/settings-service')
const { createActionService } = require('./src/main/services/action-service')
const { createPetPackService } = require('./src/main/services/pet-pack-service')
const { createPetService } = require('./src/main/services/pet-service')
const { createSecretService } = require('./src/main/services/secret-service')
const { createAiService } = require('./src/main/services/ai-service')
const { createImageGenerationModelService } = require('./src/main/services/image-generation-model-service')
const { createBehaviorOrchestratorService } = require('./src/main/services/behavior-orchestrator-service')
const { createPluginService } = require('./src/main/services/plugin-service')
const { createPluginInstallService } = require('./src/main/services/plugin-install-service')
const { createPluginGithubImportService } = require('./src/main/services/plugin-github-import-service')
const { createLocalHttpService } = require('./src/main/services/local-http-service')
const { createActionImportService } = require('./src/main/services/action-import-service')
const { createCursorAssetService } = require('./src/main/services/cursor-asset-service')
const { createAppLogService } = require('./src/main/services/app-log-service')
const { createAboutService } = require('./src/main/services/about-service')
const { createCatalogService } = require('./src/main/services/catalog-service')
const { createPetMovementPolicy } = require('./src/main/pet-movement-policy')
const { configureSingleInstanceLock } = require('./src/main/single-instance')
const { createCursorAssetService } = require('./src/main/services/cursor-asset-service')
const { createAppLogService } = require('./src/main/services/app-log-service')
const { maybeRunPackagedRuntimeSmoke } = require('./src/main/packaged-runtime-smoke-runner')
const { maybeRunPackagedPluginCleanupEvidence } = require('./src/main/packaged-plugin-cleanup-evidence-runner')
const { createBasicBehaviorPlugin } = require('./src/main/plugins/official/basic-behavior')
const packageJson = require('./package.json')

let petWindow = null
const getPetWindow = () => petWindow

// Keep the pre-OpenPet userData directory so upgrades retain settings,
// secrets, installed plugins, pet packs, and local service state.
// Electron's single-instance lock is scoped by app identity/user data,
// so configure this before requesting the lock.
configureUserDataPath({ app })

// ── 单实例锁：同一时间只允许一个宠物窗口 ──
const canBootstrap = configureSingleInstanceLock({ app, getPetWindow })

const bootstrapOpenPet = () => {
  const { loadSettings, saveSettings, syncLoginItemSettings } = require('./src/main/settings')
  const eventBus = createEventBus()
  const settingsService = createSettingsService({
    eventBus,
    loadSettings,
    saveSettings,
    syncSideEffects: (settings) => syncLoginItemSettings(settings.autoStart)
  })
  let catalogService = null
  const petPackService = createPetPackService({
    settingsService,
    userPacksDir: path.join(app.getPath('userData'), 'pet-packs'),
    projectRoot: __dirname,
    getPetPackBlockStatus: (candidate) => catalogService?.getPetPackBlockStatus(candidate) || { blocked: false, reasons: [] }
  })
  const actionService = createActionService({
    petPackService,
    saveLegacyAnimations: (config) => {
      const configPath = path.join(__dirname, 'cat_anime', 'animations.json')
      fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
      return config
    }
  })
  const petService = createPetService({ eventBus, settingsService, actionService })
  const secretService = createSecretService()
  const aiService = createAiService({ settingsService, secretService })
  const imageGenerationModelService = createImageGenerationModelService({ settingsService, secretService })
  const behaviorOrchestratorService = createBehaviorOrchestratorService({ settingsService })
  const localHttpService = createLocalHttpService({ petService, settingsService })
  const aboutService = createAboutService({ app, packageJson })
  const cursorAssetService = createCursorAssetService({
    cursorDir: path.join(app.getPath('userData'), 'cursors')
  })
  const appLogService = createAppLogService({
    logDir: path.join(app.getPath('userData'), 'logs')
  })
  const petMovementPolicy = createPetMovementPolicy({ screen })
  const appLogService = createAppLogService({
    logDir: path.join(app.getPath('userData'), 'logs')
  })
  try {
    appLogService.record({
      scope: 'app',
      level: 'info',
      actor: 'system',
      event: 'app.ready',
      message: 'OpenPet app services initialized'
    })
    console.log(`OpenPet app log: ${appLogService.logPath}`)
  } catch (error) {
    console.warn(`OpenPet app log unavailable: ${error.message}`)
  }
  const actionImportService = createActionImportService({
    framesRoot: path.join(__dirname, 'cat_anime', 'flames'),
    spritesDir: path.join(__dirname, 'cat_anime', 'sprites'),
    configPath: path.join(__dirname, 'cat_anime', 'animations.json')
  })
  const cursorAssetService = createCursorAssetService({
    cursorDir: path.join(app.getPath('userData'), 'cursors')
  })
  cursorAssetService.repairCursor(petService.getSettings().customCursor).then((customCursor) => {
    const currentSettings = petService.getSettings()
    if (customCursor.assetPath && customCursor.assetPath !== currentSettings.customCursor?.assetPath) {
      petService.saveSettings({ ...currentSettings, customCursor })
      appLogService.record({
        scope: 'settings',
        level: 'info',
        actor: 'system',
        event: 'settings.cursor.asset.repaired',
        message: 'Cursor asset resized for browser compatibility',
        details: { fileName: customCursor.fileName, enabled: customCursor.enabled }
      })
    }
  }).catch((error) => {
    appLogService.record({
      scope: 'settings',
      level: 'error',
      actor: 'system',
      event: 'settings.cursor.asset.repair.failed',
      message: error.message
    })
  })
  const pluginDir = path.join(app.getPath('userData'), 'plugins')
  const pluginInstallService = createPluginInstallService({
    settingsService,
    pluginDir,
    getPluginBlockStatus: (candidate) => catalogService?.getPluginBlockStatus(candidate) || { blocked: false, reasons: [] }
  })
  const pluginGithubImportService = createPluginGithubImportService({
    pluginInstallService
  })
  const pluginService = createPluginService({
    settingsService,
    petService,
    actionService,
    actionImportService,
    petPackService,
    aiService,
    imageGenerationModelService,
    pluginDirs: [pluginDir],
    officialPlugins: [createBasicBehaviorPlugin()],
    openExternal: (url) => shell.openExternal(url),
    onPetPackActivated: () => reloadAndSendAnimations(getPetWindow, petService),
    selectCreatorAssetFrameFolder: async () => {
      const selected = await dialog.showOpenDialog({
        title: '选择动作帧文件夹',
        properties: ['openDirectory']
      })
      if (selected.canceled || !selected.filePaths[0]) return { canceled: true }
      return { canceled: false, sourceDir: selected.filePaths[0] }
    },
    getPluginBlockStatus: (candidate) => catalogService?.getPluginBlockStatus(candidate) || { blocked: false, reasons: [] }
  })
  app.on('before-quit', () => {
    pluginService.stopAllServices?.()
  })
  catalogService = createCatalogService({
    settingsService,
    pluginInstallService,
    pluginService,
    petPackService,
    catalogPath: path.join(__dirname, 'catalog', 'openpet-catalog.json')
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
    imageGenerationModelService,
    behaviorOrchestratorService,
    pluginService,
    pluginInstallService,
    pluginGithubImportService,
    catalogService,
    localHttpService,
    aboutService,
    actionImportService,
    cursorAssetService,
    appLogService,
    applyWindowScale: (scale) => applyWindowScale(petWindow, scale),
    applyPetViewport,
    clampToWorkArea,
    getMovementState,
    createSettingsWindow: () => createSettingsWindow(petWindow),
    petMovementPolicy
  })

  petWindow = createWindow({ load: false })

  const normalizePetWindowForDisplayChange = () => {
    if (!petWindow || petWindow.isDestroyed()) return
    const currentSettings = petService.getSettings()
    const next = petMovementPolicy.normalizeWindowForDisplay({
      windowBounds: petWindow.getBounds(),
      settings: currentSettings.petBehavior
    })
    petWindow.setPosition(next.x, next.y)

    const behavior = petMovementPolicy.normalizePetBehaviorSettings(currentSettings.petBehavior)
    if (!behavior.home.enabled || !behavior.home.anchor) return
    const display = petMovementPolicy.resolveDisplayForWindow(petWindow.getBounds())
    const anchor = petMovementPolicy.normalizeAnchorForDisplay({
      anchor: behavior.home.anchor,
      display,
      windowBounds: petWindow.getBounds()
    })

    if (
      anchor.displayId !== behavior.home.anchor.displayId
      || anchor.x !== behavior.home.anchor.x
      || anchor.y !== behavior.home.anchor.y
    ) {
      petService.saveSettings({
        ...currentSettings,
        petBehavior: {
          ...behavior,
          home: {
            ...behavior.home,
            anchor
          }
        }
      })
      petWindow.webContents.send(IPC.SETTINGS_CHANGED, createPetRendererSettings(petService.getSettings()))
    }
  }

  screen.on('display-metrics-changed', normalizePetWindowForDisplayChange)
  screen.on('display-removed', normalizePetWindowForDisplayChange)
  screen.on('display-added', normalizePetWindowForDisplayChange)

  // 页面加载完成后推送初始设置到渲染进程
  petWindow.webContents.on('did-finish-load', () => {
    const settings = petService.getSettings()
    applyWindowScale(petWindow, settings.scale)
    petWindow.webContents.send(IPC.SETTINGS_CHANGED, createPetRendererSettings(settings))
    maybeRunPackagedRuntimeSmoke({ app, petWindow, petService, petPackService })
    maybeRunPackagedPluginCleanupEvidence({ app, pluginInstallService, pluginService })
  })
  loadPetWindow(petWindow)

  // macOS：Dock 图标点击时若窗口已关闭则重建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      petWindow = createWindow()
    }
  })
}

// ── 应用就绪 ──
canBootstrap.then((canStart) => {
  if (!canStart) return null
  return app.whenReady().then(bootstrapOpenPet)
}).catch((error) => {
  console.error('Failed to bootstrap OpenPet:', error)
  app.quit()
})

app.on('window-all-closed', () => app.quit())
