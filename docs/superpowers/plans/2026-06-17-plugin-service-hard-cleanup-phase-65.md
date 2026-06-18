# Plugin Service Hard Cleanup Phase 65 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden plugin service stop semantics so `entries.services` stay in `stopping` until exit confirmation arrives, while explicit stop, disable cleanup, and shutdown cleanup all share the same exit-confirmed contract.

**Architecture:** Keep the cleanup logic inside `PluginService`, because it already owns service lifecycle state and process ownership. Tighten the current state machine instead of adding a second cleanup coordinator: stop requests should first attempt process-group `SIGTERM`, then direct-child fallback, and only transition to `stopped` after the child `exit` event confirms shutdown. Tests should prove the new boundary from the service layer outward, and live docs should reflect the narrower, more honest semantics.

**Tech Stack:** Electron main process, Node child-process lifecycle, Node native test runner, shared plugin lifecycle state, existing plugin logs and Control Center state surfaces.

---

## File Map

- Modify: `src/main/services/plugin-service.js`
  Purpose: keep service runtimes in `stopping` until exit confirmation, separate stop-intent logging from stop-confirmation logging, and preserve best-effort process-group-first cleanup.
- Modify: `tests/services/plugin-service.test.js`
  Purpose: add TDD coverage for stop-intent versus stop-confirmation semantics, process-group success and fallback, disable cleanup, shutdown cleanup, and failure handling.
- Create: `docs/phases/phase-65-plugin-service-hard-cleanup.md`
  Purpose: record the delivered service-only cleanup slice, its boundaries, tests, and next steps.
- Create: `docs/reviews/phase-65-plugin-service-hard-cleanup-review.md`
  Purpose: record the production-code-quality-review findings and their resolution.
- Modify: `docs/HANDOFF.md`
  Purpose: refresh the current runtime boundary and next-step guidance.
- Modify: `docs/development-summary.md`
  Purpose: refresh the short engineering summary with the stronger service cleanup boundary.
- Modify: `docs/project-status-review.md`
  Purpose: reflect the service cleanup hardening in the current project snapshot.
- Modify: `docs/productization-v1.1-todo-design.md`
  Purpose: narrow the future-work wording now that service stop semantics are stricter.
- Modify: `docs/project-context.json`
  Purpose: update the machine-readable current facts for the new service-only cleanup contract.

### Task 1: Add failing service cleanup tests

**Files:**
- Modify: `tests/services/plugin-service.test.js`
- Modify: `src/main/services/plugin-service.js`

- [ ] **Step 1: Add a test that service stop stays `stopping` until exit confirmation**

```js
test('plugin service stays stopping until the child exits after explicit stop', () => {
  const child = createSlowStoppingServiceProcess({ pid: 4321 })
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
  const stopped = service.stopService('weather-declaration', 'companion')

  assert.equal(stopped.runtime.status, 'stopping')
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopping')
  assert.deepEqual(child.killCalls, ['SIGTERM'])

  child.emit('exit', 0, 'SIGTERM')

  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopped')
})
```

- [ ] **Step 2: Run the test and verify it fails before implementation**

Run: `node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service stays stopping until the child exits after explicit stop"`
Expected: FAIL because explicit stop still resolves as fully stopped before exit confirmation.

- [ ] **Step 3: Add a test for process-group success and direct-child fallback keeping `stopping` until exit**

```js
test('plugin service keeps stopping during process-group stop and child fallback until exit', () => {
  const groupedChild = createSlowStoppingServiceProcess({ pid: 4321 })
  const groupStops = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: () => groupedChild,
    killServiceProcess: (pid, signal) => {
      groupStops.push({ pid, signal })
      return true
    }
  })

  service.startService('weather-declaration', 'companion')
  const stopped = service.stopService('weather-declaration', 'companion')

  assert.equal(stopped.runtime.status, 'stopping')
  assert.deepEqual(groupStops, [{ pid: -4321, signal: 'SIGTERM' }])
  assert.deepEqual(groupedChild.killCalls, [])

  groupedChild.emit('exit', 0, 'SIGTERM')

  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopped')
})
```

- [ ] **Step 4: Add a test for stop-path exceptions moving the runtime to `failed`**

```js
test('plugin service marks service stop failures as failed', () => {
  const child = createSlowStoppingServiceProcess({ pid: 4321 })
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    killServiceProcess: () => {
      throw new Error('process group missing')
    },
    spawnServiceProcess: () => child
  })

  service.startService('weather-declaration', 'companion')
  const stopped = service.stopService('weather-declaration', 'companion')

  assert.equal(stopped.runtime.status, 'stopping')
  child.emit('exit', 1, null)

  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'failed')
})
```

### Task 2: Implement stricter service stop semantics

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Modify: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Make `stopPluginServiceRuntime()` record stop intent without claiming final stop**

```js
const stopPluginServiceRuntime = (pluginId, serviceId, runtime, { log = true } = {}) => {
  if (!runtime || runtime.status !== 'running') return runtime
  runtime.status = 'stopping'
  runtime.stoppedAt = new Date().toISOString()
  try {
    stopServiceProcess(runtime, 'SIGTERM')
  } catch (error) {
    runtime.error = error.message || 'Plugin service stop failed'
    runtime.status = 'failed'
  }
  if (log) appendLog({ pluginId, commandId: `service:${serviceId}`, level: 'info', message: 'Service stop requested' })
  return runtime
}
```

- [ ] **Step 2: Update the service exit handler so `stopping` becomes `stopped` only after child exit**

```js
child.on?.('exit', (code, signal) => {
  const exitCode = Number.isFinite(Number(code)) ? Number(code) : null
  const stoppedByRequest = runtime.status === 'stopping'
  runtime.exitCode = exitCode
  runtime.signal = signal || ''
  runtime.child = null
  runtime.stoppedAt = runtime.stoppedAt || new Date().toISOString()
  runtime.status = stoppedByRequest && exitCode === 0 ? 'stopped' : (exitCode === 0 ? 'exited' : 'failed')
  appendLog({ pluginId, commandId: `service:${serviceId}`, level: runtime.status === 'failed' ? 'error' : 'info', message: runtime.status === 'stopped' ? 'Service stopped' : 'Service exited' })
  resolve({ ok: true, runtime: cloneServiceRuntime(runtime) })
})
```

- [ ] **Step 3: Keep disable and shutdown cleanup wired through the same state machine**

```js
const stopPluginServices = (pluginId, options = {}) => {
  for (const [key, runtime] of serviceRuntimes.entries()) {
    if (key.startsWith(`${pluginId}:`)) {
      stopPluginServiceRuntime(pluginId, runtime.serviceId, runtime, options)
    }
  }
}
```

- [ ] **Step 4: Run the targeted service tests and make them pass**

Run: `node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service stays stopping until the child exits after explicit stop|plugin service keeps stopping during process-group stop and child fallback until exit|plugin service marks service stop failures as failed"`
Expected: PASS with the new stricter service stop contract.

### Task 3: Update phase and live docs for the stronger service cleanup boundary

**Files:**
- Create: `docs/phases/phase-65-plugin-service-hard-cleanup.md`
- Create: `docs/reviews/phase-65-plugin-service-hard-cleanup-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-context.json`

- [ ] **Step 1: Document the phase slice and review results**

Write the phase record and review record to say:

- service stop requests now remain `stopping` until child exit confirmation;
- process-group cleanup is still best-effort;
- hard descendant termination guarantees remain future work;
- setup and commands were not changed in this phase.

- [ ] **Step 2: Update live docs with the narrower truth**

Update live docs to reflect:

- service stop is more honest and exit-confirmed;
- no new cleanup scope was added outside services;
- hard descendant termination is still future work.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/services/plugin-service.js tests/services/plugin-service.test.js docs/phases/phase-65-plugin-service-hard-cleanup.md docs/reviews/phase-65-plugin-service-hard-cleanup-review.md docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/productization-v1.1-todo-design.md docs/project-context.json docs/superpowers/specs/2026-06-17-plugin-service-hard-cleanup-phase-65-design.md docs/superpowers/plans/2026-06-17-plugin-service-hard-cleanup-phase-65.md
git commit -m "feat: harden plugin service cleanup"
```

## Self-Review

- Spec coverage: service-only hard cleanup boundary is explicit; setup and commands are excluded.
- Placeholder scan: no TBDs or vague steps remain.
- Type consistency: `stopping`, `stopped`, `exited`, and `failed` are used consistently with the existing runtime model.
- Scope check: this is one implementation slice for a single plan.
