# Plugin Creator-Tools Asset Inspection Phase 82 Design

**Goal:** Give declaration-only creator-tools extensions a host-mediated way to inspect package-local action frame folders without granting raw filesystem writes or sprite generation.

**Architecture:** Extend the existing short-lived command bridge with one creator-tools asset route. `PluginService` owns permission checks, bridge routing, and plugin-local path confinement; the existing action import/frame inspection service owns frame validation.

**Tech Stack:** Electron main process, CommonJS services, Node native test runner, shared TypeScript contracts, production-code-quality-review workflow.

---

## Problem

Phase 80 made creator-tools useful for action configuration reads, validation, and bounded writes. Third-party authors still cannot safely build action asset helpers because plugins have no supported way to ask the host to inspect a package-local frame folder.

Opening direct filesystem access would weaken the plugin boundary. The next useful step is a narrow, read-only API that lets a creator-tools command inspect frames it already packaged with the extension.

## Scope

In scope:

- accept the `assets:inspect` permission in normalized manifests;
- expose `POST /creator/assets/inspect-frames` through the existing short-lived command bridge;
- require `assets:inspect` for the new route;
- accept `{ "relativePath": "assets/actions/wave", "actionId": "wave" }`;
- resolve `relativePath` under the plugin package directory only;
- reject absolute paths, drive-letter paths, NUL bytes, `..`, missing folders, and symlink escapes;
- reuse host frame inspection output with `actionId`, `folderName`, and `inspection`;
- update plugin author docs and current project status docs.

Out of scope:

- sprite generation;
- copying frames into `cat_anime/`;
- raw file writes from plugin code;
- pet-pack manifest write APIs;
- personality injection APIs;
- renderer UI changes.

## Design

### Permission

`assets:inspect` joins the manifest permission allowlist as the first runtime-backed asset authoring permission. It does not imply `assets:generate`, write access, or pet-pack modification.

### Bridge Route

The new route is:

```http
POST /creator/assets/inspect-frames
Content-Type: application/json
Authorization: Bearer <short-lived-token>
```

Payload:

```json
{
  "relativePath": "assets/actions/wave",
  "actionId": "wave"
}
```

Response:

```json
{
  "ok": true,
  "result": {
    "actionId": "wave",
    "folderName": "wave",
    "inspection": {
      "valid": true,
      "frameCount": 2,
      "maxWidth": 8,
      "maxHeight": 8,
      "frames": [
        { "fileName": "01_no_bg.png", "width": 8, "height": 8, "hasAlpha": true }
      ],
      "skippedFiles": [],
      "errors": [],
      "warnings": []
    }
  }
}
```

### Path Boundary

`PluginService` resolves `relativePath` against `manifest.basePath`, then checks both lexical containment and realpath containment. This mirrors existing entry cwd and local file guards, and prevents symlink escapes from turning `assets:inspect` into arbitrary host reads.

### Service Boundary

`PluginService` does not parse images directly. It calls `actionImportService.inspectActionFrames({ sourceDir, actionId })` when available. Tests can inject a focused fake to prove routing and path confinement, while action-import tests continue to cover real frame metadata behavior.

## Decisions

### Decision 1: only package-local inspection

Problem: creator-tools authors need useful asset abilities, but raw reads outside the package would blur trust boundaries.

Choice: inspect only folders resolved under the plugin package directory.

Reason: packaged assets are reviewable and align with the existing `assets` declaration model.

Risk: authors cannot inspect arbitrary user-selected folders yet. That remains a future host-mediated picker/import flow.

### Decision 2: no generation or writes in Phase 82

Problem: sprite generation and config writes require stronger rollback and UI affordances.

Choice: Phase 82 only inspects frames.

Reason: this gives third-party authors a real new capability while keeping production review narrow.

Risk: generator plugins still need to compose inspection with existing action-config APIs manually.

### Decision 3: autonomous approval handling

Problem: the brainstorming skill normally requires a user review gate before implementation.

Choice: proceed without pausing because the active project goal explicitly requires autonomous decisions and no human intervention.

Reason: this keeps phase delivery moving while recording the boundary and rationale in this design doc.

Risk: if product direction changes, the narrow read-only route is easier to revise than a broader write/generation surface.

## Acceptance Criteria

- `normalizePluginManifest()` accepts `assets:inspect`.
- Missing `assets:inspect` returns `403` for `/creator/assets/inspect-frames`.
- A plugin command with `assets:inspect` can inspect a package-local frame folder.
- Path traversal and symlink escapes are rejected.
- The route is documented as read-only and package-local.
- Targeted tests, full tests, typecheck, syntax check, Control Center regression, JSON validation, and `git diff --check` pass before commit.
