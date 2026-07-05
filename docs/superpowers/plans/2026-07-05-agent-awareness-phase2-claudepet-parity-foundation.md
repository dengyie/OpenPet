# Agent Awareness Phase 2 ClaudePet Parity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Agent Awareness Phase A so OpenPet can officially install/uninstall Codex hooks, reconcile hook plus polling signals into a richer runtime model, auto-start after approval plus opt-in, and expose first-class session detail entrypoints.

**Architecture:** Keep `PetService` as the pet-state authority and keep Codex-specific parsing inside the bundled plugin. Promote the existing repository hook helper into shared install/uninstall logic, widen the plugin service/session model to one canonical runtime session shape, then wire Control Center and pet-side entrypoints to the existing dashboard/deep-link path instead of inventing a second detail transport.

**Tech Stack:** Electron main process services, bundled runtime plugin commands, React Control Center, TypeScript shared contracts, Node native test runner, Playwright

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/ef96/OpenPet` on branch `codex/dev7`.
- Keep the milestone scoped to Agent Awareness Phase A from `docs/superpowers/specs/2026-07-05-agent-awareness-claudepet-parity-design.md`.
- `PetService` stays the single pet-state authority.
- Agent-specific parsing stays in the bundled plugin.
- Expand metadata richness before content richness.
- Raw prompt bodies, model responses, tool arguments, tool outputs, terminal transcript, stdout/stderr mirroring, and full local paths remain out of scope.
- Automation must be explicit and reversible.
- All new user-facing configuration must remain operable through the Control Center UI.
- `npm start` must remain functional.
- Use `apply_patch` for file edits.
- Do not claim manual hook trust, manual desktop acceptance, or release evidence completion in this milestone.

---

## File Structure

- Modify: `examples/plugins/agent-awareness/plugin.json`
  - Promote `install-codex-hooks` and `uninstall-codex-hooks` into the official command surface.
- Create: `examples/plugins/agent-awareness/commands/codex-hook-config.js`
  - Shared reversible install/uninstall library used by plugin commands and the repo helper script.
- Modify: `examples/plugins/agent-awareness/commands/install-codex-hooks.js`
- Modify: `examples/plugins/agent-awareness/commands/uninstall-codex-hooks.js`
- Modify: `examples/plugins/agent-awareness/commands/codex-hook-plan.js`
  - Keep token/plan helpers while adding shared hook-install state helpers.
- Modify: `scripts/configure-agent-awareness-codex.js`
  - Reuse the shared library instead of maintaining a divergent install path.
- Modify: `examples/plugins/agent-awareness/service/session-store.js`
- Modify: `examples/plugins/agent-awareness/service/agent-awareness-service.js`
- Create: `examples/plugins/agent-awareness/service/runtime-session.js`
  - Canonical runtime session normalization and merge helpers for hook and polling events.
- Modify: `examples/plugins/agent-awareness/service/adapters/codex-rollout-poller.js`
- Create: `examples/plugins/agent-awareness/service/adapters/codex-hook.js`
  - Normalize bounded hook events into the canonical runtime event shape.
- Modify: `examples/plugins/agent-awareness/service/state-mapper.js`
- Modify: `src/main/services/plugin-service.js`
  - Add bounded Agent Awareness auto-start orchestration after approval plus opt-in.
- Modify: `src/main/services/plugin-service-state.js`
- Modify: `src/main/control-center-adapters.js`
- Modify: `src/main/ipc/register-plugin-ipc.js`
- Modify: `src/main/ipc.js`
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/ipc-channels.js`
- Modify: `control-center-preload.js`
- Modify: `src/control-center/src/hooks/usePluginsPane.ts`
- Modify: `src/control-center/src/panes/PluginsPane.tsx`
- Modify: `src/control-center/src/api/demo-control-center-api.ts`
- Modify: `src/main/pet-bubble-chat-window.js`
  - Add the pet-side entry trigger for Agent Awareness detail.
- Test: `tests/examples/agent-awareness-plugin.test.js`
- Test: `tests/scripts/configure-agent-awareness-codex.test.js`
- Test: `tests/services/agent-awareness-plugin-service.test.js`
- Test: `tests/services/agent-awareness-bundled-integration.test.js`
- Test: `tests/services/plugin-service.test.js`
- Test: `tests/main/control-center-adapters.test.js`
- Test: `tests/main/ipc-plugin-install.test.js`
- Test: `tests/control-center/control-center-smoke.spec.js`
- Modify after behavior changes land: `docs/agent-awareness-development-design.md`, `docs/agent-awareness-plugin-design.md`, `examples/plugins/agent-awareness/README.md`, `docs/README.md`

## Task 1: Ship Official Reversible Hook Install And Uninstall Commands

**Files:**
- Create: `examples/plugins/agent-awareness/commands/codex-hook-config.js`
- Modify: `examples/plugins/agent-awareness/commands/install-codex-hooks.js`
- Modify: `examples/plugins/agent-awareness/commands/uninstall-codex-hooks.js`
- Modify: `examples/plugins/agent-awareness/commands/codex-hook-plan.js`
- Modify: `examples/plugins/agent-awareness/plugin.json`
- Modify: `scripts/configure-agent-awareness-codex.js`
- Modify: `tests/examples/agent-awareness-plugin.test.js`
- Modify: `tests/scripts/configure-agent-awareness-codex.test.js`

**Interfaces:**
- Consumes:
  - `writeCodexHookPlan({ dataDir, port })`
  - existing merge/remove helpers from `scripts/configure-agent-awareness-codex.js`
- Produces:
  - `installCodexHooks(options) -> { ok, installed, hooksChanged, hookScriptChanged, backupPath, stateFile, serviceUrl, nextStep }`
  - `uninstallCodexHooks(options) -> { ok, removed, hooksChanged, hookScriptRemoved, backupPath, stateFile, nextStep }`
  - `hook-install-state.json` stored in plugin-owned data

- [ ] **Step 1: Write failing tests for official command promotion and reversible uninstall**

```js
test('agent awareness manifest exposes install and uninstall hook commands', () => {
  assert.deepEqual(
    manifest.entries.commands.map((entry) => entry.id),
    ['doctor', 'codex-hook-plan', 'install-codex-hooks', 'uninstall-codex-hooks']
  )
})

test('install and uninstall commands only mutate OpenPet-owned Codex hook handlers', () => {
  const install = runCommand('install-codex-hooks.js', { paths: { dataDir }, port: 8795 }, env)
  const uninstall = runCommand('uninstall-codex-hooks.js', { paths: { dataDir } }, env)

  assert.equal(JSON.parse(install.stdout).installed, true)
  assert.equal(JSON.parse(uninstall.stdout).removed, true)
  assert.equal(readHooksJson().hooks.Stop[0].hooks[0].command, 'echo existing-stop')
})
```

- [ ] **Step 2: Run focused tests to verify RED**

Run: `node --test tests/examples/agent-awareness-plugin.test.js tests/scripts/configure-agent-awareness-codex.test.js`
Expected: FAIL because the manifest does not expose the commands and uninstall is still manual-only.

- [ ] **Step 3: Implement one shared reversible hook-config library and reuse it everywhere**

```js
const HOOK_STATE_FILE = 'hook-install-state.json'

const installCodexHooks = ({ codexHome, dataDir, port, dryRun }) => {
  const existingConfig = readHooksConfig(hooksPath)
  const nextConfig = mergeOpenPetHooks({ existingConfig, dataDir, port, scriptPath })
  const backupPath = hooksChanged ? backupFile({ filePath: hooksPath, dryRun }) : ''
  writeFileIfChanged({ filePath: hooksPath, content: JSON.stringify(nextConfig, null, 2), mode: 0o600, dryRun })
  writeHookInstallState({ dataDir, hooksPath, hookScriptPath, backupPath, events: OPENPET_HOOK_EVENTS, dryRun })
  return { ok: true, installed: true, hooksChanged, hookScriptChanged, backupPath, stateFile: HOOK_STATE_FILE }
}

const uninstallCodexHooks = ({ codexHome, dataDir, dryRun }) => {
  const existingConfig = readHooksConfig(hooksPath)
  const nextConfig = removeOpenPetHandlers(existingConfig)
  writeFileIfChanged({ filePath: hooksPath, content: JSON.stringify(nextConfig, null, 2), mode: 0o600, dryRun })
  removeFileIfOwned({ filePath: hookScriptPath, dryRun })
  clearHookInstallState({ dataDir, dryRun })
  return { ok: true, removed: true, hooksChanged, hookScriptRemoved, backupPath, stateFile: HOOK_STATE_FILE }
}
```

Expose the commands in `plugin.json`:

```json
{ "id": "install-codex-hooks", "title": "Install Codex Hooks", "command": "node ./commands/install-codex-hooks.js", "cwd": "." }
{ "id": "uninstall-codex-hooks", "title": "Uninstall Codex Hooks", "command": "node ./commands/uninstall-codex-hooks.js", "cwd": "." }
```

Make `scripts/configure-agent-awareness-codex.js` call the shared library instead of owning a second code path.

- [ ] **Step 4: Re-run focused hook verification**

Run: `node --test tests/examples/agent-awareness-plugin.test.js tests/scripts/configure-agent-awareness-codex.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add examples/plugins/agent-awareness/plugin.json examples/plugins/agent-awareness/commands/codex-hook-config.js examples/plugins/agent-awareness/commands/install-codex-hooks.js examples/plugins/agent-awareness/commands/uninstall-codex-hooks.js examples/plugins/agent-awareness/commands/codex-hook-plan.js scripts/configure-agent-awareness-codex.js tests/examples/agent-awareness-plugin.test.js tests/scripts/configure-agent-awareness-codex.test.js
git commit -m "feat(phase-1): ship reversible agent-awareness hook commands"
```

## Task 2: Reconcile Hook Plus Polling Into A Richer Runtime Session Model And Auto-Start Flow

**Files:**
- Create: `examples/plugins/agent-awareness/service/runtime-session.js`
- Create: `examples/plugins/agent-awareness/service/adapters/codex-hook.js`
- Modify: `examples/plugins/agent-awareness/service/session-store.js`
- Modify: `examples/plugins/agent-awareness/service/agent-awareness-service.js`
- Modify: `examples/plugins/agent-awareness/service/adapters/codex-rollout-poller.js`
- Modify: `examples/plugins/agent-awareness/service/state-mapper.js`
- Modify: `src/main/services/plugin-service.js`
- Modify: `tests/examples/agent-awareness-plugin.test.js`
- Modify: `tests/services/agent-awareness-plugin-service.test.js`
- Modify: `tests/services/agent-awareness-bundled-integration.test.js`

**Interfaces:**
- Consumes:
  - `normalizeCodexEvent(...)`
  - hook install token/plan helpers
  - `pluginService.startService(pluginId, serviceId)`
- Produces:
  - `normalizeCodexHookEvent(rawHook, { now }) -> RuntimeEvent`
  - `upsertRuntimeEvent(event) -> AgentRuntimeSession`
  - `maybeAutostartAgentAwareness({ pluginId, serviceId, signalSource })`

- [ ] **Step 1: Write failing tests for hook ingestion, richer runtime fields, and auto-start gating**

```js
test('agent awareness server merges hook and poller events into one runtime session shape', async () => {
  await service.handleEvent({ adapter: 'codex', sessionId: 'raw', type: 'PreToolUse', toolName: 'exec_command', progressLabel: 'Running tool' })
  const session = service.store.listSessions()[0]
  assert.equal(session.phase, 'tool')
  assert.equal(session.toolName, 'exec_command')
  assert.equal(session.progressLabel, 'Running tool')
})

test('bundled agent-awareness auto-start waits for approval and explicit opt-in', async () => {
  await service.maybeAutostartAgentAwareness('openpet.agent-awareness', 'agent-awareness', { signalSource: 'codex-rollout' })
  assert.deepEqual(startCalls, [['openpet.agent-awareness', 'agent-awareness']])
})
```

- [ ] **Step 2: Run the focused backend tests to verify RED**

Run: `node --test tests/examples/agent-awareness-plugin.test.js tests/services/agent-awareness-plugin-service.test.js tests/services/agent-awareness-bundled-integration.test.js`
Expected: FAIL because sessions are still thin, hook events are not normalized, and auto-start does not exist.

- [ ] **Step 3: Implement the canonical runtime model and bounded auto-start path**

```js
const createRuntimeSession = (previous, event) => ({
  adapter: 'codex',
  sessionId: event.sessionId,
  project: event.project || previous?.project || '',
  status: event.status || previous?.status || 'working',
  phase: event.phase || previous?.phase || 'session',
  type: event.type || previous?.type || 'session.updated',
  message: event.message || previous?.message || '',
  toolName: event.toolName || previous?.toolName || '',
  progressLabel: event.progressLabel || previous?.progressLabel || '',
  progressStep: event.progressStep || previous?.progressStep || '',
  progressCurrent: event.progressCurrent ?? previous?.progressCurrent ?? null,
  progressTotal: event.progressTotal ?? previous?.progressTotal ?? null,
  approvalState: event.approvalState || previous?.approvalState || '',
  active: event.active !== false,
  lastSource: event.source || previous?.lastSource || 'poller',
  timestamp: event.timestamp || previous?.timestamp || new Date().toISOString()
})
```

```js
const maybeAutostartAgentAwareness = async ({ pluginId, serviceId, signalSource }) => {
  if (pluginId !== 'openpet.agent-awareness' || serviceId !== 'agent-awareness') return false
  if (!getEnabledMap()[pluginId]) return false
  if (!getNativeExecutionApproved(pluginId)) return false
  if (!getPluginConfig(pluginId)?.autoStartOnCodexSignal) return false
  if (ACTIVE_SERVICE_STATUSES.has(getPluginServiceRuntime(pluginId, serviceId)?.status)) return false
  await startService(pluginId, serviceId)
  appendLog({ pluginId, commandId: `service:${serviceId}`, level: 'info', message: `Agent Awareness auto-started from ${signalSource}` })
  return true
}
```

Keep hook metadata bounded: map only session, turn, tool, approval, and progress fields; continue excluding prompt/transcript payloads.

- [ ] **Step 4: Re-run focused backend verification**

Run: `node --test tests/examples/agent-awareness-plugin.test.js tests/services/agent-awareness-plugin-service.test.js tests/services/agent-awareness-bundled-integration.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add examples/plugins/agent-awareness/service/runtime-session.js examples/plugins/agent-awareness/service/adapters/codex-hook.js examples/plugins/agent-awareness/service/session-store.js examples/plugins/agent-awareness/service/agent-awareness-service.js examples/plugins/agent-awareness/service/adapters/codex-rollout-poller.js examples/plugins/agent-awareness/service/state-mapper.js src/main/services/plugin-service.js tests/examples/agent-awareness-plugin.test.js tests/services/agent-awareness-plugin-service.test.js tests/services/agent-awareness-bundled-integration.test.js
git commit -m "feat(phase-2): add dual-ingestion runtime session model"
```

## Task 3: Add Control Center And Pet-Side Detail Entry Surfaces

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/ipc-channels.js`
- Modify: `control-center-preload.js`
- Modify: `src/main/control-center-adapters.js`
- Modify: `src/main/ipc/register-plugin-ipc.js`
- Modify: `src/main/ipc.js`
- Modify: `src/control-center/src/hooks/usePluginsPane.ts`
- Modify: `src/control-center/src/panes/PluginsPane.tsx`
- Modify: `src/control-center/src/api/demo-control-center-api.ts`
- Modify: `src/main/pet-bubble-chat-window.js`
- Modify: `tests/main/control-center-adapters.test.js`
- Modify: `tests/main/ipc-plugin-install.test.js`
- Modify: `tests/control-center/control-center-smoke.spec.js`
- Modify: `docs/agent-awareness-development-design.md`
- Modify: `docs/agent-awareness-plugin-design.md`
- Modify: `examples/plugins/agent-awareness/README.md`

**Interfaces:**
- Consumes:
  - existing `pluginService.openDashboard(pluginId, dashboardId, options)`
  - canonical runtime session response from `/api/sessions`
- Produces:
  - `window.controlCenterAPI.openPluginDashboard(pluginId, dashboardId, { query })`
  - Agent Awareness-specific detail entry buttons that deep-link with `?sessionId=<id>&view=details`

- [ ] **Step 1: Write failing UI and adapter tests for the new detail entrypoints**

```js
test('plugin adapters preserve deep-linked dashboard open options for Agent Awareness detail entry', async () => {
  const result = await ipcMain.handlers.get(IPC.PLUGINS_OPEN_DASHBOARD)(null, {
    pluginId: 'openpet.agent-awareness',
    dashboardId: 'main',
    options: { query: { sessionId: 'abc123', view: 'details' } }
  })
  assert.equal(result.url.includes('sessionId=abc123'), true)
})
```

```js
test('opens agent-awareness details from the Plugins pane with the demo API', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Plugins' }).click()
  await page.getByRole('button', { name: '查看 Codex 详情' }).click()
  await expect(page.locator('.plugin-log-row', { hasText: 'Dashboard opened' })).toContainText('dashboard:main')
})
```

- [ ] **Step 2: Run targeted UI and IPC checks to verify RED**

Run: `node --test tests/main/control-center-adapters.test.js tests/main/ipc-plugin-install.test.js`
Expected: FAIL because the detail buttons and Agent Awareness deep-link plumbing do not exist yet.

Run: `npm run test:control-center -- tests/control-center/control-center-smoke.spec.js -g "agent-awareness"`
Expected: FAIL because there is no first-class detail entry surface.

- [ ] **Step 3: Implement the smallest useful entry surfaces and sync live docs**

In `PluginsPane.tsx`, add Agent Awareness-specific buttons instead of a generic redesign:

```tsx
{plugin.id === 'openpet.agent-awareness' ? (
  <div className="plugin-config-panel">
    <div className="plugin-config-header">
      <strong>Codex Awareness</strong>
      <button type="button" className="ghost" onClick={() => onOpenDashboard(plugin.id, 'main')}>
        查看 Codex 详情
      </button>
    </div>
    <div className="field-note">高级入口会打开 Agent Awareness dashboard，并在可用时带上当前会话上下文。</div>
  </div>
) : null}
```

In the pet-side surface, add a bounded detail-open trigger that reuses the same dashboard opener:

```js
mainWindow.webContents.send(IPC.PET_AGENT_AWARENESS_OPEN_DETAIL, {
  pluginId: 'openpet.agent-awareness',
  dashboardId: 'main',
  query: { view: 'details' }
})
```

Update the live docs so the current contract now says the hook install/uninstall commands are shipped and the detail entry exists.

- [ ] **Step 4: Run milestone verification**

Run: `node --test tests/examples/agent-awareness-plugin.test.js tests/scripts/configure-agent-awareness-codex.test.js tests/services/agent-awareness-plugin-service.test.js tests/services/agent-awareness-bundled-integration.test.js tests/main/control-center-adapters.test.js tests/main/ipc-plugin-install.test.js`
Expected: PASS

Run: `npm run test:control-center -- tests/control-center/control-center-smoke.spec.js -g "agent-awareness"`
Expected: PASS

Run: `npm run check:docs-drift`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/openpet-contracts.ts src/shared/ipc-channels.ts src/shared/ipc-channels.js control-center-preload.js src/main/control-center-adapters.js src/main/ipc/register-plugin-ipc.js src/main/ipc.js src/control-center/src/hooks/usePluginsPane.ts src/control-center/src/panes/PluginsPane.tsx src/control-center/src/api/demo-control-center-api.ts src/main/pet-bubble-chat-window.js tests/main/control-center-adapters.test.js tests/main/ipc-plugin-install.test.js tests/control-center/control-center-smoke.spec.js docs/agent-awareness-development-design.md docs/agent-awareness-plugin-design.md examples/plugins/agent-awareness/README.md
git commit -m "feat(phase-3): add agent-awareness detail entry surfaces"
```

## Self-Review

- Spec coverage: Task 1 covers official hook install/uninstall and reversible state. Task 2 covers dual ingestion, richer runtime state, and trusted auto-start. Task 3 covers Control Center/pet-side detail entry and live-doc synchronization.
- Placeholder scan: no `TODO` / `TBD` placeholders are left in task steps.
- Type consistency: the runtime-session model is referenced consistently across service, IPC, and UI deep-link tasks.
