# Plugin Creator-Tools Sprite Import Phase 83 Design

**Goal:** Let declaration-only creator-tools extensions import package-local action frame folders through a host-mediated bridge so OpenPet generates sprites and action config without exposing raw filesystem writes.

**Architecture:** Extend the existing short-lived command bridge with one asset import route. `PluginService` owns permission checks, bridge routing, plugin-package path confinement, and creator-specific resource limits; `ActionImportService.importActionFrames()` remains the only writer for copied frames, generated sprites, and action config.

**Tech Stack:** Electron main process, CommonJS services, Node native test runner, shared TypeScript contracts, Sharp-backed sprite generation, production-code-quality-review workflow.

---

## Problem

Phase 82 allowed creator-tools plugins to inspect packaged frame folders, but docs intentionally kept sprite generation and writes out of scope. That left third-party authors able to validate a folder but unable to complete a useful action-asset workflow.

OpenPet already has a safe first-party import path in `ActionImportService.importActionFrames()`. Phase 83 exposes that path to declaration-only creator-tools commands through a narrow bridge route instead of granting plugins direct access to `cat_anime/`, arbitrary output paths, or Electron/Node filesystem powers.

## Scope

In scope:

- accept the `assets:generate` permission in normalized plugin manifests;
- expose `POST /creator/assets/import-frames` through the existing short-lived command bridge;
- require `assets:generate` for the new route;
- accept `{ "relativePath": "assets/actions/wave", "actionId": "wave", "label": "Wave" }`;
- resolve `relativePath` under the plugin package directory only;
- reject traversal, absolute paths, NUL bytes, missing folders, non-folders, and symlink escapes using the Phase 82 path guard;
- run creator-specific resource checks before generation;
- call `actionImportService.importActionFrames({ sourceDir, actionId, label })`;
- return the generated action config plus `importedAction`;
- update plugin author docs and current project status docs.

Out of scope:

- arbitrary output path selection;
- direct plugin writes to `cat_anime/` or pet-pack folders;
- user-selected external folder imports;
- image synthesis or AI-generated frames;
- pet personality injection APIs;
- renderer UI changes.

## Design

### Permission

`assets:generate` becomes the explicit permission for host-mediated asset writes and sprite/config generation. It does not imply raw filesystem access, arbitrary folder reads, pet-pack manifest writes, or background/service access.

### Bridge Route

The new route is:

```http
POST /creator/assets/import-frames
Content-Type: application/json
Authorization: Bearer <short-lived-token>
```

Payload:

```json
{
  "relativePath": "assets/actions/wave",
  "actionId": "wave",
  "label": "Wave"
}
```

Response:

```json
{
  "ok": true,
  "actions": {
    "defaultAction": "wave",
    "clickAction": "wave",
    "actions": [
      {
        "id": "wave",
        "label": "Wave",
        "loop": false,
        "frameMs": 95,
        "frameWidth": 8,
        "frameHeight": 8,
        "sprite": "cat_anime/sprites/wave.png",
        "frameCount": 2
      }
    ]
  },
  "importedAction": {
    "id": "wave",
    "label": "Wave",
    "loop": false,
    "frameMs": 95,
    "frameWidth": 8,
    "frameHeight": 8,
    "sprite": "cat_anime/sprites/wave.png",
    "frameCount": 2
  }
}
```

### Path Boundary

The route reuses the package-local asset path resolver introduced in Phase 82. The plugin supplies a relative path only. `PluginService` rejects absolute paths, Windows drive paths, traversal segments, NUL bytes, missing targets, non-folders, and symlink escapes before any import work starts.

### Resource Boundary

Before generation, `PluginService` asks `actionImportService.inspectActionFrames()` for frame metadata and rejects oversized imports. Phase 83 uses conservative limits:

- at most 240 frames;
- max single-frame cell area of 1,048,576 pixels;
- max generated sprite area of 48,000,000 pixels;
- max source folder bytes of 50 MiB.

These limits apply only to the third-party bridge route. The existing first-party Control Center import path keeps its current behavior.

### Service Boundary

`PluginService` does not copy frames, write config, or invoke Sharp directly. After permission, path, and limit checks pass, it calls `ActionImportService.importActionFrames()`, which remains the single host writer for action frames, sprites, and `animations.json`.

## Decisions

### Decision 1: route name is import-frames, permission is assets:generate

Problem: the user-facing need is sprite generation, but the actual safe host behavior imports frames and regenerates action assets.

Choice: call the route `/creator/assets/import-frames` and gate it with `assets:generate`.

Reason: the permission communicates write/generation power, while the route avoids implying a generic image generator or arbitrary output writer.

Risk: plugin authors may expect a lower-level sprite-only API. Docs will state that OpenPet owns the whole frame-copy plus sprite/config generation workflow.

### Decision 2: package-local source only

Problem: third-party plugins need usable asset workflows, but arbitrary host folder access would weaken the extension boundary.

Choice: import only folders packaged inside the plugin directory.

Reason: packaged assets are reviewable, reproducible, and already covered by plugin submission workflows.

Risk: authors cannot yet build a plugin that imports a user-selected local folder. That requires a future host picker/import flow.

### Decision 3: resource checks before host generation

Problem: sprite generation is heavier than Phase 82 inspection and can allocate large image buffers.

Choice: inspect first and reject oversized frame count, dimensions, sprite area, and source folder bytes before importing.

Reason: this keeps the third-party bridge from becoming an unbounded image processing entry point.

Risk: legitimate large animation packs may need a future reviewed limit increase or explicit first-party UI override.

### Decision 4: autonomous approval handling

Problem: the brainstorming skill normally requires a user review gate before implementation.

Choice: proceed without pausing because the active project goal explicitly requires autonomous decisions and no human intervention.

Reason: the phase is narrow, follows documented next steps, and records the decision here for traceability.

Risk: if product direction changes, the route is isolated and can be revised without undoing broader runtime architecture.

## Acceptance Criteria

- `normalizePluginManifest()` accepts `assets:generate`.
- Missing `assets:generate` returns `403` for `/creator/assets/import-frames`.
- A plugin command with `assets:generate` can import a package-local frame folder and receive an `importedAction`.
- The import creates copied frames, generated sprite PNG, and updated action config through `ActionImportService`.
- Path traversal and symlink escapes are rejected before import.
- Duplicate action ids are rejected and do not overwrite the existing action.
- Oversized creator imports are rejected before `importActionFrames()` is called.
- Docs describe this as host-mediated sprite import/generation, not raw plugin filesystem access.
- Targeted tests, full tests, typecheck, syntax check, Control Center regression, JSON validation, and `git diff --check` pass before commit.
