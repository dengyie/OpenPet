# IM Gateway Phase 2 AI Replies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add host-owned Telegram AI replies to the bundled `openpet.im-gateway` plugin without moving IM SDKs, secrets, or transcript ownership into the plugin.

**Architecture:** Keep IM transport and message eligibility inside the bundled runtime plugin, but add a permissioned `/ai/chat` service-bridge route that delegates reply generation into `aiTalkService`. The host remains the source of truth for persona, memory, persistence, trace, and provider config; the plugin adds IM-specific routing, queueing, redacted diagnostics, and reply delivery. Control Center continues to expose the feature through schema-backed plugin config instead of a new renderer-only settings surface.

**Tech Stack:** Node.js main-process services, bundled runtime plugin JavaScript, Electron Control Center (React + TypeScript + Vite), Node native test runner, Playwright smoke tests.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/1dc8/OpenPet` on branch `dev9`.
- Do not edit the protected primary worktree at `/Users/mango/project/codex/OpenPet`.
- The first Phase 2 target is Telegram only.
- `/openpet` commands continue to own explicit `say`, `action`, `event`, and `status` control flows.
- Phase 2 does not include QQ real AI replies.
- Phase 2 does not include WeChat real AI replies.
- Phase 2 does not include media, image, sticker, or voice-message understanding.
- Phase 2 does not include IM-triggered `pet.action` or `pet.event` from AI free text.
- Phase 2 does not include a second independent AI transcript stack inside the IM plugin.
- Group AI replies require allowlist pass, direct `@bot` mention, and `groupAiRepliesEnabled === true`.
- Conversation continuity is per user-facing IM context: private `platform + chatId + userId`; group `platform + chatId + userId`.
- Each IM conversation key should allow at most one in-flight AI request and at most one queued follow-up request.
- Phase 2 should introduce conservative IM limits before calling the host AI system: private inbound text `2000` chars, group inbound text after mention cleanup `500` chars, private reply text `800` chars, group reply text `160` chars.
- The following must not appear in plugin health, plugin logs, or renderer config: raw IM transcript text, tokens or credentials, provider raw error bodies, stack traces, raw chat ids, raw user ids.
- `npm start` must remain functional at every stage.
- Plugins must not have unrestricted Node/Electron access.
- All new configuration must be operable through the Control Center UI.

---

## File Map

- `src/main/services/ai-talk-store.js`: persistent AI conversation store; extend it beyond the fixed `main` conversation so host-owned IM sessions can reuse persona, memory, and trace plumbing.
- `src/main/services/ai-talk-service.js`: add an entrypoint-aware chat path for external IM conversations while preserving current Control Center behavior.
- `src/main/services/plugin-service.js`: expose `/ai/chat` on the service runtime bridge, gate it with `ai:chat`, and delegate to `aiTalkService`.
- `tests/services/ai-talk-store.test.js`: regressions for generic non-`main` conversation creation and history isolation.
- `tests/services/ai-talk-service.test.js`: regressions for IM entrypoint chat isolation, history continuity, and trace entrypoint wiring.
- `tests/services/plugin-service.test.js`: regressions for `/ai/chat` bridge happy path and permission failures.
- `examples/plugins/im-gateway/plugin.json`: add `ai:chat` permission to the bundled official plugin manifest.
- `examples/plugins/im-gateway/config.schema.json`: add `privateTextMode` and `groupAiRepliesEnabled` so the generic Plugins pane can render the new controls.
- `examples/plugins/im-gateway/service/config.js`: normalize Phase 2 defaults and migrate old `privateChatPolicy` values into `privateTextMode`.
- `examples/plugins/im-gateway/service/bridge-client.js`: add `aiChat()` alongside the existing pet bridge calls.
- `examples/plugins/im-gateway/service/core/ai-routing.js`: new helper for private/group AI eligibility, mention cleanup, conversation keys, and IM length caps.
- `examples/plugins/im-gateway/service/core/ai-queue.js`: new helper for one-in-flight plus one-queued scheduling per IM conversation key.
- `examples/plugins/im-gateway/service/core/gateway.js`: preserve command priority, route eligible text to host AI, deliver IM replies, and maintain queue/diagnostic state.
- `examples/plugins/im-gateway/service/health.js`: extend redacted health with `lastAiReplyAt`, `aiReplyCount`, and `lastAiErrorCode`.
- `tests/examples/im-gateway-plugin.test.js`: regressions for config migration, private AI routing, group AI gating, queue limits, failure handling, and health redaction.
- `tests/control-center/demo-control-center-api.test.js`: save/reload coverage for the new IM Gateway config fields through the demo API.
- `tests/control-center/control-center-smoke.spec.js`: Playwright coverage for the new controls coexisting with host-owned Telegram token UI.
- `examples/plugins/im-gateway/README.md`: operator-facing setup and behavior documentation for Phase 2 Telegram AI replies.

### Task 1: Extend AI Talk Store and Service for External IM Conversations

**Files:**
- Modify: `src/main/services/ai-talk-store.js`
- Modify: `src/main/services/ai-talk-service.js`
- Modify: `tests/services/ai-talk-store.test.js`
- Modify: `tests/services/ai-talk-service.test.js`

**Interfaces:**
- Consumes: `createSessionId({ entrypoint, petPackId })`, `aiTalkStore.getMessages(sessionId, conversationId)`, `aiTalkStore.appendMessages(sessionId, conversationId, messages)`.
- Produces: `aiTalkStore.ensureConversation({ entrypoint, petPackId, conversationId, personaHash })`, `splitTalkConversationId(publicConversationId)`, and `aiTalkService.chatFromEntrypoint({ message, messageBatch, entrypoint, conversationId, requestId, skipUserAppend, sourceContext })`.

- [ ] **Step 1: Write the failing store regression**

Add this test to `tests/services/ai-talk-store.test.js`:

```js
test('ai talk store creates external conversations alongside the main thread', () => {
  const store = createAiTalkStore({ storePath: createTempStorePath(), now: () => '2026-06-20T00:00:00.000Z' })

  const main = store.ensureMainConversation({ entrypoint: 'control-center', petPackId: 'legacy-cat', personaHash: 'hash-main' })
  const im = store.ensureConversation({
    entrypoint: 'im-gateway',
    petPackId: 'legacy-cat',
    conversationId: 'plugin:openpet.im-gateway:service:im-gateway:telegram:private:1001:1001',
    personaHash: 'hash-im'
  })

  store.appendMessages(im.sessionId, im.conversationId, [
    { role: 'user', content: 'hello from telegram' }
  ])

  assert.equal(main.sessionId, 'control-center:legacy-cat')
  assert.equal(im.sessionId, 'im-gateway:legacy-cat')
  assert.equal(im.conversationId, 'plugin:openpet.im-gateway:service:im-gateway:telegram:private:1001:1001')
  assert.deepEqual(store.getMessages(im.sessionId, im.conversationId).map((message) => message.content), ['hello from telegram'])
  assert.deepEqual(store.getMessages(main.sessionId, main.conversationId), [])
})
```

- [ ] **Step 2: Run the store test to verify it fails**

Run:

```bash
node --test tests/services/ai-talk-store.test.js --test-name-pattern "external conversations"
```

Expected: FAIL because `ensureConversation()` does not exist yet.

- [ ] **Step 3: Implement generic conversation persistence**

Replace the fixed store-only helper with a generic one in `src/main/services/ai-talk-store.js` and export it:

```js
const ensureConversation = ({
  entrypoint = 'control-center',
  petPackId,
  conversationId = 'main',
  personaHash = ''
} = {}) => {
  if (!petPackId || typeof petPackId !== 'string') throw new Error('petPackId is required')
  const timestamp = now()
  const sessionId = createSessionId({ entrypoint, petPackId })
  const normalizedConversationId = typeof conversationId === 'string' && conversationId.trim()
    ? conversationId.trim()
    : 'main'
  const conversationKey = `${sessionId}:${normalizedConversationId}`

  if (!state.sessions[sessionId]) {
    state.sessions[sessionId] = {
      id: sessionId,
      entrypoint,
      petPackId,
      activeConversationId: normalizedConversationId,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  }

  if (!state.conversations[conversationKey]) {
    state.conversations[conversationKey] = {
      id: normalizedConversationId,
      sessionId,
      petPackId,
      title: '',
      personaPackId: petPackId,
      personaHash: personaHash || '',
      responseMode: 'complete',
      summary: '',
      summaryUpdatedAt: '',
      contextPolicy: { ...DEFAULT_CONTEXT_POLICY },
      createdAt: timestamp,
      updatedAt: timestamp
    }
    state.messages[conversationKey] = []
  } else if (personaHash && state.conversations[conversationKey].personaHash !== personaHash) {
    state.conversations[conversationKey] = {
      ...state.conversations[conversationKey],
      personaHash,
      updatedAt: timestamp
    }
  }

  state.sessions[sessionId] = {
    ...state.sessions[sessionId],
    activeConversationId: normalizedConversationId,
    updatedAt: timestamp
  }

  persist()
  return { sessionId, conversationId: normalizedConversationId, conversation: clone(state.conversations[conversationKey]) }
}

const ensureMainConversation = (input = {}) => ensureConversation({ ...input, conversationId: 'main' })
```

Also export `ensureConversation` in the store return object.

- [ ] **Step 4: Run the store regression again**

Run:

```bash
node --test tests/services/ai-talk-store.test.js --test-name-pattern "external conversations"
```

Expected: PASS.

- [ ] **Step 5: Write the failing service regression**

Add this test to `tests/services/ai-talk-service.test.js`:

```js
test('ai talk service routes IM entrypoints through named conversations', async () => {
  const requests = []
  const store = createStore()
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, behavior: { enabled: false, useTools: true } }),
      complete: async (request) => {
        requests.push(request)
        return { reply: `reply ${requests.length}` }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'legacy-cat' })
  })

  await service.chatFromEntrypoint({
    entrypoint: 'im-gateway',
    conversationId: 'plugin:openpet.im-gateway:service:im-gateway:telegram:private:1001:1001',
    message: 'private hello',
    sourceContext: { platform: 'telegram', chatType: 'private', chatId: '1001', userId: '1001', messageId: '42' }
  })

  await service.chatFromEntrypoint({
    entrypoint: 'im-gateway',
    conversationId: 'plugin:openpet.im-gateway:service:im-gateway:telegram:group:-2001:1001',
    message: 'group hello',
    sourceContext: { platform: 'telegram', chatType: 'group', chatId: '-2001', userId: '1001', messageId: '43' }
  })

  assert.deepEqual(
    store.getMessages('im-gateway:legacy-cat', 'plugin:openpet.im-gateway:service:im-gateway:telegram:private:1001:1001').map((message) => message.content),
    ['private hello', 'reply 1']
  )
  assert.deepEqual(
    store.getMessages('im-gateway:legacy-cat', 'plugin:openpet.im-gateway:service:im-gateway:telegram:group:-2001:1001').map((message) => message.content),
    ['group hello', 'reply 2']
  )
  assert.equal(requests[0].messages.at(-1).content, 'private hello')
  assert.equal(requests[1].messages.at(-1).content, 'group hello')
})
```

- [ ] **Step 6: Run the service test to verify it fails**

Run:

```bash
node --test tests/services/ai-talk-service.test.js --test-name-pattern "IM entrypoints through named conversations"
```

Expected: FAIL because `chatFromEntrypoint()` does not exist yet.

- [ ] **Step 7: Implement the entrypoint-aware AI talk path**

Update `src/main/services/ai-talk-service.js` with a shared conversation resolver and a new public method:

```js
const splitTalkConversationId = (conversationId) => {
  const normalized = normalizeString(conversationId)
  const parts = normalized.split(':').filter(Boolean)
  if (parts.length < 3) return null
  return {
    sessionId: parts.slice(0, 2).join(':'),
    conversationId: parts.slice(2).join(':')
  }
}

const resolveConversationHandle = ({ entrypoint = 'control-center', petPackId, personaHash = '', conversationId = 'main' } = {}) => {
  const normalizedConversationId = normalizeString(conversationId) || 'main'
  return normalizedConversationId === 'main'
    ? aiTalkStore.ensureMainConversation({ entrypoint, petPackId, personaHash })
    : aiTalkStore.ensureConversation({ entrypoint, petPackId, conversationId: normalizedConversationId, personaHash })
}

const chatFromEntrypoint = (payload = {}) => {
  const normalizedConversationId = normalizeString(payload.conversationId)
  if (!normalizedConversationId) throw new Error('AI chat conversationId is required')
  return chat({
    ...payload,
    entrypoint: normalizeString(payload.entrypoint) || 'im-gateway',
    conversationId: normalizedConversationId
  })
}
```

Also update the `chat(...)` signature so it accepts the new argument:

```js
const chat = async ({
  message,
  messageBatch = null,
  entrypoint = 'control-center',
  conversationId: requestedConversationId = 'main',
  requestId,
  skipUserAppend = false,
  sourceContext = null
} = {}) => {
```

Then replace the current `ensureMainConversation(...)` call inside `chat(...)` with:

```js
const { sessionId, conversationId } = resolveConversationHandle({
  entrypoint,
  petPackId,
  personaHash,
  conversationId: requestedConversationId
})
```

Finally export `chatFromEntrypoint` in the returned service object.

- [ ] **Step 8: Run the AI talk service regressions**

Run:

```bash
node --test tests/services/ai-talk-store.test.js tests/services/ai-talk-service.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Run:

```bash
git add tests/services/ai-talk-store.test.js tests/services/ai-talk-service.test.js src/main/services/ai-talk-store.js src/main/services/ai-talk-service.js
git commit -m "feat: add ai talk support for im conversations"
```

### Task 2: Add a Permissioned `/ai/chat` Plugin Service Bridge

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Modify: `tests/services/plugin-service.test.js`

**Interfaces:**
- Consumes: `aiTalkService.chatFromEntrypoint({ message, entrypoint, conversationId, requestId, skipUserAppend, sourceContext })`.
- Produces: `POST /plugins/bridge/:pluginId/:serviceId/:runId/ai/chat` mapped to `runtime.handlers.aiChat(payload)` and guarded by `ai:chat`.

- [ ] **Step 1: Write the failing bridge regressions**

Add these tests to `tests/services/plugin-service.test.js`:

```js
test('plugin service bridge lets service runtimes call ai chat through aiTalkService', async () => {
  const spawned = []
  const aiCalls = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    aiTalkService: {
      chatFromEntrypoint: async (payload) => {
        aiCalls.push(payload)
        return { conversationId: 'im-gateway:legacy-cat:plugin:weather-declaration:service:companion:telegram:private:1001:1001', reply: 'host reply' }
      }
    },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({ permissions: ['ai:chat'] })],
    spawnServiceProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return createSlowStoppingServiceProcess()
    }
  })

  await service.startService('weather-declaration', 'companion')
  const response = await requestBridge(`${spawned[0].options.env.OPENPET_SERVICE_BRIDGE_URL}/ai/chat`, {
    token: spawned[0].options.env.OPENPET_SERVICE_BRIDGE_TOKEN,
    method: 'POST',
    body: {
      message: 'hello from telegram',
      conversationKey: 'telegram:private:1001:1001',
      entrypoint: 'im-gateway',
      sourceContext: { platform: 'telegram', chatType: 'private', chatId: '1001', userId: '1001', messageId: '42' }
    }
  })

  assert.equal(response.status, 200)
  assert.equal(response.body.result.reply, 'host reply')
  assert.deepEqual(aiCalls, [{
    message: 'hello from telegram',
    conversationId: 'plugin:weather-declaration:service:companion:telegram:private:1001:1001',
    entrypoint: 'im-gateway',
    requestId: '',
    skipUserAppend: false,
    sourceContext: { platform: 'telegram', chatType: 'private', chatId: '1001', userId: '1001', messageId: '42' }
  }])
})

test('plugin service bridge ai chat enforces manifest permissions', async () => {
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    aiTalkService: {
      chatFromEntrypoint: async () => {
        throw new Error('host ai should not be reached')
      }
    },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return createSlowStoppingServiceProcess()
    }
  })

  await service.startService('weather-declaration', 'companion')
  const response = await requestBridge(`${spawned[0].options.env.OPENPET_SERVICE_BRIDGE_URL}/ai/chat`, {
    token: spawned[0].options.env.OPENPET_SERVICE_BRIDGE_TOKEN,
    method: 'POST',
    body: { message: 'blocked', conversationKey: 'telegram:private:1001:1001', entrypoint: 'im-gateway' }
  })

  assert.equal(response.status, 403)
  assert.match(response.body.error, /does not have ai:chat permission/)
})
```

- [ ] **Step 2: Run the bridge tests to verify they fail**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "bridge.*ai chat"
```

Expected: FAIL because `/ai/chat` is not a registered service bridge route.

- [ ] **Step 3: Implement `/ai/chat` on the service bridge**

Update `src/main/services/plugin-service.js` in three places:

```js
const SERVICE_BRIDGE_ROUTE_PATTERN = /^\/plugins\/bridge\/([^/]+)\/([^/]+)\/([^/]+)(\/context|\/pet\/say|\/pet\/action|\/pet\/event|\/ai\/chat)$/

const SERVICE_BRIDGE_JSON_ROUTES = new Map([
  ['/pet/say', 'petSay'],
  ['/pet/action', 'petAction'],
  ['/pet/event', 'petEvent'],
  ['/ai/chat', 'aiChat']
])
```

Add `aiTalkService` to the `createPluginService(...)` parameter list, then replace `createPluginServiceBridgeHandlers(...)` with:

```js
const createPluginServiceBridgeHandlers = (plugin, serviceId) => ({
  ...createPluginPetBridgeHandlers(plugin, `service:${serviceId}`),
  aiChat: async (payload = {}) => {
    assertPermission(plugin.manifest, 'ai:chat')
    if (!aiTalkService?.chatFromEntrypoint) throw new Error('AI talk service is not available')

    const message = typeof payload?.message === 'string' ? payload.message.trim() : ''
    const conversationKey = typeof payload?.conversationKey === 'string' ? payload.conversationKey.trim() : ''
    if (!message) throw new Error('AI chat message is empty')
    if (!conversationKey) throw new Error('AI chat conversationKey is required')

    return {
      ok: true,
      result: await aiTalkService.chatFromEntrypoint({
        message,
        conversationId: `plugin:${plugin.manifest.id}:service:${serviceId}:${conversationKey}`,
        entrypoint: typeof payload?.entrypoint === 'string' && payload.entrypoint.trim() ? payload.entrypoint.trim() : 'im-gateway',
        requestId: typeof payload?.requestId === 'string' ? payload.requestId : '',
        skipUserAppend: payload?.skipUserAppend === true,
        sourceContext: payload?.sourceContext && typeof payload.sourceContext === 'object' ? payload.sourceContext : {}
      })
    }
  }
})
```

- [ ] **Step 4: Run the plugin service bridge regressions**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "bridge.*ai chat"
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add tests/services/plugin-service.test.js src/main/services/plugin-service.js
git commit -m "feat: add ai chat to plugin service bridge"
```

### Task 3: Add Phase 2 IM Gateway Config and Basic AI Routing

**Files:**
- Modify: `examples/plugins/im-gateway/plugin.json`
- Modify: `examples/plugins/im-gateway/config.schema.json`
- Modify: `examples/plugins/im-gateway/service/config.js`
- Modify: `examples/plugins/im-gateway/service/bridge-client.js`
- Create: `examples/plugins/im-gateway/service/core/ai-routing.js`
- Modify: `examples/plugins/im-gateway/service/core/gateway.js`
- Modify: `tests/examples/im-gateway-plugin.test.js`

**Interfaces:**
- Consumes: `bridgeClient.aiChat({ message, conversationKey, entrypoint, sourceContext })`.
- Produces: `normalizeImGatewayConfig(...)` with `privateTextMode` and `groupAiRepliesEnabled`, plus `resolveAiRoute(message, config)` and `truncateAiReply(reply, message)`.

- [ ] **Step 1: Write the failing IM Gateway routing regressions**

Add these tests to `tests/examples/im-gateway-plugin.test.js`:

```js
test('im gateway manifest and config expose phase 2 ai reply controls', () => {
  const manifest = normalizePluginManifest(
    JSON.parse(fs.readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf-8')),
    { source: 'local', basePath: pluginRoot }
  )

  const config = normalizeImGatewayConfig({
    privateChatPolicy: 'any-text'
  })

  assert.deepEqual(manifest.permissions, ['pet:say', 'pet:action', 'pet:event', 'ai:chat'])
  assert.equal(config.privateTextMode, 'pet-say')
  assert.equal(config.groupAiRepliesEnabled, false)
})

test('im gateway routes private ai-chat text through the host ai bridge', async () => {
  const aiCalls = []
  const adapter = createFakeAdapter({ id: 'fake', platform: 'telegram' })
  const gateway = createImGateway({
    adapters: [adapter],
    bridgeClient: {
      aiChat: async (payload) => {
        aiCalls.push(payload)
        return { ok: true, result: { reply: 'y'.repeat(900) } }
      }
    },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      privateTextMode: 'ai-chat'
    })
  })

  await gateway.start()
  await adapter.emitMessage({
    chatType: 'private',
    chatId: '1001',
    userId: '1001',
    text: 'x'.repeat(2500),
    messageId: 'msg-1'
  })

  assert.equal(aiCalls[0].message.length, 2000)
  assert.equal(aiCalls[0].conversationKey, 'telegram:private:1001:1001')
  assert.equal(adapter.receipts[0].text.length, 800)
})

test('im gateway routes direct group mentions to ai only when the explicit toggle is enabled', async () => {
  const aiCalls = []
  const sayCalls = []
  const replies = []
  const gateway = createImGateway({
    bridgeClient: {
      aiChat: async (payload) => {
        aiCalls.push(payload)
        return { ok: true, result: { reply: 'r'.repeat(300) } }
      },
      say: async (payload) => sayCalls.push(payload)
    },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      allowedChats: '-2001',
      groupChatPolicy: 'mention-or-command',
      groupAiRepliesEnabled: true
    })
  })

  const adapter = {
    id: 'telegram',
    platform: 'telegram',
    sendReceipt: async (_message, text) => replies.push(text)
  }
  await gateway.handleMessage(adapter, {
    platform: 'telegram',
    adapterId: 'telegram',
    chatType: 'group',
    chatId: '-2001',
    userId: '1001',
    messageId: 'msg-2',
    text: `@openpet_bot ${'x'.repeat(900)}`,
    isMention: true,
    receivedAt: '2026-07-08T00:00:01.000Z'
  })

  assert.equal(sayCalls.length, 0)
  assert.equal(aiCalls[0].message.length, 500)
  assert.equal(aiCalls[0].conversationKey, 'telegram:group:-2001:1001')
  assert.equal(replies[0].length, 160)
})
```

- [ ] **Step 2: Run the IM Gateway test file to verify it fails**

Run:

```bash
node --test tests/examples/im-gateway-plugin.test.js
```

Expected: FAIL because the manifest, config, bridge client, and routing logic do not support AI replies yet.

- [ ] **Step 3: Add the Phase 2 manifest, schema, config, and bridge client**

Update `examples/plugins/im-gateway/plugin.json`:

```json
"permissions": ["pet:say", "pet:action", "pet:event", "ai:chat"]
```

Add these fields to `examples/plugins/im-gateway/config.schema.json`:

```json
"privateTextMode": {
  "type": "string",
  "title": "Private text mode",
  "description": "Choose how ordinary private non-command text routes inside Telegram.",
  "enum": ["command-only", "pet-say", "ai-chat"],
  "default": "command-only"
},
"groupAiRepliesEnabled": {
  "type": "boolean",
  "title": "Enable group AI replies",
  "description": "Allow host-owned AI replies for direct bot mentions in allowed groups.",
  "default": false
}
```

Update `examples/plugins/im-gateway/service/config.js`:

```js
const DEFAULT_CONFIG = {
  telegramEnabled: false,
  telegramMode: 'polling',
  privateChatPolicy: 'command-only',
  privateTextMode: 'command-only',
  groupChatPolicy: 'mention-or-command',
  groupAiRepliesEnabled: false,
  allowedUsers: [],
  allowedChats: [],
  allowAllPrivateChats: false,
  allowAllGroupChats: false,
  commandAliases: ['/openpet', '/op'],
  petSayTtlMs: 6000,
  receiptMode: 'commands-only'
}

const derivePrivateTextMode = (input = {}) => {
  const explicit = normalizeEnum(input.privateTextMode, ['command-only', 'pet-say', 'ai-chat'], '')
  if (explicit) return explicit
  return normalizeEnum(input.privateChatPolicy, ['command-only', 'any-text'], DEFAULT_CONFIG.privateChatPolicy) === 'any-text'
    ? 'pet-say'
    : 'command-only'
}
```

Then return both fields from `normalizeImGatewayConfig(...)`, and extend `examples/plugins/im-gateway/service/bridge-client.js` with:

```js
return {
  action: (payload) => post('/pet/action', payload),
  aiChat: (payload) => post('/ai/chat', payload),
  event: (payload) => post('/pet/event', payload),
  say: (payload) => post('/pet/say', payload)
}
```

- [ ] **Step 4: Implement AI routing in the plugin runtime**

Create `examples/plugins/im-gateway/service/core/ai-routing.js`:

```js
const { isGroupChatType } = require('./allowlist')
const { sanitizeReceiptText } = require('../log-safety')

const PRIVATE_INBOUND_LIMIT = 2000
const GROUP_INBOUND_LIMIT = 500
const PRIVATE_REPLY_LIMIT = 800
const GROUP_REPLY_LIMIT = 160

const stripLeadingMention = (message = {}) => {
  const text = String(message.text || '').trim()
  if (!text || message.isMention !== true) return text
  return text.replace(/^@\S+\s*/u, '').trim()
}

const buildConversationKey = (message = {}) => [
  String(message.platform || 'telegram').trim() || 'telegram',
  isGroupChatType(message.chatType) ? 'group' : 'private',
  String(message.chatId || '').trim(),
  String(message.userId || '').trim()
].join(':')

const resolveAiRoute = (message = {}, config = {}) => {
  const chatType = String(message.chatType || '').toLowerCase()
  const privateText = String(message.text || '').trim().slice(0, PRIVATE_INBOUND_LIMIT)
  const groupText = stripLeadingMention(message).slice(0, GROUP_INBOUND_LIMIT)

  if (chatType === 'private') {
    if (config.privateTextMode === 'ai-chat' && privateText) {
      return { mode: 'ai-chat', messageText: privateText, conversationKey: buildConversationKey(message), replyLimit: PRIVATE_REPLY_LIMIT }
    }
    if (config.privateTextMode === 'pet-say' && privateText) {
      return { mode: 'pet-say', messageText: privateText }
    }
    return { mode: 'ignore', reason: 'private-command-only' }
  }

  if (isGroupChatType(chatType)) {
    if (message.isMention === true && config.groupAiRepliesEnabled === true && groupText) {
      return { mode: 'ai-chat', messageText: groupText, conversationKey: buildConversationKey(message), replyLimit: GROUP_REPLY_LIMIT }
    }
    if (message.isMention === true && config.groupChatPolicy === 'mention-or-command') {
      return { mode: 'pet-say', messageText: String(message.text || '').trim() }
    }
  }

  return { mode: 'ignore', reason: 'not-eligible' }
}

const truncateAiReply = (reply, message = {}) => sanitizeReceiptText(
  reply,
  isGroupChatType(message.chatType) ? GROUP_REPLY_LIMIT : PRIVATE_REPLY_LIMIT
)

module.exports = {
  GROUP_INBOUND_LIMIT,
  GROUP_REPLY_LIMIT,
  PRIVATE_INBOUND_LIMIT,
  PRIVATE_REPLY_LIMIT,
  resolveAiRoute,
  truncateAiReply
}
```

Then update `examples/plugins/im-gateway/service/core/gateway.js` so non-command text uses `resolveAiRoute(...)` instead of calling `shouldTriggerSay(...)` directly:

```js
const { resolveAiRoute, truncateAiReply } = require('./ai-routing')

const sendDirectReply = async (adapter, message, text) => {
  if (!text) return
  if (typeof message.reply === 'function') {
    await message.reply(text)
    return
  }
  if (typeof adapter.sendReceipt === 'function') await adapter.sendReceipt(message, text)
}

const route = resolveAiRoute(message, config)
if (route.mode === 'pet-say') {
  await bridgeClient.say?.({ text: route.messageText, ttlMs: config.petSayTtlMs })
  markTrigger(adapter, message)
  return
}

if (route.mode === 'ai-chat') {
  const result = await bridgeClient.aiChat?.({
    message: route.messageText,
    conversationKey: route.conversationKey,
    entrypoint: 'im-gateway',
    sourceContext: {
      platform: message.platform,
      chatType: message.chatType,
      chatId: message.chatId,
      userId: message.userId,
      messageId: message.messageId
    }
  })
  const replyText = truncateAiReply(result?.result?.reply || result?.reply || '', message)
  if (replyText) await sendDirectReply(adapter, message, replyText)
  markTrigger(adapter, message)
  return
}
```

- [ ] **Step 5: Run the IM Gateway routing regressions**

Run:

```bash
node --test tests/examples/im-gateway-plugin.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add tests/examples/im-gateway-plugin.test.js examples/plugins/im-gateway/plugin.json examples/plugins/im-gateway/config.schema.json examples/plugins/im-gateway/service/config.js examples/plugins/im-gateway/service/bridge-client.js examples/plugins/im-gateway/service/core/ai-routing.js examples/plugins/im-gateway/service/core/gateway.js
git commit -m "feat: add im gateway ai reply routing"
```

### Task 4: Add Queue Limits, Failure Handling, and Redacted AI Diagnostics

**Files:**
- Create: `examples/plugins/im-gateway/service/core/ai-queue.js`
- Modify: `examples/plugins/im-gateway/service/core/gateway.js`
- Modify: `examples/plugins/im-gateway/service/health.js`
- Modify: `tests/examples/im-gateway-plugin.test.js`

**Interfaces:**
- Consumes: `resolveAiRoute(message, config)`, `truncateAiReply(reply, message)`, `bridgeClient.aiChat(...)`.
- Produces: `createAiQueue()` plus adapter health fields `lastAiReplyAt`, `aiReplyCount`, `lastAiErrorCode`.

- [ ] **Step 1: Write the failing safety and diagnostics regressions**

Add these tests to `tests/examples/im-gateway-plugin.test.js`:

```js
test('im gateway allows one in-flight and one queued ai request per conversation', async () => {
  const requests = []
  const replies = []
  let releaseFirst
  const firstCanFinish = new Promise((resolve) => {
    releaseFirst = resolve
  })
  const adapter = createFakeAdapter({ id: 'fake', platform: 'telegram' })
  const gateway = createImGateway({
    adapters: [adapter],
    bridgeClient: {
      aiChat: async (payload) => {
        requests.push(payload.message)
        if (payload.message === 'first') {
          await firstCanFinish
          return { ok: true, result: { reply: 'reply one' } }
        }
        return { ok: true, result: { reply: `reply for ${payload.message}` } }
      }
    },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      privateTextMode: 'ai-chat'
    })
  })

  await gateway.start()
  const send = (text, messageId) => gateway.handleMessage(adapter, {
    platform: 'telegram',
    adapterId: 'fake',
    chatType: 'private',
    chatId: '1001',
    userId: '1001',
    messageId,
    text,
    receivedAt: '2026-07-09T00:00:00.000Z',
    reply: async (value) => replies.push(value)
  })

  const first = send('first', 'm1')
  await new Promise((resolve) => setImmediate(resolve))
  const second = send('second', 'm2')
  const third = send('third', 'm3')
  await new Promise((resolve) => setImmediate(resolve))
  releaseFirst()
  await Promise.all([first, second, third])

  assert.deepEqual(requests, ['first', 'second'])
  assert.equal(replies.includes('Still thinking about your last message. Please send one more message in a moment.'), true)
})

test('im gateway sends private failure notices but keeps group failures silent', async () => {
  const replies = []
  const gateway = createImGateway({
    bridgeClient: {
      aiChat: async () => {
        throw new Error('provider timed out')
      }
    },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      allowedChats: '-2001',
      privateTextMode: 'ai-chat',
      groupAiRepliesEnabled: true
    })
  })

  const privateAdapter = { id: 'private', platform: 'telegram', sendReceipt: async (_message, text) => replies.push(['private', text]) }
  const groupAdapter = { id: 'group', platform: 'telegram', sendReceipt: async (_message, text) => replies.push(['group', text]) }

  await gateway.handleMessage(privateAdapter, {
    platform: 'telegram',
    adapterId: 'private',
    chatType: 'private',
    chatId: '1001',
    userId: '1001',
    messageId: 'p1',
    text: 'hello',
    receivedAt: '2026-07-09T00:00:00.000Z'
  })

  await gateway.handleMessage(groupAdapter, {
    platform: 'telegram',
    adapterId: 'group',
    chatType: 'group',
    chatId: '-2001',
    userId: '1001',
    messageId: 'g1',
    text: '@openpet_bot hello',
    isMention: true,
    receivedAt: '2026-07-09T00:00:01.000Z'
  })

  assert.deepEqual(replies, [['private', 'I could not reply just now. Please try again in a moment.']])
})

test('im gateway health exposes redacted ai counters and error codes', async () => {
  const adapter = createFakeAdapter({ id: 'fake', platform: 'telegram' })
  const gateway = createImGateway({
    adapters: [adapter],
    bridgeClient: {
      aiChat: async () => ({ ok: true, result: { reply: 'ok reply' } })
    },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      privateTextMode: 'ai-chat'
    }),
    now: () => '2026-07-09T00:00:00.000Z'
  })

  await gateway.start()
  await adapter.emitMessage({
    chatType: 'private',
    chatId: '1001',
    userId: '1001',
    text: 'hello secret text',
    messageId: 'msg-ai'
  })

  const health = gateway.getHealth()
  const encoded = JSON.stringify(health)
  assert.equal(health.adapters.telegram.aiReplyCount, 1)
  assert.equal(health.adapters.telegram.lastAiReplyAt, '2026-07-09T00:00:00.000Z')
  assert.equal(health.adapters.telegram.lastAiErrorCode, '')
  assert.equal(encoded.includes('hello secret text'), false)
  assert.equal(encoded.includes('1001'), false)
})

test('im gateway records a redacted send failure code when reply delivery fails', async () => {
  const adapter = {
    id: 'telegram',
    platform: 'telegram',
    start: async () => {},
    stop: async () => {},
    sendReceipt: async () => {
      throw new Error('telegram send failed')
    },
    getStatus: () => ({
      enabled: true,
      status: 'connected',
      mode: 'fake',
      lastErrorCode: ''
    })
  }
  const gateway = createImGateway({
    adapters: [adapter],
    bridgeClient: {
      aiChat: async () => ({ ok: true, result: { reply: 'ok reply' } })
    },
    config: normalizeImGatewayConfig({
      telegramEnabled: true,
      allowedUsers: '1001',
      privateTextMode: 'ai-chat'
    }),
    now: () => '2026-07-09T00:00:00.000Z'
  })

  await gateway.handleMessage(adapter, {
    platform: 'telegram',
    adapterId: 'telegram',
    chatType: 'private',
    chatId: '1001',
    userId: '1001',
    messageId: 'send-1',
    text: 'hello',
    receivedAt: '2026-07-09T00:00:00.000Z'
  })

  assert.equal(gateway.getHealth().adapters.telegram.lastAiErrorCode, 'reply-send-failed')
})
```

- [ ] **Step 2: Run the IM Gateway test file to verify the new cases fail**

Run:

```bash
node --test tests/examples/im-gateway-plugin.test.js
```

Expected: FAIL because queueing, failure notices, and AI health counters do not exist yet.

- [ ] **Step 3: Implement queueing and failure behavior**

Create `examples/plugins/im-gateway/service/core/ai-queue.js`:

```js
const createAiQueue = () => {
  const states = new Map()

  const runJob = async (conversationKey, job) => {
    const state = states.get(conversationKey)
    try {
      await job.run()
    } finally {
      if (state?.queued) {
        const nextJob = state.queued
        state.queued = null
        await runJob(conversationKey, nextJob)
        return
      }
      states.delete(conversationKey)
    }
  }

  const push = async (conversationKey, job) => {
    const existing = states.get(conversationKey)
    if (!existing) {
      states.set(conversationKey, { queued: null })
      runJob(conversationKey, job).catch(() => {})
      return { state: 'started' }
    }
    if (!existing.queued) {
      existing.queued = job
      return { state: 'queued' }
    }
    await job.onDrop?.()
    return { state: 'dropped' }
  }

  return { push }
}

module.exports = {
  createAiQueue
}
```

Then update `examples/plugins/im-gateway/service/core/gateway.js`:

```js
const { createAiQueue } = require('./ai-queue')

const createEmptyState = () => ({
  lastMessageAt: '',
  lastTriggerAt: '',
  triggerCount: 0,
  lastErrorCode: '',
  lastChatId: '',
  lastUserId: '',
  lastAiReplyAt: '',
  aiReplyCount: 0,
  lastAiErrorCode: ''
})
```

Inside `createImGateway(...)`, initialize the scheduler once:

```js
const aiQueue = createAiQueue()
```

Add helpers:

```js
const markAiReply = (adapter, message) => {
  const state = getState(adapter)
  state.lastAiReplyAt = now()
  state.aiReplyCount += 1
  state.lastAiErrorCode = ''
  state.lastChatId = message.chatId || ''
  state.lastUserId = message.userId || ''
}

const markAiError = (adapter, message, code) => {
  const state = getState(adapter)
  state.lastAiErrorCode = String(code || 'ai-reply-failed')
  state.lastChatId = message.chatId || ''
  state.lastUserId = message.userId || ''
}
```

Wrap each AI route with `createAiQueue().push(...)`, and use these exact notices:

```js
const PRIVATE_BUSY_NOTICE = 'Still thinking about your last message. Please send one more message in a moment.'
const PRIVATE_FAILURE_NOTICE = 'I could not reply just now. Please try again in a moment.'
```

Behavior rules inside the queued job:

```js
await aiQueue.push(route.conversationKey, {
  run: async () => {
    try {
      const result = await bridgeClient.aiChat?.({
        message: route.messageText,
        conversationKey: route.conversationKey,
        entrypoint: 'im-gateway',
        sourceContext: {
          platform: message.platform,
          chatType: message.chatType,
          chatId: message.chatId,
          userId: message.userId,
          messageId: message.messageId
        }
      })
      const replyText = truncateAiReply(result?.result?.reply || result?.reply || '', message)
      if (!replyText) throw new Error('empty-ai-reply')
      try {
        await sendDirectReply(adapter, message, replyText)
      } catch (_) {
        markAiError(adapter, message, 'reply-send-failed')
        return
      }
      markAiReply(adapter, message)
      markTrigger(adapter, message)
    } catch (error) {
      markAiError(adapter, message, 'ai-reply-failed')
      if (String(message.chatType || '').toLowerCase() === 'private') {
        await sendDirectReply(adapter, message, PRIVATE_FAILURE_NOTICE)
      }
    }
  },
  onDrop: async () => {
    markAiError(adapter, message, 'ai-queue-busy')
    if (String(message.chatType || '').toLowerCase() === 'private') {
      await sendDirectReply(adapter, message, PRIVATE_BUSY_NOTICE)
    }
  }
})
```

The queued path should not send a busy notice; only the third concurrent private message does.

- [ ] **Step 4: Extend redacted health output**

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
  lastChatHash: state.lastChatId ? hashIdentifier(state.lastChatId) : '',
  lastUserHash: state.lastUserId ? hashIdentifier(state.lastUserId) : ''
}
```

- [ ] **Step 5: Run the IM Gateway regressions again**

Run:

```bash
node --test tests/examples/im-gateway-plugin.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add tests/examples/im-gateway-plugin.test.js examples/plugins/im-gateway/service/core/ai-queue.js examples/plugins/im-gateway/service/core/gateway.js examples/plugins/im-gateway/service/health.js
git commit -m "feat: harden im gateway ai reply safety"
```

### Task 5: Update Control Center Coverage, Operator Docs, and Final Verification

**Files:**
- Modify: `tests/control-center/demo-control-center-api.test.js`
- Modify: `tests/control-center/control-center-smoke.spec.js`
- Modify: `examples/plugins/im-gateway/README.md`

**Interfaces:**
- Consumes: schema-backed plugin config saving through `demoControlCenterAPI.savePluginConfig(pluginId, config)`.
- Produces: renderer regression coverage for `privateTextMode` and `groupAiRepliesEnabled`, plus operator docs for Telegram AI replies.

- [ ] **Step 1: Write the failing demo API regression**

Add this test to `tests/control-center/demo-control-center-api.test.js`:

```js
test('demo API saves IM Gateway phase 2 AI reply config fields', async () => {
  await upsertDemoPlugin({
    id: 'openpet.im-gateway',
    name: 'IM Gateway',
    version: '0.1.0',
    source: 'bundled',
    enabled: true,
    runnable: true,
    requiresNativeExecution: true,
    nativeExecutionApproved: false,
    permissions: ['pet:say', 'pet:action', 'pet:event', 'ai:chat'],
    commands: [],
    entries: { setup: [], commands: [], services: [], dashboards: [] },
    configSchema: {
      title: 'IM Gateway Settings',
      description: 'Public IM trigger policy. Tokens are stored by the host.',
      properties: []
    },
    config: {},
    storage: { keyCount: 0, byteSize: 2, valid: true },
    signatureStatus: { status: 'bundled', label: 'Bundled plugin', signer: 'openpet', algorithm: '', verified: true, errors: [] },
    blockStatus: { blocked: false, reasons: [] }
  })

  const saved = await demoControlCenterAPI.savePluginConfig('openpet.im-gateway', {
    privateTextMode: 'ai-chat',
    groupAiRepliesEnabled: true
  })

  assert.equal(saved.config.privateTextMode, 'ai-chat')
  assert.equal(saved.config.groupAiRepliesEnabled, true)
})
```

- [ ] **Step 2: Run the demo API test to verify it fails**

Run:

```bash
node --test tests/control-center/demo-control-center-api.test.js --test-name-pattern "IM Gateway phase 2 AI reply config fields"
```

Expected: FAIL because `normalizeDemoPluginConfig()` drops keys that are not declared in the fixture schema.

- [ ] **Step 3: Update Playwright coverage and operator docs**

Update the `upsertDemoPlugin(...)` fixture in `tests/control-center/demo-control-center-api.test.js` so the IM Gateway plugin advertises these schema fields:

```js
properties: [
  { key: 'privateTextMode', title: 'Private text mode', type: 'string', enum: ['command-only', 'pet-say', 'ai-chat'] },
  { key: 'groupAiRepliesEnabled', title: 'Enable group AI replies', type: 'boolean' }
]
```

Extend the IM Gateway smoke test fixture in `tests/control-center/control-center-smoke.spec.js` so the inline plugin data includes:

```js
permissions: ['pet:say', 'pet:action', 'pet:event', 'ai:chat']
```

and these config schema fields:

```js
{ key: 'privateTextMode', title: 'Private text mode', type: 'string', enum: ['command-only', 'pet-say', 'ai-chat'] },
{ key: 'groupAiRepliesEnabled', title: 'Enable group AI replies', type: 'boolean' }
```

Then extend the test body to save both fields:

```js
await pluginRow.getByLabel('Private text mode').selectOption({ index: 2 })
await pluginRow.getByLabel('Enable group AI replies').click()
await pluginRow.getByRole('button', { name: '保存配置' }).click()

await expect(page.locator('.status-line')).toContainText('插件配置已保存')
await expect(pluginRow.getByLabel('Private text mode')).toHaveValue('2')
await expect(pluginRow.getByLabel('Enable group AI replies')).toBeChecked()
```

Update `examples/plugins/im-gateway/README.md` with a Phase 2 section that says:

```md
## Phase 2 AI Replies

- Private chats now support `privateTextMode = command-only | pet-say | ai-chat`.
- Group AI replies stay off by default and only work for allowed chats, allowed users, direct bot mentions, and `groupAiRepliesEnabled = true`.
- `/openpet` and `/op` commands still keep priority over AI routing.
- AI providers, persona, memory, and API keys remain host-owned; the plugin only routes Telegram traffic and returns IM-safe replies.
```

- [ ] **Step 4: Run the Control Center and doc-facing regressions**

Run:

```bash
node --test tests/control-center/demo-control-center-api.test.js --test-name-pattern "IM Gateway phase 2 AI reply config fields"
npm run test:control-center -- --grep "IM Gateway"
```

Expected: PASS.

- [ ] **Step 5: Run the final Phase 2 verification pass**

Run:

```bash
node --test tests/services/ai-talk-store.test.js tests/services/ai-talk-service.test.js tests/services/plugin-service.test.js tests/examples/im-gateway-plugin.test.js tests/control-center/demo-control-center-api.test.js
npm run test:control-center -- --grep "IM Gateway"
git diff --check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add tests/control-center/demo-control-center-api.test.js tests/control-center/control-center-smoke.spec.js examples/plugins/im-gateway/README.md
git commit -m "docs: cover im gateway phase 2 ai replies"
```
