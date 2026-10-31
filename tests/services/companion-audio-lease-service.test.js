const test = require('node:test')
const assert = require('node:assert/strict')

const { createCompanionAudioLeaseService } = require('../../apps/desktop/src/services/companion-audio-lease-service')

const createClock = (settings = {}) => {
  let current = 1000
  const timers = []
  const service = createCompanionAudioLeaseService({
    now: () => current,
    getSettings: () => ({ companion: { voice: { enabled: true }, ...settings } }),
    setTimer: (fn, delay) => {
      const timer = { fn, at: current + delay }
      timers.push(timer)
      return timer
    },
    clearTimer: (timer) => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    }
  })
  return {
    service,
    advance(ms) {
      current += ms
      for (const timer of timers.splice(0)) if (timer.at <= current) timer.fn()
    }
  }
}

test('audio lease admits one speaker, suppresses duplicate signals, and releases by owner', () => {
  const { service } = createClock()
  const granted = service.request({ ownerId: 'pet-window', role: 'desktop-pet', clipId: 'waiting', signalId: 'signal-1', durationMs: 5000 })
  assert.equal(granted.granted, true)
  assert.equal(service.request({ ownerId: 'pet-window', role: 'desktop-pet', clipId: 'waiting', signalId: 'signal-1' }).reason, 'duplicate-signal')
  assert.equal(service.request({ ownerId: 'preview', role: 'preview', clipId: 'success', signalId: 'signal-2' }).reason, 'lease-held')
  assert.equal(service.release({ ownerId: 'other', signalId: 'signal-1' }).reason, 'owner-mismatch')
  assert.equal(service.release({ ownerId: 'pet-window', signalId: 'signal-1' }).released, true)
  assert.equal(service.getSnapshot().active, false)
})

test('audio lease expires, renews with heartbeat, and respects voice policy', () => {
  const clock = createClock()
  assert.equal(clock.service.request({ ownerId: 'pet-window', role: 'desktop-pet', clipId: 'work', signalId: 'signal-1', durationMs: 500 }).granted, true)
  clock.advance(200)
  assert.equal(clock.service.heartbeat({ ownerId: 'pet-window', signalId: 'signal-1', durationMs: 1000 }).renewed, true)
  clock.advance(1001)
  assert.equal(clock.service.getSnapshot().active, false)
  const disabled = createClock({ voice: { enabled: false } }).service
  assert.equal(disabled.request({ ownerId: 'pet-window', role: 'desktop-pet', clipId: 'work', signalId: 'signal-2' }).reason, 'voice-disabled')
})

test('audio lease is released when Companion is disabled while playback is active', () => {
  let settings = { companion: { enabled: true, voice: { enabled: true } } }
  const service = createCompanionAudioLeaseService({
    now: () => 1000,
    getSettings: () => settings
  })

  assert.equal(service.request({ ownerId: 'pet-window', role: 'desktop-pet', clipId: 'waiting', signalId: 'signal-1' }).granted, true)
  settings = { companion: { enabled: false, voice: { enabled: true } } }
  assert.equal(service.getSnapshot().active, false)
})
