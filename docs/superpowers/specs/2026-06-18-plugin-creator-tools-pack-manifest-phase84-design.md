# Plugin Creator-Tools Pack Manifest Workflow Phase 84 Design

**Goal:** Let declaration-only creator-tools extensions read, validate, and apply a narrow active-pack manifest metadata slice through the host bridge without granting arbitrary pet-pack writes.

**Architecture:** Keep `PluginService` responsible for permission checks and short-lived bridge routing, but move pack-manifest validation and persistence into `PetPackService`, which already owns installed-pack loading and `pet.json` writes. Reuse `normalizePetPackManifest()` as the final structural guard after merging bounded metadata fields into the active installed pack manifest.

**Tech Stack:** Electron main process, CommonJS services, Node native test runner, shared TypeScript contracts, existing pet-pack schema loader/service stack, production-code-quality-review workflow.

---

## Problem

Phase 80 gave creator-tools a bounded action-config workflow. Phase 83 added package-local frame import and sprite generation. That is enough to build action editors, but not enough to maintain the current active user pack as a coherent authored artifact.

Third-party authors still cannot safely update the top-level pack metadata that turns a generated asset set into a reusable pack: display name, version, and reviewable provenance fields. Today the only host-owned manifest persistence path updates action fields through `ActionService` and `PetPackService.updateActivePetPackManifest()`. There is no bridge-level workflow for a creator extension to inspect or update the active installed pack manifest metadata under host control.

Phase 84 should add that workflow without opening general pet-pack writes, arbitrary pack selection, or raw filesystem access from extension code.

## Scope

In scope:

- accept `pack-manifest:read` and `pack-manifest:write` permissions in normalized plugin manifests;
- expose `GET /creator/pack-manifest`;
- expose `POST /creator/pack-manifest/validate`;
- expose `POST /creator/pack-manifest/apply`;
- make those routes operate only on the current active installed user pack;
- allow a narrow editable metadata subset:
  - `displayName`
  - `version`
  - `provenance.sourceUrl`
  - `provenance.assetAuthor`
  - `provenance.license`
  - `provenance.licenseUrl`
- preserve host-owned or structure-owned fields:
  - `id`
  - `schemaVersion`
  - `actions`
  - `defaultAction`
  - `clickAction`
  - `provenance.importedAt`
  - `provenance.originalFormat`
- reject built-in packs, bundled packs, missing active installed packs, unsupported keys, and invalid string values before persistence;
- return a normalized creator-facing manifest view after read, validate, and apply.

Out of scope:

- arbitrary pet-pack file writes;
- editing non-active packs by id;
- modifying `actions`, `defaultAction`, or `clickAction` through this route;
- changing pack `id`, `schemaVersion`, `importedAt`, or `originalFormat`;
- direct writes to `pet.json` from plugin code;
- user-approved external folder imports;
- pack export/archive workflows;
- dialogue, personality, or behavior authoring APIs.

## Design

### Permissions

Phase 84 adds two explicit permissions:

- `pack-manifest:read`
- `pack-manifest:write`

They describe access to the host-mediated active-pack metadata workflow only. They do not imply generic pet-pack management, arbitrary manifest writes, asset import, service privileges, or filesystem access.

### Bridge Routes

The new routes are:

```http
GET /creator/pack-manifest
Authorization: Bearer <short-lived-token>
```

```http
POST /creator/pack-manifest/validate
Content-Type: application/json
Authorization: Bearer <short-lived-token>
```

```http
POST /creator/pack-manifest/apply
Content-Type: application/json
Authorization: Bearer <short-lived-token>
```

Read response:

```json
{
  "ok": true,
  "manifest": {
    "id": "community-weather-cat",
    "displayName": "Community Weather Cat",
    "version": "1.0.1",
    "source": "user-installed",
    "provenance": {
      "sourceUrl": "https://example.com/weather-cat",
      "assetAuthor": "Weather Studio",
      "license": "CC-BY-4.0",
      "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
    }
  }
}
```

Validate/apply request:

```json
{
  "displayName": "Weather Cat Deluxe",
  "version": "1.1.0",
  "provenance": {
    "sourceUrl": "https://example.com/weather-cat-deluxe",
    "assetAuthor": "Weather Studio",
    "license": "CC-BY-4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  }
}
```

Validate response:

```json
{
  "ok": true,
  "validation": {
    "ok": true,
    "errors": [],
    "warnings": [],
    "manifest": {
      "id": "community-weather-cat",
      "displayName": "Weather Cat Deluxe",
      "version": "1.1.0",
      "source": "user-installed",
      "provenance": {
        "sourceUrl": "https://example.com/weather-cat-deluxe",
        "assetAuthor": "Weather Studio",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
      }
    }
  }
}
```

Apply response:

```json
{
  "ok": true,
  "manifest": {
    "id": "community-weather-cat",
    "displayName": "Weather Cat Deluxe",
    "version": "1.1.0",
    "source": "user-installed",
    "provenance": {
      "sourceUrl": "https://example.com/weather-cat-deluxe",
      "assetAuthor": "Weather Studio",
      "license": "CC-BY-4.0",
      "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
    }
  }
}
```

### Service Boundary

`PluginService` should stay thin:

- check bridge token and permission;
- dispatch the new routes;
- log bridge activity.

`PetPackService` should own all creator pack-manifest behavior:

- read the active pack;
- assert that it is a user-installed pack;
- expose a creator-facing manifest view;
- validate a bounded mutation payload;
- merge allowed fields into the existing raw `pet.json`;
- update both the nested `provenance` object and the legacy top-level provenance compatibility fields (`sourceUrl`, `assetAuthor`, `license`, `licenseUrl`);
- rerun `normalizePetPackManifest()` on the merged result;
- persist the updated manifest through the existing host-owned write path.

This mirrors the Phase 80 action workflow split: bridge and permission logic in `PluginService`, domain persistence in the domain service.

### Editable Boundary

Only user-facing metadata is editable in Phase 84:

- `displayName`
- `version`
- `provenance.sourceUrl`
- `provenance.assetAuthor`
- `provenance.license`
- `provenance.licenseUrl`

Everything else is fixed by the host or by other creator routes:

- `actions`, `defaultAction`, and `clickAction` remain owned by the action workflow;
- `id` remains the stable pack identity;
- `schemaVersion` remains host/schema-managed;
- `importedAt` and `originalFormat` stay host-owned provenance facts.

If a payload includes unsupported top-level keys or unsupported provenance keys, validation should fail instead of silently ignoring them. That keeps the contract explicit and reviewable.

### Active-Pack Boundary

The workflow only targets the current active installed user pack. It should reject:

- `legacy-cat`;
- bundled built-in packs;
- cases where no installed pack is active.

This keeps the first pack-manifest workflow aligned with the existing action/persistence path and avoids introducing arbitrary pack selection or accidental edits to built-in assets.

### Persistence Strategy

`PetPackService.updateActivePetPackManifest()` already merges action fields into the active installed pack `pet.json`. Phase 84 should add a companion path rather than a new file writer:

- read the current raw `pet.json`;
- merge the bounded creator metadata fields;
- mirror editable provenance values into both legacy top-level fields and nested `provenance` so reloads stay consistent with the current schema compatibility rules;
- preserve existing actions and host-owned provenance fields;
- validate the merged result through `normalizePetPackManifest()`;
- write JSON back to the same active installed pack path.

No new arbitrary output path should be introduced.

## Decisions

### Decision 1: use `pack-manifest:*` permissions instead of generic pet-pack permissions

Problem: Phase 84 needs a narrow metadata workflow, not a signal that plugins can broadly manage pet packs.

Choice: add `pack-manifest:read` and `pack-manifest:write`.

Reason: the permission names describe exactly what the bridge exposes and leave room for different future capabilities such as picker imports or export helpers.

Risk: the permission vocabulary grows, but that is better than hiding broader meaning behind a vague `pet-pack:write`.

### Decision 2: keep manifest mutation in `PetPackService`

Problem: a bridge-only implementation would mix permission/routing concerns with domain-specific pack validation and persistence.

Choice: add creator manifest read/validate/apply helpers to `PetPackService`.

Reason: installed-pack ownership already lives there, including active-pack loading and raw `pet.json` writes.

Risk: `PetPackService` gets a little larger, but the new methods stay focused and reuse existing manifest/schema paths.

### Decision 3: metadata only, not action or asset edits

Problem: Phase 80 and Phase 83 already cover action/config and asset generation. Reopening those fields through a general manifest route would blur ownership and widen the trust boundary.

Choice: allow only top-level metadata fields in Phase 84.

Reason: the route completes the “package authoring identity” slice without duplicating existing creator APIs.

Risk: authors still need multiple bridge calls to finish a pack, but each call remains narrow and reviewable.

### Decision 4: only the active installed user pack is editable

Problem: arbitrary pack targeting would require a larger authorization and selection model.

Choice: bind the workflow to the active installed user pack only.

Reason: it matches the existing persistence path and keeps accidental edits to built-ins out of scope.

Risk: creators cannot batch-edit multiple packs yet. That can be a later reviewed workflow if real demand appears.

## Acceptance Criteria

- `normalizePluginManifest()` accepts `pack-manifest:read` and `pack-manifest:write`.
- `PetPackService` exposes creator-facing manifest read, validate, and apply helpers for the active installed user pack.
- Validation rejects unsupported keys, built-in packs, and empty/invalid editable string values.
- Apply preserves `id`, `schemaVersion`, action fields, and host-owned provenance fields.
- `GET /creator/pack-manifest` returns the normalized active pack metadata view.
- `POST /creator/pack-manifest/validate` returns a validation envelope without writing.
- `POST /creator/pack-manifest/apply` writes the merged `pet.json` only after validation passes.
- Missing permission returns `403`.
- Built-in active pack attempts fail cleanly and do not write.
- Shared contracts, targeted tests, full tests, typecheck, syntax check, Control Center regression, JSON validation, and `git diff --check` pass before commit.
