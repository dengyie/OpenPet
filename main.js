const { app, BrowserWindow, ipcMain, screen } = require('electron')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

let petWindow
const framesRoot = path.join(__dirname, 'cat_anime', 'flames')

const actionLabels = {
  idle: '待机',
  bai: '待机',
  bai_no_bg: '待机',
  eat: '喂食',
  eat_no_bg: '喂食'
}

const isImageFile = (fileName) => /\.(png|jpe?g|webp|gif)$/i.test(fileName)

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const paethPredictor = (left, up, upLeft) => {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left
  if (upDistance <= upLeftDistance) return up
  return upLeft
}

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

const compareFrameName = (left, right) => {
  const leftNumber = Number(left.match(/\d+/)?.[0] || 0)
  const rightNumber = Number(right.match(/\d+/)?.[0] || 0)

  return leftNumber === rightNumber
    ? left.localeCompare(right)
    : leftNumber - rightNumber
}

const toActionLabel = (folderName) => {
  if (actionLabels[folderName]) return actionLabels[folderName]

  return folderName
    .replace(/_?no_?bg$/i, '')
    .replace(/[-_]+/g, ' ')
}

const isLoopAction = (folderName) => /(^idle$|bai|stand|walk|loop)/i.test(folderName)

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

const clampToWorkArea = (win, x, y) => {
  const bounds = win.getBounds()
  const display = screen.getDisplayMatching({ x, y, width: bounds.width, height: bounds.height })
  const { workArea } = display

  return {
    x: Math.min(Math.max(Math.round(x), workArea.x), workArea.x + workArea.width - bounds.width),
    y: Math.min(Math.max(Math.round(y), workArea.y), workArea.y + workArea.height - bounds.height)
  }
}

const createWindow = () => {
  petWindow = new BrowserWindow({
    width: 260,
    height: 260,
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

  const { workArea } = screen.getPrimaryDisplay()
  petWindow.setPosition(
    workArea.x + workArea.width - 300,
    workArea.y + workArea.height - 300
  )
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWindow.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('pet:get-animations', () => getPetAnimations())

ipcMain.handle('pet:get-bounds', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win.getBounds()
})

ipcMain.on('pet:set-position', (event, point) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !point) return

  const next = clampToWorkArea(win, point.x, point.y)
  win.setPosition(next.x, next.y)
})

ipcMain.on('pet:move-by', (event, delta) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !delta) return

  const [x, y] = win.getPosition()
  const next = clampToWorkArea(win, x + delta.x, y + delta.y)
  win.setPosition(next.x, next.y)
})

ipcMain.on('pet:quit', () => {
  app.quit()
})
