# Creator Studio Anchor Reference Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an image-first anchor-reference chain so Create can turn a user pet image and optional description into inspectable character/action anchors before final action generation.

**Architecture:** Creator Studio will build a deterministic single-image composite reference board inside the run workspace, generate a character anchor from that board, generate action anchors from the character anchor, and use the most specific anchor as provider conditioning for final action calls. The provider bridge will send one reference image per edit request and record anchor provenance in run artifacts and conditioning summaries.

**Tech Stack:** Node.js, Electron main process services, Creator Studio plugin CommonJS modules, `sharp`, Node native test runner, React/Vite Control Center.

## Global Constraints

- The source image is the highest identity authority.
- User description can add intent but must not override visible identity from the image.
- Provider edit calls should send exactly one reference image in the default Create path.
- Anchor artifacts must be written inside the Creator Studio run workspace.
- Preview-only full-pet rows must not be claimed as official-quality action rows.
- API keys must remain host-owned and must not be exposed to renderer or plugins.
- Do not edit the protected primary main worktree.

---

### Task 1: Composite Reference Board

**Files:**
- Create: `examples/plugins/creator-studio/lib/anchor-reference-board.js`
- Test: `tests/examples/creator-studio-anchor-reference-board.test.js`

**Interfaces:**
- Produces: `async buildAnchorReferenceBoard({ dataDir, runId, sourceReferences, characterBrief, outputRelativeDir = "runs/<runId>/inputs/anchors" })`
- Returns: `{ role, path, relativePath, metadataPath, metadataRelativePath, width, height, sourceCount, characterBrief }`

- [ ] **Step 1: Write failing tests**

Create tests that build a tiny source PNG with `sharp`, call `buildAnchorReferenceBoard`, and assert:

```js
assert.equal(result.role, 'composite-reference-board')
assert.equal(result.width, 1024)
assert.equal(result.height, 1024)
assert.match(result.relativePath, /^runs\/run-anchor\/inputs\/anchors\/composite-reference-board\.png$/)
assert.ok(fs.existsSync(result.path))
assert.ok(fs.existsSync(result.metadataPath))
assert.equal(JSON.parse(fs.readFileSync(result.metadataPath, 'utf8')).sourceCount, 1)
```

Also assert path traversal is rejected when `outputRelativeDir` escapes `dataDir`.

- [ ] **Step 2: Verify red**

Run: `node --test tests/examples/creator-studio-anchor-reference-board.test.js`

Expected: FAIL with `Cannot find module '../.../anchor-reference-board'`.

- [ ] **Step 3: Implement minimal board builder**

Implement `buildAnchorReferenceBoard` using `sharp` to create a `1024x1024` PNG, fit the first source image into a large centered panel, write metadata JSON, and enforce paths inside `dataDir`.

- [ ] **Step 4: Verify green**

Run: `node --test tests/examples/creator-studio-anchor-reference-board.test.js`

Expected: PASS.

### Task 2: Anchor Prompt Builder

**Files:**
- Create: `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`
- Test: `tests/examples/creator-studio-anchor-prompt-builder.test.js`

**Interfaces:**
- Produces: `buildCharacterAnchorPrompt({ characterBrief, referenceRole })`
- Produces: `buildActionAnchorPrompt({ characterBrief, action, referenceRole })`
- Both return `{ role, prompt, warnings }`

- [ ] **Step 1: Write failing tests**

Assert the character prompt contains:

```js
assert.match(prompt.prompt, /source image is the highest identity authority/i)
assert.match(prompt.prompt, /If the written description conflicts with the reference image, follow the reference image/i)
assert.match(prompt.prompt, /do not copy.*board layout/i)
```

Assert the action prompt contains stable anchor language and the requested action id/name.

- [ ] **Step 2: Verify red**

Run: `node --test tests/examples/creator-studio-anchor-prompt-builder.test.js`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement prompt builder**

Use existing `sanitizeCreativeBrief` from `openpet-prompt-builder`, keep prompts concise, and return role metadata.

- [ ] **Step 4: Verify green**

Run: `node --test tests/examples/creator-studio-anchor-prompt-builder.test.js`

Expected: PASS.

### Task 3: Provider Bridge Anchor Selection

**Files:**
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Test: `tests/examples/creator-studio-host-model-bridge-anchor.test.js`

**Interfaces:**
- Produces: `resolveRunReferenceImages({ dataDir, run, stage = "final", actionId = "" })`
- Default final stage chooses action anchor, then character anchor, then composite board, then original reference.
- Character anchor stage chooses composite board, then original reference.
- Action anchor stage chooses character anchor, then composite board, then original reference.

- [ ] **Step 1: Write failing tests**

Create run JSON-like objects with `run.artifacts.anchorReferences` and assert `resolveRunReferenceImages` returns exactly one reference with the expected role for each stage.

- [ ] **Step 2: Verify red**

Run: `node --test tests/examples/creator-studio-host-model-bridge-anchor.test.js`

Expected: FAIL because `resolveRunReferenceImages` is not exported or does not accept stage.

- [ ] **Step 3: Implement selection and export**

Update the resolver to read safe relative paths from `anchorReferences` and always return at most one item.

- [ ] **Step 4: Verify green**

Run: `node --test tests/examples/creator-studio-host-model-bridge-anchor.test.js`

Expected: PASS.

### Task 4: Anchor Generation Stages

**Files:**
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Test: `tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js`

**Interfaces:**
- Produces: `generateAnchorReferences({ dataDir, run, settings, selectedModel, requestedTimeoutMs, originalReferenceImages })`
- Returns: `{ anchorReferences, anchorGeneration }`

- [ ] **Step 1: Write failing tests**

Stub host bridge calls so the generator returns fake outputs and assert:

```js
assert.equal(result.anchorReferences.sourcePriority, 'image-first')
assert.equal(result.anchorReferences.compositeBoard.role, 'composite-reference-board')
assert.equal(result.anchorReferences.characterAnchor.role, 'character-anchor')
assert.equal(result.anchorReferences.actionAnchors[0].role, 'action-anchor')
```

- [ ] **Step 2: Verify red**

Run: `node --test tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js`

Expected: FAIL because `generateAnchorReferences` does not exist.

- [ ] **Step 3: Implement minimal stage orchestration**

Build the composite board locally, call provider once for character anchor, call provider once per run action for action anchors, write prompt files, and record model attempts.

- [ ] **Step 4: Verify green**

Run: `node --test tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js`

Expected: PASS.

### Task 5: Workflow Artifact Persistence

**Files:**
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Modify: `src/main/services/creator-workflow-service.js`
- Test: `tests/services/creator-workflow-service.test.js`
- Test: `tests/examples/creator-studio-backend-runner-anchor-artifacts.test.js`

**Interfaces:**
- Consumes: `generationResult.anchorReferences`
- Produces: `run.artifacts.anchorReferences`
- Diagnostics include reference role/file names through existing conditioning metadata.

- [ ] **Step 1: Write failing tests**

Assert generated runs persist `artifacts.anchorReferences` when the generation result provides it.

- [ ] **Step 2: Verify red**

Run: `node --test tests/examples/creator-studio-backend-runner-anchor-artifacts.test.js`

Expected: FAIL because artifacts are not persisted.

- [ ] **Step 3: Implement persistence**

Merge `generationResult.anchorReferences` into run artifacts in `persistGeneratedImageAttempt`, `buildHostGeneratedActionOutput`, and `buildHostGeneratedRunOutput`.

- [ ] **Step 4: Verify green**

Run: `node --test tests/examples/creator-studio-backend-runner-anchor-artifacts.test.js tests/services/creator-workflow-service.test.js`

Expected: PASS.

### Task 6: Create UI Copy

**Files:**
- Modify: `src/control-center/src/panes/CreatorPane.tsx`
- Test: existing Control Center or static text test if present; otherwise add `tests/control-center/creator-pane-copy.test.js` only if the test harness already supports it.

**Interfaces:**
- Produces UI copy saying users upload a clear source image and OpenPet internally prepares anchors.

- [ ] **Step 1: Write failing text check**

Use an existing React/static test pattern if available; otherwise add a Node text regression that reads `CreatorPane.tsx` and rejects `不要使用拼图、三视图或多视图合成图`.

- [ ] **Step 2: Verify red**

Run the new text regression.

Expected: FAIL on current contradictory copy.

- [ ] **Step 3: Update copy**

Replace copy with image-first wording and internal anchor wording.

- [ ] **Step 4: Verify green**

Run the text regression.

Expected: PASS.

### Task 7: Focused Regression And Syntax

**Files:**
- No new files.

**Interfaces:**
- Verifies all changed behavior.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --test tests/examples/creator-studio-anchor-reference-board.test.js \
  tests/examples/creator-studio-anchor-prompt-builder.test.js \
  tests/examples/creator-studio-host-model-bridge-anchor.test.js \
  tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js \
  tests/examples/creator-studio-backend-runner-anchor-artifacts.test.js \
  tests/services/creator-workflow-service.test.js
```

- [ ] **Step 2: Run existing affected tests**

Run:

```bash
node --test tests/examples/creator-studio-action-frame-builder.test.js \
  tests/examples/creator-studio-real-atlas-builder.test.js \
  tests/services/image-generation-model-service.test.js \
  tests/services/provider-model-catalog.test.js
```

- [ ] **Step 3: Run syntax check**

Run: `npm run check:syntax`

Expected: PASS.

- [ ] **Step 4: Commit**

Commit only anchor-related implementation and tests after green.
