# Plugin Service Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 58 support for explicitly starting and stopping declared plugin service entries from Control Center.

**Architecture:** Keep service lifecycle owned by `PluginService`: it validates policy, enabled state, service id, plugin-local cwd, command parsing, process state, and plugin logs before spawning or stopping anything. IPC/preload/Control Center only expose explicit user actions; no services auto-start on install, enable, app boot, or dashboard open.

**Tech Stack:** Electron main process, Node child processes, Node native test runner, React + TypeScript Control Center, existing plugin logs and IPC/preload bridge.

---

## File Map

- `src/main/services/plugin-service.js`: parse service commands, resolve plugin-local cwd, manage in-memory service processes, expose `startService()` / `stopService()` / `stopAllServices()`, and surface runtime state from `listPlugins()`.
- `src/main/ipc.js`, `src/shared/ipc-channels.js`, `control-center-preload.js`: add `plugins:start-service` and `plugins:stop-service`.
- `src/shared/openpet-contracts.ts`: add service runtime/control result types and API methods.
- `main.js`: stop managed plugin services before app quit.
- `src/control-center/src/api/control-center-api.ts`: demo runtime state and start/stop implementations.
- `src/control-center/src/hooks/usePluginsPane.ts`: track `changingService` and call start/stop APIs.
- `src/control-center/src/panes/PluginsPane.tsx`: show service runtime state and Start/Stop buttons.
- `src/control-center/src/components/PluginEntryDetails.tsx`: keep service declaration display useful with runtime state.
- `tests/services/plugin-service.test.js`: service lifecycle unit tests with injected fake spawner.
- `tests/main/ipc-plugin-install.test.js`: IPC delegation tests.
- `tests/control-center/control-center-smoke.spec.js`: UI baseline for service buttons and logs.
- `docs/phases/phase-58-plugin-service-lifecycle.md`: phase record.
- `docs/reviews/phase-58-plugin-service-lifecycle-review.md`: production review record.

## Tasks

### Task 1: Service Lifecycle In PluginService

**Files:**
- Modify: `tests/services/plugin-service.test.js`
- Modify: `src/main/services/plugin-service.js`

- [ ] **Step 1: Write failing service lifecycle tests**

Add tests that create a declaration-only plugin with `entries.services` and inject a fake `spawnServiceProcess(command, args, options)`.

The first test should call:

```js
const result = service.startService('weather-declaration', 'companion')
assert.equal(result.runtime.status, 'running')
assert.deepEqual(spawnCalls[0].args, ['run', 'service:start'])
assert.equal(service.listPlugins()[0].entries.services[0].runtime.status, 'running')

const stopped = service.stopService('weather-declaration', 'companion')
assert.equal(stopped.runtime.status, 'stopped')
```

Add failure-path tests for disabled plugin, blocked plugin, unknown service id, duplicate start, and service cwd escaping through a symlink.

- [ ] **Step 2: Run RED**

Run: `node --test tests/services/plugin-service.test.js`

Expected: fail because `service.startService` is not a function.

- [ ] **Step 3: Implement lifecycle**

In `src/main/services/plugin-service.js`:

- import `spawn` from `child_process`;
- add `spawnServiceProcess = spawn` dependency;
- add a simple quote-aware command parser that returns `{ file, args }`;
- resolve service `cwd` against `manifest.basePath`, including realpath containment checks;
- track service runtimes in a `Map`;
- append `Service started`, `Service stopped`, `Service exited`, and `Service failed` logs with `commandId: service:<serviceId>`;
- add `startService(pluginId, serviceId)`, `stopService(pluginId, serviceId)`, and `stopAllServices()`;
- decorate `listPlugins()` service entries with `runtime`, defaulting to `{ status: 'stopped' }`;
- stop all running services for a plugin when it is disabled.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/services/plugin-service.test.js`

Expected: all plugin service tests pass.

### Task 2: IPC, Preload, Contracts

**Files:**
- Modify: `tests/main/ipc-plugin-install.test.js`
- Modify: `src/shared/ipc-channels.js`
- Modify: `src/main/ipc.js`
- Modify: `control-center-preload.js`
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `main.js`

- [ ] **Step 1: Write failing IPC tests**

Add a test that invokes `IPC.PLUGINS_START_SERVICE` and `IPC.PLUGINS_STOP_SERVICE`, with a stub `pluginService` recording calls and returning service runtime payloads.

- [ ] **Step 2: Run RED**

Run: `node --test tests/main/ipc-plugin-install.test.js`

Expected: fail because the new IPC channels are absent.

- [ ] **Step 3: Implement bridge**

Add `PLUGINS_START_SERVICE` and `PLUGINS_STOP_SERVICE` constants, main handlers, preload methods, and `ControlCenterApi.startPluginService()` / `ControlCenterApi.stopPluginService()` types. Add `app.on('before-quit', () => pluginService.stopAllServices?.())` in `main.js`.

- [ ] **Step 4: Run GREEN and typecheck**

Run:

```bash
node --test tests/main/ipc-plugin-install.test.js
npm run typecheck
```

Expected: both pass.

### Task 3: Control Center UI

**Files:**
- Modify: `src/control-center/src/api/control-center-api.ts`
- Modify: `src/control-center/src/hooks/usePluginsPane.ts`
- Modify: `src/control-center/src/panes/PluginsPane.tsx`
- Modify: `tests/control-center/control-center-smoke.spec.js`

- [ ] **Step 1: Write failing UI smoke expectations**

Extend the manual plugin smoke test to assert service entry runtime is visible, the Start button is disabled while the plugin is disabled, enabling the plugin allows Start, Start records `Service started`, Stop records `Service stopped`, and runtime text updates.

- [ ] **Step 2: Run RED**

Run: `npm run test:control-center`

Expected: fail because service buttons are not rendered.

- [ ] **Step 3: Implement demo API and UI**

Add demo service runtime mutation helpers, `changingService` state in the hook, and Start/Stop buttons in `PluginsPane`. Use existing `plugin-commands` style and avoid adding a new panel style unless needed.

- [ ] **Step 4: Run GREEN**

Run:

```bash
npm run typecheck
npm run test:control-center
```

Expected: both pass.

### Task 4: Review, Docs, Verification, Commit

**Files:**
- Create: `docs/phases/phase-58-plugin-service-lifecycle.md`
- Create: `docs/reviews/phase-58-plugin-service-lifecycle-review.md`
- Modify: live docs that describe extension lifecycle gaps and test counts.

- [ ] **Step 1: Run production review**

Use `$production-code-quality-review`, focusing on process execution boundaries, policy checks, lifecycle cleanup, logs, and renderer bypass resistance.

- [ ] **Step 2: Fix findings**

Apply fixes for any P0/P1/P2 findings before final verification.

- [ ] **Step 3: Update docs**

Document that service lifecycle is explicit start/stop only, no auto-start, no shell expansion, no setup/health/bridge support yet.

- [ ] **Step 4: Full verification**

Run:

```bash
npm run check:syntax
npm run test:control-center
npm test
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

- [ ] **Step 5: Commit and push**

Run:

```bash
git add .
git commit -m "feat: manage plugin service entries"
git push
```
