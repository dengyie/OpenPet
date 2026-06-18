# Phase 68: Plugin Service Exit-Confirmed Stop

> Date: 2026-06-17
> Scope: tighten declaration-only plugin service stop semantics so OpenPet no longer reports a service as fully stopped before the child process exit is confirmed.

## Goal

Phase 68 hardens the service lifecycle truth for local extension `entries.services`.

Before this phase, OpenPet attempted best-effort process-group cleanup first and direct child `SIGTERM` second, but explicit stop logging could still imply the service was already gone before the host had authoritative exit confirmation from the child process.

This phase makes the stop path more honest without expanding the runtime surface:

- `stopService()` now returns `stopping` until the child emits `exit`;
- the latest log reads `Service stop requested` during the shutdown window;
- only the later exit callback can transition the runtime to `stopped`;
- disable cleanup and app-shutdown cleanup continue to use the same stop path.

## Scope

In scope:

- tighten the service stop state machine in `PluginService`;
- split stop-request logging from stop-confirmation logging;
- keep process-group `SIGTERM` first and direct-child fallback second;
- preserve duplicate-start protection while a service is still `stopping`;
- add service-layer tests for explicit stop, disable cleanup, process-group success, child fallback, and stop-completion logging.

Out of scope:

- no new setup cleanup behavior;
- no new declaration-command cleanup behavior;
- no escalation to `SIGKILL` or retry loops;
- no new background health policy;
- no claim of guaranteed descendant termination on every OS.

## Implementation

Updated files:

- `src/main/services/plugin-service.js`
- `tests/services/plugin-service.test.js`

Behavior changes:

1. `stopPluginServiceRuntime()` now:
   - marks runtime state as `stopping`,
   - attempts the existing stop path,
   - logs `Service stop requested` only when a stop signal was actually sent,
   - logs `Service stop failed` if the stop path throws before the service can be signaled.

2. The service child `exit` handler now:
   - keeps requested stops separate from natural exits,
   - clears the held child reference,
   - transitions requested-stop exits to `stopped` only after confirmation,
   - keeps non-zero requested-stop exits visible as `failed`,
   - appends `Service stopped` only after the exit callback confirms shutdown.

3. The tests now prove:
   - stop requests stay `stopping` until exit,
   - process-group stop and child fallback both preserve `stopping`,
   - disable cleanup keeps the same semantics,
   - stop completion is logged only after exit confirmation.

## Validation

Targeted local verification:

```bash
node --test tests/services/plugin-service.test.js
```

Full local verification after docs:

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
```

## Outcome

OpenPet still does not claim hard process-tree cleanup guarantees. What changed is the host's honesty about what it knows:

- a stop signal means "shutdown requested";
- a later `exit` event means "shutdown confirmed".

That narrower contract makes Control Center state, logs, and future runtime work easier to trust.
