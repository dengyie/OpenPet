# Quality-First Sprite Generation Pipeline Redesign

## Status

- Date: 2026-07-20
- Source branch: `codex/dev8`
- Decision: replace the current internal character/action generation pipeline
- Priority order: visual quality, identity consistency, motion readability, recoverability, then cost and latency
- External reference: `0x0funky/agent-sprite-forge` at commit `64fd0b57d3f2ae117ef0a95e4c2decc25b4c9dd2`
- Approval boundary: automatic execution stops at `ready_for_review`; only a human may approve, import, or activate

This document defines the target architecture and migration contract. It does not claim that the design is implemented or visually verified.

## 1. Decision And Goal

OpenPet will replace the current Provider action-row generation chain rather than add a second optional mode or preserve two permanent pipelines.

The replacement combines the strongest parts of both systems:

- retain OpenPet's host-owned credentials, Provider-neutral prompt compiler, exactly-one-reference rule, typed image tasks, identity governance, durable checkpoints, partial packaging, failed-asset review, human approval, and official atlas contract;
- adopt Agent Sprite Forge's asset planning, accepted master frame, repeated character anchor layout, per-action multi-row raw grids, shared cross-action scale profile, deterministic processing, action-specific anchor policies, strict quality gates, and complete artifact provenance;
- use the Hatch Pet model for bounded planning and visual evaluation while code remains authoritative for state, paths, budgets, Provider transport, deterministic processing, QA, packaging, approval, import, and activation.

The quality target is not a technically valid sprite sheet. The target is a visually coherent character whose identity, anatomical scale, camera distance, root placement, motion semantics, and rendering style remain stable across every accepted frame and action.

## 2. Non-Negotiable Contracts

The replacement pipeline must preserve these contracts.

1. Every real image-generation request carries exactly one validated local reference image.
2. Every request uses the image-conditioned edit path and requests `n=1`.
3. A zero-output or multi-output Provider response fails closed; OpenPet never selects the first ambiguous output.
4. No upstream prompt contains `OpenPet`, `Creator Studio`, `Hatch Pet`, internal role names, run IDs, action IDs, paths, transport terms, credentials, or unrestricted model-authored text.
5. The upstream prompt describes only the image to produce, its exact canvas/aspect ratio, the attached visual reference, ordered frame poses, fixed identity/scale/anchor rules, and visible exclusions.
6. The source image, canonical master, layout guide, and pose cues are never attached separately. Code composites all required guidance into the request's single reference board.
7. Automatic QA cannot grant artistic approval. The Hatch Pet evaluator cannot approve, import, activate, weaken a gate, expand a budget, or hide a failed asset.
8. Every generated asset is retained as paid user evidence unless retention is explicitly disabled before generation.
9. Failed assets remain visible with their prompt, reference-board metadata, metrics, failure reasons, and retry scope.
10. `idle` remains required. Optional failed actions may be omitted. A pet pack is importable only when an approved `idle` row exists.
11. `running-left` remains a deterministic framewise mirror of an accepted `running-right` row and must pass its own mirror QA.
12. The official 8-column by 9-row, 128 by 128 cell atlas and current manifest/runtime semantics do not change.
13. Quality thresholds are not weakened to make a generation pass.
14. Provider transport retry remains at most one same-model retry within the operation deadline and does not consume a new creative attempt.
15. All run files and exposed paths remain under the host-owned data directory and use safe relative paths plus hashes.

## 3. What Is Replaced, Retained, And Added

### 3.1 Replaced after migration

The following behavior is removed from the production path after the new pipeline passes independent verification:

- separate Provider generation of action start and peak keyframes;
- using generated keyframes as parents for the final sprite row;
- direct raw `1xN` character-row generation;
- per-action independent fit-to-bounding-box scale selection;
- a single orchestration function owning identity generation, keyframes, row generation, QA, fallback, checkpoints, and package composition;
- prompt contracts that describe internal reference roles instead of the visible content of the attached image;
- accepting the first passing candidate when no comparable candidate pool was evaluated;
- hiding rejected Provider output behind a terminal run error.

The obsolete functions, tests, prompt builders, role validators, and artifact fields are deleted during cutover. They are not retained as deprecated wrappers or a hidden compatibility mode.

### 3.2 Retained

The following existing boundaries remain authoritative:

- `CreatorWorkflowService` owns the user-facing run, review, partial import, retry, and activation flow;
- `HatchPetAgentService` owns bounded planning and visual evaluation calls;
- `ImageGenerationModelService` owns Provider discovery, credentials, health, edit requests, output materialization, deadlines, and transport retry;
- `provider-image-task.js` and `provider-image-prompt-compiler.js` own the Provider-neutral upstream brief;
- the official full-pet row contract, atlas dimensions, row durations, partial availability metadata, and approved mirror semantics;
- immutable quality profiles tied to human-review datasets;
- run leases, stale-generation recovery, repair archives, checkpoint hashing, and safe relative paths;
- the Create progress UI and failed-asset review bench.

### 3.3 Added

The new pipeline adds:

- a versioned sprite asset plan;
- exact action-class and anchor-policy classification;
- canonical candidate pools and deterministic candidate ranking;
- a repeated canonical character anchor grid;
- one composite reference board per generation attempt;
- per-action multi-row raw grid generation;
- a deterministic alpha/component/grid processor;
- a cross-action character scale profile;
- action-specific strict QA policies;
- code-QA plus Hatch Pet visual-evaluation combined gates;
- reason-directed bounded regeneration;
- full raw/clean/processed/review provenance;
- an explicit asset-recovery bundle when `idle` fails.

## 4. Target Architecture

```text
User source image
  -> source validation and normalization
  -> Hatch Pet structured asset plan
  -> canonical identity candidate pool (3 single-output requests)
  -> deterministic identity QA
  -> Hatch Pet identity evaluation
  -> accepted canonical master
  -> repeated character anchor grid
  -> action queue
       -> action candidate pool (2 initial candidates)
       -> deterministic grid split and alpha/component processing
       -> action-specific code QA
       -> Hatch Pet visual evaluation
       -> select best passing candidate
       -> if none pass: one reason-directed repair candidate
       -> accept checkpoint or omit/block
  -> lock/reuse cross-action scale profile
  -> deterministic official atlas composition
  -> atlas QA and final review board
  -> ready_for_review
  -> explicit human approval
  -> explicit import
  -> optional explicit activation
```

No image model decides state transitions. No general-purpose agent receives filesystem, shell, credentials, import, or activation access.

## 5. Asset Plan

### 5.1 Ownership

The Hatch Pet planner proposes the visual plan. Code validates and freezes it before the first image request. The plan is immutable for the run except through an explicit identity repair, which creates a new plan revision and invalidates dependent checkpoints.

Planning and visual evaluation use the same resolved Hatch Pet model configuration through separate stateless role prompts. A dedicated Hatch Pet configuration is preferred; when it is absent, the service falls back to the saved chat Provider/model configuration without reading chat history, memory, or behavior state. If the resolved model cannot produce the required structured planning output or inspect the one-image review board, the run fails explicitly. There is no fixed-pipeline or text-only quality fallback.

### 5.2 Schema

Store `runs/<runId>/sprite-plan.json`:

```json
{
  "version": 1,
  "revision": 1,
  "character": {
    "assetClass": "grounded-compact-character",
    "view": "source-matched",
    "renderingMedium": "source-matched",
    "canonicalPose": "neutral-full-body",
    "identityLocks": [],
    "bodyEffectPolicy": "body-only"
  },
  "canonical": {
    "candidateCount": 3,
    "canvas": { "width": 1024, "height": 1024 },
    "targetOccupancyPercent": 72,
    "safePaddingPercent": 12,
    "rootAnchor": "lower-center"
  },
  "actions": [],
  "qualityProfile": {
    "id": "pet-generation-default-v2",
    "sourceDatasetId": ""
  },
  "budgets": {
    "canonicalCandidates": 3,
    "initialCandidatesPerAction": 2,
    "repairCandidatesPerAction": 1,
    "maxEvaluationAttemptsPerArtifact": 2,
    "maxProviderCalls": 64,
    "maxElapsedMs": 5400000
  }
}
```

The registered character classes are `grounded-compact-character`, `grounded-elongated-character`, and `floating-character`. The planner may choose only code-registered values. Unknown fields, character classes, action classes, anchor policies, layouts, image models, or directives are rejected. One schema-repair call is allowed; a second invalid response fails planning.

### 5.3 Action plan

Each action entry contains:

```json
{
  "actionId": "running-right",
  "frameCount": 8,
  "layout": { "columns": 4, "rows": 2, "readingOrder": "left-to-right-top-to-bottom" },
  "actionClass": "grounded-locomotion",
  "anchorPolicy": "feet-baseline",
  "scalePolicy": "shared-character-profile",
  "componentPolicy": "primary-body",
  "effectPolicy": "forbid-detached-effects",
  "loopPolicy": "closed-loop",
  "framePoses": [],
  "movingParts": [],
  "fixedParts": [],
  "semanticChecks": []
}
```

`framePoses` contains exactly `frameCount` short visible-pose descriptions. It cannot contain internal terms, Provider instructions, paths, URLs, secrets, or prompt-control language. Code supplies the official action semantics and validates that required motion beats are present.

## 6. Fixed Grid Geometry

All character body actions use a square 1024 by 1024 Provider canvas and an invisible multi-row grid:

| Frame count | Columns | Rows | Actions |
| --- | ---: | ---: | --- |
| 4 | 2 | 2 | `waving` |
| 5 | 3 | 2 | `jumping`; final cell unused |
| 6 | 3 | 2 | `idle`, `waiting`, `running`, `review` |
| 8 | 4 | 2 | `running-right`, `failed` |

Rules:

- reading order is left-to-right, then top-to-bottom;
- unused cells are declared and must remain empty;
- visible grid lines, labels, numbers, borders, panels, and guide marks are forbidden;
- characters may not cross cell boundaries;
- raw `1x4`, `1x6`, `1x8`, or other character `1xN` generation is illegal;
- the final runtime row is assembled deterministically from processed frames, never requested directly from the Provider;
- layout is code-owned and cannot be changed by the planner or evaluator.

This geometry retains the useful current frame-count mapping in `action-sheet-layout.js` but changes canvas selection: `resolveProviderCanvasForLayout` must not choose a landscape canvas merely because columns exceed rows. Character grids remain square so each cell has useful vertical room and stable framing.

## 7. Canonical Identity Candidate Pool

### 7.1 Requests

Generate exactly three canonical candidates. Each request:

- attaches one normalized source-reference board;
- requests one 1024 by 1024 output;
- requests one complete, full-body character only;
- preserves source viewpoint, identity, proportions, markings, accessories, material/fur, palette, lighting, and rendering medium;
- uses a lower-center root, full-body containment, 12 percent safe padding, and approximately 72 percent occupancy;
- forbids text, layout panels, duplicate views, props, floor, scenery, cast shadow, and visible background.

The candidate requests are independent. A failed candidate does not become a reference for another canonical candidate.

### 7.2 Deterministic gate

Each candidate must pass:

- exactly one connected primary subject;
- complete-body containment and no source/output edge contact;
- usable alpha or successful bounded background cleanup;
- occupancy, root, and safe-padding bounds;
- identity color and descriptor limits against the normalized source;
- no text/panel/grid contamination;
- safe local path and artifact hash validation.

### 7.3 Visual gate and selection

The Hatch Pet evaluator receives one locally composed review board containing the source and all code-QA-passing candidates. It scores identity fidelity, silhouette, small-scale readability, completeness, source-style fidelity, and suitability as an animation master.

Only candidates that pass both gates are eligible. Code selects the highest overall visual score, using deterministic identity distance and then candidate index as stable tie-breakers. The accepted output becomes `canonical/master.png`; rejected candidates remain visible in the asset review bench.

If no candidate passes, the run fails at identity scope. Identity repair creates a new candidate pool and invalidates every dependent action checkpoint.

## 8. Character Anchor Grid And Single Reference Board

### 8.1 Repeated anchor grid

After canonical acceptance, code creates a transparent 1024 by 1024 anchor grid for each required layout by repeating the exact accepted canonical master into every used cell.

Each repeated master uses:

- one standing-equivalent anatomical scale;
- one fixed horizontal body root;
- one fixed grounded foot-contact line for grounded actions;
- the plan's occupancy and safe padding;
- no labels, grid lines, borders, or text.

Unused cells remain transparent. The anchor grid is deterministic and hash-bound to the canonical master, plan revision, layout, and processor version.

### 8.2 Composite action reference

Every action attempt receives exactly one locally composed reference image. It contains:

- the repeated canonical anchor grid as the dominant region;
- one bounded source-detail inset for face, markings, accessories, and material evidence;
- no textual labels;
- fixed metadata describing regions and source hashes outside the image.

The Provider prompt describes visible regions rather than internal role names. It tells the image model to preserve the anchor grid's cell positions, standing-equivalent scale, body-root placement, and padding while replacing repeated neutral poses with the ordered action poses. It explicitly forbids reproducing the source-detail inset, layout presentation, or duplicate neutral placeholders.

The original source and canonical master remain separate quality references locally. They are not additional Provider attachments.

## 9. Provider-Neutral Prompt Contract

### 9.1 Prompt order

The compiler emits these paragraphs in this exact order:

1. image goal and exact 1024 by 1024 canvas;
2. description of the single attached reference image and which visible features control identity, scale, placement, and detail;
3. number of frames, columns, rows, reading order, and unused cells;
4. ordered frame-by-frame pose plan;
5. fixed identity, camera, scale, anatomical, root, and style locks;
6. action-specific anchor and loop policy;
7. body/effect/component policy;
8. output exclusions.

### 9.2 Example shape

The prompt must read like a self-contained image brief:

```text
Create one 1024 by 1024 transparent animation frame sheet containing eight full-body frames of the same character.

Use the attached image as the visual reference. The repeated character views define the exact character identity, camera distance, standing-equivalent anatomical scale, cell positions, body-root placement, foot-contact line, and safe padding. The smaller source-detail view defines visible facial details, markings, colors, accessories, and material or fur texture. Do not reproduce the reference presentation or the smaller detail view in the output.

Arrange the eight frames in four columns and two rows, ordered left to right and then top to bottom...
```

The compiler never emits phrases such as `OpenPet action`, `Reference role`, `Provider-generated`, `checkpoint`, or `Action ID`.

### 9.3 Prompt safety

Planner output enters the image prompt only through registered action semantics and bounded visual directives. Code rejects forbidden internal text, paths, URLs, credentials, instruction-control language, excessive length, unknown reason codes, and directives that conflict with fixed contracts.

The complete compiled prompt, compiler version, typed task, reference hash, and model are saved before dispatch.

## 10. Per-Action Candidate Strategy

### 10.1 Candidate budget

For each generated action job:

1. generate two initial candidates as separate `n=1` requests;
2. process and evaluate both independently;
3. if at least one passes both gates, select the best passing candidate;
4. if neither passes, compile one reason-directed repair prompt and generate one final candidate;
5. accept the repair candidate only if it passes both gates;
6. otherwise block `idle` or omit the optional action.

The pipeline does not stop after the first initial candidate passes. Comparing two valid candidates is a deliberate quality-first requirement.

### 10.2 Model selection

The Hatch Pet planner may choose any host-reported healthy image-conditioned model. It cannot invent Provider configuration. Candidate requests record the exact Provider/model. A model switch is permitted only between creative attempts, never inside deterministic processing. Every successful model used by an accepted artifact must be present in Provider art-readiness evidence before a production-art claim is possible.

### 10.3 Reason-directed repair

Code maps fixed failure codes to bounded visual corrections. Examples:

| Failure code | Repair direction |
| --- | --- |
| `identity-descriptor-distance-high` | restore canonical head, face, markings, proportions, and silhouette |
| `body-scale-profile-drift` | keep standing-equivalent anatomy and camera distance equal to the anchor views |
| `anchor-baseline-drift` | keep the grounded body root and foot-contact line fixed |
| `cell-edge-contact` | reduce pose extent while preserving anatomical scale; increase clear cell padding |
| `action-semantic-missing` | strengthen the missing ordered motion beat without redesigning the character |
| `loop-closure-drift` | return the final pose toward the first pose without duplicating frames |
| `detached-effect-contamination` | remove trails, particles, floor marks, shadows, props, and detached effects |

Model-authored free-form repair text is not passed upstream. The evaluator returns reason codes and bounded evidence; the compiler owns the final wording.

## 11. Deterministic Sprite Processor

Create a focused processor that performs only reproducible transformations.

### 11.1 Processing stages

1. materialize and hash `raw-sheet.png`;
2. validate dimensions and declared grid;
3. split exact equal cells without content-based crop inference;
4. obtain alpha through native transparency or the existing bounded background-removal path;
5. remove near-transparent RGB residue;
6. detect connected alpha components;
7. select the primary body component while retaining body-connected accessories;
8. measure raw subject bounds, centroid, baseline, visible area, and edge distances;
9. apply one shared scale for the complete sheet;
10. apply the action's anchor policy;
11. paste into fixed 128 by 128 runtime frames without clamping;
12. write processed frames, contact sheet, GIF, metrics, and hashes.

### 11.2 Scale strategies

Supported strategies are:

- `preserve`: preserve raw-cell anatomical scale across frames, apply one shared safety scale only when every frame requires it, then translate to the shared anchor;
- `profile`: apply the accepted character scale profile across actions and translate according to the action anchor policy.

Per-frame independent bbox fitting is forbidden for character actions. It can hide generation drift and create pulsing anatomy.

### 11.3 Component policies

- `primary-body`: retain the largest body-connected component and body-connected accessories; reject detached effects;
- `all-subject-components`: reserved for a future explicit FX asset type and not legal for the current official character atlas.

The current redesign does not add an FX runtime. All official pet actions are body-only. Large trails, particles, projectiles, impact art, floor plates, shadows, and detached effects are rejected rather than squeezed into the body row.

## 12. Cross-Action Character Scale Profile

### 12.1 Creation

The canonical master creates a provisional identity geometry record. The first accepted `idle` sheet creates the final `character-scale-profile.json`:

```json
{
  "version": 1,
  "canonicalMasterSha256": "...",
  "idleCheckpointSha256": "...",
  "processorVersion": 1,
  "runtimeCell": { "width": 128, "height": 128 },
  "rawGridCanvas": { "width": 1024, "height": 1024 },
  "canonicalStandingHeightRatio": 0.72,
  "canonicalBodyWidthRatio": 0.48,
  "runtimeStandingHeightPx": 92,
  "targetRootX": 0.5,
  "groundedBaselineY": 0.9,
  "safeMarginRatio": 0.08,
  "maxBodyScaleCv": 0.08,
  "maxAnchorYStd": 0.05,
  "maxCrossActionScaleDrift": 0.08,
  "componentPolicy": "primary-body"
}
```

The file is immutable for the current identity revision. Identity repair creates a new profile. Action repair reuses the existing profile.

Raw geometry ratios are relative to each layout cell, not absolute Provider pixels. This allows 2 by 2, 3 by 2, and 4 by 2 source grids to share one anatomical profile. Before processing, code compares each candidate's normalized standing-equivalent height and width against the anchor/profile. After a candidate passes, code derives one uniform sheet-level raw-to-runtime scale and applies it to every frame in that sheet.

### 12.2 Application

- grounded compact idle/locomotion/gesture/state actions use profile scale plus lower-root/contact-baseline alignment;
- grounded elongated actions use profile scale plus the shared silhouette envelope, torso root, and contact band;
- floating actions use profile scale plus the shared core centroid and bounded hover range;
- `jumping` uses profile anatomical scale but an action-relative center/root trajectory, not a fixed foot baseline;
- visible crouch, compression, recoil, and airborne excursion may change the pose bounding box without changing anatomical scale;
- unexplained scale drift is a regeneration signal, never a request for per-frame normalization.

## 13. Action Classes And Quality Policies

| Action | Class | Anchor | Required semantic evidence |
| --- | --- | --- | --- |
| `idle` | `grounded-subtle-loop` | morphology policy | neutral start, subtle secondary motion, canonical return |
| `running-right` | `grounded-locomotion` | morphology policy | alternating contact and passing poses, right-facing gait |
| `waving` | `grounded-gesture` | morphology policy | raised limb, readable peak, return |
| `jumping` | `airborne-arc` | action-relative root | takeoff, airborne peak, landing, return |
| `failed` | `grounded-state-loop` | morphology policy | readable dejection/failure beat without collapse outside cell |
| `waiting` | `grounded-subtle-loop` | morphology policy | patient secondary motion distinct from idle |
| `running` | `grounded-work-loop` | morphology policy | focused working motion, not directional travel |
| `review` | `grounded-state-loop` | morphology policy | readable inspection/review motion distinct from waiting |

Quality profiles contain separate threshold groups for `identity`, `groundedCompact`, `groundedElongated`, `floating`, `airborne`, `crossAction`, and `atlas`. A compact grounded contact threshold is never applied unchanged to jumping, an elongated creature, or a floating character.

The morphology policy resolves as follows:

- compact grounded bipeds/quadrupeds use the shared lower body root and visible contact baseline;
- elongated quadrupeds use a shared silhouette envelope, torso/root center, and ground-contact band so tail or nose extension does not shrink the body;
- floating characters use a shared core centroid and anatomical scale with an allowed bounded hover trajectory, never a fabricated feet baseline;
- `jumping` uses its airborne action-relative root policy regardless of the normal grounded policy.

## 14. Combined Quality Gate

### 14.1 Deterministic checks

Every candidate records:

- output count and dimensions;
- empty/unused cell correctness;
- source-sheet and processed-frame edge contact;
- paste clamping;
- alpha contamination and transparent RGB residue;
- connected component count;
- body scale coefficient of variation;
- normalized anchor/root standard deviation;
- cross-action profile scale drift;
- identity color and descriptor distance;
- centroid, baseline, size, and visible-area variation;
- repeated/static and transform-only motion;
- action-specific semantic motion;
- loop closure;
- direction and approved-mirror validity.

Scale and anchor drift used as generation-quality signals are measured from raw cleaned cells before profile scale or anchor translation. Processed-frame measurements are recorded separately to prove runtime placement. A processor cannot turn a failing raw generation metric into a passing generation metric by normalizing each frame.

For ordinary grounded character actions, the initial strict limits include:

- `bodyScaleCv <= 0.08`;
- `anchorYStd <= 0.05`;
- `crossActionScaleDrift <= 0.08`;
- zero empty used cells;
- zero source/output edge-touching frames;
- zero paste-clamped frames.

Exact calibrated values remain profile-owned and must be bound to human-review evidence before replacing defaults.

### 14.2 Hatch Pet visual evaluation

Only code-QA-passing candidates reach visual evaluation. The evaluator receives one review board with:

- source identity;
- canonical master;
- ordered candidate frames;
- one adjacent accepted action sample when cross-action comparison is needed;
- bounded deterministic metrics.

It returns strict structured scores for identity, action readability, cross-frame consistency, cross-action consistency, small-scale readability, style fidelity, and overall visual quality, plus fixed defect codes and bounded evidence.

### 14.3 Selection rule

| Code QA | Model evaluation | Candidate result |
| --- | --- | --- |
| pass | pass | eligible for selection |
| fail | any/not-run | rejected |
| pass | repair/reject | rejected and eligible to inform repair |
| pass | cannot-evaluate twice | rejected fail-closed |

The best candidate is selected only from eligible candidates. There is no "least bad" acceptance path.

## 15. State Machine And User Feedback

### 15.1 States

```text
draft
  -> planning
  -> generating_canonical_candidates
  -> evaluating_canonical
  -> building_anchor_grids
  -> generating_action_candidates
  -> processing_action_candidates
  -> evaluating_action_candidates
  -> locking_scale_profile
  -> composing_package
  -> evaluating_package
  -> ready_for_review
  -> approved
  -> imported
  -> activated
```

Terminal/suspended states remain `failed`, `cancelled`, `budget_exhausted`, `awaiting_user_input`, and `paused`.

### 15.2 Progress contract

Every stage and action exposes:

- current state and human-readable label;
- attempt number and maximum;
- selected Provider/model without secrets;
- last completed operation;
- current operation;
- passed/rejected candidate counts;
- latest fixed failure reason and bounded explanation;
- next automatic action or required user action;
- elapsed time and remaining budgets;
- available raw/review assets.

No button may fail silently. Preview explains why it is unavailable. Creator Studio navigation explains when the service is not running. Retry identifies the exact scope it will invalidate.

## 16. Failure, Retry, Partial Import, And Asset Recovery

### 16.1 Action retry

Retrying one action:

- archives its current candidates, prompts, boards, processing evidence, evaluations, and checkpoint;
- preserves the canonical master, anchor grids, scale profile, and every other hash-valid accepted action;
- creates a new action attempt revision;
- regenerates `running-right` when the requested scope is `running-left`;
- rebuilds derived atlas and review artifacts;
- stops at `ready_for_review` or explicit failure.

### 16.2 Identity retry

Retrying identity:

- archives the complete prior identity revision;
- creates a fresh three-candidate canonical pool;
- invalidates anchor grids, scale profile, every action checkpoint, atlas, and approvals tied to the old identity hash;
- preserves old paid artifacts in the review history.

### 16.3 Partial import

When accepted `idle` exists, the user may import a partial pack containing accepted actions. Omitted rows remain transparent and runtime fallback uses the accepted idle action while reporting the originally requested action.

When `idle` does not pass, OpenPet must not create a misleading pet pack with a synthetic or mislabeled idle placeholder. It instead offers an asset-recovery bundle containing every usable/rejected image, processed frame, prompt, metric, and explanation. The bundle is reviewable/exportable but not importable as a runnable pet.

### 16.4 Failed-asset review

The review bench groups assets by identity revision, action, candidate, and processing stage. It shows:

- raw Provider output;
- cleaned sheet;
- processed contact sheet/GIF when available;
- deterministic metrics and failure codes;
- model evaluation;
- compiled prompt and reference-board description;
- whether the asset is reusable, reprocessable, retryable, importable, or evidence-only.

Absolute paths, credentials, raw Provider payloads, and secret-bearing URLs are never exposed.

## 17. Artifact And Provenance Contract

Each candidate writes:

```text
runs/<runId>/
  sprite-plan.json
  identity/<revision>/
    candidates/<candidateId>/raw-image.png
    candidates/<candidateId>/code-qa.json
    candidates/<candidateId>/model-evaluation.json
    master.png
    master-meta.json
  anchor-grids/<canonicalHash>/<layoutId>/
    anchor-grid.png
    anchor-grid-meta.json
  actions/<actionId>/<attemptRevision>/candidates/<candidateId>/
    reference-board.png
    reference-board-meta.json
    prompt-used.txt
    image-task.json
    provider-evidence.json
    raw-sheet.png
    raw-sheet-clean.png
    processed-sheet.png
    frames/*.png
    contact-sheet.png
    preview.gif
    processor-meta.json
    code-qa.json
    model-evaluation.json
    candidate-result.json
  profiles/character-scale-profile.json
  checkpoints/actions.json
  review/final-contact-sheet.png
  review/final-preview.gif
  review/failed-assets.json
  output/pet.json
  output/spritesheet.webp
```

Every metadata file includes a schema version, safe relative paths, SHA-256 hashes, plan revision, canonical identity hash, quality-profile evidence, processor/compiler versions, Provider/model provenance, timestamps, and public failure codes.

## 18. Code Ownership And File Changes

### 18.1 New focused modules

| File | Responsibility |
| --- | --- |
| `src/main/services/hatch-pet-sprite-planner.js` | Structured asset-plan request, validation, legal model/image-model choices |
| `examples/plugins/creator-studio/lib/sprite-asset-plan.js` | Immutable plan schema, action classifications, budgets, revisions |
| `examples/plugins/creator-studio/lib/character-anchor-grid.js` | Repeat accepted canonical master into deterministic layout-specific grids |
| `examples/plugins/creator-studio/lib/action-reference-board.js` | Compose one anchor-grid plus source-detail reference image and metadata |
| `examples/plugins/creator-studio/lib/sprite-frame-processor.js` | Grid split, alpha cleanup, components, shared scale, anchor placement, frame output |
| `examples/plugins/creator-studio/lib/character-scale-profile.js` | Create, validate, hash, and apply the cross-action scale profile |
| `examples/plugins/creator-studio/lib/sprite-candidate-qa.js` | Candidate technical, identity, scale, anchor, motion, and semantic QA |
| `examples/plugins/creator-studio/lib/sprite-candidate-store.js` | Candidate artifacts, hashes, immutable result records, archive/revision handling |
| `examples/plugins/creator-studio/lib/quality-first-action-runner.js` | Two-candidate pool, repair candidate, selection, checkpoint result |
| `src/main/services/hatch-pet-sprite-evaluator.js` | One-board visual evaluation schema and validation |

### 18.2 Existing modules to modify

| File | Required change |
| --- | --- |
| `src/main/services/hatch-pet-agent-service.js` | Execute the new plan/evaluation states; remove shadow-only assumptions from the enabled production path |
| `src/main/services/creator-workflow-service.js` | Surface new stages, candidate progress, partial import and asset-recovery results |
| `src/main/services/image-generation-model-service.js` | Preserve exactly-one reference/output, typed canvas, deadlines, same-model transient retry, logical stage evidence |
| `examples/plugins/creator-studio/lib/provider-image-task.js` | Add typed anchor policy, action class, unused cells, component/effect/scale policy; keep strict allowlists |
| `examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js` | Compile the new self-contained grid brief and remove internal-role wording |
| `examples/plugins/creator-studio/lib/action-sheet-layout.js` | Become the single fixed multi-row layout owner; add exact unused-cell metadata and character-square canvas contract |
| `examples/plugins/creator-studio/lib/pet-generation-quality-profile.js` | Upgrade to v2 identity/morphology/airborne/cross-action/atlas groups |
| `examples/plugins/creator-studio/lib/full-pet-row-qa.js` | Delegate common candidate metrics or consume candidate QA output; retain official row semantics |
| `examples/plugins/creator-studio/lib/full-pet-action-checkpoints.js` | Bind checkpoint reuse to plan revision, canonical hash, scale-profile hash, processor version, profile evidence, and frame hashes |
| `examples/plugins/creator-studio/lib/full-pet-atlas-composer.js` | Consume only accepted processed frames; preserve fixed atlas contract |
| `examples/plugins/creator-studio/lib/host-model-bridge.js` | Reduce to Provider/Creator integration and call focused identity/action runners instead of owning the full algorithm |
| `examples/plugins/creator-studio/lib/backend-runner.js` | Drive new durable stages, leases, repairs, and recovery |
| `src/shared/openpet-contracts.ts` | Add plan, candidate, progress, failure, review, recovery-bundle, and scale-profile public views |
| `src/control-center/src/hooks/useCreatorPane.ts` | Poll and invoke the new retry/import/export capabilities |
| `src/control-center/src/panes/CreatorPane.tsx` | Show candidate/state progress, failed assets, why-bad evidence, prompts, retries, partial import, recovery export |
| `src/control-center/src/styles.css` | Add bounded responsive candidate/review layouts without nested cards |
| `docs/pet-character-generation.md` | Replace current generation stages with this implemented architecture after cutover |

### 18.3 Modules removed after verified cutover

Delete only after all callers and tests have migrated:

- action start/peak keyframe generation functions and prompt/artifact contracts in `host-model-bridge.js`;
- keyframe-specific reference-board composition used only by the removed final-row chain;
- keyframe-row branches in `action-frame-builder.js` that require a Provider-generated single-row deliverable;
- obsolete action-anchor/start/peak prompt builders in `anchor-prompt-builder.js`;
- any duplicate row-layout logic outside `action-sheet-layout.js` after it becomes the single contract owner;
- tests that assert the removed keyframe/`1xN` pipeline rather than target behavior;
- obsolete schema fields, role strings, docs, fixtures, and compatibility adapters with no remaining caller.

The existing modules must be searched before deletion. Any path still used by an unrelated single-action non-character feature is retained only for that proven caller and renamed to reflect its narrower ownership.

## 19. Migration Sequence

The rewrite lands through reviewable vertical slices while only one production path exists at final cutover.

1. Add frozen plan/grid/action-policy contracts and tests without routing production generation.
2. Add deterministic anchor-grid, reference-board, processor, scale-profile, and QA modules with fixture-based tests.
3. Implement canonical candidate pool and evaluator while preserving the current external workflow result contract.
4. Implement one action end to end (`idle`) using multi-row candidates, profile creation, combined gates, provenance, and review UI.
5. Extend to the remaining official actions and approved mirror.
6. Add partial import, asset recovery, repair revisions, and durable resume against the new checkpoints.
7. Route all production full-pet generation to the new pipeline.
8. Delete the replaced keyframe/single-row pipeline and update documentation/fixtures.
9. Run independent automated verification on the final integrated commit.
10. Run real Provider generation and one-shot visual-agent review on an isolated test branch.
11. Require human review of every action, contact sheet, GIF, and final atlas before any Provider approval or production-art-ready claim.

There is no user-facing legacy-mode toggle. Before step 7, the new path is unreachable production code under focused development. At step 7 the route changes atomically; step 8 removes the old internals before merge readiness.

## 20. Test And Verification Contract

### 20.1 Automated unit and integration coverage

Required tests include:

- plan strict schema, illegal fields, unsafe directives, action-class/layout mismatch, and one schema repair;
- exact grid mapping for 4/5/6/8 frames and unused-cell handling;
- anchor-grid geometry, fixed scale/root/baseline, deterministic hashes, and transparent unused cells;
- exactly one composite Provider reference and `n=1` for canonical/action/repair requests;
- compiler output contains no internal terms and includes complete self-contained visual instructions;
- raw grid split order, alpha cleanup, component selection, transparent RGB cleanup, and no cross-cell leakage;
- shared scale and feet alignment without per-frame bbox fitting;
- jumping uses profile anatomy without grounded feet rejection;
- body scale CV, anchor stddev, cross-action drift, edge touch, empty cell, clamp, static motion, semantics, and loop closure failures;
- two initial candidates are both generated/evaluated before selection;
- only dual-pass candidates are selectable and deterministic tie-breaking is stable;
- one reason-directed repair and no fourth creative attempt;
- required idle failure, optional omission, running pair atomicity, and continued later-action generation;
- checkpoint reuse requires matching plan/canonical/profile/processor/quality/frame hashes;
- identity repair invalidates all dependent artifacts; action repair invalidates only its scope;
- partial import requires accepted idle; idle failure produces recovery bundle only;
- every rejected paid asset remains reviewable with prompt and safe evidence;
- stale-run recovery preserves completed candidate/checkpoint artifacts;
- no secret, absolute path, credential/query/fragment URL, or raw Provider payload reaches renderer/evidence;
- old keyframe/single-row production functions have no callers after deletion.

### 20.2 Repository verification

The independent test branch runs:

```bash
npm run check:syntax
npm run test:core
npm run test:control-center
npm run test:core:all
```

Focused suites must run before repository-wide suites and report exact pass/fail counts. Development tasks write the tests; the user-requested independent test task executes and records them.

### 20.3 Real Provider verification

Real verification must prove:

- every canonical/action/repair request uses `/images/edits`, one `image` field, one reference, and `n=1`;
- multi-output responses fail closed;
- three canonical candidates and two action candidates are actually compared;
- anchor-grid identity, scale, and root survive Provider generation;
- scale profile is reused across all compatible actions;
- a failed action is visible, explainable, and retryable without losing accepted assets;
- partial import and recovery bundle behavior match the idle rule;
- final contact sheets, GIFs, processed frames, and atlas contain the actual Provider outputs.

### 20.4 Visual verification isolation

Image generation, image viewing, GIF/contact-sheet inspection, and artistic assessment occur only in an isolated test task. Every image-quality review is delegated to a fresh one-shot visual subagent; the subagent is discarded after that review. Raw images are not loaded into the long-running development task context.

The visual reviewer checks identity, anatomical scale, root stability, motion readability, loop closure, small-size readability, action distinction, background/edge contamination, and final atlas framing. A transport success or automated score is not visual acceptance.

## 21. Acceptance Criteria

The redesign is complete only when all of the following are true:

1. The production full-pet path no longer generates separate action start/peak keyframes or raw single-row character deliverables.
2. Every action is generated as the exact fixed multi-row grid and assembled deterministically into runtime rows.
3. Every request carries one reference image and requests one output.
4. Canonical identity is selected from three independently generated, dual-gated candidates.
5. Every action compares two initial candidates and permits at most one reason-directed repair candidate.
6. Every accepted action is bound to the accepted canonical hash and shared scale-profile hash.
7. Grounded body scale CV, anchor drift, edge, clamp, empty-cell, semantic, identity, and cross-action drift gates are enforced without per-frame fit normalization.
8. Jumping uses an airborne policy rather than the grounded feet gate.
9. All generated/rejected assets, prompts, boards, metrics, evaluations, models, and hashes remain inspectable.
10. Failed optional actions can be retried independently and do not discard accepted actions.
11. Partial import requires a real accepted idle row; otherwise only an asset-recovery bundle is offered.
12. The old pipeline, obsolete tests, unused role strings, duplicate layout code, and compatibility wrappers are removed.
13. Independent automated verification passes on the final integrated commit.
14. A real Provider run reaches `ready_for_review` with visual evidence for every accepted action.
15. A human explicitly approves before import or activation.

Until criteria 13 through 15 are satisfied, the correct claim remains `implemented but unverified`, never `production-art-ready`.

## 22. Explicit Non-Goals

- No general-purpose autonomous filesystem or shell agent.
- No automatic artistic approval, import, or activation.
- No threshold weakening in response to failures.
- No permanent legacy generation mode.
- No runtime FX layer in this rewrite.
- No multi-reference Provider requests.
- No local interpolation, transform-only motion fabrication, or copied-idle substitution for missing actions.
- No claim that Agent Sprite Forge's magenta background is universally superior; OpenPet keeps native transparency first and uses bounded background cleanup only when required.
- No Provider-specific prompt fork unless a proven API contract requires transport-level adaptation; visual intent remains Provider-neutral.

## 23. Design Rationale

The previous chain invested Provider calls in independently generated keyframes and then conditioned a final sheet on those generated intermediates. That can compound identity drift and still leaves the final sheet vulnerable to pose, scale, and cell-consistency failure. The replacement spends a comparable bounded call budget on candidate comparison while using one accepted canonical master and deterministic anchor grids as the stable parent for every action.

The design does not copy Agent Sprite Forge's simple prompt builder or magenta-first assumption. It adopts the mechanisms that explain its consistency: explicit asset planning, multi-row generation, repeated anchor layouts, shared scale, deterministic processing, specialized anchors, strict regeneration signals, and complete provenance. OpenPet contributes the stronger host security, Provider-neutral compilation, identity evidence, state recovery, partial packaging, failed-asset UX, and approval governance.

This combination makes quality a property of the complete production system rather than a hope placed in one prompt.
