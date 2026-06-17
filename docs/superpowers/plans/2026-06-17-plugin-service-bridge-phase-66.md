# Plugin Service Bridge Phase 66 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give explicit declaration-only plugin services the same narrow pet-aware bridge already available to declaration-only commands.

**Architecture:** Keep bridge ownership in `PluginService`, because it already owns plugin process lifecycle, runtime maps, logs, and policy checks. Generalize the command bridge runtime registry into a shared plugin entry bridge registry, then allocate service bridge runtimes on service start and expire them on service exit/cleanup.

**Tech Stack:** Electron main process, Node child-process lifecycle, loopback HTTP bridge, Node native test runner, existing plugin manifest permissions, existing docs/phase/review workflow.

---

## File Map

- Modify: `src/main/services/plugin-service.js`
  Purpose: share bridge runtime helpers between commands and services, inject service bridge env vars, and expire service bridge runtime on exit.
- Modify: `tests/services/plugin-service.test.js`
  Purpose: add TDD coverage for service bridge env injection, pet mutations, permission/token rejection, context, and expiration.
- Modify: `docs/plugin-development.md`
  Purpose: teach third-party authors that explicit services can use the bridge for pet-aware long-running behavior.
- Modify: `docs/plugin-ecosystem-rules.md`
  Purpose: update ecosystem capability and safety rules for service bridge access.
- Modify: `docs/HANDOFF.md`
  Purpose: refresh current runtime boundary and next-step guidance.
- Modify: `docs/development-summary.md`
  Purpose: update the short engineering summary with service bridge support.
- Modify: `docs/project-status-review.md`
  Purpose: update the current project snapshot.
- Modify: `docs/productization-v1.1-todo-design.md`
  Purpose: record Phase 66 in the phase sequence.
- Modify: `docs/project-context.json`
  Purpose: update machine-readable current facts.
- Create: `docs/phases/phase-66-plugin-service-bridge.md`
  Purpose: record delivered scope, boundaries, and verification.
- Create: `docs/reviews/phase-66-plugin-service-bridge-review.md`
  Purpose: record production review findings and final recommendation.

## Task 1: Add failing service bridge tests

**Files:**
- Modify: `tests/services/plugin-service.test.js`

- [x] **Step 1: Add a service env test**

Add this test near the existing service lifecycle tests:

```js
test('plugin service entries receive bridge env vars when started explicitly', () => {
  const spawned = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'weather-declaration': true } }
    }),
    petService: createBridgeAwarePetService(),
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnServiceProcess: (file, args, options) => {
      const child = createSlowStoppingServiceProcess()
      spawned.push({ file, args, options, child })
      return child
    }
  })

  service.startService('weather-declaration', 'companion')

  assert.match(spawned[0].options.env.OPENPET_BRIDGE_URL, /^http:\/\/127\.0\.0\.1:\d+\/plugins\/bridge\/weather-declaration\/service:companion\//)
  assert.match(spawned[0].options.env.OPENPET_BRIDGE_TOKEN, /^[A-Za-z0-9_-]{20,}$/)
})
```

- [x] **Step 2: Verify the service env test fails**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service entries receive bridge env vars when started explicitly"
```

Expected: FAIL because service processes currently do not receive bridge env vars.

- [x] **Step 3: Add service bridge mutation, context, and expiry tests**

Add tests that:

- create a plugin with `pet:say`, `pet:action`, and `pet:event`;
- start service `companion`;
- call bridge `/pet/say`, `/pet/action`, `/pet/event`, and `/context`;
- emit child exit;
- assert later bridge calls return `401`.

Use the existing `requestBridge()` and `createBridgeAwarePetService()` helpers.

## Task 2: Implement shared bridge runtime helpers

**Files:**
- Modify: `src/main/services/plugin-service.js`

- [x] **Step 1: Rename command bridge maps to plugin bridge maps**

Change:

```js
const pluginBridgeRuntimes = new Map()
let pluginBridgeServer = null
let pluginBridgePort = 0
```

to:

```js
const pluginBridgeRuntimes = new Map()
let pluginBridgeServer = null
let pluginBridgePort = 0
```

Update all references in the bridge server and command cleanup paths.

- [x] **Step 2: Extract a bridge runtime allocator**

Add:

```js
const createPluginEntryBridgeRuntime = async (plugin, entryId) => {
  const bridgePort = await ensurePluginBridgeServer()
  const bridgeRunId = createPluginBridgeRunId()
  const bridgeToken = createPluginBridgeToken()
  const bridgeRuntimeKey = createPluginBridgeKey(plugin.manifest.id, entryId, bridgeRunId)
  const bridgeBaseUrl = `http://${PLUGIN_BRIDGE_HOST}:${bridgePort}/plugins/bridge/${plugin.manifest.id}/${entryId}/${bridgeRunId}`
  pluginBridgeRuntimes.set(bridgeRuntimeKey, {
    pluginId: plugin.manifest.id,
    entryId,
    runId: bridgeRunId,
    token: bridgeToken,
    status: 'running',
    handlers: createPluginBridgeHandlers(plugin, entryId)
  })
  return {
    key: bridgeRuntimeKey,
    url: bridgeBaseUrl,
    token: bridgeToken
  }
}
```

- [x] **Step 3: Extract bridge runtime release**

Add:

```js
const releasePluginEntryBridgeRuntime = (bridgeRuntimeKey) => {
  if (!bridgeRuntimeKey) return
  pluginBridgeRuntimes.delete(bridgeRuntimeKey)
  if (pluginBridgeServer && pluginBridgeRuntimes.size === 0) {
    pluginBridgeServer.unref?.()
  }
}
```

Use this in command settle and service exit cleanup.

## Task 3: Inject bridge env vars into services

**Files:**
- Modify: `src/main/services/plugin-service.js`

- [x] **Step 1: Make `startService()` async so it can allocate a loopback bridge port before spawn**

Because the bridge server allocation is async, convert `startService()` to `async` and await bridge runtime allocation before spawning the service process. IPC already returns Promises through `ipcRenderer.invoke`, so this preserves the renderer-facing contract while avoiding fake synchronous port allocation.

Update direct service tests to `await service.startService(...)`, and convert service-start rejection assertions to `await assert.rejects(...)`.

- [x] **Step 2: Inject service bridge env vars**

Inside `startService()` before spawning:

```js
const bridgeRuntime = await createPluginEntryBridgeRuntime(plugin, `service:${serviceId}`)
```

Then pass:

```js
env: {
  ...createServiceProcessEnv(),
  OPENPET_BRIDGE_URL: bridgeRuntime.url,
  OPENPET_BRIDGE_TOKEN: bridgeRuntime.token
}
```

Store `bridgeRuntime.key` on the service runtime.

- [x] **Step 3: Expire service bridge on exit and cleanup**

In the service `exit` handler, call:

```js
releasePluginEntryBridgeRuntime(runtime.bridgeRuntimeKey)
runtime.bridgeRuntimeKey = ''
```

Also mark the bridge runtime non-running when stop is requested so bridge calls stop authorizing as soon as service leaves `running`.

## Task 4: Update docs and phase records

**Files:**
- Modify all files listed in the file map.

- [x] **Step 1: Document author-facing service bridge support**

Update plugin docs to say service processes receive the bridge env vars when explicitly started and can use the same routes as commands.

- [x] **Step 2: Keep safety wording honest**

State that bridge access is loopback-only, token-gated, run-scoped, permission-checked, and not a general SDK or sandbox escape.

- [x] **Step 3: Add phase and review records**

Create Phase 66 phase/review docs with implementation scope, test evidence, and production review notes.

## Task 5: Review, verify, commit, and push

**Files:**
- No new implementation files beyond the listed scope.

- [x] **Step 1: Run production review**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/.config/superpowers/worktrees/OpenPet/codex-plugin-service-hard-cleanup-phase65
```

Review correctness, architecture, reliability, security, and tests before final verification.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

- [ ] **Step 3: Commit and push**

```bash
git add src/main/services/plugin-service.js tests/services/plugin-service.test.js docs
git commit -m "feat: add plugin service bridge"
git push -u origin codex/plugin-service-bridge-phase66
```

## Self-Review

- Spec coverage: service bridge env vars, pet mutations, context, token/permission rejection, expiry, docs, review, and verification are covered.
- Placeholder scan: no placeholder-only tasks remain; implementation steps include concrete file paths and commands.
- Type consistency: `service:<serviceId>` is the service entry id used in bridge URLs, logs, and runtime keys.
