# Phase 70: Plugin Setup and Command Cleanup Parity

> Date: 2026-06-17
> Scope: tighten explicit setup-run and declaration-only command cleanup so stop requests remain visible until child exit confirmation.

## Goal

Phase 69 finished the stronger service-only cleanup boundary: declared services now stay `stopping` until exit confirmation and can escalate once to a bounded host-side force stop.

Phase 70 closes the remaining parity gap for the other explicit local-process entry types:

- `entries.setup`
- declaration-only `entries.commands`

Before this phase, disable cleanup and app-shutdown cleanup for setup and declaration-only commands sent a direct-child `SIGTERM`, but the runtime/log surface immediately claimed terminal stop failure. That was functionally safe enough, but it was still less honest than the service path.

Phase 70 keeps the existing cleanup mechanism and tightens only the lifecycle truth:

- cleanup request first becomes visible as stop intent;
- child exit confirmation decides the terminal result;
- cleanup still remains direct-child best effort rather than process-tree guaranteed.

## Scope

In scope:

- setup cleanup on plugin disable and app shutdown;
- declaration-only command cleanup on plugin disable and app shutdown;
- stop-intent versus stop-confirmation logs;
- targeted service-layer tests;
- shared setup runtime contract update for `stopping`;
- live-doc wording updates for the new cleanup boundary.

Out of scope:

- service cleanup changes;
- force-stop logic for setup or declaration-only commands;
- setup auto-run or install-time execution;
- command bridge expansion;
- health polling changes;
- process-tree guarantees or sandbox claim upgrades.

## Implementation

Updated files:

- `src/main/services/plugin-service.js`
- `src/shared/openpet-contracts.ts`
- `tests/services/plugin-service.test.js`
- `docs/HANDOFF.md`
- `docs/development-summary.md`
- `docs/project-status-review.md`
- `docs/project-context.json`
- `docs/productization-v1.1-todo-design.md`
- `docs/project-review-todo-design.md`
- `docs/plugin-development.md`
- `docs/plugin-ecosystem-rules.md`

Behavior changes:

1. `stopPluginSetupRuntime()` now:
   - sets setup runtime to `stopping`,
   - records `lastRunAt`,
   - logs `Setup stop requested` when `SIGTERM` is sent,
   - only becomes immediately terminal if the stop request itself throws.

2. Setup child exit handling now:
   - treats exit-confirmed cleanup as terminal `failed` with `Setup stopped`,
   - keeps ordinary non-requested exits on the existing `succeeded` / `failed` path,
   - logs `Setup stopped` only after exit confirmation.

3. Declaration-only command cleanup now:
   - records stop intent on the in-flight runtime,
   - logs `Command stop requested` when cleanup begins,
   - rejects the command promise with `Command stopped` only after exit confirmation,
   - keeps direct-child `SIGTERM` as the only cleanup mechanism in this phase.

4. Shared contracts now allow setup runtime state `stopping`, because setup runtime is visible in `listPlugins()` and Control Center review surfaces.

## Decision Record

### Decision 1: only widen setup runtime contracts

- Problem: setup runtime is renderer-visible, but declaration-only command cleanup is not exposed as a live runtime state in shared contracts.
- Choice: widen `PluginSetupRuntimeStatus` to include `stopping`, but do not invent a new command runtime contract in this phase.
- Reason: setup already has a stable runtime view surface, so the new non-terminal state is observable and worth typing. Declaration-only commands still surface as a promise result plus logs, so adding a new shared contract would widen product scope without a matching UI/runtime surface.
- Risk: command cleanup parity is documented through promise and log behavior rather than a new renderer-visible state. This is acceptable because no current public runtime contract exists for in-flight declaration-only command status.

## Validation

Targeted verification during implementation:

```bash
node --test tests/services/plugin-service.test.js
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

After Phase 70:

- services still own the strongest local-process cleanup path;
- setup and declaration-only commands now follow the same stop-intent honesty rule;
- cleanup wording across the extension docs is more internally consistent;
- OpenPet still does not claim hard process-tree guarantees for setup or declaration-only commands.
