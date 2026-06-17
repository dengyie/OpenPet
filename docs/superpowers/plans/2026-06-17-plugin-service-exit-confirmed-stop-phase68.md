# Plugin Service Exit-Confirmed Stop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make declaration-only plugin service stop state and logs reflect confirmed child-process exit instead of only a stop signal attempt.

**Architecture:** Keep `PluginService` as the single owner of declaration-only service runtime state, shutdown intent, and operator-facing logs. Tighten the existing service stop path so `stopping` becomes the visible intermediate truth, while final `stopped` only arrives from the child `exit` callback.

**Tech Stack:** Electron main process, CommonJS Node services, Node child-process lifecycle handling, Node native test runner, production-code-quality-review workflow.

---

## File Map

- Modify: `src/main/services/plugin-service.js`
  Purpose: keep declaration-only service stop requests in `stopping`, split stop-request logging from exit-confirmed completion logging, and preserve the existing process-group-first cleanup order.
- Modify: `tests/services/plugin-service.test.js`
  Purpose: add deterministic lifecycle coverage for explicit stop, disable cleanup, process-group success, child fallback, duplicate-start protection while stopping, and exit-confirmed completion logging.
- Create: `docs/phases/phase-68-plugin-service-exit-confirmed-stop.md`
  Purpose: record the delivered scope, behavior change, validation, and remaining cleanup limits.
- Create: `docs/reviews/phase-68-plugin-service-exit-confirmed-stop-review.md`
  Purpose: record production review findings and merge recommendation.
- Modify: `docs/HANDOFF.md`
  Purpose: refresh the current extension runtime truth for service stop semantics.
- Modify: `docs/development-summary.md`
  Purpose: update the short engineering summary with exit-confirmed service stop wording.
- Modify: `docs/project-status-review.md`
  Purpose: reflect the narrower service lifecycle truth in the current platform snapshot.
- Modify: `docs/project-context.json`
  Purpose: update machine-readable facts and validation baseline.
- Modify: `docs/productization-v1.1-todo-design.md`
  Purpose: add Phase 68 to the execution design and sequence.
- Modify: `docs/project-review-todo-design.md`
  Purpose: add Phase 68 to the consolidated whole-project review/TODO design.
- Modify: `docs/plugin-development.md`
  Purpose: keep plugin runtime stop semantics honest for extension authors.
- Modify: `docs/plugin-ecosystem-rules.md`
  Purpose: keep ecosystem support wording aligned with the host’s confirmed-stop boundary.

## Task 1: Write failing tests for exit-confirmed service stop

**Files:**
- Modify: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Convert the declaration-only service happy-path test to assert `stopping` before exit**

Update the existing service lifecycle test so the stop call no longer expects immediate terminal completion:

```js
const stopped = service.stopService('weather-declaration', 'companion')

assert.equal(stopped.runtime.status, 'stopping')
assert.deepEqual(children[0].killCalls, ['SIGTERM'])
assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopping')
assert.equal(settingsService.get().plugins.logs[0].message, 'Service stop requested')
children[0].emit('exit', 0, 'SIGTERM')
assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopped')
assert.equal(settingsService.get().plugins.logs[0].message, 'Service stopped')
```

- [ ] **Step 2: Add a dedicated test that duplicate starts stay blocked while the service is `stopping`**

Add:

```js
test('plugin service keeps services in stopping state until the child exits', () => {
  const child = createSlowStoppingServiceProcess()
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: () => child
  })

  service.startService('weather-declaration', 'companion')
  const stopping = service.stopService('weather-declaration', 'companion')

  assert.equal(stopping.runtime.status, 'stopping')
  assert.deepEqual(child.killCalls, ['SIGTERM'])
  assert.equal(settingsService.get().plugins.logs[0].message, 'Service stop requested')
  assert.throws(
    () => service.startService('weather-declaration', 'companion'),
    /Plugin service is already running/
  )

  child.emit('exit', 0, 'SIGTERM')

  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopped')
  assert.equal(settingsService.get().plugins.logs[0].message, 'Service stopped')
})
```

- [ ] **Step 3: Add a logging test that proves completion is only logged after exit confirmation**

Add:

```js
test('plugin service stop completion is logged after exit confirmation', () => {
  const child = createSlowStoppingServiceProcess()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: () => child
  })

  service.startService('weather-declaration', 'companion')
  service.stopService('weather-declaration', 'companion')

  assert.notEqual(service.getLogs()[0].message, 'Service stopped')
  child.emit('exit', 0, 'SIGTERM')

  assert.equal(service.getLogs()[0].message, 'Service stopped')
})
```

- [ ] **Step 4: Keep process-group success, child fallback, and disable cleanup on the same non-terminal stop contract**

Update the existing tests so they all assert `stopping` after the stop attempt but before `exit`:

```js
assert.equal(stopped.runtime.status, 'stopping')
assert.deepEqual(killedProcesses, [{ pid: -4321, signal: 'SIGTERM' }])
assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopping')
```

and:

```js
service.setEnabled('weather-declaration', false)

assert.deepEqual(child.killCalls, ['SIGTERM'])
assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopping')
child.emit('exit', 0, 'SIGTERM')
assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopped')
```

- [ ] **Step 5: Run targeted tests and verify RED**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service starts and stops enabled declaration service entries|plugin service stops service process groups before falling back to child kill|plugin service falls back to child kill when process group stop fails|plugin service stops running services when a plugin is disabled|plugin service keeps services in stopping state until the child exits|plugin service stop completion is logged after exit confirmation"
```

Expected before implementation:

- FAIL because `stopService()` still reports `stopped` too early;
- logs still imply final stop completion before exit confirmation;
- duplicate-start protection while `stopping` is not yet enforced by the runtime truth.

## Task 2: Implement exit-confirmed stop semantics in `PluginService`

**Files:**
- Modify: `src/main/services/plugin-service.js`

- [ ] **Step 1: Make `stopPluginServiceRuntime()` record stop intent instead of immediate completion**

Update the stop helper around the service cleanup boundary:

```js
const stopPluginServiceRuntime = (pluginId, serviceId, runtime, { log = true } = {}) => {
  if (!runtime || runtime.status !== 'running') return runtime
  runtime.status = 'stopping'
  runtime.stoppedAt = new Date().toISOString()
  runtime.error = ''
  let stopped = false
  try {
    stopServiceProcess(runtime, 'SIGTERM')
    stopped = true
  } catch (error) {
    runtime.error = error.message || 'Plugin service stop failed'
    runtime.status = 'failed'
  }
  if (log) {
    appendLog({
      pluginId,
      commandId: `service:${serviceId}`,
      level: stopped ? 'info' : 'error',
      message: stopped ? 'Service stop requested' : 'Service stop failed'
    })
  }
  return runtime
}
```

The Phase 68 version should keep the existing process-group `SIGTERM` path first and direct-child fallback second. Do not add force-stop timers, retry loops, or new cleanup paths here.

- [ ] **Step 2: Finalize requested-stop services only from the child `exit` handler**

Update the service child `exit` handling so requested stops and natural exits stay distinct:

```js
const stoppedByRequest = runtime.status === 'stopping'

if (runtime.status === 'stopping') {
  runtime.status = (Number.isFinite(Number(code)) && Number(code) !== 0 && !signal)
    ? 'failed'
    : 'stopped'
} else if (runtime.status === 'running') {
  runtime.status = code === 0 && !signal ? 'exited' : 'failed'
}

runtime.exitCode = Number.isFinite(Number(code)) ? Number(code) : null
runtime.signal = signal || ''
runtime.child = null
runtime.stoppedAt = runtime.stoppedAt || new Date().toISOString()

if (stoppedByRequest) {
  appendLog({
    pluginId,
    commandId,
    level: runtime.status === 'failed' ? 'error' : 'info',
    message: runtime.status === 'stopped' ? 'Service stopped' : 'Service exited'
  })
} else {
  appendLog({
    pluginId,
    commandId,
    level: runtime.status === 'failed' ? 'error' : 'info',
    message: 'Service exited'
  })
}
```

- [ ] **Step 3: Preserve duplicate-start protection while `stopping`**

Ensure the runtime activity guard continues to treat `stopping` as active. The Phase 68 implementation should keep:

```js
const ACTIVE_SERVICE_STATUSES = new Set(['running', 'stopping'])
```

and the existing `startService()` duplicate-start rejection should continue to rely on that active-state check.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service starts and stops enabled declaration service entries|plugin service stops service process groups before falling back to child kill|plugin service falls back to child kill when process group stop fails|plugin service stops running services when a plugin is disabled|plugin service keeps services in stopping state until the child exits|plugin service stop completion is logged after exit confirmation"
```

Expected:

- PASS with explicit stop, disable cleanup, and process-group fallback all staying `stopping` until `exit`;
- PASS with final `Service stopped` logging only after exit confirmation.

## Task 3: Record the phase and refresh live docs

**Files:**
- Create: `docs/phases/phase-68-plugin-service-exit-confirmed-stop.md`
- Create: `docs/reviews/phase-68-plugin-service-exit-confirmed-stop-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-review-todo-design.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/plugin-ecosystem-rules.md`

- [ ] **Step 1: Run production review context collection**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

- [ ] **Step 2: Write the phase record with the exact Phase 68 boundary**

Capture these points in `docs/phases/phase-68-plugin-service-exit-confirmed-stop.md`:

```md
- `stopService()` now returns `stopping` until the child emits `exit`;
- the latest log reads `Service stop requested` during the shutdown window;
- only the later exit callback can transition the runtime to `stopped`;
- disable cleanup and app-shutdown cleanup continue to use the same stop path.
```

- [ ] **Step 3: Write the review note with no overclaiming**

Record that:

```md
- requested stops no longer claim completion before the child exits;
- duplicate starts remain blocked while a service is still `stopping`;
- hard descendant termination, repeated retries, and `SIGKILL` escalation remain out of scope.
```

- [ ] **Step 4: Update live docs conservatively**

Refresh the handoff/current-state docs so they describe:

```md
declaration-only service entries now stay `stopping` until child exit confirmation, and service logs distinguish stop intent from confirmed stop completion while hard descendant termination remains future work.
```

Do not claim:

- setup cleanup changes;
- declaration-command cleanup changes;
- force-stop escalation;
- universal descendant termination guarantees.

## Task 4: Full verification and atomic commit

**Files:**
- All changed files

- [ ] **Step 1: Run complete verification**

Run:

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected:

- all Node tests pass;
- Control Center regression passes;
- docs machine-readable context remains valid JSON;
- no whitespace or patch-formatting regressions remain.

- [ ] **Step 2: Commit the Phase 68 slice atomically**

Run:

```bash
git add src/main/services/plugin-service.js tests/services/plugin-service.test.js docs/phases/phase-68-plugin-service-exit-confirmed-stop.md docs/reviews/phase-68-plugin-service-exit-confirmed-stop-review.md docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/project-context.json docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md docs/plugin-development.md docs/plugin-ecosystem-rules.md docs/superpowers/plans/2026-06-17-plugin-service-exit-confirmed-stop-phase68.md
git commit -m "feat(阶段68): confirm plugin service stop on exit"
```

If a matching Phase 68 spec file also exists in the branch during implementation, stage it in the same commit. Do not fold later-phase force-stop or process-tree work into this commit.
