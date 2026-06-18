# Phase 73: Plugin Setup and Command Process-Tree Hardening

> Date: 2026-06-17
> Scope: strengthen setup and declaration-only command cleanup by adding a host-owned process-tree fallback before direct child kill.

## Goal

Phase 72 strengthened declared service cleanup with a host-owned process-tree fallback.

Phase 73 extends that narrower cleanup hardening to the remaining explicit local-process runtime shapes:

- `entries.setup`
- declaration-only `entries.commands`

Before this phase, setup and declaration-only command cleanup already kept stop intent visible until exit confirmation, but the stop request itself still went straight to `child.kill('SIGTERM')`.

Phase 73 keeps their lifecycle truth unchanged and only strengthens the cleanup attempt:

- when the child PID is visible, OpenPet now tries host-owned process-tree signalling first;
- if that path is unavailable or fails, OpenPet falls back to direct child kill;
- services still keep the strongest cleanup contract because they alone combine process-group signalling, process-tree fallback, and bounded host-side force-stop.

## Scope

In scope:

- setup disable cleanup and app-shutdown cleanup;
- declaration-only command disable cleanup and app-shutdown cleanup;
- reuse of the existing host-owned `signalServiceProcessTree(pid, signal)` helper;
- targeted service-layer tests;
- live-doc wording updates for the broader but still non-absolute cleanup truth.

Out of scope:

- process-group signalling for setup or declaration-only commands;
- force-stop timers or `SIGKILL` escalation for setup or declaration-only commands;
- new renderer status enums;
- plugin manifest changes;
- universal process cleanup guarantees.

## Implementation

Updated files:

- `src/main/services/plugin-service.js`
- `tests/services/plugin-service.test.js`
- `docs/HANDOFF.md`
- `docs/development-summary.md`
- `docs/project-status-review.md`
- `docs/project-context.json`
- `docs/productization-v1.1-todo-design.md`
- `docs/project-review-todo-design.md`
- `docs/plugin-development.md`
- `docs/plugin-ecosystem-rules.md`

Added files:

- `docs/phases/phase-73-plugin-setup-command-process-tree-hardening.md`
- `docs/reviews/phase-73-plugin-setup-command-process-tree-hardening-review.md`
- `docs/superpowers/specs/2026-06-17-plugin-setup-command-process-tree-hardening-phase73-design.md`
- `docs/superpowers/plans/2026-06-17-plugin-setup-command-process-tree-hardening-phase73.md`

Behavior changes:

1. `PluginService` now records `pid` on setup runtimes and declaration-only command runtimes.

2. Setup cleanup now:
   - keeps the existing `stopping` and exit-confirmed completion semantics from Phase 70;
   - tries `signalServiceProcessTree(pid, 'SIGTERM')` when the child pid is valid;
   - falls back to `child.kill('SIGTERM')` if tree cleanup is unavailable or fails.

3. Declaration-only command cleanup now:
   - keeps the existing stop-request logging and exit-confirmed rejection semantics from Phase 70;
   - tries `signalServiceProcessTree(pid, 'SIGTERM')` from the runtime stop path when the child pid is valid;
   - falls back to `child.kill('SIGTERM')` if tree cleanup is unavailable or fails.

4. Service cleanup semantics do not change in this phase.

## Decision Record

### Decision 1: reuse the service helper instead of creating a second cleanup implementation

- Problem: setup and declaration-only commands need the same host-owned tree cleanup attempt.
- Choice: reuse the existing `signalServiceProcessTree` helper.
- Reason: this keeps OS-specific process traversal in one tested place and limits Phase 73 to lifecycle wiring.

### Decision 2: do not widen setup/command cleanup into the full service contract

- Problem: cleanup hardening could easily turn into a broader lifecycle rewrite.
- Choice: only add tree fallback before direct child kill.
- Reason: setup and declaration-only commands remain explicit short-lived processes. They do not need detached process-group startup or bounded host-side force-stop in this phase.

## Validation

Targeted verification during implementation:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service uses tree cleanup for declaration command stop requests before child kill fallback|plugin service falls back to child kill when declaration command tree cleanup fails|plugin service uses tree cleanup for setup stop requests before child kill fallback|plugin service falls back to child kill when setup tree cleanup fails|plugin service stops running declaration commands when a plugin is disabled|plugin service stops running declaration commands during app shutdown cleanup|plugin service stops running setup when a plugin is disabled|plugin service stops running setup during app shutdown cleanup|plugin service marks setup cleanup failure as failed when child kill throws"
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

After Phase 73:

- services still own the strongest explicit local-process cleanup path;
- setup and declaration-only commands now get the same host-owned tree cleanup attempt before direct child kill fallback;
- OpenPet still describes every runtime shape conservatively and does not claim universal process-tree cleanup guarantees.
