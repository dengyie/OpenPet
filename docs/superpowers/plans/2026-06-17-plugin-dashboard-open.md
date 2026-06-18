# Plugin Dashboard Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 57 support for opening declared plugin dashboard entries from the Control Center.

**Architecture:** Keep dashboard entries declarative in `plugin.json`, but add one explicit runtime action that validates plugin policy, enabled state, dashboard id, and URL protocol before delegating to Electron's external opener. Do not start services, execute dashboard setup commands, or host dashboard content inside OpenPet.

**Tech Stack:** Electron main process, Node native test runner, React + TypeScript Control Center, existing IPC/preload bridge, existing plugin logs.

---

## File Map

- `src/main/services/plugin-service.js`: add `openDashboard(pluginId, dashboardId)` with injectable `openExternal`.
- `src/main/ipc.js`: register `plugins:open-dashboard`.
- `src/shared/ipc-channels.js`: add the IPC channel constant.
- `control-center-preload.js`: expose `openPluginDashboard`.
- `src/shared/openpet-contracts.ts`: type `openPluginDashboard` on `ControlCenterApi`.
- `src/control-center/src/api/control-center-api.ts`: add demo implementation and demo dashboard fixture.
- `src/control-center/src/hooks/usePluginsPane.ts`: track/open dashboard state and refresh logs.
- `src/control-center/src/panes/PluginsPane.tsx`: render dashboard buttons next to command buttons.
- `tests/services/plugin-service.test.js`: cover successful, disabled, blocked, missing, and unsafe dashboard opens.
- `tests/main/ipc-plugin-install.test.js`: cover IPC dispatch.
- `tests/shared/openpet-contracts-type-fixture.ts`: keep contract fixture compiling with dashboard entry shape.
- `docs/phases/phase-57-plugin-dashboard-open.md`: record implementation and acceptance.
- `docs/reviews/phase-57-plugin-dashboard-open-review.md`: record production review.
- Live docs: update only current fact summaries after verification.

## Tasks

### Task 1: Service Behavior

**Files:**
- Modify: `tests/services/plugin-service.test.js`
- Modify: `src/main/services/plugin-service.js`

- [ ] **Step 1: Write the failing tests**

Add tests that create a plugin with `entries.dashboards`, inject `openExternal`, and assert:

```js
const result = await service.openDashboard('weather-declaration', 'main')
assert.deepEqual(openedUrls, ['http://127.0.0.1:8787'])
assert.deepEqual(result, { ok: true, pluginId: 'weather-declaration', dashboardId: 'main', url: 'http://127.0.0.1:8787/' })
```

Also assert disabled plugins, blocked plugins, unknown dashboard ids, and non-http URL entries reject before calling the opener.

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `node --test tests/services/plugin-service.test.js`

Expected: fail because `service.openDashboard` is not a function.

- [ ] **Step 3: Implement the service**

Add `openExternal = async () => { throw new Error('Dashboard opener is not available') }` to `createPluginService` dependencies. Implement `openDashboard(pluginId, dashboardId)` to:

- find the plugin;
- run `assertPluginAllowed(plugin.manifest)`;
- require enabled state;
- find `plugin.manifest.entries.dashboards` by id;
- allow only `http:` and `https:` URLs;
- call `openExternal(url.toString())`;
- append success/error logs with `commandId` set to `dashboard:${dashboardId}`;
- return `{ ok: true, pluginId, dashboardId, url: url.toString() }`.

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run: `node --test tests/services/plugin-service.test.js`

Expected: all plugin service tests pass.

### Task 2: IPC and API Bridge

**Files:**
- Modify: `src/shared/ipc-channels.js`
- Modify: `src/main/ipc.js`
- Modify: `control-center-preload.js`
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/control-center/src/api/control-center-api.ts`
- Modify: `tests/main/ipc-plugin-install.test.js`

- [ ] **Step 1: Write the failing IPC test**

Add a test that registers IPC handlers with a stub `pluginService.openDashboard`, invokes `IPC.PLUGINS_OPEN_DASHBOARD`, and asserts it passes `{ pluginId, dashboardId }` through.

- [ ] **Step 2: Run the targeted IPC test and verify RED**

Run: `node --test tests/main/ipc-plugin-install.test.js`

Expected: fail because the IPC channel/handler is absent.

- [ ] **Step 3: Implement bridge plumbing**

Add `PLUGINS_OPEN_DASHBOARD: 'plugins:open-dashboard'` to both IPC constant copies, register the main handler, expose `openPluginDashboard(pluginId, dashboardId)` in preload, type it in `ControlCenterApi`, and add a demo API implementation that logs `Dashboard opened`.

- [ ] **Step 4: Run targeted IPC and type checks**

Run:

```bash
node --test tests/main/ipc-plugin-install.test.js
npm run typecheck
```

Expected: both pass.

### Task 3: Control Center UI

**Files:**
- Modify: `src/control-center/src/hooks/usePluginsPane.ts`
- Modify: `src/control-center/src/panes/PluginsPane.tsx`

- [ ] **Step 1: Add dashboard opening state and handler**

Track `openingDashboard`, call `api.openPluginDashboard(pluginId, dashboardId)`, refresh logs, and set status to `Dashboard 已打开`.

- [ ] **Step 2: Render dashboard buttons**

For each `plugin.entries.dashboards`, render a `ghost` button disabled when the plugin is disabled or currently opening.

- [ ] **Step 3: Verify UI compile/smoke**

Run:

```bash
npm run typecheck
npm run test:control-center
```

Expected: typecheck and Playwright baseline pass.

### Task 4: Docs, Review, Verification, Commit

**Files:**
- Create: `docs/phases/phase-57-plugin-dashboard-open.md`
- Create: `docs/reviews/phase-57-plugin-dashboard-open-review.md`
- Modify: live docs that mention extension dashboard runtime limitations.

- [ ] **Step 1: Write Phase 57 docs**

Record scope, boundaries, changed files, tests, and limitations: dashboard opening is explicit and external; service lifecycle, setup, health, and shell execution remain future work.

- [ ] **Step 2: Run production review**

Use `$production-code-quality-review` and record findings in `docs/reviews/phase-57-plugin-dashboard-open-review.md`.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run check:syntax
npm run typecheck
npm run test:control-center
npm test
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

- [ ] **Step 4: Commit and push**

Run:

```bash
git add .
git commit -m "feat: open plugin dashboard entries"
git push
```
