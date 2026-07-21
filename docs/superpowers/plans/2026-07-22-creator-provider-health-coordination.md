# Creator Provider Health Coordination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent transient `/models` latency and duplicate health probes from falsely blocking Creator generation.

**Architecture:** Keep coordination in `createCreatorWorkflowService`, the owner shared by Creator `getState()` and generation preflight. Add configuration-keyed successful cache, same-key in-flight promise reuse, a ten-second default probe deadline, and an injected clock for expiry tests. The image service remains the owner of HTTP cancellation and response parsing.

**Tech Stack:** Node.js CommonJS service, Node native test runner, existing Creator Workflow service fixtures.

## Global Constraints

- Increase the default Creator health deadline from 3000 ms to 10000 ms.
- Cache only successful Creator health results for 30000 ms.
- Concurrent calls for the same Provider configuration share one in-flight health promise.
- A configuration-key change bypasses and replaces the prior key's cached result.
- Saving or clearing Provider settings or credentials changes a main-process-only health-cache revision, so a replacement key cannot reuse success associated with the same `apiKeyRef`.
- Health failures and timeouts are never cached as success.
- The real image generation request remains authoritative after preflight.
- Do not change Creator Studio Service readiness or expose secrets.

### Task 1: Add failing health-coordination tests

**Files:**
- Modify: `tests/services/creator-workflow-service.test.js`

**Interfaces:**
- `createCreatorWorkflowService` will accept an injected `nowMs` clock for deterministic cache expiry.
- The service will call `imageGenerationModelService.checkHealth({ timeoutMs: 10000 })` by default.

- [ ] **Step 1: Add a reusable service fixture helper**

Create a local helper near the existing service fixtures that returns a minimal Creator service with a configurable `checkHealth`, `getConfig`, plugin, actions, and reference service. Keep the existing tests unchanged.

- [ ] **Step 2: Add the failing concurrency/cache tests**

Add tests with these exact assertions:

```js
test('creator health checks coalesce concurrent getState calls', async () => {
  let resolveHealth
  let calls = 0
  const health = new Promise((resolve) => { resolveHealth = resolve })
  const service = createHealthCoordinationFixture({
    checkHealth: () => { calls += 1; return health }
  })
  const first = service.getState()
  const second = service.getState()
  assert.equal(calls, 1)
  resolveHealth({ ok: true, code: 'provider_healthy', message: 'ready' })
  assert.equal((await first).provider.ready, true)
  assert.equal((await second).provider.ready, true)
})

test('creator reuses a recent successful health result for generation preflight', async () => {
  let calls = 0
  const service = createHealthCoordinationFixture({
    checkHealth: async () => { calls += 1; return { ok: true, code: 'provider_healthy', message: 'ready' } },
    runCommand: async (_pluginId, commandId) => ({ result: { run: { runId: 'run-health', taskStatus: commandId === 'draft-task' ? 'ready_for_confirmation' : 'confirmed' } } })
  })
  await service.getState()
  await service.generateExistingAction({ actionName: 'spin', motionPrompt: 'spin' })
  assert.equal(calls, 1)
})

test('creator health cache expires and configuration changes invalidate it', async () => {
  let now = 1000
  let model = 'gpt-image-2'
  let calls = 0
  const service = createHealthCoordinationFixture({
    nowMs: () => now,
    getConfig: () => ({ provider: 'openai-compatible', baseUrl: 'https://images.example.test/v1', model }),
    checkHealth: async () => { calls += 1; return { ok: true, code: 'provider_healthy', message: 'ready' } }
  })
  await service.getState()
  now += 29999
  await service.getState()
  model = 'gpt-image-1.5'
  await service.getState()
  now += 30000
  await service.getState()
  assert.equal(calls, 3)
})

test('creator does not cache a health timeout as a successful result', async () => {
  let calls = 0
  const service = createHealthCoordinationFixture({
    checkHealth: async () => { calls += 1; return { ok: false, code: 'health_check_timeout', message: 'timed out' } }
  })
  assert.equal((await service.getState()).provider.ready, false)
  assert.equal((await service.getState()).provider.ready, false)
  assert.equal(calls, 2)
})
```

- [ ] **Step 3: Run the new tests and verify they fail**

Run: `node --test tests/services/creator-workflow-service.test.js`

Expected: the concurrency test observes two calls, the reuse test observes more than one call, expiry/configuration assertions fail, and the default timeout assertion is not yet present in production behavior.

### Task 2: Implement keyed health coordination

**Files:**
- Modify: `src/main/services/creator-workflow-service.js:25,1770-1855`

**Interfaces:**
- Add `CREATOR_PROVIDER_HEALTH_CACHE_TTL_MS = 30000`.
- Add optional `nowMs = () => Date.now()` to the service factory.
- Preserve `providerHealthTimeoutMs` as an explicit test/runtime override; default it to 10000.

- [ ] **Step 1: Add configuration-key and cache state helpers**

Use a stable key over non-secret Provider configuration fields:

```js
const createProviderHealthKey = (config = {}) => JSON.stringify([
  normalizeText(config.provider),
  normalizeText(config.baseUrl).replace(/\/+$/, ''),
  normalizeText(config.model),
  normalizeText(config.apiKeyRef),
  normalizeText(config.organization),
  normalizeText(config.project)
])
```

Append the image-generation service's main-process-only health-cache revision to this key. Increment that revision only after successful Provider settings, key-save, or key-clear mutations. Do not expose the credential value or a secret-derived fingerprint in renderer configuration.

Keep `providerHealthCache = null` and `providerHealthInFlight = null` inside the service closure.

- [ ] **Step 2: Replace `getProviderHealth` with coalescing logic**

The method must:

1. Read the current config and key.
2. Return a matching unexpired successful cache result.
3. Return the matching in-flight promise when present.
4. Start one bounded `checkHealth({ timeoutMs: providerHealthTimeoutMs })` call otherwise.
5. Convert exceptions to `{ ok: false, code, message }` as today.
6. Cache only `result.ok === true` until `nowMs() + 30000` and only if the configuration key is still current.
7. Clear the installed in-flight record in `finally` without clearing a newer record.

The existing outer `withTimeout` remains the watchdog for non-conforming service implementations. Keep the passed timeout at 10000 ms by default; explicit small test overrides remain supported.

- [ ] **Step 3: Run the focused service tests**

Run: `node --test tests/services/creator-workflow-service.test.js`

Expected: all existing Creator Workflow tests and the new coordination tests pass.

### Task 3: Add timeout contract regression

**Files:**
- Modify: `tests/services/creator-workflow-service.test.js`

- [ ] **Step 1: Assert the widened default timeout**

Use a `checkHealth` stub that records options and resolves healthy. Call `service.getState()` without an override and assert `options.timeoutMs === 10000`.

- [ ] **Step 2: Verify the timeout test**

Run: `node --test tests/services/creator-workflow-service.test.js`

Expected: the assertion passes with the new default and existing `providerHealthTimeoutMs: 20` bounded-stall test remains green.

### Task 4: Full verification and commit

**Files:**
- No additional production files.

- [ ] **Step 1: Run syntax, typecheck, and build**

Run: `npm run check:syntax`.

- [ ] **Step 2: Run focused regressions**

Run: `node --test tests/services/creator-workflow-service.test.js tests/services/image-generation-model-service.test.js`.

- [ ] **Step 3: Run Control Center regression**

Run: `npm run test:control-center`.

- [ ] **Step 4: Inspect diff and commit**

Run `git diff --check`, confirm no secrets or generated files changed, then:

```bash
git add src/main/services/creator-workflow-service.js tests/services/creator-workflow-service.test.js
git commit -m "fix: coalesce creator provider health checks"
```
