# Plugin Service Force Stop Design

> Date: 2026-06-17
> Phase target: Phase 69

## Goal

Phase 69 extends the service-only cleanup boundary after Phase 68.

OpenPet already does two useful things for declaration-only `entries.services`:

- it tries process-group `SIGTERM` before direct child fallback;
- it keeps service state at `stopping` until the child exit is confirmed.

What it still does **not** do is actively recover when a service ignores that initial stop request. A stubborn child can remain in `stopping` forever, which leaves the host with an honest state machine but no bounded cleanup outcome.

The goal of Phase 69 is to add a bounded host-side force-stop path for service entries only.

## Current State

Today, `PluginService`:

- starts service entries as detached process-group roots where supported;
- records runtime state and logs in the service layer;
- uses `stopPluginServiceRuntime()` for explicit stop, disable cleanup, and app shutdown cleanup;
- sends `SIGTERM` once through process-group kill or direct-child fallback;
- transitions to `stopped` only after child exit confirmation;
- leaves runtime in `stopping` if the child never exits.

That final point is now the main operational gap.

## Scope

In scope:

- add a grace-period timer for service stop requests;
- escalate to a stronger host-side kill after that grace period when a service is still running;
- keep the work limited to `entries.services`;
- keep the final runtime state on forced cleanup inside the existing `failed` contract;
- add deterministic tests for graceful stop, forced stop, disable cleanup, and shutdown cleanup;
- update phase/review/live docs to explain the stronger but still bounded cleanup contract.

Out of scope:

- no setup cleanup changes;
- no declaration-command cleanup changes;
- no new renderer UI states;
- no new TypeScript contract variants such as `killed` or `timed-out`;
- no repeated escalation ladder beyond one forced stop path;
- no claim that every descendant process is guaranteed to die on every OS.

## Recommended Runtime Contract

### Service-only boundary

Phase 69 should apply only to declared service entries.

Setup and command cleanup already have different runtime shapes, different user expectations, and different risk surfaces. Pulling them into the same phase would make both tests and public wording noisier without improving the current highest-risk runtime surface first.

### Grace period

When `stopService()` begins, or when service stop is triggered through disable/app shutdown cleanup:

1. mark the runtime `stopping`;
2. send the existing best-effort `SIGTERM` stop request;
3. start a short grace-period timer owned by the runtime.

If the child exits before the timer fires:

- clear the timer;
- preserve the existing Phase 68 behavior (`stopped` after confirmed exit).

### Forced stop

If the timer fires and the runtime is still `stopping`:

1. try a stronger host-side kill;
2. log that the grace period expired and a force stop was attempted;
3. keep waiting for the child `exit` callback to finalize state.

The final state remains `failed`, not a new enum value.

Why `failed`:

- it keeps the shared runtime/view contract stable;
- it is the most conservative operational truth;
- it avoids widening Control Center logic for a host-specific cleanup detail before the product truly needs a new user-facing state.

## Force-Stop Mechanics

Phase 69 should keep the current process-group-first model and add a second helper:

- graceful stop helper: sends `SIGTERM` to process group, then direct child fallback;
- force-stop helper: sends `SIGKILL` to process group, then direct child fallback.

The host should not assume process-group kill works everywhere. The same fallback pattern should stay in place for the force-stop helper.

This design intentionally stops short of:

- enumerating or traversing descendants manually;
- OS-specific process-table inspection;
- retry loops;
- repeated signal escalation.

Those would be a later phase if the product truly needs them.

## Runtime Fields And Logging

No new runtime status enum is required.

The existing `runtime.error`, `runtime.signal`, and logs are enough if they become more explicit.

Recommended log sequence:

- `Service stop requested`
- `Service stop grace period expired; force stop requested`
- later either:
  - `Service stopped` for graceful confirmed exit, or
  - `Service exited` / failure log for forced-stop completion

Recommended runtime error text when force cleanup is needed:

- `Service did not stop before force kill`

That gives operators a durable signal without requiring a new renderer state.

## Testing Strategy

Phase 69 should stay service-local and deterministic.

Required coverage:

1. **graceful stop remains unchanged**
   - stop request sets `stopping`;
   - child exits before timer;
   - no force-stop helper is called.

2. **force stop fires after grace period**
   - child ignores initial `SIGTERM`;
   - timer expires;
   - host attempts force stop;
   - runtime still waits for exit confirmation before terminal state.

3. **disable cleanup uses the same force-stop path**
   - disable a plugin with a stubborn service;
   - force stop is attempted after grace period.

4. **app shutdown cleanup uses the same force-stop path**
   - `stopAllServices()` on a stubborn service triggers the same path.

5. **timers are cleared on early exit**
   - no delayed force-stop attempt after a graceful exit.

6. **duplicate starts remain blocked while a service is still stopping**
   - both before and after force-stop request, until exit.

Tests should use injected fake timers or a small injected scheduler boundary instead of real sleeps.

## Documentation Impact

Phase 69 should update:

- the new phase record;
- the production review record;
- `docs/HANDOFF.md`;
- `docs/development-summary.md`;
- `docs/project-status-review.md`;
- `docs/project-context.json`;
- `docs/productization-v1.1-todo-design.md`;
- `docs/project-review-todo-design.md`;
- extension runtime docs where they describe cleanup guarantees.

Required wording:

- service cleanup now has a bounded host-side grace period plus force-stop attempt;
- final state still does not prove absolute descendant cleanup;
- setup and command cleanup remain on their previous, weaker paths.

## Acceptance

Phase 69 is complete when:

- service stop requests start a bounded grace period;
- stubborn services trigger one force-stop attempt after the grace period;
- graceful exits do not trigger the force-stop path;
- explicit stop, disable cleanup, and app shutdown cleanup all share the same bounded service cleanup contract;
- tests cover graceful and stubborn shutdown cases deterministically;
- production review is recorded and any findings are fixed;
- live docs describe the stronger service-only cleanup truth without overstating OS guarantees.
