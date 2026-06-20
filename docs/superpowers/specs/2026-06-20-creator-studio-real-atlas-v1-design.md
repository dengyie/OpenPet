# Creator Studio Real Atlas v1 Design

Date: 2026-06-20
Status: Proposed
Scope: Convert Creator Studio cloud/local generated images into real importable OpenPet pet atlases

## 1. Goal

Creator Studio currently proves that the provider chain works:

```text
Creator Studio run
  -> host model bridge
  -> image generation provider
  -> generated PNG
  -> metadata on pet.json
  -> placeholder spritesheet.webp
```

Real Atlas v1 upgrades this into a production pet-pack path:

```text
Creator Studio run
  -> host model bridge
  -> image generation provider
  -> generated PNG
  -> source validation
  -> normalized pet frame
  -> real spritesheet.webp
  -> pet.json actions referencing the real atlas
  -> host inspect/import
  -> pet window displays generated pet
```

The immediate deliverable is a generated single-action pet pack whose visible sprite is derived from the actual provider output, not from the fixture placeholder atlas.

## 2. Current Context

The relevant code path is:

- `examples/plugins/creator-studio/commands/create-run.js`
- `examples/plugins/creator-studio/commands/run-step.js`
- `examples/plugins/creator-studio/lib/backend-runner.js`
- `examples/plugins/creator-studio/lib/host-model-bridge.js`
- `src/main/services/image-generation-model-service.js`
- `src/main/pet-pack/loader.js`
- `src/main/services/pet-pack-service.js`

The host model service already writes generated provider images inside the Creator Studio data directory and returns `generatedImage.outputs[]`.

`backend-runner.js` currently writes a standard output folder, but `writeHostGeneratedStandardOutputs()` still creates `spritesheet.webp` using `createMinimalWebp()`. That keeps import validation green, but it means the imported pet is not the visual result produced by the provider.

## 3. Non-Goals

Real Atlas v1 does not:

- generate multi-frame animation rows;
- implement full hatch-pet row planning, repair loops, or motion QA;
- ask the model to produce a full spritesheet directly;
- change provider settings or secret ownership;
- redesign Creator Studio UI;
- auto-import generated pets without approval;
- solve visual quality beyond basic image validity and pack importability.

Those are later milestones.

## 4. Recommended Approach

Build a deterministic post-processing step inside Creator Studio:

```text
generated provider PNG
  -> inspect source image
  -> normalize to one transparent pet frame
  -> tile that frame into the OpenPet/Codex runtime atlas cells
  -> write pet.json with one base/idle action
  -> write QA evidence
```

This is preferred over provider-generated spritesheets because deterministic post-processing gives us stable dimensions, stable manifest metadata, testable validation, and clear failure reasons.

The first version should treat the generated provider output as a base pose. It creates a minimal idle pet pack from that base pose. Later milestones can expand from one base pose into generated action frames.

## 5. Data Flow

```text
run-step
  -> generateViaHostModelBridge()
  -> generationResult.outputs[0].dataRelativePath
  -> real-atlas-builder.loadGeneratedSource()
  -> real-atlas-builder.inspectSourceImage()
  -> real-atlas-builder.normalizeSourceFrame()
  -> real-atlas-builder.composeCodexCellAtlas()
  -> backend-runner writes pet.json, spritesheet.webp, QA, zip
  -> import-approved-pet
  -> host /creator/pet-pack/inspect-output
  -> PetPackService import/activate
```

`generationResult` remains stored on `run.artifacts.generatedImage` for provenance. The atlas builder consumes it to produce the runtime assets.

## 6. Proposed Module Boundary

Create:

```text
examples/plugins/creator-studio/lib/real-atlas-builder.js
```

Responsibilities:

- resolve the generated image path from `generationResult.outputs[0].dataRelativePath`;
- ensure the path stays inside `OPENPET_DATA_DIR`;
- decode source image through `sharp`;
- inspect source metadata and visible alpha pixels;
- normalize the image into a single runtime frame;
- compose the normalized frame into the expected atlas canvas;
- write `spritesheet.webp`;
- return manifest action/frame metadata and QA evidence.

Do not put provider calling logic in this module. Provider calls stay in `image-generation-model-service.js`.

Do not put OpenPet import logic in this module. Import stays behind the host pet-pack bridge.

## 7. Atlas Contract

Real Atlas v1 should preserve the current Codex-compatible atlas dimensions used by loader tests:

```text
atlas width: 1536
atlas height: 1872
```

The v1 atlas contains one normalized generated frame copied into every runtime cell used by the current Codex pet loader. This is important because the existing loader ignores custom frame metadata and derives all actions from the fixed Codex row/cell contract.

```text
cell width: 192
cell height: 208
rows: current Codex action rows
columns: action frame count per row
```

This keeps the loader's atlas dimension checks unchanged while ensuring every default action displays the real generated sprite instead of an empty or cropped atlas region.

The normalized generated pet should be centered inside each cell with safe padding. A practical first policy:

- fit source image inside the 192x208 runtime cell with safe padding;
- preserve aspect ratio;
- use transparent padding;
- center the sprite horizontally in the cell;
- place the sprite vertically around the lower visual center, not cropped to the bottom edge.

This produces a static v1 pet across all default actions. Later milestones can replace repeated cells with true multi-frame motion.

## 8. Manifest Contract

`pet.json` for host-generated output should contain:

- `id`
- `displayName`
- `description`
- `spritesheetPath: "spritesheet.webp"`
- existing `creatorStudio` metadata
- existing `generatedImage` provenance
- existing `imageGeneration` backend/model metadata

The exact runtime action shape is derived by the accepted Codex pet loader contract in `src/main/pet-pack/codex-pet.js` and normalized through `src/main/pet-pack/schema.js`, with loader tests under `tests/pet-pack/`.

The generated pack should not depend on legacy `cat_anime` action folders.

## 9. Source Validation

Before composing the atlas, validate the provider image:

- file exists;
- resolved path stays inside the Creator Studio data directory;
- image is decodable by `sharp`;
- width and height are positive;
- image has visible pixels;
- output byte size is within a safe upper bound;
- source format is one of the formats `sharp` can decode for this pipeline.

Validation failures should mark the run as `failed` through the existing `backend-runner` error path. Error messages must be user-actionable:

- `Generated image is missing`
- `Generated image path escaped the Creator Studio data directory`
- `Generated image could not be decoded`
- `Generated image contains no visible pixels`
- `Generated image is too large to process`

## 10. QA Evidence

Real Atlas v1 should write:

```text
runs/<runId>/qa/source-image-validation.json
runs/<runId>/qa/atlas-validation.json
```

`source-image-validation.json` should include:

- `ok`
- `sourceRelativePath`
- `width`
- `height`
- `channels`
- `hasAlpha`
- `visiblePixels`
- `warnings`

`atlas-validation.json` should include:

- `ok`
- `width: 1536`
- `height: 1872`
- `visiblePixels`
- `sourceRelativePath`
- `frame`
- `warnings`

Do not store prompt text, API keys, provider authorization headers, or absolute user paths in QA files.

## 11. Error Handling

The existing run-state convergence should remain:

```text
atlas/source validation error
  -> real-atlas-builder throws clear Error
  -> backend-runner catch block
  -> run.status = failed
  -> run.currentStep = generate
  -> run.backendStatus.state = failed
  -> run.error = clear message
  -> logs/events.jsonl records generate.failed
```

No fallback to fixture atlas is allowed for cloud/local provider output. Fallback would hide production failures and reintroduce the placeholder problem.

The only acceptable fixture behavior is for explicit `backend: "fixture"` runs.

## 12. Testing Plan

Add unit tests for `real-atlas-builder.js`:

- builds a valid real atlas from a generated PNG;
- rejects missing source files;
- rejects path traversal outside the data directory;
- rejects undecodable images;
- rejects transparent images with no visible pixels;
- writes QA evidence without absolute paths or prompt text.

Update Creator Studio tests:

- host-bridged cloud/local run writes `spritesheet.webp` derived from provider output;
- `pet.json` references real atlas action/frame metadata;
- `inspect-output` passes for generated atlas;
- stale fixture self-heal still only applies to `fixture` backend.

Update pet-pack loader tests only if the manifest contract requires a new accepted single-frame shape. Prefer using the existing accepted Codex manifest shape.

## 13. Manual Smoke Test

After implementation, run a real provider smoke:

```text
Control Center -> Plugins -> Creator Studio
  -> create cloud run
  -> run generation
  -> review output
  -> import approved pet
  -> verify pet window displays generated image
```

Command-line smoke can mirror the current verification:

```text
create-run backend=cloud
run-step
inspect output
approve
import-approved-pet activate=true
```

Expected evidence:

- run reaches `ready_for_review`;
- source generated PNG exists;
- `spritesheet.webp` has visible pixels;
- `pet.json` references the real atlas;
- import succeeds;
- active pet pack id is the generated pack id.

## 14. Milestone Breakdown

### Milestone 1: Real Atlas v1

Deliverable: one generated PNG becomes one real importable OpenPet pet pack.

P0/P1:

- `real-atlas-builder.js`;
- source image validation;
- one-frame atlas composition;
- manifest integration;
- QA evidence;
- tests and smoke verification.

### Milestone 2: Review Preview UX

Deliverable: Creator Studio dashboard clearly previews source image, atlas result, and validation state before import.

P0/P1:

- dashboard preview data endpoint updates;
- source/atlas QA display;
- retry guidance for failed validation.

### Milestone 3: Multi-Frame Hatch-Pet Pipeline

Deliverable: base pose expands into action-specific frame rows.

P0/P1:

- action frame generation contract;
- row/frame layout;
- frame QA;
- repair/retry loop.

## 15. Open Questions

The implementation can proceed with these decisions:

- Use `1536x1872` as the v1 atlas canvas.
- Use one full-atlas frame for the first generated action.
- Use transparent padding and center-fit normalization.
- Keep cloud/local failures strict; do not fallback to fixture.

Questions for later milestones:

- Should v2 use smaller cells inside the atlas for multi-frame actions?
- Should the generated base pose become `idle`, `base`, or the current default action id?
- Should users be able to choose crop/fit policy in the dashboard?
- Should local model output support multiple candidate images for selection?

## 16. Acceptance Criteria

Real Atlas v1 is complete when:

- cloud/local host-bridged runs no longer write placeholder spritesheets;
- generated `spritesheet.webp` is derived from `generatedImage.outputs[0]`;
- generated atlas passes existing pet-pack inspection;
- imported generated pack can be activated;
- tests cover success and validation failures;
- provider errors, source validation errors, and atlas validation errors are distinct in run state;
- logs and QA files do not leak API keys, prompt text, or absolute user paths.
