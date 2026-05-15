/**
 * ibot 设置面板渲染层。
 *
 * 为什么独立：设置窗口是独立的 BrowserWindow，有自己的 HTML 和交互逻辑，
 * 与宠物窗口的动画/散步/拖拽完全解耦。
 */

// ── DOM 引用 ──
const scaleSlider = document.getElementById('scale')
const scaleValue = document.getElementById('scale-value')
const walkSpeedOpts = document.getElementById('walk-speed-options')
const walkDurationOpts = document.getElementById('walk-duration-options')
const bubbleDurationOpts = document.getElementById('bubble-duration-options')
const autoStartToggle = document.getElementById('auto-start')
const btnSave = document.getElementById('btn-save')
const btnCancel = document.getElementById('btn-cancel')
const btnClose = document.getElementById('btn-close')

// 打开面板时从主进程读取的原始值，取消时恢复
let currentSettings = {}

// ── 辅助函数 ──

/** 在选项按钮组中高亮 value 对应的按钮。 */
const setActive = (container, value) => {
  container.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.value === String(value))
  })
}

/** 关闭面板前恢复预览缩放（防止宠物窗口卡在中间值）。 */
const closeSettings = () => {
  window.settingsAPI.previewScale(currentSettings.scale)
  window.settingsAPI.close()
}

/** 将从主进程读取的设置渲染到 UI 控件。 */
const renderSettings = (s) => {
  currentSettings = s
  scaleSlider.value = Math.round(s.scale * 100)
  scaleValue.textContent = Math.round(s.scale * 100) + '%'
  setActive(walkSpeedOpts, s.walkSpeed)
  setActive(walkDurationOpts, s.walkDuration)
  setActive(bubbleDurationOpts, s.bubbleDuration)
  autoStartToggle.classList.toggle('on', s.autoStart)
}

// ── 事件绑定 ──

// 缩放滑块：拖动时实时预览（不持久化）
scaleSlider.addEventListener('input', () => {
  scaleValue.textContent = scaleSlider.value + '%'
  window.settingsAPI.previewScale(Number(scaleSlider.value) / 100)
})

// 选项按钮组：点击高亮
walkSpeedOpts.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (b) setActive(walkSpeedOpts, b.dataset.value)
})
walkDurationOpts.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (b) setActive(walkDurationOpts, b.dataset.value)
})
bubbleDurationOpts.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (b) setActive(bubbleDurationOpts, b.dataset.value)
})

// 开机自启开关
autoStartToggle.addEventListener('click', () => autoStartToggle.classList.toggle('on'))

// 保存：收集所有控件值 → 持久化 → 关闭
btnSave.addEventListener('click', async () => {
  const settings = {
    scale: Number(scaleSlider.value) / 100,
    walkSpeed: Number(walkSpeedOpts.querySelector('button.active')?.dataset.value || 2),
    walkDuration: Number(walkDurationOpts.querySelector('button.active')?.dataset.value || 15000),
    bubbleDuration: Number(bubbleDurationOpts.querySelector('button.active')?.dataset.value || 1300),
    autoStart: autoStartToggle.classList.contains('on')
  }
  await window.settingsAPI.saveSettings(settings)
  window.settingsAPI.close()
})

btnCancel.addEventListener('click', closeSettings)
btnClose.addEventListener('click', closeSettings)

// ── 启动 ──
;(async () => {
  renderSettings(await window.settingsAPI.getSettings())
})()
