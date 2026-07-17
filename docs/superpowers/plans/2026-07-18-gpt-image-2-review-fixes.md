# GPT Image 2 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Correct model capability resolution, preserve mixed visual briefs, and enforce the official `running` work-state semantics in the provider-neutral image prompt pipeline.

**Architecture:** Keep the existing validated `VisualPlan -> ProviderImageTask -> PromptClause -> renderer` flow. Make model capabilities explicit and fail-closed, make raw brief normalization preserve visual residue instead of dropping complete entries, and give official action IDs precedence over text inference. Move focused regression tests into the production branch and remove the empty generic renderer alias.

**Tech Stack:** Node.js native test runner, CommonJS modules, Electron main/plugin services.

## Global Constraints

- Do not modify the three pre-existing dirty files: `src/main/services/ai-service.js`, `tests/services/ai-service.test.js`, and `tests/services/creator-studio-default-flow-service.test.js`.
- Every Provider request continues to require exactly one reference image.
- Unknown image models must never be granted unverified transparency capability.
- `running-right` and `running-left` remain directional locomotion; `running` remains processing/focus/scanning work-state.

### Task 1: Capability Registry Regression

**Files:**
- Create: `tests/examples/creator-studio-prompt-review-regressions.test.js`
- Modify: `examples/plugins/creator-studio/lib/image-model-capabilities.js`
- Modify: `examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js`
- Modify: `src/main/services/image-generation-model-service.js` only if request construction needs capability input

- [ ] Write failing tests for unknown models and opaque background behavior.
- [ ] Run the focused test and confirm failure.
- [ ] Implement explicit capability profiles and fail-closed unknown-model behavior.
- [ ] Run the focused test and confirm pass.

### Task 2: Mixed Brief Preservation

**Files:**
- Modify: `examples/plugins/creator-studio/lib/visual-plan.js`
- Modify: `examples/plugins/creator-studio/lib/openpet-prompt-builder.js`
- Test: `tests/examples/creator-studio-prompt-review-regressions.test.js`

- [ ] Add a failing mixed product-plus-visual brief test.
- [ ] Implement deterministic visual residue extraction with explicit warning/error behavior.
- [ ] Run the focused test and confirm pass without restoring internal product terms.

### Task 3: Official Running Semantics

**Files:**
- Modify: `examples/plugins/creator-studio/lib/action-semantics.js`
- Modify: `src/main/services/creator-workflow-service.js`
- Test: `tests/examples/creator-studio-prompt-review-regressions.test.js`

- [ ] Add failing tests for `running` work-state and `running-right` locomotion.
- [ ] Add official action-ID semantic precedence and work-state phases.
- [ ] Run focused prompt and creator workflow tests.

### Task 4: Renderer Cleanup and Verification Assets

**Files:**
- Delete: `examples/plugins/creator-studio/lib/generic-image-prompt-renderer.js`
- Modify: `examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js`
- Test: `tests/examples/creator-studio-prompt-review-regressions.test.js`

- [ ] Remove the no-op renderer alias and route the currently supported renderer directly.
- [ ] Run syntax, focused suites, core, and Control Center regression commands.
- [ ] Rebase this branch onto the latest `main` before final handoff and rerun affected tests.
