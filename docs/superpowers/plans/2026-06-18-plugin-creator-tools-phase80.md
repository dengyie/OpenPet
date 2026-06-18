# Plugin Creator-Tools Phase 80 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first host-mediated creator-tools capability slice so local extensions can read and update action configuration through explicit command runs without raw filesystem writes.

**Architecture:** Keep `PluginService` responsible for manifest normalization, permission checks, command-run scoping, and short-lived bridge routing. Add a focused action-mutation helper under the action-service boundary for reading, validating, and applying bounded action configuration updates, and assemble that helper in `main.js` so host-owned persistence remains explicit. Extend shared contracts and docs so creator-tools profile and permission boundaries stay explicit and reviewable.

**Tech Stack:** Electron main process, CommonJS services, Node native test runner, shared TypeScript contracts, Markdown phase/review docs.

---

## File Map

- Modify: `src/main/plugins/manifest.js`
  Purpose: normalize optional `profile`, accept the first creator-tools permissions, and keep compatibility behavior explicit.
- Modify: `tests/plugins/manifest.test.js`
  Purpose: cover `profile` normalization and supported creator-tools permissions.
- Modify: `src/main/services/plugin-service.js`
  Purpose: inject host-managed creator directories into declaration-only command env, add creator-tools bridge routes, and enforce `actions:read` / `actions:write`.
- Modify: `tests/services/plugin-service.test.js`
  Purpose: prove command env wiring, permission enforcement, creator-tools read model, validation failures, and bounded apply flow.
- Modify: `main.js`
  Purpose: assemble the creator-tools action mutation helper and inject it into `PluginService` without widening service ownership.
- Create: `src/main/services/action-config-mutation-service.js`
  Purpose: centralize creator-tools reads, validation, and bounded action-config writes so `PluginService` does not become the authoring engine.
- Create: `tests/services/action-config-mutation-service.test.js`
  Purpose: cover read model shape, validation logic, apply success, and rejection of unsafe mutations.
- Modify: `src/main/services/action-service.js`
  Purpose: expose raw action-config reads and active-pack metadata needed by the new helper while preserving existing renderer-facing behavior.
- Modify: `src/shared/openpet-contracts.ts`
  Purpose: add profile and creator-tools request/response contracts.
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
  Purpose: keep representative creator-tools payloads inside `npm run typecheck`.
- Create: `docs/phases/phase-80-plugin-creator-tools.md`
  Purpose: record delivered scope, decisions, verification, and remaining boundaries.
- Create: `docs/reviews/phase-80-plugin-creator-tools-review.md`
  Purpose: store production review findings, score, pass status, and fixes.
- Modify: `docs/plugin-development.md`
  Purpose: document the first real creator-tools host API slice and current command env truthfully.
- Modify: `docs/plugin-ecosystem-rules.md`
  Purpose: align creator-tools review language, supported permissions, and no-direct-write boundary.
- Modify: `docs/productization-v1.1-todo-design.md`
  Purpose: add Phase 80 scope, acceptance, and status.
- Modify: `docs/development-summary.md`
  Purpose: refresh current creator-tools capability summary.
- Modify: `docs/project-status-review.md`
  Purpose: reflect creator-tools host-backed action-config capability in the current platform snapshot.
- Modify: `docs/HANDOFF.md`
  Purpose: update the current extension boundary and next-step guidance.
- Modify: `docs/project-context.json`
  Purpose: keep machine-readable project facts synchronized with the new creator-tools slice.

## Execution Preconditions

Before implementation, confirm the branch and baseline:

```bash
git status --short --branch
```

Expected:

- branch is `codex/plugin-creator-tools-phase80`;
- working tree contains only the new Phase 80 spec/plan files until code changes begin;
- no unrelated generated artifacts are mixed into the phase.

Re-read the approved spec before touching code:

```bash
sed -n '1,260p' docs/superpowers/specs/2026-06-18-plugin-creator-tools-phase80-design.md
```

Expected:

- Phase 80 is limited to `profile`, `actions:read`, `actions:write`, host-managed creator directories, and bounded action-config bridge APIs;
- direct sprite generation, arbitrary file writes, and broad pet-pack writes remain out of scope.

## Task 1: Normalize creator-tools manifest vocabulary

**Files:**
- Modify: `src/main/plugins/manifest.js`
- Modify: `tests/plugins/manifest.test.js`

- [ ] **Step 1: Write failing manifest tests for `profile` and creator-tools permissions**

Add tests covering:

```js
test('normalizes creator-tools profile and supported permissions', () => {
  const manifest = normalizePluginManifest({
    id: 'pet-action-studio',
    name: 'Pet Action Studio',
    version: '1.0.0',
    profile: 'creator-tools',
    permissions: ['actions:read', 'actions:write'],
    entries: {
      commands: [{ id: 'edit-actions', command: 'node ./commands/edit-actions.js' }]
    }
  })

  assert.equal(manifest.profile, 'creator-tools')
  assert.deepEqual(manifest.permissions, ['actions:read', 'actions:write'])
})

test('rejects unsupported creator-tools profile values', () => {
  assert.throws(() => normalizePluginManifest({
    id: 'bad-profile',
    name: 'Bad Profile',
    version: '1.0.0',
    profile: 'everything'
  }), /Plugin profile must be runtime, creator-tools, or hybrid/)
})

test('rejects unsupported future-facing permissions in Phase 80', () => {
  assert.throws(() => normalizePluginManifest({
    id: 'bad-permission',
    name: 'Bad Permission',
    version: '1.0.0',
    permissions: ['assets:inspect']
  }), /Unknown plugin permission: assets:inspect/)
})
```

- [ ] **Step 2: Run targeted manifest tests and verify RED**

Run:

```bash
node --test tests/plugins/manifest.test.js
```

Expected before implementation:

- FAIL because `profile` is not normalized;
- FAIL because `actions:read` and `actions:write` are not in the known permission set;
- FAIL because invalid `profile` does not yet produce the required error.

- [ ] **Step 3: Implement manifest normalization**

Update `src/main/plugins/manifest.js` so:

```js
const KNOWN_PLUGIN_PERMISSIONS = new Set([
  'pet:say',
  'pet:action',
  'pet:event',
  'ai:chat',
  'storage',
  'network',
  'commands',
  'actions:read',
  'actions:write'
])

const KNOWN_PLUGIN_PROFILES = new Set(['runtime', 'creator-tools', 'hybrid'])

const normalizeProfile = (profile = '') => {
  if (!profile) return 'runtime'
  const normalized = String(profile).trim()
  if (!KNOWN_PLUGIN_PROFILES.has(normalized)) {
    throw new Error('Plugin profile must be runtime, creator-tools, or hybrid')
  }
  return normalized
}
```

and include:

```js
profile: normalizeProfile(manifest.profile)
```

inside the normalized manifest shape.

- [ ] **Step 4: Run targeted manifest tests and verify GREEN**

Run:

```bash
node --test tests/plugins/manifest.test.js
```

Expected:

- PASS with normalized `profile`;
- PASS with accepted `actions:read` and `actions:write`;
- PASS with unsupported profile and permission rejection.

## Task 2: Add a focused action-config mutation helper

**Files:**
- Create: `src/main/services/action-config-mutation-service.js`
- Create: `tests/services/action-config-mutation-service.test.js`
- Modify: `src/main/services/action-service.js`

- [ ] **Step 1: Write failing tests for read, validate, and apply**

Create `tests/services/action-config-mutation-service.test.js` with deterministic fixtures for both read behavior and host-owned persistence target selection:

```js
test('reads a normalized creator-tools action config view', () => {
  const service = createActionConfigMutationService({
    actionService: createActionService({
      loadPetPack: () => ({
        rootPath: '/packs/cat',
        source: { type: 'directory', path: '/packs/cat' },
        manifest: {
          defaultAction: 'idle',
          clickAction: 'wave',
          actions: [
            { id: 'idle', label: 'Idle', kind: 'idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
            { id: 'wave', label: 'Wave', kind: 'greeting', sprite: 'sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
          ]
        }
      })
    }),
    persistActionConfig: () => {},
    reloadActionConfig: () => ({
      defaultAction: 'idle',
      clickAction: 'wave',
      actions: [
        { id: 'idle', label: 'Idle', kind: 'idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
        { id: 'wave', label: 'Wave', kind: 'greeting', sprite: 'sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
      ]
    })
  })

  const result = service.readActionConfig()

  assert.equal(result.defaultAction, 'idle')
  assert.equal(result.clickAction, 'wave')
  assert.equal(result.actions.length, 2)
})
```

Add validation and apply tests:

```js
test('rejects invalid default action references during validation', () => {
  const service = createActionConfigMutationService({ ... })

  const result = service.validateActionMutation({
    defaultAction: 'missing',
    clickAction: 'wave',
    actions: [{ id: 'idle', label: 'Idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }]
  })

  assert.equal(result.ok, false)
  assert.match(result.errors[0], /defaultAction must reference an existing action/)
})

test('applies bounded action metadata updates to the legacy animations config target and returns refreshed config', () => {
  let savedTarget = null
  let savedConfig = null
  const service = createActionConfigMutationService({
    actionService: createActionService({
      loadPetPack: () => ({
        rootPath: '/app/openpet',
        source: { type: 'legacy-cat-anime' },
        manifest: {
          defaultAction: 'idle',
          clickAction: 'wave',
          actions: [
            { id: 'idle', label: 'Idle', kind: 'idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
            { id: 'wave', label: 'Wave', kind: 'greeting', sprite: 'sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
          ]
        }
      })
    }),
    persistActionConfig: ({ targetPath, config }) => {
      savedTarget = targetPath
      savedConfig = config
    },
    reloadActionConfig: () => ({
      defaultAction: 'wave',
      clickAction: 'wave',
      actions: [
        { id: 'idle', label: 'Idle', kind: 'idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
        { id: 'wave', label: 'Wave Updated', kind: 'greeting', sprite: 'sprites/wave.png', frameCount: 1, frameMs: 120, frameWidth: 32, frameHeight: 32 }
      ]
    })
  })

  const result = service.applyActionMutation({
    defaultAction: 'wave',
    clickAction: 'wave',
    actions: [
      { id: 'idle', label: 'Idle', kind: 'idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
      { id: 'wave', label: 'Wave Updated', kind: 'greeting', sprite: 'sprites/wave.png', frameCount: 1, frameMs: 120, frameWidth: 32, frameHeight: 32 }
    ]
  })

  assert.equal(result.animations.defaultAction, 'wave')
  assert.match(savedTarget, /cat_anime\/animations\.json$/)
  assert.equal(savedConfig.clickAction, 'wave')
  assert.equal(savedConfig.actions[1].label, 'Wave Updated')
})

test('applies bounded action metadata updates to an installed pack manifest target', () => {
  let savedTarget = null
  const service = createActionConfigMutationService({
    actionService: createActionService({
      loadPetPack: () => ({
        rootPath: '/packs/community-weather-cat',
        source: { type: 'directory', path: '/packs/community-weather-cat' },
        manifest: {
          id: 'community-weather-cat',
          displayName: 'Community Weather Cat',
          version: '1.0.0',
          defaultAction: 'idle',
          clickAction: 'wave',
          actions: [
            { id: 'idle', label: 'Idle', kind: 'idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
            { id: 'wave', label: 'Wave', kind: 'greeting', sprite: 'sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
          ]
        }
      })
    }),
    persistActionConfig: ({ targetPath }) => { savedTarget = targetPath },
    reloadActionConfig: () => ({
      defaultAction: 'idle',
      clickAction: 'wave',
      actions: [
        { id: 'idle', label: 'Idle', kind: 'idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
        { id: 'wave', label: 'Wave', kind: 'greeting', sprite: 'sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
      ]
    })
  })

  service.applyActionMutation({
    defaultAction: 'idle',
    clickAction: 'wave',
    actions: [
      { id: 'idle', label: 'Idle', kind: 'idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
      { id: 'wave', label: 'Wave', kind: 'greeting', sprite: 'sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
    ]
  })

  assert.match(savedTarget, /community-weather-cat\/pet\.json$/)
})
```

- [ ] **Step 2: Run targeted helper tests and verify RED**

Run:

```bash
node --test tests/services/action-config-mutation-service.test.js
```

Expected before implementation:

- FAIL because the helper does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/main/services/action-config-mutation-service.js` with three exported operations and explicit host-owned persistence routing:

```js
const createActionConfigMutationService = ({ actionService, persistActionConfig, reloadActionConfig }) => {
  const readActionConfig = () => {
    const config = actionService.getRawConfig ? actionService.getRawConfig() : actionService.getPreviewConfig()
    return {
      defaultAction: config.defaultAction || '',
      clickAction: config.clickAction || '',
      actions: Array.isArray(config.actions) ? config.actions.map((action) => ({ ...action })) : []
    }
  }

  const validateActionMutation = (payload = {}) => { /* return { ok, errors, warnings, normalized } */ }
  const applyActionMutation = (payload = {}) => { /* validate first, resolve host target, persist normalized config, reload actionService, return refreshed animations */ }

  return { readActionConfig, validateActionMutation, applyActionMutation }
}
```

Validation rules must enforce:

- safe action ids;
- unique action ids;
- required `defaultAction` and `clickAction` references;
- safe relative `sprite` paths, not file URLs;
- finite numeric frame metadata;
- optional atlas and frame-durations shapes staying JSON-safe.

The helper should resolve the host target from the active pack:

- built-in legacy runtime writes the normalized config payload to `cat_anime/animations.json`;
- installed or bundled pet packs write the action fields back into the active pack `pet.json`;
- if the host cannot resolve a safe writable target for the active pack, the helper must reject with an explicit unsupported-target error.

`persistActionConfig` stays host-owned and injected so the helper does not become a general filesystem broker.

- [ ] **Step 4: Add the smallest needed hook to `action-service.js`**

Add the smallest helper set needed for persistence-safe reads, such as:

```js
const getRawConfig = () => {
  const petPack = getPetPack()
  const config = petPack.manifest || emptyConfig
  return {
    defaultAction: config.defaultAction || '',
    clickAction: config.clickAction || '',
    actions: Array.isArray(config.actions) ? config.actions.map((action) => ({ ...action })) : []
  }
}
```

Also keep `getPetPack()` exported as the active-pack metadata source, and do not change existing `getConfig()` renderer-facing file-URL behavior.

- [ ] **Step 5: Run targeted helper and action-service tests**

Run:

```bash
node --test tests/services/action-config-mutation-service.test.js tests/services/action-service.test.js
```

Expected:

- PASS with read, validate, and apply coverage;
- PASS with no regression to existing file-URL behavior.

## Task 3: Wire creator-tools routes into the short-lived command bridge

**Files:**
- Modify: `main.js`
- Modify: `src/main/services/plugin-service.js`
- Modify: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Write failing bridge tests for command env and creator-tools routes**

Add to `tests/services/plugin-service.test.js`:

```js
test('declaration-only creator-tools command runs receive host-managed creator directories', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'action-studio': true } }
    }),
    petService: createBridgeAwarePetService(),
    actionConfigMutationService: createFakeActionConfigMutationService(),
    officialPlugins: [],
    pluginDirs: [createCreatorToolsPluginDir()],
    spawnCommandProcess: (_file, _args, options) => {
      spawned.push(options)
      return child
    }
  })

  const run = service.runCommand('action-studio', 'edit-actions')
  await waitFor(() => child.listenerCount('exit') > 0)
  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await run

  assert.match(spawned[0].env.OPENPET_DATA_DIR, /action-studio/)
  assert.match(spawned[0].env.OPENPET_CACHE_DIR, /action-studio/)
  assert.match(spawned[0].env.OPENPET_LOG_DIR, /action-studio/)
})
```

Add permission and route coverage:

```js
test('creator-tools bridge rejects action reads without actions:read permission', async () => {
  // run command, fetch GET /creator/actions, expect 403 json
})

test('creator-tools bridge validates and applies bounded action updates', async () => {
  // run command, call validate then apply, assert refreshed action config and helper invocation
})
```

- [ ] **Step 2: Run targeted plugin-service tests and verify RED**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "creator-tools|declaration-only creator-tools command runs receive host-managed creator directories"
```

Expected before implementation:

- FAIL because env vars are missing;
- FAIL because creator-tools bridge routes and mutation-helper injection do not exist.

- [ ] **Step 3: Inject host-managed creator directories into declaration-only command env**

In `src/main/services/plugin-service.js`, extend the command-run path. Build per-plugin host directories relative to the installed plugin root so the env values stay stable for local third-party plugins:

```js
const createPluginCommandDirectories = (manifest) => {
  const pluginRoot = path.dirname(manifest.basePath)
  const root = path.join(pluginRoot, '.openpet', manifest.id)
  const dataDir = path.join(root, 'data')
  const cacheDir = path.join(root, 'cache')
  const logDir = path.join(root, 'logs')
  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.mkdirSync(logDir, { recursive: true })
  return { dataDir, cacheDir, logDir }
}
```

Then pass:

```js
OPENPET_DATA_DIR: directories.dataDir,
OPENPET_CACHE_DIR: directories.cacheDir,
OPENPET_LOG_DIR: directories.logDir
```

into the declaration-only command env.

- [ ] **Step 4: Add creator-tools bridge handlers and dependency wiring**

Update `main.js` to assemble and inject the helper:

```js
const { createActionConfigMutationService } = require('./src/main/services/action-config-mutation-service')

const actionConfigMutationService = createActionConfigMutationService({
  actionService,
  persistActionConfig: ({ targetPath, config }) => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(targetPath, `${JSON.stringify(config, null, 2)}\n`)
  },
  reloadActionConfig: () => actionService.reload()
})
```

and pass it into:

```js
const pluginService = createPluginService({
  settingsService,
  petService,
  petPackService,
  aiService,
  actionConfigMutationService,
  ...
})
```

Extend the command bridge handler factory so creator-tools routes map to the new helper:

```js
if (request.method === 'GET' && relativePath === '/creator/actions') {
  assertPermission(manifest, 'actions:read')
  if (!actionConfigMutationService) throw new Error('Creator-tools action API is not available')
  return sendJson(response, 200, { ok: true, actions: actionConfigMutationService.readActionConfig() })
}

if (request.method === 'POST' && relativePath === '/creator/actions/validate') {
  assertPermission(manifest, 'actions:write')
  if (!actionConfigMutationService) throw new Error('Creator-tools action API is not available')
  const payload = await readJsonBody(request)
  const result = actionConfigMutationService.validateActionMutation(payload)
  return sendJson(response, result.ok ? 200 : 400, result)
}

if (request.method === 'POST' && relativePath === '/creator/actions/apply') {
  assertPermission(manifest, 'actions:write')
  if (!actionConfigMutationService) throw new Error('Creator-tools action API is not available')
  const payload = await readJsonBody(request)
  const result = actionConfigMutationService.applyActionMutation(payload)
  return sendJson(response, 200, { ok: true, result })
}
```

Route logs must stay bounded and avoid dumping full payloads.

- [ ] **Step 5: Run targeted plugin-service tests and verify GREEN**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "creator-tools|declaration-only creator-tools command runs receive host-managed creator directories"
```

Expected:

- PASS with creator directories in env;
- PASS with permission rejections;
- PASS with validated and applied action updates returning refreshed state.

## Task 4: Extend shared contracts and type fixtures

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`

- [ ] **Step 1: Write failing type-fixture coverage for creator-tools payloads**

Add representative payloads:

```ts
const creatorToolsReadResult = {
  ok: true,
  actions: {
    defaultAction: 'idle',
    clickAction: 'wave',
    actions: [{ id: 'idle', label: 'Idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }]
  }
} satisfies CreatorActionsReadResponse
```

and:

```ts
const creatorToolsApplyResult = {
  ok: true,
  result: {
    animations: {
      defaultAction: 'wave',
      clickAction: 'wave',
      actions: [{ id: 'wave', label: 'Wave', sprite: 'sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }]
    }
  }
} satisfies CreatorActionsApplyResponse
```

- [ ] **Step 2: Add shared contract types**

Define:

```ts
export type PluginProfile = 'runtime' | 'creator-tools' | 'hybrid'
export type PluginPermission =
  | 'pet:say'
  | 'pet:action'
  | 'pet:event'
  | 'ai:chat'
  | 'storage'
  | 'network'
  | 'commands'
  | 'actions:read'
  | 'actions:write'
```

and creator-tools request/response interfaces for:

- action read response;
- action validate response;
- action apply response.

Also extend the existing plugin-facing view-state types so the normalized profile becomes visible in current review and list surfaces:

```ts
export interface PluginManifestViewState {
  profile?: PluginProfile
  ...
}

export interface PluginViewState {
  profile?: PluginProfile
  ...
}
```

- [ ] **Step 3: Run typecheck and verify GREEN**

Run:

```bash
npm run typecheck
```

Expected:

- PASS with new creator-tools contract coverage.

## Task 5: Record the phase and refresh live docs

**Files:**
- Create: `docs/phases/phase-80-plugin-creator-tools.md`
- Create: `docs/reviews/phase-80-plugin-creator-tools-review.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/plugin-ecosystem-rules.md`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/project-context.json`

- [ ] **Step 1: Write the phase record with the exact boundary**

Capture:

```md
- `profile` now accepts `runtime`, `creator-tools`, and `hybrid`;
- declaration-only creator-tools command runs now receive host-managed data/cache/log directories;
- Phase 80 adds host-mediated action-config read, validate, and apply routes;
- no raw file writes, sprite generation, or broad pet-pack writes were added.
```

- [ ] **Step 2: Update author docs conservatively**

Refresh `docs/plugin-development.md` and `docs/plugin-ecosystem-rules.md` so they say:

```md
Current creator-tools support covers action configuration reads and bounded host-mediated writes only. Sprite generation, broader asset APIs, and pet-pack writes remain future work.
```

Also make sure docs no longer imply `OPENPET_RESULT_PATH` is a current runtime fact unless this phase really implements it.

- [ ] **Step 3: Validate machine-readable context**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected:

```text
project-context ok
```

## Task 6: Production review, full verification, and atomic commit

**Files:**
- All changed Phase 80 files

- [ ] **Step 1: Collect production review context**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

- [ ] **Step 2: Read the mandatory review references**

Run:

```bash
sed -n '1,240p' /Users/mango/.agents/skills/production-code-quality-review/references/review-framework.md
sed -n '1,240p' /Users/mango/.agents/skills/production-code-quality-review/references/output-contract.md
sed -n '1,240p' /Users/mango/.agents/skills/production-code-quality-review/references/false-positive-control.md
sed -n '1,220p' /Users/mango/.agents/skills/production-code-quality-review/references/verification-and-operations.md
```

- [ ] **Step 3: Produce and address the production review**

Write `docs/reviews/phase-80-plugin-creator-tools-review.md` with:

```md
- Scope
- Findings
- Improvement Suggestions
- Quality score
- Review result
- Fixes applied
- Residual risks
```

If review finds P1/P0 issues, fix them before moving on.

- [ ] **Step 4: Run the complete verification set**

Run:

```bash
node --test tests/plugins/manifest.test.js
node --test tests/services/action-config-mutation-service.test.js
node --test tests/services/plugin-service.test.js
npm run typecheck
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected:

- targeted tests pass;
- typecheck passes;
- syntax/build passes;
- full Node suite passes;
- Control Center Playwright suite passes;
- `git diff --check` is clean;
- `project-context ok` prints.

- [ ] **Step 5: Commit the Phase 80 slice atomically**

Run:

```bash
git add src/main/plugins/manifest.js tests/plugins/manifest.test.js src/main/services/action-config-mutation-service.js tests/services/action-config-mutation-service.test.js src/main/services/action-service.js src/main/services/plugin-service.js tests/services/plugin-service.test.js src/shared/openpet-contracts.ts tests/shared/openpet-contracts-type-fixture.ts docs/plugin-development.md docs/plugin-ecosystem-rules.md docs/phases/phase-80-plugin-creator-tools.md docs/reviews/phase-80-plugin-creator-tools-review.md docs/productization-v1.1-todo-design.md docs/development-summary.md docs/project-status-review.md docs/HANDOFF.md docs/project-context.json docs/superpowers/specs/2026-06-18-plugin-creator-tools-phase80-design.md docs/superpowers/plans/2026-06-18-plugin-creator-tools-phase80.md
git commit -m "feat(阶段80): add plugin creator-tools action APIs"
```

- [ ] **Step 6: Confirm the committed diff is Phase 80 only**

Run:

```bash
git show --stat --oneline --decorate --name-only HEAD
```

Expected:

- commit message is `feat(阶段80): add plugin creator-tools action APIs`;
- changed runtime files are limited to manifest, plugin-service, action-service/helper, shared contracts, and their tests;
- changed docs are only the Phase 80 spec/plan/phase/review docs plus live docs updated for the new creator-tools slice;
- no release-evidence, unrelated plugin lifecycle, or generated artifact files are included.

## Self-Review Checklist

- [ ] Phase 80 stays inside creator-tools action-config scope and does not silently add broader asset or pet-pack writes.
- [ ] `OPENPET_RESULT_PATH` is not claimed as current runtime support unless implemented and tested.
- [ ] `PluginService` only owns permission checks and bridge routing; action mutation semantics stay in the focused helper/action boundary.
- [ ] New permissions are explicit and reviewable.
- [ ] Docs stay honest about direct `cat_anime/` edits and future sprite-generation work.
- [ ] Full verification and production review are completed before the phase commit.

Plan complete and saved to `docs/superpowers/plans/2026-06-18-plugin-creator-tools-phase80.md`.

Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution - execute tasks in this session using `superpowers:executing-plans`, with checkpoints for review.
