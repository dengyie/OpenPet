const scaleSlider = document.getElementById('scale')
const scaleValue = document.getElementById('scale-value')
const walkSpeedOptions = document.getElementById('walk-speed-options')
// 散步时长选项容器，data-value 为毫秒值（10000/15000/30000/60000）。
const walkDurationOptions = document.getElementById('walk-duration-options')
const bubbleDurationOptions = document.getElementById('bubble-duration-options')
const autoStartToggle = document.getElementById('auto-start')
const btnSave = document.getElementById('btn-save')
const btnCancel = document.getElementById('btn-cancel')
const btnClose = document.getElementById('btn-close')

let currentSettings = {}

const setActiveOption = (container, value) => {
  container.querySelectorAll('button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === String(value))
  })
}

const renderSettings = (settings) => {
  currentSettings = settings
  scaleSlider.value = Math.round(settings.scale * 100)
  scaleValue.textContent = `${Math.round(settings.scale * 100)}%`
  setActiveOption(walkSpeedOptions, settings.walkSpeed)
  // 高亮当前散步时长对应的按钮（默认 15000 即 15 秒）。
  setActiveOption(walkDurationOptions, settings.walkDuration)
  setActiveOption(bubbleDurationOptions, settings.bubbleDuration)
  autoStartToggle.classList.toggle('on', settings.autoStart)
}

scaleSlider.addEventListener('input', () => {
  const percent = scaleSlider.value
  scaleValue.textContent = `${percent}%`
  window.settingsAPI.previewScale(Number(percent) / 100)
})

walkSpeedOptions.addEventListener('click', (event) => {
  const btn = event.target.closest('button')
  if (!btn) return
  setActiveOption(walkSpeedOptions, btn.dataset.value)
})

// 散步时长选项点击：切换高亮按钮，保存时读取 button.active 的 data-value。
walkDurationOptions.addEventListener('click', (event) => {
  const btn = event.target.closest('button')
  if (!btn) return
  setActiveOption(walkDurationOptions, btn.dataset.value)
})

bubbleDurationOptions.addEventListener('click', (event) => {
  const btn = event.target.closest('button')
  if (!btn) return
  setActiveOption(bubbleDurationOptions, btn.dataset.value)
})

autoStartToggle.addEventListener('click', () => {
  autoStartToggle.classList.toggle('on')
})

btnSave.addEventListener('click', async () => {
  const settings = {
    scale: Number(scaleSlider.value) / 100,
    walkSpeed: Number(walkSpeedOptions.querySelector('button.active')?.dataset.value || 2),
    // 散步时长：读取当前高亮按钮的 data-value（毫秒），默认 15000ms = 15 秒。
    walkDuration: Number(walkDurationOptions.querySelector('button.active')?.dataset.value || 15000),
    bubbleDuration: Number(bubbleDurationOptions.querySelector('button.active')?.dataset.value || 1300),
    autoStart: autoStartToggle.classList.contains('on')
  }
  await window.settingsAPI.saveSettings(settings)
  window.settingsAPI.close()
})

btnCancel.addEventListener('click', () => {
  window.settingsAPI.previewScale(currentSettings.scale)
  window.settingsAPI.close()
})

btnClose.addEventListener('click', () => {
  window.settingsAPI.previewScale(currentSettings.scale)
  window.settingsAPI.close()
})

const start = async () => {
  const settings = await window.settingsAPI.getSettings()
  renderSettings(settings)
}

start()
