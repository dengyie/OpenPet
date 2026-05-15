/**
 * 窗口管理模块 —— 宠物窗口和设置窗口的创建与缩放。
 */
const { BrowserWindow, screen } = require('electron')
const path = require('path')

const projectRoot = path.join(__dirname, '..', '..')
const BASE_WIDTH = 300
const BASE_HEIGHT = 300

const applyWindowScale = (petWindow, scale) => {
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

const createWindow = () => {
  const petWindow = new BrowserWindow({
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
      preload: path.join(projectRoot, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const { workArea } = screen.getPrimaryDisplay()
  petWindow.setPosition(
    workArea.x + workArea.width - BASE_WIDTH - 40,
    workArea.y + workArea.height - BASE_HEIGHT - 40
  )
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWindow.loadFile('index.html')

  return petWindow
}

const createSettingsWindow = (petWindow) => {
  if (petWindow.settingsWindow && !petWindow.settingsWindow.isDestroyed()) {
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
      preload: path.join(projectRoot, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const petBounds = petWindow.getBounds()
  const [petX, petY] = petWindow.getPosition()
  const display = screen.getDisplayMatching(petBounds)
  const { workArea } = display
  let settingsX = petX + petBounds.width + 12
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

module.exports = { BASE_WIDTH, BASE_HEIGHT, applyWindowScale, createWindow, createSettingsWindow }
