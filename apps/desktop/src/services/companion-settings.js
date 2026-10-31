'use strict'

const DEFAULT_COMPANION_SETTINGS = Object.freeze({
  enabled: true,
  focusedSessionKey: '',
  noticeCooldownMs: Object.freeze({ completed: 120000, waiting: 120000, failed: 120000 }),
  quietHours: Object.freeze({ enabled: false, start: '22:00', end: '08:00' }),
  voice: Object.freeze({ enabled: false, language: 'zh-CN', volume: 0.7 }),
  idleMotion: Object.freeze({ enabled: true, intensity: 0.8 })
})

const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const SUPPORTED_VOICE_LANGUAGES = new Set(['zh-CN', 'en-US'])

const clampNumber = (value, fallback, min, max) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

const normalizeClock = (value, fallback) => CLOCK_PATTERN.test(String(value || '')) ? value : fallback

const normalizeSessionKey = (value) => {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === '' || /^[a-f0-9]{12}$/.test(normalized) ? normalized : ''
}

const normalizeCompanionSettings = (settings = {}) => {
  const input = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {}
  const cooldown = input.noticeCooldownMs && typeof input.noticeCooldownMs === 'object' && !Array.isArray(input.noticeCooldownMs)
    ? input.noticeCooldownMs
    : {}
  const quietHours = input.quietHours && typeof input.quietHours === 'object' && !Array.isArray(input.quietHours)
    ? input.quietHours
    : {}
  const voice = input.voice && typeof input.voice === 'object' && !Array.isArray(input.voice)
    ? input.voice
    : {}
  const idleMotion = input.idleMotion && typeof input.idleMotion === 'object' && !Array.isArray(input.idleMotion)
    ? input.idleMotion
    : {}
  const language = SUPPORTED_VOICE_LANGUAGES.has(voice.language) ? voice.language : DEFAULT_COMPANION_SETTINGS.voice.language
  return {
    enabled: input.enabled !== false,
    focusedSessionKey: normalizeSessionKey(input.focusedSessionKey),
    noticeCooldownMs: {
      completed: Math.round(clampNumber(cooldown.completed, DEFAULT_COMPANION_SETTINGS.noticeCooldownMs.completed, 0, 24 * 60 * 60 * 1000)),
      waiting: Math.round(clampNumber(cooldown.waiting, DEFAULT_COMPANION_SETTINGS.noticeCooldownMs.waiting, 0, 24 * 60 * 60 * 1000)),
      failed: Math.round(clampNumber(cooldown.failed, DEFAULT_COMPANION_SETTINGS.noticeCooldownMs.failed, 0, 24 * 60 * 60 * 1000))
    },
    quietHours: {
      enabled: quietHours.enabled === true,
      start: normalizeClock(quietHours.start, DEFAULT_COMPANION_SETTINGS.quietHours.start),
      end: normalizeClock(quietHours.end, DEFAULT_COMPANION_SETTINGS.quietHours.end)
    },
    voice: {
      enabled: voice.enabled === true,
      language,
      volume: clampNumber(voice.volume, DEFAULT_COMPANION_SETTINGS.voice.volume, 0, 1)
    },
    idleMotion: {
      enabled: idleMotion.enabled !== false,
      intensity: clampNumber(idleMotion.intensity, DEFAULT_COMPANION_SETTINGS.idleMotion.intensity, 0, 1)
    }
  }
}

const minutesOfDay = (value) => {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

const isWithinQuietHours = (settings, date = new Date()) => {
  const normalized = normalizeCompanionSettings(settings)
  if (!normalized.quietHours.enabled) return false
  const current = date.getHours() * 60 + date.getMinutes()
  const start = minutesOfDay(normalized.quietHours.start)
  const end = minutesOfDay(normalized.quietHours.end)
  if (start === end) return true
  return start < end ? current >= start && current < end : current >= start || current < end
}

module.exports = {
  DEFAULT_COMPANION_SETTINGS,
  SUPPORTED_VOICE_LANGUAGES,
  isWithinQuietHours,
  normalizeCompanionSettings
}
