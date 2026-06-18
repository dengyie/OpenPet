# Phase 69: Plugin Service Force Stop

> Date: 2026-06-17
> Scope: add a bounded grace-period plus host-side force-stop path for stubborn declaration-only service entries.

## Goal

Phase 68 made service stop state honest: OpenPet no longer reports `stopped` until child exit is confirmed.

Phase 69 makes that stop path bounded as well:

- service stop now starts with the existing best-effort `SIGTERM` request;
- a short grace period is attached to the runtime;
- if the child still has not exited when the grace period expires, OpenPet attempts a host-side force stop;
- the final terminal state stays on the existing `failed` contract.

This phase only strengthens `entries.services`. Setup and command cleanup semantics are unchanged.

## Scope

In scope:

- configurable service stop grace period in `PluginService`;
- force-stop helper using process-group-first `SIGKILL` with direct-child fallback;
- timer cleanup on confirmed early exit;
- deterministic tests for explicit stop, disable cleanup, and app shutdown cleanup when services ignore the first stop request;
- phase/review/live-doc updates for the stronger service-only cleanup contract.

Out of scope:

- setup cleanup changes;
- declaration-command cleanup changes;
- new renderer-only states such as `killed` or `timed-out`;
- multi-step escalation ladders;
- any claim of guaranteed descendant cleanup across all operating systems.

## Implementation

Updated files:

- `src/main/services/plugin-service.js`
- `tests/services/plugin-service.test.js`

Behavior changes:

1. Service runtimes now carry:
   - `stopTimer`
   - `stopGracePeriodMs`

2. `stopPluginServiceRuntime()` now:
   - preserves the existing Phase 68 `stopping` contract,
   - sends the current graceful stop request,
   - starts a grace-period timer,
   - escalates to a force-stop helper if the runtime still has not exited.

3. The service exit handler now:
   - clears any pending stop timer,
   - treats forced-stop completions as `failed`,
   - preserves graceful requested-stop exits as `stopped`,
   - records a distinct completion log for force-stopped services.

4. The tests now prove:
   - graceful exits do not trigger force stop;
   - stubborn services receive `SIGTERM` then `SIGKILL`;
   - disable cleanup and `stopAllServices()` share the same bounded cleanup behavior;
   - duplicate starts remain blocked while the service is still in `stopping`.

## Validation

Targeted verification:

```bash
node --test tests/services/plugin-service.test.js
```

Full verification:

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

## Outcome

OpenPet still does not claim absolute process-tree cleanup guarantees.

What changed in Phase 69 is narrower and operationally useful:

- service stop is honest about intermediate state,
- service stop is now bounded by a host-side grace period,
- stubborn services trigger one conservative force-stop attempt,
- final state remains fail-closed rather than inventing a broader readiness claim.
