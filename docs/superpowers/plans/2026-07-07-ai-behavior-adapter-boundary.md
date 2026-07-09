# AI Behavior Adapter Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route AI Behavior Control Center IPC payloads through explicit main-process adapters so renderer-facing data stays stable and service-only fields do not leak.

**Architecture:** Add AI Behavior view normalizers to `src/main/control-center-adapters.js`, export them, inject them through `src/main/ipc.js`, and use them in `src/main/ipc/register-ai-ipc.js`. Leave `AI_BEHAVIOR_EXPORT_DIAGNOSTICS` as a string export and avoid changing `BehaviorOrchestratorService` semantics.

**Tech Stack:** Node.js CommonJS main process, TypeScript contract declarations in `src/shared/openpet-contracts.ts`, Node native test runner, existing Control Center adapter tests.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/ef96/OpenPet` on `codex/dev7`; do not edit `/Users/mango/project/codex/OpenPet`.
- Do not stage `.playwright-mcp/`.
- Use TDD: write failing tests before implementation.
- Do not change AI Behavior rule matching, cooldown, replay, or diagnostics-export semantics.
- Do not change Control Center UI copy or layout in this slice.
- Do not add real-provider, signing, packaged-app, or Windows evidence.

---

### Task 1: Adapter Tests

**Files:**
- Modify: `tests/main/control-center-adapters.test.js`

**Interfaces:**
- Consumes: planned exports `createAiBehaviorConfigView`, `createAiBehaviorResultView`, and `createAiBehaviorDecisionListView`.
- Produces: failing tests that define renderer-safe AI Behavior payload shapes.

- [ ] **Step 1: Add missing imports**

Add these names to the destructuring import from `../../src/main/control-center-adapters`:

```js
  createAiBehaviorConfigView,
  createAiBehaviorDecisionListView,
  createAiBehaviorResultView,
```

- [ ] **Step 2: Add failing adapter tests**

Add this test after the existing AI config adapter test:

```js
test('AI behavior adapters normalize config, decisions, and results for Control Center', () => {
  const config = createAiBehaviorConfigView({
    enabled: 1,
    useTools: '',
    cooldownMs: '2500',
    rules: [{
      id: '',
      enabled: false,
      priority: '7',
      when: {
        intent: 'wave',
        minConfidence: '0.6',
        contains: ['hello', 42],
        actionKind: 'gesture',
        raw: 'ignore-me'
      },
      then: {
        type: 'playAction',
        text: 99,
        actionId: 'wave',
        event: null,
        message: 'ok',
        internal: 'ignore-me'
      },
      serviceOnly: 'ignore-me'
    }, 'bad-rule'],
    decisions: [{
      id: '9',
      timestamp: '2026-07-07T00:00:00.000Z',
      matched: 1,
      type: 'playAction',
      ruleId: 'rule-wave',
      reason: 'matched',
      actionId: 'wave',
      label: 7,
      kind: 'gesture',
      event: null,
      intent: 'wave',
      providerReason: 42,
      displayMode: 'bubble',
      inputSummary: 'reply:5 chars',
      cooldown: '',
      fallback: 'yes',
      blockedReason: null,
      replay: {
        reply: 'hello',
        behaviorIntent: {
          intent: 'wave',
          actionId: 'wave',
          bubbleText: 'hi',
          confidence: '0.75',
          reason: 'provider says wave',
          displayMode: 'bubble',
          secretValue: 'sk-hidden'
        },
        rawProviderPayload: 'ignore-me'
      },
      rawProviderPayload: 'ignore-me'
    }],
    secretValue: 'sk-hidden'
  })

  assert.deepEqual(config, {
    enabled: true,
    useTools: false,
    cooldownMs: 2500,
    rules: [{
      id: 'rule-1',
      enabled: false,
      priority: 7,
      when: {
        intent: 'wave',
        minConfidence: 0.6,
        contains: ['hello'],
        actionKind: 'gesture'
      },
      then: {
        type: 'playAction',
        text: '',
        actionId: 'wave',
        event: '',
        message: 'ok'
      }
    }],
    decisions: [{
      id: 9,
      timestamp: '2026-07-07T00:00:00.000Z',
      matched: true,
      type: 'playAction',
      ruleId: 'rule-wave',
      reason: 'matched',
      actionId: 'wave',
      label: '',
      kind: 'gesture',
      event: '',
      intent: 'wave',
      displayMode: 'bubble',
      inputSummary: 'reply:5 chars',
      cooldown: false,
      fallback: true,
      blockedReason: '',
      replay: {
        reply: 'hello',
        behaviorIntent: {
          intent: 'wave',
          actionId: 'wave',
          bubbleText: 'hi',
          confidence: 0.75,
          reason: 'provider says wave',
          displayMode: 'bubble'
        }
      }
    }]
  })

  assert.deepEqual(createAiBehaviorResultView({
    matched: 1,
    reason: 'matched',
    type: 'playAction',
    ruleId: 8,
    actionId: 'wave',
    label: 'Wave',
    kind: null,
    event: 'done',
    intent: 'wave',
    providerReason: 7,
    displayMode: 'action',
    cooldown: '',
    fallback: 'yes',
    blockedReason: null,
    replayOf: '9',
    raw: 'ignore-me'
  }), {
    matched: true,
    reason: 'matched',
    type: 'playAction',
    ruleId: '',
    actionId: 'wave',
    label: 'Wave',
    kind: '',
    event: 'done',
    intent: 'wave',
    displayMode: 'action',
    cooldown: false,
    fallback: true,
    blockedReason: '',
    replayOf: 9
  })

  assert.deepEqual(createAiBehaviorDecisionListView([{ id: '2', matched: 0, reason: 'cleared' }, 'bad']), [{
    id: 2,
    timestamp: '',
    matched: false,
    type: '',
    ruleId: '',
    reason: 'cleared',
    actionId: '',
    label: '',
    kind: '',
    event: '',
    intent: '',
    inputSummary: '',
    cooldown: false,
    fallback: false,
    blockedReason: '',
    replay: {
      reply: '',
      behaviorIntent: null
    }
  }])
})
```

- [ ] **Step 3: Verify RED**

Run:

```bash
node --test tests/main/control-center-adapters.test.js
```

Expected: FAIL because `createAiBehaviorConfigView`, `createAiBehaviorResultView`, and `createAiBehaviorDecisionListView` are not exported yet.

### Task 2: IPC Registration Tests

**Files:**
- Modify: `tests/main/ipc-registration-groups.test.js`

**Interfaces:**
- Consumes: injected adapter functions in `registerAiIpc`.
- Produces: failing test coverage proving AI Behavior handlers call adapters.

- [ ] **Step 1: Update the registerAiIpc test doubles**

In `registerAiIpc wires AI config, behavior, and chat-adjacent handlers`, add an array:

```js
  const behaviorAdapterCalls = []
```

Inject these adapter functions:

```js
    createAiBehaviorConfigView: (config) => {
      behaviorAdapterCalls.push(['config', config])
      return { kind: 'behavior-config', config }
    },
    createAiBehaviorResultView: (result) => {
      behaviorAdapterCalls.push(['result', result])
      return { kind: 'behavior-result', result }
    },
    createAiBehaviorDecisionListView: (decisions) => {
      behaviorAdapterCalls.push(['decisions', decisions])
      return { kind: 'behavior-decisions', decisions }
    }
```

- [ ] **Step 2: Assert behavior handlers use adapters**

After the existing `dryRun` call, add:

```js
  const behaviorConfig = await ipcMain.handlers.get(IPC.AI_BEHAVIOR_GET)()
  const savedBehavior = await ipcMain.handlers.get(IPC.AI_BEHAVIOR_SAVE)(null, { enabled: false })
  const replay = await ipcMain.handlers.get(IPC.AI_BEHAVIOR_REPLAY_DECISION)(null, { decisionId: 7 })
  const cleared = await ipcMain.handlers.get(IPC.AI_BEHAVIOR_CLEAR_DECISIONS)()
  const exported = await ipcMain.handlers.get(IPC.AI_BEHAVIOR_EXPORT_DIAGNOSTICS)()

  assert.deepEqual(dryRun, { kind: 'behavior-result', result: { matched: false } })
  assert.deepEqual(behaviorConfig, { kind: 'behavior-config', config: { enabled: true, decisions: [{ id: 'd1' }] } })
  assert.deepEqual(savedBehavior, { kind: 'behavior-config', config: { enabled: false } })
  assert.deepEqual(replay, { kind: 'behavior-result', result: { decisionId: 7, actions: [{ id: 'wave' }] } })
  assert.deepEqual(cleared, { kind: 'behavior-decisions', decisions: { ok: true } })
  assert.deepEqual(exported, { ok: true })
  assert.deepEqual(behaviorAdapterCalls, [
    ['result', { matched: false }],
    ['config', { enabled: true, decisions: [{ id: 'd1' }] }],
    ['config', { enabled: false }],
    ['result', { decisionId: 7, actions: [{ id: 'wave' }] }],
    ['decisions', { ok: true }]
  ])
```

- [ ] **Step 3: Verify RED**

Run:

```bash
node --test tests/main/ipc-registration-groups.test.js
```

Expected: FAIL because `registerAiIpc` does not consume the new injected adapter functions yet.

### Task 3: Adapter Implementation And Wiring

**Files:**
- Modify: `src/main/control-center-adapters.js`
- Modify: `src/main/ipc/register-ai-ipc.js`
- Modify: `src/main/ipc.js`

**Interfaces:**
- Consumes: failing tests from Tasks 1 and 2.
- Produces: exported AI Behavior adapters and IPC wiring.

- [ ] **Step 1: Implement adapters in `src/main/control-center-adapters.js`**

Add helper sets and functions near the existing AI adapter block:

```js
const AI_BEHAVIOR_RULE_ACTION_TYPES = new Set(['say', 'playAction', 'setEvent'])
const AI_BEHAVIOR_DISPLAY_MODES = new Set(['none', 'bubble', 'action', 'event'])

const createAiBehaviorIntentView = (intent) => {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return null
  const input = toRecord(intent)
  return {
    label: typeof input.label === 'string' ? input.label : '',
    kind: typeof input.kind === 'string' ? input.kind : '',
    actionId: typeof input.actionId === 'string' ? input.actionId : '',
    bubbleText: typeof input.bubbleText === 'string' ? input.bubbleText : '',
    reason: typeof input.reason === 'string' ? input.reason : '',
    displayMode: typeof input.displayMode === 'string' && AI_BEHAVIOR_DISPLAY_MODES.has(input.displayMode) ? input.displayMode : 'none',
    intent: typeof input.intent === 'string' ? input.intent : '',
    confidence: toFiniteNumber(input.confidence)
  }
}
```

Then implement rule, decision, result, and list adapters matching the test expectations.

- [ ] **Step 2: Export adapters**

Add to `module.exports`:

```js
  createAiBehaviorConfigView,
  createAiBehaviorDecisionListView,
  createAiBehaviorResultView,
```

- [ ] **Step 3: Wire `register-ai-ipc.js`**

Add destructured dependencies:

```js
  createAiBehaviorConfigView,
  createAiBehaviorResultView,
  createAiBehaviorDecisionListView,
```

Wrap AI Behavior handlers:

```js
  ipcMainService.handle(IPC.AI_BEHAVIOR_GET, () => createAiBehaviorConfigView(behaviorOrchestratorService.getConfig()))
  ipcMainService.handle(IPC.AI_BEHAVIOR_SAVE, (_event, payload) => createAiBehaviorConfigView(behaviorOrchestratorService.saveConfig(payload)))
  ipcMainService.handle(IPC.AI_BEHAVIOR_DRY_RUN, (_event, payload) => (
    createAiBehaviorResultView(behaviorOrchestratorService.dryRun({
      ...payload,
      actions: petService.getAnimations()?.actions || []
    }))
  ))
  ipcMainService.handle(IPC.AI_BEHAVIOR_REPLAY_DECISION, (_event, payload) => (
    createAiBehaviorResultView(behaviorOrchestratorService.replayDecision({
      decisionId: payload?.decisionId,
      actions: petService.getAnimations()?.actions || []
    }))
  ))
  ipcMainService.handle(IPC.AI_BEHAVIOR_CLEAR_DECISIONS, () => (
    createAiBehaviorDecisionListView(behaviorOrchestratorService.clearDecisions())
  ))
```

Leave `AI_BEHAVIOR_EXPORT_DIAGNOSTICS` unchanged.

- [ ] **Step 4: Wire `src/main/ipc.js` injection**

Import/destructure the new adapter functions and pass them into `registerAiIpc`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --test tests/main/control-center-adapters.test.js tests/main/ipc-registration-groups.test.js
```

Expected: PASS.

### Task 4: Verification And Commit

**Files:**
- Review: `src/main/control-center-adapters.js`
- Review: `src/main/ipc/register-ai-ipc.js`
- Review: `src/main/ipc.js`
- Review: `tests/main/control-center-adapters.test.js`
- Review: `tests/main/ipc-registration-groups.test.js`
- Review: `docs/superpowers/specs/2026-07-07-ai-behavior-adapter-boundary-design.md`
- Review: `docs/superpowers/plans/2026-07-07-ai-behavior-adapter-boundary.md`

**Interfaces:**
- Consumes: green targeted tests.
- Produces: verified and committed AI Behavior adapter boundary slice.

- [ ] **Step 1: Run required verification**

Run:

```bash
node --test tests/main/control-center-adapters.test.js tests/main/ipc-registration-groups.test.js
npm run test:core
npm run typecheck -- --pretty false
```

Expected: all commands PASS.

- [ ] **Step 2: Review diff**

Run:

```bash
git diff -- src/main/control-center-adapters.js src/main/ipc/register-ai-ipc.js src/main/ipc.js tests/main/control-center-adapters.test.js tests/main/ipc-registration-groups.test.js docs/superpowers/specs/2026-07-07-ai-behavior-adapter-boundary-design.md docs/superpowers/plans/2026-07-07-ai-behavior-adapter-boundary.md
```

Check:

```markdown
- no AI Behavior service semantic changes
- no diagnostics export shape change
- no UI changes
- adapter strips unknown/raw fields
- `.playwright-mcp/` remains untracked and unstaged
```

- [ ] **Step 3: Commit**

Run:

```bash
git add src/main/control-center-adapters.js src/main/ipc/register-ai-ipc.js src/main/ipc.js tests/main/control-center-adapters.test.js tests/main/ipc-registration-groups.test.js docs/superpowers/plans/2026-07-07-ai-behavior-adapter-boundary.md
git commit -m "fix(ai): normalize behavior ipc payloads"
```

Expected: commit succeeds.
