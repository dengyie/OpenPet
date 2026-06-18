# Plugin Service Process Tree Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen plugin service shutdown so explicitly started service entries clean up their spawned process group when possible.

**Architecture:** Keep `PluginService` as the owner of service lifecycle state. Start declared service processes as detached process-group roots where Node supports it, then stop by signalling that group before falling back to the direct child process. This phase does not add setup commands, bridge flows, background health polling, generic shell execution, or broader sandbox claims.

**Tech Stack:** Electron main process, CommonJS Node services, Node native test runner, React Control Center contracts already in place.

---

## File Map

- Modify `src/main/services/plugin-service.js`: add small service-process stop helpers, spawn services as detached process-group roots, and preserve current runtime/log behavior.
- Modify `tests/services/plugin-service.test.js`: add deterministic tests for detached spawn options, process-group stop, and fallback to child kill.
- Create `docs/phases/phase-60-plugin-setup-status-and-service-cleanup.md`: record scope, implementation, verification, and remaining limits.
- Create `docs/reviews/phase-60-plugin-setup-status-and-service-cleanup-review.md`: record production review findings and fixes.
- Update live docs only where facts change: `README.md`, `README.zh-CN.md`, `docs/HANDOFF.md`, `docs/development-summary.md`, `docs/project-status-review.md`, `docs/project-context.json`, `docs/productization-v1.1-todo-design.md`, `docs/project-review-todo-design.md`, `docs/plugin-development.md`, and `docs/plugin-ecosystem-rules.md`.

## Task 1: Failing Tests

**Files:**
- Modify: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Add a process killer injection helper to tests**

Add tests around the existing service lifecycle tests:

```js
test('plugin service starts service processes as detached process group roots', () => {
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: (file, args, options) => {
      const child = createSlowStoppingServiceProcess()
      spawned.push({ file, args, options, child })
      return child
    }
  })

  service.startService('weather-declaration', 'companion')

  assert.equal(spawned[0].options.detached, true)
})
```

Add a stop-path test:

```js
test('plugin service stops service process groups before falling back to child kill', () => {
  const child = createSlowStoppingServiceProcess({ pid: 4321 })
  const killedProcesses = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: () => child,
    killServiceProcess: (pid, signal) => {
      killedProcesses.push({ pid, signal })
      return true
    }
  })

  service.startService('weather-declaration', 'companion')
  service.stopService('weather-declaration', 'companion')

  assert.deepEqual(killedProcesses, [{ pid: -4321, signal: 'SIGTERM' }])
  assert.deepEqual(child.killCalls, [])
})
```

Add a fallback test:

```js
test('plugin service falls back to child kill when process group stop fails', () => {
  const child = createSlowStoppingServiceProcess({ pid: 4321 })
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: () => child,
    killServiceProcess: () => {
      throw new Error('process group missing')
    }
  })

  service.startService('weather-declaration', 'companion')
  service.stopService('weather-declaration', 'companion')

  assert.deepEqual(child.killCalls, ['SIGTERM'])
})
```

- [ ] **Step 2: Run targeted tests and verify red**

Run:

```bash
node --test tests/services/plugin-service.test.js
```

Expected before implementation:

- detached option assertion fails because service spawn options do not include `detached: true`, or
- `createPluginService()` rejects/ignores `killServiceProcess`, causing the process group stop expectations to fail.

## Task 2: Minimal Implementation

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Test: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Add injectable process killer and process-group helper**

Change the `createPluginService` factory parameters from:

```js
const createPluginService = ({ settingsService, petService, aiService, fetchImpl = globalThis.fetch, serviceHealthTimeoutMs, healthCheckTimeoutMs = serviceHealthTimeoutMs ?? PLUGIN_SERVICE_HEALTH_TIMEOUT_MS, openExternal = async () => { throw new Error('Dashboard opener is not available') }, spawnServiceProcess = spawn, pluginDirs = [], officialPlugins = [], getPluginBlockStatus = () => ({ blocked: false, reasons: [] }) }) => {
```

to include:

```js
killServiceProcess = process.kill,
```

Then add a small helper near service runtime helpers:

```js
  const stopServiceProcess = (runtime, signal = 'SIGTERM') => {
    const pid = Number(runtime?.pid) || 0
    if (pid > 0) {
      try {
        killServiceProcess(-pid, signal)
        return
      } catch (_) {}
    }
    runtime.child?.kill?.(signal)
  }
```

- [ ] **Step 2: Use process-group cleanup during stop**

Change:

```js
runtime.child?.kill?.('SIGTERM')
```

to:

```js
stopServiceProcess(runtime, 'SIGTERM')
```

- [ ] **Step 3: Spawn service entries as detached groups**

Add `detached: true` to the service spawn options:

```js
const child = spawnServiceProcess(file, args, {
  cwd,
  detached: true,
  env: createServiceProcessEnv(),
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
})
```

- [ ] **Step 4: Run targeted tests and verify green**

Run:

```bash
node --test tests/services/plugin-service.test.js
```

Expected: all plugin service tests pass.

## Task 3: Documentation And Review

**Files:**
- Create: `docs/phases/phase-60-plugin-setup-status-and-service-cleanup.md`
- Create: `docs/reviews/phase-60-plugin-setup-status-and-service-cleanup-review.md`
- Modify: live docs listed in the file map

- [ ] **Step 1: Record phase scope**

The phase doc must state:

- service entries are started as detached process-group roots;
- stop/disable/app-quit attempts process-group `SIGTERM` first;
- child kill remains fallback;
- this is still best-effort cleanup, not a complete sandbox or hard kill guarantee;
- no setup, bridge, generic shell execution, or background health polling was added.

- [ ] **Step 2: Run production review**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Inspect changed files, service lifecycle code, tests, and docs. Save findings in the Phase 60 review doc. Fix any P1/P2 findings before final verification.

## Task 4: Verification, Commit, Push

**Files:**
- All changed files

- [ ] **Step 1: Run complete verification**

Run:

```bash
npm run check:syntax
npm run test:control-center
npm test
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

- [ ] **Step 2: Commit and push**

Run:

```bash
git add .
git commit -m "feat: clean up plugin service process trees"
git push -u origin codex/plugin-setup-status
```

## Self-Review

- Spec coverage: process-tree cleanup is the only new runtime capability; excluded setup, bridge, health polling, and generic shell execution are explicitly documented.
- Placeholder scan: no TBD placeholders remain.
- Type consistency: tests use `killServiceProcess`, runtime uses `stopServiceProcess`, and existing `startService` / `stopService` contracts stay unchanged.
