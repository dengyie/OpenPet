# Provider-Neutral Reference-Conditioned Image Generation Design

## Status

- Date: 2026-07-15
- Source branch: `codex/dev8`
- Status: approved design
- Scope: every host-mediated Creator Studio and Hatch Pet image-generation request
- Verification boundary: implementation occurs on `codex/dev8`; automated and real-image verification occurs only on the independent test branch

## 1. Goal

Every real image-generation request must be understandable from its prompt and its single attached reference image without requiring knowledge of OpenPet, repository structure, internal role names, run state, or Provider implementation details.

The image model receives a self-contained visual production brief. Code remains responsible for translating internal task state into that brief and for enforcing the reference-image, output-count, file, budget, and quality gates.

Two hard requirements govern the design:

1. Every image-generation request carries exactly one usable reference image.
2. Every upstream image prompt is provider-neutral and project-neutral.

The old contract of allowing zero or one reference image is retired for real image generation. Text-only image generation is not a legal fallback.

## 2. Confirmed Product Decisions

1. Use a task-specific prompt compiler rather than forwarding internal Creator Studio text or unrestricted Hatch Pet model text.
2. Enforce exactly one reference image at both the Creator bridge boundary and the host image service boundary.
3. Compose multiple local sources into one local reference image before any Provider request.
4. Reject missing, multiple, unreadable, non-file, or out-of-scope references before queue acquisition, budget accounting, or Provider transport.
5. Derive the output dimensions and aspect ratio from the current image task, not from the reference board dimensions.
6. Use the reference image for identity, style, visible proportions, pose evidence, and motion evidence only.
7. Do not expose `OpenPet`, Provider terminology, run IDs, action IDs, internal role names, file paths, model-selection metadata, or repository concepts to the image model.
8. Do not permit Hatch Pet model output to become a raw upstream image prompt. The model may select a registered strategy and bounded requested changes; code compiles the final prompt.
9. Keep exact-one-output, deterministic QA, model evaluation, human approval, import, and activation gates unchanged.

## 3. Approaches Considered

### A. Rewrite the existing prompt strings only

This removes the most visible internal terms but does not protect other generation paths, does not guarantee a reference image, and still permits future code to forward project-specific text.

### B. Provider-neutral task compiler plus exact-one-reference enforcement — selected

Internal workflow data is converted into a typed image task. A dedicated compiler produces the only text allowed to reach the image Provider. Reference validation is repeated at the bridge and host-service boundaries.

This creates one auditable contract for identity generation, keyframes, action sheets, fallback attempts, and repairs.

### C. Let the Hatch Pet model write complete image prompts

This is flexible but makes safety, consistency, reference use, dimensions, and project-term removal depend on nondeterministic model behavior. It is rejected as the primary prompt path.

## 4. Scope And Non-Scope

### In scope

- canonical character image generation;
- character and action anchor generation;
- start, peak, and repair keyframes;
- complete action frame-sheet generation;
- full-pet identity and action generation;
- action and identity repair;
- model fallback and same-model transport retry;
- fixed Creator Studio execution and bounded Hatch Pet execution;
- Provider request evidence and prompt provenance.

Every retry or fallback is a new image-generation request and must independently carry exactly one reference image.

### Outside this contract

- chat and planner structured-tool calls;
- Hatch Pet visual-evaluator calls, which retain their separate at-most-one review-board attachment contract;
- local board composition, slicing, atlas construction, and deterministic QA, because these are not image Provider calls;
- Provider health checks that do not create images;
- human approval, import, or activation.

## 5. High-Level Architecture

```text
user/current-pet source
  -> resolve one safe local source image
  -> build one local reference image when multiple visual facts are needed
  -> create typed ProviderImageTask
  -> validate task dimensions, layout, strategy, and exactly one reference
  -> compile provider-neutral visual brief
  -> reject internal terminology or invalid prompt contract
  -> Creator bridge validates exactly one reference
  -> host image service revalidates exactly one normalized file
  -> one image-edit/image-conditioned Provider request with n=1
  -> existing output-count, QA, evaluation, and human-review gates
```

The compiler belongs before transport and after deterministic task planning. Provider adapters do not infer task meaning from internal workflow state.

## 6. Typed Image Task Contract

Introduce a bounded task contract such as:

```js
{
  version: 1,
  taskType: 'character-image' | 'action-keyframe' | 'action-frame-sheet',
  stage: 'identity' | 'start' | 'peak' | 'final' | 'repair',
  canvas: {
    width: 1024,
    height: 1024,
    aspectRatio: '1:1'
  },
  sheet: null | {
    frameCount: 6,
    columns: 3,
    rows: 2,
    readingOrder: 'left-to-right-top-to-bottom'
  },
  referenceInterpretation: {
    type: 'single-character' | 'identity-comparison' | 'identity-and-motion',
    primaryRegion: 'the larger character view',
    secondaryRegion: 'the smaller source-detail view',
    ignorePresentationLayout: true
  },
  subject: {
    count: 1,
    framing: 'full-body',
    targetOccupancyPercent: 78,
    safePaddingPercent: 10,
    rootAnchor: 'lower-center'
  },
  action: null | {
    name: 'running',
    moment: 'first contact pose of an in-place gait cycle',
    movingParts: ['front legs', 'rear legs'],
    lockedParts: ['face', 'markings', 'body proportions'],
    loopIntent: 'seamless locomotion cycle'
  },
  styleLocks: [
    'same face and eye design',
    'same visible markings and colors',
    'same material or fur rendering',
    'same body proportions and silhouette'
  ],
  strategyId: 'preserve-reference-identity-v1',
  requestedChanges: []
}
```

Internal values may use stable IDs, but the compiler maps them to ordinary visual language. IDs are never interpolated into the upstream prompt.

Validation rejects unknown fields, unsupported task types, impossible dimensions, inconsistent sheet geometry, unregistered strategies, unbounded text, and unsafe requested changes.

## 7. Exact-One-Reference Contract

### Public workflow input

A real generation operation must resolve one of these sources before creating a Provider task:

- one user-selected reference image;
- one safe current-pet source image;
- one previously accepted canonical image;
- one locally composed reference image built from approved local evidence.

If none is available, the workflow moves to `awaiting_user_input` or fails with `reference_image_required`. It does not synthesize a placeholder and does not fall back to text-only generation.

### Local composition

When a stage needs identity plus motion or multiple identity views, code composes those sources locally into one PNG. The composed image is the only Provider attachment.

Composition remains deterministic and records safe metadata describing the source roles and hashes. The Provider prompt describes visible spatial regions in natural language instead of exposing internal role names.

### Creator bridge gate

The Creator bridge must require `referenceImages` to be an array of length exactly one before resolving plugin paths.

Stable failures:

- length zero: `reference_image_required`;
- length greater than one: `reference_image_count_invalid`;
- invalid object or missing relative path: `reference_image_invalid`.

### Host image-service gate

`imageGenerationModelService.generateImage` must reject anything except exactly one reference before:

- output-directory creation;
- queue acquisition;
- attempt or Provider-call accounting;
- request logging;
- Provider transport.

After normalization, the service checks the source is an existing regular file inside the permitted data boundary. The Provider request always uses the image-conditioned/edit path and multipart field `image`, never `image[]` and never the text-only generations path.

Retries and fallback models reuse the same validated reference descriptor and must not silently drop it.

## 8. Provider-Neutral Prompt Compiler

### Compiler ownership

Add a focused compiler module in Creator Studio rather than extending the general prompt builder with more project-specific paragraphs.

Suggested interface:

```js
compileProviderImagePrompt({ task, strategy, qualityGuidance }) -> {
  version,
  taskType,
  text,
  safeSummary,
  warnings
}
```

Only `text` reaches the image Provider. `safeSummary` is stored for diagnostics. The compiler has no filesystem, secret, Provider, model-catalog, or run-store access.

### Required prompt structure

The compiled prompt uses direct drawing instructions in this order:

1. output count and exact canvas size;
2. concrete deliverable type;
3. how to interpret the attached reference image;
4. identity and style preservation;
5. required pose, action moment, or frame sequence;
6. subject framing, occupancy, anchor, and padding;
7. background and transparency requirements;
8. layout rules for an action frame sheet;
9. a short task-specific exclusion list.

The prompt must be complete when read without repository documentation.

### Forbidden upstream content

The compiler must not emit:

- `OpenPet` or repository/product implementation names;
- `Provider`, endpoint, backend, transport, multipart, or model-selection terms;
- `runId`, `actionId`, reference-role tokens, artifact roles, or checkpoint terminology;
- local or relative file paths;
- schema names, QA reason codes, internal strategy IDs, or approval state;
- instructions that tell the image model to understand application packaging or runtime behavior.

Terms such as “animation frame sheet”, “transparent background”, “full-body character”, “reference image”, “canvas”, and “reading order” are ordinary visual-production language and are allowed.

### Reference interpretation

The prompt describes what is visibly present, not why the application created it.

Examples:

- single source: “Use the attached character as the exact identity and visual-style reference.”
- identity comparison: “The attached image contains a larger primary character view and a smaller source-detail view. Preserve the pose and framing of the larger view while preserving visible facial features, markings, colors, and accessories from the smaller view.”
- identity plus motion: “The attached image contains one identity view followed by two pose examples. Use the identity view for appearance and the pose examples for the start and motion extreme. Do not reproduce the reference layout.”

The compiler never emits `full-pet-action-identity-board`, `canonical-reference`, `action-start-keyframe`, or similar role strings.

## 9. Canvas And Layout Rules

The output canvas is authoritative and independent of reference-image dimensions.

### Single character or keyframe

- state exact pixel dimensions and aspect ratio;
- create one full-body character only;
- target a bounded occupancy such as 75–82% of canvas height;
- preserve 8–12% clear padding;
- keep the lower-center root stable;
- no crop, second character, duplicate pose, panel, border, label, floor, or cast shadow.

### Action frame sheet

- derive canvas ratio from `columns:rows` and configured cell geometry;
- state the exact frame count, columns, rows, and reading order;
- require one full-body frame per required cell;
- require equal cell geometry without visible dividers;
- require unused cells to be empty and transparent;
- keep character scale, root anchor, viewpoint, identity, and lighting stable;
- describe each required motion moment in visual terms.

The reference image may be wide, tall, or panel-based. Its ratio never overrides the task canvas.

## 10. Example Replacement

The old keyframe prompt begins with project and implementation language such as:

```text
Create exactly one provider-generated OpenPet action keyframe image.
Reference role: full-pet-action-identity-board.
Action ID: running.
```

For a 1024 x 1024 running start keyframe, the compiled prompt should instead resemble:

```text
Create exactly one 1024 x 1024 image with a 1:1 aspect ratio.

Draw one complete full-body character performing the first contact pose of an in-place running cycle. This is the neutral starting pose: opposing front and rear limbs are clearly separated, the body remains balanced, and the character is not moving across the canvas.

Use the attached image as the complete visual reference. It contains a larger primary character view and a smaller source-detail view. Match the pose scale and framing of the larger view. Preserve the visible face, eyes, markings, colors, accessories, material or fur texture, body proportions, silhouette, lighting, and rendering style shown across the reference. If written appearance details conflict with the image, follow the image.

Place the character at the lower center. The full body, ears, paws, limbs, tail, and accessories must remain visible. Fill approximately 78% of the canvas height and keep about 10% clear padding on every side.

Return a clean isolated character on a transparent background. Do not reproduce the reference layout, repeated views, presentation spacing, labels, borders, or white panel background. Do not add text, props, scenery, floor, cast shadow, extra limbs, missing limbs, a second character, or a different design.
```

This text describes the desired picture directly. It does not require knowledge of the calling application.

## 11. Hatch Pet Strategy Boundary

Hatch Pet planning output may choose:

- one registered prompt strategy;
- one eligible image model that supports image-conditioned generation;
- bounded requested visual changes;
- the legal task scope and repair scope.

The model cannot supply a replacement prompt or append unrestricted prose to the Provider prompt.

`requestedChanges` are mapped through a registry of visual directives. Unsupported or unsafe changes cause an invalid decision and the existing single repair-call flow. The compiler re-applies all fixed canvas, reference, identity, transparency, count, and exclusion contracts after strategy composition.

Image-model eligibility now requires image-conditioned/edit capability. A generation-only model is not eligible because text-only fallback is forbidden.

## 12. Failure And Recovery Semantics

Stable failure codes:

| Code | Meaning | Provider call consumed |
| --- | --- | --- |
| `reference_image_required` | No reference was resolved | no |
| `reference_image_count_invalid` | The request contains more or fewer than one reference | no |
| `reference_image_invalid` | Reference descriptor is malformed | no |
| `reference_image_unusable` | Reference file is missing, unsafe, unreadable, or not a regular file | no |
| `image_prompt_contract_invalid` | Typed image task cannot compile into a legal prompt | no |
| `image_prompt_internal_term` | Compiled prompt contains forbidden internal terminology | no |
| existing transport/output/QA codes | Request passed preflight and later failed | yes, according to existing accounting |

Missing user input moves an interactive run to `awaiting_user_input`. Non-interactive commands fail closed while preserving prior checkpoints. A retry may continue only after a valid reference is present.

No error path may retry through `/images/generations` without an image.

## 13. Evidence And Privacy

Safe request evidence records:

```js
{
  promptCompilerVersion: 1,
  taskType: 'action-keyframe',
  stage: 'start',
  width: 1024,
  height: 1024,
  aspectRatio: '1:1',
  referenceImageCount: 1,
  requestedOutputCount: 1,
  multipartImageField: 'image',
  promptSafety: 'provider-neutral',
  strategyId: 'preserve-reference-identity-v1'
}
```

Evidence must not contain:

- image bytes or base64;
- authorization material;
- absolute paths;
- raw multipart bodies;
- unbounded Provider responses;
- arbitrary Hatch Pet model rationale;
- fabricated human or Provider approval.

The full compiled prompt may remain in the existing confined run prompt artifact when required for reproducibility, but dashboard/public summaries expose only bounded safe metadata and a sanitized preview.

## 14. Migration Plan

1. Add typed task contracts and the provider-neutral compiler.
2. Replace character-anchor, action-anchor, action-keyframe, action-frame-sheet, and repair prompt construction with compiler calls.
3. Map existing reference roles to concrete `referenceInterpretation` structures before compilation.
4. Change bridge and image-service validators from “at most one” to “exactly one”.
5. Remove real generation paths that pass `referenceImages: []`.
6. Require workflow entry points to resolve a user, current-pet, canonical, or composed reference before generation.
7. Make image-model candidates require image-conditioned generation support.
8. Update prompt provenance from the current builder version to a new compiler version.
9. Update Phase 2–4 Hatch Pet plans and verification handoffs from `zero/one reference` to `exactly one reference`.
10. Retire test and Provider smoke scenarios that treat zero-reference image generation as valid.

No compatibility flag permits zero-reference real generation. Fixture-only code may simulate failures but must not claim a successful image request without one reference.

## 15. Independent Verification Requirements

The development branch performs no tests, builds, Provider calls, image generation, image inspection, or visual acceptance.

The independent testing task must verify:

- every Creator bridge and image-service request rejects reference counts of zero and two before Provider work;
- exactly one reference reaches identity, keyframe, frame-sheet, repair, retry, and fallback requests;
- every accepted request uses multipart field `image`, never `image[]`;
- no accepted Creator/Hatch Pet generation uses `/images/generations`;
- missing-reference runs fail or wait for input without consuming Provider-call budget;
- prompt snapshots contain exact dimensions, aspect ratio, deliverable type, reference interpretation, framing, and task-specific exclusions;
- prompt snapshots do not contain forbidden project/internal terminology;
- internal role strings are translated into visible spatial descriptions;
- the output-count contract remains `n=1` and multi-output responses remain fail-closed;
- one real generation subagent per image task reports `referenceCounts` containing only `1`;
- independent visual agents, each used once, assess generated artifacts outside the controller context;
- no Provider approval, import, activation, or `production-art-ready` claim is made without the existing separate gates.

## 16. Acceptance Criteria

The design is implemented when:

1. zero-reference real image generation is impossible through supported Creator Studio and Hatch Pet paths;
2. every Provider image request has exactly one validated local reference and requests exactly one output;
3. upstream prompts are self-contained visual briefs with exact target dimensions and no project knowledge requirement;
4. the example invalid prompt is replaced by a concrete drawing brief equivalent to the example in this design;
5. Hatch Pet cannot bypass the compiler with raw prompt text;
6. all retry, fallback, and repair paths preserve the reference and prompt contracts;
7. independent automated verification is green;
8. real-image and visual-quality evidence is produced only by the isolated one-shot subagent workflow;
9. final output still stops for human approval and carries no unsupported production-readiness claim.
