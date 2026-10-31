const test = require('node:test')
const assert = require('node:assert/strict')

const { isWithinQuietHours, normalizeCompanionSettings } = require('../../apps/desktop/src/services/companion-settings')

test('normalizes bounded companion settings and rejects invalid session focus', () => {
  assert.deepEqual(normalizeCompanionSettings({
    enabled: false,
    focusedSessionKey: 'not-a-hash',
    noticeCooldownMs: { completed: -10, waiting: 999999999, failed: 1000.4 },
    quietHours: { enabled: true, start: 'bad', end: '08:30' },
    voice: { enabled: true, language: 'fr-FR', volume: 4 },
    idleMotion: { enabled: false, intensity: -1 }
  }), {
    enabled: false,
    focusedSessionKey: '',
    noticeCooldownMs: { completed: 0, waiting: 86400000, failed: 1000 },
    quietHours: { enabled: true, start: '22:00', end: '08:30' },
    voice: { enabled: true, language: 'zh-CN', volume: 1 },
    idleMotion: { enabled: false, intensity: 0 }
  })
})

test('quiet hours support both same-day and overnight windows', () => {
  const overnight = { quietHours: { enabled: true, start: '22:00', end: '08:00' } }
  assert.equal(isWithinQuietHours(overnight, new Date('2026-01-01T23:00:00')), true)
  assert.equal(isWithinQuietHours(overnight, new Date('2026-01-01T07:59:00')), true)
  assert.equal(isWithinQuietHours(overnight, new Date('2026-01-01T12:00:00')), false)
  const sameDay = { quietHours: { enabled: true, start: '09:00', end: '17:00' } }
  assert.equal(isWithinQuietHours(sameDay, new Date('2026-01-01T12:00:00')), true)
  assert.equal(isWithinQuietHours(sameDay, new Date('2026-01-01T18:00:00')), false)
})
