/**
 * ibot 渲染进程 — 桌面小猫的动画、交互与行为逻辑。
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
const menu = document.getElementById('menu')     // 右键菜单容器
const MAX_DISPLAY_SIZE = 260                     // 帧显示最大尺寸（px），超出按比例缩小

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

  // ── 气泡 ──
  bubbleTimer: 0,        // setTimeout id，到期后隐藏气泡
  bubbleDuration: 1300   // 气泡显示时长 ms（由设置同步）
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
let frameStep = 0   // 每帧的 background-position-x 偏移量（px）
let frameCount = 0  // 当前动作总帧数

/**
 * 根据原始帧尺寸计算实际 CSS 显示尺寸。
 * 确保宽度不超过 MAX_DISPLAY_SIZE，等比例缩放。
 */
const getDisplayDimensions = (animation) => {
  const s = Math.min(1, MAX_DISPLAY_SIZE / animation.frameWidth, MAX_DISPLAY_SIZE / animation.frameHeight)
  return { width: Math.round(animation.frameWidth * s), height: Math.round(animation.frameHeight * s), fitScale: s }
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
  catEl.style.backgroundPositionX = -(state.frameIndex * frameStep) + 'px'
}

/**
 * 切换到指定动作，启动帧播放定时器。
 * — 动作无 sprite 时静默返回（防御性编程）。
 * — 点击动作（非待机）会先停止散步防止窗口移动干扰。
 * @param {string} action 动作 id
 */
const setAction = (action) => {
  const a = state.animations[action]
  if (!a?.sprite) return

  state.action = action
  state.frameIndex = 0

  const dims = getDisplayDimensions(a)
  catEl.style.width = dims.width + 'px'
  catEl.style.height = dims.height + 'px'
  catEl.style.backgroundImage = 'url(' + a.sprite + ')'
  catEl.style.backgroundPositionX = '0px'

  frameStep = Math.round(a.frameWidth * dims.fitScale)
  frameCount = a.frameCount

  window.clearInterval(state.frameTimer)
  state.frameTimer = window.setInterval(tickFrame, a.frameMs)

  // 点击触发的非待机动作 → 停步 + 显示动作名
  if (action === state.clickAction && action !== state.defaultAction) {
    stopWalk()
    say(a.label)
  }
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
}

// ═══════════════════════════════════════════
// 5. 拖拽 — 鼠标移动窗口，主进程负责边界钳制
// ═══════════════════════════════════════════

/**
 * pointerdown：记录鼠标相对窗口偏移，进入拖拽状态。
 * 忽略右键（button !== 0）和菜单区域点击。
 */
const onPointerDown = async (event) => {
  if (event.button !== 0 || event.target.closest('#menu')) return
  hideMenu()
  const bounds = await window.petAPI.getBounds()
  state.drag = {
    pointerId: event.pointerId,
    offsetX: event.screenX - bounds.x,
    offsetY: event.screenY - bounds.y,
    moved: false
  }
  pet.setPointerCapture(event.pointerId)
  pet.classList.add('dragging')
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
  state.drag = null
  pet.classList.remove('dragging')
  if (wasClick) setAction(state.clickAction)
}

// ═══════════════════════════════════════════
// 6. 右键菜单 — 动态生成 + 点击分发
// ═══════════════════════════════════════════

/**
 * 根据动作列表构建菜单 DOM：
 *   动作按钮 … | 分隔线 | 散步 设置 | 分隔线 | 退出
 */
const renderMenu = (actions) => {
  menu.textContent = ''
  actions.forEach((a) => {
    const b = document.createElement('button')
    b.type = 'button'; b.dataset.action = a.id; b.textContent = a.label
    menu.appendChild(b)
  })
  const mkDiv = () => { const d = document.createElement('div'); d.className = 'divider'; menu.appendChild(d) }
  const mkBtn = (label, action) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.action = action; b.textContent = label; menu.appendChild(b) }
  mkDiv(); mkBtn('散步', 'walk'); mkBtn('设置', 'settings'); mkDiv(); mkBtn('退出', 'quit')
}

const hideMenu = () => menu.classList.remove('open')
const showMenu = () => menu.classList.add('open')

/** 菜单点击统一分发 —— 根据按钮 data-action 路由到对应逻辑。 */
const onMenuClick = (event) => {
  const btn = event.target.closest('button')
  if (!btn) return
  const action = btn.dataset.action
  hideMenu()
  if (action === 'quit') window.petAPI.quit()
  else if (action === 'walk') toggleWalk()
  else if (action === 'settings') window.petAPI.openSettings()
  else { stopWalk(); setAction(action) }
}

// ═══════════════════════════════════════════
// 7. 入口 — 绑定事件、同步设置、启动应用
// ═══════════════════════════════════════════

// 监听主进程推送的设置变更，同步到渲染状态
window.petAPI.onSettingsChanged((s) => {
  if (s.scale != null) catEl.style.setProperty('--cat-scale', s.scale)
  if (s.walkSpeed != null) state.walkSpeed = s.walkSpeed
  if (s.walkDuration != null) state.walkDuration = s.walkDuration
  if (s.bubbleDuration != null) state.bubbleDuration = s.bubbleDuration
})

// DOM 事件绑定
pet.addEventListener('pointerdown', onPointerDown)
pet.addEventListener('pointermove', onPointerMove)
pet.addEventListener('pointerup', onPointerUp)
pet.addEventListener('dblclick', toggleWalk)
pet.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu() })
menu.addEventListener('click', onMenuClick)
window.addEventListener('blur', hideMenu)  // 窗口失焦时自动关闭菜单

/**
 * 启动流程：
 * 1. 从主进程获取动作配置
 * 2. 构建菜单
 * 3. 播放待机动画
 * 4. 启动散步 tick 循环（40ms ≈ 25fps）
 */
const start = async () => {
  const { actions, defaultAction, clickAction } = await window.petAPI.getAnimations()
  state.defaultAction = defaultAction
  state.clickAction = clickAction
  state.animations = Object.fromEntries(actions.map((a) => [a.id, a]))
  renderMenu(actions)

  if (!state.defaultAction) { say('没有找到动作图片'); return }

  setAction(state.defaultAction)
  say('喵')
  state.walkTimer = window.setInterval(tickWalk, 40)
}

start()
