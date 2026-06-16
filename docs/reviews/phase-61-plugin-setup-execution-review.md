# Phase 61 Production Code Quality Review

> Date: 2026-06-17
> Branch: `codex/plugin-setup-execution`
> Scope: explicit plugin setup execution, IPC exposure, Control Center operation, logs, tests, and docs

## Scope

- Base: current `HEAD` on `codex/plugin-setup-execution`
- Scope mode: working tree Phase 61 diff
- Changed files: `PluginService.runSetup`, IPC/preload/shared contracts, Control Center setup execution flow, targeted tests, live docs, and Phase 61 record
- Risk level: high because the change introduces an explicit local process execution path for third-party extension setup
- Assumptions: setup is intentionally user-triggered only; install, update, enable, service start, and health checks must not run setup

## Findings

No blocking production findings remain after review.

## Review Optimizations Applied

- `src/control-center/src/hooks/usePluginsPane.ts`: setup success now updates plugins through a functional `setPlugins((currentPlugins) => ...)` call so the UI does not depend on a stale closure if plugin state refreshes while setup is running.
- `docs/plugin-ecosystem-rules.md`: clarified that platform overrides apply to service entries, not setup entries, avoiding an overbroad third-party author promise.

## Architecture Assessment

The behavior lives in the correct layer. `PluginService` owns setup runtime state, process spawning, cwd checks, logs, and policy checks. IPC and preload only expose the new action. Control Center renders explicit user controls and updates state from the returned runtime. The change does not turn setup into install-time code execution or generic background automation.

## Robustness Assessment

Setup rejects disabled plugins, policy-blocked plugins, unknown setup ids, duplicate running setup, and cwd paths or symlinks that escape the plugin directory before spawning. Commands are spawned without shell expansion and with a minimal environment. Runtime state records success, failure exit codes, spawn errors, and logs. Operators can identify setup runs through `setup:<setupId>` plugin logs.

The main residual operational limit is intentional: once a setup process starts, Phase 61 does not add cancellation, timeout, or hard process-tree cleanup guarantees. Docs keep those limits explicit.

## Test Assessment

Strong coverage:

- service tests cover success, non-zero failure, disabled plugins, policy blocks, unknown setup ids, cwd symlink escapes, duplicate running setup, stdout/stderr logs, no shell expansion, and runtime state;
- IPC tests cover `plugins:run-setup` delegation;
- shared TypeScript fixture covers `PluginSetupRunResultViewState`;
- Control Center smoke covers disabled setup action, enabled setup execution, succeeded status, and setup logs.

The most valuable future test would be a real spawned command fixture that fails through the Node `error` event, but the current fake-process coverage and runtime code path make this a follow-up rather than a merge blocker.

## Verification

Checks run during review:

```bash
node --test tests/services/plugin-service.test.js
# 68/68 pass

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
# 456/456 pass

npm run test:control-center
# 10/10 pass

git diff --check
# pass

node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# project-context ok
```

## Final Recommendation

Safe to merge.
