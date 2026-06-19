# OpenPet Creator Prompt Builder Design

Date: 2026-06-20
Status: Proposed
Scope: Creator Studio prompt engineering layer for OpenPet-specific image generation

## 1. Goal

Design a dedicated prompt builder for Creator Studio so image generation requests produce assets that fit OpenPet's runtime, not generic illustrations.

The prompt builder must turn user intent, normalized generation tasks, current pet context, and backend constraints into a stable image prompt that clearly defines:

- OpenPet runtime boundaries;
- pet sprite shape and canvas constraints;
- generation mode;
- action semantics;
- style consistency rules;
- negative constraints;
- provider compatibility notes.

The first implementation should improve cloud and local image generation prompts without expanding the Control Center UI or changing provider settings ownership.

## 2. Current Context

Creator Studio already has a useful task boundary:

- `commands/create-run.js` collects user input and optionally drafts a `generationTask`.
- `lib/conversation-wizard.js` infers mode, action, trigger, loop, and follow-up questions from a natural-language prompt.
- `lib/generation-task.js` normalizes `single-action` and `full-pet` tasks.
- `lib/host-model-bridge.js` calls OpenPet's host model bridge.
- `src/main/services/image-generation-model-service.js` owns provider calls, secrets, output writing, and provider diagnostics.

The weak point is `host-model-bridge.js`: it currently sends the user's raw prompt, or the run id fallback, directly to the image model. That loses the OpenPet-specific contract: desktop pet scale, transparent-window use, sprite boundaries, safe padding, action consistency, and importable asset expectations.

## 3. Non-Goals

This design does not:

- add a Control Center prompt editor;
- add model settings UI;
- move provider credentials into the plugin;
- change the host model bridge permission model;
- implement a full sprite-sheet generation pipeline;
- replace the existing `generationTask` schema with a large DSL;
- solve reference-image conditioning;
- generate final frame sequences or atlases directly.

Those can become later phases after the prompt builder proves stable.

## 4. Recommended Approach

Create an isolated module:

```text
examples/plugins/creator-studio/lib/openpet-prompt-builder.js
```

The module exports a pure function:

```js
buildOpenPetImagePrompt({
  run,
  generationTask,
  mode,
  backend,
  model,
  currentPetContext
})
```

It returns:

```js
{
  prompt,
  sections,
  warnings,
  mode,
  actionId
}
```

This is preferred over embedding a long string in `host-model-bridge.js` because prompt construction needs its own tests, mode handling, and future extension points.

## 5. Architecture Boundary

Creator Studio owns:

- interpreting the user's creative request;
- normalizing action and pet-generation tasks;
- building OpenPet-specific image prompts;
- storing run logs and generated artifacts;
- exposing prompt provenance in QA artifacts.

OpenPet host owns:

- API keys and provider configuration;
- model health checks;
- image API invocation;
- output file writing;
- pet-pack import and activation;
- provider diagnostics.

The plugin must not receive API keys. The prompt builder is semantic glue, not a provider client.

## 6. Data Flow

```text
User prompt
  -> create-run
  -> conversation-wizard drafts generationTask
  -> generation-task normalizes structure
  -> run-step
  -> host-model-bridge
  -> openpet-prompt-builder builds final prompt
  -> /creator/model-image-generate bridge
  -> image-generation-model-service calls provider
  -> output image + generatedImage metadata
```

`host-model-bridge.js` should pass the generated prompt instead of the raw user prompt. It should keep the raw prompt only as provenance in run metadata and QA output.

## 7. Prompt Builder Inputs

Minimum input fields:

- `run.input.prompt`: user-facing prompt.
- `run.input.originalPrompt`: unmodified user text when available.
- `run.input.generationTask`: normalized task if present.
- `run.petId`: fallback identity.
- `backend`: `cloud`, `local`, or `fixture`.
- `model`: provider model id when known, such as `gpt-image-2`.

Optional future fields:

- active pet manifest metadata;
- active pet preview summary;
- reference image captions;
- user-selected style profile;
- action history for style consistency.

The first version should not require optional fields.

## 8. Prompt Output Structure

The final prompt should be structured, stable, and easy to inspect. It should use English for model reliability even when user input is Chinese.

Recommended section order:

1. `Intent`
2. `OpenPet Runtime Contract`
3. `Canvas And Boundary Rules`
4. `Character Shape Language`
5. `Generation Mode`
6. `Action Requirements`
7. `Style Consistency`
8. `Output Requirements`
9. `Negative Constraints`
10. `User Creative Brief`

The user brief should be preserved but placed after the runtime contract so model behavior is anchored by OpenPet constraints.

## 9. OpenPet Runtime Contract

Every generated prompt must state:

- this is an OpenPet desktop pet sprite asset;
- the output is for a small floating desktop pet window;
- it is not a poster, wallpaper, avatar, scene illustration, sticker sheet, UI mockup, or character sheet;
- the image must contain exactly one pet character;
- the character must remain readable at 128px to 256px;
- the character should use a clean sprite-like silhouette;
- the output must be suitable for later action-frame generation and packaging.

This section is mandatory for all modes.

## 10. Canvas And Boundary Rules

Every generated prompt must include:

- one complete pet character, fully visible;
- centered composition;
- 8-12% safe padding on all sides;
- no cropped ears, tail, paws, limbs, accessories, props, or motion arcs;
- no body part touching the image edge;
- stable body center;
- simple orthographic or mild 3/4 view;
- avoid extreme perspective, close-up framing, half-body framing, and dynamic camera angles.

The purpose is to protect downstream sprites, hitboxes, and desktop-window placement.

## 11. Background And Transparency Policy

OpenPet wants transparent-friendly assets, but provider support differs.

Prompt wording should always request:

- clean PNG-friendly sprite source;
- plain clean background or transparent-friendly cutout;
- easy-to-separate silhouette;
- no scene background.

Provider payload compatibility remains in `image-generation-model-service`. For example, `gpt-image-2` may omit the provider `background` parameter while the prompt still asks for transparent-friendly output.

The prompt builder should not mention internal provider payload details.

## 12. Character Shape Language

Every prompt should define a shape language suitable for OpenPet:

- compact desktop-pet body;
- slightly oversized head for readability;
- clear face and simple readable expression;
- simple limbs with clear silhouette;
- visible paws, ears, tail, or equivalent identity features;
- action-ready body parts that can move without redesigning the character;
- large readable shapes instead of tiny details;
- stable ground contact or stable floating posture;
- no extra limbs, duplicate heads, merged paws, malformed tail, or unclear face.

This is especially important because generated images will be used as the seed for action generation.

## 13. Generation Modes

### full-pet

Use when creating a new complete pet concept.

Prompt must emphasize:

- coherent pet identity;
- body structure that can support multiple actions;
- front or mild 3/4 view;
- neutral base pose unless the user asks otherwise;
- distinctive but simple palette;
- no single-use pose that prevents future animation.

### single-action

Use when adding an action to an existing or implied current pet.

Prompt must emphasize:

- same character identity;
- same proportions;
- same line weight;
- same palette;
- same camera angle;
- same visual complexity;
- action pose readable as a sprite.

### custom-action

Use when the user defines a custom behavior, trigger, or action.

Prompt must include:

- action name;
- motion intent;
- trigger type;
- loop policy;
- frame count intent when available;
- whether the action should feel subtle, expressive, playful, reactive, or dramatic;
- clear warning against changing the pet into a different character.

`custom-action` can be represented as `single-action` plus stronger action-specific text in the first implementation.

### frame-repair

Future mode for repairing failed image or frame output.

Prompt should emphasize:

- preserve identity;
- preserve pose intent;
- fix only the named defect;
- do not redesign the character.

This mode should stay out of the first implementation unless the code already has a repair entry point.

## 14. Action Requirements

For each action in `generationTask.actions`, the prompt should include:

- `actionId`;
- action display name;
- motion prompt;
- loop or one-shot behavior;
- trigger proposal;
- frame count;
- transparent-background preference;
- key pose plan.

Recommended key pose plan:

- anticipation;
- primary action pose;
- readable exaggeration;
- recovery or loop return.

For looping actions:

- start and end pose should be compatible;
- motion should not drift across the canvas;
- body center should remain stable.

For one-shot actions:

- start from neutral;
- perform the action clearly;
- return to neutral or end in a clear final pose.

## 15. Style Consistency Policy

When `styleSource` is `currentPet`, the prompt must say:

- keep the current pet's style, proportions, palette, facial design, and line work;
- do not redesign species, costume, body shape, or personality;
- only change the pose/action required by the task;
- avoid adding new major accessories unless requested.

When `styleSource` is `textOnly`, the prompt may define a new pet but still must satisfy the OpenPet runtime contract.

When `styleSource` is `referenceImage`, future implementation should add reference-aware constraints, but this first prompt builder can describe the intent without processing image files.

## 16. Negative Constraints

Every prompt must include a compact but explicit negative block:

- no background scene;
- no floor, furniture, room, landscape, props unrelated to the action;
- no text, logo, watermark, signature, UI, frame, border;
- no extra characters;
- no sticker sheet;
- no multiple poses in one image;
- no cropped body parts;
- no close-up portrait;
- no realistic noisy fur or tiny unreadable ornamentation;
- no heavy shadow that merges with the character;
- no complex lighting;
- no strong perspective;
- no malformed limbs, duplicate limbs, extra tails, or merged facial features.

The negative block should be specific enough to reduce common generation failures but not so large that it overwhelms the creative brief.

## 17. Provider Compatibility Notes

The prompt builder should remain provider-neutral.

It may receive `model` to adjust wording, but it should not encode provider API payload behavior.

Allowed model-aware behavior:

- if model is `gpt-image-2`, avoid saying "alpha channel required" as a hard requirement and instead say "transparent-friendly, easy cutout silhouette";
- if model is unknown, use provider-neutral transparent-friendly wording;
- if backend is `local`, keep the prompt concise enough for local models.

Disallowed behavior:

- including API keys;
- including absolute file paths;
- including bridge URLs or local endpoints;
- including provider request parameters such as `response_format`.

## 18. Prompt Provenance

Creator Studio should persist prompt provenance for review and debugging.

Recommended metadata:

```json
{
  "promptBuilderVersion": 1,
  "mode": "single-action",
  "actionId": "action-wave",
  "sections": ["Intent", "OpenPet Runtime Contract"],
  "warnings": []
}
```

The full generated prompt may be stored in run QA artifacts, but it must not contain secrets or local absolute paths.

## 19. Error Handling

The prompt builder should fail fast only for impossible internal inputs, such as invalid mode after normalization.

For missing optional data:

- use safe defaults;
- add a warning;
- still produce a prompt.

For missing generation task:

- infer a minimal `full-pet` or `single-action` prompt from raw user text and run metadata;
- avoid throwing unless both user prompt and pet id are empty.

## 20. Testing Strategy

Use Node native tests under `tests/examples/creator-studio-plugin.test.js` or a dedicated test file if the existing file becomes too large.

Required tests:

- full-pet prompts include OpenPet runtime contract, canvas boundary, shape language, and negative constraints;
- single-action prompts include style consistency and action requirements;
- custom action input preserves trigger type, loop policy, frame count, and motion prompt;
- Chinese user prompts are preserved as creative brief while the structural prompt remains stable English;
- gpt-image-2 prompts use transparent-friendly wording without claiming provider alpha-channel enforcement;
- prompts never include API keys, bridge tokens, local absolute paths, or raw output directories;
- host-model-bridge sends the built prompt instead of raw user prompt;
- warnings are returned for missing optional context without failing the run.

## 21. Implementation Plan Preview

Implementation should be a small, testable slice:

1. Add `openpet-prompt-builder.js`.
2. Add prompt builder unit tests.
3. Update `host-model-bridge.js` to call the builder.
4. Store prompt provenance in generated QA metadata if the current output path supports it.
5. Verify cloud smoke generation still works with the configured host provider.

Do not add UI in this slice.

## 22. Main Page Backlog

These requirements should be assigned to the main Control Center later:

- model settings UI for prompt profile selection;
- editable user negative prompt;
- "show final prompt" developer toggle;
- prompt profile presets such as cute, pixel, flat, anime, minimal;
- user-controlled sprite boundary strictness;
- reference image upload and caption display;
- generation history prompt comparison.

They are useful, but not required for the plugin-first prompt builder.

## 23. Acceptance Criteria

The design is ready to implement when:

- Creator Studio has one prompt builder module;
- image generation no longer sends raw user text directly as the whole model prompt;
- all prompts include OpenPet runtime, boundary, shape, mode, and negative constraints;
- prompt tests pass;
- provider secrets and local paths are absent from prompts;
- host model bridge still owns the provider call boundary;
- at least one cloud smoke generation can run through the new prompt.

