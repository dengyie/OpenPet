# GPT Image 2 Prompt System Redesign

## Status

- Date: 2026-07-17
- Target baseline: `main@8f735fb14c9d339d4e059b7ec53d478d8bab30c2`
- Status: proposed design for user review
- Scope: every Creator Studio and Hatch Pet request that sends an image-generation or image-edit prompt to an upstream image model
- Primary target renderer: `gpt-image-2`
- Verification boundary: this document defines development work only; automated Provider tests and real visual acceptance remain independent testing tasks

## 1. Purpose

OpenPet currently has a typed Provider image task, a Provider-neutral compiler, an exact-one-reference gate, and a staged identity-to-action workflow. Those are sound foundations. The remaining problem is that the final text sent to the image model is still compiled as one generic prompt for every model.

That generic prompt contains contracts that do not match `gpt-image-2`, drops part of the planned action semantics, mixes pose changes with pose-preservation language, describes only some animation cells, and can pass product-oriented character text that is not a visible drawing instruction.

This redesign replaces the single generic prompt compiler with:

1. a validated Provider-neutral visual semantic plan;
2. an ordered, auditable prompt-clause representation;
3. a capability profile for the selected image model;
4. a model-specific renderer, beginning with `gpt-image-2`;
5. deterministic conflict resolution and smallest-delta repair prompts.

The goal is not to produce a longer prompt. The goal is to produce a short, complete, internally consistent visual brief that the selected image model can execute using the prompt and its one attached reference image alone.

## 2. Source Basis

OpenAI does not publish a mandatory fixed grammar called the “GPT Image 2 prompt format.” It publishes model capabilities, prompting principles, and production examples. OpenPet therefore defines a project standard derived from those official recommendations rather than claiming that a project-specific schema is an official OpenAI API schema.

### 2.1 OpenAI official guidance

This design is based on:

- [Image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
- [GPT Image generation models prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [Generate Images With GPT Image](https://github.com/openai/openai-cookbook/blob/main/examples/Generate_Images_With_GPT_Image.ipynb)
- [Generate Images With High Input Fidelity](https://github.com/openai/openai-cookbook/blob/main/examples/Generate_Images_With_High_Input_Fidelity.ipynb)

The applicable principles are:

1. organize prompts into clear subject, scene or background, composition, details, and constraints;
2. for edits, explicitly separate what changes from what remains unchanged;
3. repeat preservation invariants on each iterative edit;
4. use a reusable character anchor for recurring character consistency;
5. identify the responsibility of each visible reference region or input image;
6. describe structured and multi-panel output one visual region at a time;
7. prefer a clean base prompt followed by bounded edits instead of continually appending prompt history;
8. treat identity consistency and exact structured composition as fallible model behavior that still requires deterministic QA;
9. for `gpt-image-2` cutout workflows, request a plain opaque background and perform downstream background removal instead of promising direct model transparency.

### 2.2 Open-source prompt-system patterns

The design also adopts bounded architectural patterns from these projects:

| Project | Pattern adopted | Pattern explicitly not copied |
| --- | --- | --- |
| [f/prompts.chat](https://github.com/f/prompts.chat) | typed subject, environment, composition, lighting, style, technical, mood, and exclusion fields | community prompt content is not trusted as a production contract |
| [OpenPromptStudio](https://github.com/Moonvy/OpenPromptStudio) | atomic clauses with category, order, enable state, and provenance | unrestricted user-controlled clauses do not bypass OpenPet validation |
| [Microsoft Promptist](https://github.com/microsoft/LMOps/tree/main/promptist) | prompt optimization is model-specific | its Stable Diffusion 1.4 wording is not reused for GPT Image |
| [Fooocus](https://github.com/lllyasviel/Fooocus) | bounded and reproducible prompt expansion | adjective stuffing and Stable Diffusion token style are rejected |
| [InvokeAI](https://github.com/invoke-ai/InvokeAI) | versioned style, preservation, and exclusion presets | GPT Image does not receive Stable Diffusion weighting or a fake negative-prompt API field |

## 3. Confirmed Product Decisions

1. Every real image-generation request still carries exactly one validated reference image.
2. Every real request still asks for exactly one Provider output and fails closed if the Provider returns zero or multiple deliverable outputs.
3. The Hatch Pet model may produce a bounded structured visual plan. It may not write or append the final upstream image prompt.
4. Code remains authoritative for model selection eligibility, request size, output count, reference count, budgets, retries, artifact paths, QA, approval, import, and activation.
5. The final prompt is compiled for the selected model. Provider-neutral semantics do not imply one identical text string for every Provider.
6. Reference-image identity outranks conflicting written appearance descriptions.
7. The written action plan, not the neutral pose in an identity reference, is authoritative for non-idle poses.
8. The selected model capability profile is authoritative for background, output, and request-language constraints.
9. `gpt-image-2` generation uses a plain opaque background selected for downstream removal. Transparent output is produced locally after generation.
10. All required animation cells receive an explicit visual beat.
11. Generic character rules refer only to features visibly present in the reference; they do not assume ears, paws, wings, a tail, clothing, or any other anatomy.
12. Human-review guidance is scoped to global, animation-type, action, or single-repair use and cannot grow into an unbounded prompt history.
13. Existing deterministic QA, human approval, and production-art claim gates remain unchanged or become stricter.

## 4. Approaches Considered

### A. Rewrite the current deterministic prompt strings

This would fix transparent-background wording, generic anatomy, and some section order with low implementation risk. It would not reliably extract visual meaning from user briefs, preserve all action semantics, or adapt prompts to multiple image-model capability profiles.

### B. Provider-neutral semantic IR plus capability-aware renderer and bounded visual planner — selected

The Hatch Pet or chat model converts natural language into a validated visual plan. Deterministic code resolves reference authority, action semantics, canvas rules, model capabilities, and repair scope. A model-specific renderer creates the final upstream prompt.

This approach preserves auditability while allowing the system to express visual intent more effectively than raw product text.

### C. Let the Hatch Pet model write the complete final prompt

This offers maximum wording flexibility but makes hard constraints, safety, reproducibility, reference use, output background, and prompt provenance nondeterministic. It is rejected.

## 5. Target Architecture

```text
user brief + generation task + one reference artifact
  -> bounded Hatch Pet visual planner
  -> validate VisualPlan
  -> create ProviderImageTask v3
  -> resolve reference responsibilities
  -> resolve model capability profile
  -> build ordered PromptClause IR
  -> render with GptImage2PromptRenderer or GenericPromptRenderer
  -> validate final prompt and request contract
  -> one image-conditioned request with n=1
  -> deterministic extraction and background removal
  -> deterministic QA
  -> smallest-delta repair when eligible
  -> human approval
```

### 5.1 Ownership boundaries

| Component | Owns | Must not own |
| --- | --- | --- |
| Visual planner | visible requested changes, visible identity observations, action intent, style intent | final prompt strings, secrets, paths, model transport, approval |
| Visual-plan validator | schema, field bounds, conflicts, unsafe or non-visual text | creative rewriting |
| Task compiler | stable task semantics, reference responsibility, cell plan, fixed locks | model-specific wording |
| Capability registry | supported background behavior, edit behavior, output restrictions | task meaning |
| Prompt-clause builder | ordered semantic clauses and provenance | Provider transport |
| Model renderer | concise model-appropriate wording | changing validated semantics |
| Host image service | credentials, request construction, timeout, retry, output materialization | interpreting product requirements |
| QA and review | technical, identity, motion, layout, and human quality decisions | weakening prompt contracts after failure |

## 6. VisualPlan Contract

Introduce a strict visual plan before `ProviderImageTask` construction.

```js
{
  version: 1,
  subject: {
    kind: 'character',
    visibleIdentityFeatures: [
      'round amber eyes',
      'dark triangular marking above the left eye',
      'short blue-gray plush texture'
    ],
    visibleAccessories: ['small red neck scarf'],
    mediumAndStyle: ['softly shaded digital illustration'],
    requestedVisibleChanges: []
  },
  action: {
    name: 'running right',
    animationType: 'locomotion_loop',
    viewDirection: 'character faces viewer-right',
    loopType: 'seamless in-place cycle',
    primaryMotion: ['front and rear locomotion appendages alternate'],
    secondaryMotion: ['small body rise and fall'],
    forbiddenMotion: [
      'body translation across the canvas',
      'head turning away from viewer-right',
      'camera or viewpoint change'
    ],
    lockedFeatures: [
      'face design',
      'eye design',
      'markings',
      'body proportions',
      'character scale'
    ]
  },
  composition: {
    framing: 'full-body',
    rootAnchor: 'lower-center',
    targetOccupancyPercent: 78,
    safePaddingPercent: 10
  },
  backgroundIntent: 'isolated-cutout-ready'
}
```

### 6.1 Planner-output rules

- Every value must describe something visible in the requested image.
- Names, application behavior, packaging, reuse, approval, runtime, pet IDs, paths, URLs, credentials, and internal role names are invalid visual semantics.
- `visibleIdentityFeatures` describes observed details; it must not invent features absent from the reference.
- `requestedVisibleChanges` contains only explicit user-approved transformations.
- An empty or invalid creative plan falls back to reference-only identity preservation plus deterministic task semantics.
- Planner output receives the existing exactly-one structured repair call when invalid. It never receives an image-generation retry budget.
- The planner is stateless for each task. Previous failed prompt text is not included as accumulated context.

## 7. ProviderImageTask v3

Upgrade the current task schema from version 2 to version 3. Preserve existing validated canvas, sheet, reference, subject, style-lock, strategy, and requested-change fields.

The action contract becomes:

```js
{
  name: 'running right',
  animationType: 'locomotion_loop',
  moment: 'first contact pose with opposing appendages separated',
  viewDirection: 'character faces viewer-right',
  loopType: 'seamless in-place cycle',
  movingParts: ['visible locomotion appendages'],
  secondaryMotion: ['small body rise and fall'],
  lockedParts: ['face', 'eyes', 'markings', 'body proportions', 'scale'],
  forbiddenMotion: [
    'translation across the canvas',
    'viewpoint change',
    'identity redesign'
  ],
  loopIntent: 'last frame transitions cleanly into the first frame',
  frameBeats: [
    { frame: 1, cell: 'row 1 column 1', beat: 'first contact pose' },
    { frame: 2, cell: 'row 1 column 2', beat: 'weight absorption pose' },
    { frame: 3, cell: 'row 1 column 3', beat: 'first passing pose' },
    { frame: 4, cell: 'row 2 column 1', beat: 'opposite contact pose' },
    { frame: 5, cell: 'row 2 column 2', beat: 'opposite passing pose' },
    { frame: 6, cell: 'row 2 column 3', beat: 'loop-closing transition' }
  ]
}
```

Validation requirements:

- `frameBeats.length` must equal `sheet.frameCount` for a frame sheet;
- frame numbers must be contiguous from 1;
- cell coordinates must match the declared rows, columns, and reading order;
- `viewDirection`, `secondaryMotion`, `forbiddenMotion`, `animationType`, and `loopType` must survive into the final prompt evidence;
- unknown fields remain rejected;
- all strings pass existing visual-directive sanitization and length bounds.

## 8. Reference Responsibility Contract

Every prompt explains what the single attached reference controls. Internal artifact roles are never emitted.

### 8.1 Single-character reference

- controls identity, proportions, colors, markings, material, accessories, lighting style, and rendering style;
- does not automatically control a new requested pose;
- written appearance text loses conflicts against visible reference evidence.

### 8.2 Identity-comparison board

- primary region controls canonical scale, viewpoint, silhouette continuity, and root placement;
- supporting region supplies visible source identity details;
- neither region controls the new action pose unless the task is `idle` or explicitly says to reuse that pose;
- the output must not copy panels, repeated views, borders, labels, spacing, or the board background.

### 8.3 Identity-and-motion board

- identity region controls appearance;
- pose examples control only the named start and motion-extreme cues;
- written frame beats control all unrepresented intermediate poses;
- the board layout itself is never part of the deliverable.

### 8.4 Authority order

When two clauses conflict, resolve them in this order:

1. request safety and model capability profile;
2. exact output, canvas, and single-reference contracts;
3. reference image for visible identity;
4. action plan for pose and motion;
5. composition plan for scale, root, and padding;
6. explicit user-approved visible transformation;
7. scoped quality guidance;
8. optional aesthetic preference.

The compiler rejects unresolved conflicts rather than emitting both instructions.

## 9. Model Capability Profiles

Add a host-owned or shared deterministic registry. The prompt renderer consumes only a sanitized profile.

```js
{
  id: 'gpt-image-2',
  promptRenderer: 'gpt-image-2-v1',
  imageConditioning: 'required',
  adjustableInputFidelity: false,
  outputBackground: 'opaque-only-for-openpet-cutout-workflow',
  cutoutStrategy: 'solid-background-then-local-removal',
  supportsDedicatedNegativePrompt: false,
  requestedOutputCount: 1
}
```

The `gpt-image-2` profile requires:

- an opaque solid background in the prompt;
- no `transparent background`, `empty and transparent`, or `transparent sprite sheet` language;
- no fake negative-prompt parameter or Stable Diffusion weighting syntax;
- preservation instructions phrased in ordinary language;
- one bounded edit objective per request;
- downstream background removal recorded as part of the delivery pipeline.

Other image models may use another renderer and another background contract, but they still consume the same validated semantic task.

## 10. PromptClause IR

Before rendering text, compile the task into ordered clauses:

```js
{
  id: 'action.forbidden-motion',
  category: 'preserve',
  source: 'visual-plan',
  scope: 'action:running-right',
  priority: 80,
  enabled: true,
  text: 'Keep the character fixed at the lower-center root; do not translate across the canvas.'
}
```

Allowed categories:

- `deliverable`
- `reference`
- `change`
- `preserve`
- `composition`
- `action`
- `frame-beat`
- `background`
- `exclusion`
- `repair`

Each final prompt clause must have provenance. The renderer may shorten or combine adjacent clauses in the same category, but it may not alter their meaning or priority.

Deduplication occurs by semantic clause ID, not by string comparison. A later repair replaces the matching clause or adds one temporary `repair` clause; it does not append the entire previous prompt.

## 11. GPT Image 2 Standard Prompt Format

The OpenPet standard uses short labeled sections in this fixed order:

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

The order applies the OpenAI-recommended separation of subject, key details, composition/background, and constraints while making edit intent explicit.

### 11.1 Formatting rules

- Use direct imperatives and concrete visible nouns.
- Use short paragraphs or bullets, not one dense paragraph.
- Put the requested visible change before the preservation list.
- State “change only” when the task is a bounded edit or repair.
- State “keep unchanged” for identity invariants.
- Do not repeat the same identity lock in three differently worded paragraphs.
- Do not include application names, schema names, IDs, paths, API terminology, or approval state.
- Do not include adjectives that have no measurable visual meaning.
- Do not use token weights, parentheses weighting, quality-tag stuffing, or a separate negative-prompt syntax.
- Keep the compiled prompt under the existing hard length limit; the target is no more than 2,500 characters for a keyframe and 5,500 characters for a frame sheet unless a measured exception is approved.

## 12. Standard Prompt Templates

The following templates are normative for section order and responsibility. Dynamic values are validated fields, not raw user strings.

### 12.1 Canonical character image

```text
DELIVERABLE
Create one complete full-body character image at {width} x {height}, {aspectRatio}.
Show one character only in a calm, readable identity pose.

REFERENCE
Use the attached image as the identity and visual-style reference.
Follow the image for visible face design, eye design, colors, markings,
body proportions, silhouette, material or fur treatment, accessories,
lighting style, and rendering medium.

CHANGE
{visible requested changes, or "Do not redesign the character."}

PRESERVE
Keep every identity-bearing feature and every visible body part or accessory
unchanged unless the CHANGE section explicitly names it.
Do not invent, remove, duplicate, or redesign visible anatomy or accessories.

COMPOSITION
Place the full character at the lower center of the canvas.
Use approximately {occupancy}% of the canvas height and leave at least
{padding}% clear padding on every side. Do not crop the character.

BACKGROUND
Use one uniform opaque {backgroundColor} background with no gradient,
texture, scenery, floor line, or cast shadow. Keep every character edge clean
and clearly separated from the background for downstream background removal.

CONSTRAINTS
No text, labels, logo, watermark, border, panel, grid, duplicate character,
extra prop, scenery, or presentation layout. Return only the requested image.
```

### 12.2 Non-idle action keyframe

```text
DELIVERABLE
Create one complete full-body action keyframe at {width} x {height}, {aspectRatio}.

REFERENCE
Use the attached board for character identity, proportions, materials,
colors, markings, accessories, viewpoint, scale, and rendering style.
Do not copy its panel layout, repeated views, spacing, labels, borders,
or background. Do not preserve its neutral pose; the ACTION section below
is the sole authority for the new pose.

CHANGE
Change only the pose to: {exact visible action moment}.

PRESERVE
Keep unchanged: {identity locks}.
Keep every visible body part and accessory present, recognizable, and consistent.

COMPOSITION
Keep the full character at the lower-center root, facing {viewDirection},
at the same visual scale and viewpoint as the canonical identity.
Leave {padding}% clear padding. Do not crop or touch an image edge.

ACTION PLAN
Primary motion: {primaryMotion}.
Allowed secondary motion: {secondaryMotion}.
Do not: {forbiddenMotion}.
This keyframe is the {stageDescription}.

BACKGROUND
Use one uniform opaque {backgroundColor} background with no gradient,
texture, floor line, scenery, or cast shadow. Preserve clean separable edges.

CONSTRAINTS
One character and one pose only. No text, grid, sprite sheet, model sheet,
panel, duplicate pose, watermark, prop, scenery, or identity redesign.
```

### 12.3 Action frame sheet

```text
DELIVERABLE
Create one {width} x {height} animation frame sheet with exactly {frameCount}
full-body frames arranged in {columns} columns and {rows} rows.
Read cells left to right, then top to bottom.

REFERENCE
Use the attached board for character identity, proportions, materials,
colors, markings, accessories, viewpoint, scale, and rendering style.
Use its pose examples only for the action moments they visibly represent.
Do not copy the board layout, borders, labels, spacing, or background.

CHANGE
Change only the pose from cell to cell to perform {actionName}.

PRESERVE
Keep unchanged in every cell: {identity locks}.
Keep the same viewpoint, character scale, lighting, and lower-center root.

COMPOSITION
Use equal invisible cells. Put one complete character pose inside each required
cell with {padding}% internal padding. Do not let character pixels cross cells.
{unusedCellRule}

FRAME PLAN
Cell 1 — {beat1}.
Cell 2 — {beat2}.
...
Cell {frameCount} — {finalBeat}.
Direction: {viewDirection}.
Allowed secondary motion: {secondaryMotion}.
Never: {forbiddenMotion}.
Loop requirement: {loopIntent}.

BACKGROUND
Fill the entire sheet with one uniform opaque {backgroundColor} background.
No gradient, texture, scenery, floor lines, dividers, or cast shadows.
Keep every character edge clean for per-cell downstream background removal.

CONSTRAINTS
No visible grid, text, labels, numbers, logo, watermark, border, presentation
layout, duplicate placeholder frame, extra character, prop, or identity redesign.
Return only the complete frame sheet.
```

For `gpt-image-2`, unused cells use the same opaque background color and contain no character pixels. They are not described as transparent.

### 12.4 Smallest-delta repair

```text
DELIVERABLE
Create one corrected replacement for the attached image.

REFERENCE
Treat the attached image as the image to edit and as the identity reference.

CHANGE ONLY
{one concrete, observable correction derived from the failed QA reason}.

KEEP UNCHANGED
Keep the character identity, face, eyes, markings, colors, proportions,
materials, accessories, viewpoint, scale, root position, lighting, composition,
and every already-correct action detail unchanged.

BACKGROUND
Keep the same uniform opaque background and clean separable character edges.

CONSTRAINTS
Do not redesign the character or introduce any unrelated change.
Return only one corrected image.
```

A repair request must not contain multiple independent corrections. If the candidate has several unrelated failures, regenerate from the clean base prompt or choose the highest-priority repair reason according to the existing repair budget.

## 13. Background And Cutout Pipeline

The semantic task continues to express `isolated-cutout-ready`. The selected model renderer decides how to achieve it.

For `gpt-image-2`:

1. analyze the reference or canonical character edge colors locally;
2. choose a bounded solid background color with strong contrast and low collision risk;
3. include that exact ordinary color description in the prompt;
4. request an opaque image;
5. perform deterministic local background removal;
6. clear RGB values where final alpha is zero;
7. run edge, halo, alpha, occupancy, and cell-boundary QA;
8. retain the opaque Provider output and the cutout artifact as separate evidence.

The prompt must never claim that the Provider returned transparency when the selected model did not.

## 14. Complete Frame-Beat Generation

`buildActionFramePlan` is replaced or upgraded so that every action sheet has one beat per required frame.

### 14.1 Deterministic beat generation

The action semantic library defines named phases for each animation type:

- locomotion loop: contact, down, passing, up, opposite contact, opposite down, opposite passing, loop close;
- vertical bounce: anticipation, compression, lift, airborne rise, peak, descent, landing, recovery;
- stationary loop: neutral, local motion start, local peak, local return, settle;
- pose transition: start, early transition, midpoint, late transition, final;
- emote or reaction: neutral, anticipation, expression rise, expression peak, recovery, settle.

When the requested frame count differs from the canonical phase count, a deterministic phase allocator selects or expands phases while preserving start, peak, recovery, and loop closure. It does not use pixel interpolation and does not emit vague ranges such as “Frames 7–12: add in-between motion.”

### 14.2 Direction and root rules

- directional locomotion states viewer-left or viewer-right in every relevant prompt;
- in-place animation keeps the root fixed while limbs and permitted body parts move;
- jumping changes vertical position but returns to the original baseline;
- idle locks the canonical pose and allows only named low-amplitude local motion;
- the non-directional `running` work-state action must not inherit locomotion semantics.

## 15. Human Guidance And Repair Scoping

Quality guidance entries receive one of these scopes:

```text
global
animation-type:<type>
action:<actionId>
repair:<runId>:<artifactId>
```

Examples:

- edge halo and background contamination may be global;
- direction mismatch applies only to directional actions;
- static-motion failure applies only to multi-frame animation;
- baseline instability applies to grounded or stationary actions;
- a one-off malformed paw correction is repair-scoped and expires with that attempt.

The prompt builder includes only matching scopes and applies a strict clause-count and character budget. Successful repair guidance is not automatically promoted to global guidance.

## 16. Compiler Safety And Validation

Retain the existing forbidden internal-term and secret checks. Add semantic checks for:

- `transparent` language in a `gpt-image-2` rendered prompt;
- incomplete frame-beat coverage;
- pose-preservation language in a non-idle action prompt;
- conflicting directions;
- anatomy assumptions not grounded in the reference plan;
- raw product requirements such as “desktop pet”, “reusable”, “named”, “activation”, or packaging behavior;
- unsupported model features;
- duplicated semantic clause IDs;
- unscoped repair history;
- missing `CHANGE` or `PRESERVE` sections for edit tasks;
- missing opaque-background removal language for the `gpt-image-2` cutout workflow.

Stable failures should use bounded codes such as:

```text
image_visual_plan_invalid
image_prompt_capability_conflict
image_prompt_semantic_conflict
image_prompt_frame_plan_incomplete
image_prompt_repair_scope_invalid
```

No failure message may expose the full sensitive prompt, path, credential, or raw Provider response.

## 17. Prompt Provenance

Store sanitized evidence for each request:

```js
{
  visualPlanVersion: 1,
  providerImageTaskVersion: 3,
  promptCompilerVersion: 3,
  promptRenderer: 'gpt-image-2-v1',
  modelCapabilityProfile: 'gpt-image-2-v1',
  promptClauseIds: [
    'deliverable.single-keyframe',
    'reference.identity-comparison',
    'change.action-pose',
    'preserve.identity-locks',
    'background.opaque-cutout-v1'
  ],
  promptCharacterCount: 1830,
  referenceImageCount: 1,
  requestedOutputCount: 1,
  backgroundStrategy: 'solid-background-then-local-removal',
  frameBeatCount: 0,
  repairReasonCode: ''
}
```

Store clause IDs and safe summaries for diagnostics. Continue to avoid storing credentials, arbitrary paths, raw multipart bodies, or unrestricted planner output.

## 18. Expected File Changes

The implementation plan should use the existing module boundaries and introduce focused files rather than further enlarging the current compiler.

### Create

- `examples/plugins/creator-studio/lib/visual-plan.js`
  - validates and normalizes bounded visible semantics;
- `examples/plugins/creator-studio/lib/image-model-capabilities.js`
  - resolves sanitized capability profiles;
- `examples/plugins/creator-studio/lib/provider-image-prompt-clauses.js`
  - builds, scopes, orders, deduplicates, and validates clause IR;
- `examples/plugins/creator-studio/lib/gpt-image-2-prompt-renderer.js`
  - renders the normative GPT Image 2 section format;
- `examples/plugins/creator-studio/lib/generic-image-prompt-renderer.js`
  - preserves a conservative fallback for eligible non-GPT models.

### Modify

- `examples/plugins/creator-studio/lib/provider-image-task.js`
  - upgrade action schema and task evidence to version 3;
- `examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js`
  - become orchestration and validation rather than one universal string builder;
- `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`
  - preserve complete action semantics;
- `examples/plugins/creator-studio/lib/action-semantics.js`
  - generate an exact beat for every frame;
- `examples/plugins/creator-studio/lib/openpet-prompt-builder.js`
  - consume validated visual plans instead of raw `characterBrief` appearance intent;
- `examples/plugins/creator-studio/lib/pet-generation-human-examples.js`
  - enforce quality-guidance scopes;
- `examples/plugins/creator-studio/lib/host-model-bridge.js`
  - pass the selected sanitized capability profile and preserve prompt evidence;
- `src/main/services/image-generation-model-service.js`
  - align request evidence and background strategy with the renderer contract;
- `docs/pet-character-generation.md`
  - update the canonical generation document after implementation is verified.

## 19. Test Strategy

### 19.1 Unit contract tests

Add tests that prove:

1. `gpt-image-2` prompts use the fixed section order;
2. `gpt-image-2` prompts never contain `transparent background` or equivalent transparent-cell promises;
3. the same semantic task rendered for a transparency-capable generic model may use the model-supported transparent contract;
4. every real task still reports exactly one reference and one requested output;
5. non-idle action prompts explicitly state that action text controls pose;
6. idle prompts preserve the canonical pose;
7. `viewDirection`, `loopType`, `secondaryMotion`, and `forbiddenMotion` survive to the final prompt;
8. every frame from 1 through `frameCount` has exactly one cell beat;
9. unknown or duplicate frame numbers are rejected;
10. generic anatomy language does not require ears, paws, tail, wings, clothing, or accessories;
11. raw product text is removed or rejected before Provider prompt rendering;
12. quality guidance includes only matching scopes;
13. repair prompts include exactly one `CHANGE ONLY` delta and a complete `KEEP UNCHANGED` block;
14. forbidden product terms, paths, URLs, credentials, and prompt-control instructions remain rejected;
15. prompt provenance records renderer and capability-profile versions.

Prefer section and semantic-clause assertions over one enormous full-string snapshot. Keep a small number of complete golden prompts for the four normative templates.

### 19.2 Integration tests

Cover:

- Creator Studio identity generation;
- full-pet start and peak keyframes;
- complete running-right, jumping, waving, idle, failed, waiting, running-work, and review sheets;
- same-model retry preserving the exact prompt and reference contract;
- fallback model causing a fresh render from the same semantic task;
- background removal receiving opaque Provider output for `gpt-image-2`;
- action and identity repair using a clean base plus one scoped delta;
- safe prompt evidence exposed to dashboard clients.

### 19.3 Independent real-image verification

Real verification remains outside the development branch and must use fresh visual-evaluator agents. It must check:

- canonical identity similarity;
- action readability;
- direction and frame order;
- per-cell continuity;
- edge and halo quality after opaque-background removal;
- absence of copied reference-board layout;
- absence of invented anatomy;
- repair locality;
- all contact sheets, animated previews, and atlas rows;
- explicit human approval before any production-art claim.

Passing automated prompt tests does not establish visual quality or Provider approval.

## 20. Migration And Compatibility

1. Introduce the new visual plan, capability registry, clause IR, and renderer behind a versioned compiler path.
2. Keep existing stored run evidence readable. Old prompt-builder and task versions remain historical evidence and are not rewritten.
3. New requests use `ProviderImageTask v3`, prompt compiler v3, and prompt builder v6.
4. Existing repair checkpoints may be resumed only if their reference artifacts remain valid; their next Provider request is recompiled using the new renderer rather than reusing old prompt text.
5. A fallback model receives a newly rendered prompt from the same semantic task and that model's capability profile.
6. If an eligible model has no registered capability profile, fail closed with `image_prompt_capability_conflict`; do not send the generic old prompt silently.
7. Do not lower identity, motion, layout, or background-removal QA thresholds to accommodate migration failures.

## 21. Acceptance Criteria

Implementation is complete only when all of the following are true:

- every Provider image request still contains exactly one usable reference image;
- every request still asks for exactly one output;
- every final prompt is rendered from validated semantics and a registered model capability profile;
- no raw Hatch Pet or Creator Studio prompt reaches the image Provider;
- `gpt-image-2` prompts use an opaque cutout-ready background and local removal contract;
- no `gpt-image-2` prompt promises direct transparency;
- non-idle pose changes and identity preservation are expressed without contradiction;
- complete action semantics survive from generation task to final Provider prompt;
- every frame-sheet cell has one explicit visual beat;
- generic prompts do not assume animal anatomy;
- edit and repair prompts explicitly separate `CHANGE` from `PRESERVE`;
- quality guidance is scoped and bounded;
- prompt provenance identifies the task, compiler, renderer, capability profile, clause IDs, reference count, output count, and background strategy;
- all focused and repository-level automated suites pass on the independent test branch;
- real visual verification and human approval remain mandatory before `production-art-ready`.

## 22. Explicit Non-Goals

- Do not copy Stable Diffusion token weighting, sampler vocabulary, or adjective-heavy prompt expansion.
- Do not create an unrestricted user-editable final prompt field.
- Do not allow the Hatch Pet model to bypass deterministic compilation.
- Do not attach more than one reference image to simplify prompt wording.
- Do not ask the image model to understand OpenPet, desktop-pet runtime behavior, atlas import, approval, or repository concepts.
- Do not replace deterministic QA with prompt confidence.
- Do not treat generated transparency, action correctness, or identity consistency as guaranteed model capabilities.
- Do not claim that the normative templates are an official OpenAI API schema; they are OpenPet's implementation standard derived from official guidance.

## 23. Final Design Decision

OpenPet will retain Provider-neutral task semantics but stop sending one Provider-neutral prompt string to every model.

The production path becomes:

```text
bounded model-assisted visual planning
  + deterministic ProviderImageTask v3
  + auditable PromptClause IR
  + model capability profile
  + GPT Image 2-specific renderer
  + deterministic background removal and QA
```

This preserves OpenPet's safety and review gates while aligning the actual upstream prompt with GPT Image 2's recommended edit structure and output capabilities.
