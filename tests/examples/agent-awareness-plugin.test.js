const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { normalizePluginManifest } = require('../../src/main/plugins/manifest')
const { normalizeCodexEvent } = require('../../examples/plugins/agent-awareness/service/adapters/codex')
const { normalizeCodexHookEvent } = require('../../examples/plugins/agent-awareness/service/adapters/codex-hook')
const {
  classifyIgnoredRecord,
  createCodexRolloutPoller,
  inspectRolloutFile,
  listRolloutFiles,
  readRolloutEvents
} = require('../../examples/plugins/agent-awareness/service/adapters/codex-rollout-poller')
const { createSessionStore } = require('../../examples/plugins/agent-awareness/service/session-store')
const { createAgentStateMapper } = require('../../examples/plugins/agent-awareness/service/state-mapper')
const { createBridgeClient } = require('../../examples/plugins/agent-awareness/service/bridge-client')
const { buildDiagnostics, createAgentAwarenessServer } = require('../../examples/plugins/agent-awareness/service/agent-awareness-service')
const { DEFAULT_PORT, PLAN_FILE, TOKEN_FILE, toCommandOutput, writeCodexHookPlan } = require('../../examples/plugins/agent-awareness/commands/codex-hook-plan')
const { installCodexHooks } = require('../../examples/plugins/agent-awareness/commands/codex-hook-config')
const { checkServiceHealth, readDiagnostics, redactDoctorOutput, toDoctorServiceHealthOutput } = require('../../examples/plugins/agent-awareness/commands/doctor')

const pluginRoot = path.resolve(__dirname, '../../examples/plugins/agent-awareness')

const runCommand = (fileName, input = {}, env = {}) => {
  const result = spawnSync(process.execPath, [path.join(pluginRoot, 'commands', fileName)], {
    cwd: pluginRoot,
    input: JSON.stringify(input),
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...env
    }
  })
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  }
}

test('agent awareness manifest declares bounded runtime entries', () => {
  const manifest = normalizePluginManifest(
    JSON.parse(fs.readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf-8')),
    { source: 'local', basePath: pluginRoot }
  )

  assert.equal(manifest.id, 'openpet.agent-awareness')
  assert.equal(manifest.profile, 'runtime')
  assert.deepEqual(manifest.permissions, ['pet:say', 'pet:event'])
  assert.deepEqual(manifest.entries.commands.map((entry) => entry.id), [
    'doctor',
    'codex-hook-plan',
    'install-codex-hooks',
    'uninstall-codex-hooks'
  ])
  assert.equal(manifest.configSchema, 'config.schema.json')
  assert.equal(manifest.entries.services[0].id, 'agent-awareness')
  assert.equal(manifest.entries.dashboards[0].url, 'http://127.0.0.1:8795')
})

test('agent awareness bridge client reads service bridge env from plugin service', async () => {
  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  const previousServiceBridgeUrl = process.env.OPENPET_SERVICE_BRIDGE_URL
  const previousServiceBridgeToken = process.env.OPENPET_SERVICE_BRIDGE_TOKEN
  const requests = []

  try {
    delete process.env.OPENPET_BRIDGE_URL
    delete process.env.OPENPET_BRIDGE_TOKEN
    process.env.OPENPET_SERVICE_BRIDGE_URL = 'http://127.0.0.1:7777/plugins/bridge/openpet.agent-awareness/agent-awareness/run'
    process.env.OPENPET_SERVICE_BRIDGE_TOKEN = 'service-bridge-token'

    const client = createBridgeClient({
      fetchImpl: async (url, options) => {
        requests.push({ url, options })
        return {
          ok: true,
          json: async () => ({ ok: true })
        }
      }
    })

    const result = await client.say({ text: 'Agent needs attention.', ttlMs: 1000 })

    assert.deepEqual(result, { ok: true })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, 'http://127.0.0.1:7777/plugins/bridge/openpet.agent-awareness/agent-awareness/run/pet/say')
    assert.equal(requests[0].options.headers.Authorization, 'Bearer service-bridge-token')
  } finally {
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
    if (previousServiceBridgeUrl == null) delete process.env.OPENPET_SERVICE_BRIDGE_URL
    else process.env.OPENPET_SERVICE_BRIDGE_URL = previousServiceBridgeUrl
    if (previousServiceBridgeToken == null) delete process.env.OPENPET_SERVICE_BRIDGE_TOKEN
    else process.env.OPENPET_SERVICE_BRIDGE_TOKEN = previousServiceBridgeToken
  }
})

test('codex adapter hashes session ids and redacts project paths', () => {
  const event = normalizeCodexEvent({
    sessionId: 'codex-session-raw',
    type: 'approval.requested',
    message: 'Need approval Bearer secret-token sk-test123 /Users/mango/private/OpenPet',
    cwd: '/Users/mango/private/project/OpenPet'
  }, { now: () => '2026-07-03T00:00:00.000Z' })

  assert.equal(event.status, 'waiting')
  assert.match(event.sessionId, /^[a-f0-9]{12}$/)
  assert.equal(event.sessionId === 'codex-session-raw', false)
  assert.match(event.project, /^OpenPet #[a-f0-9]{6}$/)
  assert.equal(event.message.includes('/Users/mango/private'), false)
  assert.equal(event.message.includes('sk-test123'), false)
})

test('codex adapter preserves bounded visible info fields without raw local details', () => {
  const event = normalizeCodexEvent({
    sessionId: 'codex-session-visible-info',
    type: 'turn.usage',
    cwd: '/Users/mango/private/project/OpenPet',
    usage: {
      input_tokens: 1200,
      output_tokens: 300,
      total_tokens: 1500,
      context_window: 200000,
      estimated_cost_usd: 0.012345
    },
    git: {
      branch: 'codex/dev7',
      dirty: true,
      dirtyCount: 2,
      ahead: 1,
      behind: 0,
      repository: 'OpenPet #111111'
    },
    summary: {
      title: 'OpenPet on codex/dev7',
      recentProgressHint: 'Working in /Users/mango/private/project/OpenPet'
    }
  }, { now: () => '2026-07-07T00:00:00.000Z' })

  assert.equal(event.usage.totalTokens, 1500)
  assert.equal(event.usage.contextUsedPercent, 0.75)
  assert.equal(event.git.branch, 'codex/dev7')
  assert.equal(event.git.dirtyCount, 2)
  assert.equal(event.summary.title, 'OpenPet on codex/dev7')
  assert.equal(JSON.stringify(event).includes('/Users/mango/private'), false)
})

test('codex hook adapter maps bounded tool and approval progress without storing raw local details', () => {
  const event = normalizeCodexHookEvent({
    session_id: 'codex-session-raw',
    turn_id: 'turn-42',
    hook_event_name: 'PermissionRequest',
    tool_name: 'exec_command',
    cwd: '/Users/mango/private/project/OpenPet',
    progress_label: 'Waiting for approval',
    progress_step: 'exec_command',
    progress_current: 1,
    progress_total: 3,
    approval_state: 'requested',
    message: 'Need approval Bearer secret-token sk-test123 /Users/mango/private/OpenPet'
  }, { now: () => '2026-07-03T00:00:00.000Z' })

  assert.equal(event.phase, 'approval')
  assert.equal(event.status, 'waiting')
  assert.equal(event.toolName, 'exec_command')
  assert.equal(event.progressLabel, 'Waiting for approval')
  assert.equal(event.progressStep, 'exec_command')
  assert.equal(event.progressCurrent, 1)
  assert.equal(event.progressTotal, 3)
  assert.equal(event.approvalState, 'requested')
  assert.equal(event.lastSource, 'hook')
  assert.match(event.project, /^OpenPet #[a-f0-9]{6}$/)
  assert.equal(JSON.stringify(event).includes('/Users/mango/private'), false)
  assert.equal(JSON.stringify(event).includes('sk-test123'), false)
})

test('codex hook adapter accepts bounded usage and git visible info fields', () => {
  const event = normalizeCodexHookEvent({
    session_id: 'codex-session-hook-visible-info',
    hook_event_name: 'PostToolUse',
    tool_name: 'exec_command',
    cwd: '/Users/mango/private/project/OpenPet',
    usage: {
      inputTokens: 2000,
      outputTokens: 500,
      totalTokens: 2500,
      contextWindow: 200000,
      estimatedCostUsd: 0.02
    },
    git: {
      branch: 'codex/dev7',
      dirty: false,
      dirtyCount: 0,
      repository: 'OpenPet #111111'
    },
    summary: {
      title: 'OpenPet on codex/dev7',
      currentStep: 'post tool',
      recentProgressHint: 'Completed exec_command'
    }
  }, { now: () => '2026-07-07T00:00:00.000Z' })

  assert.equal(event.usage.totalTokens, 2500)
  assert.equal(event.usage.contextUsedPercent, 1.25)
  assert.equal(event.git.branch, 'codex/dev7')
  assert.equal(event.git.dirty, false)
  assert.equal(event.summary.recentProgressHint, 'Completed exec_command')
  assert.equal(JSON.stringify(event).includes('/Users/mango/private'), false)
})

test('codex rollout poller derives only safe lifecycle events from JSONL', async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-codex-'))
  const sessionsDir = path.join(codexHome, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  const filePath = path.join(sessionsDir, 'rollout-2026-07-03T00-00-00-1.jsonl')
  fs.writeFileSync(filePath, [
    JSON.stringify({ type: 'session_meta', timestamp: '2026-07-03T00:00:00.000Z', payload: { id: 'raw-session-1', cwd: '/Users/mango/private/project/OpenPet' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:01.000Z', payload: { type: 'user_message', message: 'do not store me sk-test123' } }),
    JSON.stringify({ type: 'response_item', timestamp: '2026-07-03T00:00:02.000Z', payload: { type: 'function_call', name: 'shell', arguments: '{"command":"echo nope"}' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:03.000Z', payload: { type: 'task_started' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:04.000Z', payload: { type: 'task_complete', last_agent_message: 'do not store me either' } })
  ].join('\n'))

  assert.deepEqual(listRolloutFiles({ codexHome }).map((entry) => entry.filePath), [filePath])
  const events = readRolloutEvents({ filePath })

  assert.deepEqual(events.map((event) => event.type), [
    'session.discovered',
    'tool.started',
    'turn.started',
    'turn.completed'
  ])
  assert.equal(JSON.stringify(events).includes('sk-test123'), false)
  assert.equal(JSON.stringify(events).includes('/Users/mango/private'), false)

  const emitted = []
  const poller = createCodexRolloutPoller({
    codexHome,
    onEvent: async (event) => emitted.push(event),
    now: () => new Date('2026-07-03T00:00:05.000Z').getTime()
  })
  await poller.scanOnce()
  assert.equal(emitted.length, 4)
})

test('codex rollout poller derives safe usage and git metadata from metadata-only records', () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-codex-visible-info-'))
  const sessionsDir = path.join(codexHome, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  const filePath = path.join(sessionsDir, 'rollout-2026-07-07T00-00-00-visible-info.jsonl')
  fs.writeFileSync(filePath, [
    JSON.stringify({ type: 'session_meta', timestamp: '2026-07-07T00:00:00.000Z', payload: { id: 'raw-visible-1', cwd: '/Users/mango/private/project/OpenPet' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-07T00:00:01.000Z', payload: { type: 'token_count', input_tokens: 1200, output_tokens: 300, total_tokens: 1500, context_window: 200000, estimated_cost_usd: 0.012345 } }),
    JSON.stringify({ type: 'turn_context', timestamp: '2026-07-07T00:00:02.000Z', payload: { cwd: '/Users/mango/private/project/OpenPet' } })
  ].join('\n'))

  const events = readRolloutEvents({
    filePath,
    gitSummaryProvider: () => ({
      branch: 'codex/dev7',
      dirty: true,
      dirtyCount: 2,
      ahead: 1,
      behind: 0,
      repository: 'OpenPet #111111'
    })
  })

  assert.deepEqual(events.map((event) => event.type), ['session.discovered', 'turn.usage', 'project.git'])
  assert.equal(events[1].usage.totalTokens, 1500)
  assert.equal(events[1].usage.contextUsedPercent, 0.75)
  assert.equal(events[2].git.branch, 'codex/dev7')
  assert.equal(events[2].summary.title, 'OpenPet #111111 on codex/dev7')
  assert.equal(JSON.stringify(events).includes('/Users/mango/private'), false)
})

test('codex rollout poller skips git metadata when provider fails without dropping other safe events', () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-codex-git-provider-fail-'))
  const sessionsDir = path.join(codexHome, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  const filePath = path.join(sessionsDir, 'rollout-2026-07-07T00-00-00-git-provider-fail.jsonl')
  fs.writeFileSync(filePath, [
    JSON.stringify({ type: 'session_meta', timestamp: '2026-07-07T00:00:00.000Z', payload: { id: 'raw-visible-2', cwd: '/Users/mango/private/project/OpenPet' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-07T00:00:01.000Z', payload: { type: 'token_count', input_tokens: 100, output_tokens: 50, total_tokens: 150 } }),
    JSON.stringify({ type: 'turn_context', timestamp: '2026-07-07T00:00:02.000Z', payload: { cwd: '/Users/mango/private/project/OpenPet' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-07T00:00:03.000Z', payload: { type: 'task_complete' } })
  ].join('\n'))

  const events = readRolloutEvents({
    filePath,
    gitSummaryProvider: () => {
      throw new Error('git unavailable at /Users/mango/private/project/OpenPet')
    }
  })

  assert.deepEqual(events.map((event) => event.type), ['session.discovered', 'turn.usage', 'turn.completed'])
  assert.equal(events[1].usage.totalTokens, 150)
  assert.equal(JSON.stringify(events).includes('/Users/mango/private'), false)
})

test('codex rollout poller maps safe tool-end lifecycle records without exposing payload content', () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-codex-tool-end-'))
  const sessionsDir = path.join(codexHome, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  const filePath = path.join(sessionsDir, 'rollout-2026-07-03T00-00-00-3.jsonl')
  fs.writeFileSync(filePath, [
    JSON.stringify({ type: 'session_meta', timestamp: '2026-07-03T00:00:00.000Z', payload: { id: 'raw-session-3', cwd: '/Users/mango/private/project/OpenPet' } }),
    JSON.stringify({ type: 'response_item', timestamp: '2026-07-03T00:00:01.000Z', payload: { type: 'web_search_call', action: 'search', status: 'completed' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:02.000Z', payload: { type: 'web_search_end', query: 'secret query' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:03.000Z', payload: { type: 'mcp_tool_call_end', result: 'secret result' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:04.000Z', payload: { type: 'patch_apply_end', stdout: 'secret stdout', stderr: 'secret stderr' } })
  ].join('\n'))

  const events = readRolloutEvents({ filePath })
  assert.deepEqual(events.map((event) => [event.type, event.message]), [
    ['session.discovered', ''],
    ['tool.started', 'Codex started a web search.'],
    ['tool.completed', 'Codex completed a web search.'],
    ['tool.completed', 'Codex completed an MCP tool call.'],
    ['tool.completed', 'Codex applied a patch.']
  ])
  assert.equal(JSON.stringify(events).includes('secret query'), false)
  assert.equal(JSON.stringify(events).includes('secret stdout'), false)
  assert.equal(JSON.stringify(events).includes('secret result'), false)
})

test('codex rollout poller does not collapse distinct tool calls that share the same timestamp', async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-codex-duplicate-tools-'))
  const sessionsDir = path.join(codexHome, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  const filePath = path.join(sessionsDir, 'rollout-2026-07-03T00-00-00-duplicate-tools.jsonl')
  fs.writeFileSync(filePath, [
    JSON.stringify({ type: 'session_meta', timestamp: '2026-07-03T00:00:00.000Z', payload: { id: 'raw-session-dup', cwd: '/Users/mango/private/project/OpenPet' } }),
    JSON.stringify({ type: 'response_item', timestamp: '2026-07-03T00:00:01.000Z', payload: { type: 'function_call', name: 'exec_command', arguments: '{"cmd":"pwd"}' } }),
    JSON.stringify({ type: 'response_item', timestamp: '2026-07-03T00:00:01.000Z', payload: { type: 'function_call', name: 'exec_command', arguments: '{"cmd":"ls"}' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:02.000Z', payload: { type: 'task_complete' } })
  ].join('\n'))

  const emitted = []
  const poller = createCodexRolloutPoller({
    codexHome,
    onEvent: async (event) => emitted.push(event),
    now: () => new Date('2026-07-03T00:00:05.000Z').getTime()
  })

  await poller.scanOnce()

  assert.deepEqual(emitted.map((event) => event.type), [
    'session.discovered',
    'tool.started',
    'tool.started',
    'turn.completed'
  ])
  assert.equal(poller.getStatus().seenCount, 4)
})

test('codex rollout poller maps safe thread lifecycle records and ignores content-bearing goal/tool-search records', async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-codex-thread-lifecycle-'))
  const sessionsDir = path.join(codexHome, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  const filePath = path.join(sessionsDir, 'rollout-2026-07-03T00-00-00-4.jsonl')
  fs.writeFileSync(filePath, [
    JSON.stringify({ type: 'session_meta', timestamp: '2026-07-03T00:00:00.000Z', payload: { id: 'raw-session-4', cwd: '/Users/mango/private/project/OpenPet' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:01.000Z', payload: { type: 'thread_goal_updated', goal: { objective: 'private goal text that should never surface' } } }),
    JSON.stringify({ type: 'response_item', timestamp: '2026-07-03T00:00:02.000Z', payload: { type: 'tool_search_output', tools: [{ name: 'private-tool' }] } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:03.000Z', payload: { type: 'context_compacted' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:04.000Z', payload: { type: 'thread_rolled_back', num_turns: 1 } })
  ].join('\n'))

  const events = readRolloutEvents({ filePath })
  assert.deepEqual(events.map((event) => [event.type, event.message]), [
    ['session.discovered', ''],
    ['context.compacted', 'Codex compacted context to continue.'],
    ['turn.rolled-back', 'Codex rolled back recent turns.']
  ])
  assert.equal(JSON.stringify(events).includes('private goal text'), false)
  assert.equal(JSON.stringify(events).includes('private-tool'), false)

  const inspection = inspectRolloutFile({ filePath })
  assert.equal(inspection.events.length, 3)
  assert.equal(inspection.ignoredContentRecordKeys.length, 2)
  assert.equal(inspection.unsupportedLifecycleRecordKeys.length, 0)

  const emitted = []
  const poller = createCodexRolloutPoller({
    codexHome,
    onEvent: async (event) => emitted.push(event),
    now: () => new Date('2026-07-03T00:00:05.000Z').getTime()
  })
  await poller.scanOnce()
  assert.deepEqual(emitted.map((event) => event.type), [
    'session.discovered',
    'context.compacted',
    'turn.rolled-back'
  ])
  assert.equal(poller.getStatus().ignoredContentRecordCount, 2)
  assert.equal(poller.getStatus().unsupportedLifecycleRecordCount, 0)
})

test('codex rollout poller diagnostics count malformed and unknown records once across repeated scans', async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-codex-diagnostics-'))
  const sessionsDir = path.join(codexHome, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  const filePath = path.join(sessionsDir, 'rollout-2026-07-03T00-00-00-2.jsonl')
  fs.writeFileSync(filePath, [
    JSON.stringify({ type: 'session_meta', timestamp: '2026-07-03T00:00:00.000Z', payload: { id: 'raw-session-2', cwd: '/Users/mango/private/project/OpenPet' } }),
    '{"type":"broken"',
    JSON.stringify({ type: 'compacted', timestamp: '2026-07-03T00:00:00.500Z', payload: { message: 'private handoff summary', replacement_history: [] } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:01.000Z', payload: { type: 'user_message', message: 'do not store me' } }),
    JSON.stringify({ type: 'turn_context', timestamp: '2026-07-03T00:00:01.500Z', payload: { cwd: '/Users/mango/private/project/OpenPet', approval_policy: 'never' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:01.750Z', payload: { type: 'patch_apply_end', duration_ms: 200 } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:01.900Z', payload: { type: 'agent_reasoning', text: 'private thought' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-07-03T00:00:02.000Z', payload: { type: 'task_started' } })
  ].join('\n'))

  const inspection = inspectRolloutFile({ filePath })
  assert.equal(inspection.events.length, 3)
  assert.equal(inspection.malformedRecordKeys.length, 1)
  assert.equal(inspection.ignoredContentRecordKeys.length, 3)
  assert.equal(inspection.ignoredMetadataRecordKeys.length, 1)
  assert.equal(inspection.unsupportedLifecycleRecordKeys.length, 0)
  assert.equal(inspection.unknownRecordKeys.length, 0)

  const emitted = []
  const poller = createCodexRolloutPoller({
    codexHome,
    onEvent: async (event) => emitted.push(event),
    now: () => new Date('2026-07-03T00:00:05.000Z').getTime()
  })

  await poller.scanOnce()
  await poller.scanOnce()

  assert.equal(emitted.length, 3)
  assert.deepEqual(poller.getStatus(), {
    enabled: true,
    lastScanAt: '2026-07-03T00:00:05.000Z',
    lastError: '',
    seenCount: 3,
    ignoredContentRecordCount: 3,
    ignoredMetadataRecordCount: 1,
    unknownRecordCount: 0,
    malformedRecordCount: 1,
    unsupportedLifecycleRecordCount: 0
  })
})

test('codex rollout poller classifies ignored records without reading raw content into diagnostics', () => {
  assert.deepEqual(
    classifyIgnoredRecord({
      record: { type: 'response_item', payload: { type: 'function_call_output', output: 'secret' } }
    }),
    { bucket: 'ignoredContent', reason: 'response_item:function_call_output' }
  )
  assert.deepEqual(
    classifyIgnoredRecord({
      record: { type: 'turn_context', payload: { cwd: '/Users/mango/private/project/OpenPet' } }
    }),
    { bucket: 'ignoredMetadata', reason: 'turn_context:context' }
  )
  assert.deepEqual(
    classifyIgnoredRecord({
      record: { type: 'event_msg', payload: { type: 'patch_apply_end', duration_ms: 12 } }
    }),
    { bucket: 'unsupportedLifecycle', reason: 'event_msg:patch_apply_end' }
  )
  assert.deepEqual(
    classifyIgnoredRecord({
      record: { type: 'event_msg', payload: { type: 'agent_reasoning', text: 'private thought' } }
    }),
    { bucket: 'ignoredContent', reason: 'event_msg:agent_reasoning' }
  )
  assert.deepEqual(
    classifyIgnoredRecord({
      record: { type: 'mystery_record', payload: { type: 'odd' } }
    }),
    { bucket: 'unknown', reason: 'mystery_record:odd' }
  )
  assert.deepEqual(
    classifyIgnoredRecord({
      record: { type: 'compacted', payload: { message: 'private handoff summary' } }
    }),
    { bucket: 'ignoredContent', reason: 'compacted:content' }
  )
})

test('session store retains bounded latest sessions and events', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-store-'))
  const store = createSessionStore({ dataDir, maxSessions: 2, maxEvents: 3 })
  store.upsertEvent({ sessionId: 'a', status: 'thinking', type: 'turn.started', message: 'one', project: 'A #111111', timestamp: '2026-07-03T00:00:00.000Z' })
  store.upsertEvent({ sessionId: 'b', status: 'working', type: 'tool.started', message: 'two', project: 'B #222222', timestamp: '2026-07-03T00:00:01.000Z' })
  store.upsertEvent({ sessionId: 'a', status: 'completed', type: 'turn.completed', message: 'three', project: 'A #111111', timestamp: '2026-07-03T00:00:02.000Z' })
  store.upsertEvent({ sessionId: 'c', status: 'waiting', type: 'approval.requested', message: 'four', project: 'C #333333', timestamp: '2026-07-03T00:00:03.000Z' })

  const sessions = store.listSessions()
  assert.deepEqual(sessions.map((session) => session.sessionId), ['c', 'a'])
  assert.equal(sessions.reduce((sum, session) => sum + session.history.length, 0), 3)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'sessions.json'), 'utf-8')).sessions.length, 2)
  assert.equal(store.getStatus().lastEventAt, '2026-07-03T00:00:03.000Z')
})

test('session store preserves richer runtime metadata across hook and poller updates', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-store-rich-'))
  const store = createSessionStore({ dataDir, maxSessions: 2, maxEvents: 6 })

  store.upsertEvent({
    sessionId: 'a',
    status: 'working',
    type: 'PreToolUse',
    phase: 'tool',
    message: 'Codex is starting exec_command.',
    project: 'A #111111',
    toolName: 'exec_command',
    progressLabel: 'Running tool',
    progressStep: 'exec_command',
    progressCurrent: 1,
    progressTotal: 3,
    lastSource: 'hook',
    timestamp: '2026-07-03T00:00:00.000Z'
  })
  store.upsertEvent({
    sessionId: 'a',
    status: 'waiting',
    type: 'approval.requested',
    phase: 'approval',
    message: 'Codex needs approval.',
    project: 'A #111111',
    toolName: 'exec_command',
    approvalState: 'requested',
    lastSource: 'poller',
    timestamp: '2026-07-03T00:00:01.000Z'
  })

  const session = store.listSessions()[0]
  assert.equal(session.phase, 'approval')
  assert.equal(session.toolName, 'exec_command')
  assert.equal(session.progressLabel, 'Running tool')
  assert.equal(session.progressStep, 'exec_command')
  assert.equal(session.progressCurrent, 1)
  assert.equal(session.progressTotal, 3)
  assert.equal(session.approvalState, 'requested')
  assert.equal(session.lastSource, 'poller')
  assert.equal(session.history[0].phase, 'tool')
  assert.equal(session.history[1].approvalState, 'requested')
})

test('session store clears approval state after the session leaves the approval phase', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-store-approval-clear-'))
  const store = createSessionStore({ dataDir, maxSessions: 2, maxEvents: 6 })

  store.upsertEvent({
    sessionId: 'a',
    status: 'waiting',
    type: 'approval.requested',
    phase: 'approval',
    message: 'Codex needs approval.',
    project: 'A #111111',
    toolName: 'exec_command',
    approvalState: 'requested',
    timestamp: '2026-07-03T00:00:00.000Z'
  })
  store.upsertEvent({
    sessionId: 'a',
    status: 'completed',
    type: 'turn.completed',
    phase: 'turn',
    message: 'Codex completed a turn.',
    project: 'A #111111',
    timestamp: '2026-07-03T00:00:01.000Z'
  })

  const session = store.listSessions()[0]
  assert.equal(session.phase, 'turn')
  assert.equal(session.status, 'completed')
  assert.equal(session.approvalState, '')
  assert.equal(session.history[1].approvalState, '')
})

test('session store preserves bounded usage git and summary metadata', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-store-visible-info-'))
  const store = createSessionStore({ dataDir, maxSessions: 2, maxEvents: 4 })

  store.upsertEvent({
    sessionId: 'a',
    status: 'working',
    type: 'turn.usage',
    project: 'OpenPet #111111',
    usage: {
      inputTokens: 1200,
      outputTokens: 300,
      cachedInputTokens: 100,
      totalTokens: 1500,
      contextWindow: 200000,
      estimatedCostUsd: 0.012345,
      currency: 'USD'
    },
    git: {
      branch: 'codex/dev7',
      dirty: true,
      dirtyCount: 2,
      ahead: 1,
      behind: 0,
      repository: 'OpenPet #111111'
    },
    summary: {
      title: 'OpenPet on codex/dev7',
      currentStep: 'turn.usage',
      recentProgressHint: 'Working in OpenPet'
    },
    timestamp: '2026-07-07T00:00:00.000Z'
  })

  const session = store.listSessions()[0]
  assert.equal(session.usage.totalTokens, 1500)
  assert.equal(session.usage.contextUsedPercent, 0.75)
  assert.equal(session.git.branch, 'codex/dev7')
  assert.equal(session.git.dirty, true)
  assert.equal(session.summary.title, 'OpenPet on codex/dev7')
  assert.equal(session.history[0].usage.totalTokens, 1500)
  assert.equal(JSON.stringify(session).includes('/Users/mango'), false)
})

test('session summary prefers bounded progress labels for current step', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-store-summary-step-'))
  const store = createSessionStore({ dataDir, maxSessions: 2, maxEvents: 4 })

  store.upsertEvent({
    sessionId: 'a',
    status: 'working',
    phase: 'tool',
    type: 'tool.started',
    project: 'OpenPet #111111',
    toolName: 'exec_command',
    progressLabel: 'Running tool at /Users/mango/private/project/OpenPet',
    message: 'Codex started a tool call.',
    timestamp: '2026-07-07T00:00:00.000Z'
  })

  const session = store.listSessions()[0]
  assert.equal(session.summary.currentStep, 'Running tool at [path]')
  assert.equal(session.summary.recentProgressHint, 'Running tool at [path]')
  assert.equal(JSON.stringify(session).includes('/Users/mango'), false)
})

test('session summary derives semantic hints from bounded runtime metadata', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-store-semantic-summary-'))
  const store = createSessionStore({ dataDir, maxSessions: 2, maxEvents: 4 })

  store.upsertEvent({
    sessionId: 'a',
    status: 'waiting',
    phase: 'approval',
    type: 'approval.requested',
    project: 'OpenPet #111111',
    toolName: 'exec_command',
    timestamp: '2026-07-07T00:00:00.000Z'
  })

  let session = store.listSessions()[0]
  assert.equal(session.summary.currentStep, 'Awaiting approval')
  assert.equal(session.summary.recentProgressHint, 'Waiting for approval to run exec_command')

  store.upsertEvent({
    sessionId: 'a',
    status: 'working',
    phase: 'tool',
    type: 'posttooluse',
    project: 'OpenPet #111111',
    toolName: 'exec_command',
    timestamp: '2026-07-07T00:00:01.000Z'
  })

  session = store.listSessions()[0]
  assert.equal(session.summary.currentStep, 'Tool: exec_command')
  assert.equal(session.summary.recentProgressHint, 'Finished tool exec_command')

  store.upsertEvent({
    sessionId: 'a',
    status: 'working',
    phase: 'turn',
    type: 'turn.usage',
    project: 'OpenPet #111111',
    usage: { totalTokens: 1500 },
    summary: {
      currentStep: 'turn.usage',
      recentProgressHint: '1500 tokens observed'
    },
    timestamp: '2026-07-07T00:00:02.000Z'
  })

  session = store.listSessions()[0]
  assert.equal(session.summary.currentStep, 'Updating usage metadata')
  assert.equal(session.summary.recentProgressHint, 'Usage updated: 1,500 tokens')
  assert.equal(JSON.stringify(session).includes('/Users/mango'), false)
})

test('state mapper rate-limits repeat speech for the same session and status', () => {
  let currentNowMs = 1000
  const mapper = createAgentStateMapper({ nowMs: () => currentNowMs })
  const event = { sessionId: 'session-1', status: 'working', type: 'tool.started', project: 'OpenPet #111111', message: 'Codex started a tool call.' }

  const first = mapper.mapEvent({ event, previousSession: null })
  const second = mapper.mapEvent({ event, previousSession: { status: 'working' } })
  currentNowMs += 6 * 60 * 1000
  const third = mapper.mapEvent({
    event: {
      ...event,
      type: 'tool.started.retry'
    },
    previousSession: { status: 'working' }
  })

  assert.equal(Boolean(first.speech), true)
  assert.equal(second.speech, null)
  assert.equal(Boolean(third.speech), true)
})

test('state mapper lets urgent status changes interrupt while cooling repeated urgent speech', () => {
  let currentNowMs = 1000
  const mapper = createAgentStateMapper({ nowMs: () => currentNowMs })
  const working = { sessionId: 'session-urgent', status: 'working', type: 'tool.started', project: 'OpenPet #111111', message: 'Codex started a tool call.' }
  const waiting = { sessionId: 'session-urgent', status: 'waiting', type: 'approval.requested', project: 'OpenPet #111111', message: 'Codex needs approval.' }

  const first = mapper.mapEvent({ event: working, previousSession: null })
  currentNowMs += 1000
  const urgent = mapper.mapEvent({ event: waiting, previousSession: { status: 'working' } })
  currentNowMs += 1000
  const repeatedUrgent = mapper.mapEvent({
    event: {
      ...waiting,
      type: 'approval.still-waiting'
    },
    previousSession: { status: 'waiting' }
  })
  currentNowMs += 2 * 60 * 1000
  const cooledUrgent = mapper.mapEvent({
    event: {
      ...waiting,
      type: 'approval.reminder'
    },
    previousSession: { status: 'waiting' }
  })

  assert.equal(Boolean(first.speech), true)
  assert.equal(Boolean(urgent.speech), true)
  assert.equal(urgent.notification.priority, 'urgent')
  assert.equal(urgent.notification.reason, 'status-changed')
  assert.equal(repeatedUrgent.speech, null)
  assert.equal(repeatedUrgent.petEvent.type, 'agent:waiting')
  assert.equal(repeatedUrgent.notification.reason, 'status-cooldown')
  assert.equal(Boolean(cooledUrgent.speech), true)
})

test('state mapper suppresses repeated completion speech while preserving pet events', () => {
  let currentNowMs = 1000
  const mapper = createAgentStateMapper({ nowMs: () => currentNowMs })
  const completed = { sessionId: 'session-complete', status: 'completed', type: 'turn.completed', project: 'OpenPet #111111', message: 'Codex completed a turn.' }

  const first = mapper.mapEvent({ event: completed, previousSession: { status: 'working' } })
  currentNowMs += 1000
  const repeated = mapper.mapEvent({
    event: {
      ...completed,
      type: 'session.completed'
    },
    previousSession: { status: 'completed' }
  })

  assert.equal(Boolean(first.speech), true)
  assert.equal(first.notification.priority, 'summary')
  assert.equal(repeated.speech, null)
  assert.deepEqual(repeated.petEvent, {
    type: 'agent:completed',
    message: 'Codex completed a turn.',
    ttlMs: 8000
  })
  assert.equal(repeated.notification.reason, 'status-cooldown')
})

test('state mapper notification decision stays bounded and content-free', () => {
  const mapper = createAgentStateMapper({ nowMs: () => 1000 })
  const mapped = mapper.mapEvent({
    event: {
      sessionId: 'session-bounded',
      status: 'working',
      type: 'tool.started',
      project: 'OpenPet #111111',
      message: 'raw path /Users/mango/private/OpenPet and sk-test123'
    },
    previousSession: null
  })

  assert.deepEqual(mapped.notification, {
    status: 'working',
    priority: 'normal',
    reason: 'status-changed',
    shouldSpeak: true,
    cooldownMs: 300000
  })
  assert.equal(JSON.stringify(mapped.notification).includes('/Users/mango'), false)
  assert.equal(JSON.stringify(mapped.notification).includes('sk-test123'), false)
})

test('state mapper does not cooldown same-status events without in-memory speech history', () => {
  const mapper = createAgentStateMapper({ nowMs: () => 1000 })
  const mapped = mapper.mapEvent({
    event: {
      sessionId: 'session-restored',
      status: 'working',
      type: 'tool.started',
      project: 'OpenPet #111111',
      message: 'Codex started a tool call.'
    },
    previousSession: { status: 'working' }
  })

  assert.equal(Boolean(mapped.speech), true)
  assert.equal(mapped.notification.reason, 'cooldown-elapsed')
})

test('agent awareness server serves health and notifies pet only for incremental events', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-service-'))
  const bridgeCalls = []
  let onEvent = null
  const service = createAgentAwarenessServer({
    dataDir,
    bridgeClient: {
      event: async (payload) => bridgeCalls.push(['event', payload]),
      say: async (payload) => bridgeCalls.push(['say', payload])
    },
    createRolloutPoller: ({ onEvent: handler }) => {
      onEvent = handler
      return {
        getStatus: () => ({ enabled: true, seenCount: 0 }),
        start: () => {
          handler({
            sessionId: 'raw-session-boot',
            type: 'session.discovered',
            status: 'idle',
            cwd: '/tmp/OpenPet',
            timestamp: '2026-07-03T00:00:00.000Z'
          }, { initial: true })
        },
        stop: () => {}
      }
    }
  })

  await service.start(0)
  const port = service.server.address().port
  const healthResponse = await fetch(`http://127.0.0.1:${port}/health`)
  const sessionsResponse = await fetch(`http://127.0.0.1:${port}/api/sessions`)
  const faviconResponse = await fetch(`http://127.0.0.1:${port}/favicon.ico`)
  await onEvent({
    sessionId: 'raw-session-1',
    type: 'turn.completed',
    status: 'completed',
    message: 'Codex completed a turn.',
    cwd: '/tmp/OpenPet',
    timestamp: '2026-07-03T00:00:01.000Z'
  }, { initial: false })
  await service.close()

  const health = await healthResponse.json()
  const sessions = await sessionsResponse.json()
  assert.equal(health.ok, true)
  assert.equal(health.service, 'agent-awareness')
  assert.equal(faviconResponse.status, 204)
  assert.deepEqual(health.hookMode, {
    installed: false,
    mode: 'not-installed',
    planAvailable: false,
    tokenConfigured: false,
    ingestAuthRequired: false
  })
  assert.equal(health.diagnostics.sessionCount, 1)
  assert.equal(health.diagnostics.activeSessionCount, 0)
  assert.equal(health.diagnostics.totalEvents, 1)
  assert.equal(health.diagnostics.seenCount, 0)
  assert.equal(health.diagnostics.ignoredContentRecordCount, 0)
  assert.equal(health.diagnostics.ignoredMetadataRecordCount, 0)
  assert.equal('storePath' in health.sessions, false)
  assert.equal('codexHome' in health.codexPoller, false)
  assert.equal(Array.isArray(sessions.sessions), true)
  assert.deepEqual(bridgeCalls, [
    ['event', { type: 'agent:completed', message: 'Codex completed a turn.', ttlMs: 8000 }],
    ['say', { text: '我刚完成：Codex completed a turn.', ttlMs: 6000 }]
  ])
})

test('agent awareness server aggregates bounded usage diagnostics across sessions', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-usage-diagnostics-'))
  const service = createAgentAwarenessServer({
    dataDir,
    bridgeClient: {
      event: async () => {},
      say: async () => {}
    },
    createRolloutPoller: () => ({
      getStatus: () => ({ enabled: true, seenCount: 0 }),
      start: () => {},
      stop: () => {}
    })
  })

  await service.start(0)
  await service.handleEvent({
    sessionId: 'raw-session-usage-a',
    type: 'turn.usage',
    status: 'working',
    project: 'OpenPet #111111',
    usage: {
      inputTokens: 700,
      outputTokens: 300,
      cachedInputTokens: 100,
      totalTokens: 1000,
      contextUsedPercent: 0.5,
      estimatedCostUsd: 0.01,
      currency: 'usd'
    },
    timestamp: '2026-07-07T00:00:00.000Z'
  })
  await service.handleEvent({
    sessionId: 'raw-session-usage-b',
    type: 'turn.usage',
    status: 'working',
    project: 'Docs #222222',
    usage: {
      inputTokens: 300,
      outputTokens: 200,
      totalTokens: 500,
      contextUsedPercent: 0.8,
      estimatedCostUsd: 0.02,
      currency: 'USD'
    },
    timestamp: '2026-07-07T00:00:01.000Z'
  })

  const port = service.server.address().port
  const healthResponse = await fetch(`http://127.0.0.1:${port}/health`)
  await service.close()
  const health = await healthResponse.json()

  assert.equal(health.diagnostics.usageTotalTokens, 1500)
  assert.equal(health.diagnostics.usageInputTokens, 1000)
  assert.equal(health.diagnostics.usageOutputTokens, 500)
  assert.equal(health.diagnostics.usageCachedInputTokens, 100)
  assert.equal(health.diagnostics.usageEstimatedCostUsd, 0.03)
  assert.equal(health.diagnostics.usageCurrency, 'USD')
  assert.equal(health.diagnostics.usagePeakContextUsedPercent, 0.8)
})

test('agent awareness diagnostics selects the bounded attention session', () => {
  const diagnostics = buildDiagnostics({
    store: {
      getStatus: () => ({
        sessions: 3,
        totalEvents: 3,
        lastEventAt: '2026-07-07T00:00:02.000Z'
      }),
      listSessions: () => [
        {
          sessionId: 'working-session',
          project: 'OpenPet #111111',
          status: 'working',
          type: 'tool.started',
          timestamp: '2026-07-07T00:00:02.000Z'
        },
        {
          sessionId: 'waiting-session',
          project: 'Docs #222222',
          status: 'waiting',
          type: 'approval.requested',
          timestamp: '2026-07-07T00:00:01.000Z'
        },
        {
          sessionId: 'completed-session',
          project: 'Done #333333',
          status: 'completed',
          type: 'turn.completed',
          timestamp: '2026-07-07T00:00:03.000Z'
        }
      ]
    },
    rolloutPoller: {
      getStatus: () => ({ enabled: true, seenCount: 3 })
    }
  })

  assert.deepEqual(diagnostics.attentionSession, {
    sessionId: 'waiting-session',
    project: 'Docs #222222',
    status: 'waiting',
    reason: 'Waiting for user input'
  })
  assert.equal(JSON.stringify(diagnostics).includes('/Users/mango'), false)
})

test('agent awareness server merges hook and poller events into one richer runtime session shape', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-service-merge-'))
  const service = createAgentAwarenessServer({
    dataDir,
    bridgeClient: {
      event: async () => {},
      say: async () => {}
    },
    createRolloutPoller: () => ({
      getStatus: () => ({ enabled: true, seenCount: 0 }),
      start: () => {},
      stop: () => {}
    })
  })

  await service.handleEvent({
    session_id: 'raw-session-merge',
    hook_event_name: 'PreToolUse',
    tool_name: 'exec_command',
    cwd: '/Users/mango/private/project/OpenPet',
    progress_label: 'Running tool',
    progress_step: 'exec_command',
    progress_current: 1,
    progress_total: 3,
    timestamp: '2026-07-03T00:00:00.000Z'
  }, { initial: false })
  await service.handleEvent({
    sessionId: 'raw-session-merge',
    type: 'approval.requested',
    status: 'waiting',
    message: 'Codex needs approval.',
    cwd: '/Users/mango/private/project/OpenPet',
    timestamp: '2026-07-03T00:00:01.000Z'
  }, { initial: false })

  const session = service.store.listSessions()[0]
  assert.equal(session.phase, 'approval')
  assert.equal(session.toolName, 'exec_command')
  assert.equal(session.progressLabel, 'Running tool')
  assert.equal(session.progressCurrent, 1)
  assert.equal(session.progressTotal, 3)
  assert.equal(session.approvalState, 'requested')
  assert.equal(session.lastSource, 'poller')
})

test('agent awareness server reports installed hook mode when current hook assets still exist', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-service-installed-'))
  const dataDir = path.join(root, 'agent-data')
  const codexHome = path.join(root, 'codex-home')
  installCodexHooks({ dataDir, codexHome, port: 65530 })
  const service = createAgentAwarenessServer({
    dataDir,
    bridgeClient: {
      event: async () => {},
      say: async () => {}
    },
    createRolloutPoller: () => ({
      getStatus: () => ({ enabled: true, seenCount: 0 }),
      start: () => {},
      stop: () => {}
    })
  })

  await service.start(0)
  const port = service.server.address().port
  const healthResponse = await fetch(`http://127.0.0.1:${port}/health`)
  await service.close()

  const health = await healthResponse.json()
  assert.deepEqual(health.hookMode, {
    installed: true,
    mode: 'installed',
    planAvailable: true,
    tokenConfigured: true,
    ingestAuthRequired: true
  })
})

test('agent awareness server reports hook mode as not installed when install state remains but the sender script is missing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-service-stale-hook-'))
  const dataDir = path.join(root, 'agent-data')
  const codexHome = path.join(root, 'codex-home')
  const install = installCodexHooks({ dataDir, codexHome, port: 65530 })
  fs.rmSync(install.hookScriptPath)

  const service = createAgentAwarenessServer({
    dataDir,
    bridgeClient: {
      event: async () => {},
      say: async () => {}
    },
    createRolloutPoller: () => ({
      getStatus: () => ({ enabled: true, seenCount: 0 }),
      start: () => {},
      stop: () => {}
    })
  })

  await service.start(0)
  const port = service.server.address().port
  const healthResponse = await fetch(`http://127.0.0.1:${port}/health`)
  await service.close()

  const health = await healthResponse.json()
  assert.equal(health.hookMode.installed, false)
  assert.equal(health.hookMode.mode, 'not-installed')
  assert.equal(health.hookMode.planAvailable, true)
  assert.equal(health.hookMode.tokenConfigured, true)
})

test('codex hook plan writes only plugin-owned planning files', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-plan-'))
  const result = writeCodexHookPlan({ dataDir, port: DEFAULT_PORT })
  const planText = fs.readFileSync(path.join(dataDir, PLAN_FILE), 'utf-8')
  assert.equal(result.ok, true)
  assert.equal(result.externalWrites, false)
  assert.equal(fs.existsSync(path.join(dataDir, TOKEN_FILE)), true)
  assert.equal(fs.existsSync(path.join(dataDir, PLAN_FILE)), true)
  assert.match(planText, /does not modify `~\/\.codex` automatically/i)
  assert.match(planText, new RegExp(TOKEN_FILE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.equal(planText.includes(result.tokenPath), false)
  assert.equal(planText.includes(dataDir), false)
})

test('codex hook plan command output avoids raw local paths', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-plan-command-'))
  const rawResult = writeCodexHookPlan({ dataDir, port: DEFAULT_PORT })
  const output = toCommandOutput(rawResult)

  assert.equal(output.ok, true)
  assert.equal(output.serviceUrl, `http://127.0.0.1:${DEFAULT_PORT}/api/events`)
  assert.equal(output.authFile, 'plugin-auth-file')
  assert.equal(output.instructionsFile, PLAN_FILE)
  assert.equal(JSON.stringify(output).includes(dataDir), false)
  assert.equal(JSON.stringify(output).includes(rawResult.tokenPath), false)
  assert.equal(JSON.stringify(output).includes(rawResult.instructionsPath), false)
})

test('agent awareness install and uninstall hook commands manage only OpenPet-owned Codex hook handlers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-hook-command-'))
  const codexHome = path.join(root, 'codex-home')
  const dataDir = path.join(root, 'agent-data')
  fs.mkdirSync(codexHome, { recursive: true })
  fs.writeFileSync(path.join(codexHome, 'hooks.json'), JSON.stringify({
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'echo existing-stop' }] }]
    }
  }, null, 2))

  const install = runCommand('install-codex-hooks.js', {
    paths: { dataDir, codexHome },
    port: 8795
  }, {
    OPENPET_DATA_DIR: dataDir,
    OPENPET_CODEX_HOME: codexHome
  })
  const installedBody = JSON.parse(install.stdout)
  const installedHooks = JSON.parse(fs.readFileSync(path.join(codexHome, 'hooks.json'), 'utf-8'))

  assert.equal(install.status, 0)
  assert.equal(installedBody.ok, true)
  assert.equal(installedBody.installed, true)
  assert.equal(installedBody.stateFile, 'hook-install-state.json')
  assert.equal(installedBody.instructionsFile, PLAN_FILE)
  assert.equal(installedBody.authFile, 'plugin-auth-file')
  assert.equal(installedHooks.hooks.Stop[0].hooks[0].command, 'echo existing-stop')
  assert.equal(fs.existsSync(path.join(dataDir, 'hook-install-state.json')), true)

  const uninstall = runCommand('uninstall-codex-hooks.js', {
    paths: { dataDir, codexHome }
  }, {
    OPENPET_DATA_DIR: dataDir,
    OPENPET_CODEX_HOME: codexHome
  })
  const uninstalledBody = JSON.parse(uninstall.stdout)
  const uninstalledHooks = JSON.parse(fs.readFileSync(path.join(codexHome, 'hooks.json'), 'utf-8'))

  assert.equal(uninstall.status, 0)
  assert.equal(uninstalledBody.ok, true)
  assert.equal(uninstalledBody.removed, true)
  assert.equal(uninstalledBody.stateFile, 'hook-install-state.json')
  assert.equal(uninstalledHooks.hooks.Stop[0].hooks[0].command, 'echo existing-stop')
  assert.equal(JSON.stringify(uninstalledHooks).includes('openpet-agent-awareness.js'), false)
  assert.equal(fs.existsSync(path.join(dataDir, 'hook-install-state.json')), false)
})

test('doctor reports service health and local plan status', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-doctor-'))
  writeCodexHookPlan({ dataDir, port: 65530 })
  const result = runCommand('doctor.js', {
    paths: { dataDir },
    port: 65530,
    runtime: { nativeExecutionApproved: true }
  }, { OPENPET_DATA_DIR: dataDir })

  assert.equal(result.status, 0)
  const body = JSON.parse(result.stdout)
  assert.equal(body.ok, true)
  assert.equal(body.healthy, false)
  assert.equal(body.checks.find((check) => check.id === 'hook-plan').ok, true)
  assert.equal(body.checks.find((check) => check.id === 'data-dir').value, 'plugin-data-dir')
  assert.equal(body.checks.find((check) => check.id === 'polling-sessions-dir').value, 'codex:sessions')
  assert.equal(body.checks.find((check) => check.id === 'polling-archived-sessions-dir').value, 'codex:archived_sessions')
  assert.equal(body.checks.find((check) => check.id === 'hook-plan').value, PLAN_FILE)
  assert.equal(body.checks.find((check) => check.id === 'auth-file').value, 'plugin-auth-file')
  assert.equal(body.checks.find((check) => check.id === 'native-execution-approval').ok, true)
  assert.equal(body.checks.find((check) => check.id === 'native-execution-approval').value, 'approved')
  assert.equal(body.checks.find((check) => check.id === 'service-health').ok, false)
  assert.deepEqual(Object.keys(body.serviceHealth).sort(), ['error', 'ok', 'statusCode', 'url'])
  assert.equal(body.serviceHealth.url, '[local-url]')
  assert.equal(typeof body.serviceHealth.error, 'string')
  assert.equal(body.hookMode.installed, false)
  assert.equal(body.nativeExecutionApproved, true)
  assert.equal(result.stdout.includes(dataDir), false)
  assert.deepEqual(body.diagnostics, {
    sessionCount: 0,
    activeSessionCount: 0,
    totalEvents: 0,
    seenCount: 0,
    ignoredContentRecordCount: 0,
    ignoredMetadataRecordCount: 0,
    unknownRecordCount: 0,
    malformedRecordCount: 0,
    unsupportedLifecycleRecordCount: 0,
    lastEventAt: '',
    lastScanAt: '',
    lastError: ''
  })
})

test('doctor reports installed hook mode when current hook assets still exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-doctor-installed-'))
  const dataDir = path.join(root, 'agent-data')
  const codexHome = path.join(root, 'codex-home')
  installCodexHooks({ dataDir, codexHome, port: 65530 })
  const result = runCommand('doctor.js', {
    paths: { dataDir },
    codexHome,
    port: 65530,
    runtime: { nativeExecutionApproved: true }
  }, { OPENPET_DATA_DIR: dataDir })

  assert.equal(result.status, 0)
  const body = JSON.parse(result.stdout)
  assert.equal(body.hookMode.installed, true)
  assert.equal(body.hookMode.mode, 'installed')
})

test('doctor reports hook mode as not installed when install state remains but hooks.json no longer contains OpenPet handlers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-doctor-stale-hook-'))
  const dataDir = path.join(root, 'agent-data')
  const codexHome = path.join(root, 'codex-home')
  const install = installCodexHooks({ dataDir, codexHome, port: 65530 })
  fs.writeFileSync(install.hooksPath, JSON.stringify({
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'echo existing-stop' }] }]
    }
  }, null, 2))

  const result = runCommand('doctor.js', {
    paths: { dataDir },
    codexHome,
    port: 65530,
    runtime: { nativeExecutionApproved: true }
  }, { OPENPET_DATA_DIR: dataDir })

  assert.equal(result.status, 0)
  const body = JSON.parse(result.stdout)
  assert.equal(body.hookMode.installed, false)
  assert.equal(body.hookMode.mode, 'not-installed')
  assert.equal(body.hookMode.planAvailable, true)
})

test('doctor falls back to host-managed-unknown when approval state is not provided', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-doctor-unknown-'))
  const result = runCommand('doctor.js', { paths: { dataDir }, port: 65530 }, { OPENPET_DATA_DIR: dataDir })

  assert.equal(result.status, 0)
  const body = JSON.parse(result.stdout)
  assert.equal(body.ok, true)
  assert.equal(body.checks.find((check) => check.id === 'native-execution-approval').ok, false)
  assert.equal(body.checks.find((check) => check.id === 'native-execution-approval').value, 'host-managed-unknown')
  assert.equal(body.nativeExecutionApproved, null)
})

test('doctor surfaces event and poller diagnostics from a running service', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-doctor-live-'))
  const service = createAgentAwarenessServer({
    dataDir,
    bridgeClient: {
      event: async () => {},
      say: async () => {}
    },
    createRolloutPoller: () => ({
      getStatus: () => ({
        enabled: true,
        seenCount: 7,
        ignoredContentRecordCount: 4,
        ignoredMetadataRecordCount: 2,
        unknownRecordCount: 2,
        malformedRecordCount: 1,
        unsupportedLifecycleRecordCount: 1,
        lastScanAt: '2026-07-03T00:00:05.000Z',
        lastError: ''
      }),
      start: () => {},
      stop: () => {}
    })
  })

  await service.start(0)
  await service.handleEvent({
    sessionId: 'raw-session-3',
    type: 'turn.completed',
    status: 'completed',
    message: 'Codex completed a turn.',
    cwd: '/tmp/OpenPet',
    timestamp: '2026-07-03T00:00:01.000Z'
  }, { initial: false })
  const port = service.server.address().port
  const serviceHealth = await checkServiceHealth(port)
  const diagnostics = readDiagnostics(serviceHealth)
  await service.close()

  assert.equal(serviceHealth.ok, true)
  assert.equal(diagnostics.sessionCount, 1)
  assert.equal(diagnostics.activeSessionCount, 0)
  assert.equal(diagnostics.totalEvents, 1)
  assert.equal(diagnostics.seenCount, 7)
  assert.equal(diagnostics.ignoredContentRecordCount, 4)
  assert.equal(diagnostics.ignoredMetadataRecordCount, 2)
  assert.equal(diagnostics.unknownRecordCount, 2)
  assert.equal(diagnostics.malformedRecordCount, 1)
  assert.equal(diagnostics.unsupportedLifecycleRecordCount, 1)
  assert.equal(diagnostics.lastEventAt, '2026-07-03T00:00:01.000Z')
})

test('agent awareness service health redacts raw poller errors before returning diagnostics', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-health-redaction-'))
  const service = createAgentAwarenessServer({
    dataDir,
    bridgeClient: {
      event: async () => {},
      say: async () => {}
    },
    createRolloutPoller: () => ({
      getStatus: () => ({
        enabled: true,
        seenCount: 0,
        lastScanAt: '2026-07-03T00:00:05.000Z',
        lastError: 'Poll failed at /Users/mango/private/OpenPet via http://127.0.0.1:8795/health with Bearer secret-token sk-test123'
      }),
      start: () => {},
      stop: () => {}
    })
  })

  await service.start(0)
  const port = service.server.address().port
  const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json())
  await service.close()

  assert.equal(health.codexPoller.lastError, 'Poll failed at [path] via [local-url] with Bearer [redacted] [redacted-key]')
  assert.equal(health.diagnostics.lastError, 'Poll failed at [path] via [local-url] with Bearer [redacted] [redacted-key]')
  assert.equal(JSON.stringify(health).includes('/Users/mango/private/OpenPet'), false)
  assert.equal(JSON.stringify(health).includes('127.0.0.1:8795'), false)
  assert.equal(JSON.stringify(health).includes('secret-token'), false)
  assert.equal(JSON.stringify(health).includes('sk-test123'), false)
})

test('doctor output redacts local paths, loopback URLs, and secrets in health and diagnostics fields', () => {
  const serviceHealth = toDoctorServiceHealthOutput({
    ok: false,
    url: 'http://127.0.0.1:8795/health',
    statusCode: null,
    error: 'Health request failed for /Users/mango/private/OpenPet with Bearer secret-token sk-test123'
  })
  const body = redactDoctorOutput({
    diagnostics: {
      lastError: 'Polling failed at /Users/mango/private/OpenPet via http://127.0.0.1:8795/health with Bearer secret-token sk-test123'
    },
    serviceHealth,
    checks: [
      { id: 'data-dir', ok: true, value: '/Users/mango/private/OpenPet/.agent-awareness-data' }
    ]
  })

  assert.equal(serviceHealth.url, '[local-url]')
  assert.equal(serviceHealth.error, 'Health request failed for [path] with Bearer [redacted] [redacted-key]')
  assert.equal(body.diagnostics.lastError, 'Polling failed at [path] via [local-url] with Bearer [redacted] [redacted-key]')
  assert.equal(body.checks[0].value, 'plugin-data-dir')
})

test('agent awareness event ingestion requires bearer token after hook plan creates one', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-agent-awareness-auth-'))
  const plan = writeCodexHookPlan({ dataDir, port: 0 })
  const token = fs.readFileSync(plan.tokenPath, 'utf-8').trim()
  const service = createAgentAwarenessServer({
    dataDir,
    bridgeClient: {
      event: async () => {},
      say: async () => {}
    },
    createRolloutPoller: () => ({
      getStatus: () => ({ enabled: true }),
      start: () => {},
      stop: () => {}
    })
  })

  await service.start(0)
  const port = service.server.address().port
  const unauthorized = await fetch(`http://127.0.0.1:${port}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'raw-session-1', type: 'turn.completed', status: 'completed' })
  })
  const authorized = await fetch(`http://127.0.0.1:${port}/api/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sessionId: 'raw-session-1', type: 'turn.completed', status: 'completed' })
  })
  await service.close()

  assert.equal(unauthorized.status, 401)
  assert.equal(authorized.status, 200)
})
