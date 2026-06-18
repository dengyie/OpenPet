# Phase 83 Production Code Quality Review

> Date: 2026-06-18  
> Branch: `codex/creator-tools-sprite-import-phase83`  
> Mode: deep  
> Scope: `assets:generate` manifest permission, creator-tools `/creator/assets/import-frames` bridge route, resource limits, shared contracts, tests, and docs.

## Summary

No P0, P1, or material P2 issues remain in the Phase 83 diff.

The review found one concrete security boundary issue during development: the initial package-local folder check rejected the target folder itself when it was a symlink, but did not reject symlinked child files inside an otherwise package-local folder. That could have let an extension import or inspect an external host file through a symlinked frame path. The issue was fixed before completion by adding recursive `lstat` symlink rejection for both inspection and import bridge routes, with regression tests.

## Scope

- Base: `origin/main` for helper context; reviewed Phase 83 current diff relative to Phase 82 intent.
- Risk level: high, because this touches plugin permissions, bridge request handling, local file paths, and generated application assets.
- Main files:
  - `src/main/plugins/manifest.js`
  - `src/main/services/plugin-service.js`
  - `src/shared/openpet-contracts.ts`
  - `tests/plugins/manifest.test.js`
  - `tests/services/plugin-service.test.js`
  - `tests/shared/openpet-contracts-type-fixture.ts`
  - extension/project docs.

## Findings

No open findings.

## Fixed During Review

### P1: Reject symlinked child files inside package-local asset folders

- Location: `src/main/services/plugin-service.js`
- Problem: The first implementation confined `relativePath` to the plugin package and rejected a symlinked target folder, but a package-local folder could still contain symlinked child files.
- Impact: A plugin with `assets:inspect` or `assets:generate` could potentially ask the host to inspect/import a symlinked image outside the plugin package.
- Evidence: The bridge delegates package-local folders to `ActionImportService`, which reads image files by path. Without child-entry `lstat` checks, nested symlinks would survive the package-local directory guard.
- Fix: Added `assertDirectoryHasNoSymlinks()` and call it before both `inspectActionFrames()` and import preflight. Added regression tests for inspection and import child symlink rejection.
- Confidence: High.
- New or pre-existing: Introduced by Phase 82/83 bridge asset routes, fixed in Phase 83.

## Architecture Assessment

Behavior remains in the right layer. `PluginService` owns bridge auth, route dispatch, manifest permission checks, path confinement, symlink rejection, and resource limits. `ActionImportService` still owns frame copy, sprite generation, and action config updates. The route does not make `PluginService` an image processor or broaden plugin file access.

## Robustness Assessment

The route fails before side effects for missing permission, unsafe paths, symlinked folders/files, duplicate action IDs, invalid inspections, oversized frame counts, oversized frame dimensions, excessive total pixels, and source folders over 50 MB. Successful import uses the existing action import path. Logs record bridge route invocation without tokens or raw file contents.

Residual risk: generation still runs synchronously in the main process path after preflight. The current frame/pixel/byte limits make that acceptable for this narrow bridge, but larger future creator workflows should add progress/cancellation or a worker process.

## Test Assessment

Strongest coverage:

- `tests/services/plugin-service.test.js` covers successful package-local import, missing `assets:generate`, traversal and symlink folder escapes, symlink child file rejection, duplicate action ID no-overwrite behavior, preflight frame-count rejection, and byte-size rejection.
- `tests/plugins/manifest.test.js` covers `assets:generate`.
- `tests/shared/openpet-contracts-type-fixture.ts` covers request/response contract drift.

Most important remaining scenario:

- A future user-approved arbitrary folder import would need separate picker consent, progress/cancel behavior, and rollback tests. It is out of scope for Phase 83.

## Verification

Fresh verification run before this review:

```bash
node --test tests/plugins/manifest.test.js tests/services/plugin-service.test.js
# 117/117 pass

npm run typecheck
# pass

npm run check:syntax
# pass

npm test
# 586/586 pass

npm run test:control-center
# 10/10 pass

git diff --check
# pass

node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# project-context ok
```

## Meaningful Strengths

- Permission split is clear: `assets:inspect` remains read-only; `assets:generate` is required for import/generation.
- The new route delegates generation through existing first-party action import behavior instead of creating a parallel copy/write path.
- The implementation blocks realistic path traversal and symlink misuse paths before image inspection or asset generation.
- Tests cover both positive behavior and security/resource-limit failures.

## Final Recommendation

Safe to merge.

Score: 96/100. The remaining risk is future-scale operational polish for larger creator workflows, not a blocker for this narrow package-local bridge route.
