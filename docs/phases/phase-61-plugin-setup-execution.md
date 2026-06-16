# Phase 61: Plugin Setup Execution

> Date: 2026-06-17
> Branch: `codex/plugin-setup-execution`

## Goals

- Let users explicitly run declared `entries.setup` from Control Center.
- Keep setup execution separate from install, enable, service start, bridge flows, and generic shell command execution.
- Record setup runtime state and logs so extension authors and reviewers can see what happened.

## Scope

- Add `PluginService.runSetup(pluginId, setupId)` as the only setup execution path.
- Allow setup only for enabled, policy-allowed local plugins.
- Resolve setup cwd inside the plugin directory and reject traversal or symlink escape.
- Parse setup command strings into executable plus args and spawn with `shell: false`.
- Record `running`, `succeeded`, and `failed` setup runtime states with `lastRunAt`, `exitCode`, and `error`.
- Capture setup stdout/stderr snippets in plugin logs under `setup:<setupId>`.
- Stop active setup processes when the plugin is disabled or when app shutdown cleanup runs.
- Add `plugins:run-setup` IPC, preload, shared TypeScript contract, Control Center API, hook state, and Plugins pane action.
- Disable setup run buttons while a setup entry is already running.

Out of scope:

- no install-time setup execution,
- no enable-time setup execution,
- no setup execution for blocked or disabled plugins,
- no bridge token injection,
- no background automation or polling,
- no generic shell command execution surface,
- no hard process-tree cleanup guarantee.

## Implementation Notes

`PluginService` now owns setup runtime state alongside service runtime state. A setup run validates plugin policy, setup id, and plugin-local cwd before spawning. The setup process is spawned without shell expansion:

```js
spawnSetupProcess(file, args, {
  cwd,
  detached: false,
  env: createServiceProcessEnv(),
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
})
```

The setup call returns after the child reaches `exit`, so IPC and Control Center receive the final setup runtime status. During the run, `listPlugins()` can still show `running` state.

If a plugin is disabled or the app is quitting while setup is still running, `PluginService` sends `SIGTERM` to the setup child process and marks setup runtime as failed with `Setup stopped`. This is direct child cleanup, not a hard process-tree guarantee.

Control Center now renders a setup action next to setup declarations. The button is available only when the plugin is enabled, not blocked, and that setup entry is not already running.

## Tests

Targeted verification during implementation:

```bash
node --test tests/services/plugin-service.test.js
# 70/70 pass

node --test tests/main/ipc-plugin-install.test.js
# 15/15 pass

npm run typecheck
# pass

npm run test:control-center
# 10/10 pass
```

Full verification before commit:

```bash
npm run check:syntax
# pass

npm test
# 454/454 pass

npm run test:control-center
# 10/10 pass

git diff --check
# pass

node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# project-context ok
```

## New Coverage

- setup success uses file/args parsing and `shell: false`;
- setup runtime is visible as `running` during execution and final after process exit;
- non-zero setup exit records failed runtime and error logs;
- disabled plugins, blocked plugins, unknown setup ids, escaping setup cwd symlinks, and duplicate running setup are rejected before unsafe execution;
- active setup processes are stopped on plugin disable and app shutdown cleanup;
- IPC delegates `plugins:run-setup` to `PluginService`;
- shared contracts cover setup run results;
- Control Center smoke covers disabled setup button, enabled setup action, final status, and setup logs.

## Acceptance

- Setup execution is explicit and user-triggered.
- Setup never runs during install or enable.
- Setup execution is not exposed as a generic shell command runner.
- Setup commands and service commands are spawned without shell expansion.
- Runtime status and logs are visible in Control Center.
- Documentation describes the new capability without overstating sandboxing, bridge integration, or process-tree guarantees.
