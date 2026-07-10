# Keyframe Conditioned Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-first keyframe-conditioned sprite row path for Creator Studio action generation, with QA-gated rejection instead of local action completion.

**Architecture:** The host model bridge creates a keyframe reference board and asks the image provider for a complete action sprite row. The action frame builder remains the only extractor/QA authority; it accepts provider rows when QA passes and rejects provider rows when QA fails. Deliverable action generation must not use local canonical synthesis to complete missing or bad motion.

**Tech Stack:** Node.js, Electron plugin host code, `sharp`, Node native test runner.

## Global Constraints

- Stay isolated in `/Users/mango/.codex/worktrees/3c34/OpenPet` on branch `codex/dev8`.
- Do not edit `/Users/mango/project/codex/OpenPet`.
- Preserve user source image identity as the highest authority.
- Do not silently import bad generated assets.
- Use TDD for behavior changes.
- Keep all generated evidence under Creator Studio run data.

---

### Task 1: Keyframe Row Prompt And Board Contract

**Files:**
- Modify: `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`
- Modify: `tests/examples/creator-studio-anchor-prompt-builder.test.js`

**Interfaces:**
- Produces: `buildActionSpriteRowPrompt({ characterBrief, referenceRole, action })`
- Consumes: existing `sanitizeCreativeBrief` and action metadata.

- [ ] **Step 1: Write failing prompt tests** asserting the row prompt includes frame count, equal-cell sprite sheet layout, start/peak/end keyframes, source-image identity lock, stable root, and copied-board negative constraints.
- [ ] **Step 2: Run `node --test tests/examples/creator-studio-anchor-prompt-builder.test.js` and confirm the new tests fail because `buildActionSpriteRowPrompt` is missing.**
- [ ] **Step 3: Implement `buildActionSpriteRowPrompt` with a strict OpenPet action row contract.**
- [ ] **Step 4: Run the prompt tests and confirm they pass.**

### Task 2: Provider Keyframe Row Generation

**Files:**
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js`

**Interfaces:**
- Consumes: `buildActionSpriteRowPrompt`.
- Produces: run-local `runs/<runId>/inputs/keyframes/actions/<actionId>-row-reference-board.png` and provider output under `runs/<runId>/frames/base/<actionId>-row-candidates`.

- [ ] **Step 1: Write failing tests** proving canonical actions build a keyframe board, send it as the final provider reference, and record row-generation metadata.
- [ ] **Step 2: Run the focused host-model-bridge tests and confirm failure.**
- [ ] **Step 3: Implement the row generation attempt after action anchor selection.**
- [ ] **Step 4: Reject the generation with partial evidence when provider row generation fails; do not return an adopted action anchor.**
- [ ] **Step 5: Run the focused host-model-bridge tests and confirm pass.**

### Task 3: QA-Gated Provider Row Extraction

**Files:**
- Modify: `examples/plugins/creator-studio/lib/action-frame-builder.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Modify: `tests/examples/creator-studio-action-frame-builder.test.js`
- Modify: `tests/examples/creator-studio-backend-runner-anchor-artifacts.test.js`

**Interfaces:**
- Consumes: provider row outputs from `generationResult.outputs`.
- Produces: `qa.extraction.mode = "provider-keyframe-row"` for provider sprite rows. Failed row QA remains failed and blocks review/import.

- [ ] **Step 1: Write failing tests** for accepting a valid provider row and for rejecting failed provider rows even when an action anchor exists.
- [ ] **Step 2: Run action-frame-builder/backend-runner tests and confirm failure.**
- [ ] **Step 3: Implement provider-row extraction preference and remove production fallback metadata.**
- [ ] **Step 4: Run focused tests and confirm pass.**

### Task 4: Remove Local Completion Fallbacks

**Files:**
- Modify: `examples/plugins/creator-studio/lib/action-frame-builder.js`
- Modify: `tests/examples/creator-studio-action-frame-builder.test.js`
- Modify: `scripts/run-creator-workflow-host-smoke.js`
- Modify: `tests/scripts/run-creator-workflow-host-smoke.test.js`

**Interfaces:**
- Consumes: provider keyframe row outputs only.
- Produces: hard failures when deliverable action generation lacks complete provider sprite-row evidence.

- [ ] **Step 1: Write a failing test** proving canonical-frame action generation rejects single-frame canonical outputs without `keyframeSpriteRow.ok === true`.
- [ ] **Step 2: Write a failing smoke evidence test** proving `adopted-provider-anchor` is not acceptable action completion evidence.
- [ ] **Step 3: Remove canonical local synthesis and adopted action-anchor completion paths.**
- [ ] **Step 4: Re-run action-frame-builder and smoke tests and confirm pass.**

### Task 5: Verification

**Files:**
- Verify only unless tests expose a needed fix.

**Interfaces:**
- Consumes: all tasks above.
- Produces: local verification evidence and run artifact paths.

- [ ] **Step 1: Run focused creator-studio tests.**
- [ ] **Step 2: Run `npm run check:syntax`.**
- [ ] **Step 3: Inspect generated provider-row contact sheets only; do not validate local synthesized motion as a deliverable path.**
- [ ] **Step 4: Run a provider smoke when the strict provider-row path is clean.**
