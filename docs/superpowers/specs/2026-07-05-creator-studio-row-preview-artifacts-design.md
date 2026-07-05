# Creator Studio Row Preview Artifacts Design

**Date:** 2026-07-05
**Owner:** dev8
**Status:** approved follow-up for official row pipeline

## Goal

Add deterministic local visual-review artifacts for official full-pet row packages: one PNG contact sheet and one animated GIF preview per official row.

## Scope

This slice only consumes already-extracted official row frames. It does not call providers, generate row strips, infer missing actions, change QA acceptance, or add UI.

Artifacts:

- `runs/<runId>/qa/full-pet-contact-sheet.png`
- `runs/<runId>/qa/previews/<actionId>.gif`
- sanitized artifact references in `atlas-validation.json`

## Design

Create `examples/plugins/creator-studio/lib/full-pet-row-preview-artifacts.js` with:

```js
async function createOfficialRowPreviewArtifacts({
  dataDir,
  rowFramesByActionId,
  outputDir
})
```

The helper:

- validates `outputDir` stays inside `dataDir`;
- validates every source frame stays inside `dataDir`;
- writes a `1536x1872` PNG contact sheet with the same 8-column x 9-row layout as the Codex atlas;
- writes one `192x208` animated GIF per official row using the official durations;
- returns absolute paths plus data-relative paths for QA metadata.

## QA Metadata Contract

`atlas-validation.json` official row branch adds:

```json
{
  "visualReview": {
    "contactSheet": "runs/run-1/qa/full-pet-contact-sheet.png",
    "previews": [
      {
        "actionId": "idle",
        "path": "runs/run-1/qa/previews/idle.gif",
        "frameCount": 6,
        "durations": [280, 110, 110, 140, 140, 320]
      }
    ]
  }
}
```

No absolute paths may appear in QA JSON.

## Acceptance

- Unit tests prove the contact sheet and GIF previews are written and decodable.
- `real-atlas-builder` officialRows branch writes sanitized visual-review metadata.
- Output path and frame path escape attempts are rejected.
- Existing row/atlas/stable-slots tests remain green.
