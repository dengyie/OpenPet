/**
 * 设置模块 —— 用户偏好的持久化读写。
 *
 * 为什么独立存在：
 * 设置逻辑（读/写/默认值/文件路径）与应用生命周期和窗口管理无关，
 * 独立后可以被 main.js 和 IPC 模块同时引用而无需循环依赖。
 */
const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const { writeJsonAtomic } = require('./json-file-utils')
const { createDefaultCursorSettings } = require('./services/cursor-asset-service')
const { SYSTEM_CURSOR_ID, normalizeCursorSettingsState } = require('../shared/cursor-library')

// 设置保存在 Electron 用户数据目录，卸载重装后仍然保留。
const settingsPath = path.join(app.getPath('userData'), 'settings.json')
const settingsBackupPath = `${settingsPath}.bak`

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const hasLegacyImageGenerationShape = (imageGeneration) => (
  isPlainObject(imageGeneration) && (
    Object.hasOwn(imageGeneration, 'defaultBackend') ||
    isPlainObject(imageGeneration.cloud) ||
    isPlainObject(imageGeneration.local)
  )
)

const hasFlatImageGenerationShape = (imageGeneration) => (
  isPlainObject(imageGeneration) && (
    Object.hasOwn(imageGeneration, 'provider') ||
    Object.hasOwn(imageGeneration, 'baseUrl') ||
    Object.hasOwn(imageGeneration, 'model') ||
    Object.hasOwn(imageGeneration, 'apiKeyRef')
  )
)

const mergeImageGenerationSettings = (imageGeneration) => {
  if (!isPlainObject(imageGeneration)) return { ...defaultSettings.models.imageGeneration }
  if (hasLegacyImageGenerationShape(imageGeneration) && !hasFlatImageGenerationShape(imageGeneration)) {
    return { ...imageGeneration }
  }
  return {
    ...defaultSettings.models.imageGeneration,
    ...imageGeneration
  }
}

// 所有可配置项的默认值。新增设置项时只需在此处添加。
const defaultSettings = {
  scale: 1.0,            // 宠物缩放比例（1.0 = 100%）
  walkSpeed: 2,          // 散步速度（px/frame，可选 1/2/3）
  walkDuration: 15000,   // 散步自动停止时长（ms）
  bubbleDuration: 6000,  // 气泡显示时长（ms）
  menuPosition: 'auto',  // 右键菜单相对宠物位置：auto/right/left/above/below
  autoStart: false,      // 是否开机自启
  selectedCursorId: SYSTEM_CURSOR_ID,
  customCursor: createDefaultCursorSettings(),
  customCursors: [],
  hiddenCursorIds: [],
  customCursorScope: 'openpet',
  petBehavior: {
    grounded: false,
    home: {
      enabled: false,
      radius: 'medium',
      anchor: null
    }
  },
  desktopChat: {
    bounds: null,
    hasUserBounds: false,
    alwaysOnTop: true
  },
  petBubbleChat: {
    enabled: true,
    autoPopup: true,
    autoHide: true,
    pinOnInteraction: true
  },
  ai: {
    enabled: false,
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKeyRef: 'ai.default',
    systemPrompt: 'You are a friendly desktop pet companion.',
    memory: {
      enabled: false
    },
    behavior: {
      enabled: false,
      useTools: true,
      cooldownMs: 1500,
      rules: [],
      decisions: []
    },
    conversations: {}
  },
  models: {
    imageGeneration: {
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-image-2',
      apiKeyRef: 'secret:model.image.openai.apiKey',
      organization: '',
      project: '',
      timeoutMs: 120000,
      maxConcurrentJobs: 1
    }
  },
  plugins: {
    enabled: {
      'official.basic-behavior': true
    },
    config: {},
    storage: {},
    logs: []
  },
  petPacks: {
    activePackId: 'legacy-cat',
    installed: {}
  },
  ecosystem: {
    blocklist: {
      pluginIds: [],
      packIds: [],
      sha256: []
    }
  },
  localHttp: {
    enabled: false,
    host: '127.0.0.1',
    port: 0,
    token: '',
    logs: []
  }
}

const mergeSettings = (settings = {}) => ({
  ...defaultSettings,
  ...settings,
  ai: {
    ...defaultSettings.ai,
    ...(isPlainObject(settings.ai) ? settings.ai : {}),
    behavior: {
      ...defaultSettings.ai.behavior,
      ...(isPlainObject(settings.ai?.behavior) ? settings.ai.behavior : {}),
      rules: Array.isArray(settings.ai?.behavior?.rules) ? settings.ai.behavior.rules : defaultSettings.ai.behavior.rules,
      decisions: Array.isArray(settings.ai?.behavior?.decisions) ? settings.ai.behavior.decisions : defaultSettings.ai.behavior.decisions
    },
    memory: {
      ...defaultSettings.ai.memory,
      ...(isPlainObject(settings.ai?.memory) ? settings.ai.memory : {}),
      enabled: Boolean(settings.ai?.memory?.enabled)
    },
    conversations: isPlainObject(settings.ai?.conversations)
      ? settings.ai.conversations
      : defaultSettings.ai.conversations
  },
  ...normalizeCursorSettingsState(settings),
  petBehavior: {
    ...defaultSettings.petBehavior,
    ...(isPlainObject(settings.petBehavior) ? settings.petBehavior : {}),
    home: {
      ...defaultSettings.petBehavior.home,
      ...(isPlainObject(settings.petBehavior?.home) ? settings.petBehavior.home : {}),
      anchor: isPlainObject(settings.petBehavior?.home?.anchor)
        ? settings.petBehavior.home.anchor
        : defaultSettings.petBehavior.home.anchor
    }
  },
  desktopChat: {
    ...defaultSettings.desktopChat,
    ...(isPlainObject(settings.desktopChat) ? settings.desktopChat : {}),
    bounds: isPlainObject(settings.desktopChat?.bounds)
      ? settings.desktopChat.bounds
      : defaultSettings.desktopChat.bounds,
    hasUserBounds: Boolean(settings.desktopChat?.hasUserBounds),
    alwaysOnTop: settings.desktopChat?.alwaysOnTop !== false
  },
  petBubbleChat: {
    ...defaultSettings.petBubbleChat,
    ...(isPlainObject(settings.petBubbleChat) ? settings.petBubbleChat : {}),
    enabled: settings.petBubbleChat?.enabled !== false,
    autoPopup: settings.petBubbleChat?.autoPopup !== false,
    autoHide: settings.petBubbleChat?.autoHide !== false,
    pinOnInteraction: settings.petBubbleChat?.pinOnInteraction !== false
  },
  models: {
    ...defaultSettings.models,
    ...(isPlainObject(settings.models) ? settings.models : {}),
    imageGeneration: mergeImageGenerationSettings(settings.models?.imageGeneration)
  },
  plugins: {
    ...defaultSettings.plugins,
    ...(settings.plugins || {}),
    enabled: {
      ...defaultSettings.plugins.enabled,
      ...(settings.plugins?.enabled || {})
    },
    config: {
      ...defaultSettings.plugins.config,
      ...(settings.plugins?.config || {})
    },
    storage: {
      ...defaultSettings.plugins.storage,
      ...(settings.plugins?.storage || {})
    },
    logs: Array.isArray(settings.plugins?.logs) ? settings.plugins.logs : defaultSettings.plugins.logs
  },
  petPacks: {
    ...defaultSettings.petPacks,
    ...(isPlainObject(settings.petPacks) ? settings.petPacks : {}),
    installed: isPlainObject(settings.petPacks?.installed)
      ? settings.petPacks.installed
      : defaultSettings.petPacks.installed
  },
  ecosystem: {
    ...defaultSettings.ecosystem,
    ...(isPlainObject(settings.ecosystem) ? settings.ecosystem : {}),
    blocklist: {
      ...defaultSettings.ecosystem.blocklist,
      ...(isPlainObject(settings.ecosystem?.blocklist) ? settings.ecosystem.blocklist : {}),
      pluginIds: Array.isArray(settings.ecosystem?.blocklist?.pluginIds) ? settings.ecosystem.blocklist.pluginIds : defaultSettings.ecosystem.blocklist.pluginIds,
      packIds: Array.isArray(settings.ecosystem?.blocklist?.packIds) ? settings.ecosystem.blocklist.packIds : defaultSettings.ecosystem.blocklist.packIds,
      sha256: Array.isArray(settings.ecosystem?.blocklist?.sha256) ? settings.ecosystem.blocklist.sha256 : defaultSettings.ecosystem.blocklist.sha256
    }
  },
  localHttp: {
    ...defaultSettings.localHttp,
    ...(settings.localHttp || {}),
    logs: Array.isArray(settings.localHttp?.logs) ? settings.localHttp.logs : defaultSettings.localHttp.logs
  }
})

const syncLoginItemSettings = (autoStart) => {
  // macOS 开发态 Electron 未打包成 .app 时设置登录项会报权限错误；打包后再同步系统设置。
  if (process.platform === 'darwin' && !app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: autoStart })
}

const readSettingsFile = (filePath) => {
  const settings = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  if (!isPlainObject(settings)) throw new TypeError('OpenPet settings file must contain an object')
  return settings
}

/**
 * 从磁盘读取设置，与默认值合并后返回。
 * 主文件损坏时尝试最后一次有效备份；仅当两者均不可用时回退默认值。
 */
const loadSettings = () => {
  const primaryExists = fs.existsSync(settingsPath)
  const backupExists = fs.existsSync(settingsBackupPath)

  if (primaryExists) {
    try {
      return mergeSettings(readSettingsFile(settingsPath))
    } catch (_) {
      console.warn('OpenPet settings primary file could not be read; attempting backup')
    }
  }

  if (backupExists) {
    try {
      return mergeSettings(readSettingsFile(settingsBackupPath))
    } catch (_) {
      console.warn('OpenPet settings backup file could not be read')
    }
  }

  if (primaryExists || backupExists) {
    console.error('OpenPet settings recovery failed; using defaults')
  }
  return mergeSettings()
}

/**
 * 将设置写入磁盘。
 */
const saveSettings = (settings) => {
  if (fs.existsSync(settingsPath)) {
    try {
      const previousSettings = readSettingsFile(settingsPath)
      writeJsonAtomic(settingsBackupPath, previousSettings)
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof TypeError) {
        console.warn('OpenPet settings primary file is invalid; preserving existing backup')
      } else {
        throw error
      }
    }
  }
  writeJsonAtomic(settingsPath, settings)
}

module.exports = { settingsPath, settingsBackupPath, defaultSettings, mergeSettings, loadSettings, saveSettings, syncLoginItemSettings }
