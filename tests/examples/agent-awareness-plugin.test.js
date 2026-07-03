const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { normalizePluginManifest } = require('../../src/main/plugins/manifest')
const { normalizeCodexEvent } = require('../../examples/plugins/agent-awareness/service/adapters/codex')
const { createCodexRolloutPoller, listRolloutFiles, readRolloutEvents } = require('../../examples/plugins/agent-awareness/service/adapters/codex-rollout-poller')
const { createSessionStore } = require('../../examples/plugins/agent-awareness/service/session-store')
const { createAgentStateMapper } = require('../../examples/plugins/agent-awareness/service/state-mapper')
const { createAgentAwarenessServer } = require('../../examples/plugins/agent-awareness/service/agent-awareness-service')
const { INGEST_TOKEN_FILE, writeCodexHookPlan, writeCodexHookRemovalPlan } = require('../../examples/plugins/agent-awareness/commands/codex-hook-plan')

const pluginRoot = path.resolve(__dirname, '../../examples/plugins/agent-awareness')

const runAgentAwarenessCommand = (commandFile, context = {}, env = {}) => {
  const result = spawnSync(process.execPath, [path.join(pluginRoot, 'commands', commandFile)], {
    cwd: pluginRoot,
    input: JSON.stringify(context),
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...env
    }
  })
  assert.equal(result.stderr, '')
  assert.equal(result.status, 0)
  return JSON.parse(result.stdout)
}

test('agent awareness manifest declares bounded service and command entries', () => {
  const manifest = normalizePluginManifest(
    JSON.parse(fs.readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf-8')),
    { source: 'local', basePath: pluginRoot }
  )

  assert.equal(manifest.id, 'openpet.agent-awareness')
  assert.equal(manifest.profile, 'runtime')
  assert.deepEqual(manifest.permissions, ['pet:say', 'pet:event'])
  assert.deepEqual(manifest.commands.map((command) => command.id), [
    'install-codex-hooks',
    'uninstall-codex-hooks',
    'doctor'
  ])
  assert.equal(manifest.entries.services[0].id, 'agent-awareness')
  assert.equal(manifest.entries.dashboards[0].url, 'http://127.0.0.1:8795')
})

test('codex adapter stores only sanitized bounded event fields', () => {
  const event = normalizeCodexEvent({
    adapter: 'codex',
    sessionId: 'session with spaces',
    type: 'approval.requested',
    message: 'Need approval\nBearer secret-token\nsk-test123',
    cwd: '/Users/mango/private/project/OpenPet',
    prompt: 'do not store me',
    stdout: 'do not store me either'
  }, { now: () => '2026-07-02T00:00:00.000Z' })

  assert.equal(event.adapter, 'codex')
  assert.equal(event.status, 'waiting')
  assert.match(event.sessionId, /^session-[a-f0-9]{16}$/)
  assert.equal(event.message, 'Need approval Bearer [redacted] [redacted-key]')
  assert.equal(event.cwdName, 'OpenPet')
  assert.match(event.cwdHash, /^[a-f0-9]{16}$/)
  assert.equal(Object.prototype.hasOwnProperty.call(event, 'prompt'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(event, 'stdout'), false)
})

test('session store upserts sanitized sessions and keeps bounded history', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-store-'))
  const store = createSessionStore({ dataDir, now: () => '2026-07-02T00:00:00.000Z' })

  store.upsertEvent({
    adapter: 'codex',
    sessionId: 'session-1',
    status: 'working',
    type: 'tool.started',
    message: 'Running tests',
    cwdName: 'OpenPet',
    cwdHash: 'abc',
    toolName: 'shell',
    timestamp: '2026-07-02T00:00:00.000Z'
  })
  store.upsertEvent({
    adapter: 'codex',
    sessionId: 'session-1',
    status: 'completed',
    type: 'turn.completed',
    message: 'Tests passed',
    cwdName: 'OpenPet',
    cwdHash: 'abc',
    toolName: '',
    timestamp: '2026-07-02T00:00:01.000Z'
  })

  const [session] = store.listSessions()
  assert.equal(session.status, 'completed')
  assert.equal(session.history.length, 2)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'sessions.json'), 'utf-8')).sessions[0].message, 'Tests passed')
})

test('state mapper emits pet event and rate-limited speech', () => {
  let currentNowMs = 1000
  const mapper = createAgentStateMapper({
    nowMs: () => currentNowMs,
    minSpeechIntervalMs: 5000
  })
  const event = { sessionId: 'session-1', status: 'working', message: 'Working now' }

  const first = mapper.mapEvent({ event, previousSession: null })
  const second = mapper.mapEvent({ event, previousSession: { status: 'working' } })
  currentNowMs = 7000
  const third = mapper.mapEvent({ event, previousSession: { status: 'working' } })

  assert.deepEqual(first.petEvent, { type: 'agent:working', message: 'Working now', ttlMs: 30000 })
  assert.deepEqual(first.speech, { text: 'Working now', ttlMs: 9000 })
  assert.equal(second.speech, null)
  assert.deepEqual(third.speech, { text: 'Working now', ttlMs: 9000 })
})

test('agent awareness service ingests events and calls the service bridge', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-service-'))
  const bridgeCalls = []
  const service = createAgentAwarenessServer({
    dataDir,
    bridgeClient: {
      event: async (payload) => bridgeCalls.push(['event', payload]),
      say: async (payload) => bridgeCalls.push(['say', payload])
    },
    now: () => '2026-07-02T00:00:00.000Z'
  })

  const result = await service.handleEvent({
    adapter: 'codex',
    sessionId: 'codex-1',
    type: 'turn.completed',
    message: 'Done',
    cwd: '/tmp/OpenPet'
  })

  assert.equal(result.event.status, 'completed')
  assert.equal(result.session.sessionId, 'codex-1')
  assert.deepEqual(bridgeCalls, [
    ['event', { type: 'agent:completed', message: 'Done', ttlMs: 8000 }],
    ['say', { text: 'Done', ttlMs: 6000 }]
  ])
})

test('agent awareness service HTTP ingestion requires the generated local token', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-http-'))
  fs.writeFileSync(path.join(dataDir, INGEST_TOKEN_FILE), 'local-token\n')
  const service = createAgentAwarenessServer({
    dataDir,
    bridgeClient: {
      event: async () => {},
      say: async () => {}
    },
    now: () => '2026-07-02T00:00:00.000Z'
  })
  await service.start(0)
  const address = service.server.address()
  const url = `http://127.0.0.1:${address.port}/api/events`

  const unauthorized = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'codex-1', status: 'working' })
  })
  const authorized = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer local-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sessionId: 'codex-1', status: 'completed', message: 'Done' })
  })
  await service.close()

  assert.equal(unauthorized.status, 401)
  assert.equal(authorized.status, 200)
})

test('codex rollout poller converts local JSONL metadata without prompt or tool input fields', async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-rollout-'))
  const sessionsDir = path.join(codexHome, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  const rolloutPath = path.join(sessionsDir, 'rollout-2026-07-02T00-00-00-019f0000-0000-7000-8000-000000000000.jsonl')
  fs.writeFileSync(rolloutPath, [
    JSON.stringify({
      timestamp: '2026-07-02T00:00:00.000Z',
      type: 'session_meta',
      payload: {
        id: 'codex-session-1',
        cwd: '/Users/mango/private/OpenPet',
        timestamp: '2026-07-02T00:00:00.000Z'
      }
    }),
    JSON.stringify({
      timestamp: '2026-07-02T00:00:01.000Z',
      type: 'event_msg',
      payload: {
        type: 'user_message',
        message: 'do not capture this prompt'
      }
    }),
    JSON.stringify({
      timestamp: '2026-07-02T00:00:02.000Z',
      type: 'response_item',
      payload: {
        type: 'function_call',
        arguments: '{"command":"echo sk-test123"}'
      }
    }),
    JSON.stringify({
      timestamp: '2026-07-02T00:00:03.000Z',
      type: 'event_msg',
      payload: { type: 'task_started', turn_id: 'turn-1' }
    }),
    JSON.stringify({
      timestamp: '2026-07-02T00:00:04.000Z',
      type: 'event_msg',
      payload: { type: 'task_complete', turn_id: 'turn-1' }
    })
  ].join('\n'))

  const events = readRolloutEvents({ filePath: rolloutPath })
  const emitted = []
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-rollout-store-'))
  const server = createAgentAwarenessServer({
    dataDir,
    bridgeClient: {
      event: async () => {},
      say: async () => {}
    },
    autoStartRolloutPoller: false,
    now: () => '2026-07-02T00:00:05.000Z'
  })
  const poller = createCodexRolloutPoller({
    codexHome,
    onEvent: async (event) => {
      emitted.push(event)
      await server.handleEvent(event)
    },
    now: () => new Date('2026-07-02T00:00:05.000Z').getTime()
  })
  await poller.scanOnce()
  const [stored] = createSessionStore({ dataDir }).listSessions()

  assert.deepEqual(events.map((event) => event.type), ['session.started', 'turn.started', 'turn.completed'])
  assert.equal(JSON.stringify(events).includes('do not capture this prompt'), false)
  assert.equal(JSON.stringify(events).includes('sk-test123'), false)
  assert.equal(stored.cwdName, 'OpenPet')
  assert.equal(JSON.stringify(stored).includes('/Users/mango/private/OpenPet'), false)
  assert.equal(emitted.length, 3)
  assert.equal(emitted[2].status, 'completed')
})

test('codex rollout poller discovers nested session rollout files', () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-nested-'))
  const nestedDir = path.join(codexHome, 'sessions', '2026', '07', '02')
  fs.mkdirSync(nestedDir, { recursive: true })
  const rolloutPath = path.join(nestedDir, 'rollout-2026-07-02T00-00-00-019f0000-0000-7000-8000-000000000001.jsonl')
  fs.writeFileSync(rolloutPath, JSON.stringify({ type: 'session_meta', payload: { id: 'nested-session' } }))

  const files = listRolloutFiles({ codexHome })

  assert.deepEqual(files.map((file) => file.filePath), [rolloutPath])
})

test('codex rollout poller reads recent events from long rollout files', () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-long-rollout-'))
  const sessionsDir = path.join(codexHome, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  const rolloutPath = path.join(sessionsDir, 'rollout-2026-07-02T00-00-00-019f0000-0000-7000-8000-000000000002.jsonl')
  const filler = Array.from({ length: 450 }, (_, index) => JSON.stringify({
    timestamp: `2026-07-02T00:00:${String(index % 60).padStart(2, '0')}.000Z`,
    type: 'event_msg',
    payload: {
      type: 'user_message',
      message: `ignored prompt ${index}`
    }
  }))
  fs.writeFileSync(rolloutPath, [
    JSON.stringify({
      timestamp: '2026-07-02T00:00:00.000Z',
      type: 'session_meta',
      payload: {
        id: 'long-session',
        cwd: '/tmp/OpenPet'
      }
    }),
    ...filler,
    JSON.stringify({
      timestamp: '2026-07-02T00:10:00.000Z',
      type: 'event_msg',
      payload: { type: 'task_complete' }
    })
  ].join('\n'))

  const events = readRolloutEvents({ filePath: rolloutPath, maxLines: 20 })

  assert.deepEqual(events.map((event) => event.type), ['session.started', 'turn.completed'])
  assert.equal(events[1].sessionId, 'long-session')
  assert.equal(JSON.stringify(events).includes('ignored prompt'), false)
})

test('agent awareness service starts and stops the zero-config Codex rollout poller', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-poller-'))
  const calls = []
  const bridgeCalls = []
  const service = createAgentAwarenessServer({
    dataDir,
    bridgeClient: {
      event: async (payload) => bridgeCalls.push(['event', payload]),
      say: async (payload) => bridgeCalls.push(['say', payload])
    },
    createRolloutPoller: ({ onEvent }) => ({
      getStatus: () => ({ enabled: true, lastScanAt: '2026-07-02T00:00:00.000Z' }),
      start: () => {
        calls.push('start')
        onEvent({
          adapter: 'codex',
          sessionId: 'codex-local',
          type: 'turn.started',
          status: 'thinking',
          message: 'Codex started a turn.',
          cwd: '/tmp/OpenPet',
          timestamp: '2026-07-02T00:00:00.000Z'
        }, { initial: true })
      },
      stop: () => calls.push('stop')
    })
  })

  await service.start(0)
  const response = await fetch(`http://127.0.0.1:${service.server.address().port}/health`)
  const body = await response.json()
  await service.close()

  assert.deepEqual(calls, ['start', 'stop'])
  assert.deepEqual(bridgeCalls, [])
  assert.equal(body.codexPoller.enabled, true)
  assert.equal(createSessionStore({ dataDir }).listSessions()[0].sessionId, 'codex-local')
})

test('agent awareness service notifies pet for incremental rollout events after initial scan', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-poller-incremental-'))
  const bridgeCalls = []
  let emit
  const service = createAgentAwarenessServer({
    dataDir,
    bridgeClient: {
      event: async (payload) => bridgeCalls.push(['event', payload]),
      say: async (payload) => bridgeCalls.push(['say', payload])
    },
    createRolloutPoller: ({ onEvent }) => {
      emit = onEvent
      return {
        getStatus: () => ({ enabled: true }),
        start: () => {},
        stop: () => {}
      }
    }
  })

  await service.start(0)
  await emit({
    adapter: 'codex',
    sessionId: 'codex-local',
    type: 'turn.completed',
    status: 'completed',
    message: 'Codex completed a turn.',
    cwd: '/tmp/OpenPet',
    timestamp: '2026-07-02T00:00:00.000Z'
  }, { initial: false })
  await service.close()

  assert.deepEqual(bridgeCalls, [
    ['event', { type: 'agent:completed', message: 'Codex completed a turn.', ttlMs: 8000 }],
    ['say', { text: 'Codex completed a turn.', ttlMs: 6000 }]
  ])
})

test('codex hook commands generate manual instructions without external writes', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-hooks-'))
  const installPlan = writeCodexHookPlan({ paths: { dataDir } })
  const removalPlan = writeCodexHookRemovalPlan({ paths: { dataDir } })

  assert.equal(installPlan.serviceUrl, 'http://127.0.0.1:8795/api/events')
  assert.equal(fs.existsSync(installPlan.tokenPath), true)
  assert.equal(fs.existsSync(installPlan.instructionsPath), true)
  assert.equal(fs.existsSync(removalPlan.removalPath), true)
  assert.match(fs.readFileSync(installPlan.instructionsPath, 'utf-8'), /Authorization: Bearer/i)
  assert.match(fs.readFileSync(installPlan.instructionsPath, 'utf-8'), /does not modify Codex configuration automatically/i)
})

test('agent awareness doctor reports unhealthy when setup exists but service is not running', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-doctor-'))
  writeCodexHookPlan({ paths: { dataDir }, port: 65530 })

  const result = runAgentAwarenessCommand('doctor.js', { paths: { dataDir }, port: 65530 }, {
    OPENPET_DATA_DIR: dataDir,
    OPENPET_BRIDGE_URL: 'http://127.0.0.1:1/bridge',
    OPENPET_BRIDGE_TOKEN: 'bridge-token'
  })

  assert.equal(result.ok, true)
  assert.equal(result.healthy, false)
  assert.equal(result.checks.find((check) => check.id === 'ingest-token').ok, true)
  assert.equal(result.checks.find((check) => check.id === 'service-health').ok, false)
})
