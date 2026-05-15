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

// 设置保存在 Electron 用户数据目录，卸载重装后仍然保留。
const settingsPath = path.join(app.getPath('userData'), 'settings.json')

// 所有可配置项的默认值。新增设置项时只需在此处添加。
const defaultSettings = {
  scale: 1.0,            // 宠物缩放比例（1.0 = 100%）
  walkSpeed: 2,          // 散步速度（px/frame，可选 1/2/3）
  walkDuration: 15000,   // 散步自动停止时长（ms）
  bubbleDuration: 1300,  // 气泡显示时长（ms）
  autoStart: false       // 是否开机自启
}

/**
 * 从磁盘读取设置，与默认值合并后返回。
 * 文件不存在或损坏时静默回退到默认值，不阻塞启动。
 */
const loadSettings = () => {
  try {
    if (fs.existsSync(settingsPath)) {
      return { ...defaultSettings, ...JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) }
    }
  } catch (_) { /* 文件损坏时回退到默认值 */ }
  return { ...defaultSettings }
}

/**
 * 将设置写入磁盘，并同步 macOS 登录项状态。
 */
const saveSettings = (settings) => {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  app.setLoginItemSettings({ openAtLogin: settings.autoStart })
}

module.exports = { settingsPath, defaultSettings, loadSettings, saveSettings }
