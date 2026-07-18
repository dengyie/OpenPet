# GPT Image 2 Deep Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four production review findings in the GPT Image 2 prompt pipeline without weakening Provider ownership, reference-image, output-count, or art-readiness gates.

**Architecture:** Keep the existing `VisualPlan -> ProviderImageTask -> PromptClause -> renderer` pipeline. Canonicalize known model capability comparisons without rewriting outbound model IDs, preserve visual residue across complete briefs, bind compiled prompts to a Host-owned model snapshot and re-render model variants from validated task semantics, and expose one bounded provenance shape through every Studio API.

**Tech Stack:** Node.js native test runner, CommonJS, Electron main services, Creator Studio official plugin.

## Global Constraints

- Do not modify `src/main/services/ai-service.js`, `tests/services/ai-service.test.js`, or `tests/services/creator-studio-default-flow-service.test.js`; those dirty files belong to another task.
- Every Provider image request must contain exactly one validated reference image and request exactly one output.
- Plugins must not select or override Provider credentials, endpoint, or active model.
- A prompt compiled for one capability profile must never be reused for a different model.
- Keep real Provider generation, visual QA, and human approval outside this development task.

---

### Task 1: Canonical Model Capability Comparisons

**Files:**
- Modify: `src/main/services/image-generation-model-service.js`
- Test: `tests/services/image-generation-model-service.test.js`

**Interfaces:**
- Consumes: the saved raw Provider model ID.
- Produces: case-insensitive known-model capability decisions while preserving the original outbound model ID.

- [x] Add a failing multipart regression for `GPT-IMAGE-2`.
- [x] Verify it sends the currently incorrect quality/background fields.
- [x] Centralize known-model comparison and use it for quality, background, and response-format decisions.
- [x] Verify the focused service tests pass.

### Task 2: Preserve Complete Mixed Visual Briefs

**Files:**
- Modify: `examples/plugins/creator-studio/lib/visual-plan.js`
- Test: `tests/examples/creator-studio-prompt-review-regressions.test.js`

**Interfaces:**
- Consumes: bounded sanitized appearance and requested-change directives.
- Produces: product-neutral visual residue without discarding valid prefixes or suffixes.

- [x] Add failing cases for visual style before and after product language and for briefs without the old boundary words.
- [x] Verify the visual requirements disappear under the current tail-only extraction.
- [x] Replace tail extraction with bounded whole-directive redaction and cleanup.
- [x] Verify prompt safety and focused prompt tests pass.

### Task 3: Bind Host Model Selection To Prompt Compilation

**Files:**
- Modify: `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`
- Modify: `examples/plugins/creator-studio/lib/openpet-prompt-builder.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `src/main/services/plugin-service.js`
- Modify: `src/main/services/image-generation-model-service.js`
- Test: `tests/examples/creator-studio-host-model-bridge.test.js`
- Test: `tests/services/image-generation-model-service.test.js`

**Interfaces:**
- Consumes: a Host-owned configured model snapshot and validated prompt-builder inputs.
- Produces: `expectedModel` precondition checks and model-specific compiled prompt variants selected only by the Host.

- [x] Add failing tests for a changed Host model and for a fallback receiving a freshly rendered prompt/profile.
- [x] Verify current code either reuses the stale prompt or makes only one failing attempt.
- [x] Add a Host model precondition that rejects stale compiled requests without treating it as a model override.
- [x] Carry bounded semantic prompt variants for Host-policy candidates and select only Host-verified candidates.
- [x] Verify fallback attempts retain one reference, one output, total timeout accounting, and model-specific background strategy.

### Task 4: Complete Public Prompt Provenance

**Files:**
- Modify: `examples/plugins/creator-studio/service/studio-service.js`
- Test: `tests/examples/creator-studio-plugin.test.js`
- Test: `tests/examples/creator-studio-dashboard-browser.test.js`

**Interfaces:**
- Consumes: internal compiler safe summary.
- Produces: one sanitized public summary containing compiler/task/renderer/profile/clause/background evidence.

- [x] Add failing API assertions for every required provenance field.
- [x] Verify the current public projection drops them.
- [x] Extend the single public sanitizer and reuse it in dashboard provenance.
- [x] Verify secrets, paths, and arbitrary prompt text remain absent.

### Task 5: Verification And Integration Readiness

**Files:**
- Modify: this plan only to mark completed steps.

**Interfaces:**
- Consumes: all four completed fixes.
- Produces: fresh syntax, focused, core, and Control Center evidence suitable for independent review.

- [x] Run focused prompt, Host bridge, Studio, and image-service suites.
- [x] Run `npm run check:syntax`.
- [x] Run repository-level tests that exclude the two unrelated dirty test files.
- [x] Review `git diff --check`, branch status, and the final diff before committing only owned files.

## Verification Boundary

- Focused prompt, Host bridge, Studio, plugin bridge, and image-service suites pass.
- Syntax and Control Center suites pass.
- Core passes when the two parallel-task test files are omitted; the related dirty production file
  remains present and unmodified in the worktree.
- The full core command has one known failure in the externally modified
  `tests/services/creator-studio-default-flow-service.test.js`; this plan does not modify that
  production path or claim that unrelated baseline as fixed.
- No real Provider generation, visual QA, human approval, or production-art-ready assertion is part
  of this implementation.
