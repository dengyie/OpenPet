# Plugin Setup Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit, user-triggered execution for declared `entries.setup` without running setup during install or enable.

**Architecture:** `PluginService` owns setup runtime state, command spawning, logs, and safety checks. IPC/preload and the Control Center API expose one explicit `runPluginSetup(pluginId, setupId)` action. Control Center renders setup status and a disabled-unless-enabled Run Setup button while preserving the Phase 60 rule that setup never runs automatically.

**Tech Stack:** Electron main process, Node `child_process.spawn`, React + TypeScript Control Center, Node native test runner, Playwright smoke tests.

---

### Task 1: PluginService Setup Runtime

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Test: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Write the failing service test**

Add this test near `plugin service lists setup entries with not-run runtime status`:

```js
test('plugin service runs enabled setup entries explicitly and records success runtime', async () => {
  const spawned = []
  const child = createFakeServiceProcess({ pid: 9876 })
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }]
    })],
    spawnServiceProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      queueMicrotask(() => child.emit('exit', 0, null))
      return child
    }
  })

  const result = await service.runSetup('weather-declaration', 'install-deps')

  assert.equal(result.ok, true)
  assert.equal(result.pluginId, 'weather-declaration')
  assert.equal(result.setupId, 'install-deps')
  assert.equal(result.runtime.status, 'succeeded')
  assert.equal(result.runtime.exitCode, 0)
  assert.equal(spawned[0].file, 'npm')
  assert.deepEqual(spawned[0].args, ['install'])
  assert.equal(path.basename(spawned[0].options.cwd), 'weather-declaration')
  assert.equal(spawned[0].options.shell, false)
  assert.equal(service.listPlugins()[0].entries.setup[0].runtime.status, 'succeeded')
  assert.equal(settingsService.get().plugins.logs[0].message, 'Setup completed')
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/services/plugin-service.test.js
```

Expected: FAIL with `service.runSetup is not a function`.

- [ ] **Step 3: Implement minimal setup runtime**

In `createPluginService()`:

- add `const setupRuntimes = new Map()` next to `serviceRuntimes`;
- add `getSetupEntry(plugin, setupId)`;
- add `getPluginSetupRuntime(pluginId, setupId)`;
- update `decorateEntriesWithRuntime()` to read `setupRuntimes.get(createPluginServiceKey(manifest.id, setupEntry.id))`;
- add `runSetup(pluginId, setupId)` that:
  - finds enabled, policy-allowed plugin via `findPluginForService(pluginId)`;
  - finds the setup entry by id;
  - rejects if existing runtime status is `running`;
  - parses the setup command with `parseServiceCommand()`;
  - resolves cwd with `resolveServiceCwd()`;
  - spawns with `{ cwd, env: createServiceProcessEnv(), shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }`;
  - appends stdout/stderr snippets to plugin logs with command id `setup:${setupId}`;
  - resolves on `exit` with runtime status `succeeded` for code `0` and `failed` otherwise;
  - rejects on child `error` after setting runtime status `failed`;
  - returns `{ ok: true, pluginId, setupId, runtime: createSetupRuntimeView(runtime) }`.

Return `runSetup` from the service object.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/services/plugin-service.test.js
```

Expected: PASS for the new test and existing plugin service tests.

- [ ] **Step 5: Add failure and disabled-plugin tests**

Add tests:

```js
test('plugin service rejects setup runs for disabled plugins before spawning', async () => {
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', command: 'npm install' }]
    })],
    spawnServiceProcess: (...args) => {
      spawned.push(args)
      return createFakeServiceProcess()
    }
  })

  await assert.rejects(
    () => service.runSetup('weather-declaration', 'install-deps'),
    /Plugin is disabled/
  )
  assert.deepEqual(spawned, [])
})

test('plugin service records failed setup exit status', async () => {
  const child = createFakeServiceProcess({ pid: 9876 })
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', command: 'npm install' }]
    })],
    spawnServiceProcess: () => {
      queueMicrotask(() => child.emit('exit', 7, null))
      return child
    }
  })

  const result = await service.runSetup('weather-declaration', 'install-deps')

  assert.equal(result.runtime.status, 'failed')
  assert.equal(result.runtime.exitCode, 7)
  assert.equal(service.listPlugins()[0].entries.setup[0].runtime.status, 'failed')
})
```

- [ ] **Step 6: Verify failure coverage**

Run:

```bash
node --test tests/services/plugin-service.test.js
```

Expected: PASS.

### Task 2: IPC, Preload, And Shared Contracts

**Files:**
- Modify: `src/shared/ipc-channels.js`
- Modify: `control-center-preload.js`
- Modify: `src/main/ipc.js`
- Modify: `src/shared/openpet-contracts.ts`
- Test: `tests/main/ipc-plugin-install.test.js`
- Test: `tests/shared/openpet-contracts-type-fixture.ts`

- [ ] **Step 1: Write failing IPC test**

In `tests/main/ipc-plugin-install.test.js`, add a fake `runSetup` method to the plugin service fixture and a handler test mirroring service lifecycle tests:

```js
test('plugin setup handler delegates to plugin service', async () => {
  const calls = []
  const { invoke } = createRegisteredHandlers({
    pluginService: {
      listPlugins: () => [],
      runSetup: (pluginId, setupId) => {
        calls.push({ pluginId, setupId })
        return { ok: true, pluginId, setupId, runtime: { status: 'succeeded' } }
      }
    }
  })

  const result = await invoke('plugins:run-setup', { pluginId: 'weather-declaration', setupId: 'install-deps' })

  assert.deepEqual(calls, [{ pluginId: 'weather-declaration', setupId: 'install-deps' }])
  assert.equal(result.runtime.status, 'succeeded')
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/main/ipc-plugin-install.test.js
```

Expected: FAIL because `plugins:run-setup` is not registered.

- [ ] **Step 3: Add IPC/preload contract**

Add `PLUGINS_RUN_SETUP: 'plugins:run-setup'` in `src/shared/ipc-channels.js` and `control-center-preload.js`. Expose `runPluginSetup: (pluginId, setupId) => ipcRenderer.invoke(IPC.PLUGINS_RUN_SETUP, { pluginId, setupId })`. Register a main handler in `src/main/ipc.js` that calls `pluginService.runSetup(payload.pluginId, payload.setupId)`.

- [ ] **Step 4: Add TypeScript result shape**

In `src/shared/openpet-contracts.ts`, add:

```ts
export interface PluginSetupRunResultViewState {
  ok: boolean
  pluginId: string
  setupId: string
  runtime: PluginSetupRuntimeViewState
}
```

Add a representative result to `tests/shared/openpet-contracts-type-fixture.ts` using `satisfies PluginSetupRunResultViewState`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --test tests/main/ipc-plugin-install.test.js
npm run typecheck
```

Expected: PASS.

### Task 3: Control Center Setup Action

**Files:**
- Modify: `src/control-center/src/api/control-center-api.ts`
- Modify: `src/control-center/src/hooks/usePluginsPane.ts`
- Modify: `src/control-center/src/panes/PluginsPane.tsx`
- Test: `tests/control-center/control-center-smoke.spec.js`

- [ ] **Step 1: Write failing UI smoke expectation**

In the manual plugin install smoke test, after asserting `install-deps · npm install · not-run`, add:

```js
await expect(pluginRow.getByRole('button', { name: 'Run Install Dependencies Setup' })).toBeDisabled()
```

Then enable the plugin and run setup:

```js
await pluginRow.getByRole('button', { name: '启用' }).click()
await expect(pluginRow.getByRole('button', { name: 'Run Install Dependencies Setup' })).toBeEnabled()
await pluginRow.getByRole('button', { name: 'Run Install Dependencies Setup' }).click()
await expect(pluginRow).toContainText('install-deps · npm install · succeeded')
await expect(page.locator('.status')).toContainText('Setup completed')
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run test:control-center
```

Expected: FAIL because there is no setup button.

- [ ] **Step 3: Add API and hook state**

In `control-center-api.ts`, add `runPluginSetup(pluginId, setupId)` to both the real API wrapper and demo API. Demo API should update the matching setup runtime to `{ status: 'succeeded', lastRunAt: new Date().toISOString(), exitCode: 0, error: '' }`, append log `Setup completed`, and return `{ ok: true, pluginId, setupId, runtime }`.

In `usePluginsPane.ts`, add `runningSetup`, `onRunSetup(pluginId, setupId)`, refresh plugins/logs after success or failure, and expose both through `paneProps`.

- [ ] **Step 4: Render setup buttons**

In `PluginsPane.tsx`, add a setup command section for `plugin.entries.setup`. Each button label is `Run ${setup.title} Setup`, disabled when the plugin is disabled, blocked, or already running. Runtime text continues to be shown by `PluginEntryDetails`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm run test:control-center
```

Expected: PASS.

### Task 4: Docs, Review, And Full Verification

**Files:**
- Create: `docs/phases/phase-61-plugin-setup-execution.md`
- Create: `docs/reviews/phase-61-plugin-setup-execution-review.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/plugin-ecosystem-rules.md`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-context.json`
- Modify: `docs/project-status-review.md`

- [ ] **Step 1: Document current facts**

Record that setup execution is explicit, user-triggered, logged, status-bearing, not run during install, not run on enable by default, and still not generic background automation. Keep shell wording honest: commands are spawned without shell expansion.

- [ ] **Step 2: Run production review**

Use:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Review setup execution, IPC exposure, UI disabled states, logs, and docs. Save findings and fixes in `docs/reviews/phase-61-plugin-setup-execution-review.md`.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected: all pass. Update live docs with the actual `npm test` count only after the full run.

- [ ] **Step 4: Commit and push**

```bash
git add src shared tests docs README.md README.zh-CN.md control-center-preload.js
git commit -m "feat: run plugin setup entries"
git push -u origin codex/plugin-setup-execution
```

## Self-Review

- Spec coverage: explicit setup execution, logs, runtime status, IPC, Control Center operation, docs, review, and verification are covered.
- Placeholder scan: no `TBD`, `TODO`, or undefined follow-up steps remain.
- Type consistency: the plan uses `setupId`, `PluginSetupRuntimeViewState`, and `PluginSetupRunResultViewState` consistently across service, IPC, API, and UI.
