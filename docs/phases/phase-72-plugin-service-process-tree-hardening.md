# Phase 72: Plugin Service Process-Tree Hardening

> Date: 2026-06-17
> Scope: strengthen declared plugin service cleanup by adding a host-owned process-tree fallback when process-group signalling is unavailable or fails.

## Goal

Phase 68 made service stop state honest, and Phase 69 made it bounded with one conservative host-side force-stop attempt.

Phase 72 closes the next narrower cleanup gap:

- service stop still prefers process-group signalling first;
- when that path fails, OpenPet now tries a host-owned process-tree fallback before dropping to direct child kill;
- the same stronger fallback applies to both graceful stop and bounded force-stop escalation;
- renderer contracts remain unchanged, and docs stay conservative about what the host can prove.

This phase stays service-only. Setup and declaration-only command cleanup semantics do not change.

## Scope

In scope:

- a small host-owned `service-process-tree` helper;
- process-tree fallback between process-group signalling and direct child kill for declared service entries;
- deterministic helper tests and service-layer fallback-order tests;
- live-doc updates for the stronger but still non-absolute service cleanup truth.

Out of scope:

- setup descendant cleanup hardening;
- declaration-only command descendant cleanup hardening;
- new renderer-only runtime statuses;
- plugin manifest cleanup hints;
- bridge expansion, auto-start, or richer health policy changes;
- universal sandbox or guaranteed total process policing claims.

## Implementation

Updated files:

- `src/main/services/service-process-tree.js`
- `src/main/services/plugin-service.js`
- `tests/services/service-process-tree.test.js`
- `tests/services/plugin-service.test.js`

Behavior changes:

1. `src/main/services/service-process-tree.js` now provides:
   - recursive descendant discovery from POSIX `ps` output;
   - recursive descendant discovery from Windows `Get-CimInstance Win32_Process` output;
   - `signalServiceProcessTree(pid, signal)` that:
     - returns `false` for invalid root pids,
     - uses `taskkill /PID <pid> /T` on Windows for `SIGTERM`,
     - uses `taskkill /PID <pid> /T /F` on Windows for `SIGKILL`,
     - signals POSIX descendants before the root pid.

2. `PluginService` now defaults `signalServiceProcessTree(pid, signal)` to that helper while still allowing test injection.

3. Service cleanup ordering is now:
   1. process-group signal via negative pid;
   2. process-tree helper fallback;
   3. direct child kill fallback.

4. The same fallback ordering now applies to:
   - graceful requested stop with `SIGTERM`;
   - bounded force-stop escalation with `SIGKILL`.

5. Service runtime/log semantics from Phase 68 and Phase 69 remain unchanged:
   - stop intent still becomes visible as `stopping`;
   - exit confirmation still decides the terminal result;
   - force-stop outcomes still remain fail-closed on the existing `failed` contract.

## Decision Record

### Decision 1: keep Phase 72 service-only

- Problem: setup and declaration-only command cleanup still remain weaker than services.
- Choice: harden only declared `entries.services` in this phase.
- Reason: long-running services are the runtime shape where leftover descendants most directly undermine operator trust. Expanding setup and command cleanup at the same time would widen scope across multiple runtime shapes.
- Risk: setup and declaration-only commands still remain direct-child best effort. This is acceptable because the limitation is explicit and unchanged.

### Decision 2: strengthen fallback order instead of widening renderer contracts

- Problem: better cleanup could be expressed either as stricter runtime classification or as a stronger host fallback path.
- Choice: add the stronger host fallback path without changing renderer statuses.
- Reason: the current product gap was operational cleanup strength, not renderer state shape. Keeping `PluginService` state stable lowers risk and matches the existing Phase 72 branch plan.
- Risk: the renderer still cannot distinguish whether process-group stop or tree fallback succeeded. That is acceptable because this phase is about cleanup strength, not new UI states.

## Validation

Targeted verification during implementation:

```bash
node --test tests/services/service-process-tree.test.js tests/services/plugin-service.test.js --test-name-pattern "service process tree|plugin service falls back to child kill when process group stop fails|plugin service falls back to child kill when process group and tree cleanup both fail|plugin service force-stop falls back to tree cleanup when process group kill fails|plugin service force stops stubborn services after the grace period|plugin service app shutdown cleanup force stops stubborn services after the grace period"
```

Full verification before commit:

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

## Outcome

After Phase 72:

- declared service entries still use the existing bounded host cleanup path;
- service cleanup now has one stronger host-owned process-tree fallback before direct child kill;
- the same stronger fallback is used for bounded force-stop escalation;
- setup and declaration-only command cleanup remain on their previous direct-child best-effort contract;
- OpenPet still does not claim universal sandboxing or guaranteed total process policing.
