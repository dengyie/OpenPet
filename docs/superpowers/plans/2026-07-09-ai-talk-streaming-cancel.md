# AI Talk Streaming And Cancel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-grade streaming AI Talk replies and user cancel support without creating a second chat brain.

**Architecture:** Keep provider calls in `AiService`, conversation orchestration in `AiTalkService`, durable trace/transcript storage in `AiTalkStore`, and renderer state as sanitized IPC view data. Streaming partial text is transient until final success; cancellation and failure never append an assistant transcript message or schedule memory/behavior side effects.

**Tech Stack:** Electron main process, Node.js CommonJS services, React/Vite Control Center where needed, plain browser renderers for Bubble Chat and PetChatWindow, Node native test runner, OpenAI-compatible `/chat/completions` streaming SSE.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/454e/OpenPet` on `dev6`; do not edit `/Users/mango/project/codex/OpenPet` unless the user explicitly asks to merge or inspect main.
- Before editing, run `git branch --show-current`, `git status --short`, and `git worktree list`; stop if unexpected non-doc changes appear in files this plan touches.
- Do not stage or commit `tmp/`, `node_modules/`, `dist/`, build outputs, or local smoke output directories.
- API keys, Authorization headers, full prompts, compiled system prompts, raw provider chunks, raw memory text, and full user messages must never be logged, exposed to renderer APIs, or sent to plugins.
- Preserve existing non-streaming `AiService.complete()` and `AiTalkService.chat()` behavior unless a test in this plan explicitly updates the contract.
- Use TDD for each task: write the focused failing tests first, run them to confirm failure, implement, then rerun the focused tests.
- Every terminal request state must be idempotent: repeated cancel, late chunks, repeated renderer events, and window close cleanup must not append duplicate transcript messages or trigger duplicate side effects.
- Memory extraction and behavior decision only run after final successful assistant reply.
- All JS/TS IPC channel additions must be kept synchronized between `src/shared/ipc-channels.js` and `src/shared/ipc-channels.ts`, and preload-local IPC constant copies must be updated where used.

---

## File Structure Map

- `src/main/services/ai-service.js`: owns OpenAI-compatible non-streaming and streaming provider calls, timeout, abort wiring, SSE parsing, fallback, and sanitized provider diagnostics.
- `src/main/services/ai-talk-service.js`: owns conversation setup, streaming request registry, lifecycle transitions, transient partial accumulation, cancellation, final transcript append, memory/behavior scheduling, and AI Talk logs.
- `src/main/services/ai-talk-store.js`: owns durable trace normalization, trace updates, filtering, and export redaction.
- `src/shared/ipc-channels.js` and `src/shared/ipc-channels.ts`: define shared safe channel names for stream-state broadcast and cancel requests.
- `src/main/ipc.js`: wires renderer send/cancel requests to `AiTalkService`, Bubble Chat service, PetChat facade, and safe logs.
- `src/main/pet-bubble-chat-window.js`: owns Bubble Chat state, transient streaming item, queued request behavior, visibility/auto-hide coordination, and broadcast state shape.
- `src/main/pet-bubble-chat-preload.js` and `src/main/pet-bubble-chat/renderer.js`: expose cancel API and render partial/canceled/failed states.
- `src/main/pet-chat-window.js`, `src/main/pet-chat-preload.js`, and `src/main/pet-chat/renderer.js`: expose cancel API and render the same request lifecycle in the extended chat panel.
- `scripts/run-ai-talk-local-smoke.js`: adds opt-in streaming/cancel smoke evidence without leaking secrets or local paths.
- `tests/services/ai-service.test.js`: provider streaming parser, abort, fallback, and redaction tests.
- `tests/services/ai-talk-service.test.js`: AI Talk lifecycle, transcript, memory, behavior, cancel, late-chunk, and trace tests.
- `tests/services/ai-talk-store.test.js`: trace normalization/export tests.
- `tests/main/*chat*.test.js`: IPC/window/renderer regression tests for state and cancel.
- `tests/scripts/run-ai-talk-local-smoke.test.js`: smoke report shape and redaction tests.

---

### Task 1: Provider Streaming Adapter

**Files:**
- Modify: `src/main/services/ai-service.js`
- Modify: `tests/services/ai-service.test.js`

**Interfaces:**
- Consumes: existing `createAiService({ settingsService, secretService, fetchImpl, appLogService })`.
- Produces: `aiService.streamComplete({ messages, tools, configOverride, requestId, signal, onDelta })`.
- Returns: `{ reply, behaviorIntent, elapsedMs, streaming, fallback, fallbackReason, chunkCount, finishReason }`.

- [ ] **Step 1: Add failing streaming parser test**

Append this test near the existing `complete` tests in `tests/services/ai-service.test.js`:

```js
test('ai service streamComplete parses OpenAI-compatible SSE deltas', async () => {
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
    'data: [DONE]\n\n'
  ]
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    }
  })
  const requests = []
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://stream.example.test/v1',
        model: 'stream-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        body
      }
    }
  })
  const deltas = []

  const result = await service.streamComplete({
    requestId: 'stream-test-1',
    messages: [{ role: 'user', content: 'Say hello' }],
    onDelta: (delta) => deltas.push(delta)
  })

  assert.equal(requests[0].url, 'https://stream.example.test/v1/chat/completions')
  assert.equal(JSON.parse(requests[0].options.body).stream, true)
  assert.deepEqual(deltas, ['Hel', 'lo'])
  assert.equal(result.reply, 'Hello')
  assert.equal(result.streaming, true)
  assert.equal(result.fallback, false)
  assert.equal(result.chunkCount, 2)
  assert.equal(result.finishReason, 'stop')
})
```

- [ ] **Step 2: Add failing abort test**

Append this test after the parser test:

```js
test('ai service streamComplete honors abort signal', async () => {
  const controller = new AbortController()
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://stream.example.test/v1',
        model: 'stream-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (_url, options) => {
      controller.abort()
      if (options.signal?.aborted) {
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        throw error
      }
      throw new Error('abort signal was not propagated')
    }
  })

  await assert.rejects(
    () => service.streamComplete({
      requestId: 'stream-abort-1',
      messages: [{ role: 'user', content: 'Long reply' }],
      signal: controller.signal,
      onDelta: () => {}
    }),
    /aborted|timed out/i
  )
})
```

- [ ] **Step 3: Add failing fallback test**

Append this test after the abort test:

```js
test('ai service streamComplete falls back before chunks when streaming is unsupported', async () => {
  let callCount = 0
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://stream.example.test/v1',
        model: 'stream-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (_url, options) => {
      callCount += 1
      const body = JSON.parse(options.body)
      if (body.stream) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'stream is not supported', code: 'unsupported_stream' } })
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'Fallback reply' }, finish_reason: 'stop' }] })
      }
    }
  })

  const result = await service.streamComplete({
    requestId: 'stream-fallback-1',
    messages: [{ role: 'user', content: 'Say hello' }],
    onDelta: () => {}
  })

  assert.equal(callCount, 2)
  assert.equal(result.reply, 'Fallback reply')
  assert.equal(result.streaming, false)
  assert.equal(result.fallback, true)
  assert.equal(result.fallbackReason, 'unsupported-stream')
})
```

- [ ] **Step 4: Run focused tests and confirm failure**

Run:

```bash
node --test tests/services/ai-service.test.js
```

Expected before implementation: failures because `service.streamComplete` is not a function.

- [ ] **Step 5: Implement streamComplete**

In `src/main/services/ai-service.js`, add helper functions near the existing provider parsing helpers:

```js
const isStreamingUnsupportedError = (error) => {
  const status = Number(error?.providerStatus || error?.status || 0)
  const code = String(error?.providerCode || error?.code || '').toLowerCase()
  const message = String(error?.message || '').toLowerCase()
  return status === 400 || status === 404 || code.includes('unsupported') || message.includes('stream')
}

const createLinkedAbortSignal = (externalSignal, timeoutMs) => {
  const timeout = createTimeoutController(timeoutMs)
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (externalSignal?.aborted) controller.abort()
  externalSignal?.addEventListener?.('abort', abort, { once: true })
  timeout.signal.addEventListener?.('abort', abort, { once: true })
  return {
    signal: controller.signal,
    clear: () => {
      externalSignal?.removeEventListener?.('abort', abort)
      timeout.clear()
    }
  }
}

const readStreamTextChunks = async function * (body) {
  if (!body) return
  if (typeof body.getReader === 'function') {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      yield decoder.decode(value, { stream: true })
    }
    const tail = decoder.decode()
    if (tail) yield tail
    return
  }
  for await (const chunk of body) {
    yield Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '')
  }
}

const parseOpenAiStreamLine = (line) => {
  const trimmed = String(line || '').trim()
  if (!trimmed || !trimmed.startsWith('data:')) return null
  const payload = trimmed.slice(5).trim()
  if (!payload || payload === '[DONE]') return { done: true }
  const parsed = JSON.parse(payload)
  const choice = Array.isArray(parsed.choices) ? parsed.choices[0] : null
  return {
    delta: normalizeString(choice?.delta?.content || ''),
    finishReason: normalizeString(choice?.finish_reason)
  }
}
```

Then add `streamComplete` next to `complete()`:

```js
const streamComplete = async ({ messages, tools = [], configOverride = null, requestId = '', signal = null, onDelta = null } = {}) => {
  if (Array.isArray(tools) && tools.length) {
    const result = await complete({ messages, tools, configOverride })
    return { ...result, streaming: false, fallback: true, fallbackReason: 'tools-not-supported', chunkCount: 0, finishReason: '' }
  }

  const config = normalizeCompletionConfig(configOverride || getRawConfig())
  const apiKey = secretService.getSecretValue(config.apiKeyRef)
  const startedAt = Date.now()
  const baseDetails = {
    requestId: normalizeString(requestId).slice(0, 120),
    configSource: configOverride ? 'override' : 'chat',
    provider: config.provider,
    model: config.model,
    endpoint: normalizeEndpointForLog(config.baseUrl),
    messagesCount: Array.isArray(messages) ? messages.length : 0,
    toolsCount: Array.isArray(tools) ? tools.length : 0,
    timeoutMs: requestTimeoutMs,
    hasApiKey: Boolean(apiKey)
  }
  recordLog({ level: 'info', event: 'ai.provider.stream.started', message: 'AI provider stream started', details: baseDetails })

  let response
  let chunkCount = 0
  let reply = ''
  let finishReason = ''
  try {
    if (!apiKey) throw new Error('AI API key is not configured')
    if (config.provider !== 'openai-compatible') throw new Error(`Unsupported AI provider: ${config.provider}`)
    if (typeof fetchImpl !== 'function') throw new Error('fetch is not available')

    const linkedSignal = createLinkedAbortSignal(signal, requestTimeoutMs)
    try {
      response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: linkedSignal.signal,
        body: JSON.stringify({ model: config.model, messages, stream: true })
      })
    } finally {
      linkedSignal.clear()
    }

    if (!response.ok) {
      const data = await response.json?.().catch(() => ({}))
      const providerError = createProviderError({
        message: data?.error?.message || `AI provider stream failed with status ${response.status}`,
        status: response.status,
        code: data?.error?.code
      })
      if (isStreamingUnsupportedError(providerError)) {
        const fallbackResult = await complete({ messages, tools, configOverride })
        return {
          ...fallbackResult,
          streaming: false,
          fallback: true,
          fallbackReason: 'unsupported-stream',
          chunkCount: 0,
          finishReason: ''
        }
      }
      throw providerError
    }

    let buffer = ''
    for await (const textChunk of readStreamTextChunks(response.body)) {
      buffer += textChunk
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) {
        const event = parseOpenAiStreamLine(line)
        if (!event) continue
        if (event.done) break
        if (event.finishReason) finishReason = event.finishReason
        if (!event.delta) continue
        chunkCount += 1
        reply += event.delta
        if (typeof onDelta === 'function') onDelta(event.delta)
      }
    }

    recordLog({
      level: 'info',
      event: 'ai.provider.stream.completed',
      message: 'AI provider stream completed',
      details: { ...baseDetails, status: response.status, elapsedMs: Date.now() - startedAt, chunkCount, replyChars: reply.length, finishReason }
    })
    return { reply, behaviorIntent: null, elapsedMs: Date.now() - startedAt, streaming: true, fallback: false, fallbackReason: '', chunkCount, finishReason }
  } catch (error) {
    recordLog({
      level: 'error',
      event: 'ai.provider.stream.failed',
      message: 'AI provider stream failed',
      details: {
        ...baseDetails,
        status: error?.providerStatus || response?.status || 0,
        providerCode: error?.providerCode || '',
        elapsedMs: Date.now() - startedAt,
        chunkCount,
        partialReplyChars: reply.length,
        errorName: sanitizeDiagnosticText(error?.name || 'Error'),
        errorMessage: error?.providerStatus ? 'AI provider returned an error response' : sanitizeDiagnosticText(error?.message)
      }
    })
    throw error
  }
}
```

Add `streamComplete` to the returned service object.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
node --test tests/services/ai-service.test.js
npm run check:syntax
```

Expected after implementation: both commands pass.

Commit:

```bash
git add src/main/services/ai-service.js tests/services/ai-service.test.js
git commit -m "feat(phase-1): add provider streaming adapter"
```

---

### Task 2: AI Talk Streaming Lifecycle

**Files:**
- Modify: `src/main/services/ai-talk-service.js`
- Modify: `src/main/services/ai-talk-store.js`
- Modify: `tests/services/ai-talk-service.test.js`
- Modify: `tests/services/ai-talk-store.test.js`

**Interfaces:**
- Consumes: `aiService.streamComplete({ messages, tools, requestId, signal, onDelta })`.
- Produces: `aiTalkService.streamChat({ message, messageBatch, entrypoint, requestId, skipUserAppend, onState })`.
- Produces: `aiTalkService.cancelRequest({ requestId, reason })`.
- Emits state: `{ requestId, conversationId, petPackId, entrypoint, status, partialReply, partialReplyChars, canCancel, errorMessage }`.

- [ ] **Step 1: Add failing completed lifecycle test**

Append to `tests/services/ai-talk-service.test.js`:

```js
test('ai talk service streamChat appends only final assistant reply', async () => {
  const store = createStore()
  const states = []
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, provider: 'openai-compatible', model: 'stream-model', behavior: { enabled: false }, memory: { enabled: false } }),
      streamComplete: async ({ onDelta }) => {
        onDelta('Hel')
        onDelta('lo')
        return { reply: 'Hello', elapsedMs: 12, streaming: true, fallback: false, chunkCount: 2, finishReason: 'stop' }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'mochi-cat', persona: null })
  })

  const result = await service.streamChat({
    message: 'Hi',
    requestId: 'stream-chat-1',
    entrypoint: 'bubble-chat',
    onState: (state) => states.push(state)
  })

  assert.equal(result.reply, 'Hello')
  assert.deepEqual(store.getMessages('control-center:mochi-cat', 'main').map((message) => message.content), ['Hi', 'Hello'])
  assert.equal(states.some((state) => state.status === 'streaming' && state.partialReply === 'Hel'), true)
  assert.equal(states.at(-1).status, 'completed')
})
```

- [ ] **Step 2: Add failing cancel side-effect test**

Append:

```js
test('ai talk service cancelRequest prevents assistant persistence and side effects', async () => {
  const store = createStore()
  let memoryRequestCount = 0
  const states = []
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, provider: 'openai-compatible', model: 'stream-model', behavior: { enabled: false }, memory: { enabled: true } }),
      streamComplete: async ({ requestId, onDelta, signal }) => {
        onDelta('Partial')
        service.cancelRequest({ requestId, reason: 'user-cancel' })
        assert.equal(signal.aborted, true)
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        throw error
      },
      complete: async () => {
        memoryRequestCount += 1
        return { reply: 'memory extracted' }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'mochi-cat', persona: null })
  })

  const result = await service.streamChat({
    message: 'Please write long',
    requestId: 'stream-cancel-1',
    entrypoint: 'bubble-chat',
    onState: (state) => states.push(state)
  })

  assert.equal(result.canceled, true)
  assert.deepEqual(store.getMessages('control-center:mochi-cat', 'main').map((message) => message.content), ['Please write long'])
  assert.equal(memoryRequestCount, 0)
  assert.equal(states.at(-1).status, 'canceled')
})
```

- [ ] **Step 3: Add failing trace redaction test**

Append:

```js
test('ai talk service streamChat records redacted streaming trace summary', async () => {
  const store = createStore()
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, provider: 'openai-compatible', baseUrl: 'https://example.test/v1', model: 'stream-model', behavior: { enabled: false }, memory: { enabled: false } }),
      streamComplete: async ({ onDelta }) => {
        onDelta('secret partial')
        return { reply: 'secret final', elapsedMs: 20, streaming: true, fallback: false, chunkCount: 1, finishReason: 'stop' }
      }
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'mochi-cat', persona: null })
  })

  await service.streamChat({ message: 'secret user prompt', requestId: 'stream-trace-1' })
  const exported = service.exportTraceDiagnostics({ filters: { petPackId: 'mochi-cat' } })
  const serialized = JSON.stringify(exported)

  assert.match(serialized, /stream-trace-1/)
  assert.match(serialized, /"streaming":true/)
  assert.match(serialized, /"chunkCount":1/)
  assert.equal(serialized.includes('secret user prompt'), false)
  assert.equal(serialized.includes('secret partial'), false)
  assert.equal(serialized.includes('secret final'), false)
})
```

- [ ] **Step 4: Run focused tests and confirm failure**

Run:

```bash
node --test tests/services/ai-talk-service.test.js tests/services/ai-talk-store.test.js
```

Expected before implementation: failures because `streamChat` and streaming trace fields do not exist.

- [ ] **Step 5: Implement request registry and lifecycle**

In `src/main/services/ai-talk-service.js`, add an internal map inside `createAiTalkService`:

```js
const streamingRequests = new Map()

const emitStreamState = (state, callback) => {
  const view = {
    requestId: normalizeString(state.requestId).slice(0, 120),
    conversationId: normalizeString(state.conversationId),
    petPackId: normalizeString(state.petPackId),
    entrypoint: normalizeString(state.entrypoint) || 'control-center',
    status: state.status,
    partialReply: normalizeString(state.partialReply),
    partialReplyChars: normalizeString(state.partialReply).length,
    canCancel: state.status === 'started' || state.status === 'streaming',
    errorMessage: sanitizeDiagnosticText(state.errorMessage)
  }
  if (typeof callback === 'function') callback(view)
  return view
}

const cancelRequest = ({ requestId, reason = 'user-cancel' } = {}) => {
  const key = normalizeString(requestId).slice(0, 120)
  const request = streamingRequests.get(key)
  if (!request) return { canceled: false, requestId: key, reason: 'not-found' }
  if (request.status === 'completed' || request.status === 'canceled' || request.status === 'failed') {
    return { canceled: false, requestId: key, reason: 'already-terminal', status: request.status }
  }
  request.status = 'canceling'
  request.cancelReason = normalizeString(reason) || 'user-cancel'
  request.controller.abort()
  recordLog({
    level: 'info',
    event: 'ai-talk.stream.cancel-requested',
    message: 'AI talk stream cancel requested',
    details: {
      requestId: key,
      conversationId: request.conversationId,
      petPackId: request.petPackId,
      cancelReason: request.cancelReason
    }
  })
  return { canceled: true, requestId: key, reason: request.cancelReason }
}
```

Add `streamChat()` by reusing the same context-building steps from `chat()`. The durable differences are:

```js
const streamChat = async ({ message, messageBatch = null, entrypoint = 'control-center', requestId, skipUserAppend = false, onState = null } = {}) => {
  const controller = new AbortController()
  const startedAt = Date.now()
  const safeRequestId = normalizeString(requestId) || `chat-${Date.now().toString(36)}`
  let registryEntry = null
  let traceId = ''
  let partialReply = ''
  let chunkCount = 0

  const normalizedBatch = Array.isArray(messageBatch) ? messageBatch.map(normalizeString).filter(Boolean) : []
  const content = normalizeString(message)
  const userContents = normalizedBatch.length ? normalizedBatch : [content].filter(Boolean)

  try {
    if (!userContents.length) throw new Error('AI chat message is empty')
    if (userContents.some((item) => item.length > MAX_USER_MESSAGE_CHARS)) throw new Error('AI chat message is too long')
    const config = typeof aiService.getConfig === 'function' ? aiService.getConfig() : { enabled: true }
    if (!config.enabled) throw new Error('AI chat is disabled')

    const { manifest, petPackId } = resolveActivePack()
    const { persona, systemPrompt: personaPrompt, personaHash } = resolvePersona(manifest, petPackId)
    const { sessionId, conversationId } = aiTalkStore.ensureMainConversation({ entrypoint, petPackId, personaHash })
    const conversationPublicId = `${sessionId}:${conversationId}`

    return await enqueueConversation(conversationPublicId, async () => {
      const history = aiTalkStore.getMessages(sessionId, conversationId)
      const userMessages = userContents.map((entry) => ({ role: 'user', content: entry }))
      if (!skipUserAppend) aiTalkStore.appendMessages(sessionId, conversationId, userMessages)
      const updatedHistory = aiTalkStore.getMessages(sessionId, conversationId)
      const memoryContext = getMemoryContext({ petPackId, userMessage: userContents.join('\n'), history })
      const memoryContextPrompt = compileMemoryContextPrompt(memoryContext)
      const recentPetActivity = getRecentPetActivity(petPackId)
      const recentPetActivityPrompt = compileRecentPetActivityPrompt(recentPetActivity)
      const actionCandidates = getCurrentActionCandidates(manifest)
      const tools = config.behavior?.enabled && config.behavior?.useTools !== false ? [getBehaviorToolDefinition({ actions: actionCandidates })] : []
      const messages = [
        { role: 'system', content: compileSystemPrompt({ personaPrompt, globalPrompt: config.systemPrompt }) },
        ...(memoryContextPrompt ? [{ role: 'system', content: memoryContextPrompt }] : []),
        ...(recentPetActivityPrompt ? [{ role: 'system', content: recentPetActivityPrompt }] : []),
        ...getRecentMessages(history).map(({ role, content }) => ({ role, content })),
        ...(skipUserAppend ? [] : userMessages)
      ]

      registryEntry = { requestId: safeRequestId, conversationId: conversationPublicId, petPackId, entrypoint, status: 'started', controller, cancelReason: '' }
      streamingRequests.set(safeRequestId, registryEntry)
      emitStreamState({ ...registryEntry, status: 'started', partialReply: '' }, onState)
      recordLog({ level: 'info', event: 'ai-talk.stream.started', message: 'AI talk stream started', details: { requestId: safeRequestId, conversationId: conversationPublicId, petPackId, entrypoint, messageChars: userContents.join('\n').length } })

      const result = await aiService.streamComplete({
        messages,
        tools,
        requestId: safeRequestId,
        signal: controller.signal,
        onDelta: (delta) => {
          if (registryEntry.status === 'canceling' || registryEntry.status === 'canceled') {
            recordLog({ level: 'warn', event: 'ai-talk.stream.late-chunk-ignored', message: 'AI talk stream late chunk ignored', details: { requestId: safeRequestId, conversationId: conversationPublicId, petPackId } })
            return
          }
          const text = normalizeString(delta)
          if (!text) return
          registryEntry.status = 'streaming'
          chunkCount += 1
          partialReply += text
          emitStreamState({ ...registryEntry, status: 'streaming', partialReply }, onState)
        }
      })

      if (registryEntry.status === 'canceling') throw Object.assign(new Error('AI talk stream canceled'), { name: 'AbortError' })
      const reply = normalizeString(result.reply || partialReply)
      if (!reply) throw new Error('AI provider returned an empty response')
      const nextMessages = aiTalkStore.appendMessages(sessionId, conversationId, [{ role: 'assistant', content: reply }])
      markMemoryContextUsed({ petPackId, conversationId: conversationPublicId, memories: memoryContext })
      scheduleMemoryExtraction({ config, petPackId, conversationPublicId, sourceMessages: nextMessages.slice(-2), userMessage: userContents.join('\n'), assistantReply: reply, persona })
      registryEntry.status = 'completed'
      emitStreamState({ ...registryEntry, status: 'completed', partialReply: reply }, onState)
      streamingRequests.delete(safeRequestId)
      return { conversationId: conversationPublicId, reply, messages: nextMessages, requestId: safeRequestId, providerLatencyMs: Number.isFinite(result.elapsedMs) ? result.elapsedMs : 0 }
    })
  } catch (error) {
    const canceled = registryEntry?.status === 'canceling' || error?.name === 'AbortError'
    if (registryEntry) {
      registryEntry.status = canceled ? 'canceled' : 'failed'
      emitStreamState({ ...registryEntry, status: registryEntry.status, partialReply, errorMessage: canceled ? '' : sanitizeDiagnosticText(error?.message) }, onState)
      streamingRequests.delete(safeRequestId)
    }
    if (canceled) return { canceled: true, requestId: safeRequestId, reply: '', partialReply }
    throw error
  }
}
```

Preserve the existing `chat()` method and export both `streamChat` and `cancelRequest`.

- [ ] **Step 6: Extend trace normalization**

In `src/main/services/ai-talk-store.js`, extend `normalizeTraceEntry()` so streaming fields survive `recordTrace()`, `updateTrace()`, `listTraces()`, and export:

```js
streaming: trace.streaming === true,
status: normalizeString(trace.status || (trace.success === false ? 'failed' : 'completed')),
chunkCount: Number.isFinite(Number(trace.chunkCount)) ? Number(trace.chunkCount) : 0,
partialReplyChars: Number.isFinite(Number(trace.partialReplyChars)) ? Number(trace.partialReplyChars) : 0,
elapsedMs: Number.isFinite(Number(trace.elapsedMs)) ? Number(trace.elapsedMs) : 0,
providerLatencyMs: Number.isFinite(Number(trace.providerLatencyMs)) ? Number(trace.providerLatencyMs) : 0,
finishReason: normalizeString(trace.finishReason),
cancelReason: normalizeString(trace.cancelReason),
memoryExtractionScheduled: trace.memoryExtractionScheduled === true,
behaviorDecisionScheduled: trace.behaviorDecisionScheduled === true,
```

In `streamChat()`, call `recordChatTrace()` or `aiTalkStore.recordTrace()` at terminal states with only summary fields, never raw partial or final text.

- [ ] **Step 7: Run focused tests and commit**

Run:

```bash
node --test tests/services/ai-talk-service.test.js tests/services/ai-talk-store.test.js
npm run check:syntax
```

Expected after implementation: focused tests and syntax check pass.

Commit:

```bash
git add src/main/services/ai-talk-service.js src/main/services/ai-talk-store.js tests/services/ai-talk-service.test.js tests/services/ai-talk-store.test.js
git commit -m "feat(phase-1): add ai talk streaming lifecycle"
```

---

### Task 3: IPC Cancel Contract And Shared State Broadcast

**Files:**
- Modify: `src/shared/ipc-channels.js`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc.js`
- Modify: `tests/main/pet-chat-ipc.test.js`

**Interfaces:**
- Consumes: `aiTalkService.streamChat()` and `aiTalkService.cancelRequest()`.
- Produces IPC constants:
- `AI_TALK_STREAM_STATE_CHANGED: 'ai-talk:stream-state-changed'`
- `AI_TALK_CANCEL_REQUEST: 'ai-talk:cancel-request'`
- `PET_BUBBLE_CHAT_CANCEL_MESSAGE: 'pet-bubble-chat:cancel-message'`
- `PET_CHAT_CANCEL_MESSAGE: 'pet-chat:cancel-message'`

- [ ] **Step 1: Add failing IPC test**

In `tests/main/pet-chat-ipc.test.js`, add this test after the existing PetChat send tests:

```js
test('pet chat and bubble chat cancel handlers cancel the shared ai talk request', async () => {
  const cancelCalls = []
  const ipcMain = registerPetChatHandlers({
    aiTalkService: {
      getPersonaProfile: () => ({ petPackId: 'legacy-cat', petPackDisplayName: 'Legacy Cat' }),
      getConversation: () => [],
      cancelRequest: (payload) => {
        cancelCalls.push(payload)
        return { canceled: true }
      }
    }
  })

  assert.equal(ipcMain.handlers.has(IPC.PET_CHAT_CANCEL_MESSAGE), true)
  assert.equal(ipcMain.handlers.has(IPC.PET_BUBBLE_CHAT_CANCEL_MESSAGE), true)
  assert.equal(await ipcMain.handlers.get(IPC.PET_CHAT_CANCEL_MESSAGE)({}, { requestId: 'chat-1' }), true)
  assert.equal(await ipcMain.handlers.get(IPC.PET_BUBBLE_CHAT_CANCEL_MESSAGE)({}, { requestId: 'chat-2' }), true)
  assert.deepEqual(cancelCalls, [
    { requestId: 'chat-1', reason: 'user-cancel', sourceSurface: 'pet-chat' },
    { requestId: 'chat-2', reason: 'user-cancel', sourceSurface: 'bubble-chat' }
  ])
})
```

- [ ] **Step 2: Run IPC test and confirm failure**

Run:

```bash
node --test tests/main/pet-chat-ipc.test.js
```

Expected before implementation: missing cancel channel handler assertions fail.

- [ ] **Step 3: Add IPC constants**

Add these constants to both shared channel files near the existing AI Talk and chat entries:

```js
AI_TALK_STREAM_STATE_CHANGED: 'ai-talk:stream-state-changed',
AI_TALK_CANCEL_REQUEST: 'ai-talk:cancel-request',
PET_BUBBLE_CHAT_CANCEL_MESSAGE: 'pet-bubble-chat:cancel-message',
PET_CHAT_CANCEL_MESSAGE: 'pet-chat:cancel-message',
```

- [ ] **Step 4: Wire streaming send/cancel in main IPC**

In `src/main/ipc.js`, add a safe broadcaster:

```js
const broadcastAiTalkStreamState = (state = {}) => {
  petBubbleChatWindowService?.applyStreamState?.(state)
  petChatWindowService?.applyStreamState?.(state)
}
```

In Bubble Chat send handling, call `aiTalkService.streamChat()` when available:

```js
const batchResult = await aiTalkService.streamChat({
  message: messagesForBatch.at(-1) || '',
  messageBatch: messagesForBatch,
  entrypoint: 'bubble-chat',
  requestId: batchRequestId,
  skipUserAppend: Boolean(aiTalkService?.appendUserMessages),
  onState: broadcastAiTalkStreamState
})
```

In PetChat send handling:

```js
const result = await aiTalkService.streamChat({
  message,
  entrypoint: source,
  requestId,
  onState: broadcastAiTalkStreamState
})
```

Keep a fallback to existing `runAiChatRequest()` if `aiTalkService.streamChat` is absent.

Register cancel handlers:

```js
ipcMainService.handle(IPC.PET_BUBBLE_CHAT_CANCEL_MESSAGE, (_event, payload = {}) => {
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
  const result = aiTalkService?.cancelRequest?.({ requestId, reason: 'user-cancel', sourceSurface: 'bubble-chat' })
  return Boolean(result?.canceled)
})

ipcMainService.handle(IPC.PET_CHAT_CANCEL_MESSAGE, (_event, payload = {}) => {
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
  const result = aiTalkService?.cancelRequest?.({ requestId, reason: 'user-cancel', sourceSurface: 'pet-chat' })
  return Boolean(result?.canceled)
})
```

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
node --test tests/main/pet-chat-ipc.test.js
npm run check:syntax
```

Expected after implementation: focused IPC tests and syntax check pass.

Commit:

```bash
git add src/shared/ipc-channels.js src/shared/ipc-channels.ts src/main/ipc.js tests/main/pet-chat-ipc.test.js
git commit -m "feat(phase-2): add ai talk streaming ipc contract"
```

---

### Task 4: Bubble Chat And PetChat Renderer States

**Files:**
- Modify: `src/main/pet-bubble-chat-window.js`
- Modify: `src/main/pet-bubble-chat-preload.js`
- Modify: `src/main/pet-bubble-chat/renderer.js`
- Modify: `src/main/pet-chat-window.js`
- Modify: `src/main/pet-chat-preload.js`
- Modify: `src/main/pet-chat/renderer.js`
- Modify: `tests/main/pet-bubble-chat-window.test.js`
- Modify: `tests/main/pet-bubble-chat-renderer.test.js`
- Modify: `tests/main/pet-chat-renderer.test.js`

**Interfaces:**
- Consumes: stream state from `src/main/ipc.js`.
- Produces: `applyStreamState(state)` on both window services and `cancelMessage({ requestId })` in both preload APIs.

- [ ] **Step 1: Add failing Bubble Chat window test**

In `tests/main/pet-bubble-chat-window.test.js`, add this test near the other `createPetBubbleChatWindowManager` state tests:

```js
test('pet bubble chat manager tracks transient streaming state', () => {
  const { FakeBrowserWindow } = createFakeBrowserWindow()
  const { createPetBubbleChatWindowManager } = loadModuleWithElectron({
    app: { on: () => {} },
    BrowserWindow: FakeBrowserWindow,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 900, height: 700 } }) }
  })
  const service = createPetBubbleChatWindowManager({
    projectRoot: '/repo',
    petService: { getBounds: () => ({ x: 300, y: 300, width: 120, height: 120 }) },
    settingsService: { get: () => ({ petBubbleChat: { enabled: true } }) },
    appLogService: { record: () => {} }
  })

  service.applyStreamState({
    requestId: 'chat-stream-1',
    status: 'streaming',
    partialReply: 'Hel',
    canCancel: true
  })
  let state = service.getState()
  assert.equal(state.streaming.requestId, 'chat-stream-1')
  assert.equal(state.streaming.partialReply, 'Hel')
  assert.equal(state.streaming.canCancel, true)
  assert.equal(state.sending, true)

  service.applyStreamState({
    requestId: 'chat-stream-1',
    status: 'completed',
    partialReply: 'Hello',
    canCancel: false
  })
  state = service.getState()
  assert.equal(state.streaming.status, 'completed')
  assert.equal(state.streaming.canCancel, false)
  assert.equal(state.sending, false)
})
```

- [ ] **Step 2: Add failing renderer tests**

In `tests/main/pet-bubble-chat-renderer.test.js`, add a fixture state with `streaming: { requestId: 'chat-stream-1', status: 'streaming', partialReply: 'Hel', canCancel: true }`, then assert that the rendered document contains `Hel` and a `.cancel-stream-button`. Click the button and assert the mocked `window.petBubbleChatAPI.cancelMessage` receives `{ requestId: 'chat-stream-1' }`.

In `tests/main/pet-chat-renderer.test.js`, add a fixture state with the same `streaming` object, assert an assistant streaming message is rendered with `data-status="streaming"`, then rerender with `status: 'completed'` and assert no enabled cancel button remains.

- [ ] **Step 3: Run renderer/window tests and confirm failure**

Run:

```bash
node --test tests/main/pet-bubble-chat-window.test.js tests/main/pet-bubble-chat-renderer.test.js tests/main/pet-chat-renderer.test.js
```

Expected before implementation: missing `applyStreamState` and cancel API failures.

- [ ] **Step 4: Implement window service state**

In both window services, add a transient `streaming` state slot:

```js
const normalizeStreamState = (state = {}) => ({
  requestId: typeof state.requestId === 'string' ? state.requestId.slice(0, 120) : '',
  conversationId: typeof state.conversationId === 'string' ? state.conversationId : '',
  petPackId: typeof state.petPackId === 'string' ? state.petPackId : '',
  status: ['started', 'streaming', 'completed', 'canceled', 'failed'].includes(state.status) ? state.status : 'streaming',
  partialReply: typeof state.partialReply === 'string' ? state.partialReply : '',
  partialReplyChars: Number.isFinite(Number(state.partialReplyChars)) ? Number(state.partialReplyChars) : 0,
  canCancel: state.canCancel === true,
  errorMessage: typeof state.errorMessage === 'string' ? state.errorMessage : ''
})

const applyStreamState = (state = {}) => {
  currentState.streaming = normalizeStreamState(state)
  if (currentState.streaming.status === 'streaming' || currentState.streaming.status === 'started') {
    currentState.sending = true
  } else {
    currentState.sending = false
  }
  broadcastState()
  return getState()
}
```

For `src/main/pet-bubble-chat-window.js`, store the normalized value on the existing manager state object that `getState()` clones and use the existing state broadcast helper that sends `IPC.PET_BUBBLE_CHAT_STATE_CHANGED`. For `src/main/pet-chat-window.js`, store the normalized value in the manager state returned by `getState()` and use the existing `broadcastState()` helper that sends `IPC.PET_CHAT_STATE_CHANGED`.

- [ ] **Step 5: Implement preload cancel APIs**

In `src/main/pet-bubble-chat-preload.js`:

```js
PET_BUBBLE_CHAT_CANCEL_MESSAGE: 'pet-bubble-chat:cancel-message',
```

Expose:

```js
cancelMessage: (payload = {}) => ipcRenderer.invoke(IPC.PET_BUBBLE_CHAT_CANCEL_MESSAGE, {
  requestId: typeof payload.requestId === 'string' ? payload.requestId : ''
}),
```

In `src/main/pet-chat-preload.js`:

```js
PET_CHAT_CANCEL_MESSAGE: 'pet-chat:cancel-message',
```

Expose:

```js
cancelMessage: (payload = {}) => ipcRenderer.invoke(IPC.PET_CHAT_CANCEL_MESSAGE, {
  requestId: typeof payload.requestId === 'string' ? payload.requestId : ''
}),
```

- [ ] **Step 6: Implement renderer display**

In both renderers, render a transient assistant item from `state.streaming`:

```js
const renderStreamingItem = (streaming) => {
  if (!streaming || !streaming.requestId) return ''
  const statusLabel = streaming.status === 'canceled'
    ? '已取消'
    : streaming.status === 'failed'
      ? (streaming.errorMessage || '回复失败')
      : streaming.status === 'completed'
        ? ''
        : '正在回复...'
  return `
    <div class="message assistant streaming" data-request-id="${escapeHtml(streaming.requestId)}" data-status="${escapeHtml(streaming.status)}">
      <div class="message-body">${escapeHtml(streaming.partialReply || statusLabel)}</div>
      ${streaming.canCancel ? '<button type="button" class="cancel-stream-button">停止</button>' : ''}
    </div>
  `
}
```

Attach click handling:

```js
document.addEventListener('click', (event) => {
  const button = event.target?.closest?.('.cancel-stream-button')
  if (!button) return
  const item = button.closest('[data-request-id]')
  const requestId = item?.getAttribute('data-request-id') || ''
  window.petBubbleChatAPI?.cancelMessage?.({ requestId })
  window.petChatAPI?.cancelMessage?.({ requestId })
})
```

Use the correct API object per renderer; do not call both in one renderer.

- [ ] **Step 7: Run focused tests and commit**

Run:

```bash
node --test tests/main/pet-bubble-chat-window.test.js tests/main/pet-bubble-chat-renderer.test.js tests/main/pet-chat-renderer.test.js
npm run check:syntax
```

Expected after implementation: focused UI-state tests and syntax check pass.

Commit:

```bash
git add src/main/pet-bubble-chat-window.js src/main/pet-bubble-chat-preload.js src/main/pet-bubble-chat/renderer.js src/main/pet-chat-window.js src/main/pet-chat-preload.js src/main/pet-chat/renderer.js tests/main/pet-bubble-chat-window.test.js tests/main/pet-bubble-chat-renderer.test.js tests/main/pet-chat-renderer.test.js
git commit -m "feat(phase-2): render ai talk streaming state"
```

---

### Task 5: Smoke, Runbook, Review, And Merge Readiness

**Files:**
- Modify: `scripts/run-ai-talk-local-smoke.js`
- Modify: `tests/scripts/run-ai-talk-local-smoke.test.js`
- Modify: `docs/superpowers/specs/2026-06-28-real-provider-chat-acceptance-runbook.md`
- Modify: `docs/openpet-current-todo-architecture.md`

**Interfaces:**
- Consumes: new streaming/cancel lifecycle from prior tasks.
- Produces smoke flags: `--stream` and `--cancel-after-ms <n>`.
- Produces report fields: `streamingAcceptance.requestId`, `chunkCount`, `firstDeltaLatencyMs`, `providerLatencyMs`, `completed`, `canceled`, `memoryExtractionScheduled`, `behaviorDecisionScheduled`.

- [ ] **Step 1: Add failing smoke report test**

In `tests/scripts/run-ai-talk-local-smoke.test.js`, add this test after `runAiTalkLocalSmoke writes a redacted smoke summary using injected host services`:

```js
test('runAiTalkLocalSmoke writes sanitized streaming acceptance fields', async () => {
  const userDataDir = createTempDir('openpet-ai-talk-stream-user-data-')
  const outputDir = createTempDir('openpet-ai-talk-stream-output-')
  fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify({
    ai: {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8317/v1',
      model: 'gpt-5.5'
    },
    petPacks: {
      activePackId: 'legacy-cat',
      installed: {}
    }
  }, null, 2))
  fs.writeFileSync(path.join(userDataDir, 'secrets.json'), JSON.stringify({
    secrets: {
      'ai.default': {
        label: 'AI API Key',
        value: 'sk-test-secret',
        updatedAt: '2026-06-28T12:00:00.000Z'
      }
    }
  }, null, 2))

  const result = await runAiTalkLocalSmoke({
    message: 'secret user message',
    stream: true,
    userDataDir,
    outputDir,
    now: () => new Date('2026-06-28T12:34:56.789Z'),
    createSecretServiceImpl: () => ({ getSecretValue: () => 'sk-test-secret' }),
    createAiServiceImpl: () => ({
      getConfig: () => ({
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:8317/v1',
        model: 'gpt-5.5',
        hasApiKey: true
      }),
      testConnection: async () => ({ ok: true, code: 'ok', message: 'ok', elapsedMs: 1, reply: 'ok' })
    }),
    createAiTalkStoreImpl: () => ({}),
    createPetUtteranceLogServiceImpl: () => ({}),
    createPetPackServiceImpl: () => ({
      getActivePetPack: () => ({ manifest: { id: 'legacy-cat', displayName: 'Legacy Cat' } })
    }),
    createAiTalkServiceImpl: () => ({
      streamChat: async ({ requestId, onState }) => {
        onState({ requestId, status: 'streaming', partialReply: 'secret partial text', partialReplyChars: 19, canCancel: true })
        onState({ requestId, status: 'completed', partialReply: 'safe final', partialReplyChars: 10, canCancel: false })
        return {
          requestId,
          conversationId: 'control-center:legacy-cat:main',
          reply: 'safe final',
          bubbleSegments: ['safe final'],
          messages: [{ role: 'user', content: 'secret user message' }, { role: 'assistant', content: 'safe final' }],
          providerLatencyMs: 900
        }
      },
      flushMemoryJobs: async () => {},
      getTraceExport: () => ({ petPackId: 'legacy-cat', traces: [] })
    })
  })

  const serialized = JSON.stringify(result)
  assert.equal(result.ok, true)
  assert.equal(result.streamingAcceptance.completed, true)
  assert.match(result.streamingAcceptance.requestId, /^chat-/)
  assert.equal(result.streamingAcceptance.firstDeltaLatencyMs >= 0, true)
  assert.equal(serialized.includes('secret user message'), false)
  assert.equal(serialized.includes('secret partial text'), false)
})
```

- [ ] **Step 2: Run smoke test and confirm failure**

Run:

```bash
node --test tests/scripts/run-ai-talk-local-smoke.test.js
```

Expected before implementation: missing `--stream` or streaming report field assertions fail.

- [ ] **Step 3: Implement smoke flags**

In `scripts/run-ai-talk-local-smoke.js`, parse:

```js
stream: args.includes('--stream'),
cancelAfterMs: Number(readArgValue('--cancel-after-ms') || 0)
```

When `stream` is true, call the same main-process service path used by the existing smoke, but request `streamChat` if present:

```js
const streamingEvents = []
const startedAt = Date.now()
let firstDeltaLatencyMs = 0
const pending = aiTalkService.streamChat({
  message,
  requestId,
  entrypoint: 'bubble-chat-smoke',
  onState: (state) => {
    streamingEvents.push(state)
    if (!firstDeltaLatencyMs && state.status === 'streaming' && state.partialReplyChars > 0) {
      firstDeltaLatencyMs = Date.now() - startedAt
    }
  }
})
if (cancelAfterMs > 0) {
  setTimeout(() => aiTalkService.cancelRequest({ requestId, reason: 'smoke-cancel-after-ms' }), cancelAfterMs)
}
const result = await pending
```

Write only safe summary fields:

```js
streamingAcceptance: {
  requestId,
  chunkCount: Math.max(0, ...streamingEvents.map((event) => Number(event.chunkCount || 0))),
  firstDeltaLatencyMs,
  providerLatencyMs: Number(result.providerLatencyMs || 0),
  completed: result.canceled !== true,
  canceled: result.canceled === true,
  memoryExtractionScheduled: result.canceled !== true,
  behaviorDecisionScheduled: result.canceled !== true && Boolean(result.behaviorIntent)
}
```

- [ ] **Step 4: Update runbook and TODO index**

In `docs/superpowers/specs/2026-06-28-real-provider-chat-acceptance-runbook.md`, add:

```bash
npm run run-ai-talk-local-smoke -- \
  --message "请用三句话慢慢回复，用于 streaming 验收" \
  --stream \
  --output-dir ai-talk-streaming-smoke
```

And:

```bash
npm run run-ai-talk-local-smoke -- \
  --message "请生成一段较长回复，用于 cancel 验收" \
  --stream \
  --cancel-after-ms 500 \
  --output-dir ai-talk-streaming-cancel-smoke
```

In `docs/openpet-current-todo-architecture.md`, move `Streaming replies and cancel generation` from future P2/P3 wording to landed/current facts only after the implementation and smoke entry points pass. If real provider manual validation is still pending, keep that under `Manual-required`.

- [ ] **Step 5: Run full milestone verification**

Run:

```bash
node --test tests/services/ai-service.test.js tests/services/ai-talk-service.test.js tests/services/ai-talk-store.test.js
node --test tests/main/pet-chat-ipc.test.js tests/main/pet-bubble-chat-window.test.js tests/main/pet-bubble-chat-renderer.test.js tests/main/pet-chat-renderer.test.js
node --test tests/scripts/run-ai-talk-local-smoke.test.js
npm run test:core
npm run check:syntax
```

Expected: all commands pass. If a broad existing test unrelated to this milestone fails, record the failing command, failing test, and ownership before deciding whether it blocks merge.

- [ ] **Step 6: Run production code quality review**

Use `/Users/mango/.agents/skills/production-code-quality-review/SKILL.md` against this milestone diff and report:

```text
严重问题：
中等问题：
非阻塞建议：
安全风险：
稳定性风险：
可维护性风险：
测试覆盖：
质量评分：
通过状态：
```

Fix P0/P1 blockers only. Put non-blocking suggestions into `docs/openpet-current-todo-architecture.md` backlog.

- [ ] **Step 7: Commit docs and smoke closeout**

Commit:

```bash
git add scripts/run-ai-talk-local-smoke.js tests/scripts/run-ai-talk-local-smoke.test.js docs/superpowers/specs/2026-06-28-real-provider-chat-acceptance-runbook.md docs/openpet-current-todo-architecture.md
git commit -m "docs(phase-4): add ai talk streaming smoke runbook"
```

If the design and implementation plan are still uncommitted, include them in a separate docs commit:

```bash
git add docs/superpowers/specs/2026-07-09-ai-talk-streaming-cancel-development-design.md docs/superpowers/plans/2026-07-09-ai-talk-streaming-cancel.md
git commit -m "docs: add ai talk streaming cancel development plan"
```

---

## Final Acceptance

- `AiService.streamComplete()` can parse OpenAI-compatible SSE deltas, abort requests, and fallback to `complete()` before any chunk is emitted.
- `AiTalkService.streamChat()` preserves existing persona/history/memory/action context building and writes only final successful assistant replies to durable transcript.
- Cancel is idempotent and prevents assistant transcript writes, memory extraction, behavior decisions, duplicate `PetService.say()` dispatch, and late chunk pollution.
- Bubble Chat and PetChatWindow render the same `requestId` lifecycle and can cancel the same main-process request.
- Trace/export/logs contain only sanitized summary data and no secrets, full prompts, raw chunks, raw memory text, or full user message content.
- Existing non-streaming chat tests pass.
- `npm start` remains functional after `npm run build:control-center` and no duplicate IPC handler registration occurs.

## Manual-required After Merge

- Run real provider streaming smoke with the saved `http://127.0.0.1:8317/v1` gateway and verify first-delta latency/chunk behavior.
- Run real cancel smoke against a long reply and confirm the provider/gateway actually stops or safely ignores late output.
- Human-check Bubble Chat placement, reading dwell time, cancel discoverability, and transparent hit-testing on the desktop.
- Archive sanitized evidence only after confirming the report contains no local full paths, raw prompts, API keys, or raw provider chunks.
