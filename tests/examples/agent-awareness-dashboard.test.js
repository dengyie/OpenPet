const test = require('node:test')
const assert = require('node:assert/strict')

const { createDashboardRuntime } = require('../../examples/plugins/agent-awareness/web/dashboard/dashboard.js')

test('agent awareness dashboard builds structured summary and diagnostics view models', () => {
  const runtime = createDashboardRuntime({ documentRef: null, fetchImpl: null })
  const viewModel = runtime.buildDashboardViewModel({
    health: {
      ok: true,
      service: 'agent-awareness',
      hookMode: {
        installed: false,
        mode: 'not-installed',
        planAvailable: true,
        tokenConfigured: true,
        ingestAuthRequired: true
      },
      diagnostics: {
        activeSessionCount: 1,
        totalEvents: 12,
        seenCount: 7,
        ignoredContentRecordCount: 5,
        ignoredMetadataRecordCount: 3,
        unknownRecordCount: 2,
        malformedRecordCount: 1,
        unsupportedLifecycleRecordCount: 2,
        lastEventAt: '2026-07-03T12:00:00.000Z',
        lastScanAt: '2026-07-03T12:00:03.000Z',
        lastError: 'Polling failed at /Users/mango/private/OpenPet via http://127.0.0.1:8795/health with Bearer secret-token'
      },
      codexPoller: {
        enabled: true,
        lastError: ''
      }
    },
    sessionsPayload: {
      sessions: [
        {
          sessionId: 'abc123',
          project: 'OpenPet #123456',
          status: 'working',
          type: 'tool.started',
          message: 'Codex started a tool call at /Users/mango/private/OpenPet via http://127.0.0.1:8795.',
          timestamp: '2026-07-03T12:00:00.000Z',
          history: [
            {
              type: 'tool.started',
              status: 'working',
              message: 'Codex started a tool call at /Users/mango/private/OpenPet via http://127.0.0.1:8795.',
              timestamp: '2026-07-03T12:00:00.000Z'
            }
          ]
        },
        {
          sessionId: 'done456',
          project: 'Docs #654321',
          status: 'completed',
          type: 'turn.completed',
          message: 'Codex completed a turn.',
          timestamp: '2026-07-03T11:00:00.000Z',
          history: []
        }
      ]
    }
  })

  assert.equal(viewModel.summary[0].label, 'Tracked Sessions')
  assert.equal(viewModel.summary[0].detail, '1 active now')
  assert.equal(viewModel.summary[1].detail, '7 rollout events derived')
  assert.equal(viewModel.summary[3].value, 'Plan ready')
  assert.equal(viewModel.healthRows[2].value, '2')
  assert.equal(viewModel.healthRows[2].detail, '5 content · 3 metadata · 2 unsupported')
  assert.equal(viewModel.healthRows[5].detail, 'Polling failed at [path] via [local-url] with Bearer [redacted]')
  assert.equal(viewModel.sessions[0].status.label, 'Working')
  assert.equal(viewModel.sessions[0].message, 'Codex started a tool call at [path] via [local-url].')
  assert.equal(viewModel.sessions[0].timeline[0].type, 'tool.started')
  assert.equal(viewModel.sessions[0].timeline[0].message, 'Codex started a tool call at [path] via [local-url].')
})

test('agent awareness dashboard renders safe usage git and summary metadata', () => {
  const runtime = createDashboardRuntime({ documentRef: null, fetchImpl: null })
  const viewModel = runtime.buildDashboardViewModel({
    health: {
      ok: true,
      diagnostics: {
        activeSessionCount: 1,
        totalEvents: 3,
        seenCount: 3,
        usageTotalTokens: 1500,
        usageInputTokens: 1000,
        usageOutputTokens: 500,
        usageCachedInputTokens: 100,
        usageEstimatedCostUsd: 0.03,
        usageCurrency: 'USD',
        usagePeakContextUsedPercent: 0.8
      }
    },
    sessionsPayload: {
      sessions: [{
        sessionId: 'abc123def456',
        project: 'OpenPet #111111',
        status: 'working',
        type: 'turn.usage',
        timestamp: '2026-07-07T00:00:00.000Z',
        usage: {
          totalTokens: 1500,
          contextWindow: 200000,
          contextUsedPercent: 0.75,
          estimatedCostUsd: 0.012345,
          currency: 'USD'
        },
        git: {
          branch: 'codex/dev7',
          dirty: true,
          dirtyCount: 2,
          ahead: 1,
          behind: 0
        },
        summary: {
          title: 'OpenPet on codex/dev7',
          recentProgressHint: 'Working in /Users/mango/private/project/OpenPet'
        }
      }]
    }
  })

  const usageMetric = viewModel.summary.find((item) => item.label === 'Usage Tokens')
  const costMetric = viewModel.summary.find((item) => item.label === 'Usage Cost')
  const contextMetric = viewModel.summary.find((item) => item.label === 'Peak Context')
  assert.equal(usageMetric.value, '1,500')
  assert.equal(usageMetric.detail, '1,000 input · 500 output · 100 cached')
  assert.equal(costMetric.value, '$0.030000 USD')
  assert.equal(contextMetric.value, '0.8%')
  assert.match(viewModel.sessions[0].usageText, /1,500 tokens/)
  assert.match(viewModel.sessions[0].usageText, /0.75% context/)
  assert.match(viewModel.sessions[0].usageText, /\$0.012345 USD/)
  assert.match(viewModel.sessions[0].gitText, /codex\/dev7/)
  assert.match(viewModel.sessions[0].gitText, /2 files changed/)
  assert.match(viewModel.sessions[0].summaryTitle, /OpenPet on codex\/dev7/)
  assert.equal(viewModel.sessions[0].progressHint, 'Working in [path]')
})

test('agent awareness dashboard does not render null usage metadata as zero values', () => {
  const runtime = createDashboardRuntime({ documentRef: null, fetchImpl: null })
  const viewModel = runtime.buildDashboardViewModel({
    health: {
      ok: true,
      diagnostics: {
        usageTotalTokens: 0,
        usageEstimatedCostUsd: null,
        usagePeakContextUsedPercent: null
      }
    },
    sessionsPayload: {
      sessions: [{
        sessionId: 'abc123def456',
        project: 'OpenPet #111111',
        status: 'working',
        type: 'turn.usage',
        timestamp: '2026-07-07T00:00:00.000Z',
        usage: {
          totalTokens: null,
          contextUsedPercent: null,
          estimatedCostUsd: null
        }
      }]
    }
  })

  const costMetric = viewModel.summary.find((item) => item.label === 'Usage Cost')
  const contextMetric = viewModel.summary.find((item) => item.label === 'Peak Context')

  assert.equal(costMetric.value, 'No cost metadata')
  assert.equal(contextMetric.value, 'No context metadata')
  assert.equal(viewModel.sessions[0].usageText, 'No usage metadata yet')
  assert.equal(viewModel.usageStats.length, 0)
  assert.match(runtime.renderDashboard(viewModel).usageStatsHtml, /No usage trend metadata yet/)
})

test('agent awareness dashboard builds bounded usage stats from retained daily rollups', () => {
  const runtime = createDashboardRuntime({ documentRef: null, fetchImpl: null })
  const viewModel = runtime.buildDashboardViewModel({
    health: {
      ok: true,
      diagnostics: {
        activeSessionCount: 1,
        totalEvents: 4,
        seenCount: 4
      }
    },
    sessionsPayload: {
      liveSessions: [
        {
          sessionId: 'session-a',
          project: 'OpenPet #111111',
          status: 'working',
          type: 'turn.usage',
          timestamp: '2026-07-07T12:00:00.000Z',
          usage: {
            totalTokens: 1500,
            estimatedCostUsd: 0.012,
            currency: 'USD',
            contextUsedPercent: 0.75
          },
          history: [
            {
              type: 'turn.usage',
              timestamp: '2026-07-06T12:00:00.000Z',
              usage: {
                totalTokens: 800,
                estimatedCostUsd: 0.006,
                currency: 'USD',
                contextUsedPercent: 0.4
              }
            },
            {
              type: 'turn.usage',
              timestamp: '2026-07-07T11:00:00.000Z',
              usage: {
                totalTokens: 1200,
                estimatedCostUsd: 0.01,
                currency: 'USD',
                contextUsedPercent: 0.6
              }
            },
            {
              type: 'turn.usage',
              timestamp: '2026-07-07T12:00:00.000Z',
              usage: {
                totalTokens: 1500,
                estimatedCostUsd: 0.012,
                currency: 'USD',
                contextUsedPercent: 0.75
              }
            }
          ]
        },
        {
          sessionId: 'session-b',
          project: 'Docs #222222',
          status: 'completed',
          type: 'turn.usage',
          timestamp: '2026-07-07T13:00:00.000Z',
          usage: {
            totalTokens: 200,
            estimatedCostUsd: 0.002,
            currency: 'USD',
            contextUsedPercent: 0.1
          },
          history: []
        }
      ],
      dailyUsageRollups: [
        {
          date: '2026-07-07',
          totals: {
            tokenDelta: 900,
            costDeltaUsd: 0.008,
            currency: 'USD',
            peakContextUsedPercent: 0.75,
            eventCount: 2,
            sessionCount: 2,
            projectCount: 2
          },
          sessions: [
            {
              sessionId: 'session-a',
              project: 'OpenPet #111111',
              tokenDelta: 700,
              costDeltaUsd: 0.006,
              currency: 'USD',
              peakContextUsedPercent: 0.75,
              eventCount: 1
            },
            {
              sessionId: 'session-b',
              project: 'Docs #222222',
              tokenDelta: 200,
              costDeltaUsd: 0.002,
              currency: 'USD',
              peakContextUsedPercent: 0.1,
              eventCount: 1
            }
          ]
        },
        {
          date: '2026-07-06',
          totals: {
            tokenDelta: 800,
            costDeltaUsd: 0.006,
            currency: 'USD',
            peakContextUsedPercent: 0.4,
            eventCount: 1,
            sessionCount: 1,
            projectCount: 1
          },
          sessions: [
            {
              sessionId: 'session-a',
              project: 'OpenPet #111111',
              tokenDelta: 800,
              costDeltaUsd: 0.006,
              currency: 'USD',
              peakContextUsedPercent: 0.4,
              eventCount: 1
            }
          ]
        }
      ]
    }
  })

  assert.equal(viewModel.usageStats.length, 2)
  assert.deepEqual(viewModel.usageStats[0], {
    date: '2026-07-07',
    tokensText: '900 tokens',
    costText: '$0.008000 USD',
    contextText: '0.75% peak',
    sessionsText: '2 sessions',
    eventsText: '2 events'
  })
  assert.deepEqual(viewModel.usageStats[1], {
    date: '2026-07-06',
    tokensText: '800 tokens',
    costText: '$0.006000 USD',
    contextText: '0.4% peak',
    sessionsText: '1 session',
    eventsText: '1 event'
  })

  const rendered = runtime.renderDashboard(viewModel)
  assert.match(rendered.usageStatsHtml, /Recent Daily Totals/)
  assert.match(rendered.usageStatsHtml, /2026-07-07/)
  assert.match(rendered.usageStatsHtml, /900 tokens/)
  assert.match(rendered.usageStatsHtml, /\$0.008000 USD/)
})

test('agent awareness dashboard supports a dedicated usage stats view', () => {
  const runtime = createDashboardRuntime({ documentRef: null, fetchImpl: null })
  assert.equal(runtime.normalizeDashboardQuery('?view=stats&sessionId=ignored').view, 'usage')

  const viewModel = runtime.buildDashboardViewModel({
    query: {
      view: 'stats',
      sessionId: 'ignored'
    },
    health: {
      ok: true,
      diagnostics: {
        activeSessionCount: 1,
        totalEvents: 4,
        seenCount: 4
      }
    },
    sessionsPayload: {
      liveSessions: [
        {
          sessionId: 'session-a',
          project: 'OpenPet #111111',
          status: 'working',
          type: 'turn.usage',
          timestamp: '2026-07-07T12:00:00.000Z',
          history: [
            {
              type: 'turn.usage',
              timestamp: '2026-07-06T12:00:00.000Z',
              usage: {
                totalTokens: 800,
                estimatedCostUsd: 0.006,
                currency: 'USD',
                contextUsedPercent: 0.4
              }
            },
            {
              type: 'turn.usage',
              timestamp: '2026-07-07T12:00:00.000Z',
              usage: {
                totalTokens: 1500,
                estimatedCostUsd: 0.012,
                currency: 'USD',
                contextUsedPercent: 0.75
              }
            }
          ]
        },
        {
          sessionId: 'session-b',
          project: 'Docs #222222',
          status: 'completed',
          type: 'turn.usage',
          timestamp: '2026-07-07T13:00:00.000Z',
          usage: {
            totalTokens: 200,
            estimatedCostUsd: 0.002,
            currency: 'USD',
            contextUsedPercent: 0.1
          },
          history: []
        }
      ],
      dailyUsageRollups: [
        {
          date: '2026-07-07',
          totals: {
            tokenDelta: 900,
            costDeltaUsd: 0.008,
            currency: 'USD',
            peakContextUsedPercent: 0.75,
            eventCount: 2,
            sessionCount: 2,
            projectCount: 2
          },
          sessions: [
            {
              sessionId: 'session-a',
              project: 'OpenPet #111111',
              tokenDelta: 700,
              costDeltaUsd: 0.006,
              currency: 'USD',
              peakContextUsedPercent: 0.75,
              eventCount: 1
            },
            {
              sessionId: 'session-b',
              project: 'Docs #222222',
              tokenDelta: 200,
              costDeltaUsd: 0.002,
              currency: 'USD',
              peakContextUsedPercent: 0.1,
              eventCount: 1
            }
          ]
        },
        {
          date: '2026-07-06',
          totals: {
            tokenDelta: 800,
            costDeltaUsd: 0.006,
            currency: 'USD',
            peakContextUsedPercent: 0.4,
            eventCount: 1,
            sessionCount: 1,
            projectCount: 1
          },
          sessions: [
            {
              sessionId: 'session-a',
              project: 'OpenPet #111111',
              tokenDelta: 800,
              costDeltaUsd: 0.006,
              currency: 'USD',
              peakContextUsedPercent: 0.4,
              eventCount: 1
            }
          ]
        }
      ]
    }
  })

  const rendered = runtime.renderDashboard(viewModel)

  assert.equal(viewModel.currentView, 'usage')
  assert.equal(viewModel.statsMode, true)
  assert.equal(viewModel.detailMode, false)
  assert.equal(viewModel.usageStatsTotals.daysText, '2 days')
  assert.equal(viewModel.usageStatsTotals.tokensText, '1,700 tokens')
  assert.equal(viewModel.usageStatsTotals.costText, '$0.014000 USD')
  assert.equal(viewModel.usageStatsTotals.contextText, '0.75% peak')
  assert.equal(viewModel.usageStatsTotals.sessionsText, '2 sessions')
  assert.equal(viewModel.usageStatsTotals.eventsText, '3 events')
  assert.match(rendered.usageStatsHtml, /Usage Stats Detail/)
  assert.match(rendered.usageStatsHtml, /1,700 tokens/)
  assert.match(rendered.usageStatsHtml, /\$0.014000 USD/)
})

test('agent awareness dashboard builds a 30-day usage workbench view', () => {
  const runtime = createDashboardRuntime({ documentRef: null, fetchImpl: null })
  const viewModel = runtime.buildDashboardViewModel({
    query: { view: 'usage' },
    health: {
      ok: true,
      diagnostics: {
        activeSessionCount: 2,
        totalEvents: 8,
        seenCount: 8
      }
    },
    sessionsPayload: {
      liveSessions: [],
      sessionSummaries: [
        { sessionId: 'session-a', project: 'OpenPet #111111' },
        { sessionId: 'session-b', project: 'Docs #222222' }
      ],
      dailyUsageRollups: [
        {
          date: '2026-07-09',
          totals: {
            tokenDelta: 1700,
            costDeltaUsd: 0.014,
            currency: 'USD',
            peakContextUsedPercent: 0.75,
            eventCount: 3,
            sessionCount: 2,
            projectCount: 2
          },
          sessions: [
            {
              sessionId: 'session-a',
              project: 'OpenPet #111111',
              tokenDelta: 1500,
              costDeltaUsd: 0.012,
              currency: 'USD',
              peakContextUsedPercent: 0.75,
              eventCount: 2
            },
            {
              sessionId: 'session-b',
              project: 'Docs #222222',
              tokenDelta: 200,
              costDeltaUsd: 0.002,
              currency: 'USD',
              peakContextUsedPercent: 0.1,
              eventCount: 1
            }
          ]
        }
      ]
    }
  })

  assert.equal(viewModel.currentView, 'usage')
  assert.equal(viewModel.usageTotals.tokensText, '1,700 tokens')
  assert.equal(viewModel.topSessions[0].sessionId, 'session-a')
  assert.equal(viewModel.topProjects[0].project, 'OpenPet #111111')
})

test('agent awareness dashboard renders sanitized current step summaries', () => {
  const runtime = createDashboardRuntime({ documentRef: null, fetchImpl: null })
  const viewModel = runtime.buildDashboardViewModel({
    health: {
      ok: true,
      diagnostics: {
        activeSessionCount: 1,
        totalEvents: 1,
        seenCount: 1
      }
    },
    sessionsPayload: {
      sessions: [{
        sessionId: 'abc123def456',
        project: 'OpenPet #111111',
        status: 'working',
        type: 'tool.started',
        timestamp: '2026-07-07T00:00:00.000Z',
        summary: {
          title: 'OpenPet on codex/dev7',
          currentStep: 'Running tool at /Users/mango/private/project/OpenPet',
          recentProgressHint: 'Checking http://127.0.0.1:8795'
        }
      }]
    }
  })

  const rendered = runtime.renderDashboard(viewModel)

  assert.equal(viewModel.sessions[0].currentStep, 'Running tool at [path]')
  assert.match(rendered.sessionsHtml, /Current Step/)
  assert.match(rendered.sessionsHtml, /Running tool at \[path\]/)
  assert.doesNotMatch(rendered.sessionsHtml, /\/Users\/mango\/private/)
  assert.doesNotMatch(rendered.sessionsHtml, /127\.0\.0\.1:8795/)
})

test('agent awareness dashboard focuses requested session in details mode', () => {
  const runtime = createDashboardRuntime({ documentRef: null, fetchImpl: null })
  const viewModel = runtime.buildDashboardViewModel({
    query: {
      view: 'details',
      sessionId: 'target-session'
    },
    health: {
      ok: true,
      diagnostics: {
        activeSessionCount: 2,
        totalEvents: 6,
        seenCount: 6
      }
    },
    sessionsPayload: {
      sessions: [
        {
          sessionId: 'target-session',
          project: 'OpenPet #111111',
          status: 'working',
          type: 'tool.started',
          message: 'Target session',
          timestamp: '2026-07-07T00:00:00.000Z'
        },
        {
          sessionId: 'other-session',
          project: 'Other #222222',
          status: 'waiting',
          type: 'approval.requested',
          message: 'Other session',
          timestamp: '2026-07-07T00:01:00.000Z'
        }
      ]
    }
  })

  assert.equal(viewModel.detailMode, true)
  assert.equal(viewModel.requestedSessionId, 'target-session')
  assert.equal(viewModel.detailFound, true)
  assert.equal(viewModel.sessions.length, 1)
  assert.equal(viewModel.sessions[0].sessionId, 'target-session')
  assert.equal(viewModel.summary[0].value, '2')
  assert.equal(viewModel.summary[0].detail, '2 active now')
  assert.match(viewModel.detailNotice, /Focused Session/)
})

test('agent awareness dashboard routes details alias into the sessions workbench', () => {
  const runtime = createDashboardRuntime({ documentRef: null, fetchImpl: null })

  assert.deepEqual(runtime.normalizeDashboardQuery('?view=details&sessionId=target-session'), {
    view: 'sessions',
    sessionId: 'target-session'
  })
})

test('agent awareness dashboard builds a selected session workbench from stable summaries', () => {
  const runtime = createDashboardRuntime({ documentRef: null, fetchImpl: null })
  const viewModel = runtime.buildDashboardViewModel({
    query: { view: 'sessions', sessionId: 'target-session' },
    health: {
      ok: true,
      diagnostics: {
        activeSessionCount: 2,
        totalEvents: 4,
        seenCount: 4
      }
    },
    sessionsPayload: {
      liveSessions: [{
        sessionId: 'target-session',
        project: 'OpenPet #111111',
        status: 'working',
        type: 'tool.started',
        timestamp: '2026-07-09T11:00:00.000Z',
        history: [{
          type: 'tool.started',
          status: 'working',
          message: 'Started tool',
          timestamp: '2026-07-09T11:00:00.000Z'
        }]
      }],
      sessionSummaries: [{
        sessionId: 'target-session',
        project: 'OpenPet #111111',
        status: 'working',
        phase: 'tool',
        toolName: 'apply_patch',
        firstSeenAt: '2026-07-09T10:00:00.000Z',
        lastSeenAt: '2026-07-09T11:00:00.000Z',
        summary: {
          title: 'OpenPet on codex/dev7',
          currentStep: 'Tool: apply_patch',
          recentProgressHint: 'Using tool apply_patch'
        },
        usageLatest: {
          totalTokens: 1500,
          estimatedCostUsd: 0.012,
          currency: 'USD',
          contextUsedPercent: 0.75
        },
        usagePeak: {
          totalTokens: 1500,
          estimatedCostUsd: 0.012,
          currency: 'USD',
          contextUsedPercent: 0.75
        },
        gitLatest: {
          branch: 'codex/dev7',
          dirty: true,
          dirtyCount: 2,
          ahead: 1,
          behind: 0
        },
        eventCount: 6,
        timelineTail: [{
          type: 'tool.finished',
          status: 'working',
          message: 'Finished tool',
          timestamp: '2026-07-09T11:00:00.000Z'
        }]
      }],
      dailyUsageRollups: []
    }
  })

  assert.equal(viewModel.currentView, 'sessions')
  assert.equal(viewModel.selectedSession.sessionId, 'target-session')
  assert.equal(viewModel.selectedSession.currentStep, 'Tool: apply_patch')
  assert.equal(viewModel.selectedSession.detailHref, '?view=sessions&sessionId=target-session')
  const rendered = runtime.renderDashboard(viewModel)
  assert.match(rendered.sessionWorkbenchHtml, /Focused Session/)
  assert.match(rendered.sessionWorkbenchHtml, /Tool: apply_patch/)
})

test('agent awareness dashboard load applies location detail query', async () => {
  const runtime = createDashboardRuntime({
    documentRef: null,
    locationRef: {
      search: '?view=details&sessionId=target-session'
    },
    fetchImpl: async (url) => ({
      json: async () => {
        if (url === '/health') {
          return {
            ok: true,
            diagnostics: {
              activeSessionCount: 1,
              totalEvents: 2,
              seenCount: 2
            }
          }
        }
        return {
          sessions: [
            {
              sessionId: 'target-session',
              project: 'OpenPet #111111',
              status: 'working',
              type: 'tool.started',
              message: 'Target session',
              timestamp: '2026-07-07T00:00:00.000Z'
            },
            {
              sessionId: 'other-session',
              project: 'Other #222222',
              status: 'working',
              type: 'tool.started',
              message: 'Other session',
              timestamp: '2026-07-07T00:00:01.000Z'
            }
          ]
        }
      }
    })
  })

  const viewModel = await runtime.load()

  assert.equal(viewModel.detailMode, true)
  assert.equal(viewModel.requestedSessionId, 'target-session')
  assert.deepEqual(viewModel.sessions.map((session) => session.sessionId), ['target-session'])
})

test('agent awareness dashboard renders safe per-session focus links', () => {
  const runtime = createDashboardRuntime({ documentRef: null, fetchImpl: null })
  const viewModel = runtime.buildDashboardViewModel({
    health: {
      ok: true,
      diagnostics: {
        activeSessionCount: 1,
        totalEvents: 2,
        seenCount: 2
      }
    },
    sessionsPayload: {
      sessions: [
        {
          sessionId: 'target-session',
          project: 'OpenPet #111111',
          status: 'working',
          type: 'tool.started',
          message: 'Target session',
          timestamp: '2026-07-07T00:00:00.000Z'
        },
        {
          sessionId: 'abc"><script>alert(1)</script>',
          project: 'Unsafe #222222',
          status: 'waiting',
          type: 'approval.requested',
          message: 'Unsafe session id should stay escaped',
          timestamp: '2026-07-07T00:00:01.000Z'
        }
      ]
    }
  })

  const rendered = runtime.renderDashboard(viewModel)
  const targetSession = viewModel.sessions.find((session) => session.sessionId === 'target-session')
  const unsafeSession = viewModel.sessions.find((session) => session.sessionId.includes('alert(1)'))

  assert.equal(targetSession.detailHref, '?view=sessions&sessionId=target-session')
  assert.equal(unsafeSession.detailHref, '?view=sessions&sessionId=abc%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E')
  assert.match(rendered.sessionsHtml, /data-testid="agent-session-focus"/)
  assert.match(rendered.sessionsHtml, /href="\?view=sessions&amp;sessionId=target-session"/)
  assert.match(rendered.sessionsHtml, /href="\?view=sessions&amp;sessionId=abc%22%3E%3Cscript%3Ealert\(1\)%3C%2Fscript%3E"/)
  assert.doesNotMatch(rendered.sessionsHtml, /<script>/)
  assert.doesNotMatch(rendered.sessionsHtml, /javascript:/i)
})

test('agent awareness dashboard renders safe empty state for missing detail session', () => {
  const runtime = createDashboardRuntime({ documentRef: null, fetchImpl: null })
  const viewModel = runtime.buildDashboardViewModel({
    query: {
      view: 'details',
      sessionId: '<script>alert(1)</script>/Users/mango/private'
    },
    health: {
      ok: true,
      diagnostics: {
        activeSessionCount: 0,
        totalEvents: 1,
        seenCount: 1
      }
    },
    sessionsPayload: {
      sessions: [
        {
          sessionId: 'known-session',
          project: 'OpenPet #111111',
          status: 'completed',
          type: 'turn.completed',
          message: 'Known session',
          timestamp: '2026-07-07T00:00:00.000Z'
        }
      ]
    }
  })

  const rendered = runtime.renderDashboard(viewModel)

  assert.equal(viewModel.detailMode, true)
  assert.equal(viewModel.detailFound, false)
  assert.equal(viewModel.sessions.length, 0)
  assert.match(rendered.sessionsHtml, /Requested sanitized session was not found/)
  assert.doesNotMatch(rendered.sessionsHtml, /<script>/)
  assert.doesNotMatch(rendered.sessionsHtml, /\/Users\/mango\/private/)
  assert.doesNotMatch(rendered.sessionsHtml, /known-session/)
})

test('agent awareness dashboard marks the bounded attention session', () => {
  const runtime = createDashboardRuntime({ documentRef: null, fetchImpl: null })
  const viewModel = runtime.buildDashboardViewModel({
    health: {
      ok: true,
      diagnostics: {
        activeSessionCount: 2,
        totalEvents: 4,
        seenCount: 4,
        attentionSession: {
          sessionId: 'waiting-session',
          project: 'Docs #222222',
          status: 'waiting',
          reason: 'Waiting for user input'
        }
      }
    },
    sessionsPayload: {
      sessions: [
        {
          sessionId: 'working-session',
          project: 'OpenPet #111111',
          status: 'working',
          type: 'tool.started',
          message: 'Working session',
          timestamp: '2026-07-07T00:00:00.000Z'
        },
        {
          sessionId: 'waiting-session',
          project: 'Docs #222222',
          status: 'waiting',
          type: 'approval.requested',
          message: 'Waiting session',
          timestamp: '2026-07-07T00:00:01.000Z'
        }
      ]
    }
  })

  const attentionMetric = viewModel.summary.find((item) => item.label === 'Attention')
  const rendered = runtime.renderDashboard(viewModel)
  const workingSession = viewModel.sessions.find((session) => session.sessionId === 'working-session')
  const waitingSession = viewModel.sessions.find((session) => session.sessionId === 'waiting-session')

  assert.equal(attentionMetric.value, 'Waiting')
  assert.equal(attentionMetric.detail, 'Docs #222222 · Waiting for user input')
  assert.equal(workingSession.isFocused, false)
  assert.equal(waitingSession.isFocused, true)
  assert.match(rendered.sessionsHtml, /Focused/)
  assert.match(rendered.sessionsHtml, /Waiting session/)
})

test('agent awareness dashboard rendering escapes content and emits structured sections', () => {
  const runtime = createDashboardRuntime({ documentRef: null, fetchImpl: null })
  const rendered = runtime.renderDashboard({
    serviceOk: false,
    summary: [
      { label: 'Tracked Sessions', value: '1', detail: '0 active now' }
    ],
    healthRows: [
      { label: 'Last Error', value: 'Attention needed', detail: '<script>alert(1)</script> http://127.0.0.1:8795 /Users/mango/private/OpenPet', tone: 'danger' }
    ],
    sessions: [
      {
        project: '/Users/mango/private/OpenPet',
        sessionId: 'abc123',
        message: '<img src=x onerror=alert(1)> Bearer secret-token',
        timestamp: 'Jul 03, 2026, 12:00 PM',
        status: { label: 'Waiting', tone: 'warning' },
        lastEvent: 'approval.requested',
        usageText: '<script>bad</script> 1,500 tokens',
        gitText: 'codex/dev7 /Users/mango/private/OpenPet',
        summaryTitle: 'OpenPet <b>summary</b>',
        progressHint: 'Working at http://127.0.0.1:8795',
        timeline: [
          {
            type: 'approval.requested',
            status: { label: 'Waiting', tone: 'warning' },
            message: 'Need review <b>now</b> at http://127.0.0.1:8795',
            timestamp: 'Jul 03, 2026, 12:00 PM'
          }
        ]
      }
    ]
  })

  assert.equal(rendered.statusLine, 'Service unavailable')
  assert.match(rendered.summaryHtml, /Tracked Sessions/)
  assert.match(rendered.healthHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt; \[local-url\] \[path\]/)
  assert.match(rendered.sessionsHtml, /approval\.requested/)
  assert.match(rendered.sessionsHtml, /\[path\]/)
  assert.match(rendered.sessionsHtml, /Bearer \[redacted\]/)
  assert.match(rendered.sessionsHtml, /Need review &lt;b&gt;now&lt;\/b&gt; at \[local-url\]/)
  assert.match(rendered.sessionsHtml, /&lt;script&gt;bad&lt;\/script&gt; 1,500 tokens/)
  assert.match(rendered.sessionsHtml, /codex\/dev7 \[path\]/)
  assert.match(rendered.sessionsHtml, /OpenPet &lt;b&gt;summary&lt;\/b&gt;/)
  assert.doesNotMatch(rendered.sessionsHtml, /<img src=x onerror=alert\(1\)>/)
  assert.doesNotMatch(rendered.sessionsHtml, /127\.0\.0\.1:8795/)
  assert.doesNotMatch(rendered.sessionsHtml, /\/Users\/mango\/private/)
})
