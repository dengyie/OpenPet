# Plugin Setup Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 60 support for declared plugin setup steps and visible setup status without executing setup commands.

**Architecture:** Extend the manifest `entries` model with `setup` declarations, then carry that shape through shared contracts, demo/review payloads, and Control Center entry details. `PluginService` owns a read-only runtime setup view (`not-run` for declared setup entries) so status appears consistently for installed plugins without introducing a command runner or shell execution path.

**Tech Stack:** Electron main process, Node native test runner, React + TypeScript Control Center, Playwright UI smoke tests, existing plugin manifest normalization.

---

## File Map

- `src/main/plugins/manifest.js`: normalize `entries.setup` arrays with safe ids, titles, commands, and plugin-local cwd strings.
- `tests/plugins/manifest.test.js`: prove setup declarations normalize and unsafe setup cwd/id values are rejected.
- `src/shared/openpet-contracts.ts`: add `PluginSetupEntryViewState`, `PluginSetupRuntimeViewState`, and `entries.setup`.
- `tests/shared/openpet-contracts-type-fixture.ts`: keep representative payloads aligned with setup entries.
- `src/main/services/plugin-service.js`: decorate setup entries with runtime status `not-run`.
- `tests/services/plugin-service.test.js`: prove setup entries are listed with status and not treated as runnable plugin commands.
- `src/control-center/src/components/PluginEntryDetails.tsx`: render setup entries in review and installed plugin declaration details.
- `src/control-center/src/api/control-center-api.ts`: include setup declarations in demo catalog/manual review entries and clone them.
- `tests/control-center/control-center-smoke.spec.js`: assert setup entries are visible in review and installed plugin rows.
- `docs/phases/phase-60-plugin-setup-status.md`: phase record.
- `docs/reviews/phase-60-plugin-setup-status-review.md`: production review record.
- Live docs: update `README*`, `docs/HANDOFF.md`, `docs/development-summary.md`, `docs/project-context.json`, `docs/project-status-review.md`, `docs/project-review-todo-design.md`, `docs/productization-v1.1-todo-design.md`, `docs/plugin-development.md`, and `docs/plugin-ecosystem-rules.md`.

## Task 1: Manifest Setup Declarations

**Files:**
- Modify: `tests/plugins/manifest.test.js`
- Modify: `src/main/plugins/manifest.js`

- [ ] **Step 1: Write failing manifest tests**

Add setup declarations to `normalizes extension manifest entries and declaration fields`:

```js
setup: [
  {
    id: 'install-deps',
    title: 'Install Dependencies',
    command: 'npm install',
    cwd: '.'
  }
]
```

Assert:

```js
assert.deepEqual(manifest.entries.setup, [
  {
    id: 'install-deps',
    title: 'Install Dependencies',
    command: 'npm install',
    cwd: '.'
  }
])
```

Add rejection cases:

```js
assert.throws(() => normalizePluginManifest({
  id: 'bad-entry',
  name: 'Bad Entry',
  version: '1.0.0',
  entries: { setup: [{ id: '../setup', command: 'npm install' }] }
}), /Plugin setup entry id must be a safe id/)

assert.throws(() => normalizePluginManifest({
  id: 'bad-entry',
  name: 'Bad Entry',
  version: '1.0.0',
  entries: { setup: [{ id: 'setup', command: 'npm install', cwd: '../escape' }] }
}), /Plugin setup entry cwd must be a safe relative path/)
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/plugins/manifest.test.js
```

Expected: fail because `manifest.entries.setup` is missing and unsafe setup entries are not validated.

- [ ] **Step 3: Implement setup normalization**

In `src/main/plugins/manifest.js`, add:

```js
const normalizeSetupEntries = (setupEntries = []) => {
  if (!Array.isArray(setupEntries)) throw new Error('Plugin entries.setup must be an array')
  return setupEntries.map((setup) => {
    if (!setup?.id) throw new Error('Plugin setup entry id is required')
    assertSafeId(setup.id, 'setup entry id')
    return {
      id: setup.id,
      title: setup.title || setup.name || setup.id,
      command: normalizeShellCommand(setup.command, 'setup'),
      cwd: normalizeCwd(setup.cwd, 'setup entry cwd')
    }
  })
}
```

Update `normalizeExtensionEntries()` to return:

```js
setup: normalizeSetupEntries(entries.setup || []),
commands: normalizeEntryCommands(entries.commands || []),
services: normalizeServiceEntries(entries.services || []),
dashboards: normalizeDashboardEntries(entries.dashboards || [])
```

and the no-entries default to include `setup: []`.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test tests/plugins/manifest.test.js
```

Expected: all manifest tests pass.

## Task 2: Shared Contracts And Service Listing

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
- Modify: `tests/services/plugin-service.test.js`
- Modify: `src/main/services/plugin-service.js`

- [ ] **Step 1: Write failing service/type tests**

In `tests/services/plugin-service.test.js`, extend the declaration-only plugin fixture to optionally include:

```js
setup: [{
  id: 'install-deps',
  title: 'Install Dependencies',
  command: 'npm install',
  cwd: '.'
}]
```

Add test:

```js
test('plugin service lists setup entries with not-run runtime status', () => {
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }]
    })]
  })

  const plugin = service.listPlugins()[0]

  assert.deepEqual(plugin.entries.setup, [{
    id: 'install-deps',
    title: 'Install Dependencies',
    command: 'npm install',
    cwd: '.',
    runtime: { status: 'not-run', lastRunAt: '', exitCode: null, error: '' }
  }])
  assert.equal(plugin.commands.some((command) => command.id === 'install-deps'), false)
})
```

In `tests/shared/openpet-contracts-type-fixture.ts`, add a setup entry to the representative plugin payload.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/services/plugin-service.test.js
npm run typecheck
```

Expected: service test fails because setup runtime is missing; typecheck fails until contracts include `entries.setup`.

- [ ] **Step 3: Implement setup contracts and runtime view**

In `src/shared/openpet-contracts.ts`, add:

```ts
export type PluginSetupRuntimeStatus = 'not-run' | 'running' | 'succeeded' | 'failed'

export interface PluginSetupRuntimeViewState {
  status: PluginSetupRuntimeStatus
  lastRunAt?: string
  exitCode?: number | null
  error?: string
}

export interface PluginSetupEntryViewState {
  id: string
  title: string
  command: string
  cwd: string
  runtime?: PluginSetupRuntimeViewState
}
```

Update `PluginEntriesViewState`:

```ts
setup: PluginSetupEntryViewState[]
commands: PluginCommandEntryViewState[]
services: PluginServiceEntryViewState[]
dashboards: PluginDashboardEntryViewState[]
```

In `src/main/services/plugin-service.js`, add:

```js
const createSetupRuntimeView = (runtime = {}) => ({
  status: runtime.status || 'not-run',
  lastRunAt: runtime.lastRunAt || '',
  exitCode: Number.isFinite(runtime.exitCode) ? runtime.exitCode : null,
  error: runtime.error || ''
})
```

Update `decorateEntriesWithRuntime()` to map setup entries with `runtime: createSetupRuntimeView()`.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test tests/services/plugin-service.test.js
npm run typecheck
```

Expected: both pass.

## Task 3: Control Center Visibility

**Files:**
- Modify: `src/control-center/src/components/PluginEntryDetails.tsx`
- Modify: `src/control-center/src/api/control-center-api.ts`
- Modify: `tests/control-center/control-center-smoke.spec.js`

- [ ] **Step 1: Write failing UI smoke expectations**

Extend the manual plugin review smoke test to assert:

```js
await expect(reviewPanel).toContainText('Setup entries')
await expect(reviewPanel).toContainText('install-deps')
```

After install, assert the plugin row contains:

```js
await expect(pluginRow).toContainText('Setup entries')
await expect(pluginRow).toContainText('install-deps · npm install · not-run')
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm run test:control-center
```

Expected: fail because setup entries are not rendered yet.

- [ ] **Step 3: Implement UI visibility**

In `PluginEntryDetails.tsx`:

- include `entries.setup?.length` in `hasEntries()`;
- render a `Setup entries` section before command entries;
- include runtime status in compact/installed views:

```tsx
<code key={setup.id}>
  {setup.id}{setup.command ? ` · ${setup.command}` : ''}{setup.runtime?.status ? ` · ${setup.runtime.status}` : ''}
</code>
```

In `control-center-api.ts`, clone setup entries and add setup declarations to demo catalog/manual plugin review fixtures.

- [ ] **Step 4: Run GREEN**

Run:

```bash
npm run typecheck
npm run test:control-center
```

Expected: both pass.

## Task 4: Review, Docs, Verification, Commit

**Files:**
- Create: `docs/phases/phase-60-plugin-setup-status.md`
- Create: `docs/reviews/phase-60-plugin-setup-status-review.md`
- Modify: live docs listed in the file map.

- [ ] **Step 1: Run production review**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Review specifically:

- setup declarations are visible but not executable;
- setup commands are not mixed into runnable `commands`;
- unsafe ids and cwd values are rejected;
- docs do not claim setup execution, install-time setup, or dependency installation automation.

- [ ] **Step 2: Fix review findings**

Fix all P0/P1/P2 findings before final verification.

- [ ] **Step 3: Update docs**

Record:

- Phase 60 supports setup declaration normalization and visible `not-run` status;
- setup commands are not executed yet;
- install still only extracts/inspects and keeps extensions disabled;
- future work remains explicit setup execution, bridge, generic shell execution, and process-tree cleanup.

- [ ] **Step 4: Full verification**

Run:

```bash
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

- [ ] **Step 5: Commit and push**

Commit:

```bash
git add .
git commit -m "feat: show plugin setup status"
git push -u origin codex/plugin-setup-status
```

## Self-Review

- Spec coverage: The plan covers setup declarations, visible setup status, Control Center review/install visibility, tests, review, and docs. It intentionally excludes setup execution because generic shell command execution remains a separate risk boundary.
- Placeholder scan: No placeholders, TBDs, or vague "add tests" steps remain.
- Type consistency: `entries.setup`, `PluginSetupEntryViewState`, and `PluginSetupRuntimeViewState` use the same names across manifest, service, contracts, demo API, and UI.
