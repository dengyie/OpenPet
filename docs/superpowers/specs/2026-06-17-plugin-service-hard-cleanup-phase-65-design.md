# Plugin Service Hard Cleanup Phase 65 Design

> Date: 2026-06-17
> Phase target: Phase 65

## Goal

Phase 65 hardens the stop lifecycle for declaration-only plugin service entries so OpenPet no longer reports a service as fully stopped before the host has authoritative exit evidence from the child process.

This phase stays deliberately narrow: it only upgrades `entries.services` lifecycle control and testing. It does not expand setup execution, command execution, bridge scope, auto-start policy, health polling, shell behavior, or sandbox claims.

## Current State

OpenPet already supports explicit plugin service lifecycle controls:

- `PluginService.startService()` starts declared local services with `shell: false`, plugin-local cwd guards, minimal inherited environment, and detached process-group roots where supported.
- `PluginService.stopService()` currently attempts process-group `SIGTERM` first and falls back to direct child kill when that path fails.
- Service runtime state is exposed to Control Center through `running`, `stopping`, `stopped`, `exited`, and `failed` view data.
- Disable and app-shutdown cleanup already call the same stop path.

However, the current implementation still has a lifecycle honesty gap:

- `stopPluginServiceRuntime()` appends a `Service stopped` log immediately after sending a signal, before the child has actually exited.
- The returned runtime from `stopService()` may look fully stopped even though the process is still only in a best-effort shutdown window.
- Tests cover process-group signalling and child fallback, but they do not yet make the exit-confirmation boundary the central contract.

That gap matters because the project docs now explicitly call out “hard cleanup guarantees” as remaining future work. Before OpenPet can credibly expand that area, the service stop state machine must first become stricter and more evidence-based.

## Scope

In scope:

- tighten the service-only stop state machine in `PluginService`;
- keep services in `stopping` until exit confirmation arrives;
- make explicit stop, disable cleanup, and app-shutdown cleanup all use the same exit-confirmed semantics;
- keep process-group `SIGTERM` as the first stop attempt and direct child `SIGTERM` as the fallback path;
- improve logs and runtime fields so they reflect signal intent versus confirmed exit more honestly;
- add targeted tests for the stricter service stop contract;
- update phase/review docs and live docs where the current lifecycle truth changes.

Out of scope:

- no `entries.setup` cleanup changes;
- no declaration command cleanup changes;
- no escalation to `SIGKILL` or repeated retry loops in this phase;
- no background service watchdog;
- no health-check policy changes;
- no bridge or renderer changes;
- no claim that every descendant process is guaranteed to die on every OS.

## Design Overview

Phase 65 keeps `PluginService` as the sole owner of plugin service lifecycle. The design does not introduce a second cleanup coordinator or OS-specific helper daemon.

The phase changes the meaning of “stop” from:

- “OpenPet sent a stop signal”

to:

- “OpenPet entered a stop sequence and will not report full stop success until the child exit callback confirms the process is gone.”

That distinction is the whole point of the phase.

## Runtime State Model

### Current intent

The service runtime already distinguishes:

- `running`
- `stopping`
- `stopped`
- `exited`
- `failed`

Phase 65 keeps those labels, but narrows when each one is allowed.

### Tightened rules

#### `running`

The service child exists and has not entered shutdown.

#### `stopping`

OpenPet has sent a stop signal through the process-group path or the direct-child fallback path, and is now waiting for authoritative exit confirmation.

This state must remain visible until one of these happens:

- the child emits `exit`;
- the stop path itself throws before any signal can be delivered, in which case the runtime moves to `failed`.

#### `stopped`

This state is only allowed after a stop sequence initiated by:

- explicit `stopService()`;
- plugin disable cleanup;
- app shutdown cleanup;

and only after the child emits `exit`.

#### `exited`

This remains the state for a natural clean exit that was not initiated by a stop sequence.

#### `failed`

This remains the state for:

- non-zero exits;
- signal exits not associated with a successful stop sequence;
- stop-path failures before a signal can be delivered.

## Stop Flow

### 1. Explicit stop

`stopService(pluginId, serviceId)` should:

1. validate the plugin and service id as it does today;
2. locate the active runtime;
3. transition the runtime from `running` to `stopping`;
4. record stop intent metadata such as `stoppedAt`;
5. attempt process-group `SIGTERM`;
6. if that fails, attempt direct child `SIGTERM`;
7. return the runtime in `stopping`, not `stopped`.

The later `exit` event decides whether the terminal state becomes `stopped` or `failed`.

### 2. Disable cleanup

`setEnabled(pluginId, false)` should keep using the same stop path. Phase 65 does not add a separate disable-only cleanup branch.

The visible change is that the plugin’s service runtime should remain `stopping` after disable until child exit confirmation arrives.

### 3. App shutdown cleanup

`stopAllServices()` should keep delegating to the same service stop path for running services.

Again, the visible change is the honesty of intermediate state:

- stop requested now;
- fully stopped only after exit.

## Logging

Current logging is slightly too eager because it can read like the service is already gone.

Phase 65 should split log intent from log confirmation:

- when stop begins: `Service stop requested`
- when exit confirms a stop path finished cleanly: `Service stopped`
- when the stop path itself throws: `Service stop failed`

This keeps the logs aligned with the runtime state machine and gives Control Center users a truthful sequence.

The phase does not need to add verbose OS-level debugging output or descendant PID reporting.

## Error Handling

Failure cases that must stay explicit:

- process-group signal path throws;
- direct-child fallback path throws;
- child exits non-zero after a stop request;
- child exits by signal after a stop request but without a clean stop interpretation;
- duplicate start is attempted while the runtime is still `stopping`.

Phase 65 should preserve the existing duplicate-start protection that treats `stopping` as active.

## Testing Strategy

This phase should stay TDD-first and service-local.

Required new or tightened coverage:

- stopping a service returns `runtime.status === "stopping"` until the child exit event fires;
- `listPlugins()` also shows `stopping` until exit;
- process-group success does not immediately mark the runtime stopped;
- direct-child fallback also does not immediately mark the runtime stopped;
- explicit stop becomes `stopped` only after exit confirmation;
- disable cleanup becomes `stopped` only after exit confirmation;
- shutdown cleanup becomes `stopped` only after exit confirmation;
- a stop-path exception moves the runtime to `failed`;
- logs distinguish `Service stop requested` from later `Service stopped`.

The phase does not need a real OS integration smoke test for stubborn grandchildren yet. That still belongs to a later, stronger cleanup phase.

## Documentation Impact

Phase 65 should update:

- the new phase record;
- the production review record;
- `docs/development-summary.md`;
- `docs/project-status-review.md`;
- `docs/HANDOFF.md`;
- `docs/productization-v1.1-todo-design.md`;
- `docs/project-context.json`;

with narrower, more honest wording such as:

- services now use exit-confirmed stop state transitions;
- process-group signalling remains best-effort;
- hard descendant termination guarantees are still future work.

Docs must not overclaim:

- no “fully guaranteed cleanup” language;
- no implication that setup or commands received the same hardening;
- no claim that all descendants are proven dead before OpenPet continues.

## Acceptance

Phase 65 is complete when:

- service stop requests leave runtime state in `stopping` until child exit confirmation;
- service runtime only becomes `stopped` after a confirmed stop-path exit;
- disable and shutdown cleanup share the same confirmed-stop semantics;
- targeted tests cover process-group success, fallback, state transitions, and logging;
- production review is recorded and any findings are resolved;
- live docs describe the stronger stop semantics without upgrading support claims beyond what the code proves.
