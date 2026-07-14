# AI Talk Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the reviewed AI Talk production gaps in shutdown handling, bounded persistence, turn orchestration consistency, Bubble Chat preview size, shared streaming types, and documentation truth.

**Architecture:** Keep `AiTalkService` as the single orchestration owner and `AiTalkStore` as the durable JSON source of truth. Add bounded cleanup and derived memory indexes inside existing modules, share only turn preparation/finalization between complete and streaming paths, and derive a surface-specific Bubble Chat preview before renderer delivery.

**Tech Stack:** Electron main process, Node.js CommonJS, Node native test runner, TypeScript shared contracts, React/Vite Control Center, Playwright UI tests.

## Global Constraints

- Work only on `dev6`; do not edit or merge the protected `main` worktree.
- Never stage, delete, or modify the untracked `tmp/` directory.
- Preserve one main-process AI Talk brain and one durable `AiTalkStore`.
- Preserve successful-final-only assistant persistence and side effects.
- Preserve non-blocking memory extraction for the user-visible reply.
- Keep API keys, authorization headers, raw provider chunks, hidden prompt context, and raw injected memory out of renderers, ordinary plugins, and default logs.
- Control Center remains trusted to display user-facing compiled persona prompts and saved memory text.
- Message retention is 400 per conversation.
- Memory-job retention is 200 total records.
- Active-memory retention is 200 total records; inactive-memory retention is 400 total records.
- Bubble Chat reply preview is capped at 600 characters; PetChatWindow keeps the existing 12,000-character cap.
- Keep synchronous atomic JSON persistence; do not introduce an asynchronous storage queue.
- Use `apply_patch` for manual file edits and write failing tests before production changes.

---

### Task 1: Wire AI Talk Into Runtime Shutdown

**Files:**
- Modify: `tests/main/bootstrap-runtime-lifecycle.test.js`
- Modify: `tests/services/ai-talk-service.test.js`
- Modify: `tests/services/ai-talk-store.test.js`
- Modify: `src/main/bootstrap/runtime-lifecycle.js`
- Modify: `src/main/bootstrap/create-openpet-runtime.js`
- Modify: `src/main/services/ai-talk-service.js`
- Modify: `src/main/services/ai-talk-store.js`

**Interfaces:**
- Consumes: existing `aiTalkService.dispose()` and `aiTalkService.flushMemoryJobs()`.
- Produces: `aiTalkService.interruptPendingMemoryJobs(errorCode = 'shutdown_interrupted')`, backed by `aiTalkStore.interruptPendingMemoryJobs(errorCode)`.
- Produces: `registerRuntimeAppLifecycle({ ..., aiTalkService })` shutdown participation.

- [ ] **Step 1: Add failing lifecycle tests**

Add tests that capture ordering, timeout, failure isolation, and single-quit behavior:

```js
const createLifecycleHarness = () => {
  const handlers = new Map()
  let quitCalls = 0
  return {
    app: { quit: () => { quitCalls += 1 } },
    dependencies: {
      appLogService: { record: () => {} },
      registerAppLifecycleLogs: ({ onBeforeQuit }) => handlers.set('before-quit', onBeforeQuit),
      safeRecordAppLog: () => {},
      triggerRuleRuntimeService: { stop: () => {} },
      systemCursorService: { dispose: async () => {} },
      getPluginService: () => ({ stopAllServices: async () => {} }),
      shutdownTimeoutMs: 100
    },
    emitBeforeQuit: () => handlers.get('before-quit')({ preventDefault: () => {} }),
    get quitCalls() { return quitCalls }
  }
}

test('runtime lifecycle disposes AI talk immediately and waits for memory jobs', async () => {
  const calls = []
  let releaseMemoryJobs
  const memoryJobs = new Promise((resolve) => { releaseMemoryJobs = resolve })
  const harness = createLifecycleHarness()

  registerRuntimeAppLifecycle({
    app: harness.app,
    ...harness.dependencies,
    aiTalkService: {
      dispose: () => calls.push('dispose'),
      flushMemoryJobs: () => memoryJobs,
      interruptPendingMemoryJobs: () => calls.push('interrupt')
    }
  })

  harness.emitBeforeQuit()
  assert.deepEqual(calls, ['dispose'])
  assert.equal(harness.quitCalls, 0)
  releaseMemoryJobs()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(harness.quitCalls, 1)
  assert.equal(calls.includes('interrupt'), false)
})

test('runtime lifecycle interrupts pending AI talk jobs after shutdown timeout', async () => {
  const calls = []
  const harness = createLifecycleHarness()
  registerRuntimeAppLifecycle({
    app: harness.app,
    ...harness.dependencies,
    aiTalkService: {
      dispose: () => calls.push('dispose'),
      flushMemoryJobs: () => new Promise(() => {}),
      interruptPendingMemoryJobs: () => calls.push('interrupt')
    },
    shutdownTimeoutMs: 5
  })

  harness.emitBeforeQuit()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(calls, ['dispose', 'interrupt'])
  assert.equal(harness.quitCalls, 1)
})
```

Add service/store tests proving `dispose()` is idempotent and persisted pending jobs become `interrupted` without overwriting terminal jobs.

- [ ] **Step 2: Run the new tests and verify red**

Run:

```bash
node --test tests/main/bootstrap-runtime-lifecycle.test.js tests/services/ai-talk-service.test.js tests/services/ai-talk-store.test.js
```

Expected: new tests fail because runtime lifecycle does not accept `aiTalkService` and interruption APIs do not exist.

- [ ] **Step 3: Implement store interruption and restart recovery**

In `ai-talk-store.js`, normalize old persisted `pending` jobs to:

```js
{
  ...job,
  status: 'interrupted',
  errorCode: 'process_restarted',
  updatedAt: now()
}
```

Expose an idempotent mutation:

```js
const interruptPendingMemoryJobs = (errorCode = 'shutdown_interrupted') => {
  const timestamp = now()
  let interruptedCount = 0
  for (const [id, job] of Object.entries(state.memoryJobs)) {
    if (job?.status !== 'pending') continue
    state.memoryJobs[id] = { ...job, status: 'interrupted', errorCode, updatedAt: timestamp }
    interruptedCount += 1
  }
  if (interruptedCount) persist()
  return { interruptedCount }
}
```

Persist normalized startup recovery once only when loaded state actually changed.

- [ ] **Step 4: Implement service and lifecycle cleanup**

Expose a service delegate:

```js
const interruptPendingMemoryJobs = (errorCode = 'shutdown_interrupted') => (
  typeof aiTalkStore.interruptPendingMemoryJobs === 'function'
    ? aiTalkStore.interruptPendingMemoryJobs(errorCode)
    : { interruptedCount: 0 }
)
```

Update runtime shutdown so `dispose()` runs synchronously before the promises are created, then include memory flushing in `runtimeShutdown`. If the timeout wins, invoke `interruptPendingMemoryJobs()` before `app.quit()`.

Pass `aiTalkService` from `create-openpet-runtime.js` into `registerRuntimeAppLifecycle()`.

- [ ] **Step 5: Run lifecycle tests green**

Run:

```bash
node --test tests/main/bootstrap-runtime-lifecycle.test.js tests/services/ai-talk-service.test.js tests/services/ai-talk-store.test.js
```

Expected: all tests pass with no unhandled rejection or timer warning.

- [ ] **Step 6: Commit Task 1**

```bash
git add tests/main/bootstrap-runtime-lifecycle.test.js tests/services/ai-talk-service.test.js tests/services/ai-talk-store.test.js src/main/bootstrap/runtime-lifecycle.js src/main/bootstrap/create-openpet-runtime.js src/main/services/ai-talk-service.js src/main/services/ai-talk-store.js
git commit -m "fix(ai-talk): close runtime shutdown lifecycle"
```

### Task 2: Bound AI Talk Persistence And Index Active Memories

**Files:**
- Modify: `tests/services/ai-talk-store.test.js`
- Modify: `src/main/services/ai-talk-store.js`

**Interfaces:**
- Produces constants `MAX_MESSAGES_PER_CONVERSATION = 400`, `MAX_MEMORY_JOBS = 200`, `MAX_ACTIVE_MEMORIES = 200`, and `MAX_INACTIVE_MEMORIES = 400`.
- Keeps all existing public store method signatures.
- Produces derived `activeMemoryIds` and `activeMemoryKeyIndex` structures internal to the store.

- [ ] **Step 1: Add failing retention tests**

Add deterministic tests with an injected clock:

```js
test('ai talk store retains the newest 400 messages with unique ids', () => {
  const store = createAiTalkStore({
    storePath: createTempStorePath(),
    now: () => '2026-07-15T00:00:00.000Z'
  })
  const { sessionId, conversationId } = store.ensureMainConversation({ petPackId: 'cat' })
  for (let index = 0; index < 450; index += 1) {
    store.appendMessages(sessionId, conversationId, [{ role: 'user', content: `message-${index}` }])
  }
  const messages = store.getMessages(sessionId, conversationId)
  assert.equal(messages.length, 400)
  assert.equal(messages[0].content, 'message-50')
  assert.equal(new Set(messages.map((message) => message.id)).size, 400)
})

test('ai talk store bounds memory jobs and prunes terminal jobs before pending jobs', () => {
  const store = createAiTalkStore({
    storePath: createTempStorePath(),
    now: () => '2026-07-15T00:00:00.000Z'
  })
  const pending = store.createMemoryJob({ petPackId: 'cat', conversationId: 'cat:main' })
  for (let index = 0; index < 220; index += 1) {
    const job = store.createMemoryJob({ petPackId: 'cat', conversationId: `cat:${index}` })
    store.finishMemoryJob(job.id, { status: 'completed' })
  }
  const jobs = Object.values(store.getState().memoryJobs)
  assert.equal(jobs.length, 200)
  assert.equal(jobs.some((job) => job.id === pending.id), true)
})
```

Add tests creating more than 400 inactive memories and proving active matching/listing remains correct after supersede, delete, clear, and reload.

- [ ] **Step 2: Run store tests and verify red**

Run:

```bash
node --test tests/services/ai-talk-store.test.js
```

Expected: retention assertions fail because messages, jobs, and inactive memories are not fully bounded.

- [ ] **Step 3: Implement message and job retention**

Normalize and append messages through one helper:

```js
const retainMessages = (messages) => normalizeMessages(messages).slice(-MAX_MESSAGES_PER_CONVERSATION)
```

Use collision-safe message IDs based on a persisted conversation sequence:

```js
const nextMessageSequence = Math.max(0, Number(conversation.messageSequence) || 0) + 1
const id = `${sessionId}:${conversationId}:message:${nextMessageSequence}`
```

Advance `messageSequence` for every appended or imported message, including messages later removed by retention.

Prune memory jobs after create/finish/interruption and during normalization. Sort terminal records oldest first for removal, then remove the oldest remaining records only if the absolute 200-record cap still requires it.

- [ ] **Step 4: Implement inactive-memory retention and indexes**

Create a stable key:

```js
const createActiveMemoryKey = (memory) => [
  memory.scope,
  memory.scope === 'petPack' ? memory.petPackId : '',
  normalizeMemoryTextKey(memory.text)
].join('\u0000')
```

Rebuild `activeMemoryIds` and `activeMemoryKeyIndex` after load, and update them through a single `setMemory(id, memory)` helper. Make `findActiveMemory()` use the key index and make `listMemories()` iterate `activeMemoryIds` only.

After active-memory demotion, retain only the newest 400 inactive records by `updatedAt`. Run all pruning before the mutation's single `persist()` call.

- [ ] **Step 5: Run store tests green and check persistence writes**

Run:

```bash
node --test tests/services/ai-talk-store.test.js
```

Expected: all store tests pass, including one-write-per-public-mutation assertions.

- [ ] **Step 6: Commit Task 2**

```bash
git add tests/services/ai-talk-store.test.js src/main/services/ai-talk-store.js
git commit -m "fix(ai-talk): bound persistent conversation state"
```

### Task 3: Share Complete And Streaming Turn Semantics

**Files:**
- Modify: `tests/services/ai-talk-service.test.js`
- Modify: `src/main/services/ai-talk-service.js`

**Interfaces:**
- Produces internal `prepareTurn({ message, messageBatch, entrypoint, requestId })`.
- Produces internal `finalizeSuccessfulTurn(turn, providerResult)`.
- Keeps public `chat()`, `streamChat()`, and result shapes unchanged.

- [ ] **Step 1: Add failing parity and trace tests**

Add a regression for batched complete requests:

```js
test('complete chat trace counts joined messageBatch characters', async () => {
  const store = createStore()
  const service = createAiTalkService({
    aiService: {
      getConfig: () => ({ enabled: true, behavior: { enabled: false }, memory: { enabled: false } }),
      complete: async () => ({ reply: 'received' })
    },
    aiTalkStore: store,
    petPackService: createPetPackService({ id: 'legacy-cat' })
  })
  await service.chat({ messageBatch: ['hello', 'world'], requestId: 'batch-1' })
  const trace = store.listTraces({ limit: 1 })[0]
  assert.equal(trace.messageChars, 'hello\nworld'.length)
})
```

Add complete/streaming parity tests that compare provider messages, tool definitions, assistant persistence, memory extraction scheduling, memory-use marking, bubble segments, and result metadata for equivalent successful turns.

- [ ] **Step 2: Run service tests and verify red**

Run:

```bash
node --test tests/services/ai-talk-service.test.js
```

Expected: the batched trace test reports `0` instead of `11`; the parity tests pass as a safety net for the following refactor.

- [ ] **Step 3: Extract `prepareTurn()` inside the service factory**

Return a data object containing:

```js
{
  config,
  manifest,
  petPackId,
  persona,
  personaHash,
  sessionId,
  conversationId,
  conversationPublicId,
  userContents,
  userMessages,
  history,
  memoryContext,
  memoryIdsInjected,
  recentPetActivity,
  messages,
  tools,
  diagnostics,
  traceContext
}
```

The helper validates input, resolves context, and appends only unresolved user messages. Provider invocation, streaming registry state, trace persistence, and logs stay in their current public methods.

- [ ] **Step 4: Extract `finalizeSuccessfulTurn()`**

The helper accepts the prepared turn plus `{ reply, behaviorIntent, providerLatencyMs }`, then returns:

```js
{
  reply,
  bubble,
  bubbleSegments,
  behaviorIntent,
  messages: nextMessages,
  memoryExtractionScheduled,
  behaviorDecisionScheduled,
  persistedMessageCount: nextMessages.length
}
```

It is the only success path that appends the assistant message, marks memory context used, and schedules memory extraction.

- [ ] **Step 5: Switch both public methods to the helpers**

Keep stream cancellation/failure state handling in `streamChat()` and complete failure logging in `chat()`. Build `messageChars` from `turn.userContents.join('\n').length` in both traces.

- [ ] **Step 6: Run service and IPC regressions green**

Run:

```bash
node --test tests/services/ai-talk-service.test.js tests/main/pet-chat-ipc.test.js
```

Expected: all tests pass; canceled/failed streaming tests still prove no assistant persistence, memory extraction, or behavior side effects.

- [ ] **Step 7: Commit Task 3**

```bash
git add tests/services/ai-talk-service.test.js src/main/services/ai-talk-service.js
git commit -m "refactor(ai-talk): unify turn orchestration"
```

### Task 4: Bound Bubble Preview, Complete Shared Contracts, And Align Documentation

**Files:**
- Modify: `tests/main/pet-bubble-chat-window.test.js`
- Modify: `tests/main/pet-bubble-chat-renderer.test.js`
- Modify: `tests/main/pet-chat-window.test.js`
- Create: `tests/control-center/defaults.test.js`
- Modify: `tests/control-center/demo-control-center-api.test.js`
- Modify: `src/main/pet-bubble-chat-window.js`
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/control-center/src/lib/defaults.ts`
- Modify: `src/control-center/src/api/demo-control-center-api.ts`
- Modify: `docs/ai-talk-streaming-cancel-development.md`
- Modify: `docs/superpowers/specs/2026-07-09-ai-talk-streaming-cancel-development-design.md`
- Modify: `docs/openpet-current-todo-architecture.md`

**Interfaces:**
- Produces `AiTalkStreamingStatus` and `AiTalkStreamingViewState` in shared contracts.
- Adds `streaming: AiTalkStreamingViewState | null` to `PetChatStateViewState`.
- Keeps runtime IPC payload fields unchanged; Bubble Chat receives only a 600-character `partialReply` preview.

- [ ] **Step 1: Add failing Bubble Chat preview tests**

```js
const fullReply = 'x'.repeat(900)
const longStreaming = manager.applyStreamState({
  requestId: 'stream-long',
  status: 'streaming',
  partialReply: fullReply,
  partialReplyChars: fullReply.length,
  chunkCount: 3,
  canCancel: true
})
assert.equal(longStreaming.streaming.partialReply.length, 600)
assert.equal(longStreaming.streaming.partialReplyChars, 900)
```

Insert this block into the existing `pet bubble chat manager tracks transient streaming state without persisting dialogue` test after its `manager` fixture is created.

Add a PetChatWindow regression proving the same 900-character payload is not reduced to 600 characters.

- [ ] **Step 2: Add failing shared-contract fixture tests**

Create `tests/control-center/defaults.test.js` to import `defaultPetChatState` and `clonePetChatState`, then verify the default is `null` and a populated streaming object is deep-cloned. Update `tests/control-center/demo-control-center-api.test.js` to assert the demo API returns `streaming: null`.

The populated fixture must include:

```ts
streaming: {
  requestId: 'stream-1',
  conversationId: 'control-center:cat:main',
  petPackId: 'cat',
  entrypoint: 'pet-chat',
  status: 'streaming',
  partialReply: 'Hello',
  partialReplyChars: 5,
  chunkCount: 1,
  canCancel: true,
  errorMessage: ''
}
```

- [ ] **Step 3: Run window/contract tests and verify red**

Run:

```bash
node --test tests/main/pet-bubble-chat-window.test.js tests/main/pet-bubble-chat-renderer.test.js tests/main/pet-chat-window.test.js
npm run build:control-center
```

Expected: Bubble Chat retains 900 characters and TypeScript fixtures fail until `streaming` is part of the shared state.

- [ ] **Step 4: Implement preview and shared types**

In `pet-bubble-chat-window.js`:

```js
const MAX_STREAM_PREVIEW_CHARS = 600
const fullPartialReply = String(payload.partialReply || '')
const partialReply = fullPartialReply.slice(-MAX_STREAM_PREVIEW_CHARS)
```

Preserve `partialReplyChars` from the payload, falling back to `fullPartialReply.length` rather than preview length.

Add the shared types from the design spec, add `streaming` to `PetChatStateViewState`, initialize it to `null` in `defaultPetChatState` and `createDemoPetChatState()`, and deep-clone populated streaming values in `clonePetChatState()`.

- [ ] **Step 5: Update active AI Talk documents**

Make the documents state:

- branch-neutral current architecture rather than obsolete `dev6`/commit baselines;
- application shutdown now disposes streams and settles/interrupts memory jobs;
- retention limits are 400 messages, 200 jobs, 200 active memories, and 400 inactive memories;
- progress logs use `ai-talk.stream.progress`, not per-delta events;
- hidden prompt and injected memory context stay out of ordinary renderers, while trusted Control Center may intentionally display compiled persona prompts and saved memory text;
- July 9 provider archives are historical evidence from before post-coalescing hardening;
- post-hardening real-provider desktop validation remains Manual-required.

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
npm run check:syntax
node --test tests/services/ai-service.test.js tests/services/ai-talk-service.test.js tests/services/ai-talk-store.test.js tests/main/pet-chat-ipc.test.js tests/main/pet-bubble-chat-window.test.js tests/main/pet-bubble-chat-renderer.test.js tests/main/pet-chat-window.test.js tests/main/pet-chat-renderer.test.js tests/main/bootstrap-runtime-lifecycle.test.js
npm run test:core:all
npm run test:control-center
npm run build:control-center
```

Expected: every command exits `0`; focused AI Talk tests report no failures; Control Center production build completes without type or bundle errors.

- [ ] **Step 7: Run final production review and fix blockers**

Collect review context:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/.codex/worktrees/454e/OpenPet
```

Review the complete diff from `89be25bf^` to `HEAD` plus critical associated paths. Fix every confirmed P0/P1/P2 issue with a failing regression test before the fix, then rerun the affected verification command.

- [ ] **Step 8: Commit Task 4**

```bash
git add tests/main/pet-bubble-chat-window.test.js tests/main/pet-bubble-chat-renderer.test.js tests/main/pet-chat-window.test.js tests/control-center/defaults.test.js tests/control-center/demo-control-center-api.test.js src/main/pet-bubble-chat-window.js src/shared/openpet-contracts.ts src/control-center/src/lib/defaults.ts src/control-center/src/api/demo-control-center-api.ts docs/ai-talk-streaming-cancel-development.md docs/superpowers/specs/2026-07-09-ai-talk-streaming-cancel-development-design.md docs/openpet-current-todo-architecture.md
git commit -m "fix(ai-talk): align streaming surfaces and contracts"
```

Do not stage `tmp/`, `dist/`, build output, or unrelated files.
