const { contextBridge, ipcRenderer } = require('electron')

// 预加载脚本运行在隔离上下文里，是渲染进程访问主进程能力的唯一入口。
// 页面本身不能直接 require Node 模块；只暴露 petAPI 可以减少误用文件系统或系统能力的风险。
contextBridge.exposeInMainWorld('petAPI', {
  // 获取自动发现的动作列表、默认动作和点击动作。
  getAnimations: () => ipcRenderer.invoke('pet:get-animations'),

  // 获取当前窗口边界，用于拖拽开始时计算鼠标偏移。
  getBounds: () => ipcRenderer.invoke('pet:get-bounds'),

  // 获取窗口是否贴近左右屏幕边界，用于散步启动时选择安全方向。
  getMovementState: () => ipcRenderer.invoke('pet:get-movement-state'),

  // 拖拽时直接发送目标位置；主进程会负责限制到屏幕工作区。
  setPosition: (point) => ipcRenderer.send('pet:set-position', point),

  // 散步时按增量移动窗口，并等待主进程返回是否撞到边界。
  moveBy: (delta) => ipcRenderer.invoke('pet:move-by', delta),

  // 退出应用。
  quit: () => ipcRenderer.send('pet:quit'),

  // 打开设置窗口。
  openSettings: () => ipcRenderer.send('settings:open'),

  // 监听主进程推送的设置变更。
  onSettingsChanged: (callback) => {
    ipcRenderer.on('settings:changed', (_event, settings) => callback(settings))
  }
})
