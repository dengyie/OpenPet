/**
 * OpenPet 应用入口 — Electron 主进程。
 *
 * 职责：
 * 1. 应用生命周期（启动、退出、单实例锁、macOS Dock 激活）
 * 2. 组装 apps/desktop/src/ 各模块并注入依赖
 *
 * 不包含：窗口创建细节、IPC 处理、设置读写、屏幕计算 —— 均在 apps/desktop/src/ 中。
 */
const { app, BrowserWindow, dialog, shell, screen } = require('electron')
const fs = require('fs')
const path = require('path')
const projectRoot = path.resolve(__dirname, '../..')
const { IPC } = require('./src/shared/ipc-channels')
const { clampToWorkArea, getMovementState } = require('./src/windows/screen')
const { applyPetViewport, applyWindowScale, createWindow, createSettingsWindow, loadPetWindow } = require('./src/windows/window')
const { createPetChatWindowManager } = require('./src/windows/pet-chat-window')
const { createPetBubbleChatWindowManager } = require('./src/windows/pet-bubble-chat-window')
const { createPetRendererSettings, normalizeLocalHttpConfig, reloadAndSendAnimations, registerIpcHandlers } = require('./src/ipc')
const { createOpenPetRuntime } = require('./src/services/bootstrap/create-openpet-runtime')
const { configureUserDataPath } = require('./src/services/user-data-path')
const { createEventBus } = require('./src/services/event-bus')
const { createSettingsService } = require('./src/services/settings-service')
const { createActionService } = require('./src/services/action-service')
const { createPetPackService } = require('./src/services/pet-pack-service')
const { createPetService } = require('./src/services/pet-service')
const { createSecretService } = require('./src/services/secret-service')
const { createImageGenerationModelService } = require('./src/services/image-generation-model-service')
const { createTriggerRuleRuntimeService } = require('./src/services/trigger-rule-runtime-service')
const { createCreatorReferenceService } = require('./src/services/creator-reference-service')
const { createCreatorStudioDefaultFlowService } = require('./src/services/creator-studio-default-flow-service')
const { createCreatorWorkflowService } = require('./src/services/creator-workflow-service')
const { createHatchPetAgentService } = require('./src/services/hatch-pet-agent-service')
const { createPluginService } = require('./src/services/plugin-service')
const { createPluginInstallService } = require('./src/services/plugin-install-service')
const { syncBundledPlugins } = require('./src/services/bundled-plugin-sync-service')
const { createPluginGithubImportService } = require('./src/services/plugin-github-import-service')
const { createLocalHttpService } = require('./src/services/local-http-service')
const { createActionImportService } = require('./src/services/action-import-service')
const { createCursorAssetService } = require('./src/native/cursor-asset-service')
const { createSystemCursorService } = require('./src/native/system-cursor-service')
const { createAppLogService } = require('./src/services/app-log-service')
const { createCatalogService } = require('./src/services/catalog-service')
const { registerAppLifecycleLogs, safeRecordAppLog } = require('./src/services/app-lifecycle-logger')
const { createPetMovementPolicy } = require('./src/pet/pet-movement-policy')
const { configureSingleInstanceLock } = require('./src/services/single-instance')
const { maybeRunPackagedRuntimeSmoke } = require('./src/services/packaged-runtime-smoke-runner')
const { maybeRunPackagedPluginCleanupEvidence } = require('./src/services/packaged-plugin-cleanup-evidence-runner')
const { maybeRunPackagedCreatorStudioEvidence } = require('./src/services/packaged-creator-studio-evidence-runner')
const { maybeRunPackagedCreatorStudioUiE2e } = require('./src/services/packaged-creator-studio-ui-e2e-runner')
const { maybeRunPackagedCreateUiSmoke } = require('./src/services/packaged-create-ui-smoke-runner')
const { createBasicBehaviorPlugin } = require('./src/services/plugins/official/basic-behavior')
const { createSidecarRuntimeCoordinator } = require('./src/sidecar/runtime-coordinator')
const { createDefaultSidecarPidLedger } = require('./src/sidecar/orphan-cleanup')
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
  const { loadSettings, saveSettings, syncLoginItemSettings } = require('./src/services/settings')
  createOpenPetRuntime({
    app,
    BrowserWindow,
    dialog,
    shell,
    screen,
    projectRoot,
    settingsRuntime: {
      loadSettings,
      saveSettings,
      syncLoginItemSettings
    },
    getPetWindow,
    setPetWindow: (nextPetWindow) => { petWindow = nextPetWindow },
    createSettingsWindow,
    createWindow,
    loadPetWindow,
    registerAppLifecycleLogs,
    safeRecordAppLog,
    registerIpcHandlers,
    createPetRendererSettings,
    normalizeLocalHttpConfig,
    reloadAndSendAnimations,
    applyWindowScale,
    applyPetViewport,
    clampToWorkArea,
    getMovementState,
    maybeRunPackagedRuntimeSmoke,
    maybeRunPackagedPluginCleanupEvidence,
    maybeRunPackagedCreatorStudioEvidence,
    maybeRunPackagedCreatorStudioUiE2e,
    maybeRunPackagedCreateUiSmoke,
    factories: {
      createEventBus,
      createSettingsService,
      createActionService,
      createPetPackService,
      createPetService,
      createSecretService,
      createImageGenerationModelService,
      createTriggerRuleRuntimeService,
      createCreatorReferenceService,
      createCreatorStudioDefaultFlowService,
      createCreatorWorkflowService,
      createHatchPetAgentService,
      createPluginService,
      createPluginInstallService,
      syncBundledPlugins,
      createPluginGithubImportService,
      createLocalHttpService,
      createActionImportService,
      createCursorAssetService,
      createSystemCursorService,
      createAppLogService,
      createCatalogService,
      createPetMovementPolicy,
      createBasicBehaviorPlugin,
      createSidecarPidLedger: createDefaultSidecarPidLedger,
      createPetChatWindowManager,
      createPetBubbleChatWindowManager,
      createSidecarRuntimeCoordinator
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
