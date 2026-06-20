/**
 * OpenPet 渲染进程 — 桌面小猫的动画、交互与行为逻辑。
 *
 * 为什么是单文件：
 * Electron 沙盒环境下，preload 脚本的 require 路径解析受限，
 * <script type="module"> 在 file:// 协议下有 CORS 问题。
 * 因此所有渲染逻辑内联在此文件中，按依赖顺序组织。
 *
 * 内部模块顺序：DOM & 状态 → 气泡 → 动画 → 散步 → 拖拽 → 右键菜单 → 入口
 */

// ═══════════════════════════════════════════
// 1. DOM 引用 & 全局状态
// ═══════════════════════════════════════════

const pet = document.getElementById('pet')       // 主容器，承载所有指针事件
const catEl = document.getElementById('cat')     // 小猫元素，精灵图渲染目标
const bubble = document.getElementById('bubble') // 头顶气泡
const cursorOverlay = document.getElementById('custom-cursor-overlay') || {
  style: {},
  classList: { add() {}, remove() {}, contains() { return false } },
  removeAttribute() {},
  src: ''
}
const MAX_DISPLAY_SIZE = 260                     // 帧显示最大尺寸（px），超出按比例缩小
const PET_BASE_SCALE = 0.5                       // UI 100% 对应旧版视觉大小的 50%
const cursorStyle = {
  resolvePetCursorStyle: () => '',
  resolvePetCursorOverlayState: () => ({ visible: false, assetUrl: '', nativeCursor: '' }),
  ...(window.OpenPetCursorStyle || {})
}
const petHitbox = window.OpenPetHitbox || {
  getFrameHitbox: () => null,
  getWindowHitbox: ({ windowWidth, windowHeight }) => ({
    left: 0,
    top: 0,
    right: Math.max(0, Number(windowWidth) || 0),
    bottom: Math.max(0, Number(windowHeight) || 0)
  }),
  getViewportHitbox: () => null,
  isPointInHitbox: (point, hitbox) => {
    if (!hitbox) return true
    return point.x >= hitbox.left && point.x <= hitbox.right && point.y >= hitbox.top && point.y <= hitbox.bottom
  }
}

const state = {
  // ── 动画 ──
  action: '',            // 当前播放的动作 id
  defaultAction: '',     // 待机动作 id（循环播放）
  clickAction: '',       // 点击触发的一次性动作 id
  animations: {},        // 动作查找表 { id → { sprite, frameCount, frameMs, … } }
  frameIndex: 0,         // 当前帧序号
  frameTimer: 0,         // setInterval id，用于播放帧

  // ── 散步 ──
  walking: false,        // 是否正在移动
  walkDirection: -1,     // 水平方向：-1 左 / 1 右
  walkMoving: false,     // 并发锁，防止 IPC moveBy 请求堆积
  walkTimer: 0,          // setInterval id，每 40ms 触发 tickWalk
  walkSpeed: 2,          // 每次移动像素数（由设置同步）
  walkDuration: 15000,   // 自动停止时长 ms（由设置同步）
  walkDurationTimer: 0,  // setTimeout id，到期后自动结束散步

  // ── 拖拽 ──
  drag: null,            // { pointerId, offsetX, offsetY, moved } | null
  mousePassthrough: false,
  currentLayout: null,
  customCursor: { enabled: false, assetPath: '', assetUrl: '', fileName: '', hotspotX: 0, hotspotY: 0 },
  customCursorOverlayVisible: false,
  nativeCursor: '',
  lastPointerPoint: null,
  lastMouseDiagnostic: null,
  lastMouseDiagnosticAt: 0,

  // ── 气泡 ──
  bubbleTimer: 0,        // setTimeout id，到期后隐藏气泡
  bubbleDuration: 1300   // 气泡显示时长 ms（由设置同步）
}
state.scale = PET_BASE_SCALE

const roundNumber = (value) => Math.round((Number(value) || 0) * 100) / 100
const normalizePetScale = (scale) => Math.max((Number(scale) || 1) * PET_BASE_SCALE, Number.EPSILON)
const logPetEvent = (event, details = {}, { level = 'debug', actor = 'system', message = event } = {}) => {
  window.petAPI.recordAppLog?.({
    level,
    actor,
    event,
    message,
    details: {
      action: state.action,
      frameIndex: state.frameIndex,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      scale: state.scale,
      ...details
    }
  })
}

const createPointDetails = (event) => ({
  clientX: roundNumber(event.clientX),
  clientY: roundNumber(event.clientY),
  screenX: roundNumber(event.screenX),
  screenY: roundNumber(event.screenY)
})

const maybeLogMouseDiagnostic = (event, diagnostic) => {
  const now = Date.now()
  const previous = state.lastMouseDiagnostic
  const changed = !previous ||
    previous.insideFrame !== diagnostic.insideFrame ||
    previous.insideCursorRegion !== diagnostic.insideCursorRegion ||
    previous.passthrough !== diagnostic.passthrough ||
    previous.cursorApplied !== diagnostic.cursorApplied ||
    previous.cursorOverlayVisible !== diagnostic.cursorOverlayVisible ||
    previous.dragging !== diagnostic.dragging ||
    previous.menuOpen !== diagnostic.menuOpen
  if (!changed && now - state.lastMouseDiagnosticAt < 1000) return
  state.lastMouseDiagnosticAt = now
  state.lastMouseDiagnostic = diagnostic
  logPetEvent('pet.pointer.diagnostic', {
    ...createPointDetails(event),
    ...diagnostic
  }, { actor: 'user', message: 'Pointer hitbox diagnostic' })
}

// ═══════════════════════════════════════════
// 2. 气泡 — 在小猫头顶显示文字，定时消失
// ═══════════════════════════════════════════

/**
 * 显示气泡。重复调用时覆盖旧文本并重置计时器。
 * @param {string} text 显示的文本
 * @param {number} [duration] 显示时长 ms，默认取 state.bubbleDuration
 */
const say = (text, duration = state.bubbleDuration) => {
  window.clearTimeout(state.bubbleTimer)
  bubble.textContent = text
  bubble.classList.add('show')
  state.bubbleTimer = window.setTimeout(() => bubble.classList.remove('show'), duration)
}

// ═══════════════════════════════════════════
// 3. 动画引擎 — 精灵图 background-position 逐帧播放
// ═══════════════════════════════════════════

// 动画引擎内部状态，外部模块不感知
let frameStepX = 0  // 每帧的 background-position-x 偏移量（px）
let frameStepY = 0  // 每帧的 background-position-y 偏移量（px）
let frameColumn = 0 // 当前动作在 atlas 内的起始列
let frameRow = 0    // 当前动作在 atlas 内的行
let frameCount = 0  // 当前动作总帧数

/**
 * 根据原始帧尺寸计算实际 CSS 显示尺寸。
 * 确保宽度不超过 MAX_DISPLAY_SIZE，等比例缩放。
 */
const getDisplayDimensions = (animation) => {
  const s = Math.min(1, MAX_DISPLAY_SIZE / animation.frameWidth, MAX_DISPLAY_SIZE / animation.frameHeight)
  return { width: Math.round(animation.frameWidth * s), height: Math.round(animation.frameHeight * s), fitScale: s }
}

const getActionViewport = (animation, dims) => {
  const viewport = animation.viewport || { x: 0, y: 0, width: animation.frameWidth, height: animation.frameHeight, padding: 8 }
  const fitScale = dims.fitScale || 1
  const padding = Number(viewport.padding ?? 8)
  return {
    x: Math.round((Number(viewport.x) || 0) * fitScale),
    y: Math.round((Number(viewport.y) || 0) * fitScale),
    width: Math.max(1, Math.round((Number(viewport.width) || dims.width) * fitScale)),
    height: Math.max(1, Math.round((Number(viewport.height) || dims.height) * fitScale)),
    padding: Math.max(0, Math.round(padding * fitScale)),
    scale: state.scale
  }
}

const getScaledViewportSize = (viewport) => {
  const padding = Math.max(0, Number(viewport?.padding) || 0)
  const scale = Math.max(Number(viewport?.scale) || state.scale, Number.EPSILON)
  return {
    width: Math.max(1, Math.round(((Number(viewport?.width) || 1) + padding * 2) * scale)),
    height: Math.max(1, Math.round(((Number(viewport?.height) || 1) + padding * 2) * scale))
  }
}

const applyCatPositionForWindowWidth = (layout, windowWidth) => {
  if (!layout?.viewport || !layout?.dims) return
  const { viewport, dims } = layout
  const catLeft = Math.round((windowWidth / 2) - ((viewport.x + viewport.width / 2) * state.scale))
  const catBottom = Math.round((viewport.padding - (dims.height - viewport.y - viewport.height)) * state.scale)

  catEl.style.left = catLeft + 'px'
  catEl.style.bottom = catBottom + 'px'
  layout.catLeft = catLeft
  layout.catBottom = catBottom
}

const applyActionLayout = (animation, dims) => {
  const viewport = getActionViewport(animation, dims)
  state.currentLayout = { viewport, dims, catLeft: 0, catBottom: 0 }
  applyCatPositionForWindowWidth(state.currentLayout, getScaledViewportSize(viewport).width)
  window.petAPI.setViewport?.(viewport)
}

const applySpriteGeometry = (animation, dims) => {
  const scaledWidth = Math.max(1, Math.round(dims.width * state.scale))
  const scaledHeight = Math.max(1, Math.round(dims.height * state.scale))
  catEl.style.width = scaledWidth + 'px'
  catEl.style.height = scaledHeight + 'px'
  frameStepX = Math.round(animation.frameWidth * dims.fitScale * state.scale)
  frameStepY = Math.round(animation.frameHeight * dims.fitScale * state.scale)
  const atlasColumns = animation.atlas?.columns || animation.frameCount
  const atlasRows = animation.atlas?.rows || 1
  catEl.style.backgroundSize = `${Math.round(atlasColumns * frameStepX)}px ${Math.round(atlasRows * frameStepY)}px`
}

/**
 * 帧 tick：偏移 background-position-x 切换到下一帧。
 * 循环动作播完后从头开始；一次性动作播完后切回待机。
 */
const tickFrame = () => {
  state.frameIndex += 1
  if (state.frameIndex >= frameCount) {
    const a = state.animations[state.action]
    if (a?.loop) { state.frameIndex = 0 } else { setAction(state.defaultAction); return }
  }
  renderCurrentFrame()
  scheduleFrameTick()
}

const getFrameDuration = (animation, frameIndex) => {
  const durations = Array.isArray(animation?.frameDurations) ? animation.frameDurations : []
  return durations[frameIndex] || animation?.frameMs || 100
}

const renderCurrentFrame = () => {
  catEl.style.backgroundPositionX = -((frameColumn + state.frameIndex) * frameStepX) + 'px'
  catEl.style.backgroundPositionY = -(frameRow * frameStepY) + 'px'
}

const freezeActionForScalePreview = () => {
  if (state.action !== state.defaultAction) {
    stopWalk()
    setAction(state.defaultAction)
  }
  state.frameIndex = 0
  window.clearTimeout(state.frameTimer)
  renderCurrentFrame()
}

const scheduleFrameTick = () => {
  const a = state.animations[state.action]
  window.clearTimeout(state.frameTimer)
  state.frameTimer = window.setTimeout(tickFrame, getFrameDuration(a, state.frameIndex))
}

const setMousePassthrough = (passthrough) => {
  const next = Boolean(passthrough)
  if (state.mousePassthrough === next) return
  state.mousePassthrough = next
  window.petAPI.setMousePassthrough?.(next)
  logPetEvent('pet.mouse.passthrough.changed', {
    passthrough: next
  }, { message: 'Mouse passthrough changed' })
}

const isPointInsideCurrentFrame = (clientX, clientY) => {
  if (state.drag) return true
  const layout = state.currentLayout
  if (!layout) return true

  const hitbox = petHitbox.getViewportHitbox({
    layout,
    windowHeight: window.innerHeight,
    scale: state.scale
  })
  return petHitbox.isPointInHitbox({ x: clientX, y: clientY }, hitbox)
}

const isPointInsideCursorRegion = (clientX, clientY) => {
  if (state.drag) return true
  const hitbox = petHitbox.getWindowHitbox({
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight
  })
  return petHitbox.isPointInHitbox({ x: clientX, y: clientY }, hitbox)
}

const setNativeCursor = (nextCursor) => {
  const value = nextCursor || ''
  const priority = value ? 'important' : ''
  document.documentElement.style.setProperty('cursor', value, priority)
  document.body.style.setProperty('cursor', value, priority)
  pet.style.setProperty('cursor', value, priority)
  state.nativeCursor = value
}

const isPointInsidePetWindow = (clientX, clientY) => (
  clientX >= 0 &&
  clientY >= 0 &&
  clientX <= window.innerWidth &&
  clientY <= window.innerHeight
)

const isPetWindowFocused = () => {
  if (typeof document.hasFocus !== 'function') return true
  return document.hasFocus()
}

const moveCursorOverlay = (clientX, clientY) => {
  const hotspotX = Number.isFinite(Number(state.customCursor.hotspotX)) ? Number(state.customCursor.hotspotX) : 0
  const hotspotY = Number.isFinite(Number(state.customCursor.hotspotY)) ? Number(state.customCursor.hotspotY) : 0
  cursorOverlay.style.transform = `translate3d(${Math.round(clientX - hotspotX)}px, ${Math.round(clientY - hotspotY)}px, 0)`
}

const hideCursorOverlay = () => {
  if (!state.customCursorOverlayVisible) return
  state.customCursorOverlayVisible = false
  cursorOverlay.classList.remove('visible')
}

const showCursorOverlay = (assetUrl, clientX, clientY) => {
  if (cursorOverlay.src !== assetUrl) cursorOverlay.src = assetUrl
  moveCursorOverlay(clientX, clientY)
  if (state.customCursorOverlayVisible) return
  state.customCursorOverlayVisible = true
  cursorOverlay.classList.add('visible')
}

const applyPetCursorStyle = (insideFrame, point = state.lastPointerPoint, insideCursorRegion = insideFrame) => {
  const context = {
    insideFrame,
    insideCursorRegion,
    windowFocused: isPetWindowFocused(),
    dragging: Boolean(state.drag),
    menuOpen: false
  }
  const overlayState = cursorStyle.resolvePetCursorOverlayState(state.customCursor, context)
  const fallbackCursor = cursorStyle.resolvePetCursorStyle(state.customCursor, context)
  setNativeCursor(overlayState.visible ? overlayState.nativeCursor : fallbackCursor)
  if (overlayState.visible && point) showCursorOverlay(overlayState.assetUrl, point.clientX, point.clientY)
  else hideCursorOverlay()
  return overlayState
}

const preservePetCursorStyle = () => {
  hideCursorOverlay()
  setNativeCursor('')
  return { visible: false, assetUrl: '', nativeCursor: state.nativeCursor }
}

const refreshMouseStateFromLastPoint = () => {
  if (!state.lastPointerPoint) {
    applyPetCursorStyle(false)
    return
  }
  const { clientX, clientY } = state.lastPointerPoint
  const insideFrame = isPointInsideCurrentFrame(clientX, clientY)
  const insideCursorRegion = isPointInsideCursorRegion(clientX, clientY)
  const cursorState = applyPetCursorStyle(insideFrame, { clientX, clientY }, insideCursorRegion)
  setMousePassthrough(!insideFrame)
  maybeLogMouseDiagnostic({ clientX, clientY, screenX: clientX, screenY: clientY }, {
    insideFrame,
    insideCursorRegion,
    passthrough: !insideFrame,
    cursorApplied: Boolean(cursorState.visible || state.nativeCursor),
    cursorOverlayVisible: cursorState.visible,
    nativeCursor: state.nativeCursor,
    windowFocused: isPetWindowFocused(),
    customCursorEnabled: Boolean(state.customCursor.enabled),
    dragging: Boolean(state.drag),
    menuOpen: false
  })
}

const updateMousePassthroughFromPoint = (event) => {
  state.lastPointerPoint = { clientX: event.clientX, clientY: event.clientY }
  const insideFrame = isPointInsideCurrentFrame(event.clientX, event.clientY)
  const insideCursorRegion = isPointInsideCursorRegion(event.clientX, event.clientY)
  const isInsideWindow = isPointInsidePetWindow(event.clientX, event.clientY)
  const cursorState = isInsideWindow
    ? applyPetCursorStyle(insideFrame, state.lastPointerPoint, insideCursorRegion)
    : preservePetCursorStyle()
  setMousePassthrough(!insideFrame)
  maybeLogMouseDiagnostic(event, {
    insideFrame,
    insideCursorRegion,
    insideWindow: isInsideWindow,
    passthrough: !insideFrame,
    cursorApplied: Boolean(cursorState.visible || state.nativeCursor),
    cursorOverlayVisible: cursorState.visible,
    nativeCursor: state.nativeCursor,
    windowFocused: isPetWindowFocused(),
    customCursorEnabled: Boolean(state.customCursor.enabled),
    dragging: Boolean(state.drag),
    menuOpen: false
  })
}

const clearPointerHoverState = (event = {}) => {
  state.lastPointerPoint = null
  hideCursorOverlay()
  setNativeCursor('')
  maybeLogMouseDiagnostic({
    clientX: event.clientX ?? -1,
    clientY: event.clientY ?? -1,
    screenX: event.screenX ?? -1,
    screenY: event.screenY ?? -1
  }, {
    insideFrame: false,
    insideCursorRegion: false,
    passthrough: state.mousePassthrough,
    cursorApplied: Boolean(state.nativeCursor),
    cursorOverlayVisible: false,
    nativeCursor: state.nativeCursor,
    windowFocused: isPetWindowFocused(),
    customCursorEnabled: Boolean(state.customCursor.enabled),
    dragging: Boolean(state.drag),
    menuOpen: false
  })
}
/**
 * 切换到指定动作，启动帧播放定时器。
 * — 动作无 sprite 时静默返回（防御性编程）。
 * — 点击动作（非待机）会先停止散步防止窗口移动干扰。
 * @param {string} action 动作 id
 */
const setAction = (action) => {
  const a = state.animations[action]
  if (!a?.sprite) {
    logPetEvent('pet.action.ignored', {
      requestedAction: action,
      reason: 'missing-sprite'
    }, { level: 'info', message: 'Pet action ignored' })
    return
  }

  const previousAction = state.action
  state.action = action
  state.frameIndex = 0

  const dims = getDisplayDimensions(a)
  applyActionLayout(a, dims)
  applySpriteGeometry(a, dims)
  catEl.style.backgroundImage = 'url(' + a.sprite + ')'
  frameColumn = a.frameColumn || 0
  frameRow = a.frameRow || 0
  frameCount = a.frameCount
  renderCurrentFrame()
  setMousePassthrough(false)
  refreshMouseStateFromLastPoint()

  scheduleFrameTick()

  // 点击触发的非待机动作 → 停步 + 显示动作名
  if (action === state.clickAction && action !== state.defaultAction) {
    stopWalk()
    say(a.label)
  }
  logPetEvent('pet.action.changed', {
    previousAction,
    nextAction: action,
    defaultAction: state.defaultAction,
    clickAction: state.clickAction,
    frameCount,
    frameWidth: a.frameWidth,
    frameHeight: a.frameHeight,
    viewportWidth: state.currentLayout?.viewport?.width,
    viewportHeight: state.currentLayout?.viewport?.height
  }, { level: 'info', message: 'Pet action changed' })
}

// ═══════════════════════════════════════════
// 4. 散步系统 — 水平移动 + 碰壁掉头 + 自动停止
// ═══════════════════════════════════════════

/** 设置散步方向并翻转猫咪图片（CSS 变量 --cat-direction）。 */
const setWalkDirection = (d) => {
  state.walkDirection = d < 0 ? -1 : 1
  catEl.style.setProperty('--cat-direction', state.walkDirection < 0 ? '1' : '-1')
}

/** 掉头：方向取反。 */
const turnWalk = () => setWalkDirection(state.walkDirection * -1)

/**
 * 停止散步并清理自动停止定时器。
 * 多处调用：点击动作、菜单切换动作、自动停止到期。
 */
const stopWalk = () => {
  state.walking = false
  window.clearTimeout(state.walkDurationTimer)
}

/**
 * 散步移动 tick，每 40ms 由 setInterval 驱动。
 * — walkMoving 并发锁防止 IPC 堆积。
 * — 撞到屏幕边缘自动掉头。
 * — 约 1.2% 概率随机掉头增加自然感。
 */
const tickWalk = async () => {
  if (!state.walking || state.drag || state.walkMoving) return
  state.walkMoving = true
  try {
    const r = await window.petAPI.moveBy({ x: state.walkDirection * state.walkSpeed, y: 0 })
    if (r?.hitX) turnWalk()
  } catch (_) { state.walking = false } finally { state.walkMoving = false }
  if (Math.random() < 0.012) turnWalk()
}

/**
 * 切换散步模式（双击 / 右键菜单触发）。
 * — 启动时查询贴边状态选择安全方向。
 * — 设置自动停止定时器（默认 15 秒）。
 */
const toggleWalk = async () => {
  const wasWalking = state.walking
  state.walking = !state.walking
  window.clearTimeout(state.walkDurationTimer)

  if (state.walking) {
    try {
      const ms = await window.petAPI.getMovementState()
      if (ms?.atRight) setWalkDirection(-1)
      else if (ms?.atLeft) setWalkDirection(1)
      else setWalkDirection(Math.random() > 0.5 ? 1 : -1)
    } catch (_) { setWalkDirection(Math.random() > 0.5 ? 1 : -1) }

    state.walkDurationTimer = window.setTimeout(() => {
      stopWalk(); setAction(state.defaultAction); say('散步结束')
    }, state.walkDuration)
  }

  if (state.walking !== wasWalking) setAction(state.defaultAction)
  say(state.walking ? '出发' : '休息一下')
  logPetEvent('pet.walk.toggled', {
    walking: state.walking,
    walkDirection: state.walkDirection,
    walkSpeed: state.walkSpeed,
    walkDuration: state.walkDuration
  }, { level: 'info', actor: 'user', message: 'Walk toggled' })
}

// ═══════════════════════════════════════════
// 5. 拖拽 — 鼠标移动窗口，主进程负责边界钳制
// ═══════════════════════════════════════════

/**
 * pointerdown：记录鼠标相对窗口偏移，进入拖拽状态。
 * 忽略右键（button !== 0）。
 */
const onPointerDown = async (event) => {
  if (event.button !== 0) return
  const bounds = await window.petAPI.getBounds()
  const insideFrame = isPointInsideCurrentFrame(event.clientX, event.clientY)
  const insideCursorRegion = isPointInsideCursorRegion(event.clientX, event.clientY)
  logPetEvent('pet.pointer.down', {
    ...createPointDetails(event),
    button: event.button,
    insideFrame,
    insideCursorRegion,
    mousePassthrough: state.mousePassthrough,
    cursorApplied: Boolean(pet.style.cursor),
    cursorOverlayVisible: state.customCursorOverlayVisible,
    nativeCursor: state.nativeCursor,
    boundsWidth: bounds.width,
    boundsHeight: bounds.height
  }, { actor: 'user', message: 'Pointer down' })
  state.drag = {
    pointerId: event.pointerId,
    offsetX: event.screenX - bounds.x,
    offsetY: event.screenY - bounds.y,
    moved: false
  }
  pet.setPointerCapture(event.pointerId)
  pet.classList.add('dragging')
  applyPetCursorStyle(true, { clientX: event.clientX, clientY: event.clientY }, true)
  setMousePassthrough(false)
}

/** pointermove：持续更新窗口位置。moved 标志用于区分拖拽与点击。 */
const onPointerMove = (event) => {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return
  state.drag.moved = true
  window.petAPI.setPosition({ x: event.screenX - state.drag.offsetX, y: event.screenY - state.drag.offsetY })
}

/** pointerup：未移动 → 视为点击 → 触发 clickAction。 */
const onPointerUp = (event) => {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return
  const wasClick = !state.drag.moved
  const wasDrag = state.drag.moved
  const insideFrame = isPointInsideCurrentFrame(event.clientX, event.clientY)
  const insideCursorRegion = isPointInsideCursorRegion(event.clientX, event.clientY)
  state.drag = null
  pet.classList.remove('dragging')
  if (wasDrag) window.petAPI.dragEnded?.()
  updateMousePassthroughFromPoint(event)
  logPetEvent('pet.pointer.up', {
    ...createPointDetails(event),
    wasClick,
    wasDrag,
    insideFrame,
    insideCursorRegion,
    cursorOverlayVisible: state.customCursorOverlayVisible,
    nativeCursor: state.nativeCursor,
    clickAction: state.clickAction
  }, { actor: 'user', message: 'Pointer up' })
  if (wasClick) setAction(state.clickAction)
}

// ═══════════════════════════════════════════
// 6. 右键菜单 — 主进程原生菜单 + 命令分发
// ═══════════════════════════════════════════

const applyAnimationsConfig = ({ actions, defaultAction, clickAction }) => {
  state.defaultAction = defaultAction
  state.clickAction = clickAction
  state.animations = Object.fromEntries(actions.map((a) => [a.id, a]))
  if (state.defaultAction) setAction(state.defaultAction)
}

const showContextMenu = (event) => {
  event.preventDefault()
  setMousePassthrough(false)
  applyPetCursorStyle(false)
  window.petAPI.showContextMenu?.({ x: event.clientX, y: event.clientY })
}

const runMenuCommand = (payload) => {
  logPetEvent('pet.menu.action.selected', {
    selectedAction: payload?.command === 'action' ? payload.actionId : payload?.command
  }, { level: 'info', actor: 'user', message: 'Pet menu action selected' })
  if (payload?.command === 'walk') toggleWalk()
  else if (payload?.command === 'action' && payload.actionId) {
    stopWalk()
    setAction(payload.actionId)
  }
}

// ═══════════════════════════════════════════
// 7. 入口 — 绑定事件、同步设置、启动应用
// ═══════════════════════════════════════════

// 监听主进程推送的设置变更，同步到渲染状态
window.petAPI.onSettingsChanged((s) => {
  if (s.scale != null) {
    state.scale = normalizePetScale(s.scale)
    const currentAction = state.animations[state.action]
    if (currentAction) {
      const dims = getDisplayDimensions(currentAction)
      applyActionLayout(currentAction, dims)
      applySpriteGeometry(currentAction, dims)
      freezeActionForScalePreview()
      renderCurrentFrame()
    }
  }
  if (s.walkSpeed != null) state.walkSpeed = s.walkSpeed
  if (s.walkDuration != null) state.walkDuration = s.walkDuration
  if (s.bubbleDuration != null) state.bubbleDuration = s.bubbleDuration
  if (s.customCursor) {
    state.customCursor = {
      enabled: Boolean(s.customCursor.enabled && s.customCursor.assetUrl),
      assetPath: s.customCursor.assetPath || '',
      assetUrl: s.customCursor.assetUrl || '',
      fileName: s.customCursor.fileName || '',
      hotspotX: Number(s.customCursor.hotspotX) || 0,
      hotspotY: Number(s.customCursor.hotspotY) || 0
    }
    refreshMouseStateFromLastPoint()
  }
  logPetEvent('pet.settings.applied', {
    scaleUpdated: s.scale != null,
    walkSpeedUpdated: s.walkSpeed != null,
    walkDurationUpdated: s.walkDuration != null,
    bubbleDurationUpdated: s.bubbleDuration != null,
    customCursorUpdated: Boolean(s.customCursor),
    customCursorEnabled: Boolean(state.customCursor.enabled),
    customCursorFileName: state.customCursor.fileName || ''
  }, { level: 'info', message: 'Pet renderer settings applied' })
})

window.petAPI.onPetSay((payload) => {
  if (payload?.text) say(payload.text, payload.ttlMs)
})

window.petAPI.onPetAction((payload) => {
  if (payload?.actionId) {
    stopWalk()
    setAction(payload.actionId)
  }
})

window.petAPI.onAnimationsChanged((config) => {
  if (config?.actions) applyAnimationsConfig(config)
})

window.petAPI.onPetMenuCommand?.(runMenuCommand)

// DOM 事件绑定
pet.addEventListener('pointerdown', onPointerDown)
pet.addEventListener('pointermove', updateMousePassthroughFromPoint)
pet.addEventListener('pointermove', onPointerMove)
pet.addEventListener('pointerup', onPointerUp)
pet.addEventListener('pointerleave', clearPointerHoverState)
pet.addEventListener('dblclick', toggleWalk)
pet.addEventListener('contextmenu', showContextMenu)
window.addEventListener('blur', () => { clearPointerHoverState() })  // 窗口失焦时清理 hover 态

/**
 * 启动流程：
 * 1. 从主进程获取动作配置
 * 2. 缓存动作表供菜单命令使用
 * 3. 播放待机动画
 * 4. 启动散步 tick 循环（40ms ≈ 25fps）
 */
const start = async () => {
  const config = await window.petAPI.getAnimations()
  applyAnimationsConfig(config)
  logPetEvent('pet.renderer.started', {
    actionsCount: Array.isArray(config?.actions) ? config.actions.length : 0,
    defaultAction: state.defaultAction,
    clickAction: state.clickAction
  }, { level: 'info', message: 'Pet renderer started' })

  if (!state.defaultAction) { say('没有找到动作图片'); return }

  say('喵')
  state.walkTimer = window.setInterval(tickWalk, 40)
}

start()
