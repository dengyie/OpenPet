'use strict'

const { isWithinQuietHours, normalizeCompanionSettings } = require('./companion-settings')

const MAX_LEASE_MS = 30_000
const MIN_LEASE_MS = 250
const OWNER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,63}$/
const CLIP_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/
const SIGNAL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/
const ROLES = new Set(['desktop-pet', 'preview'])

const bounded = (value, pattern, fieldName) => {
  const normalized = String(value || '').trim()
  if (!pattern.test(normalized)) throw new TypeError(`Companion audio ${fieldName} is invalid`)
  return normalized
}

const createCompanionAudioLeaseService = ({
  now = () => Date.now(),
  getSettings = () => ({}),
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) => {
  let lease = null
  let expiryTimer = null
  let disposed = false

  const clearExpiryTimer = () => {
    if (expiryTimer) clearTimer(expiryTimer)
    expiryTimer = null
  }

  const expire = () => {
    if (lease && lease.expiresAt <= now()) lease = null
    clearExpiryTimer()
    if (lease) {
      expiryTimer = setTimer(expire, Math.max(0, lease.expiresAt - now()))
      expiryTimer?.unref?.()
    }
  }

  const getNormalizedSettings = () => {
    const rawSettings = getSettings()
    return normalizeCompanionSettings(rawSettings?.companion && typeof rawSettings.companion === 'object'
      ? rawSettings.companion
      : rawSettings)
  }

  const isPlaybackAllowed = () => {
    const settings = getNormalizedSettings()
    return settings.enabled && settings.voice.enabled && !isWithinQuietHours(settings, new Date(now()))
  }

  const snapshot = () => {
    expire()
    if (!isPlaybackAllowed()) {
      lease = null
      clearExpiryTimer()
    }
    if (!lease) return { active: false, ownerId: '', role: '', source: '', clipId: '', signalId: '', expiresAt: 0 }
    return { active: true, ownerId: lease.ownerId, role: lease.role, source: lease.source, clipId: lease.clipId, signalId: lease.signalId, expiresAt: lease.expiresAt }
  }

  const request = ({ ownerId, role, source = 'companion', clipId, durationMs = 5000, signalId } = {}) => {
    if (disposed) return { granted: false, reason: 'disposed', lease: snapshot() }
    const settings = getNormalizedSettings()
    if (!settings.enabled || !settings.voice.enabled) return { granted: false, reason: 'voice-disabled', lease: snapshot() }
    if (isWithinQuietHours(settings, new Date(now()))) return { granted: false, reason: 'quiet-hours', lease: snapshot() }
    const normalizedOwnerId = bounded(ownerId, OWNER_PATTERN, 'ownerId')
    const normalizedRole = String(role || '').trim()
    if (!ROLES.has(normalizedRole)) throw new TypeError('Companion audio role is invalid')
    const normalizedSource = bounded(source, OWNER_PATTERN, 'source')
    const normalizedClipId = bounded(clipId, CLIP_PATTERN, 'clipId')
    const normalizedSignalId = bounded(signalId, SIGNAL_PATTERN, 'signalId')
    const duration = Math.min(MAX_LEASE_MS, Math.max(MIN_LEASE_MS, Math.trunc(Number(durationMs))))
    if (!Number.isFinite(duration)) throw new TypeError('Companion audio durationMs is invalid')
    expire()
    if (lease) {
      if (lease.signalId === normalizedSignalId) return { granted: false, reason: 'duplicate-signal', lease: snapshot() }
      return { granted: false, reason: 'lease-held', lease: snapshot() }
    }
    lease = {
      ownerId: normalizedOwnerId,
      role: normalizedRole,
      source: normalizedSource,
      clipId: normalizedClipId,
      signalId: normalizedSignalId,
      expiresAt: now() + duration
    }
    expire()
    return { granted: true, reason: 'granted', lease: snapshot() }
  }

  const release = ({ ownerId, signalId } = {}) => {
    expire()
    if (!lease) return { released: false, reason: 'no-lease', lease: snapshot() }
    if (lease.ownerId !== String(ownerId || '').trim() || lease.signalId !== String(signalId || '').trim()) {
      return { released: false, reason: 'owner-mismatch', lease: snapshot() }
    }
    lease = null
    clearExpiryTimer()
    return { released: true, reason: 'released', lease: snapshot() }
  }

  const heartbeat = ({ ownerId, signalId, durationMs = 5000 } = {}) => {
    expire()
    if (!lease) return { renewed: false, reason: 'no-lease', lease: snapshot() }
    if (lease.ownerId !== String(ownerId || '').trim() || lease.signalId !== String(signalId || '').trim()) {
      return { renewed: false, reason: 'owner-mismatch', lease: snapshot() }
    }
    const duration = Number(durationMs)
    if (!Number.isFinite(duration) || duration < MIN_LEASE_MS) throw new TypeError('Companion audio durationMs is invalid')
    lease.expiresAt = now() + Math.min(MAX_LEASE_MS, Math.trunc(duration))
    expire()
    return { renewed: true, reason: 'renewed', lease: snapshot() }
  }

  const dispose = () => {
    disposed = true
    lease = null
    clearExpiryTimer()
  }

  return { request, release, heartbeat, getSnapshot: snapshot, dispose, constants: Object.freeze({ MAX_LEASE_MS, MIN_LEASE_MS }) }
}

module.exports = { MAX_LEASE_MS, MIN_LEASE_MS, createCompanionAudioLeaseService }
