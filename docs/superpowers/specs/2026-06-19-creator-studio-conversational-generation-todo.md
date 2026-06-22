# Creator Studio Conversational Generation TODO

Date: 2026-06-19
Last updated: 2026-06-23
Status: Approved direction, partially implemented host support, remaining plugin TODO
Scope: Creator Studio plugin extension for conversational full-pet and single-action generation

## Confirmed Product Direction

Creator Studio should support both generation modes:

- `single-action`: add, replace, or refine one action on an existing pet.
- `full-pet`: generate a complete pet pack with multiple coordinated actions.

The first useful implementation should prioritize `single-action` as the minimum closed loop, then reuse the same task model for `full-pet`.

The user experience should be a conversational wizard, not a fixed form-first workflow. Users can describe what they want in natural language, and the plugin turns that into a structured generation task. The wizard may ask follow-up questions only when required.

Custom user-defined actions are first-class. Users are not limited to built-in presets like idle, walk, sleep, or dance.

Custom actions can include trigger proposals. The plugin may propose how an action should be triggered, but the OpenPet host and Control Center should own the final trigger rule persistence.

## User Prompt Model

The plugin should accept prompts like:

```text
给当前猫猫加一个“被摸头后害羞转圈”的动作，点击触发，风格保持一致。
```

```text
帮我做一只软乎乎的橘猫桌宠，平时懒懒的，被点击会害羞转圈，偶尔会打哈欠。
```

```text
新增一个自定义动作：看到鼠标靠近时探头偷看，动作要循环，适合菜单手动触发和随机触发。
```

The wizard should extract:

- intent: full pet, single action, replace action, or refine action;
- target pet: current pet or new pet;
- style source: current pet, uploaded reference, or text-only;
- action name and generated safe `actionId`;
- motion description;
- loop behavior;
- frame count and timing;
- transparent background requirement;
- trigger proposal;
- unresolved questions.

## Generation Task Contract

All generation modes should compile into one task shape.

```json
{
  "mode": "single-action",
  "targetPet": "current",
  "styleSource": "currentPet",
  "characterBrief": "保持当前宠物的外观、比例、颜色和线条风格",
  "actions": [
    {
      "actionId": "shy-spin",
      "name": "被摸头害羞转圈",
      "motionPrompt": "被摸头后先愣一下，然后害羞转一圈，最后回到站立姿势",
      "loop": false,
      "frameCount": 16,
      "triggerProposal": {
        "type": "click",
        "binding": "clickAction",
        "notes": "用户明确要求点击触发"
      }
    }
  ],
  "questions": []
}
```

For `full-pet`, `actions` contains multiple action plans that share a single `characterBrief`.

## Conversational Wizard Rules

The wizard should follow these rules:

- Ask at most one follow-up question at a time.
- Do not ask when a reasonable default is safe.
- Prefer multiple-choice questions for trigger type, target pet, and style source.
- Show a concise task preview before generation.
- Allow users to edit the interpreted action name, trigger, loop setting, and motion description before running generation.
- Preserve the original user prompt in the run workspace for auditability.

Required follow-up questions:

- If intent is ambiguous between `full-pet` and `single-action`, ask which mode.
- If `single-action` has no target pet, default to current pet when available; otherwise ask.
- If trigger is missing for a custom action, ask whether it should be menu, click, random/timer, state, event, or unbound.
- If style source is missing, default to current pet for single-action and text-only for full-pet.

## Trigger Proposal Types

Supported trigger proposals:

- `manual`: action appears in menu/action library.
- `click`: suggested binding as `clickAction`.
- `random`: suggested periodic/random idle behavior.
- `state`: suggested state-driven trigger such as hover, idle, AI mood, or user proximity.
- `event`: suggested trigger from plugin event or local API event.
- `unbound`: generated action is imported but not bound.

Plugin responsibilities:

- Parse and store `triggerProposal`.
- Display trigger proposal in the dashboard.
- Include proposal in import/review artifacts.
- For first implementation, import action frames without directly mutating trigger rules.

Host/Control Center responsibilities:

- Own actual trigger rule schema and persistence.
- Provide UI for accepting or editing trigger proposals.
- Validate trigger rules against available actions.
- Apply click/default/random/state/event bindings through host-owned services.

Implemented host support:

- Reviewed proposals can be accepted through the Actions configuration path.
- `click` proposals are validated against existing actions and applied to `clickAction`.
- `manual` and `unbound` proposals are acknowledged without mutating trigger bindings.
- `random`, `state`, and `event` proposals return a pending-host-rule result until a full trigger-rule schema/editor exists.

## Plugin Processing Pipeline

### 1. Intent Parsing

Input: natural language prompt plus optional context.

Output:

- `mode`
- `targetPet`
- `styleSource`
- action candidates
- trigger hints
- unresolved questions

First version can use deterministic parsing rules and defaults. Later versions may call a model through the host model bridge when available.

### 2. Task Completion

Fill missing safe defaults:

- `actionId`: slugified from action name, de-duplicated against current actions.
- `frameCount`: default 16 for one-shot actions, 8-12 for simple loops.
- `loop`: true for ambient/repeating actions, false for click/reaction actions.
- `transparentBackground`: always true.
- `styleSource`: current pet for single-action when possible.

### 3. Prompt Compilation

Compile model prompts from:

- original user prompt;
- style reference strategy;
- character brief;
- action motion prompt;
- frame plan;
- strict output constraints.

Prompt constraints should request:

- transparent background;
- consistent character identity;
- stable scale and anchor;
- ordered animation frames;
- no text, watermark, UI, or background scene;
- action readable at small desktop-pet size.

### 4. Generation

Use the existing backend adapter boundary:

- `fixture` remains deterministic for tests and demos.
- `cloud` remains `not_configured` until host model settings/bridge are available.
- `local` remains `not_configured` until local endpoint settings are available.

The plugin should not silently fall back from cloud/local to fixture.

### 5. QA and Review

QA should check:

- frame count matches task;
- alpha channel exists;
- dimensions are valid;
- action id is safe;
- generated frames can be imported through host creator-tools bridge;
- preview/contact sheet exists.

Review should show:

- original prompt;
- interpreted task;
- trigger proposal;
- generated preview;
- import action button.

### 6. Import

For `single-action`, import through the existing creator asset/frame import bridge. The host remains responsible for writing action assets into the editable pet/action area.

For `full-pet`, import through the approved pet-pack import bridge.

## TODO: Plugin Work

- Add `GenerationTask` schema and validators.
- Add a `conversation` or `wizard` module that parses prompts into draft tasks.
- Add task completion defaults for action id, frame count, loop, style source, and trigger proposal.
- Extend `create-run` payload to accept `mode`, `targetPet`, `styleSource`, `actions`, and `conversation`.
- Persist `generationTask` and `originalPrompt` in `run.json`.
- Add single-action run workspace folders for imported/generated action frames.
- Add deterministic fixture support for custom single-action tasks.
- Add QA metadata for custom actions and trigger proposals.
- Add dashboard UI for conversation prompt, task preview, follow-up question, and approval.
- Add commands or routes for `draft-task`, `answer-question`, `confirm-task`, and `generate-action`.
- Add tests for prompt parsing, safe defaults, run persistence, and single-action import workflow.

## TODO: Host / Main UI Work

- Define host-owned trigger rule schema.
- Add Control Center UI for trigger rules and accepted trigger proposals.
- Add bridge route for reading current pet/action context needed by style-source selection.
- Add bridge route for accepting a plugin trigger proposal after user review.
- Add validation that trigger bindings reference existing imported actions.
- Add model settings UI and host model bridge from the model-settings backlog before real cloud/local generation.
- Ensure API keys remain in host secret storage and are not exposed to ordinary plugins.

Completed host slice:

- OpenPet host now accepts reviewed action trigger proposals through the Actions configuration path.
- `click` proposals can be applied to `clickAction` after validating the target action exists.
- `manual` and `unbound` proposals are confirmed without mutating bindings.
- `random`, `state`, and `event` proposals remain visible as pending host-rule work until the full trigger-rule schema/editor exists.

Remaining host/main UI request:

- Add a trigger proposal inbox/editor in Control Center so users can review, edit, accept, or reject proposals from Creator Studio and other plugins.
- Define the durable trigger-rule schema for `random`, `state`, and `event` rules.
- Add simulation/preview before applying non-click triggers.
- Keep final trigger persistence host-owned; plugins should continue to propose rather than directly mutate rules.

## TODO: Later Work

- Model-assisted intent parsing once the host model bridge exists.
- Reference image upload and current-pet reference extraction.
- Partial regeneration for one bad action/frame range.
- Batch full-pet generation from the same `GenerationTask` shape.
- Trigger simulation preview before applying trigger proposals.
- A small prompt library with examples for common actions and pet archetypes.

## Acceptance Criteria

The first implementation is acceptable when:

- a user can describe a custom single action in natural language;
- the plugin turns that prompt into a reviewable `GenerationTask`;
- the plugin asks only necessary follow-up questions;
- fixture generation produces a valid custom action output;
- QA catches malformed action outputs;
- the approved action imports through the host bridge;
- trigger proposals are persisted and visible without being silently applied by the plugin;
- the same task contract can represent a future full-pet run.
