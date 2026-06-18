# Plugin Creator-Tools Picker Import Phase 85 Design

**Goal:** Let declaration-only creator-tools extensions ask OpenPet to inspect or import a user-approved external action frame folder without exposing arbitrary filesystem paths or raw writes to plugin code.

**Architecture:** Add picker-specific bridge routes in `PluginService` and inject a host-owned Electron directory picker from `main.js`. Reuse existing `assets:inspect` and `assets:generate` permissions, then route approved folders through the existing `ActionImportService` inspection/import pipeline and Phase 83 resource guards.

**Tech Stack:** Electron main process, CommonJS services, Electron `dialog.showOpenDialog`, Node native test runner, shared TypeScript contracts, existing action frame import service.

---

## Problem

Phase 82 allowed package-local frame inspection, and Phase 83 allowed package-local frame import/sprite generation. Those flows are safe for packaged assets, but they do not cover a realistic creator workflow where an author has generated frames in another local tool and wants a plugin to help import them.

The remaining TODO calls out user-approved arbitrary folder imports. The key distinction is that the plugin still must not receive arbitrary filesystem access. It can ask OpenPet to show a native picker; only the user can choose the folder; the selected absolute path stays inside the main process; and the host applies the same validation and resource limits as package-local imports.

## Scope

In scope:

- expose `POST /creator/assets/pick-frames/inspect`;
- expose `POST /creator/assets/pick-frames/import`;
- require `assets:inspect` for picker inspection;
- require `assets:generate` for picker import;
- wire `main.js` to open `dialog.showOpenDialog({ properties: ['openDirectory'] })`;
- keep selected absolute paths out of bridge responses;
- return `{ ok: true, canceled: true }` for user cancellation;
- reject missing folders, non-directories, symlink-containing folders, duplicate action ids, invalid frame folders, and oversized imports before side effects;
- reuse `ActionImportService.inspectActionFrames()` and `ActionImportService.importActionFrames()`.

Out of scope:

- plugin-provided absolute paths;
- returning selected absolute paths;
- persistent folder grants;
- batch imports;
- overwriting existing action ids;
- plugin-selected output paths;
- raw filesystem writes;
- pet-pack writes;
- built-in pack edits.

## Bridge Routes

```http
POST /creator/assets/pick-frames/inspect
Content-Type: application/json
Authorization: Bearer <short-lived-token>
```

Request:

```json
{
  "actionId": "picked-wave"
}
```

Success:

```json
{
  "ok": true,
  "canceled": false,
  "result": {
    "actionId": "picked-wave",
    "folderName": "picked-wave",
    "inspection": {
      "valid": true,
      "frameCount": 2,
      "maxWidth": 8,
      "maxHeight": 8,
      "frames": [],
      "skippedFiles": [],
      "errors": [],
      "warnings": []
    }
  }
}
```

```http
POST /creator/assets/pick-frames/import
Content-Type: application/json
Authorization: Bearer <short-lived-token>
```

Request:

```json
{
  "actionId": "picked-wave",
  "label": "Picked Wave"
}
```

Success:

```json
{
  "ok": true,
  "canceled": false,
  "actions": {
    "defaultAction": "picked-wave",
    "clickAction": "picked-wave",
    "actions": []
  },
  "importedAction": {
    "id": "picked-wave",
    "label": "Picked Wave",
    "sprite": "cat_anime/sprites/picked-wave.png",
    "frameCount": 2,
    "frameMs": 95,
    "frameWidth": 8,
    "frameHeight": 8
  }
}
```

Cancel response for both routes:

```json
{
  "ok": true,
  "canceled": true
}
```

Responses must not include the selected absolute folder path.

## Decisions

### Decision 1: reuse existing `assets:inspect` and `assets:generate`

Problem: Phase 85 extends the same asset inspection/import operation, but changes the source from package-local to user-picked.

Choice: require `assets:inspect` for picker inspection and `assets:generate` for picker import.

Reason: the user-approved picker is the additional consent boundary, while the operation remains inspection or generation. This avoids permission vocabulary churn and keeps existing creator-tools review semantics understandable.

Risk: docs must explicitly say these permissions can now cover user-approved picker routes, not arbitrary path access.

### Decision 2: use picker-specific routes

Problem: reusing package-local `inspect-frames` and `import-frames` routes would blur package-relative paths with user-selected folders.

Choice: add `/creator/assets/pick-frames/inspect` and `/creator/assets/pick-frames/import`.

Reason: route names make the consent boundary visible and keep package-local and external-picker workflows reviewable.

### Decision 3: never return selected paths

Problem: local absolute paths can leak private filesystem information and act like accidental grants.

Choice: return folder name, inspection results, action config, and imported action metadata only.

Reason: plugin authors get the data needed to proceed without raw filesystem authority.

## Acceptance

- `assets:inspect` plugins can inspect a user-picked folder through `POST /creator/assets/pick-frames/inspect`;
- `assets:generate` plugins can import a user-picked folder through `POST /creator/assets/pick-frames/import`;
- missing permissions return `403`;
- cancellation returns `{ ok: true, canceled: true }` and performs no inspection/import;
- selected absolute paths are not returned;
- symlink-containing folders and oversized folders fail before import;
- `main.js` wires the native folder picker into `PluginService`;
- shared contracts cover picker inspect/import request and response shapes;
- docs describe this as user-approved host mediation, not arbitrary folder access.
