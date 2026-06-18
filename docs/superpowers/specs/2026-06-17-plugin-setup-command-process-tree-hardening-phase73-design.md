# Plugin Setup and Command Process Tree Hardening Design

> Date: 2026-06-17
> Phase target: Phase 73

## Goal

Phase 72 strengthened declared service cleanup by inserting a host-owned process-tree fallback between process-group signalling and direct child kill.

Phase 73 extends that same conservative cleanup idea to the remaining explicit local-process runtime shapes:

- `entries.setup`
- declaration-only `entries.commands`

The goal is not to make these runtimes identical to services. Services still own the stronger contract because they:

- start detached process groups,
- expose a renderer-visible long-running runtime surface,
- and use a bounded host-side force-stop path.

Phase 73 only closes the narrower cleanup gap: when setup or declaration-only command stop is requested and the child has a visible PID, OpenPet should try host-owned process-tree signalling before falling back to direct child kill.

## Current State

Today the stop paths split like this:

- services:
  1. `process.kill(-pid, signal)`
  2. `signalServiceProcessTree(pid, signal)`
  3. `child.kill(signal)`
- setup:
  1. `child.kill('SIGTERM')`
- declaration-only commands:
  1. `runtime.stop(...)`
  2. inside `runtime.stop`, `child.kill(signal)`

This leaves setup and declaration-only commands on a weaker cleanup tier even though:

- both already keep stop intent visible until exit confirmation,
- both already have bounded host-owned runtime state/log semantics,
- and both already run as explicit user-triggered local processes, not background auto-start work.

## Scope

In scope:

- reuse the existing host-owned `signalServiceProcessTree(pid, signal)` helper;
- apply that helper to setup stop requests before direct child kill fallback;
- apply that helper to declaration-only command stop requests before direct child kill fallback;
- keep the same exit-confirmed stop semantics from Phase 70;
- add targeted service-layer tests;
- update phase/review/live docs where the current runtime truth changes.

Out of scope:

- no process-group signalling for setup or declaration-only commands;
- no force-stop timer or `SIGKILL` escalation for setup or declaration-only commands;
- no new renderer runtime status enums;
- no bridge expansion or command orchestration redesign;
- no claims of universal process-tree guarantees.

## Design

### Decision 1: reuse the existing helper instead of inventing a new runtime-specific abstraction

- Problem: services already have a platform-specific process-tree helper.
- Choice: keep using `signalServiceProcessTree(pid, signal)` for setup and declaration-only commands.
- Reason: the helper is already injectable, tested, and host-owned. Reusing it avoids duplicating OS process-table logic.

### Decision 2: keep setup and command cleanup narrower than service cleanup

- Problem: it would be easy to turn this into a broader lifecycle rewrite.
- Choice: only insert `signalServiceProcessTree` before `child.kill`; do not add process-group or force-stop semantics.
- Reason: setup and declaration-only commands are explicit short-lived tasks, not long-running managed services. Matching the service contract would widen behavior and risk without a user requirement.

### Decision 3: store PIDs on setup and declaration-only command runtimes

- Problem: the stop helper needs a numeric PID to attempt tree cleanup.
- Choice: persist `pid: Number(child.pid) || 0` on the in-memory setup and declaration-only command runtimes.
- Reason: this is the smallest state expansion needed to reuse the helper. It stays internal to `PluginService` and does not require shared contract changes.

## PluginService Integration

After Phase 73 the cleanup ordering should be:

- services:
  1. process-group signal
  2. process-tree fallback
  3. direct child kill
- setup:
  1. process-tree fallback
  2. direct child kill
- declaration-only commands:
  1. process-tree fallback
  2. direct child kill

The existing stop-intent/exit-confirmation semantics stay unchanged:

- setup still becomes `stopping`, then finalizes from the child `exit` event;
- declaration-only commands still reject the command promise with `Command stopped` after exit confirmation;
- direct child kill remains the last fallback when the helper is unavailable or throws.

## Testing Strategy

Required coverage:

1. declaration-only command disable cleanup uses tree signalling before child kill fallback;
2. declaration-only command app-shutdown cleanup uses tree signalling before child kill fallback;
3. declaration-only command cleanup still falls back to direct child kill when tree signalling throws;
4. setup disable cleanup uses tree signalling before child kill fallback;
5. setup app-shutdown cleanup uses tree signalling before child kill fallback;
6. setup cleanup still falls back to direct child kill when tree signalling throws;
7. existing stop-intent / exit-confirmed semantics remain intact.

## Acceptance

Phase 73 is complete when:

- setup stop requests try host-owned process-tree signalling before child kill fallback when a valid child PID exists;
- declaration-only command stop requests do the same;
- setup and declaration-only command cleanup still remain direct-child best effort when stronger cleanup is unavailable;
- no service lifecycle, renderer contract, or plugin manifest behavior regresses;
- docs describe the result as broader host-owned cleanup hardening, not total process policing.
