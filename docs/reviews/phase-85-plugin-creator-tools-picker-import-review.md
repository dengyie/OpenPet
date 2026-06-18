# Phase 85 Production Code Quality Review

> Reviewer: Codex
> Date: 2026-06-18
> Branch: `codex/creator-tools-picker-import-phase85`
> Mode: deep
> Scope: creator-tools user-approved picker import bridge, Electron picker injection, shared contracts, tests, and docs.

## Scope

- Base: current Phase 84 HEAD plus Phase 85 working-tree diff.
- Scope mode: working tree.
- Changed files reviewed: `main.js`, `src/main/services/plugin-service.js`, `src/shared/openpet-contracts.ts`, `tests/services/plugin-service.test.js`, `tests/shared/openpet-contracts-type-fixture.ts`, Phase 85 docs, and live documentation updates.
- Risk level: high, because the change touches plugin permissions, local filesystem mediation, bridge routing, and host-owned import side effects.
- Assumption: Phase 85 intentionally reuses `assets:inspect` and `assets:generate`; no new `assets:import-external` permission is required.

## Findings

No blocking production issues found in the Phase 85 diff.

## Review Notes

- Permission enforcement happens before picker invocation: `/creator/assets/pick-frames/inspect` requires `assets:inspect`, and `/creator/assets/pick-frames/import` requires `assets:generate`.
- The selected folder path remains main-process-only. Bridge responses return inspection/import results and cancellation state, not the selected absolute path.
- Cancellation returns `{ ok: true, canceled: true }` before inspection/import, so user cancellation has no side effect.
- Picked folders are normalized through host-side existence, directory, top-level symlink, nested symlink, and existing Phase 83 resource-limit checks before import side effects.
- Import still flows through `ActionImportService`, preserving the existing owner of frame copying, sprite generation, and action config mutation.
- Electron wiring injects a single host callback backed by `dialog.showOpenDialog({ properties: ['openDirectory'] })`, keeping native picker authority out of plugin code.

## Architecture Assessment

The behavior lives in the right layer. `PluginService` owns short-lived bridge routing, permission checks, path secrecy, and import preflight, while `ActionImportService` remains the owner of asset inspection/import side effects. Coupling does not materially worsen because `main.js` only injects a picker callback and no renderer or plugin process receives Electron access.

## Robustness Assessment

Failure behavior is acceptable for this phase. Missing permissions fail before picker UI, picker cancellation is side-effect-free, invalid folders and symlinks fail before import, and existing import limits guard oversized frame sets. Operator-facing logs record picker inspect/import invocation without logging raw selected paths.

## Test Assessment

Strongest coverage is in `tests/services/plugin-service.test.js`: picker inspect success with path redaction, cancellation with no inspection, import success, missing permissions, nested symlink rejection, and picked-folder symlink rejection. Shared TypeScript contract fixtures cover the new request/response shapes.

The main remaining scenario is an end-to-end packaged-app manual smoke of the native picker UI. That belongs with release evidence, not this service-layer phase, because the injected callback is covered and Electron picker behavior is platform-owned.

## Quality Gate

- Severe issues: none open.
- Improvement recommendations: keep future batch import, overwrite, generated-image workflows, and persistent folder grants behind separate consent and rollback design rather than expanding these routes.
- Quality score: 95/100.
- Pass status: passed.

## Verification

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "picker"
# pass: 126/126
```

```bash
npm run typecheck
# pass
```

```bash
node --check main.js && git diff --check
# pass
```

```bash
npm run check:syntax
# pass
```

```bash
npm test
# pass: 602/602
```

```bash
npm run test:control-center
# pass: 10/10
```

## Final Recommendation

Safe to merge after the final `git diff --check` and `docs/project-context.json` parse checks are rerun immediately before commit.
