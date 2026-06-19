/**
 * 窗口管理模块 —— 宠物窗口和设置窗口的创建与缩放。
 */
const path = require('path')
const electron = require('electron')

const projectRoot = path.join(__dirname, '..', '..')
const BASE_WIDTH = 300
const BASE_HEIGHT = 300
const PET_BASE_SCALE = 0.5
const CONTROL_CENTER_WIDTH = 900
const CONTROL_CENTER_HEIGHT = 640
const RESIZE_ANCHOR = Symbol('openpet.resizeAnchor')

const toFiniteNumber = (value, fallback) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
)

const isValidWindowSize = (bounds) => (
  Number.isFinite(bounds?.width) && Number.isFinite(bounds?.height) && bounds.width > 0 && bounds.height > 0
)

const normalizeViewportSize = (viewport = {}) => {
  const scale = Math.max(toFiniteNumber(viewport.scale, 1), Number.EPSILON)
  const padding = Math.max(0, Math.round(toFiniteNumber(viewport.padding, 0)))
  const topInset = Math.max(0, Math.round(toFiniteNumber(viewport.topInset, 0)))
  const sourceWidth = toFiniteNumber(viewport.width, BASE_WIDTH)
  const sourceHeight = toFiniteNumber(viewport.height, BASE_HEIGHT)
  return {
    width: Math.max(1, Math.round((sourceWidth + padding * 2) * scale)),
    height: Math.max(1, Math.round((sourceHeight + padding * 2) * scale) + topInset)
  }
}

const boundsEqual = (left, right) => (
  left?.x === right?.x &&
  left?.y === right?.y &&
  left?.width === right?.width &&
  left?.height === right?.height
)

const getResizeAnchor = (petWindow, bounds) => {
  const existing = petWindow[RESIZE_ANCHOR]
  if (existing && boundsEqual(bounds, existing.lastAppliedBounds)) return existing
  return {
    centerX: bounds.x + bounds.width / 2,
    bottomY: bounds.y + bounds.height,
    lastAppliedBounds: bounds
  }
}

const resizeWindowAroundBottomCenter = (petWindow, targetWidth, targetHeight) => {
  const bounds = petWindow.getBounds()
  if (!isValidWindowSize(bounds)) {
    const [fallbackX, fallbackY] = typeof petWindow.getPosition === 'function' ? petWindow.getPosition() : [0, 0]
    const nextBounds = {
      x: toFiniteNumber(bounds?.x, fallbackX),
      y: toFiniteNumber(bounds?.y, fallbackY),
      width: targetWidth,
      height: targetHeight
    }
    petWindow[RESIZE_ANCHOR] = {
      centerX: nextBounds.x + targetWidth / 2,
      bottomY: nextBounds.y + targetHeight,
      lastAppliedBounds: nextBounds
    }
    petWindow.setBounds(nextBounds)
    return
  }
  const anchor = getResizeAnchor(petWindow, bounds)
  if (targetWidth === bounds.width && targetHeight === bounds.height) return
  const nextBounds = {
    x: Math.round(anchor.centerX - targetWidth / 2),
    y: Math.round(anchor.bottomY - targetHeight),
    width: targetWidth,
    height: targetHeight
  }
  petWindow[RESIZE_ANCHOR] = { ...anchor, lastAppliedBounds: nextBounds }
  petWindow.setBounds(nextBounds)
}

const applyWindowScale = (petWindow, scale) => {
  if (!petWindow || petWindow.isDestroyed()) return
  const safeScale = Math.max(toFiniteNumber(scale, 1) * PET_BASE_SCALE, Number.EPSILON)
  const targetWidth = Math.round(BASE_WIDTH * safeScale)
  const targetHeight = Math.round(BASE_HEIGHT * safeScale)
  resizeWindowAroundBottomCenter(petWindow, targetWidth, targetHeight)
}

const applyPetViewport = (petWindow, viewport) => {
  if (!petWindow || petWindow.isDestroyed()) return
  const { width, height } = normalizeViewportSize(viewport)
  resizeWindowAroundBottomCenter(petWindow, width, height)
}

const loadPetWindow = (petWindow) => petWindow.loadFile(path.join(projectRoot, 'index.html'))

const createWindow = ({ load = true, BrowserWindow = electron.BrowserWindow, screen = electron.screen } = {}) => {
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
  if (load) loadPetWindow(petWindow)

  return petWindow
}

const createSettingsWindow = (petWindow, { BrowserWindow = electron.BrowserWindow, screen = electron.screen } = {}) => {
  if (petWindow.settingsWindow && !petWindow.settingsWindow.isDestroyed()) {
    petWindow.settingsWindow.focus()
    return
  }

  const settingsWindow = new BrowserWindow({
    width: CONTROL_CENTER_WIDTH,
    height: CONTROL_CENTER_HEIGHT,
    minWidth: 760,
    minHeight: 560,
    resizable: true,
    frame: true,
    transparent: false,
    alwaysOnTop: false,
    backgroundColor: '#f5f5f5',
    hasShadow: true,
    title: 'OpenPet Control Center',
    webPreferences: {
      preload: path.join(projectRoot, 'control-center-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const petBounds = petWindow.getBounds()
  const [petX, petY] = petWindow.getPosition()
  const display = screen.getDisplayMatching(petBounds)
  const { workArea } = display
  let settingsX = petX + petBounds.width + 12
  if (settingsX + CONTROL_CENTER_WIDTH > workArea.x + workArea.width) {
    settingsX = petX - CONTROL_CENTER_WIDTH - 12
  }
  const maxSettingsX = Math.max(workArea.x, workArea.x + workArea.width - CONTROL_CENTER_WIDTH)
  settingsX = Math.min(Math.max(settingsX, workArea.x), maxSettingsX)
  const maxSettingsY = Math.max(workArea.y, workArea.y + workArea.height - CONTROL_CENTER_HEIGHT)
  const settingsY = Math.min(
    Math.max(petY, workArea.y),
    maxSettingsY
  )
  settingsWindow.setPosition(Math.round(settingsX), Math.round(settingsY))
  settingsWindow.loadFile(path.join(projectRoot, 'dist', 'control-center', 'index.html')).catch((error) => {
    settingsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><title>OpenPet Control Center</title><body style="font-family: system-ui; padding: 24px;"><h1>Control Center build missing</h1><p>${error.message}</p></body>`)}`)
  })

  petWindow.settingsWindow = settingsWindow
}

module.exports = { BASE_WIDTH, BASE_HEIGHT, PET_BASE_SCALE, applyPetViewport, applyWindowScale, createWindow, createSettingsWindow, loadPetWindow }
