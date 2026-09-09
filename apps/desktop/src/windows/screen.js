/**
 * 屏幕几何模块 —— 窗口坐标限制与边界检测。
 *
 * 为什么独立存在：
 * 拖拽和散步都依赖"把窗口限制在屏幕工作区内"这一能力，
 * 以及"窗口是否贴边"的状态查询。集中管理避免两处各自计算边界。
 */
const { screen } = require('electron')

/**
 * 根据窗口尺寸和坐标，计算当前所在屏幕的工作区边界。
 * clampToWorkArea 和 getMovementState 的公共依赖。
 */
const getWorkAreaBounds = (bounds, x, y) => {
  const display = screen.getDisplayMatching({ x, y, width: bounds.width, height: bounds.height })
  const { workArea } = display
  return {
    minX: workArea.x,
    maxX: workArea.x + workArea.width - bounds.width,
    minY: workArea.y,
    maxY: workArea.y + workArea.height - bounds.height
  }
}

/**
 * 将目标坐标钳制在屏幕工作区内，并返回是否碰到边界。
 * 拖拽和散步移动都通过此函数确保窗口不出屏幕。
 */
const clampToWorkArea = (win, x, y) => {
  const bounds = win.getBounds()
  const { minX, maxX, minY, maxY } = getWorkAreaBounds(bounds, x, y)
  return {
    x: Math.min(Math.max(Math.round(x), minX), maxX),
    y: Math.min(Math.max(Math.round(y), minY), maxY),
    hitX: x <= minX || x >= maxX,
    hitY: y <= minY || y >= maxY
  }
}

/**
 * 查询窗口在水平方向上是否贴近左右屏幕边缘。
 * 散步刚启动时用此判断应该往哪个方向走，避免小猫消失在屏幕外。
 */
const getMovementState = (win) => {
  const bounds = win.getBounds()
  const { minX, maxX } = getWorkAreaBounds(bounds, bounds.x, bounds.y)
  return {
    x: bounds.x,
    atLeft: bounds.x <= minX,
    atRight: bounds.x >= maxX
  }
}

module.exports = { clampToWorkArea, getMovementState }
