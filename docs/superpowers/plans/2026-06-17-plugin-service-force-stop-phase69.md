# Plugin Service Force Stop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded grace-period plus force-stop path for declaration-only plugin service entries when they ignore the initial stop request.

**Architecture:** Keep `PluginService` as the owner of service runtime state, stop requests, timers, and logs. Extend the existing process-group-first stop boundary with a second force-stop helper and a runtime-owned timer, while keeping the final terminal state inside the existing `failed` contract.

**Tech Stack:** Electron main process, CommonJS Node services, Node native test runner, existing Control Center service runtime contract, production-code-quality-review workflow.

---

## File Map

- Modify: `src/main/services/plugin-service.js`
  Purpose: add service stop grace-period state, force-stop helper, timer cleanup, and deterministic logging.
- Modify: `tests/services/plugin-service.test.js`
  Purpose: add red-green coverage for stubborn service stop behavior across explicit stop, disable cleanup, and app shutdown cleanup.
- Create: `docs/phases/phase-69-plugin-service-force-stop.md`
  Purpose: record the new bounded service-only cleanup contract, implementation, verification, and remaining limits.
- Create: `docs/reviews/phase-69-plugin-service-force-stop-review.md`
  Purpose: record production review scope, findings, and fixes.
- Modify: `docs/HANDOFF.md`
  Purpose: refresh current runtime boundary and next-step guidance.
- Modify: `docs/development-summary.md`
  Purpose: update short engineering summary with service grace-period force stop.
- Modify: `docs/project-status-review.md`
  Purpose: reflect the stronger service-only cleanup semantics in the status snapshot.
- Modify: `docs/project-context.json`
  Purpose: update machine-readable facts and validation baseline.
- Modify: `docs/productization-v1.1-todo-design.md`
  Purpose: add Phase 69 to the execution design and priority sequence.
- Modify: `docs/project-review-todo-design.md`
  Purpose: add Phase 69 to the consolidated whole-project TODO design.
- Modify: `docs/plugin-development.md`
  Purpose: describe bounded grace-period plus force-stop service cleanup honestly.
- Modify: `docs/plugin-ecosystem-rules.md`
  Purpose: keep extension cleanup claims aligned with the new host behavior.

### Task 1: Write failing service force-stop tests

**Files:**
- Modify: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Add a stubborn service process helper that ignores both stop requests until the test emits exit**

Add a dedicated helper near the existing fake service helpers:

```js
const createStubbornServiceProcess = ({ pid = 4321 } = {}) => {
  const child = createFakeServiceProcess({ pid })
  child.kill = (signal) => {
    child.killCalls.push(signal || 'SIGTERM')
    return true
  }
  return child
}
```

- [ ] **Step 2: Add a test that graceful stop clears the force-stop timer**

```js
test('plugin service does not force stop when the child exits before the grace period', async () => {
  const child = createStubbornServiceProcess()
  const forceStops = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    serviceStopGracePeriodMs: 20,
    spawnServiceProcess: () => child,
    killServiceProcess: (pid, signal) => {
      forceStops.push({ pid, signal })
      return true
    }
  })

  service.startService('weather-declaration', 'companion')
  service.stopService('weather-declaration', 'companion')
  child.emit('exit', 0, 'SIGTERM')

  await new Promise((resolve) => setTimeout(resolve, 40))

  assert.deepEqual(forceStops, [{ pid: -4321, signal: 'SIGTERM' }])
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopped')
})
```

- [ ] **Step 3: Add a test that explicit stop force-kills stubborn services after the grace period**

```js
test('plugin service force stops stubborn services after the grace period', async () => {
  const child = createStubbornServiceProcess()
  const processSignals = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    serviceStopGracePeriodMs: 10,
    spawnServiceProcess: () => child,
    killServiceProcess: (pid, signal) => {
      processSignals.push({ pid, signal })
      return true
    }
  })

  service.startService('weather-declaration', 'companion')
  const stopped = service.stopService('weather-declaration', 'companion')

  assert.equal(stopped.runtime.status, 'stopping')
  await waitFor(() => processSignals.length === 2)

  assert.deepEqual(processSignals, [
    { pid: -4321, signal: 'SIGTERM' },
    { pid: -4321, signal: 'SIGKILL' }
  ])
  assert.match(service.getLogs()[0].message, /force stop requested/)
  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'stopping')

  child.emit('exit', null, 'SIGKILL')

  assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'failed')
  assert.match(service.listPlugins()[0].entries.services[0].runtime.error, /force kill/i)
})
```

- [ ] **Step 4: Add tests for disable cleanup and app shutdown cleanup using the same force-stop path**

```js
test('plugin service disable cleanup force stops stubborn services after the grace period', async () => {
  const child = createStubbornServiceProcess()
  const processSignals = []
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    serviceStopGracePeriodMs: 10,
    spawnServiceProcess: () => child,
    killServiceProcess: (pid, signal) => {
      processSignals.push({ pid, signal })
      return true
    }
  })

  service.startService('weather-declaration', 'companion')
  service.setEnabled('weather-declaration', false)

  await waitFor(() => processSignals.length === 2)
  assert.deepEqual(processSignals.map((entry) => entry.signal), ['SIGTERM', 'SIGKILL'])
})
```

```js
test('plugin service app shutdown cleanup force stops stubborn services after the grace period', async () => {
  const child = createStubbornServiceProcess()
  const processSignals = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    serviceStopGracePeriodMs: 10,
    spawnServiceProcess: () => child,
    killServiceProcess: (pid, signal) => {
      processSignals.push({ pid, signal })
      return true
    }
  })

  service.startService('weather-declaration', 'companion')
  service.stopAllServices()

  await waitFor(() => processSignals.length === 2)
  assert.deepEqual(processSignals.map((entry) => entry.signal), ['SIGTERM', 'SIGKILL'])
})
```

- [ ] **Step 5: Run targeted tests and verify red**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service does not force stop when the child exits before the grace period|plugin service force stops stubborn services after the grace period|plugin service disable cleanup force stops stubborn services after the grace period|plugin service app shutdown cleanup force stops stubborn services after the grace period"
```

Expected before implementation:

- FAIL because `createPluginService()` does not accept `serviceStopGracePeriodMs`, never schedules a force stop, and never emits `SIGKILL`.

### Task 2: Implement bounded service force-stop semantics

**Files:**
- Modify: `src/main/services/plugin-service.js`

- [ ] **Step 1: Add a configurable grace-period constant and factory option**

Add a local default near the existing service timeout constants:

```js
const PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS = 1500
```

Then extend the factory signature to accept:

```js
serviceStopGracePeriodMs = PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS,
```

- [ ] **Step 2: Extend service runtime with a stop timer handle**

When creating or starting a service runtime, carry:

```js
stopTimer: null
```

and reset it when a service starts.

- [ ] **Step 3: Add a force-stop helper and timer cleanup helper**

Add helpers near the current stop helpers:

```js
const forceStopServiceProcess = (runtime, signal = 'SIGKILL') => {
  const pid = Number(runtime?.pid) || 0
  if (pid > 0) {
    try {
      killServiceProcess(-pid, signal)
      return
    } catch (_) {}
  }
  runtime.child?.kill?.(signal)
}

const clearServiceStopTimer = (runtime) => {
  if (!runtime?.stopTimer) return
  clearTimeout(runtime.stopTimer)
  runtime.stopTimer = null
}
```

- [ ] **Step 4: Schedule force-stop on stubborn shutdown**

Inside `stopPluginServiceRuntime()` after the graceful stop request succeeds, add:

```js
clearServiceStopTimer(runtime)
const gracePeriodMs = Number.isFinite(Number(serviceStopGracePeriodMs))
  ? Math.max(0, Number(serviceStopGracePeriodMs))
  : PLUGIN_SERVICE_STOP_GRACE_PERIOD_MS
if (gracePeriodMs === 0) {
  try {
    forceStopServiceProcess(runtime, 'SIGKILL')
    runtime.error = 'Service did not stop before force kill'
    if (log) appendLog({ pluginId, commandId: `service:${serviceId}`, level: 'error', message: 'Service stop grace period expired; force stop requested' })
  } catch (error) {
    runtime.error = error.message || 'Plugin service force stop failed'
    runtime.status = 'failed'
  }
} else {
  runtime.stopTimer = setTimeout(() => {
    if (runtime.status !== 'stopping') return
    try {
      forceStopServiceProcess(runtime, 'SIGKILL')
      runtime.error = 'Service did not stop before force kill'
      appendLog({ pluginId, commandId: `service:${serviceId}`, level: 'error', message: 'Service stop grace period expired; force stop requested' })
    } catch (error) {
      runtime.error = error.message || 'Plugin service force stop failed'
      runtime.status = 'failed'
      appendLog({ pluginId, commandId: `service:${serviceId}`, level: 'error', message: runtime.error })
    }
  }, gracePeriodMs)
  runtime.stopTimer.unref?.()
}
```

- [ ] **Step 5: Clear timers and preserve terminal state in the exit handler**

At the top of the service `exit` handler, add:

```js
clearServiceStopTimer(runtime)
```

Then keep forced-stop completions inside the existing `failed` contract:

```js
if (runtime.status === 'stopping') {
  const forcedStop = /force kill/i.test(String(runtime.error || ''))
  runtime.status = forcedStop ? 'failed' : (Number.isFinite(Number(code)) && Number(code) !== 0 && !signal ? 'failed' : 'stopped')
}
```

- [ ] **Step 6: Run targeted tests and verify green**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service does not force stop when the child exits before the grace period|plugin service force stops stubborn services after the grace period|plugin service disable cleanup force stops stubborn services after the grace period|plugin service app shutdown cleanup force stops stubborn services after the grace period"
```

Expected: PASS.

### Task 3: Refine service tests and full service suite

**Files:**
- Modify: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Add a duplicate-start assertion while a forced stop is still pending**

Extend the stubborn explicit-stop test with:

```js
assert.throws(
  () => service.startService('weather-declaration', 'companion'),
  /Plugin service is already running/
)
```

before the child exit event.

- [ ] **Step 2: Run the full plugin service suite**

Run:

```bash
node --test tests/services/plugin-service.test.js
```

Expected: PASS.

### Task 4: Phase docs and live-doc updates

**Files:**
- Create: `docs/phases/phase-69-plugin-service-force-stop.md`
- Create: `docs/reviews/phase-69-plugin-service-force-stop-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-review-todo-design.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/plugin-ecosystem-rules.md`

- [ ] **Step 1: Record the phase boundary**

The phase doc must state:

- service stop now has a bounded grace period;
- stubborn service cleanup escalates to a host-side `SIGKILL` attempt;
- final forced-stop runtime state still uses `failed`;
- setup and command cleanup are unchanged;
- descendant cleanup is still not guaranteed on every OS.

- [ ] **Step 2: Update live docs with the narrower truth**

Refresh wording so it says:

- service cleanup is now best-effort process-group cleanup plus bounded force-stop attempt;
- final state remains conservative;
- setup and command cleanup remain weaker than service cleanup.

### Task 5: Production review, verification, commit, push

**Files:**
- All changed files

- [ ] **Step 1: Run production review**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Review the Phase 69 diff using the production-code-quality-review framework. Record findings in `docs/reviews/phase-69-plugin-service-force-stop-review.md`. Fix any meaningful issues before final verification.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

- [ ] **Step 3: Commit and push**

Run:

```bash
git add src/main/services/plugin-service.js tests/services/plugin-service.test.js docs/phases/phase-69-plugin-service-force-stop.md docs/reviews/phase-69-plugin-service-force-stop-review.md docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/project-context.json docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md docs/plugin-development.md docs/plugin-ecosystem-rules.md docs/superpowers/specs/2026-06-17-plugin-service-force-stop-design.md docs/superpowers/plans/2026-06-17-plugin-service-force-stop-phase69.md
git commit -m "feat: force stop stubborn plugin services"
git push -u origin codex/plugin-service-force-stop-phase69
```

## Self-Review

- Spec coverage: the plan only strengthens service cleanup and keeps setup/command cleanup out of scope.
- Placeholder scan: every task contains exact files, commands, and expected behavior.
- Type consistency: the final forced-stop terminal state stays inside the existing `failed` contract, so shared runtime contracts and renderer state do not need a new enum variant.
