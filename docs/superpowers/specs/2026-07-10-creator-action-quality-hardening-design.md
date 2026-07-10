# Creator Action Quality Hardening Design

**Date:** 2026-07-10

**Goal:** Make both existing-pet action generation and one-click new-pet generation produce provider-authored, identity-faithful, semantically readable, stable action sprites that cannot pass QA through technical variation alone.

## Non-Negotiable Contract

- The user source image is the highest identity authority.
- Every deliverable action frame must originate from one complete provider-generated sprite sheet.
- Local code may build a single conditioning board, split the provider sheet, normalize frame placement, stabilize anchors, inspect quality, and package output.
- Local code must never invent, interpolate, patch, duplicate, or complete missing action motion.
- Every final provider call accepts at most one image: a fixed conditioning board containing the user source, provider start keyframe, and provider peak keyframe.
- Failed identity, action, alpha, crop, layout, or stability QA blocks review and import.

## Unified Action Semantics

Action classification must live in one shared module and produce a normalized motion contract:

- `stationary_loop`: local appendage or expression motion with a locked root.
- `locomotion_loop`: a complete in-place gait cycle with meaningful limb-silhouette changes.
- `vertical_bounce`: anticipation, airborne peak, landing, and baseline recovery.
- `pose_transition`: readable start, transition, and end poses.
- `reaction`: anticipation, reaction peak, and recovery.
- `emote`: local face/head expression change with stable body placement.

The classifier uses explicit `animationType` first, then action id, name, and motion prompt. Prompt builders, keyframe generation, full-pet generation, and QA must consume this same contract so `running` cannot fall back to stationary wording.

## Provider Generation Flow

For every single action and every official full-pet row:

1. Generate a provider start keyframe from the user source image.
2. Generate a provider peak keyframe from the same user source image.
3. Validate both keyframes for decodability, full-body safe margin, usable foreground, and identity-compatible appearance.
4. Build one fixed 1024x1024 conditioning board containing source, normalized start, and normalized peak panels with a shared lower-center anchor.
5. Ask the provider for one complete square sprite grid using the exact frame count and grid layout.
6. Split the provider output into frames without stretching character proportions.
7. Run deterministic QA and reject the row if any hard gate fails.

`running-left` may be derived only by framewise mirroring from an accepted `running-right` provider row. It is the sole approved local action transform.

## Grid Contract

Provider output remains 1024x1024. Frame layouts therefore use compact square grids rather than horizontal strips:

- 4 frames: 2x2
- 5-6 frames: 3x2
- 7-8 frames: 4x2
- other supported counts: at most 4 columns, enough rows to hold every frame

Unused cells must remain empty. Extraction uses exact grid geometry and `fit: contain`; it must not use `fit: fill` or otherwise distort provider pixels.

## Quality Gates

### Technical integrity

- exact frame count and expected grid
- every frame decodes and contains visible foreground
- transparent or safely removable uniform edge background
- no character touching unsafe cell edges
- no repeated/reused frames
- stable size, baseline, centroid, and lower-center root

### Identity consistency

- stable alpha silhouette proportions
- stable coarse foreground color distribution
- stable identity-core appearance across adjacent frames
- no large frame-to-frame redesign of the face/body core

### Motion semantics

- motion must include spatial silhouette change, not only color or texture changes
- stationary actions require localized motion while preserving root and body core
- locomotion requires multiple materially different limb/body silhouettes across the cycle
- vertical actions require vertical pose progression and return to baseline
- pose transitions/reactions require a measurable start-to-peak pose difference

These gates are deterministic rejection filters, not a claim of aesthetic perfection. Provider outputs that pass remain subject to visual review, but obviously static, recolored, cropped, distorted, identity-drifting, or non-transparent outputs cannot be labeled `row-real`.

## Failure Handling And Evidence

Each provider stage records model, timeout, reference role, prompt path, output path, and error. Keyframe or final-sheet failure preserves prior evidence and fails the action. A full-pet run fails when any required official row is absent or rejected. No preview or base-only output may be imported as official-quality coverage.

## Testing Strategy

- Prompt tests prove inferred running/jumping semantics and action-specific keyframe plans.
- Bridge tests prove every full-pet action performs start, peak, and final single-board calls.
- Grid tests prove 4-8 frame square layouts split without aspect-ratio distortion.
- QA tests reject recolor-only running, opaque sheets, missing motion, identity drift, crop, and anchor instability.
- Existing provider-only and no-local-synthesis tests remain mandatory.

## Acceptance Criteria

- Custom `running` is described as `locomotion_loop` with a gait-cycle contract.
- Every official generated full-pet row uses its own single conditioning board.
- No official row requests an 8-cell horizontal strip inside a square image.
- Recolor-only or texture-only running fails QA.
- Opaque final action sheets fail QA unless edge-background removal creates a verified cutout.
- Valid provider sheets remain provider-authored after splitting and normalization.
- Targeted tests, tooling tests, syntax checks, and diff checks pass.

## Final Implemented Boundaries

- All normalized `single-action` tasks use canonical provider keyframe synthesis, including legacy/direct host tasks that omitted an explicit synthesis marker.
- Provider multi-output frame sets, multi-sheet cell assembly, empty-cell reuse, and previous-frame duplication are rejected.
- Local normalization uses one shared sequence crop and transform. It preserves provider-authored vertical motion while removing local scale and anchor jitter.
- Any provider cell touching a grid edge is rejected. Alpha-mask, upper-mask, lower-mask, identity-core, and foreground-color evidence is persisted and checked.
- Recorded reference files must resolve inside the Creator Studio data directory, including realpath checks against symlink escape. A recorded 64-character SHA-256 must still match before upload.
- Official atlas frames must already be exactly `192x208`. The composer does not stretch or resize official frames.
- A base character preview is written only as `base-preview.webp`. It has `previewOnly: true`, QA `ok: false`, no animation rows, no `spritesheet.webp`, no `pet.json`, and no importable bundle.
- Missing, malformed, failed, or incomplete atlas QA is treated as missing all canonical official rows. Preview output cannot be approved, exported, or imported as a completed pet.
- Host smoke rejects failed provider stages, missing final output paths, incomplete official action coverage, and missing start/peak/final evidence per action.
- Provider keyframe failures retain the underlying timeout or business error in the outer failure message and persisted generation evidence.

## Verification Record

Fresh verification on `codex/dev8`:

- Action-focused integration suite: 126 passed.
- Creator Studio plugin suite: 87 passed.
- `npm run test:tools`: 491 passed.
- `npm run test:core`: 1216 passed.
- `npm run test:control-center`: 69 passed.
- `npm run check:syntax`: Node syntax, TypeScript typecheck, and Control Center production build passed.
- `git diff --check`: passed.
