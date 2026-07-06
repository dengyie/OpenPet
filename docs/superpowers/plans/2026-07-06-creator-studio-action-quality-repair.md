# Creator Studio Action Quality Repair Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Creator Studio action generation so OpenPet does not approve or import fake, static, repeated, or preview-only action assets as production-ready actions.

**Architecture:** Split full-pet output into explicit preview-only and official-action quality levels, then make approval/import gates enforce the quality level. Add single-action motion QA so repeated frames, reused cells, and near-static sprite sheets fail before approval. Keep provider quota protected by testing the gates and raster processing offline before any real image-generation smoke.

**Tech Stack:** Node.js CommonJS modules, `sharp`, Node native test runner, existing Creator Studio run/output layout, existing OpenPet plugin bridge import flow.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/3c34/OpenPet` on branch `codex/dev8`.
- Do not edit the protected main worktree at `/Users/mango/project/codex/OpenPet`.
- Do not spend real image-generation quota until offline QA and approval/import gates pass.
- Atlas dimensions remain `1536x1872`, 8 columns x 9 rows, cell `192x208`.
- Official full-pet rows are exactly `idle`, `running-right`, `running-left`, `waving`, `jumping`, `failed`, `waiting`, `running`, and `review`.
- Only `running-left` may be deterministically derived, and only by approved framewise mirroring from generated `running-right`.
- Local base-image translate, scale, crop, repeated static frames, or code-generated row strips must not count as official action generation.
- Preview fallback output may exist for visual review, but provider full-pet preview fallback must not be approved/imported as a production pet pack.
- API keys and provider credentials remain host-owned and must not be exposed to renderer code or ordinary plugins.

---

## 1. Problem Statement

The current branch contains useful official-row infrastructure, but two production blockers remain:

1. Full-pet provider generation can produce a base-only preview atlas and still pass approval/import gates.
2. Single-action generation can reuse frames or produce near-static frames and still pass action-frame QA.

These are quality-gate failures, not only prompt failures. Prompt improvements are useful, but they cannot be the authority for whether an asset is safe to import. The authority must be deterministic QA plus approval/import gates.

## 2. Evidence And Root Cause

### P1: Full-Pet Preview Atlas Can Be Imported As If It Had Actions

Current path:

```text
provider full-pet run
  -> backend-runner.writeHostGeneratedStandardOutputs()
  -> buildRealAtlasFromGeneratedImage({ officialRows: null })
  -> base source copied into every Codex row as preview fallback
  -> atlas-validation.json ok=true
  -> approve/import allowed
```

Code evidence:

- `examples/plugins/creator-studio/lib/backend-runner.js`
  - `writeHostGeneratedStandardOutputs()` calls `buildRealAtlasFromGeneratedImage({ dataDir, generationResult, outputDir, qaDir })` without `officialRows`.
- `examples/plugins/creator-studio/lib/real-atlas-builder.js`
  - when `officialRows` is absent, `createPreviewCellBuffers()` repeats one source cell across all frames in each row.
- `examples/plugins/creator-studio/lib/full-pet-basic-actions.js`
  - all official rows are currently `FALLBACK_ONLY`, so `REQUIRED_REAL_FULL_PET_ACTION_IDS` is empty.
- `examples/plugins/creator-studio/lib/full-pet-qa.js`
  - `assertFullPetQaPassed()` only blocks `missingRequiredActionIds`, not `missingRequiredOfficialActionIds`.
- `tests/examples/creator-studio-full-pet-qa.test.js`
  - the test named `full-pet qa accepts the default one-image atlas policy only as preview fallback coverage` currently proves the bad import gate is accepted.

Root cause:

The code correctly records that base-only output is preview fallback, but approval/import policy still treats preview fallback as importable production output. Official-row support exists as a separate branch in `real-atlas-builder`, but the default one-click provider path does not feed complete official rows into it and does not block import when official rows are missing.

### P1: Single-Action QA Allows Reused Or Near-Static Frames

Current path:

```text
single-action provider run
  -> action sheet split into cells
  -> unusable later cell reuses previous good frame
  -> qa.warnings records reuse
  -> qa.ok remains true
  -> approve/import allowed
```

Code evidence:

- `examples/plugins/creator-studio/lib/action-frame-builder.js`
  - `resolveFrameSourceWithReuse()` reuses the previous valid frame after extraction errors.
  - `createActionFrameQuality()` checks completeness, cropping, height drift, visible-area drift, and baseline drift.
  - `createActionFrameQuality()` does not check `uniqueFrameCount`, reused-frame count, duplicate-frame ratio, or minimum motion.
- `examples/plugins/creator-studio/lib/action-frame-qa.js`
  - approval/import trusts `qa.ok === true` and does not recompute motion quality from files.
- `tests/examples/creator-studio-action-frame-builder.test.js`
  - the test named `action frame builder reuses the previous valid frame when later single-sheet cells are unusable` currently asserts `qa.ok === true` even when frames 6-8 are reused.

Root cause:

Action-frame QA treats "complete image files exist" as enough, plus some anti-jitter checks. It does not separately enforce "the animation actually animates." Reuse is surfaced as a warning instead of a blocking error.

## 3. Official Protocol Reference

OpenAI's `hatch-pet` skill defines the practical reference contract for Codex-compatible pets:

- one base pet image;
- official state-specific row strips;
- fixed Codex atlas layout;
- row-level QA and visual review artifacts;
- `running-left` is the only acceptable deterministic mirror case;
- local transforms or repeated base images are not real semantic action generation.

Reference URL:

```text
https://raw.githubusercontent.com/openai/skills/main/skills/.curated/hatch-pet/SKILL.md
```

OpenPet should mirror that policy at the quality-gate level: preview fallback is useful for identity review, but only row-real or approved-mirror evidence may unlock official action import.

## 4. Desired Behavior

### Full-Pet Provider Runs

Full-pet provider runs must produce one of two explicit states:

| State | Meaning | Can approve? | Can import? |
| --- | --- | --- | --- |
| `preview-only` | Base identity plus static fallback atlas; useful for review only | No | No |
| `official-action-ready` | Complete official rows pass row QA and atlas QA | Yes | Yes |

`preview-only` output must still be inspectable in the dashboard, but dashboard copy must say it is not production action coverage.

### Single-Action Runs

Single-action runs must fail QA when:

- any required frame was reused from a previous frame;
- unique frame count is too low for the requested frame count;
- adjacent frames are almost identical across the whole animation;
- total motion is below the minimum for the action type;
- frame files no longer match QA evidence at approval/import time.

Stationary actions may have subtle motion, but they still need enough frame-to-frame change to prove the asset is not static.

## 5. Repair Strategy

### Strategy A: Quality Ladder, Then Official Generation

This is the recommended repair order.

1. Make bad assets impossible to approve/import.
2. Add deterministic motion QA for single-action assets.
3. Add hash binding so QA evidence matches actual files.
4. Add explicit quality levels and row job states so preview, repairable, and official-ready assets are never confused.
5. Wire official row generation into the provider full-pet path with progressive row generation, not a blind 10-call burst.
6. Only after all offline tests pass, run a real provider smoke.

Why this order:

- It immediately stops fake action assets from entering OpenPet.
- It does not spend image quota while the gate is still wrong.
- It lets existing official-row infrastructure remain useful without overclaiming default output.
- It improves final success rate by repairing the smallest failing scope: frame, row, then atlas.

### Strategy B: Wire Official Generation First

This would generate row strips before fixing gates. It is not recommended because provider failures would still leave ambiguous preview artifacts, and bad single-action assets could still pass.

### Strategy C: Prompt-Only Repair

This is rejected. Better prompts may improve outputs, but they cannot guarantee deterministic quality. The fix must live in QA and import policy.

## 5.1 Design Review Verdict

The first version of this document can fix the two reviewed P1 blockers because it:

- blocks preview-only full-pet output from production approval/import;
- blocks single-action repeated/reused/static frame sequences;
- binds QA evidence to files so stale or replaced artifacts do not pass silently.

However, that first version is not enough to maximize generated action quality. It is mostly defensive. A better implementation should add three stronger mechanisms:

1. **A quality ladder instead of a binary pass/fail.**
   The app should know whether an artifact is `preview-only`, `repairable`, `official-row-review`, or `official-action-ready`.
2. **A row job state machine.**
   Each official row should be generated, retried, mirrored, repaired, accepted, or rejected independently.
3. **Offline threshold calibration.**
   Motion thresholds should be validated against synthetic good/bad fixtures and existing known-bad generated assets before any real provider run.

These additions make the plan more than a blocker fix: they create a repeatable asset-quality pipeline.

## 5.2 Quality Ladder

Every generated asset should carry one explicit quality level:

| Level | Meaning | Allowed actions |
| --- | --- | --- |
| `preview-only` | Base identity preview, static fallback atlas, or incomplete row coverage | Show in Creator Studio only; cannot approve/import/activate |
| `needs-repair` | Generated output exists but deterministic QA failed in a repairable way | Show repair guidance; allow row/frame retry or manual replacement |
| `visual-review-ready` | Deterministic QA passed, but user has not approved contact sheet/GIFs | Show review artifacts; allow human approval |
| `official-action-ready` | Deterministic QA passed and review is approved | Allow import/activation |

Implementation rule:

- Runtime import commands must accept only `official-action-ready` for provider full-pet output.
- Single-action import must accept only action-frame QA with motion quality passing and file hashes matching.
- `preview-only` may still write `pet.json` and `spritesheet.webp` inside the run folder for visual inspection, but it must not be handed to `creator/pet-pack/import-output`.

## 5.3 Row Job State Machine

Official full-pet generation should track each row independently:

```text
pending
  -> generating
  -> generated
  -> extracted
  -> qa_failed_repairable
  -> repaired
  -> visual_review_ready
  -> approved
  -> imported

pending
  -> generating
  -> failed_provider
  -> retry_ready
  -> generating

running-left only:
running-right approved
  -> derived_mirror
  -> visual_review_ready
```

Each row record should include:

```json
{
  "actionId": "waving",
  "status": "visual_review_ready",
  "quality": "row-real",
  "attempt": 1,
  "promptRelativePath": "runs/run-1/prompts/rows/waving.txt",
  "retryPromptRelativePath": "runs/run-1/prompts/rows/waving.retry.txt",
  "stripRelativePath": "runs/run-1/rows/waving/strip.png",
  "framesRelativeDir": "runs/run-1/frames/official/waving",
  "qaRelativePath": "runs/run-1/qa/rows/waving-validation.json",
  "previewRelativePath": "runs/run-1/qa/previews/waving.gif",
  "errors": [],
  "warnings": []
}
```

This state machine is better than all-or-nothing generation because one bad row should not force a full rerun.

## 5.4 Progressive Provider Budget

Do not immediately spend all row calls. Use a staged provider sequence:

1. Generate base.
2. Generate `idle`.
3. Generate `running-right`.
4. Run identity/anchor/gait QA on those two rows.
5. Decide whether `running-left` can be mirrored.
6. Generate `waving`.
7. Generate remaining rows only after the early rows pass.

Early-stop rules:

- If base image fails source QA, stop before row generation.
- If `idle` cannot preserve identity, stop and request base/prompt repair.
- If `running-right` fails locomotion variation or anchor QA twice, stop before spending the rest of the row budget.
- If provider returns transport errors, retry the same row once with the retry prompt, then stop and report the failed row.

This protects quota and gives the user a useful failure report.

## 5.5 Motion Quality Profiles

One threshold cannot fit every action. Add motion profiles derived from `animationType` or official row id:

| Profile | Examples | Required motion | Locked anchor |
| --- | --- | --- | --- |
| `micro_loop` | `idle`, subtle waiting | small but non-zero local change, blink/breath/head micro motion | strict baseline and body center |
| `gesture_loop` | `waving`, custom wave | visible appendage motion, body mostly stable | strict body/root anchor |
| `locomotion_loop` | `running-right`, `running-left` | alternating limb/body cadence, no static stride | stable cell center, controlled baseline |
| `vertical_motion` | `jumping` | meaningful vertical center movement plus return to baseline | horizontal center stable |
| `reaction` | `failed`, click reactions | expressive pose/expression change, returns or settles | identity and scale stable |
| `work_loop` | `running`, `review` | visible thinking/working/review motion, not directional foot-running | stable root and readable face |

QA should use profile-specific thresholds:

- `micro_loop` can pass with lower changed-pixel ratio but must fail identical or near-identical frames.
- `gesture_loop` must show movement concentrated in the expected appendage region when possible.
- `locomotion_loop` must have enough unique stride phases and must fail simple translate/scale transforms.
- `vertical_motion` may have larger centroid Y range but must return close to the original baseline.

This is better than a single global motion threshold because it avoids false failures for idle while still catching fake running.

## 5.6 Better Single-Action Stabilization

The document's original single-action QA only blocks bad motion. To improve visual quality, add a stabilization stage before final QA:

```text
raw extracted cells
  -> trim visible bbox
  -> place into common stable slot
  -> compute pre/post metrics
  -> fail if stabilization hides transform-like fake motion
  -> write normalized frames
```

Rules:

- Stabilization may fix extraction jitter, baseline popping, and inconsistent padding.
- Stabilization must not turn a translated static sprite into a valid action.
- QA should record both `preStabilization` and `postStabilization` metrics.
- If pre-stabilization shows only transform-like movement and no pose change, fail even if post-stabilization looks stable.

This directly targets the user's observed shake/jitter without accepting fake movement.

## 5.7 Semantic QA Limits

Deterministic image metrics cannot fully prove that `running` means "active task work" or that `review` means "focused inspection." The plan should therefore combine:

- deterministic metrics for static/reuse/drift/cropping;
- row-specific prompt contracts;
- row-specific visual review artifacts;
- human approval for official-action-ready.

Do not claim semantic correctness from metrics alone. Metrics can block obvious failures; human visual review confirms row meaning.

## 5.8 Offline Calibration Set

Before real provider tests, create or reuse local fixtures:

- `good_micro_idle`: subtle blink/breath, stable anchor.
- `bad_static_idle`: identical frames.
- `bad_translated_idle`: same sprite translated across cells.
- `good_wave`: stable body, appendage moves.
- `bad_reused_wave`: first few frames move, later frames reused.
- `good_jump`: vertical movement returns to baseline.
- `bad_jump_drift`: entire body drifts horizontally.
- `good_locomotion`: alternating stride phases.
- `bad_locomotion_translate`: identical silhouette translated.

Each fixture should assert expected QA errors and metrics. Thresholds should be adjusted using these fixtures before provider runs.

This is the most important "more work for better effect" addition because it makes quality rules measurable and prevents future prompt changes from weakening gates.

## 6. File Structure

Modify:

- `examples/plugins/creator-studio/lib/full-pet-basic-actions.js`
  - Keep official coverage metadata, but stop using empty `requiredRealActionIds` as the production gate for provider full-pet imports.
- `examples/plugins/creator-studio/lib/full-pet-qa.js`
  - Add official coverage gate for provider full-pet approval/import.
  - Require row validation for production import.
- `examples/plugins/creator-studio/lib/action-frame-builder.js`
  - Add unique-frame, reuse, duplicate, and motion metrics.
  - Write frame hashes into `action-frame-validation.json`.
- `examples/plugins/creator-studio/lib/action-frame-qa.js`
  - Recompute hashes and core frame evidence at approval/import time.
  - Block reused or static QA.
- `examples/plugins/creator-studio/service/studio-service.js`
  - Show preview-only guidance and block dashboard approval when official rows are missing.
- `examples/plugins/creator-studio/lib/backend-runner.js`
  - Later task: pass complete official row packages to `buildRealAtlasFromGeneratedImage()` when available.
- `examples/plugins/creator-studio/lib/host-model-bridge.js`
  - Later task: generate official row strips in official-action mode.
- `src/main/services/creator-workflow-service.js`
  - Reflect preview-only vs official-action-ready in one-click result state.

Test:

- `tests/examples/creator-studio-full-pet-qa.test.js`
- `tests/examples/creator-studio-real-atlas-builder.test.js`
- `tests/examples/creator-studio-action-frame-builder.test.js`
- `tests/examples/creator-studio-plugin.test.js`
- `tests/examples/creator-studio-dashboard-browser.test.js`
- `tests/services/creator-workflow-service.test.js`
- `tests/examples/creator-studio-host-model-bridge.test.js`

## 7. Task Plan

### Task 0: Offline Quality Fixture Calibration

**Files:**

- Create: `tests/fixtures/creator-studio/action-quality-fixtures.js`
- Modify: `tests/examples/creator-studio-action-frame-builder.test.js`
- Modify: `tests/examples/creator-studio-full-pet-row-qa.test.js`

**Interfaces:**

- Add fixture helpers that create deterministic transparent PNG frame sets:
  - `writeGoodMicroIdleFrames({ outputDir })`
  - `writeBadStaticFrames({ outputDir, frameCount })`
  - `writeBadTranslatedFrames({ outputDir, frameCount })`
  - `writeGoodWaveSheet({ filePath, frameCount })`
  - `writeBadReusedWaveSheet({ filePath, frameCount })`
  - `writeGoodJumpFrames({ outputDir })`
  - `writeBadDriftFrames({ outputDir })`

**Steps:**

- [ ] Create synthetic fixtures for good and bad motion profiles using `sharp` and SVG buffers.
- [ ] Add tests proving existing QA currently accepts at least one known-bad fixture.
- [ ] Mark expected QA metric names and thresholds in assertions before implementation.
- [ ] Run:

```sh
node --test tests/examples/creator-studio-action-frame-builder.test.js --test-name-pattern="static|reused|motion|quality"
node --test tests/examples/creator-studio-full-pet-row-qa.test.js --test-name-pattern="static|transform|drift|motion"
```

Expected:

- At least one test fails before implementation, proving the calibration set catches the current bug.
- Existing known-good row QA still passes.

### Task 1: Make Preview-Only Full-Pet Output Non-Importable

**Files:**

- Modify: `examples/plugins/creator-studio/lib/full-pet-qa.js`
- Modify: `examples/plugins/creator-studio/service/studio-service.js`
- Modify: `tests/examples/creator-studio-full-pet-qa.test.js`
- Modify: `tests/examples/creator-studio-dashboard-browser.test.js`
- Modify: `tests/examples/creator-studio-plugin.test.js`
- Modify: `tests/services/creator-workflow-service.test.js`

**Interfaces:**

- Add `isFullPetOfficialActionReady(atlasQa): boolean`.
- Add `getMissingOfficialActionIds(atlasQa): string[]`.
- `assertFullPetQaPassed({ dataDir, run, operation })` must reject provider full-pet runs when `missingRequiredOfficialActionIds` is non-empty.
- Fixture/legacy compatibility may remain only when the run is not a provider full-pet generation or when tests explicitly mark the path as legacy.

**Steps:**

- [ ] Change `tests/examples/creator-studio-full-pet-qa.test.js` so preview fallback now throws on provider-style full-pet approval/import.
- [ ] Add a positive test where `missingRequiredOfficialActionIds: []` and row validation exists.
- [ ] Implement official coverage gate in `full-pet-qa.js`.
- [ ] Update dashboard tests so ready-for-review preview-only runs show blocked approval.
- [ ] Update Creator Workflow tests so one-click new-character returns `review-required` or `preview-only` instead of imported when official rows are missing.
- [ ] Run:

```sh
node --test tests/examples/creator-studio-full-pet-qa.test.js
node --test tests/examples/creator-studio-dashboard-browser.test.js --test-name-pattern="full-pet|preview|approval"
node --test tests/services/creator-workflow-service.test.js --test-name-pattern="new-character|official|preview"
```

Expected:

- Preview fallback is visible but not approvable/importable.
- Official-row complete fixture still passes.

### Task 2: Add Single-Action Motion QA

**Files:**

- Modify: `examples/plugins/creator-studio/lib/action-frame-builder.js`
- Modify: `tests/examples/creator-studio-action-frame-builder.test.js`

**Interfaces:**

Add to `action-frame-validation.json`:

```json
{
  "quality": {
    "metrics": {
      "uniqueFrameCount": 6,
      "duplicateFrameCount": 0,
      "reusedFrameCount": 0,
      "adjacentFrameDiff": {
        "minChangedPixelRatio": 0.012,
        "maxChangedPixelRatio": 0.18,
        "averageChangedPixelRatio": 0.055
      },
      "motion": {
        "bboxCenterRangeX": 8.5,
        "bboxCenterRangeY": 3.2,
        "visibleMaskChangeRatio": 0.047
      }
    }
  }
}
```

Minimum policy:

- `reusedFrameCount > 0` is an error.
- `uniqueFrameCount <= 1` is an error.
- For `frameCount >= 6`, `uniqueFrameCount < 4` is an error.
- For `frameCount >= 12`, `uniqueFrameCount < 6` is an error.
- Adjacent changed-pixel ratios must be computed against the union of visible alpha pixels for the adjacent frame pair, not against the full `192x208` canvas.
- Average adjacent changed-pixel ratio below `0.003` of the visible-pixel union is an error for all action types.
- If an action has `animationType: stationary_loop`, low motion may warn at `0.003-0.006` but must still fail below `0.003`.
- Pixel diff must ignore fully transparent RGB residue and compare alpha plus visible RGB only where either frame has meaningful alpha.

**Steps:**

- [ ] Add a test that a sheet with all identical cells writes `qa.ok=false` and error `action_repeated_static`.
- [ ] Change the existing reused-frame test to expect `qa.ok=false` and error `action_reused_frames`.
- [ ] Add a test for a valid subtle waving sheet that passes.
- [ ] Implement per-frame raw RGBA hash collection.
- [ ] Implement adjacent alpha-aware pixel diff.
- [ ] Add motion metrics to `createActionFrameQuality()`.
- [ ] Run:

```sh
node --test tests/examples/creator-studio-action-frame-builder.test.js
```

Expected:

- Reused cells fail.
- Static sheets fail.
- Valid varied sheets pass.

### Task 3: Bind QA Evidence To Imported Files

**Files:**

- Modify: `examples/plugins/creator-studio/lib/action-frame-builder.js`
- Modify: `examples/plugins/creator-studio/lib/action-frame-qa.js`
- Modify: `examples/plugins/creator-studio/lib/full-pet-qa.js`
- Modify: `tests/examples/creator-studio-action-frame-builder.test.js`
- Modify: `tests/examples/creator-studio-full-pet-qa.test.js`

**Interfaces:**

For action frames, add per-frame `sha256` in `qa.frames[]`.

For full-pet, require `atlasSha256` and `sourceSha256` in QA artifacts for new provider runs.

Approval/import must recompute hashes from disk:

- action frame file hash equals `qa.frames[index].sha256`;
- spritesheet hash equals `atlasQa.atlasSha256`;
- source image hash equals `sourceQa.sourceSha256` when available.

**Steps:**

- [ ] Add tests that modify an action frame after QA and expect approval/import assertion to throw.
- [ ] Add tests that modify a full-pet spritesheet after QA and expect full-pet assertion to throw.
- [ ] Write hash values during QA generation.
- [ ] Recompute hashes in `action-frame-qa.js` and `full-pet-qa.js`.
- [ ] Preserve legacy fixture compatibility by requiring hashes only when QA contains `schemaVersion >= 2` or provider-generated provenance exists.
- [ ] Run:

```sh
node --test tests/examples/creator-studio-action-frame-builder.test.js tests/examples/creator-studio-full-pet-qa.test.js
```

Expected:

- Stale or tampered files cannot pass approval/import.

### Task 4: Add Official Row Generation Mode Without Spending Quota In Tests

**Files:**

- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Modify: `examples/plugins/creator-studio/lib/full-pet-row-jobs.js`
- Create: `examples/plugins/creator-studio/lib/full-pet-row-generation-state.js`
- Modify: `tests/examples/creator-studio-host-model-bridge.test.js`
- Modify: `tests/examples/creator-studio-real-atlas-builder.test.js`
- Test: `tests/examples/creator-studio-full-pet-row-generation-state.test.js`

**Interfaces:**

Add row generation state helpers:

```js
createRowGenerationState({ runId, baseSourceRelativePath, canonicalReferenceRelativePath })
markRowGenerating({ state, actionId, attempt })
markRowGenerated({ state, actionId, stripRelativePath })
markRowQaFailed({ state, actionId, errors, repairable })
markRowVisualReviewReady({ state, actionId, qaRelativePath, previewRelativePath })
markRowApproved({ state, actionId })
markRunningLeftDerivedMirror({ state, decisionNote })
getReadyRowsForGeneration(state)
getOfficialActionReadiness(state)
```

Add provider result shape:

```json
{
  "officialRows": {
    "mode": "official-full-pet",
    "rows": [
      {
        "actionId": "idle",
        "sourceRelativePath": "runs/run-1/rows/idle/strip.png",
        "frames": [
          { "index": 0, "path": "/abs/.../frames/official/idle/01.png" }
        ],
        "quality": "row-real"
      }
    ]
  }
}
```

`backend-runner.writeHostGeneratedStandardOutputs()` passes `generationResult.officialRows` to `buildRealAtlasFromGeneratedImage()`.

**Steps:**

- [ ] Add a row-generation-state test covering `pending -> generating -> generated -> visual_review_ready -> approved`.
- [ ] Add a row-generation-state test proving only `running-left` can enter `derived_mirror`.
- [ ] Add a row-generation-state test proving readiness is false until all required rows are approved.
- [ ] Add a host-model bridge test using a local fake bridge that returns deterministic row-strip PNGs from fixture buffers.
- [ ] Assert full-pet official mode requests rows progressively: base, `idle`, `running-right`, then remaining rows after early QA.
- [ ] Assert `running-left` may be derived only when explicitly marked and only after `running-right` is approved.
- [ ] Assert the result includes `officialRows`.
- [ ] Modify backend runner to pass official rows into atlas builder.
- [ ] Extend real atlas builder integration test to verify `missingRequiredOfficialActionIds: []`.
- [ ] Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-generation-state.test.js
node --test tests/examples/creator-studio-host-model-bridge.test.js tests/examples/creator-studio-real-atlas-builder.test.js
```

Expected:

- Official rows can flow from fake provider output to final atlas without real provider calls.
- Provider generation is progressive and can stop early before spending all row calls.

### Task 5: Update One-Click Workflow Semantics

**Files:**

- Modify: `src/main/services/creator-workflow-service.js`
- Modify: `src/control-center/src/panes/CreatorPane.tsx`
- Modify: `tests/services/creator-workflow-service.test.js`
- Modify: `tests/control-center/control-center-smoke.spec.js`
- Modify: `tests/control-center/demo-control-center-api.test.js`

**Behavior:**

One-click new pet can return:

- `pet_imported` only when official action QA is complete.
- `preview_ready` when only base preview exists.
- `review_required` when QA blocks approval.
- `provider_not_ready` when provider/model is not ready.

The UI must not imply production actions when `missingRequiredOfficialActionIds` is non-empty.

**Steps:**

- [ ] Update service tests so base-only new-character flow no longer claims import success.
- [ ] Add official-row complete service test that still imports successfully.
- [ ] Update Creator Pane copy/state to show preview-only vs official-ready.
- [ ] Run:

```sh
node --test tests/services/creator-workflow-service.test.js
npm run test:control-center
```

Expected:

- User-facing one-click flow is honest about whether actions are complete.

### Task 6: Documentation And Evidence

**Files:**

- Modify: `docs/one-click-action-generation-complete-chain.md`
- Modify: `examples/plugins/creator-studio/README.md`
- Modify: `docs/project-context.json`
- Modify: `tests/docs/live-docs-creator-studio.test.js`

**Steps:**

- [ ] Update docs to state preview fallback is not importable as official provider output.
- [ ] Document official-action-ready requirements.
- [ ] Document single-action minimum motion QA.
- [ ] Update docs tests to reject language that claims base-only preview is production-ready.
- [ ] Run:

```sh
node --test tests/docs/live-docs-creator-studio.test.js
npm run test:tools -- --test-name-pattern="docs|creator"
```

Expected:

- Docs match runtime gates.

## 8. Final Verification

Run offline verification first:

```sh
git diff --check
npm run check:syntax
npm run test:core -- --test-name-pattern="creator|action|full-pet|image generation"
npm run test:tools -- --test-name-pattern="creator|docs"
```

Then run full Node verification:

```sh
npm test
```

Only after all offline tests pass, run one real provider smoke with the known stable model:

```sh
node scripts/run-creator-workflow-host-smoke.js \
  --scenario new-character \
  --reference-image /Users/mango/Downloads/正面.png \
  --new-character-name "Golden Cartoon Cat" \
  --new-character-style-prompt "Cute cartoon golden British Shorthair desktop pet, stable official OpenPet actions." \
  --json
```

The smoke is accepted only if:

- output state is `pet_imported` for official-action-ready, or `preview_ready` without import for preview-only;
- `atlas-validation.json` has `missingRequiredOfficialActionIds: []` before import;
- `full-pet-row-validation.json` exists and all rows are `row-real` or approved `running-left` mirror;
- row preview GIFs show semantic action and no visible jitter;
- action-frame validation has no reused frames and passes minimum motion metrics.

## 9. Acceptance Criteria

- A base-only provider full-pet preview cannot be approved or imported as a production pet pack.
- A complete official row package can still be approved/imported.
- A single-action sheet with reused previous frames fails QA.
- A single-action static or near-static sheet fails QA.
- QA JSON is bound to actual frame/spritesheet hashes for new provider outputs.
- Dashboard and one-click workflow no longer claim production actions when official rows are missing.
- Existing fixture or legacy tests remain supported only where explicitly marked as fixture/legacy.
- No new code exposes provider secrets to renderer or plugins.
- No tests require real image-generation quota.

## 10. Known Follow-Up After This Repair

After this repair, the remaining hard problem is provider art quality. The gate will prevent bad output from being imported, but it will not magically make every provider output good. Future quality work should focus on:

- row-specific prompt tuning;
- retry policy per failed row;
- manual approve/replace controls for individual row strips;
- visual diff reports between base identity and row frames;
- optional provider model benchmarking using the same offline QA metrics.

Those follow-ups should happen after the import gates are correct.

## 11. Execution Choice

Recommended execution is Subagent-Driven:

1. Task 0 offline quality fixture calibration.
2. Task 1 gate repair.
3. Task 2 single-action motion QA.
4. Task 3 hash binding.
5. Task 4 official row generation wiring and row state.
6. Task 5 workflow/UI semantics.
7. Task 6 docs/evidence.

Each task should end with a local commit and a review pass before moving to the next task.

## 12. Milestone Execution Record

Milestone executed in `codex/dev8`:

- Phase 1 completed the single-action motion gate: static sheets, reused frames, insufficient unique frames, and below-threshold motion now fail QA before approval/import.
- Phase 2 completed the full-pet preview-only gate: provider fallback atlases with missing official rows are visible for review but cannot be approved/imported, and one-click full-pet workflow returns `preview_ready` instead of claiming `pet_imported`.
- Phase 3 completed QA hash binding for new outputs: action frame files, generated atlases, and source images now carry hash evidence that approval/import gates can recompute.

Remaining backlog after this milestone:

- Add profile-specific thresholds for `idle`, `waving`, `running`, `jumping`, and reaction rows.
- Add row-level retry/repair controls around the official row job state machine.
- Run a real provider smoke only after the local image gateway/model list is stable, then perform human visual review of row GIFs/contact sheets.
