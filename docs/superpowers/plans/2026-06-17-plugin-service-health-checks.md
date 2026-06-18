# Plugin Service Health Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 59 support for explicit health checks on declared plugin service entries.

**Architecture:** Keep health checks owned by `PluginService`, alongside service lifecycle state and plugin logs. IPC/preload/shared contracts expose a single explicit Control Center action; the renderer displays current health state and does not infer health from process state.

**Tech Stack:** Electron main process, Node native test runner, React + TypeScript Control Center, Playwright UI smoke tests, existing plugin manifest `entries.services[].health` declarations.

---

## File Map

- `src/main/services/plugin-service.js`: add service health view state, URL validation, HTTP/HTTPS health fetch, `checkServiceHealth()`, runtime health updates, and logs.
- `src/shared/ipc-channels.js`, `src/main/ipc.js`, `control-center-preload.js`: add `plugins:check-service-health`.
- `src/shared/openpet-contracts.ts`: add service health view/control result types and Control Center API method.
- `src/control-center/src/api/control-center-api.ts`: add demo health state and health check action.
- `src/control-center/src/hooks/usePluginsPane.ts`: add `checkingServiceHealth` state and `onCheckServiceHealth()`.
- `src/control-center/src/panes/PluginsPane.tsx`: display health state and Check Health button.
- `tests/services/plugin-service.test.js`: add health unit tests.
- `tests/main/ipc-plugin-install.test.js`: add IPC health delegation test.
- `tests/control-center/control-center-smoke.spec.js`: add UI health assertions.
- `docs/phases/phase-59-plugin-service-health-checks.md`: phase record.
- `docs/reviews/phase-59-plugin-service-health-checks-review.md`: production review record.

## Task 1: PluginService Health Runtime

**Files:**
- Modify: `tests/services/plugin-service.test.js`
- Modify: `src/main/services/plugin-service.js`

- [ ] **Step 1: Write failing tests**

Add tests that create a declaration-only plugin with:

```js
services: [{
  id: 'companion',
  title: 'Companion Service',
  command: 'npm run service:start',
  cwd: '.',
  health: { type: 'http', url: 'http://127.0.0.1:8787/health' }
}]
```

Test cases:

- `plugin service checks configured service health endpoints`
- `plugin service marks non-2xx service health responses unhealthy`
- `plugin service rejects service health checks for disabled plugins`
- `plugin service rejects service health checks without health declarations`
- `plugin service rejects unsafe service health protocols before fetching`

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/services/plugin-service.test.js
```

Expected: fail because `service.checkServiceHealth` is not a function.

- [ ] **Step 3: Implement health checks**

In `src/main/services/plugin-service.js`:

- add health view defaults to `createRuntimeView()`;
- add `normalizeServiceHealthUrl(serviceEntry)` that accepts only HTTP/HTTPS URLs;
- add `checkServiceHealth(pluginId, serviceId)` as an async method;
- use injected `fetchImpl` with `method: 'GET'`;
- mark 2xx as `healthy`, non-2xx as `unhealthy`, thrown fetch errors as `unhealthy`;
- append `Service health healthy` or `Service health unhealthy` logs with `commandId: service:<serviceId>`;
- return `{ ok: true, pluginId, serviceId, health, runtime }`.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test tests/services/plugin-service.test.js
```

Expected: all plugin service tests pass.

## Task 2: IPC, Preload, Contracts

**Files:**
- Modify: `tests/main/ipc-plugin-install.test.js`
- Modify: `src/shared/ipc-channels.js`
- Modify: `src/main/ipc.js`
- Modify: `control-center-preload.js`
- Modify: `src/shared/openpet-contracts.ts`

- [ ] **Step 1: Write failing IPC/contract test**

Add an IPC test invoking `IPC.PLUGINS_CHECK_SERVICE_HEALTH` with a stub `pluginService.checkServiceHealth()`.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/main/ipc-plugin-install.test.js
```

Expected: fail because the IPC channel or handler is missing.

- [ ] **Step 3: Implement bridge and types**

Add the IPC channel, main handler, preload API, `PluginServiceHealthViewState`, `PluginServiceHealthCheckResult`, and `ControlCenterApi.checkPluginServiceHealth()`.

- [ ] **Step 4: Run GREEN and typecheck**

Run:

```bash
node --test tests/main/ipc-plugin-install.test.js
npm run typecheck
```

Expected: both pass.

## Task 3: Control Center UI

**Files:**
- Modify: `src/control-center/src/api/control-center-api.ts`
- Modify: `src/control-center/src/hooks/usePluginsPane.ts`
- Modify: `src/control-center/src/panes/PluginsPane.tsx`
- Modify: `tests/control-center/control-center-smoke.spec.js`

- [ ] **Step 1: Write failing UI smoke expectations**

Extend the manual plugin smoke test to assert:

- health text starts as `Health: unknown`;
- Check Health is disabled while the plugin is disabled;
- after enable, clicking Check Health shows `Service health healthy`;
- the plugin row shows `Health: healthy`;
- plugin logs include `Service health healthy`.

- [ ] **Step 2: Run RED**

Run:

```bash
npm run test:control-center
```

Expected: fail because the UI does not render health state or button yet.

- [ ] **Step 3: Implement demo and UI**

Add demo health mutation, `checkingServiceHealth` hook state, `onCheckServiceHealth()`, and a Check Health button next to Start/Stop.

- [ ] **Step 4: Run GREEN**

Run:

```bash
npm run typecheck
npm run test:control-center
```

Expected: both pass.

## Task 4: Review, Docs, Verification, Commit

**Files:**
- Create: `docs/phases/phase-59-plugin-service-health-checks.md`
- Create: `docs/reviews/phase-59-plugin-service-health-checks-review.md`
- Modify: live docs that mention service health as future work.

- [ ] **Step 1: Run production review**

Use `$production-code-quality-review`, focusing on health URL validation, renderer bypass resistance, fetch error handling, logs, and contract drift.

- [ ] **Step 2: Fix findings**

Fix any P0/P1/P2 findings before final verification.

- [ ] **Step 3: Update docs**

Document that service health checks are explicit, Control Center-triggered, HTTP/HTTPS only, and do not imply auto-start, setup, bridge, or process-tree cleanup.

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

Commit:

```bash
git add .
git commit -m "feat: check plugin service health"
git push -u origin codex/plugin-service-health-checks
```
