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

test('session store attributes only positive usage deltas into daily rollups', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-rollups-'))
  const store = createSessionStore({
    dataDir,
    now: () => '2026-07-09T12:00:00.000Z',
    retentionDays: 30,
    maxSessions: 5,
    maxEvents: 10
  })

  store.upsertEvent({
    sessionId: 'session-a',
    project: 'OpenPet #111111',
    status: 'working',
    type: 'turn.usage',
    timestamp: '2026-07-08T09:00:00.000Z',
    usage: {
      totalTokens: 1000,
      inputTokens: 700,
      outputTokens: 250,
      cachedInputTokens: 50,
      estimatedCostUsd: 0.01,
      currency: 'USD',
      contextUsedPercent: 0.5
    }
  })
  store.upsertEvent({
    sessionId: 'session-a',
    project: 'OpenPet #111111',
    status: 'working',
    type: 'turn.usage',
    timestamp: '2026-07-08T10:00:00.000Z',
    usage: {
      totalTokens: 1500,
      inputTokens: 1000,
      outputTokens: 400,
      cachedInputTokens: 100,
      estimatedCostUsd: 0.015,
      currency: 'USD',
      contextUsedPercent: 0.75
    }
  })
  store.upsertEvent({
    sessionId: 'session-a',
    project: 'OpenPet #111111',
    status: 'working',
    type: 'turn.usage',
    timestamp: '2026-07-09T10:00:00.000Z',
    usage: {
      totalTokens: 1700,
      inputTokens: 1100,
      outputTokens: 500,
      cachedInputTokens: 100,
      estimatedCostUsd: 0.017,
      currency: 'USD',
      contextUsedPercent: 0.8
    }
  })

  const { dailyUsageRollups, sessionSummaries } = store.getDashboardState()
  assert.equal(dailyUsageRollups.find((row) => row.date === '2026-07-08').totals.tokenDelta, 1500)
  assert.equal(dailyUsageRollups.find((row) => row.date === '2026-07-09').totals.tokenDelta, 200)
  assert.equal(sessionSummaries[0].usageLatest.totalTokens, 1700)
  assert.equal(sessionSummaries[0].usagePeak.contextUsedPercent, 0.8)
})

test('session store prunes rollups and summaries older than the 30-day window', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-rollups-prune-'))
  const store = createSessionStore({
    dataDir,
    now: () => '2026-07-31T12:00:00.000Z',
    retentionDays: 30,
    maxSessions: 5,
    maxEvents: 10
  })

  store.upsertEvent({
    sessionId: 'old-session',
    project: 'Old #111111',
    status: 'completed',
    type: 'turn.usage',
    timestamp: '2026-06-01T10:00:00.000Z',
    usage: {
      totalTokens: 500,
      estimatedCostUsd: 0.005,
      currency: 'USD',
      contextUsedPercent: 0.3
    }
  })
  store.upsertEvent({
    sessionId: 'new-session',
    project: 'New #222222',
    status: 'working',
    type: 'turn.usage',
    timestamp: '2026-07-30T10:00:00.000Z',
    usage: {
      totalTokens: 1200,
      estimatedCostUsd: 0.012,
      currency: 'USD',
      contextUsedPercent: 0.7
    }
  })

  const status = store.getStatus()
  assert.equal(store.listSessionSummaries().some((item) => item.sessionId === 'old-session'), false)
  assert.equal(store.listDailyUsageRollups().some((item) => item.date === '2026-06-01'), false)
  assert.equal(status.retainedSessionSummaryCount, 1)
})

test('session store prunes expired retained history on load without new events', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-rollups-prune-load-'))
  let store = createSessionStore({
    dataDir,
    now: () => '2026-07-01T12:00:00.000Z',
    retentionDays: 30,
    maxSessions: 5,
    maxEvents: 10
  })

  store.upsertEvent({
    sessionId: 'session-a',
    project: 'OpenPet #111111',
    status: 'completed',
    type: 'turn.usage',
    timestamp: '2026-07-01T10:00:00.000Z',
    usage: {
      totalTokens: 1000,
      estimatedCostUsd: 0.01,
      currency: 'USD',
      contextUsedPercent: 0.5
    }
  })

  store = createSessionStore({
    dataDir,
    now: () => '2026-09-15T12:00:00.000Z',
    retentionDays: 30,
    maxSessions: 5,
    maxEvents: 10
  })

  const status = store.getStatus()
  assert.equal(store.listSessionSummaries().length, 0)
  assert.equal(store.listDailyUsageRollups().length, 0)
  assert.equal(status.historyWindowStart, '')
  assert.equal(status.historyWindowEnd, '')
})

test('session store keeps durable lifetime usage totals after daily retention and restart', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-lifetime-usage-'))
  let store = createSessionStore({
    dataDir,
    now: () => '2026-07-01T12:00:00.000Z',
    retentionDays: 2,
    maxSessions: 5,
    maxEvents: 10
  })

  store.upsertEvent({
    sessionId: 'session-a',
    project: 'OpenPet #111111',
    status: 'completed',
    type: 'turn.usage',
    timestamp: '2026-06-01T10:00:00.000Z',
    usage: {
      totalTokens: 1000,
      inputTokens: 700,
      outputTokens: 300,
      estimatedCostUsd: 0.01,
      currency: 'USD',
      contextUsedPercent: 0.5
    }
  })

  store = createSessionStore({
    dataDir,
    now: () => '2026-07-01T12:00:00.000Z',
    retentionDays: 2,
    maxSessions: 5,
    maxEvents: 10
  })

  const state = store.getDashboardState()
  assert.equal(state.dailyUsageRollups.length, 0)
  assert.deepEqual(state.usageLifetime, {
    tokenDelta: 1000,
    inputTokenDelta: 700,
    outputTokenDelta: 300,
    cachedInputTokenDelta: 0,
    costDeltaUsd: 0.01,
    currency: 'USD',
    peakContextUsedPercent: 0.5,
    eventCount: 1,
    firstSeenAt: '2026-06-01T10:00:00.000Z',
    lastSeenAt: '2026-06-01T10:00:00.000Z'
  })
})

test('session store reapplies live event retention on load without new events', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-live-evict-load-'))
  let store = createSessionStore({
    dataDir,
    now: () => '2026-07-09T12:00:00.000Z',
    retentionDays: 30,
    maxSessions: 5,
    maxEvents: 10
  })

  for (let index = 1; index <= 5; index += 1) {
    store.upsertEvent({
      sessionId: 'session-a',
      project: 'OpenPet #111111',
      status: 'working',
      type: 'tool.started',
      timestamp: `2026-07-09T10:0${index}:00.000Z`,
      message: `event-${index}`
    })
  }

  store = createSessionStore({
    dataDir,
    now: () => '2026-07-09T12:05:00.000Z',
    retentionDays: 30,
    maxSessions: 5,
    maxEvents: 3
  })

  const state = store.getDashboardState()
  const status = store.getStatus()
  assert.equal(state.liveSessions[0].history.length, 3)
  assert.equal(state.sessionSummaries[0].eventCount, 5)
  assert.equal(status.totalEvents, 5)
})

test('session store reapplies live session retention on load without new events', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-live-session-load-'))
  let store = createSessionStore({
    dataDir,
    now: () => '2026-07-09T12:00:00.000Z',
    retentionDays: 30,
    maxSessions: 5,
    maxEvents: 10
  })

  for (let index = 1; index <= 4; index += 1) {
    store.upsertEvent({
      sessionId: `session-${index}`,
      project: `Project-${index} #111111`,
      status: 'working',
      type: 'tool.started',
      timestamp: `2026-07-09T10:0${index}:00.000Z`,
      message: `event-${index}`
    })
  }

  store = createSessionStore({
    dataDir,
    now: () => '2026-07-09T12:05:00.000Z',
    retentionDays: 30,
    maxSessions: 2,
    maxEvents: 10
  })

  const state = store.getDashboardState()
  const status = store.getStatus()
  assert.deepEqual(state.liveSessions.map((session) => session.sessionId), ['session-4', 'session-3'])
  assert.equal(state.sessionSummaries.length, 4)
  assert.equal(status.totalEvents, 4)
})

test('session store self-heals stale v2 stats on load without requiring retention changes', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-stats-heal-load-'))
  fs.writeFileSync(path.join(dataDir, 'sessions.json'), `${JSON.stringify({
    schemaVersion: 2,
    updatedAt: '2026-07-09T09:59:00.000Z',
    retentionDays: 30,
    liveSessions: [{
      sessionId: 'session-a',
      project: 'OpenPet #111111',
      status: 'working',
      type: 'approval.requested',
      timestamp: '2026-07-09T10:03:00.000Z',
      history: [
        { type: 'session.discovered', timestamp: '2026-07-09T10:01:00.000Z' },
        { type: 'tool.started', timestamp: '2026-07-09T10:02:00.000Z' },
        { type: 'approval.requested', timestamp: '2026-07-09T10:03:00.000Z' }
      ]
    }],
    sessionSummaries: [{
      sessionId: 'session-a',
      project: 'OpenPet #111111',
      firstSeenAt: '2026-07-09T10:01:00.000Z',
      lastSeenAt: '2026-07-09T10:05:00.000Z',
      status: 'working',
      phase: 'approval',
      lastEventType: 'approval.requested',
      eventCount: 5,
      timelineTail: [
        { type: 'session.discovered', timestamp: '2026-07-09T10:01:00.000Z' },
        { type: 'tool.started', timestamp: '2026-07-09T10:02:00.000Z' },
        { type: 'approval.requested', timestamp: '2026-07-09T10:03:00.000Z' },
        { type: 'tool.completed', timestamp: '2026-07-09T10:04:00.000Z' },
        { type: 'approval.requested', timestamp: '2026-07-09T10:05:00.000Z' }
      ]
    }],
    dailyUsageRollups: [],
    stats: {
      totalEvents: 3,
      lastEventAt: '2026-07-09T10:03:00.000Z'
    }
  }, null, 2)}\n`)

  const store = createSessionStore({
    dataDir,
    now: () => '2026-07-09T12:00:00.000Z',
    retentionDays: 30,
    maxSessions: 5,
    maxEvents: 10
  })

  const status = store.getStatus()
  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'sessions.json'), 'utf-8'))
  assert.equal(status.totalEvents, 5)
  assert.equal(status.lastEventAt, '2026-07-09T10:05:00.000Z')
  assert.equal(persisted.stats.totalEvents, 5)
  assert.equal(persisted.stats.lastEventAt, '2026-07-09T10:05:00.000Z')
})

test('session store keeps live and retained timelines ordered when an older event arrives late', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-timeline-order-'))
  const store = createSessionStore({
    dataDir,
    now: () => '2026-07-09T12:00:00.000Z',
    retentionDays: 30,
    maxSessions: 5,
    maxEvents: 10
  })

  store.upsertEvent({
    sessionId: 'session-a',
    project: 'OpenPet #111111',
    status: 'waiting',
    type: 'approval.requested',
    message: 'Codex needs approval.',
    timestamp: '2026-07-09T10:05:00.000Z'
  })
  store.upsertEvent({
    sessionId: 'session-a',
    project: 'OpenPet #111111',
    status: 'idle',
    type: 'session.discovered',
    message: '',
    timestamp: '2026-07-09T10:01:00.000Z'
  })

  const state = store.getDashboardState()
  assert.deepEqual(state.liveSessions[0].history.map((entry) => entry.timestamp), [
    '2026-07-09T10:01:00.000Z',
    '2026-07-09T10:05:00.000Z'
  ])
  assert.deepEqual(state.sessionSummaries[0].timelineTail.map((entry) => entry.timestamp), [
    '2026-07-09T10:01:00.000Z',
    '2026-07-09T10:05:00.000Z'
  ])
  assert.equal(state.sessionSummaries[0].timelineTail.at(-1).type, 'approval.requested')
})

test('session store keeps retained summary counts when live history is evicted', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-rollups-evict-'))
  const store = createSessionStore({
    dataDir,
    now: () => '2026-07-09T12:00:00.000Z',
    retentionDays: 30,
    maxSessions: 5,
    maxEvents: 3
  })

  for (let index = 1; index <= 5; index += 1) {
    store.upsertEvent({
      sessionId: 'session-a',
      project: 'OpenPet #111111',
      status: 'working',
      type: 'turn.usage',
      timestamp: `2026-07-09T10:0${index}:00.000Z`,
      usage: {
        totalTokens: index * 100,
        estimatedCostUsd: index * 0.001,
        currency: 'USD',
        contextUsedPercent: index * 0.1
      }
    })
  }

  const state = store.getDashboardState()
  const status = store.getStatus()
  assert.equal(state.liveSessions[0].history.length, 3)
  assert.equal(state.sessionSummaries[0].eventCount, 5)
  assert.equal(state.sessionSummaries[0].timelineTail.length, 5)
  assert.equal(state.dailyUsageRollups[0].totals.tokenDelta, 500)
  assert.equal(status.totalEvents, 5)
})

test('session store migrates legacy usage history into retained rollups and keeps the last snapshot', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-store-v2-migrate-rollups-'))
  fs.writeFileSync(path.join(dataDir, 'sessions.json'), `${JSON.stringify({
    sessions: [{
      sessionId: 'legacy-a',
      project: 'OpenPet #111111',
      status: 'working',
      type: 'turn.usage',
      timestamp: '2026-07-08T12:00:00.000Z',
      usage: {
        totalTokens: 1500,
        estimatedCostUsd: 0.012,
        currency: 'USD',
        contextUsedPercent: 0.75
      },
      history: [
        {
          type: 'turn.usage',
          timestamp: '2026-07-08T10:00:00.000Z',
          usage: {
            totalTokens: 500,
            estimatedCostUsd: 0.004,
            currency: 'USD',
            contextUsedPercent: 0.25
          }
        },
        {
          type: 'turn.usage',
          timestamp: '2026-07-08T11:00:00.000Z',
          usage: {
            totalTokens: 1000,
            estimatedCostUsd: 0.008,
            currency: 'USD',
            contextUsedPercent: 0.5
          }
        },
        {
          type: 'turn.usage',
          timestamp: '2026-07-08T12:00:00.000Z',
          usage: {
            totalTokens: 1500,
            estimatedCostUsd: 0.012,
            currency: 'USD',
            contextUsedPercent: 0.75
          }
        }
      ]
    }],
    stats: { totalEvents: 3 }
  }, null, 2)}\n`)

  const store = createSessionStore({
    dataDir,
    now: () => '2026-07-09T12:00:00.000Z',
    retentionDays: 30,
    maxSessions: 5,
    maxEvents: 10
  })

  let state = store.getDashboardState()
  assert.equal(state.dailyUsageRollups.find((row) => row.date === '2026-07-08').totals.tokenDelta, 1500)
  assert.equal(state.sessionSummaries[0].lastUsageSnapshot.totalTokens, 1500)

  store.upsertEvent({
    sessionId: 'legacy-a',
    project: 'OpenPet #111111',
    status: 'working',
    type: 'turn.usage',
    timestamp: '2026-07-09T10:00:00.000Z',
    usage: {
      totalTokens: 1700,
      estimatedCostUsd: 0.014,
      currency: 'USD',
      contextUsedPercent: 0.8
    }
  })

  state = store.getDashboardState()
  assert.equal(state.dailyUsageRollups.find((row) => row.date === '2026-07-09').totals.tokenDelta, 200)
})
