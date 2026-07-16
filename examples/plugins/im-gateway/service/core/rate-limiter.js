const createSlidingWindowRateLimiter = ({
  nowMs = () => Date.now(),
  windowMs = 30000,
  maxKeys = 1000,
  limits = { private: 6, group: 3 }
} = {}) => {
  const windows = new Map()
  const boundedWindowMs = Math.max(1, Number(windowMs) || 30000)
  const boundedMaxKeys = Math.max(1, Number(maxKeys) || 1000)

  const consume = (key, kind = 'private') => {
    const normalizedKey = String(key || '').trim()
    const normalizedKind = kind === 'private' ? 'private' : 'group'
    const limit = Math.max(1, Number(limits[normalizedKind]) || (normalizedKind === 'private' ? 6 : 3))
    const currentTime = Number(nowMs()) || 0
    const cutoff = currentTime - boundedWindowMs
    const existing = (windows.get(normalizedKey) || []).filter((timestamp) => timestamp > cutoff)

    if (windows.has(normalizedKey)) windows.delete(normalizedKey)
    while (!windows.has(normalizedKey) && windows.size >= boundedMaxKeys) {
      windows.delete(windows.keys().next().value)
    }

    const allowed = existing.length < limit
    if (allowed) existing.push(currentTime)
    windows.set(normalizedKey, existing)
    return {
      allowed,
      retryAfterMs: allowed ? 0 : Math.max(1, existing[0] + boundedWindowMs - currentTime),
      trackedKeyCount: windows.size
    }
  }

  return {
    clear: () => windows.clear(),
    consume
  }
}

module.exports = {
  createSlidingWindowRateLimiter
}
