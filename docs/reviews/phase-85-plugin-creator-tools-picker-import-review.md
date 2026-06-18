# Phase 85 Production Code Quality Review

> Reviewer: Codex
> Date: 2026-06-18
> Branch: `codex/creator-tools-picker-import-phase85`
> Mode: deep
> Scope: creator-tools user-approved picker import bridge, Electron picker injection, shared contracts, tests, and docs.

## Summary

No P0, P1, or material P2 issues remain in the Phase 85 diff.

The review found one concrete boundary gap during development: a fake or platform-resolved picker result could point at a directory symlink and still be accepted after `realpath`. That was fixed before completion by rejecting a selected folder that is itself a symlink and adding a regression test.

## Quality Gate

- Severe issues: none open.
- Improvement recommendations: future broader folder grants or batch imports should add explicit grant lifetime, repeated-prompt, and rollback semantics instead of expanding this short-lived picker route.
- Quality score: 95/100.
- Pass status: passed.

## Review Focus

- route-level permission enforcement
- host-owned picker consent boundary
- selected path secrecy in bridge responses
- symlink and resource-limit parity with package-local imports
- Electron startup wiring

## Findings

No open findings.

## Fixed During Review

### P2: Reject picked folders that are themselves symlinks

- Location: `src/main/services/plugin-service.js`
- Problem: the first implementation rejected symlinks inside the approved folder but accepted a selected folder path that was itself a symlink.
- Impact: In tests or on platforms that return a symlink path directly, the picker route could follow the link and import from the resolved target, which made the symlink boundary weaker than package-local and pet-pack import paths.
- Evidence: `resolvePickedAssetPath()` resolved `sourceDir` with `fs.realpathSync()` before checking directory type, without an `lstatSync(...).isSymbolicLink()` guard on the selected path.
- Fix: Added an explicit selected-folder symlink rejection and a regression test that proves inspection/import is not called for that path.
- Confidence: High.
- New or pre-existing: Introduced by Phase 85, fixed in Phase 85.

## Architecture Assessment

The behavior stays in the right layer. `PluginService` owns bridge token validation, route dispatch, route-level permissions, picker-result path hardening, and logs. `ActionImportService` remains the only service doing frame inspection, frame copy, sprite generation, and action config regeneration. Electron-specific picker UI stays injected from `main.js`, so service tests can use a fake picker without depending on Electron.

The route names deliberately distinguish package-local `relativePath` imports from user-approved picker imports, which keeps future plugin documentation and review packets clearer.

## Robustness Assessment

Failure behavior is explicit:

- missing bridge token or expired command run returns `401`;
- missing route permission returns `403`;
- missing JSON content type returns `415`;
- canceled picker returns `{ ok: true, canceled: true }`;
- missing folders, non-folders, symlinked folders, symlinks inside folders, duplicate action ids, invalid frame folders, and resource-limit violations fail before import.

The bridge logs route invocation without writing selected folder paths to plugin-visible responses.

Residual risk: a command can prompt the user more than once during a single explicit command run. That is consistent with the current short-lived command bridge model, but broader persistent folder grants or batch imports should define a stricter consent model before implementation.

## Test Assessment

Strongest coverage:

- successful picker inspection without leaking selected path;
- clean canceled picker result without inspection;
- successful picker import through `ActionImportService`;
- missing permission rejection for both picker routes;
- symlink rejection for symlinks inside picked folders;
- symlink rejection when the picked folder itself is a symlink;
- shared TypeScript fixture coverage for picker request/response contracts.

Most important remaining scenario:

- real packaged-app native picker evidence still belongs in the existing desktop picker release-evidence flow. Phase 85 unit tests prove the host boundary; they do not replace packaged runtime picker evidence.

## Meaningful Strengths

- The plugin never receives the selected external path in success or cancel responses.
- Permission checks run before opening the picker, so unauthorized commands cannot trigger user prompts.
- Import uses the same frame/pixel/byte limit guard as package-local imports.
- The new Electron dependency is injected rather than imported into `PluginService`.

## Verification

Targeted implementation check:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "picker"
# 126/126 pass
```

Full local verification:

```bash
npm run check:syntax        # pass
npm run typecheck           # pass
npm test                    # 602/602 pass
npm run test:control-center # 10/10 pass
git diff --check            # pass
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# project-context ok
```

## Final Recommendation

Safe to merge.

Score: 95/100. The remaining risk is future workflow expansion, not the current bounded user-approved picker route.
