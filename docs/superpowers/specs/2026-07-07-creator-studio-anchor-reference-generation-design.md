# Creator Studio Anchor Reference Generation Design

**Date:** 2026-07-07
**Owner:** dev8
**Status:** approved for option A specification
**Scope:** Improve OpenPet pet/action generation quality by introducing a formal anchor-reference protocol before sprite generation.

## Goal

OpenPet Create should generate higher-quality pets and actions from a user image and optional pet description by first producing stable reference assets:

```text
user image(s) + optional pet description
  -> single internal composite reference board
  -> character anchor view
  -> action anchor view
  -> action canonical frame or sprite row
  -> deterministic OpenPet frame/atlas processing
  -> QA artifacts and review/import
```

The user-facing workflow stays simple: upload the pet reference image, optionally describe the pet, then generate. The internal workflow may create boards and anchors, but users should not have to understand or manually prepare sprite sheets, collages, or model sheets.

## Quality Principle

The source image is the highest identity authority.

User description can add name, temperament, accessory intent, style preference, and action intent, but it must not override visible identity from the image. If text conflicts with the image, the image wins.

OpenPet compatibility means:

- clean cutout;
- stable lower-center root anchor;
- readable small-window scale;
- complete body with safe padding;
- deterministic QA and importable assets.

It does not mean forcing a cartoon style, changing species, simplifying eyes, changing fur/material, or redesigning the pet unless the user explicitly asks for that transformation.

## Evidence Behind This Design

Provider tests showed three useful facts:

- `gpt-image-2` with several separate reference uploads can fail or time out through the current gateway, including an upstream `context canceled` around 300 seconds.
- `gpt-image-2` with one reference image and a shorter prompt can complete, but direct sprite-sheet generation still has weak identity and action quality.
- A clean single composite reference board followed by canonical-frame synthesis produced the best technical result so far: six unique frames, stable baseline, low centroid drift, and no excessive deterministic jitter.

The conclusion is that OpenPet should avoid multi-file provider conditioning and avoid asking the model to solve identity, view planning, action planning, and final sprite layout in one step.

## Non-Goals

This slice does not:

- guarantee provider art quality without human review;
- solve provider uptime, quota, or gateway deadlines;
- require users to upload their own collages or model sheets;
- replace existing canonical-frame local synthesis;
- remove Creator Studio advanced controls;
- rewrite the official row pipeline end to end;
- claim preview fallback rows as official-quality action rows.

## Approaches Considered

### Recommended: anchor-reference protocol

OpenPet deterministically composes one internal reference board from user source image(s), metadata, and text brief. The provider receives one image at a time:

1. composite reference board -> character anchor view;
2. character anchor view -> action anchor view;
3. action anchor view -> canonical source frame or row strip.

This reduces gateway instability, improves prompt focus, and gives QA inspectable intermediate artifacts.

### Conservative: only improve existing sprite prompt

This is low-risk but insufficient. It still asks the provider to preserve identity, invent missing views, perform animation planning, obey sprite layout, and maintain frame anchors in one call.

### Aggressive: direct official row generation for every action

This has the highest ceiling but the largest failure surface. It should build on the anchor protocol rather than replace it.

## Architecture

Add a Creator Studio anchor layer between reference copying and provider generation:

```text
creator-reference-service
  -> copied original reference
  -> anchor-reference-board
  -> host-model-bridge anchor generation
  -> openpet-prompt-builder anchor-aware prompts
  -> action-frame-builder / real-atlas-builder
  -> QA and artifacts
```

Recommended module responsibilities:

- `anchor-reference-board.js`
  - Deterministically builds a single PNG board from one or more source images and a sanitized pet description.
  - Uses `sharp`.
  - Writes board image and JSON metadata under the run workspace.

- `anchor-prompt-builder.js`
  - Builds concise prompts for character anchor view and action anchor view.
  - Reuses sanitization rules from `openpet-prompt-builder`.
  - Makes image identity priority explicit.

- `host-model-bridge.js`
  - Selects the best conditioning reference for each provider call.
  - Sends exactly one reference image per provider edit request.
  - Records whether the reference was original, composite board, character anchor, or action anchor.

- `backend-runner.js`
  - Persists generated anchors in `run.artifacts.anchorReferences`.
  - Writes prompt previews and conditioning summaries for each anchor stage.

- `openpet-prompt-builder.js`
  - Uses anchor-aware wording for final action/canonical prompts.
  - Keeps the source style authority rules.

- `creator-workflow-service.js` and Control Center Create UI
  - Allow optional user pet description.
  - Fix copy that currently tells users/system to avoid composite reference boards.
  - Explain that users upload normal source images while OpenPet internally prepares anchors.

## Run Artifacts

Each provider-backed run should record:

```json
{
  "anchorReferences": {
    "version": 1,
    "sourcePriority": "image-first",
    "compositeBoard": {
      "relativePath": "runs/<runId>/inputs/anchors/composite-reference-board.png",
      "metadataRelativePath": "runs/<runId>/inputs/anchors/composite-reference-board.json",
      "role": "composite-reference-board"
    },
    "characterAnchor": {
      "relativePath": "runs/<runId>/anchors/character-anchor.png",
      "promptRelativePath": "runs/<runId>/prompts/anchors/character-anchor.md",
      "role": "character-anchor"
    },
    "actionAnchors": [
      {
        "actionId": "waving",
        "relativePath": "runs/<runId>/anchors/actions/waving-anchor.png",
        "promptRelativePath": "runs/<runId>/prompts/anchors/actions/waving-anchor.md",
        "role": "action-anchor"
      }
    ]
  }
}
```

If an anchor stage fails, the run should record the failed stage and preserve any earlier successful anchor artifacts for debugging.

## Composite Reference Board Contract

The board is a system-generated conditioning image, not the final output. It should be visually simple and model-friendly:

- square PNG, default `1024x1024`;
- white or transparent-friendly plain background;
- no decorative borders, shadows, UI chrome, or watermark;
- one large source image panel;
- optional smaller panels for additional user references when available;
- short text labels only if they help internal diagnosis, not provider output;
- a compact identity note derived from the sanitized pet description;
- source image remains visually dominant.

Provider prompts must explicitly say: use the board for identity and pose guidance only; do not copy board layout, text, labels, panels, or background.

## Character Anchor Prompt Contract

The character anchor prompt must be concise and hard-prioritized:

1. Preserve the exact visible pet identity from the reference board.
2. Preserve style, rendering medium, lighting, material/fur texture, eyes, markings, accessories, proportions, and silhouette.
3. Create one full-body centered pet source image.
4. Use a clean transparent-friendly cutout with safe padding.
5. Do not generate a sprite sheet, model sheet, poster, collage, or multi-pose image.

It should include a conflict rule:

```text
If the written description conflicts with the reference image, follow the reference image.
```

## Action Anchor Prompt Contract

The action anchor prompt receives the character anchor as the primary reference and the action description as motion intent. It should produce a pose guide, not the final sprite sheet:

- same character identity as the character anchor;
- one or a few clear action key poses, depending on action type;
- stable lower-center root and unchanged body scale;
- moving parts clearly separated enough for local synthesis or row generation;
- no redesign, no new species, no new outfit/accessory unless requested;
- no scene, props, motion blur, text, labels, or decorative effects.

For stationary actions such as waving, the action anchor should emphasize that the body, head, feet/base, and face remain locked while only the target limb changes.

For locomotion actions such as running, the action anchor should describe in-place gait poses and forbid background movement, ground paths, and camera changes.

## Final Action Generation Contract

Final generation should choose the most stable path by action type:

- Single-action default: generate or reuse one action anchor, then produce a canonical source frame and let OpenPet synthesize bounded local frames.
- Stationary actions: prefer canonical-frame synthesis with local motion patches.
- Locomotion and official rows: use action anchor plus row-strip prompts when official row generation is explicitly requested.
- Full-pet preview path: may still produce base/preview output, but must honestly report missing official rows.

Every final action prompt should include:

- reference image identity lock;
- source style authority;
- exact frame count or canonical-frame mode;
- root anchor rules;
- animated parts;
- locked parts;
- forbidden motion;
- negative prompt;
- programmatic slicing requirements when a sheet/row is requested.

## Provider Rules

Provider edit calls should send exactly one reference image:

1. action anchor, if generating final action frames for that action;
2. character anchor, if generating an action anchor;
3. composite reference board, if generating character anchor;
4. original reference only as fallback when anchors are unavailable.

`gpt-image-2` remains preferred when verified by the host model policy. If a fallback model is used, the run must record the selected model and model attempts.

The bridge should avoid multi-image `image[]` edits by default because the current gateway path is less stable. If future providers support multi-reference edits reliably, that can be an advanced opt-in, not the default Create path.

## UI Copy

Control Center Create should say:

- users can upload a clear source image and optionally describe the pet;
- OpenPet will internally prepare anchor references for better action quality;
- the uploaded image remains the identity source;
- advanced users can inspect anchors and prompts in Creator Studio details.

It should not tell users that the whole system must avoid composite or multi-view conditioning. The restriction is provider-facing: OpenPet should send one prepared conditioning image per call.

## QA And Review

Technical QA should keep the existing hard gates and add anchor provenance:

- which reference role was used for each provider call;
- character anchor exists and is visible;
- action anchor exists for final action calls when enabled;
- deterministic frame QA: visible pixels, unique frames, centroid drift, baseline drift, identity-core drift, alpha/cutout checks;
- contact sheets for final frames;
- anchor contact sheet or preview images for manual review.

Passing deterministic QA means the asset is technically usable. It does not by itself mean the art is human-approved.

## Error Handling

Recommended failure behavior:

- Composite board failure: fail the run with a clear local processing error.
- Character anchor provider failure: fail the run and keep the composite board and prompt preview.
- Action anchor provider failure: fail the action run and keep character anchor evidence.
- Final action generation failure: keep anchor artifacts and mark the run `review-required` or `failed` according to existing workflow rules.
- Provider timeout or `context canceled`: record endpoint, model, timeout, reference role, and stage.

No failure should silently fall back to fixture output or mark preview-only rows as official.

## Testing

Add focused tests before implementation:

- composite board builder creates one in-workspace PNG and metadata from a source image and description;
- board builder rejects path traversal when `dataDir` is supplied;
- prompt builder includes image-first conflict rules and forbids copying board layout;
- host model bridge sends one reference image for anchor-aware calls;
- run artifacts record composite, character anchor, action anchor, and selected model attempts;
- Creator Pane copy no longer contradicts the internal composite-board strategy;
- existing edge cutout, canonical-frame, real atlas, workflow, model catalog, and provider tests still pass.

Provider validation should include one real `gpt-image-2` run using a single composite board reference, plus contact-sheet review. If provider quality is poor, the run should be recorded as evidence, not hidden.

## Acceptance

This design is implemented when:

- OpenPet can accept a user image and optional pet description for Create;
- OpenPet internally creates a single composite reference board;
- provider calls use one reference image per stage;
- character anchor and action anchor artifacts are recorded;
- final action generation uses anchor references instead of the raw image whenever available;
- deterministic QA rejects jittery or identity-drifting frames;
- UI copy reflects the actual user workflow;
- focused tests pass;
- `npm run check:syntax` passes before merge;
- real provider evidence is saved under `release/` with prompts, references, reports, and contact sheets.
