# One-Click Action Generation Complete Chain

> Date: 2026-07-05
> Owner: dev8
> Status: implemented orchestration with a known full-pet animation-quality gap
> Scope: ordinary-user one-click creation plus advanced Creator Studio/Actions workflows

## Source Of Truth

OpenPet's Codex pet output must follow the official `hatch-pet` contract from `openai/skills`:

- Official skill: https://github.com/openai/skills/tree/main/skills/.curated/hatch-pet
- Contract reference: `skills/.curated/hatch-pet/references/codex-pet-contract.md`
- Row semantics: `skills/.curated/hatch-pet/references/animation-rows.md`
- QA rubric: `skills/.curated/hatch-pet/references/qa-rubric.md`

The official contract is stricter than "make an atlas with non-identical cells." A compliant full pet requires state-specific animation rows, stable extraction, contact-sheet/preview review, and row semantics that match the Codex app states.

## Current Truth

The host-owned one-click orchestration exists:

```text
reference image -> generate -> review/QA -> import -> activate in OpenPet
```

The current OpenPet implementation can package a technical `pet.json + spritesheet.webp` output, import it, and play the atlas at runtime. However, the current base-only full-pet path is **not** a complete official-quality action generator.

Current limitations:

- The default full-pet path only generates a base source image.
- Local geometric transforms of the base source are not valid substitutes for real row-strip generation.
- `uniqueFrameCount` proves cells differ, but it does not prove animation quality.
- `idle`, `running`, `running-right`, `jumping`, `waving`, `waiting`, `failed`, and `review` cannot be honestly accepted as generated semantic actions unless each row has its own generated row strip or approved row source.
- Existing golden-cat evidence proves technical import/playback, not final production action quality.

Archived Creator Workflow host-smoke evidence exists for this narrowed chain:

- `docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-38-29-834Z-dev8-acceptance/`
- `docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-56-30-104Z-main-acceptance/`

Those archives prove host orchestration, reference conditioning, technical pet-pack import, and existing-action import for the scoped scenarios. They do not by themselves prove production art quality or official-quality full-pet action rows.

## Official Codex Pet Contract

The atlas contract is fixed:

```text
spritesheet.webp or spritesheet.png
1536 x 1872
8 columns x 9 rows
192 x 208 per cell
transparent background
unused cells fully transparent
```

Rows and frame counts:

| Row | Action | Frames | Meaning |
| --- | --- | ---: | --- |
| 0 | `idle` | 6 | calm breathing/blinking loop |
| 1 | `running-right` | 8 | directional movement to the right |
| 2 | `running-left` | 8 | directional movement to the left |
| 3 | `waving` | 4 | greeting or attention gesture |
| 4 | `jumping` | 5 | anticipation, lift, peak, descent, settle |
| 5 | `failed` | 8 | error/sad/deflated reaction |
| 6 | `waiting` | 6 | blocked-on-user-input or approval pose |
| 7 | `running` | 6 | active task work, processing, thinking, scanning, or focused effort |
| 8 | `review` | 6 | focused inspection/thinking loop |

Important semantic rule: non-directional `running` is not foot-running. It represents active task work. Directional locomotion belongs to `running-right` and `running-left`.

## Official Generation Model

A normal full-pet run should be planned as up to 10 visual jobs:

1. Generate the canonical base pet.
2. Generate row strips for the nine states:
   - `idle`
   - `running-right`
   - `running-left`
   - `waving`
   - `jumping`
   - `failed`
   - `waiting`
   - `running`
   - `review`

Only one deterministic visual derivation is allowed:

- `running-left` is the only approved deterministic derivation: it may be framewise-mirrored from an approved `running-right` row.
- `running-left` may be derived by framewise mirroring `running-right`.
- This is allowed only after `running-right` has been generated, visually inspected, and explicitly approved as safe to mirror.
- The mirror must preserve frame order and timing.

Forbidden substitutions:

- Do not derive `waving`, `jumping`, `failed`, `waiting`, `running`, or `review` from `idle` or the base image.
- Do not use locally drawn, tiled, transformed, or code-generated row strips to replace missing visual generation.
- Do not accept a contact sheet where every used frame is only the reference image with small geometric transforms.

## Stable Animation And Anchoring

Runtime playback is simple atlas playback: the renderer switches background positions by row and column. It does not solve bad frame anchoring.

Therefore the generation pipeline must stabilize frames before import:

- Row strips should contain complete sprite poses in consistent slots.
- Extraction should produce `192x208` cells with a stable visual baseline.
- If preview GIFs show size popping or baseline jumps caused by extraction, rerun extraction with a row-stability method like official `stable-slots`.
- `stable-slots` is a correction for extracting already-generated row strips. It is not a way to manufacture actions from one base image.

OpenPet must add QA metrics that catch:

- excessive centroid drift for rows that should be anchored;
- unintended size popping;
- baseline jumps;
- repeated or near-static rows;
- rows made only from local transforms;
- wrong row semantics.

## User-Facing Modes

### Base-Only Economical Mode

Purpose: cheap new-pet creation and identity preview.

Allowed claims:

- creates/imports a new pet identity;
- provides a technical atlas preview;
- can use fallback rows for compatibility.

Forbidden claims:

- do not claim it generated complete high-quality actions;
- do not claim `running` or `jumping` is production-quality when sourced only from the base pose;
- do not hide that fallback rows are synthesized or low-fidelity.

This mode should either hide fallback-only rows from ordinary-user success copy or label them as preview/fallback rows.

### Official-Quality Full-Pet Mode

Purpose: complete Codex-compatible animated pet generation.

Official-quality full-pet output means base generation plus state-specific row-strip generation for every official row, except the approved `running-left` mirror case.

Requirements:

- generate base plus every required row strip, except approved `running-left` mirroring;
- attach the canonical base/reference images to row generation;
- run deterministic extraction, composition, validation, contact sheet, and preview GIF generation;
- perform visual QA before import/activation claims;
- repair the smallest failing scope: frame, row, then full atlas only if needed.

This mode costs more image-generation budget because real action quality requires real row images.

### Single-Action Advanced Mode

Purpose: generate or repair one explicit action for an existing pet.

This path remains separate from full-pet generation. It can use an action sheet or frame sequence, then import through the host-owned action bridge.

## Data Contract

`CreatorWorkflowResult.basicActions` should report coverage honestly. A base-only preview run has base identity coverage, but no official real action rows:

```json
{
  "baseIdentityCoverage": true,
  "requiredOfficialActionIds": ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"],
  "realActionIds": [],
  "previewFallbackActionIds": ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"],
  "missingRequiredOfficialActionIds": ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"],
  "rows": [
    {
      "actionId": "idle",
      "sourceActionId": "base-pose",
      "sourceRelativePath": "runs/run-1/frames/base/0001.png",
      "fallback": true,
      "quality": "base-preview"
    },
    {
      "actionId": "running",
      "sourceActionId": "base-pose",
      "sourceRelativePath": "runs/run-1/frames/base/0001.png",
      "fallback": true,
      "quality": "synthesized-preview"
    }
  ]
}
```

The current implementation keeps legacy `requiredRealActionIds`, `realActionIds`, and `missingRequiredActionIds` arrays for compatibility, but the default base-only path must leave legacy required/real coverage empty. Future official-quality rows should be reported as `real` only when they are generated row strips or approved row sources that pass row QA.

## Implementation Requirements

### Replace The Current Base-Transform Atlas Builder

The current local motion-variant implementation must not be the acceptance path for official full-pet generation.

Required changes:

- remove or quarantine transform-based row synthesis from official-quality flows;
- keep base-only fallback rows explicitly marked as low-fidelity preview rows if retained for compatibility;
- add stable anchor/centroid/baseline QA so heavy jitter fails tests;
- add transform-detection QA so a row made only from one base image plus scale/translate cannot pass as a real action.

### Add Hatch-Pet Style Row Pipeline

Creator Studio should add a full-pet row pipeline with these stages:

```text
base image
  -> row-strip generation jobs
  -> optional approved running-left mirror
  -> strip extraction
  -> stable-slots correction when needed
  -> frame inspection
  -> atlas composition
  -> atlas validation
  -> contact sheet + preview GIFs
  -> visual QA
  -> import
```

The row pipeline should be able to reuse the official script ideas:

- connected component extraction;
- equal slot fallback only when visually acceptable;
- stable slot extraction for baseline/size popping caused by extraction;
- framewise mirror for `running-left`;
- atlas validation for dimensions, alpha, unused cells, and transparent RGB residue.

### QA Gates

Technical QA must include:

- exact atlas dimensions;
- exact row/frame counts;
- non-empty used cells;
- transparent unused cells;
- no transparent RGB residue;
- visible-pixel validation;
- no unsafe filesystem paths;
- stable anchor metrics for rows that should not travel;
- row-level `uniqueFrameCount`;
- explicit source classification per row.

Visual QA must include:

- same pet identity across rows;
- no guide marks, text, UI, borders, scene backgrounds, or floating effects;
- no obvious size popping or baseline jumps;
- correct row semantics;
- directional rows face the correct direction;
- directional gait alternates rather than repeating an inert pose;
- `running` reads as active work/focus, not directional running;
- contact sheet is not merely base-image geometric transforms.

## Failure Triage

| Symptom | Likely owner | Meaning |
| --- | --- | --- |
| Pet jitters or shakes | Atlas generation / extraction QA | Frames lack a stable anchor or were created by translate/scale transforms |
| `running` looks static | Generation policy | Row was not generated as a semantic row strip |
| `waving` has only tiny whole-body motion | Generation policy | Gesture was not generated through paw/limb pose changes |
| Preview GIF size pops | Extraction pipeline | Use stable row extraction if the source strip is otherwise stable |
| Directional row faces wrong way | Row generation or mirror decision | Regenerate or mirror framewise with explicit approval |
| All rows look like the same pose | Product/QA gate | Base-only preview is being overclaimed as full action generation |
| `/images/edits` timeout or multipart failure | Provider/gateway | Request did not produce usable row images |
| Missing real row coverage | Full-pet generation | The pet may import for preview, but cannot be called official-quality full action output |

## Verification Spine

Run local deterministic verification for code/doc changes:

```sh
node --test tests/docs/live-docs-creator-studio.test.js
npm run check:docs-drift
npm run check:syntax
npm test
```

When provider behavior or row generation changes, add targeted tests before implementation:

```sh
node --test tests/examples/creator-studio-real-atlas-builder.test.js \
  tests/examples/creator-studio-host-model-bridge.test.js \
  tests/examples/creator-studio-full-pet-basic-actions.test.js
```

Real provider smoke is required only when support claims or provider-path behavior changes.

## Current Stable Path

Current verified path:

- one clean front-facing reference image;
- host-owned provider generation;
- technical import of a generated pet pack;
- existing-action generation and import for explicit single-action flows.

Current known gap:

- full-pet action rows are not yet official-quality unless they come from real row-specific generated sources and pass visual QA.

## Non-Goals

- Changing Codex atlas dimensions or row semantics.
- Claiming full action quality from a base-only economical run.
- Treating smoke success as art-quality proof.
- Hiding provider cost from users when official-quality row generation is requested.
