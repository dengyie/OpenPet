# Phase 60: Plugin Setup Status and Service Cleanup

> Date: 2026-06-17
> Branch: `codex/plugin-setup-status`

## Goals

- Make declared setup steps visible as reviewed extension metadata without executing them.
- Strengthen the lifecycle boundary for declared plugin service entries by making service stop operations clean up the spawned process group when the host platform supports it.

## Scope

- Normalize `entries.setup` declarations with safe ids, commands, titles, and plugin-local cwd values.
- Carry setup declarations through shared Control Center contracts, demo/review payloads, and installed plugin entry details.
- Show setup entries with runtime status `not-run`; setup commands are not runnable and are not mixed into plugin command handlers.
- Start declared plugin service processes with `detached: true` so they become process-group roots on supported platforms.
- On explicit Stop, plugin disable, and app quit, attempt to send `SIGTERM` to the process group before falling back to the direct child process.
- Keep existing runtime state, stdout/stderr log capture, health state, and Control Center behavior unchanged.
- Add deterministic tests for setup normalization, setup visibility, detached spawn options, process-group stop, and child-kill fallback.

Out of scope:

- no setup command execution,
- no service auto-start,
- no background health polling,
- no bridge token injection,
- no generic shell command execution,
- no claim that local services are fully sandboxed or that every descendant process can be forcibly terminated on every OS.

## Implementation Notes

`normalizePluginManifest()` now accepts `entries.setup` and validates it like other extension declarations. `PluginService` decorates setup entries with a read-only runtime view:

```json
{ "status": "not-run", "lastRunAt": "", "exitCode": null, "error": "" }
```

Control Center renders setup declarations in the existing entry details panel for review and installed plugin rows. This is a status surface only; setup commands are not executed by OpenPet in this phase.

`PluginService` now accepts an injectable `killServiceProcess` function for tests and runtime ownership. When a running service is stopped, the service first tries `killServiceProcess(-pid, "SIGTERM")`. If that fails, it falls back to `runtime.child.kill("SIGTERM")`, preserving the previous stop behavior.

This is intentionally best-effort. POSIX process groups are covered by the negative PID path. Platforms that do not support that path still receive the previous direct child stop signal.

## Tests

Targeted verification during implementation:

```bash
node --test tests/plugins/manifest.test.js tests/services/plugin-service.test.js
# 75/75 pass
```

Full verification before commit:

```bash
npm run check:syntax
# pass

npm test
# 446/446 pass

npm run test:control-center
# 10/10 pass

git diff --check
# pass

node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# project-context ok
```

New coverage:

- setup declarations normalize and reject unsafe setup ids/cwd values,
- setup entries appear in plugin service output with `not-run` status and do not become runnable commands,
- Control Center smoke covers setup entry visibility in review and installed plugin rows,
- service spawn options include `detached: true`,
- stop uses process-group `SIGTERM` before child kill fallback,
- child kill still runs when process-group signalling fails.

## Acceptance

- Setup declarations are visible for review without executing anything.
- Shared contracts and fixtures include `entries.setup`.
- Plugin service lifecycle tests cover process-group cleanup and fallback behavior.
- Existing service start/stop semantics remain unchanged for Control Center and IPC callers.
- Documentation states the new setup and cleanup boundaries honestly: setup status is read-only and cleanup is best-effort process-group cleanup, not complete sandboxing or guaranteed descendant termination.
