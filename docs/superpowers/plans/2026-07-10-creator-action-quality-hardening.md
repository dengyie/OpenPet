# Creator Action Quality Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce provider-first, identity-faithful, semantically correct action generation for single-action and full-pet workflows.

**Architecture:** Introduce one shared action-semantics contract, route every required action through provider start/peak keyframes and one conditioning board, extract square sprite grids without distortion, and strengthen deterministic QA so technical variation cannot masquerade as real motion.

**Tech Stack:** Node.js, Sharp, Node native test runner, Electron service/plugin bridge.

## Global Constraints

- The user source image is the highest identity authority.
- Final action sprites must come from one complete provider-generated sprite sheet.
- Local code may condition, split, normalize, stabilize, inspect, and package only.
- Provider calls accept at most one reference image.
- No local motion completion or interpolation is allowed.
- Only `running-left` may use an approved mirror of `running-right`.

## Completion Status

All implementation tasks are complete. The delivered flow now enforces canonical provider start/peak/final generation, single-board conditioning, square-grid extraction, shared-transform stabilization, semantic and identity QA, exact official atlas dimensions, fail-closed preview packaging, reference containment/hash validation, and complete host smoke evidence.

Final verification:

- Action-focused integration: 126/126
- Creator Studio plugin: 87/87
- Tooling: 491/491
- Core: 1216/1216
- Control Center Playwright: 69/69
- Syntax/typecheck/build: passed
- Diff whitespace check: passed

---

### Task 1: Shared Action Semantics

**Files:**
- Create: `examples/plugins/creator-studio/lib/action-semantics.js`
- Modify: `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`
- Modify: `examples/plugins/creator-studio/lib/openpet-prompt-builder.js`
- Modify: `src/main/services/creator-workflow-service.js`
- Test: `tests/examples/creator-studio-anchor-prompt-builder.test.js`
- Test: `tests/services/creator-workflow-service.test.js`

**Interfaces:**
- Produces: `inferAnimationType(action)`, `buildActionFramePlan(action)`, `getAnimatedParts(action)`.
- Consumes: normalized action metadata from Creator Studio generation tasks.

- [ ] Add failing tests proving sparse `running`, `jumping`, and `waving` tasks receive the correct animation type and action-specific frame plan.
- [ ] Run the focused tests and confirm failures show `stationary_loop` or generic moving-part wording.
- [ ] Implement the shared semantics module and replace duplicate/default-only inference.
- [ ] Re-run focused tests and confirm they pass.

### Task 2: Full-Pet Keyframe Conditioning

**Files:**
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `examples/plugins/creator-studio/lib/anchor-reference-board.js`
- Test: `tests/examples/creator-studio-host-model-bridge.test.js`
- Test: `tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js`

**Interfaces:**
- Consumes: user source reference and shared action semantics.
- Produces: one provider start keyframe, one provider peak keyframe, one local conditioning board, and one provider sprite sheet per generated action.

- [ ] Add failing tests proving each official full-pet action makes start, peak, and final calls with exactly one reference image per call.
- [ ] Add a failing test proving the final call references only `keyframe-action-reference-board`.
- [ ] Implement a reusable provider sprite-sheet generation routine shared by single-action and full-pet paths.
- [ ] Derive `running-left` only from accepted `running-right` frames when mirror mode is selected.
- [ ] Re-run bridge tests and confirm pass.

### Task 3: Square Grid Extraction

**Files:**
- Create: `examples/plugins/creator-studio/lib/action-sheet-layout.js`
- Modify: `examples/plugins/creator-studio/lib/action-frame-builder.js`
- Modify: `examples/plugins/creator-studio/lib/full-pet-row-extractor.js`
- Modify: `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`
- Test: `tests/examples/creator-studio-action-frame-builder.test.js`
- Test: `tests/examples/creator-studio-full-pet-row-extractor.test.js`

**Interfaces:**
- Produces: `getActionSheetLayout(frameCount)` and grid extraction metadata.
- Consumes: one provider-generated square sprite sheet.

- [ ] Add failing layout tests for 4, 5, 6, and 8 frames.
- [ ] Add a failing extraction test proving a non-square character is not stretched.
- [ ] Implement shared square-grid layout and `fit: contain` frame extraction.
- [ ] Re-run extraction tests and confirm pass.

### Task 4: Alpha, Identity, And Motion QA

**Files:**
- Create: `examples/plugins/creator-studio/lib/action-visual-metrics.js`
- Modify: `examples/plugins/creator-studio/lib/action-frame-builder.js`
- Modify: `examples/plugins/creator-studio/lib/full-pet-row-qa.js`
- Modify: `examples/plugins/creator-studio/lib/real-atlas-builder.js`
- Test: `tests/examples/creator-studio-action-frame-builder.test.js`
- Test: `tests/examples/creator-studio-full-pet-row-qa.test.js`
- Test: `tests/examples/creator-studio-real-atlas-builder.test.js`

**Interfaces:**
- Produces: per-frame alpha, silhouette, foreground-color, spatial-motion, and identity-core metrics.
- Consumes: extracted provider frames and normalized animation type.

- [ ] Add a failing test proving recolor-only `running` is rejected.
- [ ] Add a failing test proving opaque provider action sheets are rejected.
- [ ] Add failing tests for insufficient locomotion silhouettes and excessive identity drift.
- [ ] Implement deterministic visual metrics and action-type thresholds.
- [ ] Ensure stable-slots cannot turn semantic or identity failures into accepted rows.
- [ ] Re-run focused QA tests and confirm pass.

### Task 5: End-To-End Verification

**Files:**
- Modify tests only when an integration expectation must reflect the new provider call sequence.

**Interfaces:**
- Consumes: all completed tasks.
- Produces: fresh verification evidence for delivery readiness.

- [ ] Re-run every original failing regression test.
- [ ] Run all Creator Studio action/row/atlas/bridge tests.
- [ ] Run `npm run test:tools`.
- [ ] Run `npm run check:syntax`.
- [ ] Run `git diff --check`.
- [ ] Review the final diff against every global constraint and record any external provider-quality limitation truthfully.
