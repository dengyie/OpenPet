# Provider-Neutral Reference-Conditioned Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Creator Studio and Hatch Pet image request use exactly one validated reference image and a self-contained, provider-neutral visual brief with explicit output dimensions and aspect ratio.

**Architecture:** Add a pure typed image-task compiler at the Creator Studio prompt boundary, then migrate character, keyframe, action-sheet, base-image, fallback, retry, and repair paths to it. Enforce the reference invariant independently in the Creator bridge, host bridge, and image service so no supported path can issue a text-only generation request.

**Tech Stack:** Electron main process, Node.js CommonJS, Creator Studio plugin bridge, OpenAI-compatible multipart image edits, Sharp-based local reference boards, JSON evidence.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-15-provider-neutral-reference-conditioned-image-generation-design.md`.
- Work only in `/Users/mango/.codex/worktrees/ff3f/OpenPet` on `codex/dev8`; preserve all existing history and do not push, merge, rebase, reset, or clean.
- Do not modify the protected main worktree or any other development/test worktree.
- Do not run tests, builds, syntax checks, Provider calls, browser checks, image generation, or visual acceptance on `codex/dev8`.
- Use static inspection only on the development branch: `git diff --check`, scoped `rg`, scoped `sed`, and `git diff`.
- All automated and real-image verification belongs to the existing independent test task on `codex/dev8-hatch-pet-phase1-test` after development commits are complete.
- Every real image request must contain exactly one usable reference image and request exactly one output.
- Zero-reference generation, text-only fallback, `/images/generations`, and `image[]` are illegal for supported Creator Studio and Hatch Pet generation.
- Output dimensions and aspect ratio come from the typed task; reference-board dimensions never override them.
- Final upstream prompts must not contain `OpenPet`, Provider/transport terms, run IDs, action IDs, role tokens, file paths, checkpoint terms, or model-selection metadata.
- Hatch Pet may select registered strategies and bounded changes but cannot send or append raw Provider prompts.
- Deterministic QA, model evaluation, human approval, import, activation, and production-readiness gates remain authoritative.
- End each development task with one focused commit. Do not include test-branch changes in development commits.

---

## File Map

| File | Responsibility |
| --- | --- |
| `examples/plugins/creator-studio/lib/provider-image-task.js` | Typed image-task normalization, reference-interpretation mapping, dimensions, and safe visual directives |
| `examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js` | Pure project-neutral prompt compilation and forbidden-term validation |
| `examples/plugins/creator-studio/lib/anchor-prompt-builder.js` | Compatibility wrappers that create typed tasks and delegate to the compiler |
| `examples/plugins/creator-studio/lib/openpet-prompt-builder.js` | Existing dashboard/spec metadata plus provider-neutral base-image prompt delegation |
| `examples/plugins/creator-studio/lib/host-model-bridge.js` | Exactly-one preflight, task construction, retry/fallback reference preservation, prompt provenance |
| `src/main/services/plugin-service.js` | Creator bridge exact-one reference validation before path resolution |
| `src/main/services/image-generation-model-service.js` | Final exact-one regular-file gate and unconditional multipart `/images/edits` transport |
| `src/main/services/creator-workflow-service.js` | Missing-reference input behavior and project-neutral task descriptions |
| `examples/plugins/creator-studio/lib/generation-task.js` | Remove legal real `textOnly` style-source behavior |
| `examples/plugins/creator-studio/service/studio-service.js` | Safe compiler provenance for dashboard clients |
| `docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase2-identity-single-action.md` | Exact-one-reference and compiler prerequisite alignment |
| `docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase3-full-pet-orchestration.md` | Full-pet reference/prompt invariant alignment |
| `docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase4-verification-rollout.md` | Independent verification requirements and one-shot image-agent evidence |
| `docs/superpowers/plans/2026-07-15-provider-neutral-image-generation-test-handoff.md` | Exact independent test instructions for the existing test task |

---

### Task 1: Add Typed Provider Image Tasks

**Files:**
- Create: `examples/plugins/creator-studio/lib/provider-image-task.js`

**Interfaces:**
- Consumes: run/action data already sanitized by Creator Studio, `canvas`, `sheet`, `referenceRole`, and registered strategy directives.
- Produces: `createProviderImageTask(input)`, `resolveReferenceInterpretation(referenceRole)`, `createCanvas({ width, height })`, `resolveProviderCanvasForLayout({ columns, rows })`, `sanitizeVisualDirective(value)`, and constants used by the prompt compiler.

- [ ] **Step 1: Define strict task enums and bounds**

Create immutable sets and limits:

```js
const TASK_TYPES = new Set(['character-image', 'action-keyframe', 'action-frame-sheet'])
const STAGES = new Set(['identity', 'start', 'peak', 'final', 'repair'])
const REFERENCE_TYPES = new Set(['single-character', 'identity-comparison', 'identity-and-motion'])
const MAX_VISUAL_DIRECTIVE_LENGTH = 240
const MAX_VISUAL_DIRECTIVES = 12
const MIN_CANVAS_EDGE = 64
const MAX_CANVAS_EDGE = 4096
const PROVIDER_CANVASES = Object.freeze({
  square: { width: 1024, height: 1024 },
  landscape: { width: 1536, height: 1024 },
  portrait: { width: 1024, height: 1536 }
})
```

Reject unknown task/stage/reference types and clamp neither dimensions nor sheet geometry silently.

- [ ] **Step 2: Translate internal reference roles into visible descriptions**

Implement an exact mapping that does not return internal role strings:

```js
const resolveReferenceInterpretation = (referenceRole = '') => {
  const role = String(referenceRole || '').trim().toLowerCase()
  if (role === 'full-pet-action-identity-board') {
    return {
      type: 'identity-comparison',
      primaryRegion: 'the larger primary character view',
      secondaryRegion: 'the smaller source-detail view',
      ignorePresentationLayout: true
    }
  }
  if (/keyframe-action-reference-board|action-peak-conditioning-board/.test(role)) {
    return {
      type: 'identity-and-motion',
      primaryRegion: 'the identity view',
      secondaryRegion: 'the ordered pose examples',
      ignorePresentationLayout: true
    }
  }
  return {
    type: 'single-character',
    primaryRegion: 'the attached character',
    secondaryRegion: '',
    ignorePresentationLayout: false
  }
}
```

The mapping consumes role names only inside code; they never appear in the returned natural-language prompt.

- [ ] **Step 3: Normalize exact canvas and sheet geometry**

Implement:

```js
const createCanvas = ({ width, height }) => {
  const normalizedWidth = Number(width)
  const normalizedHeight = Number(height)
  if (!Number.isInteger(normalizedWidth) || normalizedWidth < MIN_CANVAS_EDGE || normalizedWidth > MAX_CANVAS_EDGE) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task width is invalid')
  }
  if (!Number.isInteger(normalizedHeight) || normalizedHeight < MIN_CANVAS_EDGE || normalizedHeight > MAX_CANVAS_EDGE) {
    throw createTaskError('image_prompt_contract_invalid', 'Image task height is invalid')
  }
  return {
    width: normalizedWidth,
    height: normalizedHeight,
    aspectRatio: reduceRatio(normalizedWidth, normalizedHeight)
  }
}
```

For an action sheet, require `frameCount >= 1`, `columns >= 1`, `rows >= 1`, and `columns * rows >= frameCount`.

Export `resolveProviderCanvasForLayout({ columns, rows })`: use the landscape canvas when columns exceed rows, portrait when rows exceed columns, and square when equal. The returned aspect ratio always describes the actual requested Provider canvas, while the prompt separately states the exact grid geometry.

- [ ] **Step 4: Sanitize visual-only directives**

`sanitizeVisualDirective` must remove control characters, paths, URLs, secret-like tokens, internal identifiers, and product/transport words. It returns an empty string for directives that become meaningless.

```js
const INTERNAL_VISUAL_TEXT = /\b(?:openpet|provider|backend|run[-_ ]?id|action[-_ ]?id|checkpoint|multipart|reference[-_ ]?role)\b/gi

const sanitizeVisualDirective = (value) => String(value || '')
  .replace(/[\u0000-\u001F\u007F]/g, ' ')
  .replace(/https?:\/\/\S+/gi, ' ')
  .replace(/(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\/\S+/g, ' ')
  .replace(INTERNAL_VISUAL_TEXT, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, MAX_VISUAL_DIRECTIVE_LENGTH)
```

- [ ] **Step 5: Create the strict task constructor**

Return a frozen normalized object and allow only the documented fields. Do not preserve user-facing character names, run labels, file names, or arbitrary prompt paragraphs.

- [ ] **Step 6: Inspect and commit**

```bash
git diff --check
rg -n "OpenPet|Provider|runId|actionId|referenceRole" examples/plugins/creator-studio/lib/provider-image-task.js
git diff -- examples/plugins/creator-studio/lib/provider-image-task.js
git add examples/plugins/creator-studio/lib/provider-image-task.js
git commit -m "feat add typed provider image tasks"
```

The `rg` result may contain only internal input mapping and validation code, never emitted visual strings.

---

### Task 2: Add The Provider-Neutral Prompt Compiler

**Files:**
- Create: `examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js`
- Consumes: `examples/plugins/creator-studio/lib/provider-image-task.js`

**Interfaces:**
- Consumes: `compileProviderImagePrompt({ task, qualityGuidance })` with a normalized task.
- Produces: `{ version: 1, taskType, text, safeSummary, warnings }`.

- [ ] **Step 1: Define forbidden upstream terminology**

Use phrase-aware checks so normal visual terms remain legal:

```js
const FORBIDDEN_PROMPT_PATTERNS = Object.freeze([
  /\bOpenPet\b/i,
  /\bProvider\b/i,
  /\bbackend\b/i,
  /\b(?:run|action)[-_ ]?id\b/i,
  /\breference[-_ ]?role\b/i,
  /\bcheckpoint\b/i,
  /\bmultipart\b/i,
  /(?:\/Users|\/var|\/tmp|\/private|\/Volumes)\//i
])
```

`assertProviderNeutralPrompt(text)` throws an error with code `image_prompt_internal_term`; it does not return a partially safe prompt.

- [ ] **Step 2: Compile the reference paragraph from visible regions**

Implement three bounded variants:

```js
const createReferenceParagraph = (reference) => {
  if (reference.type === 'identity-comparison') {
    return 'Use the attached image as the complete visual reference. It contains a larger primary character view and a smaller source-detail view. Match the pose scale and framing of the larger view while preserving the visible face, eyes, markings, colors, accessories, material or fur texture, body proportions, silhouette, lighting, and rendering style shown across the reference.'
  }
  if (reference.type === 'identity-and-motion') {
    return 'Use the attached image as the complete visual reference. It contains one identity view followed by ordered pose examples. Use the identity view for appearance and the pose examples for motion timing. Do not reproduce the reference layout.'
  }
  return 'Use the attached character as the exact identity and visual-style reference. Preserve every clearly visible identity feature and follow the image when written appearance details conflict with it.'
}
```

- [ ] **Step 3: Compile a single-character/keyframe brief**

The first line must state exact output dimensions and ratio. The prompt must describe one full-body character, action moment, occupancy, lower-center placement, safe padding, transparency, and task-specific exclusions.

```js
const createSingleImageBrief = (task) => [
  `Create exactly one ${task.canvas.width} x ${task.canvas.height} image with a ${task.canvas.aspectRatio} aspect ratio.`,
  createSingleImageGoal(task),
  createReferenceParagraph(task.referenceInterpretation),
  createIdentityLock(task),
  createFramingParagraph(task.subject),
  'Return a clean isolated character on a transparent background.',
  createSingleImageExclusions(task)
].filter(Boolean).join('\n\n')
```

- [ ] **Step 4: Compile a complete action-frame-sheet brief**

State exact canvas, frame count, columns, rows, reading order, required motion moments, stable identity/scale/root, transparent empty cells, and no visible dividers.

Do not use internal action IDs. Use the normalized visual action name only when it survives visual-text sanitization.

- [ ] **Step 5: Compile bounded human guidance and strategy directives**

Only sanitized visual directives may be appended. Reapply fixed count, canvas, reference, identity, transparency, and exclusion paragraphs after strategy composition so model-requested changes cannot weaken them.

- [ ] **Step 6: Return safe provenance**

```js
const safeSummary = {
  promptCompilerVersion: 1,
  taskType: task.taskType,
  stage: task.stage,
  width: task.canvas.width,
  height: task.canvas.height,
  aspectRatio: task.canvas.aspectRatio,
  referenceImageCount: 1,
  requestedOutputCount: 1,
  promptSafety: 'provider-neutral'
}
```

- [ ] **Step 7: Inspect and commit**

```bash
git diff --check
rg -n "OpenPet|provider-generated|Reference role|Action ID|runId|checkpoint|multipart" examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js
git diff -- examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js
git add examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js
git commit -m "feat compile provider neutral image prompts"
```

Any forbidden term found by `rg` must be confined to the explicit forbidden-pattern list or comments describing rejection.

---

### Task 3: Migrate Anchor, Keyframe, And Action-Sheet Prompts

**Files:**
- Modify: `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`
- Modify: `examples/plugins/creator-studio/lib/openpet-prompt-builder.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`

**Interfaces:**
- Consumes: `createProviderImageTask`, `resolveReferenceInterpretation`, `compileProviderImagePrompt`.
- Produces: existing prompt-builder return shapes with new `promptCompilerVersion`, `safeSummary`, and project-neutral `prompt`/`providerPrompt`.

- [ ] **Step 1: Turn anchor prompt functions into compatibility wrappers**

Keep exported function names so call sites remain small. Each wrapper builds a typed task and delegates:

```js
const buildActionKeyframePrompt = ({
  referenceRole,
  action,
  keyframeRole = 'start',
  canvas = DEFAULT_IMAGE_CANVAS,
  qualityGuidance = null,
  strategy = null
} = {}) => {
  const task = createProviderImageTask({
    taskType: 'action-keyframe',
    stage: keyframeRole === 'start' ? 'start' : 'peak',
    canvas,
    referenceInterpretation: resolveReferenceInterpretation(referenceRole),
    subject: DEFAULT_FULL_BODY_SUBJECT,
    action: createVisualAction({ action, keyframeRole }),
    strategy
  })
  return compileProviderImagePrompt({ task, qualityGuidance })
}
```

Remove all existing upstream strings containing product, role, Provider, run, or action-ID terms.

- [ ] **Step 2: Pass task dimensions explicitly**

Every host-bridge prompt call receives the same `constraints` later sent to `creator.model-image-generate`. Single images use `DEFAULT_CONSTRAINTS`. Action sheets derive dimensions and aspect ratio from their sheet layout rather than from the reference image.

Add `constraints` to `callHostImageGenerate` and preserve it through fallback calls:

```js
const callHostImageGenerate = ({ prompt, requestedTimeoutMs, referenceImages, runId, dataRelativeDir, model, constraints }) => callBridge('/creator/model-image-generate', {
  model,
  prompt,
  timeoutMs: requestedTimeoutMs,
  referenceImages,
  output: { dataRelativeDir },
  constraints
})
```

- [ ] **Step 3: Compile base full-pet and legacy final prompts**

`buildOpenPetImagePrompt` may retain internal sections for local dashboard explanation, but its `providerPrompt` must come from `compileProviderImagePrompt`. Do not concatenate the old sections into the Provider prompt.

Return:

```js
{
  ...existingLocalMetadata,
  providerPrompt: compiled.text,
  promptCompiler: compiled.safeSummary,
  promptBuilderVersion: compiled.version
}
```

- [ ] **Step 4: Remove arbitrary candidate guidance concatenation**

Replace `Candidate guidance: ...` raw string concatenation with a registered bounded directive ID. Candidate variants provide arrays of visual directives that are sanitized by the typed task module and compiled inside fixed contracts.

- [ ] **Step 5: Store prompt files and previews from compiled text**

Continue writing confined prompt artifacts for reproducibility. Dashboard summaries expose `safeSummary`; previews use the existing bounded sanitizer and never include paths or secrets.

- [ ] **Step 6: Inspect and commit**

```bash
git diff --check
rg -n "Create.*OpenPet|provider-generated|Reference role:|Action ID:|Backend:|Model:" examples/plugins/creator-studio/lib/anchor-prompt-builder.js examples/plugins/creator-studio/lib/openpet-prompt-builder.js
git diff -- examples/plugins/creator-studio/lib/anchor-prompt-builder.js examples/plugins/creator-studio/lib/openpet-prompt-builder.js examples/plugins/creator-studio/lib/host-model-bridge.js
git add examples/plugins/creator-studio/lib/anchor-prompt-builder.js examples/plugins/creator-studio/lib/openpet-prompt-builder.js examples/plugins/creator-studio/lib/host-model-bridge.js
git commit -m "feat use provider neutral creator prompts"
```

The scoped `rg` must show no upstream prompt literals matching the forbidden forms.

---

### Task 4: Enforce Exactly One Reference At Every Host Boundary

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Modify: `src/main/services/image-generation-model-service.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`

**Interfaces:**
- Produces: `assertExactlyOneCreatorModelReferenceImage`, `assertExactlyOneReferenceImage`, stable error codes, unconditional `/images/edits` transport.

- [ ] **Step 1: Add stable contract-error helpers**

Use one helper per process boundary:

```js
const createReferenceContractError = (code, message) => {
  const error = new Error(message)
  error.code = code
  return error
}

const assertExactlyOneReferenceImage = (referenceImages) => {
  if (!Array.isArray(referenceImages) || referenceImages.length === 0) {
    throw createReferenceContractError('reference_image_required', 'Image generation requires exactly one reference image')
  }
  if (referenceImages.length !== 1) {
    throw createReferenceContractError('reference_image_count_invalid', 'Image generation requires exactly one reference image; compose multiple sources into one local reference image')
  }
}
```

- [ ] **Step 2: Apply the Creator plugin gate before path resolution**

In `sanitizeCreatorModelReferenceImages`, assert exact count before mapping or calling `resolvePluginDataPath`. Invalid objects use `reference_image_invalid`.

- [ ] **Step 3: Apply the host-bridge gate before fallback/model selection**

Replace `assertSingleProviderReferenceImage` with `assertExactlyOneProviderReferenceImage`. Call it at the top of `generateWithModelFallback` and `callHostImageGenerate`. Fallback and same-model retry reuse the same one-entry array.

- [ ] **Step 4: Apply the image-service gate before all side effects**

At the first line of `generateImage`, before config lookup, request ID creation, output directory creation, logging, or queue acquisition:

```js
assertExactlyOneReferenceImage(referenceImages)
```

Normalize immediately with the permitted data boundary and assert the normalized array still has exactly one regular file:

```js
const normalizedReferenceImages = normalizeReferenceImages(referenceImages, {
  dataDir: output?.dataDir
})
assertExactlyOneReferenceImage(normalizedReferenceImages)
```

Resolve both the data directory and source file through `fs.realpathSync.native`; reject boundary escape, symlinks, missing files, and non-regular files with `reference_image_unusable`.

- [ ] **Step 5: Remove text-only request construction**

In `generateProviderImage`:

```js
const endpoint = '/images/edits'
const multipartRequest = buildProviderEditMultipartRequest({
  model: config.model,
  prompt,
  constraints,
  referenceImages: normalizedReferenceImages
})
```

Delete the JSON `/images/generations` branch and any now-unused payload helper. Always record:

```js
requestMode: 'image-edit',
referenceImageCount: 1,
multipartImageField: 'image',
requestedOutputCount: 1
```

- [ ] **Step 6: Ensure multipart contains one `image` field**

Remove the loop from `buildProviderEditMultipartRequest` and append only `referenceImages[0]`. Keep `n=1`. Never emit `image[]`.

- [ ] **Step 7: Inspect and commit**

```bash
git diff --check
rg -n "at most one|/images/generations|image\[\]|referenceImages\.length > 0|text-to-image" src/main/services/plugin-service.js src/main/services/image-generation-model-service.js examples/plugins/creator-studio/lib/host-model-bridge.js
git diff -- src/main/services/plugin-service.js src/main/services/image-generation-model-service.js examples/plugins/creator-studio/lib/host-model-bridge.js
git add src/main/services/plugin-service.js src/main/services/image-generation-model-service.js examples/plugins/creator-studio/lib/host-model-bridge.js
git commit -m "fix require one image generation reference"
```

Any remaining `/images/generations` occurrence must be outside supported real generation and documented; otherwise remove it.

---

### Task 5: Remove Zero-Reference Generation Paths

**Files:**
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `examples/plugins/creator-studio/lib/generation-task.js`
- Modify: `src/main/services/creator-workflow-service.js`

**Interfaces:**
- Produces: `resolveRequiredRunReferenceImage`, `reference_image_required` preflight, no successful path with `referenceImages: []`.

- [ ] **Step 1: Add required-reference resolution**

Replace permissive array resolution with:

```js
const resolveRequiredRunReferenceImage = ({ dataDir, run, stage = 'final', actionId = '' }) => {
  const references = resolveRunReferenceImages({ dataDir, run, stage, actionId })
  assertExactlyOneProviderReferenceImage(references)
  return references
}
```

Use it before anchor, base, keyframe, frame-sheet, action repair, identity repair, retry, and fallback generation.

- [ ] **Step 2: Replace the explicit empty-reference result**

The failed start-keyframe return currently records `referenceImages: []`. Preserve the validated source reference in failure evidence:

```js
referenceImages: normalizedOriginalReferenceImages
```

This is evidence only; do not issue another request from the failure object.

- [ ] **Step 3: Make missing references fail before prompt/provider work**

Functions that currently return `null`, `{ skipped: true, reason: 'missing-reference' }`, or fall through to base text generation must throw a stable `reference_image_required` error or return an interactive missing-input result before compilation.

- [ ] **Step 4: Remove legal `textOnly` generation tasks**

Change `generation-task.js` so `styleSource` accepts only `currentPet` and `referenceImage` for real tasks. The default for full-pet becomes `referenceImage`.

```js
const VALID_STYLE_SOURCES = new Set(['currentPet', 'referenceImage'])
const styleSource = String(task.styleSource || (mode === 'single-action' ? 'currentPet' : 'referenceImage'))
```

- [ ] **Step 5: Keep Creator workflow input gates explicit**

`generateNewCharacter` already requires a selected reference. `generateExistingAction` may reuse a bound current-pet reference, but must return `missing_reference_image` if neither explicit nor bound reference exists.

Replace project-coupled default task briefs with visual-only intent. Names remain host metadata and are not sent through the compiler.

- [ ] **Step 6: Make image-model eligibility require edit capability**

Where candidate metadata is constructed for Hatch Pet, expose only models that declare image-conditioned/edit capability. If configuration cannot prove this capability, fail with `no_image_conditioned_model` rather than attempting text generation.

- [ ] **Step 7: Inspect and commit**

```bash
git diff --check
rg -n "referenceImages: \[\]|textOnly|missing-reference|/images/generations" examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/lib/generation-task.js src/main/services/creator-workflow-service.js
git diff -- examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/lib/generation-task.js src/main/services/creator-workflow-service.js
git add examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/lib/generation-task.js src/main/services/creator-workflow-service.js
git commit -m "fix close zero reference creator paths"
```

If `hatch-pet-agent-model-candidates.js` is introduced only in the later Phase 2 implementation, update the Phase 2 plan instead of creating unused production code in this task.

---

### Task 6: Add Safe Prompt And Conditioning Provenance

**Files:**
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `examples/plugins/creator-studio/service/studio-service.js`
- Modify: `src/main/services/creator-workflow-service.js`
- Modify: `src/main/services/image-generation-model-service.js`

**Interfaces:**
- Produces: bounded `promptCompiler` and exact reference evidence without exposing prompt internals, paths, or bytes.

- [ ] **Step 1: Replace prompt-builder summary fields**

Return safe fields:

```js
{
  version: Number(promptCompiler.version || 0),
  taskType: safeText(promptCompiler.taskType),
  stage: safeText(promptCompiler.stage),
  width: Number(promptCompiler.width) || 0,
  height: Number(promptCompiler.height) || 0,
  aspectRatio: safeText(promptCompiler.aspectRatio),
  referenceImageCount: 1,
  requestedOutputCount: 1,
  promptSafety: 'provider-neutral',
  promptPreview: boundedPreview
}
```

Do not expose internal roles or strategy prose in public dashboard payloads.

- [ ] **Step 2: Normalize conditioning summaries**

Every successful or failed accepted Provider attempt records:

```js
{
  mode: 'image-edit',
  endpoint: '/images/edits',
  referenceImageCount: 1,
  multipartImageField: 'image',
  requestedOutputCount: 1
}
```

Reference evidence may retain safe relative paths and hashes inside confined run artifacts, but public summaries omit path data.

- [ ] **Step 3: Preserve error codes through bridge and workflow results**

Map reference and prompt preflight errors to stable workflow codes without replacing them with a generic Provider error. Do not count them as Provider calls.

- [ ] **Step 4: Inspect and commit**

```bash
git diff --check
rg -n "referenceImageCount|multipartImageField|promptSafety|promptCompiler" examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/service/studio-service.js src/main/services/creator-workflow-service.js src/main/services/image-generation-model-service.js
git diff -- examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/service/studio-service.js src/main/services/creator-workflow-service.js src/main/services/image-generation-model-service.js
git add examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/service/studio-service.js src/main/services/creator-workflow-service.js src/main/services/image-generation-model-service.js
git commit -m "feat record safe image prompt provenance"
```

---

### Task 7: Align Hatch Pet Phase Plans And Create Test Handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-model-driven-hatch-pet-agent-design.md`
- Modify: `docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase2-identity-single-action.md`
- Modify: `docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase3-full-pet-orchestration.md`
- Modify: `docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase4-verification-rollout.md`
- Create: `docs/superpowers/plans/2026-07-15-provider-neutral-image-generation-test-handoff.md`

**Interfaces:**
- Produces: exact independent test instructions for the existing test task and removes stale zero/one-reference claims.

- [ ] **Step 1: Update the parent design**

Add the approved hard constraints to the component ownership, image-model eligibility, legal decision, and Provider-call sections. Link the dedicated provider-neutral design.

- [ ] **Step 2: Update Phase 2 and Phase 3 prerequisites**

Replace every zero/one-reference statement with exactly-one-reference. Require registered prompt strategies to compile through the new provider-neutral compiler and require image-conditioned model capability.

- [ ] **Step 3: Update Phase 4 verification evidence**

Change report schema expectations so every real generation `referenceCounts` entry equals `1`. Remove successful zero-reference smoke. Require endpoint `/images/edits`, field `image`, output request `n=1`, and prompt forbidden-term evidence.

- [ ] **Step 4: Write the independent test handoff**

The handoff must instruct the existing test task to cherry-pick the exact development commits, then add failing/green tests only on its own branch for:

- typed task bounds and role-to-visible-description mapping;
- compiler snapshots for character, start, peak, action sheet, and repair;
- forbidden internal term rejection;
- exact dimensions/aspect ratio in every prompt;
- zero/two reference rejection before output path creation, queue, logs, or fetch;
- exactly one multipart `image`, no `image[]`, no successful `/images/generations`;
- fallback and same-model retry preserving the reference;
- missing-reference workflow result and zero Provider-call accounting;
- prompt provenance sanitization;
- core, core-all, Control Center, and syntax commands;
- one-shot `fork_turns="none"` image-generation and visual-evaluation agents for later real verification.

The handoff forbids Provider approval, import, activation, or `production-art-ready` claims.

- [ ] **Step 5: Inspect and commit**

```bash
git diff --check
rg -n "zero/one|zero or one|at most one|referenceCounts|/images/generations|provider-neutral" docs/superpowers/specs/2026-07-15-model-driven-hatch-pet-agent-design.md docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase2-identity-single-action.md docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase3-full-pet-orchestration.md docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase4-verification-rollout.md docs/superpowers/plans/2026-07-15-provider-neutral-image-generation-test-handoff.md
git diff -- docs/superpowers/specs/2026-07-15-model-driven-hatch-pet-agent-design.md docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase2-identity-single-action.md docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase3-full-pet-orchestration.md docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase4-verification-rollout.md docs/superpowers/plans/2026-07-15-provider-neutral-image-generation-test-handoff.md
git add docs/superpowers/specs/2026-07-15-model-driven-hatch-pet-agent-design.md docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase2-identity-single-action.md docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase3-full-pet-orchestration.md docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase4-verification-rollout.md docs/superpowers/plans/2026-07-15-provider-neutral-image-generation-test-handoff.md
git commit -m "docs align hatch pet image contracts"
```

---

### Task 8: Development-Branch Static Review And Independent Test Dispatch

**Files:**
- Inspect: all files changed by Tasks 1–7
- No development-branch test files

**Interfaces:**
- Produces: clean `codex/dev8` commits and an exact checkpoint for the existing independent test task.

- [ ] **Step 1: Perform static contract searches**

```bash
git diff --check HEAD~7..HEAD
rg -n "Create.*OpenPet|provider-generated|Reference role:|Action ID:|Backend:|Model:" examples/plugins/creator-studio/lib
rg -n "at most one|referenceImages: \[\]|textOnly|/images/generations|image\[\]" examples/plugins/creator-studio src/main/services
```

Investigate every result. Allowed matches must be non-Provider fixture documentation, explicit rejection code, or historical compatibility metadata that cannot reach generation.

- [ ] **Step 2: Review call graph manually**

Trace every call to `imageGenerationModelService.generateImage`, `/creator/model-image-generate`, `generateWithModelFallback`, and `callHostImageGenerate`. Confirm each path produces a one-entry reference array and compiled prompt.

- [ ] **Step 3: Confirm isolation and clean state**

```bash
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
git rev-parse HEAD
git worktree list --porcelain
```

- [ ] **Step 4: Send the checkpoint to the existing independent test task**

Instruct thread `019f6389-6cfa-7780-bc12-dbe6fb5a54d1` to stay on `codex/dev8-hatch-pet-phase1-test`, cherry-pick only the listed development commits, follow the new handoff, add tests only on the test branch, and run all required automated checks. Do not authorize real Provider/image/visual operations until automated verification passes.

- [ ] **Step 5: Handle test feedback through the evidence loop**

For each production failure:

1. capture exact failing evidence from the independent task;
2. apply one minimal root-cause fix on `codex/dev8`;
3. commit it;
4. send the exact commit to the same test task;
5. require fresh verification before any success claim.

The final automated result may be described as PASS only after the independent task reports green focused suites, `npm run check:syntax`, `npm run test:core`, `npm run test:core:all`, and `npm run test:control-center` with a clean test worktree.
