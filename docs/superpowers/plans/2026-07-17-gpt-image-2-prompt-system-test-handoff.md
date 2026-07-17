# GPT Image 2 Prompt System Independent Test Handoff

## Assignment

- Production branch: `codex/dev8-main-review-fix`
- Production checkpoint: `7da1d0cc` (`fix: clarify reference region prompt grammar`), including implementation ancestors `33504539` and `51ebbf22`
- Development status: implemented but independently unverified
- Required test owner: an isolated test branch/worktree; do not modify, switch, merge, reset, rebase, or push the production branch
- Image handling: real generation and visual evaluation must be delegated to fresh one-use visual agents; do not load generated images into the long-running development task

## Production Scope

The checkpoint introduces:

- `VisualPlan v1` with product-language filtering;
- `ProviderImageTask v3` with direction, animation type, loop type, secondary motion, forbidden motion, and exact per-frame beats;
- prompt compiler v3 and prompt builder v6;
- auditable PromptClause IR;
- GPT Image 2 and bounded generic image-edit renderers;
- GPT Image 2 opaque cutout-ready background instructions;
- local prompt provenance for renderer, capability profile, clause IDs, background strategy, and frame-beat count;
- complete per-frame action phase allocation;
- anatomy-neutral preservation and motion language;
- scoped human-quality guidance;
- action repair changes derived from one prior observable failure condition;
- host prompt-evidence normalization for the new fields.

No automated or real Provider test was run on the production branch.

## Branch Preparation

Use a clean isolated test worktree. Start from exactly production checkpoint `7da1d0cc`. Record the production and test commit IDs and stable patch IDs if cherry-picking produces different hashes.

Do not copy or commit the unrelated dirty files that remain in the production worktree:

```text
src/main/services/ai-service.js
tests/services/ai-service.test.js
tests/services/creator-studio-default-flow-service.test.js
```

## Required Test Updates

Add or update tests under the independent test branch only.

### Visual plan and capabilities

Prove:

- `Create a reusable OpenPet desktop pet named X` does not reach the final Provider prompt;
- explicit visible changes survive;
- `gpt-image-2` resolves `gpt-image-2-v1`, opaque cutout strategy, and `requestedOutputCount: 1`;
- `gpt-image-1`, `gpt-image-1.5`, and an already eligible non-empty runtime model resolve the expected bounded profiles;
- an empty model fails with `image_prompt_capability_conflict`.

### Task schema v3

Prove:

- task version is 3;
- complete action semantics survive normalization;
- frame numbers are contiguous;
- frame-beat count exactly equals the requested frame count;
- sparse or duplicate frame plans fail with `image_prompt_frame_plan_incomplete`;
- unknown fields remain rejected.

### GPT Image 2 prompt format

For character, keyframe, frame sheet, and repair-like action regeneration, inspect the complete generated prompt and assert the relevant section order:

```text
DELIVERABLE
REFERENCE
CHANGE
PRESERVE
COMPOSITION
ACTION PLAN or FRAME PLAN
BACKGROUND
CONSTRAINTS
```

Prove:

- no GPT Image 2 prompt contains `transparent`, `OpenPet`, `Creator Studio`, internal IDs, roles, paths, URLs, credentials, or transport terminology;
- non-idle prompts state that the written action plan controls pose;
- idle prompts keep the canonical pose and allow only low-amplitude local motion;
- prompts do not require ears, paws, tail, wings, clothing, or other unobserved anatomy;
- GPT Image 2 background text is uniform, opaque, contrastive, and explicitly intended for downstream removal;
- generic transparent-capable prompts retain the direct transparent contract;
- `CHANGE` and `PRESERVE` are distinct;
- repair regeneration contains only one additional visible correction.

### Frame semantics

For every official action and configured frame count, prove one unique line exists for every cell:

- idle: 6;
- running-right: 8;
- waving: 4;
- jumping: 5;
- failed: 8;
- waiting: 6;
- running work state: 6;
- review: 6.

Prove direction, root behavior, secondary motion, forbidden motion, and loop closure survive into the final Provider prompt. Confirm there are no range placeholders such as `Frames 7-12`.

### Guidance scope and repair

Prove:

- direction mismatch does not enter non-locomotion actions;
- baseline guidance applies only to grounded/stationary/locomotion/bounce actions;
- static-motion guidance applies only when an animation type is present;
- identity, edge, background, and scale guidance may remain global;
- action repair selects one correction from the prior attempt's first failure condition and does not append prompt history.

### Host evidence and request contract

Prove every Creator Studio image request still records:

```text
referenceImageCount = 1
multipartImageField = image
requestedOutputCount = 1
providerImageTaskVersion = 3
promptCompilerVersion = 3
promptRenderer
modelCapabilityProfile
backgroundStrategy
frameBeatCount
promptClauseIds
```

For `gpt-image-2`, confirm transport still uses `/images/edits`, one `image` field, and `n=1`; API background remains omitted while the prompt requests the opaque cutout background.

## Automated Verification

Run fresh:

```bash
npm run check:syntax
node --test tests/examples/creator-studio-provider-image-prompt-system.test.js
node --test tests/examples/creator-studio-anchor-prompt-builder.test.js tests/examples/creator-studio-plugin.test.js
node --test tests/examples/creator-studio-host-model-bridge.test.js tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js
node --test tests/examples/creator-studio-pet-generation-human-examples.test.js
node --test tests/services/image-generation-model-service.test.js
npm run test:core
npm run test:control-center
npm run test:core:all
```

Report exact exit codes and pass/fail totals. Separate genuine production defects from intentionally changed prompt snapshots or version expectations.

## Real Provider Verification

Use `provider=openai-compatible`, `model=gpt-image-2`, one eligible reference image, and no secrets in reports.

Capture sanitized evidence that every request has one reference, one output request, the GPT Image 2 renderer, and the opaque cutout background strategy.

Verify at minimum:

1. canonical character generation;
2. running-right start and peak keyframes;
3. one complete multi-cell running-right sheet;
4. one stationary action sheet;
5. one action repair after an observable QA rejection;
6. local opaque-background removal and transparent artifact QA.

Fresh one-use visual agents must inspect the canonical output, all generated keyframes, contact sheets, GIFs/previews, and atlas evidence. They must evaluate identity preservation, action readability, direction, frame progression, copied-board leakage, invented anatomy, edge halos, and repair locality.

Do not claim Provider approval or `production-art-ready` without an explicit successful human approval record after the real visual evidence passes.

## Result Contract

Return:

- test branch/worktree and exact HEAD;
- production checkpoint and integration commit/patch ID;
- clean/dirty status;
- files changed by the test task;
- automated command results and totals;
- sanitized real request evidence;
- visual-agent findings;
- remaining blockers;
- final verdict: PASS, FAIL, or implemented but unverified.

Do not push, merge, rebase, reset, or modify the production branch.
