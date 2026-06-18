# Extension Command Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add Phase 56 runtime support for extension-shaped `entries.commands` while keeping service/dashboard entries as visible declarations.

**Architecture:** Extend manifest normalization first, then let `PluginService` consume the new normalized command list through the existing JavaScript compatibility runner. Keep shell command execution, service process management, dashboard opening, and sandbox wording out of scope.

**Tech Stack:** Node.js CommonJS main-process code, Node native test runner, TypeScript shared contracts, existing Electron Control Center plugin view contracts.

---

### Task 1: Add Manifest Entry Normalization

**Files:**
- Modify: `src/main/plugins/manifest.js`
- Modify: `tests/plugins/manifest.test.js`

- [x] **Step 1: Write the failing manifest test**

Add this test to `tests/plugins/manifest.test.js`:

```js
test('normalizes extension entries and derives commands when legacy commands are absent', () => {
  const manifest = normalizePluginManifest({
    id: 'weather-morning',
    name: 'Weather Morning',
    version: '1.0.0',
    main: 'index.js',
    entries: {
      commands: [
        { id: 'announce', title: 'Announce Weather', command: 'node ./commands/announce.js', cwd: '.' }
      ],
      services: [
        {
          id: 'companion',
          title: 'Companion Service',
          command: 'npm run service:start',
          cwd: '.',
          health: { type: 'http', url: 'http://127.0.0.1:8787/health' }
        }
      ],
      dashboards: [
        { id: 'main', title: 'Dashboard', url: 'http://127.0.0.1:8787' }
      ]
    }
  })

  assert.deepEqual(manifest.commands, [{ id: 'announce', title: 'Announce Weather' }])
  assert.deepEqual(manifest.entries.commands, [
    { id: 'announce', title: 'Announce Weather', command: 'node ./commands/announce.js', cwd: '.' }
  ])
  assert.deepEqual(manifest.entries.services, [
    {
      id: 'companion',
      title: 'Companion Service',
      command: 'npm run service:start',
      cwd: '.',
      health: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    }
  ])
  assert.deepEqual(manifest.entries.dashboards, [
    { id: 'main', title: 'Dashboard', url: 'http://127.0.0.1:8787' }
  ])
})
```

- [x] **Step 2: Run the targeted failing test**

Run:

```bash
node --test tests/plugins/manifest.test.js
```

Expected: FAIL because `manifest.entries` is undefined.

- [x] **Step 3: Implement entry normalizers**

In `src/main/plugins/manifest.js`, add helpers near `normalizeCommands`:

```js
const normalizeOptionalRelativePath = (value = '', fieldName) => normalizeRelativePath(value, fieldName, { allowEmpty: true })

const normalizeCommandEntries = (commands = []) => commands.map((command) => {
  if (!command?.id) throw new Error('Plugin command entry id is required')
  assertSafeId(command.id, 'command entry id')
  return {
    id: command.id,
    title: command.title || command.name || command.id,
    command: typeof command.command === 'string' ? command.command.trim() : '',
    cwd: normalizeOptionalRelativePath(command.cwd, 'command entry cwd')
  }
})
```

Also add service/dashboard normalizers that return stable objects with `id`, `title`, `command`, `cwd`, `health`, and `url`. Reuse safe id checks and relative path checks for `cwd`.

- [x] **Step 4: Wire `entries` into `normalizePluginManifest()`**

Return:

```js
const entries = normalizeEntries(manifest.entries)
const legacyCommands = normalizeCommands(manifest.commands)
const commands = legacyCommands.length ? legacyCommands : entries.commands.map(({ id, title }) => ({ id, title }))
```

Then include `entries` and `commands` in the returned manifest.

- [x] **Step 5: Verify targeted test passes**

Run:

```bash
node --test tests/plugins/manifest.test.js
```

Expected: all manifest tests pass.

### Task 2: Preserve Safety And Compatibility Tests

**Files:**
- Modify: `tests/plugins/manifest.test.js`

- [x] **Step 1: Add rejection tests for unsafe entries**

Add:

```js
test('rejects unsafe extension entry declarations', () => {
  assert.throws(() => normalizePluginManifest({
    id: 'bad-entry',
    name: 'Bad Entry',
    version: '1.0.0',
    entries: { commands: [{ id: '../run' }] }
  }), /Plugin command entry id must be a safe id/)

  assert.throws(() => normalizePluginManifest({
    id: 'bad-entry',
    name: 'Bad Entry',
    version: '1.0.0',
    entries: { services: [{ id: 'svc', cwd: '../escape' }] }
  }), /Plugin service entry cwd must be a safe relative path/)
})
```

- [x] **Step 2: Add compatibility precedence test**

Add:

```js
test('keeps legacy commands as the executable command list when both command shapes exist', () => {
  const manifest = normalizePluginManifest({
    id: 'mixed-commands',
    name: 'Mixed Commands',
    version: '1.0.0',
    commands: [{ id: 'legacy', title: 'Legacy Command' }],
    entries: {
      commands: [{ id: 'extension', title: 'Extension Command', command: 'node ./command.js' }]
    }
  })

  assert.deepEqual(manifest.commands, [{ id: 'legacy', title: 'Legacy Command' }])
  assert.deepEqual(manifest.entries.commands.map((command) => command.id), ['extension'])
})
```

- [x] **Step 3: Run manifest tests**

Run:

```bash
node --test tests/plugins/manifest.test.js
```

Expected: all manifest tests pass.

### Task 3: Expose Entries Through Plugin Service

**Files:**
- Modify: `tests/services/plugin-service.test.js`
- Inspect: `src/main/services/plugin-service.js`

- [x] **Step 1: Write service test for extension-shaped command package**

Add a test using `createRunnablePluginDir()`:

```js
test('plugin service runs extension command entries through the compatibility runner', async () => {
  const petEvents = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'extension-runner': true } }
    }),
    petService: {
      say: async (payload) => petEvents.push(payload)
    },
    officialPlugins: [],
    pluginDirs: [createRunnablePluginDir({
      manifest: {
        id: 'extension-runner',
        permissions: ['pet:say'],
        commands: undefined,
        entries: {
          commands: [{ id: 'announce', title: 'Announce', command: 'node ./commands/announce.js' }],
          services: [{ id: 'svc', title: 'Service', command: 'npm run service:start' }],
          dashboards: [{ id: 'main', title: 'Dashboard', url: 'http://127.0.0.1:8787' }]
        }
      },
      source: `
        module.exports = function activate(ctx) {
          return {
            announce: async () => {
              await ctx.pet.say('Extension command ran')
              return { ok: true }
            }
          }
        }
      `
    })]
  })

  const [plugin] = service.listPlugins()
  assert.equal(plugin.runnable, true)
  assert.deepEqual(plugin.commands, [{ id: 'announce', title: 'Announce' }])
  assert.equal(plugin.entries.services[0].id, 'svc')
  assert.equal(plugin.entries.dashboards[0].id, 'main')

  assert.deepEqual(await service.runCommand('extension-runner', 'announce'), { ok: true })
  assert.deepEqual(petEvents, [{ text: 'Extension command ran', source: 'plugin:extension-runner' }])
})
```

- [x] **Step 2: Run targeted service test**

Run:

```bash
node --test tests/services/plugin-service.test.js
```

Expected: PASS after Task 1 because `PluginService` spreads normalized manifest fields.

### Task 4: Add Shared Contract Coverage

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`

- [x] **Step 1: Add entry view types**

In `src/shared/openpet-contracts.ts`, add:

```ts
export interface PluginCommandEntryViewState extends PluginCommandViewState {
  command: string
  cwd: string
}

export interface PluginServiceEntryViewState {
  id: string
  title: string
  command: string
  cwd: string
  health?: {
    type: string
    url?: string
  }
}

export interface PluginDashboardEntryViewState {
  id: string
  title: string
  url: string
}

export interface PluginEntriesViewState {
  commands: PluginCommandEntryViewState[]
  services: PluginServiceEntryViewState[]
  dashboards: PluginDashboardEntryViewState[]
}
```

Add `entries: PluginEntriesViewState` to `PluginManifestViewState` and `PluginViewState`.

- [x] **Step 2: Update type fixture**

In `tests/shared/openpet-contracts-type-fixture.ts`, add `entries` to plugin manifest/view fixture objects:

```ts
entries: {
  commands: [{ id: 'run', title: 'Run', command: 'node ./index.js', cwd: '.' }],
  services: [{ id: 'svc', title: 'Service', command: 'npm run service:start', cwd: '.' }],
  dashboards: [{ id: 'main', title: 'Dashboard', url: 'http://127.0.0.1:8787' }]
}
```

- [x] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

### Task 5: Update Phase And Live Docs

**Files:**
- Create: `docs/phases/phase-56-extension-command-entries.md`
- Create: `docs/reviews/phase-56-extension-command-entries-review.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-review-todo-design.md`
- Modify: `docs/project-context.json`

- [x] **Step 1: Create phase doc**

Record scope, implementation, tests, and limitations. The doc must say service/dashboard declarations are parsed but not started/opened.

- [x] **Step 2: Create review doc placeholder**

Create a review doc with initial status `pending production review`.

- [x] **Step 3: Update live docs**

Update test count only after `npm test` confirms the new total. Keep support claims conservative.

### Task 6: Production Review And Final Verification

**Files:**
- Modify after review as needed.

- [x] **Step 1: Run production review**

Use:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Then read the required review framework references and inspect the Phase 56 diff.

- [x] **Step 2: Fix findings**

Fix every P0/P1/P2 finding. Record any lower-severity fixes or accepted residual risk in the review doc.

- [x] **Step 3: Run full verification**

Run:

```bash
npm run check:syntax
npm run test:control-center
npm test
git diff --check
node -e "JSON.parse(require('fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected: every command exits 0.

### Task 7: Commit And Push

**Files:**
- Stage all Phase 56 changes only.

- [x] **Step 1: Inspect status**

Run:

```bash
git status --short --branch
git diff --stat
```

- [x] **Step 2: Commit**

Run:

```bash
git add src/main/plugins/manifest.js src/shared/openpet-contracts.ts tests/plugins/manifest.test.js tests/services/plugin-service.test.js tests/shared/openpet-contracts-type-fixture.ts docs/superpowers/specs/2026-06-17-extension-command-entries-design.md docs/superpowers/plans/2026-06-17-extension-command-entries.md docs/phases/phase-56-extension-command-entries.md docs/reviews/phase-56-extension-command-entries-review.md docs/development-summary.md docs/HANDOFF.md docs/project-status-review.md docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md docs/project-context.json
git commit -m "feat: support extension command entries"
```

- [x] **Step 3: Push**

Run:

```bash
git push -u origin codex/extension-command-entries
```
