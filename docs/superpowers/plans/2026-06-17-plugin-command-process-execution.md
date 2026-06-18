# Plugin Command Process Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let enabled, policy-allowed local plugins run declared `entries.commands` through an explicit Control Center command action even when they do not provide a legacy JavaScript `main`.

**Architecture:** `PluginService.runCommand()` remains the single host boundary for command execution. Legacy official and JavaScript runner commands keep their existing path; declaration-only command entries use the same no-shell process spawning posture as setup/service entries, with plugin-local cwd validation, minimal environment, JSON stdin context, bounded output logs, and a short timeout.

**Tech Stack:** Electron main process JavaScript, React + TypeScript Control Center, Node native test runner, Playwright smoke tests.

---

### Task 1: Add Service Coverage For Declaration Command Processes

**Files:**
- Modify: `tests/services/plugin-service.test.js`
- Modify: `src/main/services/plugin-service.js`

- [ ] **Step 1: Replace the old declaration-only rejection assertion**

In `tests/services/plugin-service.test.js`, change the existing test named `plugin service lists declaration-only extension entries without making them runnable` so it only asserts listing and declaration visibility. Remove the `assert.rejects(... /Plugin is not runnable/)` block because declaration command entries become explicitly runnable in this phase.

- [ ] **Step 2: Add a failing process execution test**

Add a test that creates `weather-declaration`, enables it, injects `spawnCommandProcess`, calls `service.runCommand('weather-declaration', 'announce', { city: 'Shanghai' })`, and asserts:

```js
assert.equal(spawned[0].file, 'node')
assert.deepEqual(spawned[0].args, ['./commands/announce.js'])
assert.equal(path.basename(spawned[0].options.cwd), 'weather-declaration')
assert.equal(spawned[0].options.shell, false)
assert.equal(spawned[0].options.stdio[0], 'pipe')
assert.equal(JSON.parse(child.stdinChunks.join('')).commandId, 'announce')
```

Expected before implementation: FAIL because `spawnCommandProcess` is not wired and declaration commands still reject as not runnable.

- [ ] **Step 3: Add safety regression tests**

Add tests proving declaration command processes:

```js
assert.rejects(() => service.runCommand('weather-declaration', 'announce'), /Plugin is disabled/)
assert.rejects(() => service.runCommand('weather-declaration', 'announce'), /Plugin is blocked: blocked for review/)
assert.rejects(() => service.runCommand('weather-declaration', 'missing'), /Plugin command entry not found: missing/)
assert.rejects(() => service.runCommand('weather-declaration', 'announce'), /Plugin command cwd must stay inside the plugin directory/)
assert.rejects(() => service.runCommand('weather-declaration', 'announce'), /Plugin command timed out after 5000ms/)
```

Expected before implementation: FAIL on the new behavior-specific assertions.

### Task 2: Implement The Declaration Command Process Runner

**Files:**
- Modify: `src/main/services/plugin-service.js`

- [ ] **Step 1: Add command process injection and active runtime tracking**

Extend `createPluginService()` options:

```js
spawnCommandProcess = spawnServiceProcess,
commandProcessTimeoutMs = LOCAL_PLUGIN_COMMAND_TIMEOUT_MS
```

Add `commandRuntimes = new Map()` and reuse `createPluginServiceKey(pluginId, commandId)` for duplicate-running protection.

- [ ] **Step 2: Add command entry helpers**

Add helpers:

```js
const getCommandEntry = (plugin, commandId) => {
  const commandEntry = (plugin.manifest.entries?.commands || []).find((entry) => entry.id === commandId)
  if (!commandEntry) throw new Error(`Plugin command entry not found: ${commandId}`)
  return commandEntry
}

const resolveCommandCwd = (manifest, cwd) => resolvePluginEntryCwd(manifest, cwd, 'command')
```

- [ ] **Step 3: Add process runner**

Add `runCommandEntryProcess({ plugin, commandEntry, payload })` that:

```js
const { file, args } = parseServiceCommand(commandEntry.command)
const cwd = resolveCommandCwd(plugin.manifest, commandEntry.cwd)
const child = spawnCommandProcess(file, args, {
  cwd,
  detached: false,
  env: createServiceProcessEnv(),
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true
})
child.stdin?.end(`${JSON.stringify({ pluginId, commandId, payload, config })}\n`)
```

It records stdout/stderr snippets, resolves `{ ok: true, pluginId, commandId, exitCode, stdout }` on exit code `0`, rejects on non-zero exit, spawn error, timeout, or duplicate run, and always removes the active runtime key.

- [ ] **Step 4: Route declaration-only commands**

In `runCommand()`, keep official activate and JavaScript `mainPath` behavior first. In the final branch, find `entries.commands` and call `runCommandEntryProcess()` instead of throwing `Plugin is not runnable`.

### Task 3: Update UI, Contracts, Docs, And Evidence

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/control-center/src/panes/PluginsPane.tsx`
- Modify: `src/control-center/src/api/control-center-api.ts`
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
- Modify: `tests/control-center/control-center-smoke.spec.js`
- Create: `docs/phases/phase-62-plugin-command-process-execution.md`
- Create: `docs/reviews/phase-62-plugin-command-process-execution-review.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/plugin-ecosystem-rules.md`
- Modify: `docs/project-context.json`

- [ ] **Step 1: Add a command run result contract**

Add:

```ts
export interface PluginCommandRunResultViewState extends OkResponse {
  pluginId?: string
  commandId?: string
  exitCode?: number | null
  stdout?: string
  result?: JsonValue
}
```

Change `ControlCenterAPI.runPluginCommand` to return `Promise<PluginCommandRunResultViewState>`.

- [ ] **Step 2: Let declaration commands be clickable**

In `PluginsPane.tsx`, change command button disabled logic so commands are disabled only when the plugin is disabled, blocked, or currently running. Do not require `plugin.runnable` for buttons backed by `entries.commands`.

- [ ] **Step 3: Update docs honestly**

Document that `entries.commands` now run as explicit user actions for enabled local plugins, receive JSON stdin, run without shell expansion, and are short-lived. Keep out-of-scope claims explicit: no install/enable auto-run, no background polling, no bridge token injection, no API key exposure, no generic arbitrary shell console, and no complete sandbox promise.

- [ ] **Step 4: Verify**

Run:

```bash
node --test tests/services/plugin-service.test.js
npm run typecheck
npm run check:syntax
npm test
npm run test:control-center
git diff --check
```

Expected after implementation: all pass, with Node baseline updated if the test count changes.

### Task 4: Production Review And Commit

**Files:**
- Modify: `docs/reviews/phase-62-plugin-command-process-execution-review.md`

- [ ] **Step 1: Run production review helper**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Load the suggested review references and review the diff for correctness, robustness, architecture, tests, and security.

- [ ] **Step 2: Apply fixes**

Address any confirmed P0-P2 findings before commit. Record residual intentional limitations in the review doc.

- [ ] **Step 3: Commit and push**

Run:

```bash
git add .
git commit -m "feat: run plugin command entries"
git push
```
