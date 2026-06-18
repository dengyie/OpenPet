# Phase 84 Production Code Quality Review

> Reviewer: Codex
> Date: 2026-06-18
> Branch: `codex/creator-tools-pack-manifest-phase84`
> Mode: deep
> Scope: creator-tools pack-manifest bridge, pet-pack manifest mutation guards, shared contracts, tests, and docs.

## Summary

No P0, P1, or material P2 issues remain in the Phase 84 diff.

The review found one concrete boundary issue during development: non-object mutation payloads could be treated like empty metadata updates. That was fixed before completion by explicitly rejecting non-object creator manifest mutations and adding a regression test.

## Review Focus

- built-in pack rejection
- unsupported-key rejection
- host-owned field preservation
- bridge permission enforcement
- doc honesty about non-goals

## Findings

No open findings.

## Fixed During Review

### P2: Reject non-object creator manifest mutation payloads

- Location: `src/main/services/pet-pack-service.js`
- Problem: `validateActiveCreatorPackManifestMutation()` accepted arrays and other non-object payloads as if they were empty metadata updates.
- Impact: A malformed plugin bridge request could receive a successful validation envelope or apply a no-op write instead of a clear contract error.
- Evidence: The original implementation defaulted to object-key inspection and then read `mutation.displayName`, `mutation.version`, and `mutation.provenance` without first proving the payload was a plain object.
- Fix: Added an explicit plain-object guard before field validation and covered `null`, arrays, and strings in `tests/services/pet-pack-service.test.js`.
- Confidence: High.
- New or pre-existing: Introduced by Phase 84, fixed in Phase 84.

## Architecture Assessment

The behavior remains in the right layer. `PluginService` owns bridge token validation, route dispatch, route-level permissions, and logs. `PetPackService` owns active-pack selection, manifest validation, schema normalization, and `pet.json` persistence. The route does not give plugin code a raw filesystem path or a generic pet-pack manager.

## Robustness Assessment

The workflow fails before persistence for missing permissions, non-object payloads, unsupported keys, empty required strings, built-in packs, and invalid merged manifests. Apply writes only after validation and reloads the installed pack before returning the creator-facing view. Logs identify route invocation without exposing tokens or raw file contents.

Residual risk: validation and apply are separate calls, so a plugin can validate stale metadata and then apply after the active pack changes. The current API intentionally targets “whatever pack is active at apply time,” which matches existing action workflows; future arbitrary pack targeting would need explicit selection and stronger concurrency semantics.

## Test Assessment

Strongest coverage:

- `tests/services/pet-pack-service.test.js` covers successful read/validate/apply, built-in rejection, unsupported key rejection, non-object payload rejection, and preservation of host-owned/action fields.
- `tests/services/plugin-service.test.js` covers bridge read/validate/apply, missing permission, and non-editable active pack behavior.
- `tests/plugins/manifest.test.js` covers `pack-manifest:read` and `pack-manifest:write` normalization.
- `tests/shared/openpet-contracts-type-fixture.ts` covers shared contract drift.

Most important remaining scenario:

- Future user-approved arbitrary folder or arbitrary pack selection workflows need their own picker consent, target selection, and race/rollback tests. They are out of scope for Phase 84.

## Verification

Targeted verification run during review:

```bash
node --test tests/plugins/manifest.test.js --test-name-pattern "pack manifest"
# 20/20 pass

node --test tests/services/pet-pack-service.test.js --test-name-pattern "creator.*pack manifest|creator manifest|pack manifest"
# 30/30 pass

node --test tests/services/plugin-service.test.js --test-name-pattern "pack-manifest|pack manifest"
# 120/120 pass
```

Full verification after the review:

```bash
npm run check:syntax        # pass
npm run typecheck           # pass
npm test                    # 596/596 pass
npm run test:control-center # 10/10 pass
git diff --check            # pass
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# project-context ok
```

## Meaningful Strengths

- Permission naming is narrow: `pack-manifest:*` does not imply arbitrary pet-pack management.
- Domain persistence stays in `PetPackService` instead of leaking into bridge routing.
- The API preserves action fields and host-owned provenance facts instead of letting a metadata route become a general manifest writer.
- Tests exercise both service-level domain behavior and bridge-level permission behavior.

## Final Recommendation

Safe to merge.

Score: 95/100. The remaining risk is future workflow expansion, not the current bounded active installed pack metadata route.
