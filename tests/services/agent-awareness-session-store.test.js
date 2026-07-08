const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createSessionStore } = require('../../examples/plugins/agent-awareness/service/session-store')

test('session store migrates legacy sessions.json into schema v2', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-store-v2-'))
  fs.writeFileSync(path.join(dataDir, 'sessions.json'), `${JSON.stringify({
    sessions: [{
      sessionId: 'legacy-a',
      project: 'OpenPet #111111',
      status: 'working',
      type: 'turn.usage',
      timestamp: '2026-07-08T10:00:00.000Z',
      usage: {
        totalTokens: 1500,
        estimatedCostUsd: 0.012,
        currency: 'USD',
        contextUsedPercent: 0.75
      },
      history: [{
        type: 'turn.usage',
        timestamp: '2026-07-08T10:00:00.000Z',
        usage: {
          totalTokens: 1500,
          estimatedCostUsd: 0.012,
          currency: 'USD',
          contextUsedPercent: 0.75
        }
      }]
    }],
    stats: { totalEvents: 1 }
  }, null, 2)}\n`)

  const store = createSessionStore({
    dataDir,
    now: () => '2026-07-09T12:00:00.000Z',
    retentionDays: 30,
    maxSessions: 5,
    maxEvents: 10
  })

  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'sessions.json'), 'utf-8'))
  assert.equal(persisted.schemaVersion, 2)
  assert.equal(persisted.retentionDays, 30)
  assert.equal(Array.isArray(persisted.liveSessions), true)
  assert.equal(Array.isArray(persisted.sessionSummaries), true)
  assert.equal(Array.isArray(persisted.dailyUsageRollups), true)
  assert.equal(store.listSessions().length, 1)
  assert.equal(store.listLiveSessions().length, 1)
  assert.equal(store.listSessionSummaries().length, 1)
  assert.equal(fs.existsSync(path.join(dataDir, 'sessions.v1.backup.json')), true)
})

test('session store keeps running with sanitized storeError when legacy migration fails', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-store-v2-fail-'))
  fs.writeFileSync(path.join(dataDir, 'sessions.json'), '{"sessions":[')

  const store = createSessionStore({
    dataDir,
    now: () => '2026-07-09T12:00:00.000Z',
    retentionDays: 30
  })

  const status = store.getStatus()
  assert.equal(store.listLiveSessions().length, 0)
  assert.equal(store.listSessionSummaries().length, 0)
  assert.equal(store.listDailyUsageRollups().length, 0)
  assert.match(status.storeError, /Unable to load retained history/)
  assert.equal(status.storeError.includes('/Users/'), false)
})
