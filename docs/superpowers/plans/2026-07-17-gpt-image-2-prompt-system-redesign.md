# GPT Image 2 Prompt System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace OpenPet's single generic upstream image prompt with validated visual semantics, complete action-frame plans, and capability-aware GPT Image 2 and generic renderers.

**Architecture:** Existing Creator Studio task data is normalized into `VisualPlan v1` and `ProviderImageTask v3`. A deterministic clause compiler resolves reference authority, action changes, preservation rules, composition, background strategy, and scoped guidance before a model-specific renderer produces the final prompt. Host transport, exact-one-reference, exact-one-output, QA, approval, and import gates remain authoritative.

**Tech Stack:** CommonJS Node.js, Electron main-process services, Node native test runner, existing Creator Studio plugin libraries.

## Global Constraints

- Every real Provider image request contains exactly one validated reference image.
- Every deliverable request asks for exactly one Provider output and fails closed on ambiguous output count.
- `gpt-image-2` prompts use an opaque uniform background followed by local background removal; they never promise direct transparency.
- The Hatch Pet model may supply bounded visual changes but may not write the final Provider prompt.
- Reference evidence controls identity; action semantics control non-idle pose; model capabilities control background and request-language behavior.
- Every action-sheet frame receives one explicit cell beat.
- No prompt assumes ears, paws, a tail, wings, clothing, or other anatomy not known from the reference.
- Existing QA thresholds, human approval, import, activation, and production-art claim gates are not weakened.
- Development occurs without running tests in the dev worktree; all commands below are for the independent test branch required by the user.

---

### Task 1: Visual Plan And Model Capability Registry

**Files:**
- Create: `examples/plugins/creator-studio/lib/visual-plan.js`
- Create: `examples/plugins/creator-studio/lib/image-model-capabilities.js`
- Test: `tests/examples/creator-studio-provider-image-prompt-system.test.js`

**Interfaces:**
- Produces: `createVisualPlan(input) -> frozen VisualPlan v1`
- Produces: `resolveImageModelCapabilities(model) -> frozen capability profile`
- Produces: `createImagePromptCapabilityError(code, message)`

- [ ] **Step 1: Add independent-branch failing tests**

```js
test('visual plan removes product intent and keeps bounded visible changes', () => {
  const plan = createVisualPlan({
    appearanceIntent: ['Create a reusable desktop pet named Moss'],
    requestedChanges: ['make the scarf visibly blue']
  })
  assert.deepEqual(plan.subject.requestedVisibleChanges, ['make the scarf visibly blue'])
  assert.doesNotMatch(JSON.stringify(plan), /reusable|desktop pet|named/i)
})

test('gpt-image-2 resolves opaque downstream-cutout capability', () => {
  const profile = resolveImageModelCapabilities('gpt-image-2')
  assert.equal(profile.promptRenderer, 'gpt-image-2-v1')
  assert.equal(profile.cutoutStrategy, 'solid-background-then-local-removal')
  assert.equal(profile.supportsDirectTransparency, false)
})

test('missing image model fails closed', () => {
  assert.throws(
    () => resolveImageModelCapabilities(''),
    (error) => error.code === 'image_prompt_capability_conflict'
  )
})
```

- [ ] **Step 2: Independent branch runs the focused test and confirms RED**

Run:

```bash
node --test tests/examples/creator-studio-provider-image-prompt-system.test.js
```

Expected: FAIL because the two modules do not exist.

- [ ] **Step 3: Implement bounded visual semantics**

`visual-plan.js` must:

- sanitize arrays using existing visual-directive behavior;
- discard product-only phrases such as reusable, desktop pet, named, activation, packaging, runtime, and approval;
- preserve only explicit requested visible changes;
- normalize action direction, animation type, primary motion, secondary motion, forbidden motion, locked features, composition, and `isolated-cutout-ready` intent;
- return `version: 1` and deep-freeze the result.

- [ ] **Step 4: Implement capability profiles**

Register exact profiles for:

```js
{
  id: 'gpt-image-2',
  promptRenderer: 'gpt-image-2-v1',
  imageConditioning: 'required',
  supportsDirectTransparency: false,
  cutoutStrategy: 'solid-background-then-local-removal',
  supportsDedicatedNegativePrompt: false,
  requestedOutputCount: 1
}
```

and a conservative `generic-image-edit-v1` runtime profile for non-empty models that already passed the host image-model eligibility gate. Empty model selection still fails closed.

- [ ] **Step 5: Independent branch verifies GREEN and commits**

```bash
node --test tests/examples/creator-studio-provider-image-prompt-system.test.js
git add examples/plugins/creator-studio/lib/visual-plan.js examples/plugins/creator-studio/lib/image-model-capabilities.js tests/examples/creator-studio-provider-image-prompt-system.test.js
git commit -m "feat: add image prompt visual plans and capabilities"
```

### Task 2: ProviderImageTask v3 And Complete Action Semantics

**Files:**
- Modify: `examples/plugins/creator-studio/lib/provider-image-task.js`
- Modify: `examples/plugins/creator-studio/lib/action-semantics.js`
- Modify: `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`
- Test: `tests/examples/creator-studio-provider-image-prompt-system.test.js`
- Test: `tests/examples/creator-studio-anchor-prompt-builder.test.js`

**Interfaces:**
- `createProviderImageTask(input)` returns version 3.
- Action fields: `animationType`, `viewDirection`, `loopType`, `secondaryMotion`, `forbiddenMotion`, `frameBeats`.
- `buildActionFramePlan({ action, frameCount })` returns exactly `frameCount` strings.

- [ ] **Step 1: Add failing schema and frame-coverage tests**

```js
test('provider image task v3 preserves complete action semantics', () => {
  const task = createProviderImageTask({
    taskType: 'action-frame-sheet',
    stage: 'final',
    sheet: { frameCount: 6, columns: 3, rows: 2 },
    action: {
      name: 'running right',
      animationType: 'locomotion_loop',
      viewDirection: 'viewer-right',
      loopType: 'seamless in-place cycle',
      movingParts: ['locomotion appendages'],
      secondaryMotion: ['small body rise and fall'],
      lockedParts: ['face'],
      forbiddenMotion: ['translation across canvas'],
      loopIntent: 'return to frame 1',
      frameBeats: buildActionFramePlan({ action: { animationType: 'locomotion_loop' }, frameCount: 6 })
    }
  })
  assert.equal(task.version, 3)
  assert.equal(task.action.frameBeats.length, 6)
  assert.equal(task.action.viewDirection, 'viewer-right')
})
```

- [ ] **Step 2: Confirm RED on the independent branch**

Expected failures: unknown action keys and incomplete frame coverage.

- [ ] **Step 3: Upgrade the action schema**

Validate every new field, reject duplicate or non-contiguous frame numbers, and derive cell coordinates from declared sheet geometry. Retain a compatibility input alias from old `framePlan` to new `frameBeats`, but store only `frameBeats` in v3 output.

- [ ] **Step 4: Replace sparse frame plans**

Implement deterministic phase allocation for locomotion, vertical bounce, stationary loop, pose transition, emote, and reaction. A returned item must describe one frame only; ranges such as `Frames 7-12` are forbidden.

- [ ] **Step 5: Preserve all semantics in `createVisualAction`**

```js
return {
  name,
  animationType: inferAnimationType(action),
  moment,
  viewDirection: resolveViewDirection(action),
  loopType: action.loopType || resolveLoopIntent(action),
  movingParts,
  secondaryMotion: action.secondaryMotion || [],
  lockedParts,
  forbiddenMotion: action.forbiddenMotion || [],
  loopIntent: resolveLoopIntent(action),
  frameBeats: buildActionFramePlan({ action, frameCount })
}
```

- [ ] **Step 6: Independent branch verifies focused suites and commits**

```bash
node --test tests/examples/creator-studio-provider-image-prompt-system.test.js tests/examples/creator-studio-anchor-prompt-builder.test.js
git add examples/plugins/creator-studio/lib/provider-image-task.js examples/plugins/creator-studio/lib/action-semantics.js examples/plugins/creator-studio/lib/anchor-prompt-builder.js tests/examples/creator-studio-provider-image-prompt-system.test.js tests/examples/creator-studio-anchor-prompt-builder.test.js
git commit -m "feat: preserve complete image action semantics"
```

### Task 3: Prompt Clause IR And Model-Specific Renderers

**Files:**
- Create: `examples/plugins/creator-studio/lib/provider-image-prompt-clauses.js`
- Create: `examples/plugins/creator-studio/lib/gpt-image-2-prompt-renderer.js`
- Create: `examples/plugins/creator-studio/lib/generic-image-prompt-renderer.js`
- Modify: `examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js`
- Test: `tests/examples/creator-studio-provider-image-prompt-system.test.js`

**Interfaces:**
- `buildProviderImagePromptClauses({ task, visualPlan, capabilities, qualityGuidance })`
- `renderGptImage2Prompt({ task, clauses, capabilities })`
- `renderGenericImagePrompt({ task, clauses, capabilities })`
- `compileProviderImagePrompt({ task, model, visualPlan, qualityGuidance })`

- [ ] **Step 1: Add failing golden-contract tests**

Assert that a GPT Image 2 keyframe prompt contains sections in this order:

```text
DELIVERABLE
REFERENCE
CHANGE
PRESERVE
COMPOSITION
ACTION PLAN
BACKGROUND
CONSTRAINTS
```

Also assert:

- no `transparent` text;
- `CHANGE` controls non-idle pose;
- `PRESERVE` contains identity locks;
- background is uniform and opaque for downstream removal;
- no assumed ears, paws, tail, wings, or clothing;
- no internal product terms.

- [ ] **Step 2: Confirm RED on the independent branch**

Expected: old compiler emits an unlabeled generic prompt and transparent-background language.

- [ ] **Step 3: Implement clause construction**

Each clause has:

```js
{ id, category, source, scope, priority, enabled, text }
```

Deduplicate by `id`, sort by normative category order then priority, and reject contradictory pose/background clauses.

- [ ] **Step 4: Implement GPT Image 2 renderer**

Render short labeled sections. Frame sheets render every `frameBeat` as `Cell N — ...`. Unused cells use the same opaque background and contain no character pixels.

- [ ] **Step 5: Implement conservative generic renderer**

Use the same section order and semantic responsibilities. Only a registered capability with `supportsDirectTransparency: true` may render transparent-background language.

- [ ] **Step 6: Refactor compiler orchestration**

Compiler version becomes 3. It resolves the model profile, normalizes visual plan and task, builds clauses, selects the renderer, validates the final prompt, and returns provenance including renderer, capability profile, clause IDs, background strategy, and frame-beat count.

- [ ] **Step 7: Independent branch verifies and commits**

```bash
node --test tests/examples/creator-studio-provider-image-prompt-system.test.js
git add examples/plugins/creator-studio/lib/provider-image-prompt-clauses.js examples/plugins/creator-studio/lib/gpt-image-2-prompt-renderer.js examples/plugins/creator-studio/lib/generic-image-prompt-renderer.js examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js tests/examples/creator-studio-provider-image-prompt-system.test.js
git commit -m "feat: render capability-aware image prompts"
```

### Task 4: Builder And Host Bridge Integration

**Files:**
- Modify: `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`
- Modify: `examples/plugins/creator-studio/lib/openpet-prompt-builder.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Test: `tests/examples/creator-studio-plugin.test.js`
- Test: `tests/examples/creator-studio-host-model-bridge.test.js`
- Test: `tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js`

**Interfaces:**
- All prompt-builder entry points accept `model` and optional bounded `visualPlan`.
- `PROMPT_BUILDER_VERSION` becomes 6.
- Host bridge passes the configured or selected model before every prompt compile.

- [ ] **Step 1: Add failing integration assertions**

Prove that character, keyframe, sprite-row, single-action, and full-pet prompts:

- record renderer `gpt-image-2-v1` when model is `gpt-image-2`;
- preserve direction and forbidden motion;
- contain one cell beat per frame;
- do not include raw `characterBrief` product language;
- retain exactly-one-reference evidence.

- [ ] **Step 2: Confirm RED on the independent branch**

- [ ] **Step 3: Integrate bounded visual plans**

Replace direct `appearanceIntent: [characterBrief]` construction with `createVisualPlan`. Existing Hatch Pet `requestedChanges` become bounded `requestedVisibleChanges`; empty plans use reference-only preservation.

- [ ] **Step 4: Pass the selected model into every prompt build**

Update character anchors, action anchors, start/peak keyframes, keyframe-conditioned sprite rows, base single-action generation, full-pet generation, repair, and fallback compilation paths.

A fallback to a different model must recompile from the same task and visual plan using that model's registered renderer before making the request.

- [ ] **Step 5: Preserve safe evidence**

Dashboard-safe prompt provenance includes task version, compiler version, builder version, renderer, capability profile, clause IDs, background strategy, reference count, output count, and frame-beat count.

- [ ] **Step 6: Independent branch verifies and commits**

```bash
node --test tests/examples/creator-studio-plugin.test.js tests/examples/creator-studio-host-model-bridge.test.js tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js
git add examples/plugins/creator-studio/lib/anchor-prompt-builder.js examples/plugins/creator-studio/lib/openpet-prompt-builder.js examples/plugins/creator-studio/lib/host-model-bridge.js tests/examples/creator-studio-plugin.test.js tests/examples/creator-studio-host-model-bridge.test.js tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js
git commit -m "feat: integrate gpt image prompt rendering"
```

### Task 5: Scoped Quality Guidance And Smallest-Delta Repair

**Files:**
- Modify: `examples/plugins/creator-studio/lib/pet-generation-human-examples.js`
- Modify: `examples/plugins/creator-studio/lib/provider-image-prompt-clauses.js`
- Modify: repair call sites in `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Test: `tests/examples/creator-studio-pet-generation-human-examples.test.js`
- Test: `tests/examples/creator-studio-provider-image-prompt-system.test.js`

**Interfaces:**
- `createQualityGuidanceLines({ qualityGuidance, actionId, animationType, repairScope })`
- repair compiler accepts one bounded correction and emits `CHANGE ONLY` plus `KEEP UNCHANGED`.

- [ ] **Step 1: Add failing scope tests**

Prove direction mismatch does not enter idle prompts, static-motion guidance does not enter single-image prompts, and edge/background guidance may remain global.

- [ ] **Step 2: Add failing repair tests**

Prove a repair prompt contains exactly one observable correction, does not append old prompt history, and restates all preservation invariants.

- [ ] **Step 3: Implement guidance scopes**

Resolve general reasons separately from animation-type and action-specific reasons. Keep existing registry files readable and derive scope deterministically from reason semantics and action metadata.

- [ ] **Step 4: Implement repair clause replacement**

Map supported QA reason codes to one repair clause. Reject multiple unrelated corrections with `image_prompt_repair_scope_invalid`.

- [ ] **Step 5: Independent branch verifies and commits**

```bash
node --test tests/examples/creator-studio-pet-generation-human-examples.test.js tests/examples/creator-studio-provider-image-prompt-system.test.js
git add examples/plugins/creator-studio/lib/pet-generation-human-examples.js examples/plugins/creator-studio/lib/provider-image-prompt-clauses.js examples/plugins/creator-studio/lib/host-model-bridge.js tests/examples/creator-studio-pet-generation-human-examples.test.js tests/examples/creator-studio-provider-image-prompt-system.test.js
git commit -m "feat: scope image quality and repair prompts"
```

### Task 6: Documentation, Repository Verification, And Independent Test Handoff

**Files:**
- Modify: `docs/pet-character-generation.md`
- Create: `docs/superpowers/plans/2026-07-17-gpt-image-2-prompt-system-test-handoff.md`

**Interfaces:**
- Canonical docs distinguish Provider opaque output from final transparent cutout artifacts.
- Test handoff pins the exact production commit and verification commands.

- [ ] **Step 1: Update canonical documentation**

Document task v3, compiler v3, builder v6, capability-aware rendering, opaque-background removal, complete frame beats, repair scoping, and the continued independent visual-approval boundary.

- [ ] **Step 2: Perform dev-branch static review only**

Allowed in the development worktree:

```bash
git diff --check
git status --short --branch
```

Do not run automated or real Provider tests in the development worktree.

- [ ] **Step 3: Commit implementation and documentation**

Stage only files owned by this task. Do not stage the pre-existing changes in:

```text
src/main/services/ai-service.js
tests/services/ai-service.test.js
tests/services/creator-studio-default-flow-service.test.js
```

- [ ] **Step 4: Independent test branch verification**

The tester runs:

```bash
npm run check:syntax
node --test tests/examples/creator-studio-provider-image-prompt-system.test.js
node --test tests/examples/creator-studio-anchor-prompt-builder.test.js tests/examples/creator-studio-plugin.test.js
node --test tests/examples/creator-studio-host-model-bridge.test.js tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js
node --test tests/examples/creator-studio-pet-generation-human-examples.test.js
npm run test:core
npm run test:control-center
npm run test:core:all
```

Real Provider verification must additionally prove one reference per request, `n=1`, opaque GPT Image 2 output, successful local cutout, readable action frames, no board-layout copying, and explicit human approval before any production-art claim.

- [ ] **Step 5: Record truthful status**

Development branch status is `implemented but independently unverified` until the separate test branch reports fresh automated and visual evidence.
