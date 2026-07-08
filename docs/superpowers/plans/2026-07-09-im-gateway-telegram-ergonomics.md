# IM Gateway Telegram Ergonomics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Telegram onboarding helper commands and redacted setup diagnostics to the bundled `openpet.im-gateway` plugin without moving IM transport or secrets into the OpenPet main process.

**Architecture:** Keep command parsing, helper replies, allowlist exceptions, and bounded diagnostics inside the plugin runtime. Reuse the existing `/health` endpoint and host service-health polling so the main process only summarizes safe IM Gateway diagnostics for the Plugins pane. The Control Center should compute setup hints from host-owned secret state plus service runtime health instead of introducing a new renderer-only settings surface.

**Tech Stack:** Node.js main-process services, bundled runtime plugin JavaScript, Electron Control Center (React + TypeScript + Vite), Node native test runner, Playwright smoke tests.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/1dc8/OpenPet` on branch `dev9`.
- Do not edit the protected primary worktree at `/Users/mango/project/codex/OpenPet`.
- This milestone includes only `/openpet whoami`, `/openpet chatid`, a narrow pre-allowlist exception for those two commands only, redacted allowlist-miss diagnostics, redacted Telegram startup diagnostics for missing token and polling/start failures, clearer IM Gateway onboarding and empty-state guidance inside the Plugins pane, targeted tests, README updates, spec, and implementation plan.
- This milestone does not include QQ runtime work.
- This milestone does not include WeChat runtime work.
- This milestone does not include generic IM diagnostics framework work.
- This milestone does not include media, sticker, voice, or image understanding.
- This milestone does not include broader AI behavior changes.
- This milestone does not include moving Telegram into the OpenPet main process as a platform feature.
- `whoami` and `chatid` work even when the current sender or chat does not yet pass the normal allowlist.
- That exception applies only to those two commands.
- Raw bot/chat/user identifiers may appear in Telegram chat replies from those helper commands.
- Raw identifiers must not appear in Control Center, plugin health summaries, or plugin logs.
- `npm start` must remain functional at every stage.
- Plugins must not have unrestricted Node/Electron access.
- All new configuration must be operable through the Control Center UI.
- Real Telegram bot token validation, real private/group operator testing, and live polling-conflict reproduction stay Manual-required.

---

## File Map

- `examples/plugins/im-gateway/service/core/commands.js`: add first-class parser support for `/openpet whoami` and `/openpet chatid`.
- `examples/plugins/im-gateway/service/core/gateway.js`: move helper-command parsing before allowlist rejection, reply with raw ids in chat, and persist bounded redacted diagnostics.
- `examples/plugins/im-gateway/service/health.js`: expose new diagnostic codes and timestamps while keeping chat/user identifiers hashed.
- `examples/plugins/im-gateway/service/adapters/telegram.js`: classify polling/start failures into stable operator-facing error codes.
- `tests/examples/im-gateway-plugin.test.js`: cover helper command parsing, pre-allowlist helper replies, non-helper blocking, redacted health, and polling-conflict diagnostics.
- `src/main/services/plugin-service.js`: summarize IM Gateway JSON health bodies into safe `runtime.health.message` strings for the Control Center.
- `tests/services/plugin-service.test.js`: cover IM Gateway health summarization and redaction boundaries.
- `src/control-center/src/panes/PluginsPane.tsx`: render IM Gateway onboarding hints from secret state, service runtime state, and health summaries.
- `tests/control-center/demo-control-center-api.test.js`: keep demo plugin fixtures aligned with onboarding diagnostics state used by renderer tests.
- `tests/control-center/control-center-smoke.spec.js`: cover IM Gateway onboarding hints and redacted health text in the Plugins pane.
- `examples/plugins/im-gateway/README.md`: document the helper commands, onboarding flow, and privacy boundary.
- `docs/TODO.md`: update the active queue wording only if milestone completion changes that line during Task 3.

### Task 1: Phase 1 - Command Exception and Diagnostics Core

**Stage goal:** Implement `/openpet whoami` and `/openpet chatid`, keep the exception scoped to those commands, and persist only redacted diagnostics.

**Corresponds to P0/P1:** helper commands, pre-allowlist exception, allowlist-miss diagnostics, Telegram startup diagnostics.

**Verifiable result:** a blocked Telegram sender can still use `whoami` and `chatid`; `/openpet status` and non-command text remain blocked; gateway health surfaces only redacted reason/code fields; Telegram startup conflicts produce a stable error code.

**Files:**
- Modify: `examples/plugins/im-gateway/service/core/commands.js:12-33`
- Modify: `examples/plugins/im-gateway/service/core/gateway.js:12-199`
- Modify: `examples/plugins/im-gateway/service/health.js:8-43`
- Modify: `examples/plugins/im-gateway/service/adapters/telegram.js:81-142`
- Test: `tests/examples/im-gateway-plugin.test.js:81-582`

**Interfaces:**
- Consumes: `parseOpenPetCommand(text, config)`, `isMessageAllowed(message, config)`, `adapter.getStatus()`, `gateway.getHealth()`.
- Produces: `parseOpenPetCommand('/openpet whoami', config) -> { matched: true, name: 'whoami', args: [] }`, `parseOpenPetCommand('/openpet chatid', config) -> { matched: true, name: 'chatid', args: [] }`, and `gateway.getHealth().adapters.telegram.{ lastAllowlistReason, lastDiagnosticCode, lastDiagnosticAt, lastErrorCode }`.

- [ ] **Step 1: Write the failing helper-command and diagnostics regressions**

Add these tests to `tests/examples/im-gateway-plugin.test.js`:

```js
test('im gateway command parser recognizes onboarding helper commands', () => {
  const config = normalizeImGatewayConfig({ commandAliases: '/openpet,/op' })

  assert.deepEqual(parseOpenPetCommand('/openpet whoami', config), {
    matched: true,
    name: 'whoami',
    args: []
  })
  assert.deepEqual(parseOpenPetCommand('/op chatid', config), {
    matched: true,
    name: 'chatid',
    args: []
  })
})

test('im gateway helper commands bypass allowlist while non-helper commands still block', async () => {
  const replies = []
  const gateway = createImGateway({
    bridgeClient: {},
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      allowedChats: '-2001'
    }),
    now: () => '2026-07-09T01:00:00.000Z'
  })

  const adapter = {
    id: 'telegram',
    platform: 'telegram',
    sendReceipt: async (_message, text) => replies.push(text)
  }

  await gateway.handleMessage(adapter, {
    platform: 'telegram',
    adapterId: 'telegram',
    chatType: 'private',
    chatId: '9001',
    userId: '9001',
    userName: 'new-user',
    messageId: 'who-1',
    text: '/openpet whoami',
    receivedAt: '2026-07-09T01:00:00.000Z'
  })
  await gateway.handleMessage(adapter, {
    platform: 'telegram',
    adapterId: 'telegram',
    chatType: 'group',
    chatId: '-3001',
    userId: '9001',
    userName: 'new-user',
    messageId: 'chat-1',
    text: '/openpet chatid',
    receivedAt: '2026-07-09T01:00:01.000Z'
  })
  await gateway.handleMessage(adapter, {
    platform: 'telegram',
    adapterId: 'telegram',
    chatType: 'group',
    chatId: '-3001',
    userId: '9001',
    userName: 'new-user',
    messageId: 'status-1',
    text: '/openpet status',
    receivedAt: '2026-07-09T01:00:02.000Z'
  })

  const health = gateway.getHealth()
  const encoded = JSON.stringify(health)

  assert.equal(replies.length, 2)
  assert.equal(replies[0].includes('9001'), true)
  assert.equal(replies[1].includes('-3001'), true)
  assert.equal(health.adapters.telegram.lastAllowlistReason, 'group-chat-not-allowed')
  assert.equal(health.adapters.telegram.lastDiagnosticCode, 'allowlist-miss')
  assert.equal(health.adapters.telegram.lastDiagnosticAt, '2026-07-09T01:00:00.000Z')
  assert.equal(encoded.includes('9001'), false)
  assert.equal(encoded.includes('-3001'), false)
})

test('telegram adapter classifies polling conflicts for operator diagnostics', async () => {
  class ConflictBot {
    on() {}
    start() {
      return Promise.reject(new Error('409: terminated by other getUpdates request'))
    }
    stop() {}
  }

  const adapter = createTelegramAdapter({
    token: 'telegram-token',
    config: normalizeImGatewayConfig({ telegramEnabled: true }),
    grammy: { Bot: ConflictBot }
  })

  await adapter.start()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(adapter.getStatus().status, 'failed')
  assert.equal(adapter.getStatus().lastErrorCode, 'telegram-polling-conflict')
})
```

- [ ] **Step 2: Run the targeted IM Gateway tests to verify they fail**

Run:

```bash
node --test tests/examples/im-gateway-plugin.test.js --test-name-pattern "onboarding helper|bypass allowlist|polling conflicts"
```

Expected: FAIL because `whoami` / `chatid` are still treated as unknown commands, blocked senders receive no helper reply, and polling conflicts still collapse into `telegram-polling-failed`.

- [ ] **Step 3: Implement the minimal helper-command and diagnostics code**

Update `examples/plugins/im-gateway/service/core/commands.js`:

```js
const SIMPLE_COMMANDS = new Set(['status', 'whoami', 'chatid'])

const parseOpenPetCommand = (text = '', config = {}) => {
  const trimmed = String(text || '').trim()
  if (!trimmed) return { matched: false }
  const parts = trimmed.split(/\s+/)
  if (!isOpenPetAlias(parts[0], config.commandAliases || [])) return { matched: false }

  const name = String(parts[1] || 'status').toLowerCase()
  const args = parts.slice(2)
  if (name === 'say') return { matched: true, name, args, text: args.join(' ') }
  if (name === 'action') return { matched: true, name, args, actionId: args[0] || '' }
  if (name === 'event') return { matched: true, name, args, type: args[0] || '', message: args.slice(1).join(' ') }
  if (SIMPLE_COMMANDS.has(name)) return { matched: true, name, args }
  return { matched: true, name, args }
}
```

Update `examples/plugins/im-gateway/service/core/gateway.js`:

```js
const createEmptyState = () => ({
  lastMessageAt: '',
  lastTriggerAt: '',
  triggerCount: 0,
  lastErrorCode: '',
  lastChatId: '',
  lastUserId: '',
  lastAiReplyAt: '',
  aiReplyCount: 0,
  lastAiErrorCode: '',
  lastAllowlistReason: '',
  lastDiagnosticCode: '',
  lastDiagnosticAt: ''
})

const HELPER_COMMANDS = new Set(['whoami', 'chatid'])

const markDiagnostic = (adapter, message, code, extra = {}) => {
  const state = getState(adapter)
  state.lastDiagnosticCode = String(code || '')
  state.lastDiagnosticAt = now()
  state.lastChatId = message.chatId || ''
  state.lastUserId = message.userId || ''
  if (extra.lastAllowlistReason) state.lastAllowlistReason = extra.lastAllowlistReason
}

const buildWhoamiReply = (message) => [
  `Telegram user id: ${String(message.userId || '').trim() || 'unknown'}`,
  message.userName ? `username: ${message.userName}` : ''
].filter(Boolean).join(' · ')

const buildChatIdReply = (message) => [
  `chat type: ${String(message.chatType || '').trim() || 'unknown'}`,
  `chat id: ${String(message.chatId || '').trim() || 'unknown'}`
].join(' · ')

const isHelperCommand = (command = {}) => command.matched === true && HELPER_COMMANDS.has(String(command.name || ''))

const handleCommand = async (adapter, message, command) => {
  if (command.name === 'whoami') {
    await sendDirectReply(adapter, message, buildWhoamiReply(message))
    markDiagnostic(adapter, message, 'helper-whoami')
    return
  }
  if (command.name === 'chatid') {
    await sendDirectReply(adapter, message, buildChatIdReply(message))
    markDiagnostic(adapter, message, 'helper-chatid')
    return
  }
  // keep existing say/action/event/status branches here
}

const handleMessage = async (adapter, message) => {
  markMessage(adapter, message)
  const command = parseOpenPetCommand(message.text, config)
  if (isHelperCommand(command)) {
    await handleCommand(adapter, message, command)
    return
  }

  const allowlist = isMessageAllowed(message, config)
  if (!allowlist.allowed) {
    markDiagnostic(adapter, message, 'allowlist-miss', {
      lastAllowlistReason: allowlist.reason
    })
    return
  }

  if (command.matched) {
    await handleCommand(adapter, message, command)
    return
  }

  // keep existing AI / pet-say routing here
}
```

Update `examples/plugins/im-gateway/service/health.js`:

```js
return {
  enabled: adapterStatus.enabled === true,
  status: adapterStatus.status || state.status || 'unknown',
  mode: adapterStatus.mode || state.mode || '',
  lastMessageAt: state.lastMessageAt || '',
  lastTriggerAt: state.lastTriggerAt || '',
  triggerCount: state.triggerCount || 0,
  lastErrorCode: adapterStatus.lastErrorCode || state.lastErrorCode || '',
  lastAiReplyAt: state.lastAiReplyAt || '',
  aiReplyCount: state.aiReplyCount || 0,
  lastAiErrorCode: state.lastAiErrorCode || '',
  lastAllowlistReason: state.lastAllowlistReason || '',
  lastDiagnosticCode: state.lastDiagnosticCode || '',
  lastDiagnosticAt: state.lastDiagnosticAt || '',
  lastChatHash: state.lastChatId ? hashIdentifier(state.lastChatId) : '',
  lastUserHash: state.lastUserId ? hashIdentifier(state.lastUserId) : ''
}
```

Update `examples/plugins/im-gateway/service/adapters/telegram.js`:

```js
const classifyTelegramStartError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  if (message.includes('terminated by other getupdates request')) return 'telegram-polling-conflict'
  return 'telegram-polling-failed'
}

pollingPromise = Promise.resolve(bot.start())
  .then(() => {
    if (status === 'connected') status = 'stopped'
  })
  .catch((error) => {
    status = 'failed'
    lastErrorCode = classifyTelegramStartError(error)
  })
```

- [ ] **Step 4: Run the focused IM Gateway regression suite**

Run:

```bash
node --test tests/examples/im-gateway-plugin.test.js --test-name-pattern "onboarding helper|bypass allowlist|polling conflicts|adapter error codes|health redacts"
```

Expected: PASS with the new helper-command, allowlist, health, and adapter diagnostics coverage green.

- [ ] **Step 5: Commit Phase 1**

Run:

```bash
git add \
  examples/plugins/im-gateway/service/core/commands.js \
  examples/plugins/im-gateway/service/core/gateway.js \
  examples/plugins/im-gateway/service/health.js \
  examples/plugins/im-gateway/service/adapters/telegram.js \
  tests/examples/im-gateway-plugin.test.js
git commit -m "feat(phase-1): add telegram onboarding helpers and diagnostics"
```

### Task 2: Phase 2 - Host Health Summary and Plugins Pane Onboarding

**Stage goal:** Summarize IM Gateway diagnostics safely in the host and surface next-step Telegram setup guidance in the Plugins pane.

**Corresponds to P0/P1:** redacted host diagnostics, Plugins pane onboarding/empty-state guidance, demo/UI coverage.

**Verifiable result:** host health checks show safe IM Gateway messages like `Telegram token missing` or `Recent Telegram message blocked by allowlist`, and the Plugins pane turns token state, service state, and health summaries into actionable operator hints without exposing raw ids.

**Files:**
- Modify: `src/main/services/plugin-service.js:140-150,160-249,1940-2010`
- Modify: `src/control-center/src/panes/PluginsPane.tsx:514-566`
- Modify: `tests/services/plugin-service.test.js:4998-5052`
- Modify: `tests/control-center/demo-control-center-api.test.js:117-178,326-360`
- Modify: `tests/control-center/control-center-smoke.spec.js:1924-2070`

**Interfaces:**
- Consumes: `readServiceHealthResponseMessage(response, { pluginId, serviceId })`, `plugin.entries.services[0].runtime.health`, `imGatewaySecretState.hasTelegramBotToken`.
- Produces: internal helper `summarizeImGatewayHealthBody(body) -> string`, host-visible `runtime.health.message` for IM Gateway services, and renderer helper `getImGatewaySetupHints(plugin, imGatewaySecretState) -> string[]`.

- [ ] **Step 1: Write the failing host-summary and UI onboarding regressions**

Add this health-summary test to `tests/services/plugin-service.test.js`:

```js
test('plugin service summarizes IM Gateway health diagnostics without leaking raw identifiers', async () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'openpet.im-gateway': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [path.resolve(__dirname, '../../examples/plugins')],
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name) => String(name || '').toLowerCase() === 'content-type' ? 'application/json' : ''
      },
      text: async () => JSON.stringify({
        ok: true,
        service: 'openpet.im-gateway',
        adapters: {
          telegram: {
            enabled: true,
            status: 'failed',
            lastErrorCode: 'telegram-polling-conflict',
            lastDiagnosticCode: 'allowlist-miss',
            lastAllowlistReason: 'group-chat-not-allowed',
            lastChatHash: 'abc123',
            lastUserHash: 'def456'
          }
        }
      })
    })
  })

  const result = await service.checkServiceHealth('openpet.im-gateway', 'im-gateway')
  const encoded = JSON.stringify(result)

  assert.equal(result.health.message, 'Telegram polling conflict')
  assert.equal(encoded.includes('1001'), false)
  assert.equal(encoded.includes('telegram-token'), false)
})
```

Add this demo-fixture regression to `tests/control-center/demo-control-center-api.test.js`:

```js
test('demo API preserves IM Gateway onboarding diagnostics fixtures', async () => {
  const plugin = createImGatewayPhase2DemoPlugin()
  plugin.nativeExecutionApproved = false
  plugin.entries.services = [{
    id: 'im-gateway',
    title: 'IM Gateway Service',
    command: 'node ./service/im-gateway-service.js',
    cwd: '.',
    health: { type: 'http', url: 'http://127.0.0.1:8796/health' },
    runtime: {
      status: 'running',
      pid: 3210,
      health: {
        status: 'healthy',
        checkedAt: '2026-07-09T02:00:00.000Z',
        url: 'http://127.0.0.1:8796/health',
        statusCode: 200,
        message: 'Recent Telegram message blocked by allowlist'
      }
    },
    healthPolicy: { enabled: false, intervalMs: 30000 }
  }]

  const stored = await upsertDemoPlugin(plugin)
  assert.equal(stored.entries.services[0].runtime.health.message, 'Recent Telegram message blocked by allowlist')
})
```

Add this Plugins-pane smoke test to `tests/control-center/control-center-smoke.spec.js`:

```js
test('shows IM Gateway onboarding guidance and redacted diagnostics in the Plugins pane', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('openpet.controlCenter.demoState', JSON.stringify({
      plugins: [{
        id: 'openpet.im-gateway',
        name: 'IM Gateway',
        version: '0.2.0-demo',
        source: 'bundled',
        enabled: true,
        runnable: true,
        requiresNativeExecution: true,
        nativeExecutionApproved: true,
        permissions: ['pet:say', 'pet:action', 'pet:event', 'ai:chat'],
        commands: [],
        entries: {
          setup: [],
          commands: [],
          services: [{
            id: 'im-gateway',
            title: 'IM Gateway Service',
            command: 'node ./service/im-gateway-service.js',
            cwd: '.',
            health: { type: 'http', url: 'http://127.0.0.1:8796/health' },
            runtime: {
              status: 'running',
              pid: 4321,
              health: {
                status: 'healthy',
                checkedAt: '2026-07-09T02:00:00.000Z',
                url: 'http://127.0.0.1:8796/health',
                statusCode: 200,
                message: 'Recent Telegram message blocked by allowlist'
              }
            },
            healthPolicy: { enabled: false, intervalMs: 30000 }
          }],
          dashboards: []
        },
        configSchema: { title: 'IM Gateway Settings', description: 'Public IM trigger policy. Tokens are stored by the host.', properties: [] },
        config: { telegramMode: 'polling' },
        storage: { keyCount: 0, byteSize: 2, valid: true },
        signatureStatus: { status: 'bundled', label: 'Bundled plugin', signer: 'openpet', algorithm: '', verified: true, errors: [] },
        blockStatus: { blocked: false, reasons: [] }
      }],
      secrets: { imGatewayTelegramBotToken: true },
      pluginLogs: []
    }))
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Plugins' }).click()

  const pluginRow = page.locator('.plugin-row', { hasText: 'IM Gateway' })
  const imCard = pluginRow.locator('[aria-label="IM Gateway 设置"]')

  await expect(imCard).toContainText('/openpet whoami')
  await expect(imCard).toContainText('/openpet chatid')
  await expect(imCard).toContainText('Recent Telegram message blocked by allowlist')
  await expect(imCard).not.toContainText('1001')
})
```

- [ ] **Step 2: Run the focused host/UI tests to verify they fail**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "summarizes IM Gateway health diagnostics"
node --test tests/control-center/demo-control-center-api.test.js --test-name-pattern "IM Gateway onboarding diagnostics fixtures"
node scripts/run-control-center-playwright.js tests/control-center/control-center-smoke.spec.js --grep "shows IM Gateway onboarding guidance and redacted diagnostics"
```

Expected:

- the plugin-service test FAILS because IM Gateway JSON health still falls back to `OK` / `HTTP nnn`;
- the demo test FAILS if the fixture shape is incomplete for the new UI expectations;
- the Playwright test FAILS because the Plugins pane does not render onboarding hints or diagnostic copy yet.

- [ ] **Step 3: Implement host health summarization and Plugins-pane hints**

Update `src/main/services/plugin-service.js`:

```js
const IM_GATEWAY_PLUGIN_ID = 'openpet.im-gateway'
const IM_GATEWAY_SERVICE_ID = 'im-gateway'

const isImGatewayHealthTarget = ({ pluginId = '', serviceId = '' } = {}) => (
  pluginId === IM_GATEWAY_PLUGIN_ID &&
  serviceId === IM_GATEWAY_SERVICE_ID
)

const isImGatewayHealthBody = (body) => (
  isRecord(body) &&
  body.service === 'openpet.im-gateway' &&
  isRecord(body.adapters) &&
  isRecord(body.adapters.telegram)
)

const summarizeImGatewayHealthBody = (body) => {
  if (!isImGatewayHealthBody(body)) return ''
  const telegram = body.adapters.telegram
  if (telegram.lastErrorCode === 'missing-token') return 'Telegram token missing'
  if (telegram.lastErrorCode === 'telegram-polling-conflict') return 'Telegram polling conflict'
  if (telegram.lastErrorCode === 'telegram-polling-failed') return 'Telegram polling failed'
  if (telegram.lastDiagnosticCode === 'allowlist-miss') return 'Recent Telegram message blocked by allowlist'
  return ''
}

const readServiceHealthResponseMessage = async (response, { pluginId = '', serviceId = '' } = {}) => {
  const fallbackMessage = response?.ok ? 'OK' : `HTTP ${Number.isFinite(Number(response?.status)) ? Number(response.status) : 'error'}`
  const contentType = String(response?.headers?.get?.('content-type') || '').toLowerCase()
  if (!contentType.includes('application/json')) return fallbackMessage
  try {
    const text = await readLimitedResponseText(response)
    const body = JSON.parse(text)
    if (isAgentAwarenessHealthTarget({ pluginId, serviceId })) {
      return summarizeAgentAwarenessHealthBody(body) || fallbackMessage
    }
    if (isImGatewayHealthTarget({ pluginId, serviceId })) {
      return summarizeImGatewayHealthBody(body) || fallbackMessage
    }
    return fallbackMessage
  } catch (_) {
    return fallbackMessage
  }
}
```

Update `src/control-center/src/panes/PluginsPane.tsx`:

```tsx
const getImGatewayServiceRuntime = (plugin: PluginViewState) => (
  plugin.entries?.services?.find((service) => service.id === 'im-gateway')?.runtime || null
)

const getImGatewaySetupHints = (
  plugin: PluginViewState,
  imGatewaySecretState: ImGatewaySecretState
) => {
  const runtime = getImGatewayServiceRuntime(plugin)
  const hints: string[] = []
  if (!imGatewaySecretState.hasTelegramBotToken) hints.push('Save a Telegram bot token first.')
  if (plugin.requiresNativeExecution && !plugin.nativeExecutionApproved) {
    hints.push('Approve native execution before starting the service.')
  }
  if (runtime?.status !== 'running') {
    hints.push('Start the IM Gateway Service after saving the token.')
  } else {
    hints.push('In Telegram, send /openpet whoami and /openpet chatid to collect allowlist values.')
  }
  if (runtime?.health?.message) hints.push(runtime.health.message)
  return hints
}
```

Render the hints inside the IM Gateway card:

```tsx
const imGatewayHints = getImGatewaySetupHints(plugin, imGatewaySecretState)

{imGatewayHints.length ? (
  <div className="field-note">
    {imGatewayHints.map((hint) => <div key={hint}>{hint}</div>)}
  </div>
) : null}
```

- [ ] **Step 4: Run the focused host and renderer regression suite**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "summarizes IM Gateway health diagnostics"
node --test tests/control-center/demo-control-center-api.test.js --test-name-pattern "IM Gateway onboarding diagnostics fixtures"
node scripts/run-control-center-playwright.js tests/control-center/control-center-smoke.spec.js --grep "IM Gateway"
```

Expected: PASS; the health-summary unit test, demo fixture regression, and IM Gateway Playwright coverage all go green.

- [ ] **Step 5: Commit Phase 2**

Run:

```bash
git add \
  src/main/services/plugin-service.js \
  src/control-center/src/panes/PluginsPane.tsx \
  tests/services/plugin-service.test.js \
  tests/control-center/demo-control-center-api.test.js \
  tests/control-center/control-center-smoke.spec.js
git commit -m "feat(phase-2): add IM gateway onboarding guidance"
```

### Task 3: Phase 3 - Docs, Verification, and Merge-Readiness

**Stage goal:** Make the operator documentation truthful, verify the milestone against its acceptance criteria, and prepare the branch for implementation review.

**Corresponds to P0/P1:** README updates, milestone-scoped verification, production-style review, final queue wording sync if completion changes it.

**Verifiable result:** README documents helper commands and privacy correctly, milestone-specific checks pass, and the active TODO wording is updated only if the milestone is now complete.

**Files:**
- Modify: `examples/plugins/im-gateway/README.md:10-50`
- Modify if milestone completion changes queue wording: `docs/TODO.md:28-31`

**Interfaces:**
- Consumes: helper command behavior from Task 1, host-visible onboarding/diagnostic text from Task 2, milestone acceptance criteria in `docs/superpowers/specs/2026-07-09-im-gateway-telegram-ergonomics-design.md`.
- Produces: updated operator documentation and a verified implementation branch ready for production-code-quality review.

- [ ] **Step 1: Update the IM Gateway README with helper commands and privacy wording**

Edit `examples/plugins/im-gateway/README.md` so the setup and commands sections read like this:

```md
## Telegram Setup

1. Create a bot with BotFather and copy the bot token.
2. In OpenPet Control Center, enable the IM Gateway plugin.
3. Save the Telegram token in the IM Gateway card. The token is stored by the
   host secret service and is injected only into this plugin service.
4. Approve native execution, then start the IM Gateway Service.
5. In Telegram, send `/openpet whoami` and `/openpet chatid` to collect the
   values needed for `allowedUsers` and `allowedChats`.
6. Save the allowlist values in the IM Gateway config.

The helper commands above work even before the allowlist is configured. Other
commands and non-command traffic still require the normal allowlist rules.

## Commands

- `/openpet whoami`
- `/openpet chatid`
- `/openpet say <text>`
- `/openpet action <actionId>`
- `/openpet event <type> <message>`
- `/openpet status`
- `/op ...` as the short alias

## Privacy

Helper replies may include raw Telegram user ids and chat ids in Telegram chat.
Control Center, plugin health, and plugin logs keep those identifiers redacted.
```

- [ ] **Step 2: Update the active queue wording only if the milestone is actually complete**

If every Phase 1 and Phase 2 code change is merged on `dev9`, change the P1 line in `docs/TODO.md` from:

```md
- [ ] Improve IM Gateway Telegram setup ergonomics before broadening platform scope. Add a "who am I" helper, a current-chat-id helper, allowlist-miss diagnostics, polling-conflict/token diagnostics, and clearer Plugins-pane empty states while keeping tokens host-owned and renderer-safe.
```

to:

```md
- [x] Improve IM Gateway Telegram setup ergonomics before broadening platform scope. Added `/openpet whoami`, `/openpet chatid`, redacted allowlist/startup diagnostics, and Plugins-pane onboarding guidance while keeping tokens host-owned and renderer-safe.
```

If the milestone is not complete yet, leave `docs/TODO.md` unchanged.

- [ ] **Step 3: Run milestone-scoped verification**

Run:

```bash
npm run check:syntax
node --test tests/examples/im-gateway-plugin.test.js
node --test tests/services/plugin-service.test.js --test-name-pattern "IM Gateway|service health"
node --test tests/control-center/demo-control-center-api.test.js --test-name-pattern "IM Gateway"
node scripts/run-control-center-playwright.js tests/control-center/control-center-smoke.spec.js --grep "IM Gateway"
```

Expected:

- `npm run check:syntax` exits `0`
- IM Gateway example tests PASS
- IM Gateway/service-health focused host tests PASS
- IM Gateway demo API tests PASS
- IM Gateway Playwright coverage PASS

- [ ] **Step 4: Run the production review and capture its verdict**

Use `production-code-quality-review/SKILL.md` on the Phase 1-3 diff and record the result in your execution notes using this exact template:

```text
严重问题：
中等问题：
非阻塞建议：
安全风险：
稳定性风险：
可维护性风险：
测试覆盖：
质量评分：
通过状态：通过 / 有条件通过 / 不通过
```

Only fix P0/P1 blockers before moving on. Put non-blocking comments into backlog notes instead of expanding scope.

- [ ] **Step 5: Commit Phase 3**

Run:

```bash
git add examples/plugins/im-gateway/README.md docs/TODO.md
git commit -m "docs(phase-3): document IM gateway onboarding helpers"
```

If `docs/TODO.md` did not change, use:

```bash
git add examples/plugins/im-gateway/README.md
git commit -m "docs(phase-3): document IM gateway onboarding helpers"
```
