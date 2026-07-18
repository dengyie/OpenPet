const MAX_RUNTIME_LOG_KEYS = 64
const DEFAULT_RUNTIME_LOG_INTERVAL_MS = 5000

const incrementSafeCount = (value) => Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Number(value) || 0) + 1)

const createRuntimeLogEvent = ({
  consoleImpl = console,
  now = () => new Date().toISOString(),
  nowMs = () => Date.now(),
  minIntervalMs = DEFAULT_RUNTIME_LOG_INTERVAL_MS,
  maxKeys = MAX_RUNTIME_LOG_KEYS
} = {}) => {
  const states = new Map()
  const boundedIntervalMs = Math.min(60000, Math.max(0, Number(minIntervalMs) || 0))
  const boundedMaxKeys = Math.min(MAX_RUNTIME_LOG_KEYS, Math.max(1, Number(maxKeys) || MAX_RUNTIME_LOG_KEYS))

  return (event = {}) => {
    try {
      const level = event.level === 'error' ? 'error' : (event.level === 'warn' ? 'warn' : 'info')
      const eventName = String(event.event || '').slice(0, 80)
      const code = String(event.code || '').slice(0, 80)
      const key = `${level}:${eventName}:${code}`
      const currentTime = Number(nowMs())
      const previous = states.get(key) || { count: 0, lastEmittedAt: null }
      const state = {
        count: incrementSafeCount(previous.count),
        lastEmittedAt: previous.lastEmittedAt
      }
      if (states.has(key)) states.delete(key)
      states.set(key, state)
      while (states.size > boundedMaxKeys) states.delete(states.keys().next().value)

      if (
        Number.isFinite(currentTime) &&
        state.lastEmittedAt != null &&
        currentTime >= state.lastEmittedAt &&
        currentTime - state.lastEmittedAt < boundedIntervalMs
      ) {
        return false
      }
      state.lastEmittedAt = Number.isFinite(currentTime) ? currentTime : null

      const payload = {
        service: 'openpet.im-gateway',
        timestamp: now(),
        level,
        event: eventName,
        code
      }
      const explicitCount = Number(event.count)
      if (Number.isSafeInteger(explicitCount) && explicitCount >= 0) payload.count = explicitCount
      else if (state.count > 1) payload.count = state.count
      const writer = level === 'error' ? consoleImpl.error : (level === 'warn' ? consoleImpl.warn : consoleImpl.log)
      if (typeof writer !== 'function') return false
      writer.call(consoleImpl, JSON.stringify(payload))
      return true
    } catch (_) {
      return false
    }
  }
}

module.exports = {
  createRuntimeLogEvent,
  DEFAULT_RUNTIME_LOG_INTERVAL_MS,
  MAX_RUNTIME_LOG_KEYS
}
