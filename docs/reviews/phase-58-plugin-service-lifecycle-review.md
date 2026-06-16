# Phase 58 Production Review: Plugin Service Lifecycle

> Date: 2026-06-17
> Branch: `codex/extension-service-lifecycle`
> Skill: `$production-code-quality-review`

## Scope

- Base: `origin/main`
- Scope mode: working tree, Phase 58 changes only
- Changed files reviewed: `src/main/services/plugin-service.js`, IPC/preload/shared contracts, Control Center Plugins pane/API/hook changes, lifecycle tests, and live docs
- Risk level: high, because this phase introduces explicit process lifecycle management for extension service entries
- Assumptions: service entries are local software launched only after explicit user action; OpenPet provides lifecycle transparency and control, not a full process sandbox

## Findings

No open P0/P1/P2 findings remain.

### Resolved During Review: Stop State Was Too Eager

- Location: `src/main/services/plugin-service.js`
- Problem: the first implementation marked a service `stopped` immediately after sending `SIGTERM`, before the child emitted `exit`.
- Impact: Control Center could show a stopped service while the process was still alive, and duplicate starts could race a service that was still shutting down.
- Evidence: `stopPluginServiceRuntime()` set `runtime.status = 'stopped'` after `kill()`, independent of child exit.
- Fix: keep runtime status as `stopping` until the child emits `exit`; treat both `running` and `stopping` as active states for duplicate-start rejection.
- Confidence: High
- New or pre-existing: introduced by Phase 58 and fixed in Phase 58.

## Architecture Assessment

The behavior lives in the right layer. `PluginService` remains the owner of plugin policy checks, enabled-state checks, service id lookup, cwd containment, runtime state, process ownership, and logs. IPC/preload/Control Center only expose explicit user actions and typed view state.

Coupling did not materially worsen: the renderer does not learn process handles, API keys, or host internals. The only new shared contract is the service runtime/control result view.

## Robustness Assessment

Starts fail before spawning for disabled plugins, policy-blocked plugins, unknown service ids, and cwd traversal/symlink escapes. Runtime stdout/stderr and exit states are logged. Non-zero exits and signal exits become `failed`; clean exits become `exited`; explicit stop transitions through `stopping` and lands on `stopped` after child exit.

Remaining known limits are intentionally documented: no setup lifecycle, no health checks, no bridge token injection, no generic shell command execution, and no full process-tree cleanup.

## Test Assessment

Strongest coverage:

- `tests/services/plugin-service.test.js` covers lifecycle success and failure paths, cwd symlink containment, non-zero exits, disable cleanup, and stopping-state behavior.
- `tests/main/ipc-plugin-install.test.js` covers start/stop IPC delegation.
- `tests/control-center/control-center-smoke.spec.js` covers the UI flow and logs.

Missing scenario that matters most:

- A real spawned process that ignores `SIGTERM` is not covered yet. That belongs with a future stronger process-tree cleanup phase rather than this explicit lifecycle-control slice.

## Meaningful Strengths

- Service start is deny-by-default behind enabled plugin state and ecosystem policy.
- Runtime state is not persisted as durable truth; it is reconstructed from the current main-process ownership map.
- The docs avoid claiming auto-start, setup, health, bridge, shell expansion, or complete sandboxing.

## Final Recommendation

Safe to merge after the full verification suite passes.
