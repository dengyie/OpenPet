const pet = document.getElementById('pet')
const cat = document.getElementById('cat')
const bubble = document.getElementById('bubble')
const menu = document.getElementById('menu')

// 渲染层统一状态：
// - action / frameIndex 控制当前播放哪一个动作帧。
// - walking / walkDirection 控制散步移动。
// - drag 保存拖拽过程中的指针信息。
// - timer 字段保存定时器 id，方便切换动作或隐藏气泡时清理旧任务。
const state = {
  action: '',
  defaultAction: '',
  clickAction: '',
  animations: {},
  frameIndex: 0,
  frameTimer: 0,
  walking: false,
  walkDirection: -1,
  walkMoving: false,
  walkTimer: 0,
  drag: null,
  bubbleTimer: 0,
  walkSpeed: 2,

  // 散步自动停止的时长（毫秒），由主进程设置同步。默认 15000ms = 15 秒。
  walkDuration: 15000,

  // 散步自动停止的定时器 id。每次开始散步时启动，停止散步或切换动作时清除，
  // 避免多个定时器并发导致提前停止或重复触发。
  walkDurationTimer: 0,

  bubbleDuration: 1300
}

// 显示小猫头顶气泡。每次调用都会重置隐藏计时，避免短时间内多条提示互相叠加。
const say = (text, duration = state.bubbleDuration) => {
  window.clearTimeout(state.bubbleTimer)
  bubble.textContent = text
  bubble.classList.add('show')

  state.bubbleTimer = window.setTimeout(() => {
    bubble.classList.remove('show')
  }, duration)
}

// 设置散步方向，同时更新 CSS 变量来水平翻转小猫。
// 这里不用 element.style.scale，是为了让翻转和居中共用同一个 transform，减少透明窗口绘制异常。
const setWalkDirection = (direction) => {
  state.walkDirection = direction < 0 ? -1 : 1
  cat.style.setProperty('--cat-direction', state.walkDirection < 0 ? '1' : '-1')
}

// 切换当前动画动作。
// action 必须存在于自动发现的动作列表中；如果动作不存在或没有帧，直接忽略。
const setAction = (action) => {
  const animation = state.animations[action]
  if (!animation?.frames.length) return

  state.action = action
  state.frameIndex = 0
  cat.src = animation.frames[0]
  window.clearInterval(state.frameTimer)
  state.frameTimer = window.setInterval(tickFrame, animation.frameMs)

  // 点击触发的非默认动作通常是一次性动作，例如喂食。
  // 播放这类动作时停止散步，避免窗口移动和一次性动画同时发生。
  // 同时清除散步自动停止定时器，防止定时器到期后覆盖当前动作。
  if (action === state.clickAction && action !== state.defaultAction) {
    state.walking = false
    window.clearTimeout(state.walkDurationTimer)
    say(animation.label)
  }
}

// 播放下一帧。循环动作播完会回到第一帧；非循环动作播完会恢复默认待机动作。
const tickFrame = () => {
  const animation = state.animations[state.action]
  if (!animation?.frames.length) return

  state.frameIndex += 1

  if (state.frameIndex >= animation.frames.length) {
    if (animation.loop) {
      state.frameIndex = 0
    } else {
      setAction(state.defaultAction)
      return
    }
  }

  cat.src = animation.frames[state.frameIndex]
}

// 散步掉头：方向取反，图片也同步翻转。
const turnWalk = () => {
  setWalkDirection(state.walkDirection * -1)
}

// 每 40ms 尝试移动一次窗口。
// walkMoving 是一个并发锁，避免上一次 IPC 移动还没返回时继续堆积新的 moveBy 请求。
const tickWalk = async () => {
  if (!state.walking || state.drag || state.walkMoving) return

  state.walkMoving = true

  try {
    const moveResult = await window.petAPI.moveBy({
      x: state.walkDirection * state.walkSpeed,
      y: 0
    })

    // 主进程会把窗口限制在屏幕工作区内；如果撞到左右边界，下一步改为反方向。
    if (moveResult?.hitX) {
      turnWalk()
    }
  } catch (error) {
    state.walking = false
  } finally {
    state.walkMoving = false
  }

  // 偶尔随机掉头，让散步看起来不是机械地一直往一个方向走。
  if (Math.random() < 0.012) {
    turnWalk()
  }
}

// 开关散步模式。
// 开始散步时先问主进程当前窗口是否贴边：贴右边就先向左，贴左边就先向右。
// 这样可以避免小猫从屏幕边缘启动时先往屏幕外移动导致短暂消失。
//
// 散步自动停止机制：
// 每次启动散步时会根据 state.walkDuration 设置一个一次性定时器。
// 定时器到期后自动将 walking 置为 false、恢复待机动作并提示"散步结束"。
// 如果用户在定时器到期前手动停止散步（再次点击散步、切换动作等），
// 会先清除该定时器，避免"散步结束"覆盖当前状态。
const toggleWalk = async () => {
  state.walking = !state.walking

  // 无论启动还是停止散步，都先清除上一次的自动停止定时器，
  // 防止旧定时器在新散步周期中意外触发。
  window.clearTimeout(state.walkDurationTimer)

  if (state.walking) {
    try {
      const movementState = await window.petAPI.getMovementState()
      if (movementState?.atRight) {
        setWalkDirection(-1)
      } else if (movementState?.atLeft) {
        setWalkDirection(1)
      } else {
        setWalkDirection(Math.random() > 0.5 ? 1 : -1)
      }
    } catch (error) {
      setWalkDirection(Math.random() > 0.5 ? 1 : -1)
    }

    // 启动自动停止定时器：经过 walkDuration 毫秒后自动结束散步。
    // 使用 setTimeout 而非 setInterval，因为每次散步只需要触发一次自动停止。
    state.walkDurationTimer = window.setTimeout(() => {
      state.walking = false
      setAction(state.defaultAction)
      say('散步结束')
    }, state.walkDuration)
  }

  setAction(state.defaultAction)
  say(state.walking ? '出发' : '休息一下')
}

// 关闭右键菜单。
const hideMenu = () => {
  menu.classList.remove('open')
}

// 打开右键菜单。
const showMenu = () => {
  menu.classList.add('open')
}

// 创建一个菜单按钮。action 会写入 dataset，点击时再统一分发处理。
const addMenuButton = (label, action) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.action = action
  button.textContent = label
  menu.appendChild(button)
}

// 菜单分隔线，用来把动作列表和系统命令区分开。
const addMenuDivider = () => {
  const divider = document.createElement('div')
  divider.className = 'divider'
  menu.appendChild(divider)
}

// 根据主进程返回的动作列表生成右键菜单。
// 动作按钮来自文件夹自动发现；散步和退出是固定控制项。
const renderMenu = (actions) => {
  menu.textContent = ''

  // 动作菜单由文件夹自动生成，新增动作时不需要再改 HTML。
  actions.forEach((animation) => {
    addMenuButton(animation.label, animation.id)
  })

  addMenuDivider()
  addMenuButton('散步', 'walk')
  addMenuButton('设置', 'settings')
  addMenuDivider()
  addMenuButton('退出', 'quit')
}

// 鼠标或触控按下时进入拖拽准备状态。
// 这里先读取窗口位置，记录指针相对窗口左上角的偏移，后续移动时可保持抓取点不跳动。
pet.addEventListener('pointerdown', async (event) => {
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
})

// 拖拽过程中持续把窗口移动到指针位置附近。
// 实际坐标会在主进程里夹紧到屏幕工作区，避免窗口被拖出屏幕。
pet.addEventListener('pointermove', (event) => {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return

  state.drag.moved = true
  window.petAPI.setPosition({
    x: event.screenX - state.drag.offsetX,
    y: event.screenY - state.drag.offsetY
  })
})

// 拖拽结束。如果指针没有移动过，就把这次操作当作点击，触发 clickAction。
pet.addEventListener('pointerup', (event) => {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return

  const wasClick = !state.drag.moved
  state.drag = null
  pet.classList.remove('dragging')

  if (wasClick) {
    setAction(state.clickAction)
  }
})

// 双击小猫也可以切换散步模式，和右键菜单里的“散步”作用一致。
pet.addEventListener('dblclick', () => {
  toggleWalk()
})

// 用浏览器原生右键事件打开自定义菜单。
pet.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  showMenu()
})

// 菜单点击统一分发：
// - quit 退出应用
// - walk 切换散步
// - 其他值都当作动作 id 播放
menu.addEventListener('click', (event) => {
  const button = event.target.closest('button')
  if (!button) return

  const action = button.dataset.action
  hideMenu()

  if (action === 'quit') {
    window.petAPI.quit()
  } else if (action === 'walk') {
    toggleWalk()
  } else if (action === 'settings') {
    window.petAPI.openSettings()
  } else {
    // 点击动作按钮时停止散步，同时清除自动停止定时器，
    // 避免定时器到期后将动作切回待机，覆盖用户刚刚选择的动作。
    state.walking = false
    window.clearTimeout(state.walkDurationTimer)
    setAction(action)
  }
})

// 窗口失焦时隐藏菜单，避免菜单一直停在桌面上。
window.addEventListener('blur', hideMenu)

// 应用启动入口：
// 1. 从主进程获取动作列表。
// 2. 初始化菜单和默认动作。
// 3. 启动散步定时器，只有 walking=true 时才真正移动。
const start = async () => {
  // 尽早注册设置变更监听，避免错过主进程在 did-finish-load 时推送的初始设置。
  window.petAPI.onSettingsChanged((settings) => {
    if (settings.scale != null) {
      cat.style.setProperty('--cat-scale', settings.scale)
    }
    if (settings.walkSpeed != null) {
      state.walkSpeed = settings.walkSpeed
    }
    // 散步自动停止时长：用户在设置面板修改后，主进程通过 settings:changed 推送新值。
    // 下次启动散步时会使用新的时长来设置自动停止定时器。
    if (settings.walkDuration != null) {
      state.walkDuration = settings.walkDuration
    }
    if (settings.bubbleDuration != null) {
      state.bubbleDuration = settings.bubbleDuration
    }
  })

  const { actions, defaultAction, clickAction } = await window.petAPI.getAnimations()
  state.defaultAction = defaultAction
  state.clickAction = clickAction
  state.animations = Object.fromEntries(actions.map((animation) => [animation.id, animation]))
  renderMenu(actions)

  if (!state.defaultAction) {
    say('没有找到动作图片')
    return
  }

  setAction(state.defaultAction)
  say('喵')

  state.walkTimer = window.setInterval(tickWalk, 40)
}

// renderer.js 被页面加载后立即启动桌面宠物。
start()
