# Phase 58: Plugin Service Lifecycle

> Date: 2026-06-17
> Branch: `codex/extension-service-lifecycle`

## Goal

Make declared `entries.services` useful through explicit Control Center start/stop actions while preserving conservative extension boundaries.

## What Changed

- `PluginService` now owns service runtime state with `startService()`, `stopService()`, and `stopAllServices()`.
- Service starts validate plugin existence, ecosystem policy, enabled state, service id, and plugin-local cwd, including realpath checks against symlink escapes.
- Service commands are parsed into executable plus args and spawned with `shell: false`, captured stdout/stderr, and a minimal inherited environment.
- Service runtime state is exposed through `listPlugins()` as `running`, `stopping`, `stopped`, `exited`, or `failed`, with pid, timestamps, command, cwd, exit code, signal, and error fields.
- Plugin disable and app quit now attempt to stop managed services.
- IPC, preload, shared contracts, demo API, hook state, and Plugins pane UI now expose Start/Stop service controls.
- Control Center smoke coverage verifies disabled service buttons, enable/start/stop flow, runtime text, and service logs.

## Boundaries Kept

- Services do not auto-start on install, enable, app boot, or dashboard open.
- Service commands are spawned without shell expansion.
- Setup commands, health checks, bridge token injection, generic shell command execution, and full process-tree cleanup remain future work.
- The local service process model remains an honest lifecycle-control boundary, not a complete sandbox claim.

## Tests Added

- Plugin service lifecycle unit tests for start/stop, disabled plugin rejection, ecosystem block rejection, unknown service id rejection, duplicate start rejection, non-zero exit failure state, cwd symlink escape rejection, disable cleanup, and stopping-state behavior.
- IPC delegation tests for `plugins:start-service` and `plugins:stop-service`.
- Control Center Playwright smoke expectations for service status, Start/Stop buttons, and service logs.

## Verification

```bash
node --test tests/services/plugin-service.test.js
npm run check:syntax
npm run test:control-center
npm test
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```
