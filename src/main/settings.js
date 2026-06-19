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
const { createDefaultCursorSettings, normalizeCustomCursor } = require('./services/cursor-asset-service')

// 设置保存在 Electron 用户数据目录，卸载重装后仍然保留。
const settingsPath = path.join(app.getPath('userData'), 'settings.json')

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

// 所有可配置项的默认值。新增设置项时只需在此处添加。
const defaultSettings = {
  scale: 1.0,            // 宠物缩放比例（1.0 = 100%）
  walkSpeed: 2,          // 散步速度（px/frame，可选 1/2/3）
  walkDuration: 15000,   // 散步自动停止时长（ms）
  bubbleDuration: 1300,  // 气泡显示时长（ms）
  autoStart: false,      // 是否开机自启
  customCursor: createDefaultCursorSettings(),
  petBehavior: {
    grounded: false,
    home: {
      enabled: false,
      radius: 'medium',
      anchor: null
    }
  },
  customCursor: createDefaultCursorSettings(),
  ai: {
    enabled: false,
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKeyRef: 'ai.default',
    systemPrompt: 'You are a friendly desktop pet companion.',
    behavior: {
      enabled: false,
      useTools: true,
      cooldownMs: 1500,
      rules: [],
      decisions: []
    },
    conversations: {}
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
    conversations: isPlainObject(settings.ai?.conversations)
      ? settings.ai.conversations
      : defaultSettings.ai.conversations
  },
  customCursor: normalizeCustomCursor(settings.customCursor),
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
  customCursor: normalizeCustomCursor(settings.customCursor),
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

/**
 * 从磁盘读取设置，与默认值合并后返回。
 * 文件不存在或损坏时静默回退到默认值，不阻塞启动。
 */
const loadSettings = () => {
  try {
    if (fs.existsSync(settingsPath)) {
      return mergeSettings(JSON.parse(fs.readFileSync(settingsPath, 'utf-8')))
    }
  } catch (_) { /* 文件损坏时回退到默认值 */ }
  return mergeSettings()
}

/**
 * 将设置写入磁盘。
 */
const saveSettings = (settings) => {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

module.exports = { settingsPath, defaultSettings, mergeSettings, loadSettings, saveSettings, syncLoginItemSettings }
