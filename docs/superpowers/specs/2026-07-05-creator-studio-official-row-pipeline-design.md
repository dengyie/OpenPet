# Creator Studio Official Full-Pet Row Pipeline Design

Date: 2026-07-05
Status: Proposed
Owner: dev8
Scope: Implement official-quality full-pet action generation for Creator Studio without overclaiming preview fallback output

## 1. Goal

Creator Studio currently supports a technically importable full-pet pack:

```text
reference image
  -> provider base image
  -> technical atlas preview
  -> pet-pack QA/import
```

That path is useful for identity preview, but it is not official-quality action generation. The next milestone adds a separate official-quality full-pet pipeline:

```text
canonical base image
  -> state-specific generated row strips
  -> optional approved running-left mirror
  -> deterministic frame extraction
  -> stable slot correction only when extraction causes popping
  -> atlas composition
  -> atlas validation
  -> contact sheet and GIF previews
  -> row-level QA classification
  -> import only with honest coverage metadata
```

The deliverable is a code path that can generate, package, and QA all nine Codex rows as real row sources when provider outputs exist, while preserving the economical preview path as explicitly low-fidelity fallback.

## 2. Current Context

Relevant existing modules:

- `examples/plugins/creator-studio/lib/backend-runner.js`
- `examples/plugins/creator-studio/lib/host-model-bridge.js`
- `examples/plugins/creator-studio/lib/real-atlas-builder.js`
- `examples/plugins/creator-studio/lib/full-pet-basic-actions.js`
- `examples/plugins/creator-studio/lib/full-pet-qa.js`
- `src/main/services/creator-workflow-service.js`
- `src/main/services/image-generation-model-service.js`

Current state after `d70450fc`:

- base-only full-pet output is marked as preview/fallback coverage;
- local translate/scale motion variants are no longer used to manufacture action rows;
- `basicActions.realActionIds` remains empty for base-only output;
- `missingRequiredOfficialActionIds` records the official row gap;
- Create UI labels official coverage separately from preview reuse.

Official hatch-pet reference rules:

- atlas: `1536x1872`, 8 columns x 9 rows, cell `192x208`;
- rows: `idle`, `running-right`, `running-left`, `waving`, `jumping`, `failed`, `waiting`, `running`, `review`;
- normal full-pet run: base plus nine row-strip jobs;
- only deterministic derivation: approved framewise mirror from generated `running-right` to `running-left`;
- no local base-image transform may count as real action generation.

## 3. Non-Goals

This milestone does not:

- guarantee provider uptime, quota, or model quality;
- claim human art-quality approval without a human review record;
- support multi-view generation or view fusion;
- change Codex atlas dimensions or row semantics;
- redesign the Creator Studio dashboard;
- move provider credentials out of the host service;
- replace single-action generation.

Provider smoke and human contact-sheet approval remain Manual-required for production asset claims.

## 4. Approaches Considered

### Recommended: row-strip-first pipeline

Generate one row-strip image per official state, then run deterministic extraction and atlas composition. This matches hatch-pet, gives QA a real row artifact to inspect, and cleanly separates provider failures from extraction/composition failures.

Trade-off: it costs more provider calls and needs more run state.

### Alternative: ask provider for a complete atlas

Ask the model to output a `1536x1872` atlas directly. This looks simpler but makes individual row repair, slot validation, stable anchoring, and unused-cell transparency much harder to trust.

Trade-off: fewer calls, weaker QA and repairability.

### Alternative: generate individual frames

Ask the model for each frame as a separate image. This gives precise per-frame control but greatly increases calls and identity drift risk.

Trade-off: most controllable, too expensive for the first official pipeline.

## 5. Recommended Architecture

Add a row-pipeline layer inside Creator Studio:

```text
host-model-bridge
  -> full-pet-row-jobs
  -> full-pet-row-generator
  -> full-pet-row-extractor
  -> full-pet-atlas-composer
  -> full-pet-row-qa
  -> real-atlas-builder
```

The host bridge keeps provider calls and secrets host-owned. Creator Studio owns prompts, run records, row manifests, deterministic image processing, QA artifacts, and import handoff.

New helper modules should be small and testable:

- `full-pet-row-contract.js`: official rows, durations, quality labels, row counts.
- `full-pet-row-jobs.js`: create and normalize row job manifests.
- `full-pet-row-generator.js`: call the existing host model bridge for ready row jobs.
- `full-pet-row-extractor.js`: extract cells from row strips into `192x208` PNG frames.
- `full-pet-atlas-composer.js`: compose frames into the fixed Codex atlas.
- `full-pet-row-qa.js`: classify rows and reject transform-like or unstable rows.

`real-atlas-builder.js` should remain the preview/base compatibility builder unless a complete official row package is supplied.

## 6. Row Job Manifest

Each full-pet run writes:

```text
runs/<runId>/qa/full-pet-row-jobs.json
```

Manifest shape:

```json
{
  "version": 1,
  "mode": "official-full-pet",
  "base": {
    "sourceRelativePath": "runs/run-1/frames/base/0001.png",
    "canonicalReferenceRelativePath": "runs/run-1/references/canonical-base.png"
  },
  "jobs": [
    {
      "actionId": "idle",
      "status": "pending",
      "frameCount": 6,
      "durations": [280, 110, 110, 140, 140, 320],
      "promptRelativePath": "runs/run-1/prompts/rows/idle.txt",
      "outputRelativePath": "runs/run-1/rows/idle/strip.png",
      "quality": "pending"
    }
  ]
}
```

`running-left` may use:

```json
{
  "actionId": "running-left",
  "status": "derived",
  "derivation": {
    "type": "approved-mirror",
    "sourceActionId": "running-right",
    "decisionNote": "Mirroring preserves markings and prop orientation."
  },
  "quality": "approved-mirror"
}
```

No other row may be derived.

## 7. Generation Flow

Full-pet official mode proceeds in this order:

1. Generate or reuse canonical base image.
2. Create row job manifest for all nine rows.
3. Generate `idle` and `running-right` first for identity and gait checks.
4. Decide whether `running-left` can be derived by approved framewise mirror.
5. Generate remaining rows.
6. Extract row strips into cell frames.
7. Run QA and compose atlas.
8. Write `pet.json`, `spritesheet.webp`, QA JSON, contact sheet, and GIF previews.

If any required official row fails, the run may still produce a preview pack, but it must not set `quality: row-real` or remove the row from `missingRequiredOfficialActionIds`.

## 8. Prompt Contract

Row prompts must be concise and state-specific. They must include:

- same pet identity, style, face, markings, palette, proportions, and props as canonical base;
- row action semantics from the official contract;
- exact frame count and row-strip layout expectations;
- transparent-friendly plain background;
- no text, UI, guide marks, loose effects, shadows, or scene backgrounds;
- complete body in each frame slot.

The `running` row must mean active task work, not directional foot-running. Directional locomotion belongs only to `running-right` and `running-left`.

## 9. Extraction And Composition

The deterministic processing path should follow official hatch-pet script ideas while staying inside OpenPet's Node tooling:

- connected-component extraction where possible;
- equal-slot fallback only when the row strip is visually valid;
- `stable-slots` style correction only for extraction-induced baseline or size popping;
- framewise mirror for approved `running-left`;
- atlas validation for dimensions, alpha, visible pixels, transparent unused cells, and transparent RGB residue.

Outputs:

```text
runs/<runId>/rows/<actionId>/strip.png
runs/<runId>/frames/official/<actionId>/<frame>.png
runs/<runId>/qa/full-pet-row-validation.json
runs/<runId>/qa/full-pet-contact-sheet.png
runs/<runId>/qa/previews/<actionId>.gif
runs/<runId>/outputs/spritesheet.webp
```

## 10. QA Gates

Technical row QA must record:

- `actionId`
- `quality`: `row-real`, `approved-mirror`, or `preview-fallback`
- frame count and expected count;
- visible-pixel count per frame;
- unique frame count;
- centroid drift;
- baseline drift;
- bounding-box size drift;
- source classification;
- extraction method;
- warnings and blocking errors.

Official-quality row acceptance requires:

- decoded row strip exists;
- all expected frames are visible;
- unused atlas cells are transparent;
- row is not generated by local base-image translate/scale/crop;
- row has enough frame variation for its semantics;
- anchor metrics stay within row-specific tolerances;
- identity is not obviously lost according to available deterministic checks;
- manual visual QA remains required before production art-quality claims.

## 11. Coverage Contract

`basicActions` keeps legacy fields for compatibility and adds official fields:

```json
{
  "baseIdentityCoverage": true,
  "requiredRealActionIds": [],
  "realActionIds": ["idle", "running-right"],
  "fallbackActionIds": ["waiting"],
  "missingRequiredActionIds": [],
  "requiredOfficialActionIds": ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"],
  "previewFallbackActionIds": ["waiting"],
  "missingRequiredOfficialActionIds": ["running-left", "waving", "jumping", "failed", "waiting", "running", "review"],
  "rows": [
    {
      "actionId": "idle",
      "sourceActionId": "idle",
      "sourceRelativePath": "runs/run-1/rows/idle/strip.png",
      "fallback": false,
      "quality": "row-real"
    }
  ]
}
```

Only `row-real` and `approved-mirror` count as official `realActionIds`.

## 12. Error Handling

Use explicit failure classes:

- `row_generation_failed`: provider did not return a usable row source.
- `row_decode_failed`: source cannot be decoded.
- `row_extraction_failed`: strip cannot be split into required frames.
- `row_anchor_unstable`: centroid, baseline, or size drift exceeds tolerance.
- `row_transform_like`: frames look like local transforms of one base image.
- `row_semantics_unverified`: deterministic checks pass, but visual QA is still needed.

Provider or gateway failures should leave row jobs failed without corrupting the base preview pack. Official-quality import claims must remain blocked until required official rows pass.

## 13. UI And Product Contract

Create and Creator Studio review surfaces should expose:

- economical preview mode: base identity plus preview fallback rows;
- official-quality mode: higher cost, row-specific generation, row QA results;
- official coverage count;
- missing official rows;
- contact sheet and GIF preview artifact links;
- clear note that production art-quality approval requires human review.

The ordinary one-click default can stay economical until the user opts into official-quality generation or the product later promotes it as the default.

## 14. Testing Strategy

Use TDD for implementation.

Required test groups:

- `full-pet-row-jobs.test.js`: manifest creation, row order, mirror eligibility, no derived rows except `running-left`.
- `full-pet-row-extractor.test.js`: strip extraction, equal slot fallback, transparent unused cells, invalid strip rejection.
- `full-pet-row-qa.test.js`: anchor metrics, transform-like row rejection, repeated/static row rejection, quality classification.
- `real-atlas-builder.test.js`: official row package composes atlas and coverage correctly.
- `host-model-bridge.test.js`: full-pet official mode requests row strips and does not use unverified fallback models.
- `creator-workflow-service.test.js`: official coverage reaches Create result without leaking paths.
- docs tests: active docs must not claim official coverage without row-real or approved-mirror evidence.

Verification spine:

```sh
node --test tests/examples/creator-studio-full-pet-basic-actions.test.js \
  tests/examples/creator-studio-real-atlas-builder.test.js \
  tests/examples/creator-studio-full-pet-row-jobs.test.js \
  tests/examples/creator-studio-full-pet-row-qa.test.js \
  tests/services/creator-workflow-service.test.js
npm run check:docs-drift
npm run check:syntax
npm test
```

## 15. Rollout Plan

Phase 1: deterministic row package and QA

- add row contract, job manifest, extraction, QA, and atlas composition from fixture/generated row strips;
- no provider calls beyond existing base image path;
- prove official coverage only comes from `row-real` or `approved-mirror`.

Phase 2: provider row generation

- extend host model bridge to request row strips for official mode;
- add retry and timeout behavior per row;
- preserve economical fallback mode.

Phase 3: review surface and smoke

- expose contact sheet/GIF artifacts;
- update dashboard/Create result with official row coverage;
- run provider smoke only if provider behavior or support claims change.

## 16. Acceptance Criteria

The milestone is complete when:

- official row package fixtures can produce a valid `1536x1872` atlas;
- all nine rows can be classified as `row-real` or `approved-mirror` from real row sources in deterministic tests;
- base-only output still imports as preview but leaves official missing rows visible;
- transform-like or repeated rows cannot pass as official quality;
- `running-left` mirror preserves frame order and is the only allowed deterministic derivation;
- `basicActions` correctly reports official coverage through Creator Workflow;
- docs and UI copy remain honest about preview versus official quality;
- `npm test`, `npm run check:syntax`, and `npm run check:docs-drift` pass.

## 17. Manual-Required

- Real provider credentials and reachable gateway for row-strip generation smoke.
- Human visual QA of contact sheets and GIF previews.
- Human approval before claiming generated pet art is production quality.
- Product decision before promoting official-quality mode as the default one-click path.
