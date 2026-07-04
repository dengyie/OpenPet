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
  assert.doesNotMatch(rendered.sessionsHtml, /<img src=x onerror=alert\(1\)>/)
  assert.doesNotMatch(rendered.sessionsHtml, /127\.0\.0\.1:8795/)
  assert.doesNotMatch(rendered.sessionsHtml, /\/Users\/mango\/private/)
})
