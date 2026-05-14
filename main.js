const { app, BrowserWindow, ipcMain, screen } = require('electron')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// 保留窗口引用，避免 BrowserWindow 被 JavaScript 垃圾回收后窗口意外关闭。
let petWindow

// 动作资源根目录。每个子文件夹代表一个动作，文件夹内图片代表逐帧动画。
const framesRoot = path.join(__dirname, 'cat_anime', 'flames')

// 对部分常见动作文件夹提供中文展示名；没有写在这里的动作会根据文件夹名自动生成标签。
const actionLabels = {
  idle: '待机',
  bai: '待机',
  bai_no_bg: '待机',
  eat: '喂食',
  eat_no_bg: '喂食'
}

const isImageFile = (fileName) => /\.(png|jpe?g|webp|gif)$/i.test(fileName)

// PNG 文件固定签名，用来快速排除非 PNG 或损坏文件。
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// PNG Paeth 滤波器的预测函数。PNG 解码时需要用它还原经过压缩前的原始像素。
const paethPredictor = (left, up, upLeft) => {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left
  if (upDistance <= upLeftDistance) return up
  return upLeft
}

// 还原 PNG 单行扫描线。
// PNG 的 IDAT 数据不是直接存储像素值，每一行都可能使用不同滤波方式压缩像素差值。
// 这里根据 filter 类型把当前行恢复成真实 RGBA / 灰度 alpha 字节，方便检查透明通道。
const unfilterPngScanline = (filter, current, previous, bytesPerPixel) => {
  for (let index = 0; index < current.length; index += 1) {
    const left = index >= bytesPerPixel ? current[index - bytesPerPixel] : 0
    const up = previous ? previous[index] : 0
    const upLeft = previous && index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0

    if (filter === 1) {
      current[index] = (current[index] + left) & 0xff
    } else if (filter === 2) {
      current[index] = (current[index] + up) & 0xff
    } else if (filter === 3) {
      current[index] = (current[index] + Math.floor((left + up) / 2)) & 0xff
    } else if (filter === 4) {
      current[index] = (current[index] + paethPredictor(left, up, upLeft)) & 0xff
    }
  }
}

// 判断动作文件夹的第一张图片是否符合“透明背景动作”的要求。
// 为了避免引入额外依赖，这里只解析项目生成的常见 8-bit PNG：
// - colorType 6: RGBA
// - colorType 4: 灰度 + alpha
// 只要首帧存在任意 alpha < 255 的像素，就认为该组图片带透明背景，可以作为动作。
const hasTransparentFirstFrame = (filePath) => {
  if (!/\.png$/i.test(filePath)) return false

  try {
    const file = fs.readFileSync(filePath)
    if (file.length < 33 || !file.subarray(0, 8).equals(pngSignature)) return false

    let offset = 8
    let width = 0
    let height = 0
    let bitDepth = 0
    let colorType = 0
    const imageDataChunks = []

    while (offset + 12 <= file.length) {
      const length = file.readUInt32BE(offset)
      const type = file.toString('ascii', offset + 4, offset + 8)
      const dataStart = offset + 8
      const dataEnd = dataStart + length
      if (dataEnd + 4 > file.length) return false

      if (type === 'IHDR') {
        width = file.readUInt32BE(dataStart)
        height = file.readUInt32BE(dataStart + 4)
        bitDepth = file[dataStart + 8]
        colorType = file[dataStart + 9]
      } else if (type === 'IDAT') {
        imageDataChunks.push(file.subarray(dataStart, dataEnd))
      } else if (type === 'IEND') {
        break
      }

      offset = dataEnd + 4
    }

    // The generated transparent action frames are 8-bit PNGs with an alpha channel.
    if (!width || !height || bitDepth !== 8 || ![4, 6].includes(colorType)) return false

    const channels = colorType === 6 ? 4 : 2
    const bytesPerPixel = channels
    const rowLength = width * channels
    const raw = zlib.inflateSync(Buffer.concat(imageDataChunks))
    let rawOffset = 0
    let previous

    for (let row = 0; row < height; row += 1) {
      const filter = raw[rawOffset]
      rawOffset += 1
      const current = Buffer.from(raw.subarray(rawOffset, rawOffset + rowLength))
      rawOffset += rowLength

      if (filter > 4 || current.length !== rowLength) return false
      unfilterPngScanline(filter, current, previous, bytesPerPixel)

      for (let pixel = channels - 1; pixel < current.length; pixel += channels) {
        if (current[pixel] < 255) return true
      }

      previous = current
    }
  } catch (error) {
    return false
  }

  return false
}

// 按文件名里的第一个数字排序，保证 01.png、02.png、10.png 这类帧顺序正确。
// 如果数字相同，再用字符串排序，确保排序结果稳定。
const compareFrameName = (left, right) => {
  const leftNumber = Number(left.match(/\d+/)?.[0] || 0)
  const rightNumber = Number(right.match(/\d+/)?.[0] || 0)

  return leftNumber === rightNumber
    ? left.localeCompare(right)
    : leftNumber - rightNumber
}

// 把动作文件夹名转换为菜单展示文案。
// 例如 eat_no_bg 会优先命中 actionLabels；未知动作会去掉 no_bg 后把下划线转为空格。
const toActionLabel = (folderName) => {
  if (actionLabels[folderName]) return actionLabels[folderName]

  return folderName
    .replace(/_?no_?bg$/i, '')
    .replace(/[-_]+/g, ' ')
}

// 判断动作是否需要循环播放。待机、站立、散步类动作通常是循环动作。
const isLoopAction = (folderName) => /(^idle$|bai|stand|walk|loop)/i.test(folderName)

// 设置持久化：保存在 Electron 用户数据目录，应用重启后仍然保留。
const settingsPath = path.join(app.getPath('userData'), 'settings.json')

const defaultSettings = {
  scale: 1.0,
  walkSpeed: 2,
  // 散步自动停止时长（毫秒）。小猫每次散步会在该时长后自动停下，避免一直走动。
  // 默认 15000ms = 15 秒，用户可在设置面板中自定义。
  walkDuration: 15000,
  bubbleDuration: 1300,
  autoStart: false
}

const loadSettings = () => {
  try {
    if (fs.existsSync(settingsPath)) {
      return { ...defaultSettings, ...JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) }
    }
  } catch (_) { /* 文件损坏时回退到默认值 */ }
  return { ...defaultSettings }
}

const saveSettings = (settings) => {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  app.setLoginItemSettings({ openAtLogin: settings.autoStart })
}

// 创建设置面板窗口。
// 不设置 parent，避免宠物窗口缩放时 macOS 把设置窗口一并移动。
const createSettingsWindow = () => {
  if (petWindow && petWindow.settingsWindow && !petWindow.settingsWindow.isDestroyed()) {
    petWindow.settingsWindow.focus()
    return
  }

  const settingsWindow = new BrowserWindow({
    width: 280,
    height: 390,
    minWidth: 260,
    minHeight: 350,
    resizable: true,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    backgroundColor: '#f5f5f5',
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 设置窗口默认放在宠物窗口右侧，避免挡住小猫。
  const petBounds = petWindow.getBounds()
  const [petX, petY] = petWindow.getPosition()
  const display = screen.getDisplayMatching(petBounds)
  const { workArea } = display
  let settingsX = petX + petBounds.width + 12
  // 如果右侧空间不够，就放到宠物窗口左侧。
  if (settingsX + 280 > workArea.x + workArea.width) {
    settingsX = petX - 292
  }
  const settingsY = Math.min(
    Math.max(petY, workArea.y),
    workArea.y + workArea.height - 390
  )
  settingsWindow.setPosition(Math.round(settingsX), Math.round(settingsY))
  settingsWindow.loadFile('settings.html')
  settingsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  petWindow.settingsWindow = settingsWindow
}

// 扫描 cat_anime/flames 下的动作文件夹，并生成渲染进程需要的动作配置。
// 重要规则：
// 1. 每个子文件夹自动成为候选动作，不需要为新增动作改代码。
// 2. 文件夹内图片按数字顺序播放。
// 3. 只有首帧为透明 PNG 的图片组才会被纳入动作列表。
const getPetAnimations = () => {
  if (!fs.existsSync(framesRoot)) {
    return { defaultAction: '', clickAction: '', actions: [] }
  }

  // 每个子文件夹就是一个动作；文件夹内图片按数字顺序作为逐帧动画播放。
  const actions = fs.readdirSync(framesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const folder = path.join(framesRoot, entry.name)
      const frameFiles = fs.readdirSync(folder)
        .filter(isImageFile)
        .sort(compareFrameName)

      if (!frameFiles.length || !hasTransparentFirstFrame(path.join(folder, frameFiles[0]))) {
        return null
      }

      const frames = frameFiles
        .map((fileName) => path.posix.join('cat_anime', 'flames', entry.name, fileName))

      return {
        id: entry.name,
        label: toActionLabel(entry.name),
        frames,
        frameMs: /eat/i.test(entry.name) ? 85 : 95,
        loop: isLoopAction(entry.name)
      }
    })
    .filter(Boolean)

  const defaultAction = actions.find((action) => /^idle$/i.test(action.id))?.id
    || actions.find((action) => /bai/i.test(action.id))?.id
    || actions[0]?.id
    || ''
  const clickAction = actions.find((action) => /eat/i.test(action.id))?.id
    || actions.find((action) => action.id !== defaultAction)?.id
    || defaultAction

  return { defaultAction, clickAction, actions }
}

// 把窗口坐标限制在当前屏幕工作区内，避免无边框透明窗口被拖出可见范围。
// 返回值里的 hitX / hitY 用于告诉渲染进程是否撞到边界，散步时据此掉头。
const clampToWorkArea = (win, x, y) => {
  const bounds = win.getBounds()
  const display = screen.getDisplayMatching({ x, y, width: bounds.width, height: bounds.height })
  const { workArea } = display
  const minX = workArea.x
  const maxX = workArea.x + workArea.width - bounds.width
  const minY = workArea.y
  const maxY = workArea.y + workArea.height - bounds.height

  return {
    x: Math.min(Math.max(Math.round(x), minX), maxX),
    y: Math.min(Math.max(Math.round(y), minY), maxY),
    hitX: x <= minX || x >= maxX,
    hitY: y <= minY || y >= maxY
  }
}

// 获取窗口当前在水平方向上的边界状态。
// 散步刚启动时会用它判断应该先往屏幕内侧走，避免小猫从右下角出发时短暂消失。
const getMovementState = (win) => {
  const bounds = win.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const { workArea } = display
  const maxX = workArea.x + workArea.width - bounds.width

  return {
    x: bounds.x,
    atLeft: bounds.x <= workArea.x,
    atRight: bounds.x >= maxX
  }
}

// 窗口基础尺寸，缩放时以此为基准等比例调整。
const BASE_WIDTH = 300
const BASE_HEIGHT = 300

// 根据缩放比例调整宠物窗口大小。
// 缩小时只通过 CSS 缩放猫咪图片，窗口保持基础尺寸不变，保证菜单等交互区域始终可用。
// 放大时同步扩窗，防止猫咪图片溢出窗口被裁剪。
const applyWindowScale = (scale) => {
  if (!petWindow || petWindow.isDestroyed()) return
  const targetWidth = Math.round(BASE_WIDTH * Math.max(scale, 1))
  const targetHeight = Math.round(BASE_HEIGHT * Math.max(scale, 1))
  const bounds = petWindow.getBounds()
  if (targetWidth === bounds.width && targetHeight === bounds.height) return
  const [x, y] = petWindow.getPosition()
  const deltaW = targetWidth - bounds.width
  const deltaH = targetHeight - bounds.height
  petWindow.setBounds({
    x: x - Math.round(deltaW / 2),
    y: y - deltaH,
    width: targetWidth,
    height: targetHeight
  })
}

// 创建桌面宠物窗口。
// 这个窗口没有边框、透明、置顶、不出现在任务栏，视觉上就像小猫直接站在桌面上。
const createWindow = () => {
  petWindow = new BrowserWindow({
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 初始放在主屏幕右下角附近，保留一点边距避免贴住屏幕边缘。
  const { workArea } = screen.getPrimaryDisplay()
  petWindow.setPosition(
    workArea.x + workArea.width - BASE_WIDTH - 40,
    workArea.y + workArea.height - BASE_HEIGHT - 40
  )
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWindow.loadFile('index.html')

  petWindow.webContents.on('did-finish-load', () => {
    const settings = loadSettings()
    applyWindowScale(settings.scale)
    petWindow.webContents.send('settings:changed', settings)
  })
}

// 单实例锁：仅允许一个应用实例运行。
// 新启动的实例会触发 second-instance 事件后退出，防止多个桌面宠物同时运行。
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

// Electron 初始化完成后才能创建 BrowserWindow。
app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: loadSettings().autoStart })
  createWindow()

  // macOS 上点击 Dock 图标时，如果窗口都关闭了，需要重新创建窗口。
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 关闭所有窗口时直接退出应用。
app.on('window-all-closed', () => {
  app.quit()
})

// 渲染进程请求动作列表时，主进程负责访问文件系统并返回安全的相对图片路径。
ipcMain.handle('pet:get-animations', () => getPetAnimations())

// 返回窗口位置和尺寸，用于拖拽开始时计算鼠标相对窗口的偏移量。
ipcMain.handle('pet:get-bounds', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win.getBounds()
})

// 返回窗口是否贴近左右边界，用于散步启动方向判断。
ipcMain.handle('pet:get-movement-state', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null

  return getMovementState(win)
})

// 拖拽时设置窗口位置。主进程会先夹紧到工作区，防止拖到屏幕外。
ipcMain.on('pet:set-position', (event, point) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !point) return

  const next = clampToWorkArea(win, point.x, point.y)
  win.setPosition(next.x, next.y)
})

// 散步时按增量移动窗口，并把边界碰撞结果返回给渲染进程。
ipcMain.handle('pet:move-by', (event, delta) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !delta) return null

  const [x, y] = win.getPosition()
  const next = clampToWorkArea(win, x + delta.x, y + delta.y)
  win.setPosition(next.x, next.y)
  return next
})

// 菜单点击”退出”时关闭应用。
ipcMain.on('pet:quit', () => {
  app.quit()
})

// 打开设置窗口。
ipcMain.on('settings:open', () => {
  createSettingsWindow()
})

// 返回当前保存的设置。
ipcMain.handle('settings:get', () => loadSettings())

// 保存设置并通知宠物窗口应用变更。
ipcMain.handle('settings:save', (_event, settings) => {
  saveSettings(settings)
  if (petWindow && !petWindow.isDestroyed()) {
    applyWindowScale(settings.scale)
    petWindow.webContents.send('settings:changed', settings)
  }
})

// 实时预览缩放：设置窗口滑块拖动时通知宠物窗口。
ipcMain.on('settings:preview-scale', (_event, scale) => {
  if (petWindow && !petWindow.isDestroyed()) {
    applyWindowScale(scale)
    petWindow.webContents.send('settings:changed', { scale })
  }
})

// 关闭设置窗口。
ipcMain.on('settings:close', (_event) => {
  const win = BrowserWindow.fromWebContents(_event.sender)
  if (win) {
    if (petWindow && petWindow.settingsWindow === win) {
      petWindow.settingsWindow = null
    }
    win.close()
  }
})
