# Agent Awareness Visible Info Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first Phase B Agent Awareness information layer so sanitized runtime sessions can expose usage, git, and safe session-summary metadata through the existing store, smoke flow, and dashboard.

**Architecture:** Keep all Codex-specific parsing inside `examples/plugins/agent-awareness`. The rollout poller may inspect raw local metadata only long enough to derive safe bounded fields, then the runtime session store persists only sanitized usage, git, and summary objects. The dashboard reads the existing `/api/sessions` response and renders richer per-session facts without adding a new transport.

**Tech Stack:** Electron bundled runtime plugin, Node native test runner, dependency-free dashboard JavaScript, existing Agent Awareness smoke tooling.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/ef96/OpenPet` on branch `codex/dev7`.
- Keep the milestone scoped to Agent Awareness Phase B visible information foundation.
- `PetService` stays the single pet-state authority.
- Agent-specific parsing stays in the bundled plugin.
- Raw prompt bodies, model responses, tool arguments, tool outputs, terminal transcript, stdout/stderr mirroring, and full local paths remain out of scope.
- Store only bounded metadata: hashed session ids, redacted project labels, token/context/cost counts, safe git branch/dirty counts, and generated status summaries.
- Do not claim manual desktop acceptance or real-cost accounting completion.
- Use `apply_patch` for manual edits.

---

## File Structure

- Create: `examples/plugins/agent-awareness/service/usage-summary.js`
  - Normalize safe token/context/cost metadata from hook and rollout events.
- Create: `examples/plugins/agent-awareness/service/git-summary.js`
  - Derive bounded git branch/dirty/ahead/behind metadata from a local cwd without exposing paths.
- Modify: `examples/plugins/agent-awareness/service/runtime-session.js`
  - Preserve `usage`, `git`, and `summary` objects on sessions and history entries.
- Modify: `examples/plugins/agent-awareness/service/adapters/codex-rollout-poller.js`
  - Convert `token_count` metadata records and `turn_context` git metadata into safe runtime events.
- Modify: `examples/plugins/agent-awareness/service/adapters/codex-hook.js`
  - Accept bounded usage/git metadata from hook payloads when present.
- Modify: `examples/plugins/agent-awareness/service/agent-awareness-service.js`
  - Include usage totals in diagnostics for dashboard summary cards.
- Modify: `examples/plugins/agent-awareness/web/dashboard/dashboard.js`
  - Render usage, git, and session summary in each session card plus aggregate summary cards.
- Modify: `examples/plugins/agent-awareness/web/dashboard/styles.css`
  - Add compact metadata grid styling.
- Modify: `scripts/run-agent-awareness-local-smoke.js`
  - Preserve the richer sanitized session fields in smoke reports and redaction checks.
- Modify: `tests/examples/agent-awareness-plugin.test.js`
  - Cover safe usage/git/session-summary extraction and store merge behavior.
- Modify: `tests/examples/agent-awareness-dashboard.test.js`
  - Cover dashboard rendering of usage/git/session summary with redaction.
- Modify: `tests/scripts/mock-agent-awareness-flow.test.js`
  - Cover mock end-to-end data flow for usage/git/session summary.
- Modify: `docs/agent-awareness-development-design.md`
  - Update current status and Phase B claim boundary after implementation.
- Modify: `examples/plugins/agent-awareness/README.md`
  - Document the new visible information fields and privacy boundary.

## Task 1: Runtime Metadata Normalizers

**Files:**
- Create: `examples/plugins/agent-awareness/service/usage-summary.js`
- Create: `examples/plugins/agent-awareness/service/git-summary.js`
- Modify: `examples/plugins/agent-awareness/service/runtime-session.js`
- Test: `tests/examples/agent-awareness-plugin.test.js`

**Interfaces:**
- Consumes: raw event metadata objects from hook or rollout adapters.
- Produces:
  - `normalizeUsageSummary(value) -> { inputTokens, outputTokens, cachedInputTokens, totalTokens, contextWindow, contextUsedPercent, estimatedCostUsd, currency }`
  - `readGitSummary({ cwd, spawnSync }) -> { branch, dirty, dirtyCount, ahead, behind, repository }`
  - runtime session fields `usage`, `git`, and `summary`.

- [ ] **Step 1: Write failing tests for usage/git/session-summary persistence**

```js
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
  assert.equal(JSON.stringify(session).includes('/Users/mango'), false)
})
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `node --test tests/examples/agent-awareness-plugin.test.js --test-name-pattern "usage git|visible info"`

Expected: FAIL because runtime sessions do not preserve usage/git/summary.

- [ ] **Step 3: Implement bounded metadata normalizers and runtime merge**

Implement `normalizeUsageSummary`, `readGitSummary`, and merge the resulting objects in `createRuntimeSession`. Keep numbers finite, round `estimatedCostUsd` to six decimals, clamp context percent to `0..100`, and sanitize all strings with existing `sanitizeText`.

- [ ] **Step 4: Re-run the focused test**

Run: `node --test tests/examples/agent-awareness-plugin.test.js --test-name-pattern "usage git|visible info"`

Expected: PASS.

## Task 2: Poller And Hook Visible Info Extraction

**Files:**
- Modify: `examples/plugins/agent-awareness/service/adapters/codex-rollout-poller.js`
- Modify: `examples/plugins/agent-awareness/service/adapters/codex-hook.js`
- Modify: `examples/plugins/agent-awareness/service/agent-awareness-service.js`
- Test: `tests/examples/agent-awareness-plugin.test.js`

**Interfaces:**
- Consumes:
  - `normalizeUsageSummary(value)`
  - `readGitSummary({ cwd })`
- Produces:
  - `token_count` metadata events as `type: 'turn.usage'`
  - `turn_context` metadata events as `type: 'project.git'`
  - health diagnostics field `usageTotalTokens`.

- [ ] **Step 1: Write failing extraction tests**

```js
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
  assert.equal(events[2].git.branch, 'codex/dev7')
  assert.equal(JSON.stringify(events).includes('/Users/mango/private'), false)
})
```

- [ ] **Step 2: Run focused tests to verify RED**

Run: `node --test tests/examples/agent-awareness-plugin.test.js --test-name-pattern "usage and git|visible info|hook adapter"`

Expected: FAIL because adapters still ignore metadata-only records.

- [ ] **Step 3: Implement adapter extraction**

Add a `gitSummaryProvider` option to `inspectRolloutFile`, `readRolloutEvents`, and `createCodexRolloutPoller`. Convert `token_count` and `turn_context` into sanitized runtime events and update diagnostics so they are counted as derived events, not ignored metadata. Extend hook normalization to accept already-bounded `usage` and `git` payloads.

- [ ] **Step 4: Re-run focused backend tests**

Run: `node --test tests/examples/agent-awareness-plugin.test.js`

Expected: PASS.

## Task 3: Dashboard And Mock Smoke Visible Info

**Files:**
- Modify: `examples/plugins/agent-awareness/web/dashboard/dashboard.js`
- Modify: `examples/plugins/agent-awareness/web/dashboard/styles.css`
- Modify: `scripts/run-agent-awareness-local-smoke.js`
- Modify: `tests/examples/agent-awareness-dashboard.test.js`
- Modify: `tests/scripts/mock-agent-awareness-flow.test.js`

**Interfaces:**
- Consumes: `/api/sessions` sessions with `usage`, `git`, and `summary`.
- Produces: dashboard view model fields `usageText`, `gitText`, `summaryTitle`, and smoke report sessions that retain sanitized visible info.

- [ ] **Step 1: Write failing dashboard and mock-flow tests**

```js
test('dashboard renders safe usage git and summary metadata', () => {
  const runtime = createDashboardRuntime()
  const viewModel = runtime.buildDashboardViewModel({
    health: { ok: true, diagnostics: { totalEvents: 3, usageTotalTokens: 1500 } },
    sessionsPayload: {
      sessions: [{
        sessionId: 'abc123def456',
        project: 'OpenPet #111111',
        status: 'working',
        type: 'turn.usage',
        timestamp: '2026-07-07T00:00:00.000Z',
        usage: { totalTokens: 1500, contextWindow: 200000, contextUsedPercent: 0.75, estimatedCostUsd: 0.012345, currency: 'USD' },
        git: { branch: 'codex/dev7', dirty: true, dirtyCount: 2, ahead: 1, behind: 0 },
        summary: { title: 'OpenPet on codex/dev7', recentProgressHint: 'Working in OpenPet' }
      }]
    }
  })

  assert.match(viewModel.sessions[0].usageText, /1,500 tokens/)
  assert.match(viewModel.sessions[0].gitText, /codex\/dev7/)
  assert.match(viewModel.sessions[0].summaryTitle, /OpenPet on codex\/dev7/)
})
```

- [ ] **Step 2: Run dashboard and mock tests to verify RED**

Run: `node --test tests/examples/agent-awareness-dashboard.test.js tests/scripts/mock-agent-awareness-flow.test.js`

Expected: FAIL because the dashboard and mock flow do not surface visible info yet.

- [ ] **Step 3: Implement dashboard rendering and smoke preservation**

Render a compact session facts grid under each session header. Update smoke redaction checks to scan the richer sessions and keep reports free of raw paths, loopback URLs, and secrets.

- [ ] **Step 4: Re-run dashboard and mock tests**

Run: `node --test tests/examples/agent-awareness-dashboard.test.js tests/scripts/mock-agent-awareness-flow.test.js`

Expected: PASS.

## Task 4: Documentation And Milestone Verification

**Files:**
- Modify: `docs/agent-awareness-development-design.md`
- Modify: `examples/plugins/agent-awareness/README.md`
- Test: `package.json` scripts only.

**Interfaces:**
- Consumes: completed code from Tasks 1-3.
- Produces: updated live docs that mark Phase B visible info foundation as shipped while keeping Phase B/C broader items open.

- [ ] **Step 1: Update live docs**

Document that Phase B foundation now includes sanitized token/context/cost metadata, git branch/dirty summary, and safe generated session summaries. Keep multi-session slots, usage stats page, persona settings, and manual desktop acceptance as remaining TODO.

- [ ] **Step 2: Run milestone verification**

Run:

```bash
node --test tests/examples/agent-awareness-plugin.test.js tests/examples/agent-awareness-dashboard.test.js tests/scripts/mock-agent-awareness-flow.test.js tests/scripts/run-agent-awareness-local-smoke.test.js
npm run test:core
npm run check:syntax
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add examples/plugins/agent-awareness/service/usage-summary.js examples/plugins/agent-awareness/service/git-summary.js examples/plugins/agent-awareness/service/runtime-session.js examples/plugins/agent-awareness/service/adapters/codex-rollout-poller.js examples/plugins/agent-awareness/service/adapters/codex-hook.js examples/plugins/agent-awareness/service/agent-awareness-service.js examples/plugins/agent-awareness/web/dashboard/dashboard.js examples/plugins/agent-awareness/web/dashboard/styles.css scripts/run-agent-awareness-local-smoke.js tests/examples/agent-awareness-plugin.test.js tests/examples/agent-awareness-dashboard.test.js tests/scripts/mock-agent-awareness-flow.test.js docs/agent-awareness-development-design.md examples/plugins/agent-awareness/README.md docs/superpowers/plans/2026-07-07-agent-awareness-visible-info-foundation.md
git commit -m "feat(agent-awareness): add visible info foundation"
```

## Self-Review

- Spec coverage: This plan implements the Phase B foundation fields from the ClaudePet parity design: token/context/cost, git state, current project/session summary, recent progress hints, and per-session dashboard visibility. It does not implement Phase C companion presentation or content mirroring.
- Placeholder scan: no `TBD`, `TODO`, or deferred implementation placeholders are present.
- Type consistency: the same `usage`, `git`, and `summary` property names flow from adapters through runtime sessions, smoke reports, and dashboard view models.
