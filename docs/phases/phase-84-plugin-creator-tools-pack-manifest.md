# Phase 84: Plugin Creator-Tools Pack Manifest Workflow

> Date: 2026-06-18
> Scope: add a host-mediated creator-tools bridge workflow for reading, validating, and applying bounded active-pack manifest metadata.

## Goal

Phase 84 completes the first pack-authoring metadata slice for creator-tools extensions. Declaration-only command runs can now inspect and update the active installed user pack's top-level manifest metadata through the host bridge without receiving arbitrary pack writes or raw filesystem access.

## Scope

In scope:

- `pack-manifest:read`
- `pack-manifest:write`
- `GET /creator/pack-manifest`
- `POST /creator/pack-manifest/validate`
- `POST /creator/pack-manifest/apply`
- active installed user pack only
- editable fields:
  - `displayName`
  - `version`
  - `provenance.sourceUrl`
  - `provenance.assetAuthor`
  - `provenance.license`
  - `provenance.licenseUrl`

Out of scope:

- arbitrary pack targeting
- built-in pack edits
- action/default/click edits through this route
- pet-pack file writes outside the active installed pack manifest
- raw filesystem access

## Implementation

Updated runtime files:

- `src/main/plugins/manifest.js`
- `src/main/services/pet-pack-service.js`
- `src/main/services/plugin-service.js`
- `src/shared/openpet-contracts.ts`

Updated tests:

- `tests/plugins/manifest.test.js`
- `tests/services/pet-pack-service.test.js`
- `tests/services/plugin-service.test.js`
- `tests/shared/openpet-contracts-type-fixture.ts`

Behavior:

1. Creator-tools manifests can declare `pack-manifest:read` and `pack-manifest:write`.
2. The short-lived bridge now exposes:
   - `GET /creator/pack-manifest`
   - `POST /creator/pack-manifest/validate`
   - `POST /creator/pack-manifest/apply`
3. `PluginService` enforces route-level permissions and keeps bridge logging in the same host-owned audit path as other creator routes.
4. `PetPackService` owns the actual domain logic:
   - read the active installed user pack metadata;
   - validate bounded metadata mutations;
   - reject non-object payloads before treating a mutation as a no-op;
   - reject unsupported fields and built-in packs;
   - persist approved metadata back to the active pack `pet.json`.
5. Editable provenance values are mirrored into both nested `provenance` and legacy top-level compatibility fields so reloads stay consistent with current schema compatibility rules.

## Decision Record

### Decision 1: use `pack-manifest:*` instead of `pet-pack:*`

- Problem: a broad `pet-pack:write` permission reads like arbitrary pack management.
- Choice: use `pack-manifest:read` and `pack-manifest:write`.
- Reason: the name matches the actual host capability and keeps room for future picker/import/export workflows without over-claiming write access.

### Decision 2: keep manifest mutation in `PetPackService`

- Problem: bridge code should not become the owner of pack persistence rules.
- Choice: `PluginService` only routes and checks permission; `PetPackService` validates and persists.
- Reason: active-pack loading and `pet.json` writes already live in the pet-pack boundary.

### Decision 3: metadata only

- Problem: actions and assets already have dedicated creator routes from Phase 80 and Phase 83.
- Choice: Phase 84 only edits top-level pack metadata, not `actions`, `defaultAction`, or `clickAction`.
- Reason: each creator workflow stays narrow, testable, and reviewable.

## Verification

Targeted local verification:

```bash
node --test tests/plugins/manifest.test.js --test-name-pattern "pack manifest"
node --test tests/services/pet-pack-service.test.js --test-name-pattern "creator.*pack manifest|creator manifest|pack manifest"
node --test tests/services/plugin-service.test.js --test-name-pattern "pack-manifest|pack manifest"
npm run typecheck
```

Targeted result before full gates:

- `tests/plugins/manifest.test.js`: 20/20 pass
- `tests/services/pet-pack-service.test.js`: 30/30 pass
- `tests/services/plugin-service.test.js`: 120/120 pass

Full local verification:

```bash
npm run check:syntax        # pass
npm run typecheck           # pass
npm test                    # 596/596 pass
npm run test:control-center # 10/10 pass
git diff --check            # pass
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# project-context ok
```

## Outcome

Third-party creator-tools authors can now finish one more real authoring loop inside OpenPet:

- read the active installed user pack metadata,
- validate bounded manifest metadata edits,
- apply those edits through the host.

OpenPet still does not grant arbitrary pet-pack writes, built-in pack edits, arbitrary folder access, plugin-selected output paths, or raw filesystem writes.
