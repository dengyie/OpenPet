# Phase 82 Production Code Quality Review

> Date: 2026-06-18
> Mode: deep
> Scope: `assets:inspect` manifest permission, creator-tools bridge route, plugin-local asset path confinement, shared contracts, tests, and live docs.

## Findings

No P0, P1, or material P2 issues found in the Phase 82 diff.

## Improvement Suggestions

- Future `assets:generate` or larger asset workflow phases should add explicit resource limits for frame count, folder size, and generated image output before moving work into the main-process host path.
- If creator-tools grows multiple asset APIs, split bridge route matching into a small route table to keep `PluginService` readable.

## Quality Score

92 / 100

## Review Result

Passed.

## Evidence Reviewed

- `src/main/plugins/manifest.js` accepts only the explicit new `assets:inspect` permission.
- `src/main/services/plugin-service.js` checks `assets:inspect` before path resolution and confines `relativePath` with safe-relative, lexical containment, realpath containment, existence, and directory checks.
- `POST /creator/assets/inspect-frames` reuses `actionImportService.inspectActionFrames()` and does not write files or generate sprites.
- `main.js` injects the existing action import service into `PluginService`.
- `tests/services/plugin-service.test.js` covers success, missing permission, path traversal, and symlink escape behavior.
- `tests/plugins/manifest.test.js` covers permission normalization.
- `tests/shared/openpet-contracts-type-fixture.ts` covers the shared request/response contract.

## Fixes Applied

No review-blocking fixes were required after the deep review.

## Residual Risks

- Package-local frame inspection can still be expensive for unusually large plugin asset folders. This is acceptable for Phase 82 because the route is permissioned, explicit, short-lived, read-only, and scoped to package-local assets, but broader generation workflows should add resource controls.
- This phase does not prove third-party plugin trust, catalog approval, arbitrary user-folder inspection, sprite generation, pet-pack writes, or complete sandboxing.
