# Plugin Setup and Command Cleanup Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make explicit setup runs and declaration-only command runs stay in a visible shutdown state until child exit confirmation, instead of claiming immediate stop completion.

**Architecture:** Keep `PluginService` as the single owner of setup, command, and service runtime state. Reuse the service-phase stop-intent pattern for setup and declaration-only command cleanup, but keep the implementation limited to direct-child best effort rather than introducing process-group or force-stop behavior for these runtimes.

**Tech Stack:** Electron main process, CommonJS Node services, Node native test runner, existing Control Center plugin runtime contracts.

---

## File Map

- Modify: `src/main/services/plugin-service.js`
  Purpose: add stop-intent state for setup and declaration-only command runtimes, preserve direct-child cleanup, and tighten exit/log handling.
- Modify: `tests/services/plugin-service.test.js`
  Purpose: add TDD coverage for setup/command cleanup intent, exit-confirmation, and cleanup failure semantics.
- Modify: `src/shared/openpet-contracts.ts`
  Purpose: widen setup runtime status contract if the runtime surface needs a non-terminal shutdown state.
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
  Purpose: keep representative shared-contract payloads aligned with the updated runtime contract.
- Create: `docs/phases/phase-70-plugin-setup-command-cleanup-parity.md`
  Purpose: record the delivered scope, verification, and remaining limits.
- Create: `docs/reviews/phase-70-plugin-setup-command-cleanup-parity-review.md`
  Purpose: record production review findings, score, and pass status.
- Modify: `docs/HANDOFF.md`
  Purpose: refresh the current extension cleanup boundary.
- Modify: `docs/development-summary.md`
  Purpose: refresh current capability summary and next-step wording.
- Modify: `docs/project-status-review.md`
  Purpose: reflect the setup/command cleanup parity boundary in the current status snapshot.
- Modify: `docs/project-context.json`
  Purpose: update machine-readable current facts.
- Modify: `docs/productization-v1.1-todo-design.md`
  Purpose: add Phase 70 to the execution design and priority order.
- Modify: `docs/project-review-todo-design.md`
  Purpose: add Phase 70 to the consolidated whole-project review TODO design.
- Modify: `docs/plugin-development.md`
  Purpose: keep extension runtime cleanup wording honest.
- Modify: `docs/plugin-ecosystem-rules.md`
  Purpose: keep ecosystem rules aligned with the new cleanup boundary.

## Task 1: Write failing setup and command cleanup tests

**Files:**
- Modify: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Add a command cleanup test that stays non-terminal until exit**

```js
test('plugin service keeps declaration commands in stopping state until exit after disable cleanup', async () => {
  const child = createSlowStoppingServiceProcess()
  let started = false
  const settingsService = createSettingsService({
    plugins: { enabled: { 'weather-declaration': true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: () => {
      started = true
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  await waitFor(() => started)
  service.setEnabled('weather-declaration', false)

  assert.deepEqual(child.killCalls, ['SIGTERM'])
  assert.equal(settingsService.get().plugins.logs.some((entry) => entry.message === 'Command stop requested'), true)

  child.emit('exit', 0, 'SIGTERM')

  await assert.rejects(commandRun, /Command stopped/)
})
```

- [ ] **Step 2: Add a setup cleanup test that stays non-terminal until exit**

```js
test('plugin service keeps setup in stopping state until exit after shutdown cleanup', () => {
  const child = createSlowStoppingServiceProcess()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }]
    })],
    spawnSetupProcess: () => child
  })

  service.runSetup('weather-declaration', 'install-deps')
  service.stopAllServices()

  const runtimeBeforeExit = service.listPlugins()[0].entries.setup[0].runtime
  assert.equal(runtimeBeforeExit.status, 'stopping')
  assert.deepEqual(child.killCalls, ['SIGTERM'])

  child.emit('exit', 0, 'SIGTERM')

  const runtimeAfterExit = service.listPlugins()[0].entries.setup[0].runtime
  assert.equal(runtimeAfterExit.status, 'failed')
})
```

- [ ] **Step 3: Add a cleanup-failure test for setup stop intent**

```js
test('plugin service marks setup cleanup failure as failed when child kill throws', () => {
  const child = createSlowStoppingServiceProcess()
  child.kill = () => {
    throw new Error('setup stop failed')
  }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      setupEntries: [{ id: 'install-deps', title: 'Install Dependencies', command: 'npm install', cwd: '.' }]
    })],
    spawnSetupProcess: () => child
  })

  service.runSetup('weather-declaration', 'install-deps')
  service.stopAllServices()

  const runtime = service.listPlugins()[0].entries.setup[0].runtime
  assert.equal(runtime.status, 'failed')
  assert.match(runtime.error, /setup stop failed/)
})
```

- [ ] **Step 4: Run targeted tests and verify RED**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service keeps declaration commands in stopping state until exit after disable cleanup|plugin service keeps setup in stopping state until exit after shutdown cleanup|plugin service marks setup cleanup failure as failed when child kill throws"
```

Expected before implementation:

- FAIL because setup runtime has no `stopping` state and command/setup cleanup still claim immediate terminal failure.

## Task 2: Implement setup and command cleanup parity

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`

- [ ] **Step 1: Widen setup runtime contract for a non-terminal cleanup state**

Change:

```ts
export type PluginSetupRuntimeStatus = 'not-run' | 'running' | 'succeeded' | 'failed'
```

to:

```ts
export type PluginSetupRuntimeStatus = 'not-run' | 'running' | 'stopping' | 'succeeded' | 'failed'
```

Then update the shared fixture to include the widened union without breaking existing payload examples.

- [ ] **Step 2: Make setup cleanup record stop intent before exit**

Change `stopPluginSetupRuntime()` so it:

- sets `status = 'stopping'`,
- records `lastRunAt`,
- clears terminal error before the stop attempt,
- sends `SIGTERM`,
- logs `Setup stop requested`,
- only moves to `failed` immediately if the stop attempt itself throws.

- [ ] **Step 3: Make setup exit handling resolve terminal status after confirmation**

Update the setup child `exit` handler so:

- a requested stop becomes terminal only in the exit callback;
- exit-confirmed cleanup lands on `failed` with `Setup stopped`;
- clean non-requested exits still map to `succeeded`;
- logs distinguish `Setup stop requested`, `Setup stopped`, `Setup completed`, and `Setup failed`.

- [ ] **Step 4: Make declaration-only command cleanup record stop intent before exit**

Change `stopPluginCommandRuntime()` and the in-flight command runtime so:

- cleanup first marks runtime `stopping`,
- runtime stores enough stop-intent metadata for the exit callback,
- direct-child `SIGTERM` is still the only stop mechanism,
- the returned promise still rejects with `Command stopped`, but only after the child exit callback or an immediate cleanup failure.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service keeps declaration commands in stopping state until exit after disable cleanup|plugin service keeps setup in stopping state until exit after shutdown cleanup|plugin service marks setup cleanup failure as failed when child kill throws|plugin service stops running declaration commands when a plugin is disabled|plugin service stops running declaration commands during app shutdown cleanup|plugin service stops running setup when a plugin is disabled|plugin service stops running setup during app shutdown cleanup"
```

Expected:

- PASS with the new stop-intent boundary and without breaking existing disable/shutdown cleanup behavior.

## Task 3: Document Phase 70 and live facts

**Files:**
- Create: `docs/phases/phase-70-plugin-setup-command-cleanup-parity.md`
- Create: `docs/reviews/phase-70-plugin-setup-command-cleanup-parity-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-review-todo-design.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/plugin-ecosystem-rules.md`

- [ ] **Step 1: Record the phase scope and decision record**

The phase doc must state:

- setup and declaration-only command cleanup now expose stop intent before terminal completion;
- cleanup remains direct-child best effort rather than process-tree guaranteed;
- services still own the stronger process-group/grace-period path;
- no bridge, health, setup auto-run, or evidence work was added.

- [ ] **Step 2: Refresh live docs**

Update live docs so they describe:

- setup, command, and service cleanup boundaries separately and honestly;
- setup/command cleanup parity as complete;
- hard process-tree guarantees as still future work.

## Task 4: Production review, verification, commit, push

**Files:**
- All changed files

- [ ] **Step 1: Run production review**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Inspect the Phase 70 diff and write the review result with:

- severe issues,
- improvement suggestions,
- quality score,
- pass status (`通过` / `有条件通过` / `不通过`).

- [ ] **Step 2: Run complete verification**

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
git add src/main/services/plugin-service.js tests/services/plugin-service.test.js src/shared/openpet-contracts.ts tests/shared/openpet-contracts-type-fixture.ts docs/phases/phase-70-plugin-setup-command-cleanup-parity.md docs/reviews/phase-70-plugin-setup-command-cleanup-parity-review.md docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/project-context.json docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md docs/plugin-development.md docs/plugin-ecosystem-rules.md docs/superpowers/specs/2026-06-17-plugin-setup-command-cleanup-phase70-design.md docs/superpowers/plans/2026-06-17-plugin-setup-command-cleanup-phase70.md
git commit -m "feat: add plugin setup and command cleanup parity"
git push -u origin codex/plugin-setup-command-cleanup-phase70
```

## Self-Review

- Spec coverage: setup and declaration-only command cleanup parity is the only new runtime capability; services, bridge, health, and evidence work remain out of scope.
- Placeholder scan: no TBD placeholders remain.
- Type consistency: setup runtime widening is explicit; command promise semantics stay rejection-based for stop conditions.
- Scope check: this is a single implementation slice for a single next-phase gap called out by the live docs.
