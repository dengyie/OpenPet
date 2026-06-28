# Creator Studio Conversational Generation TODO

Date: 2026-06-19
Last updated: 2026-06-29
Status: Conversational task drafting, QA review, action-frame import, playback review, browser coverage, packaged evidence, and packaged fixture UI E2E are landed. The active production milestone is closing the dual-layer default flow so ordinary users can use a provider-first `生成并导入` path while Creator Studio remains the advanced details surface.
Scope: Creator Studio plugin extension for conversational full-pet and single-action generation

## Milestone Contract

Milestone: Creator Studio dual-layer default-flow closure

Goal: deliver a host-owned `生成并导入` main path that starts from OpenPet, runs on the real provider backend, avoids mid-run interruption, auto-imports on hard QA success, and falls back to Creator Studio details when repair or manual control is needed.

P0/P1 scope:

- P0: ordinary users can start from a host-owned `生成并导入` entry instead of the dashboard.
- P0: the default path runs on `provider`; it must not silently fall back to `fixture`.
- P0: the run sequence is `draft -> auto-answer safe follow-ups -> confirm -> generate -> auto-approve -> import`.
- P0: missing trigger input is auto-filled with a conservative `manual` proposal.
- P0: provider, QA, approval, or import failure preserves the same run and routes the user to advanced details.
- P1: the dashboard remains available as the expert surface for logs, repair, prompt provenance, review, and step-by-step execution.
- P1: docs, UI copy, and regression coverage all describe the same dual-layer behavior.

Out of scope for this milestone:

- new provider families or provider secret-storage redesign;
- rich trigger scheduler editing, cooldowns, priorities, or simulation;
- reference image upload;
- model-assisted intent parsing;
- full-pet UX redesign beyond keeping the shared task contract compatible;
- provider-backed packaged UI smoke as a merge gate.

Manual-required:

- real provider generation still requires a configured provider and human-approved secrets;
- final asset-quality acceptance still requires human inspection of generated sprites;
- provider-backed packaged app smoke remains a follow-up slice because it needs a configured packaged app session.

Acceptance boundary:

- a configured user can complete the default `生成并导入` path without mid-run questioning;
- missing provider configuration blocks before generation and routes the user to AI/model settings;
- hard QA success auto-approves and auto-imports;
- failures route to the matching Creator Studio run details path instead of degrading to fixture output;
- no API key, provider URL secret, bridge token, or absolute local artifact path leaks into renderer-visible logs or prompt output.

## Confirmed Product Direction

Creator Studio supports two generation modes:

- `single-action`: add, replace, or refine one action on an existing pet.
- `full-pet`: generate a complete pet pack with multiple coordinated actions.

The first closed loop prioritizes `single-action`, then reuses the same task model for `full-pet`.

The user experience is conversational, not form-first. Users describe what they want in natural language, and Creator Studio drafts a structured task. Follow-up questions are allowed only when required.

Custom user-defined actions are first-class. Users are not limited to built-in presets like idle, walk, sleep, or dance.

Custom actions can include trigger proposals. Creator Studio may propose how an action should be triggered, but OpenPet owns final trigger persistence and runtime behavior.

## Confirmed Product Direction (2026-06-29)

Creator Studio now has a locked dual-layer operating model:

- Default path: ordinary users start from a host-owned `生成并导入` entry in Control Center/OpenPet.
- Advanced path: Creator Studio dashboard remains available for task detail, run inspection, QA review, logs, repair, and manual step-by-step execution.
- The default path starts on the real `provider` backend, not `fixture`.
- If provider configuration is missing, the host stops before generation and sends the user to model settings instead of silently falling back.
- Once the default path starts, it does not interrupt the user with additional questions.
- Missing trigger input is filled with a conservative `manual` trigger proposal so imported actions do not self-fire unexpectedly.
- If generation reaches hard QA success, the same default path auto-approves and auto-imports.
- If provider generation, QA, approval, or import fails, the run falls back to the advanced dashboard/details path instead of leaving the user in a half-manual main flow.

## User-Facing Operating Model

### Ordinary user path

For most users, Creator Studio should feel like one host feature:

1. Open Control Center.
2. Describe the action or pet in natural language.
3. Click `生成并导入`.
4. Wait for one uninterrupted provider-backed run.
5. See the imported result summary or a single call to open details if manual work is needed.

The default experience should avoid exposing command names, plugin internals, raw run phases, or backend vocabulary unless the flow fails and the user explicitly chooses details.

### Advanced user path

Advanced users can still open Creator Studio directly to:

1. inspect or edit the drafted task;
2. run draft, answer, confirm, generate, approve, and import steps manually;
3. inspect QA artifacts, playback review, prompt provenance, and import follow-up;
4. repair or retry a specific run without starting over from the host surface.

The advanced path is not removed; it is repositioned behind the simpler host-owned path.

## Landed Baseline

These capabilities already exist and are not part of the new milestone scope:

- `GenerationTask` normalization, validation, safe action IDs, and deterministic prompt parsing are implemented.
- Creator Studio supports conversational `draft-task`, `answer-question`, and `confirm-task` workflow with durable run state.
- Single-action runs can generate ordered transparent action frames and full-pet runs can package a real generated atlas.
- Action review includes playback preview and timing diagnostics so loop behavior, hold timing, and total duration stay inspectable in-browser.
- Dashboard review surfaces expose sanitized prompt provenance, retry/recover guidance, imported follow-up routing, and phase-aware imported review surfaces.
- `Import Approved Action` imports approved action frames and submits trigger proposals into the host-owned Trigger Proposal Inbox.
- Creator Studio browser regressions cover dashboard run/review/import flows, and Control Center Plugins-pane smoke coverage exists for Creator Studio launch and command-result handoff.
- Workflow guidance includes `npm run smoke:ai-provider` and `npm run smoke:creator-studio-provider`; these commands validate the technical generation chain and host-owned model bridge, not final visual quality readiness.
- Packaged Creator Studio evidence tooling exists through `npm run run-packaged-creator-studio-evidence`.
- Packaged Creator Studio fixture UI E2E exists through `npm run run-packaged-creator-studio-ui-e2e`; it proves a full packaged fixture dashboard path, not provider-backed packaged smoke.

## User Prompt Model

Creator Studio should accept prompts like:

```text
给当前猫猫加一个“被摸头后害羞转圈”的动作，点击触发，风格保持一致。
```

```text
帮我做一只软乎乎的橘猫桌宠，平时懒懒的，被点击会害羞转圈，偶尔会打哈欠。
```

```text
新增一个自定义动作：看到鼠标靠近时探头偷看，动作要循环，适合菜单手动触发和随机触发。
```

The wizard extracts:

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

Both paths compile into one task shape.

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

For `full-pet`, `actions` contains multiple action plans that share one `characterBrief`.

## Architecture Boundary

Creator Studio dual-layer mode is split deliberately:

### Host-owned responsibilities

- ordinary-user entry point and user-facing progress UI;
- provider configuration, health, and secret storage;
- current pet context and import target selection;
- orchestration ownership for the one-click default path;
- trigger proposal inbox, trigger-rule persistence, and trigger runtime behavior;
- AI/model settings routing and failure follow-up entry points.

### Plugin-owned responsibilities

- prompt interpretation into `GenerationTask`;
- run workspace, logs, artifacts, and prompt snapshots;
- provider-facing generation execution once the host authorizes it;
- QA metadata, contact sheets, playback review, repair, and approval-ready evidence;
- advanced dashboard for detail inspection and manual execution.

### Ownership rule for the default flow

`host-owned` means more than just a renderer button. The production target is:

- the renderer collects the prompt and renders progress;
- the main process or a host service owns the long-running orchestration state machine;
- the plugin executes scoped commands inside that state machine;
- if Control Center reloads or closes, the run still exists and can be reopened from details.

This keeps the default path resilient without weakening command-scoped plugin boundaries.

## Runtime Data Flow

The dual-layer default path should move through these boundaries:

1. `PluginsPane` collects prompt text and calls a typed Control Center API method.
2. `control-center-preload.js` forwards the request through IPC without exposing provider secrets.
3. `src/main/ipc.js` delegates to a main-process default-flow service.
4. `creator-studio-default-flow-service.js` performs host preflight and owns the long-running state machine.
5. `PluginService` executes scoped Creator Studio commands and may open the dashboard with a `runId` query when follow-up is needed.
6. Creator Studio service and dashboard read and persist the run workspace, but do not take over host-owned provider settings or import ownership.
7. OpenPet host services keep final import, pet state mutation, trigger persistence, and provider secret handling on the host side.

The renderer should stay a thin client. It may render progress and open details, but it should not become the authoritative run sequencer.

## Conversational Wizard Rules

The wizard follows these rules:

- ask at most one follow-up question at a time;
- do not ask when a reasonable default is safe;
- prefer multiple-choice questions for trigger type, target pet, and style source;
- show a concise task preview before generation;
- allow users to edit the interpreted action name, trigger, loop setting, and motion description before running generation;
- preserve the original user prompt in the run workspace for auditability.

For the dual-layer mode:

- the advanced dashboard keeps conversational edit and review controls;
- the host-owned default path may auto-answer safe follow-up questions and skip the dashboard preview when running one-click flow;
- the same `GenerationTask` contract supports both paths so a run can move from default flow into advanced review without conversion.

Required follow-up questions:

- if intent is ambiguous between `full-pet` and `single-action`, ask which mode;
- if `single-action` has no target pet, default to current pet when available, otherwise ask;
- if trigger is missing for a custom action, ask whether it should be menu, click, random/timer, state, event, or unbound;
- if style source is missing, default to current pet for single-action and text-only for full-pet.

## Trigger Proposal Types

Supported trigger proposals:

- `manual`: action appears in menu/action library.
- `click`: suggested binding as `clickAction`.
- `random`: suggested periodic/random idle behavior.
- `state`: suggested state-driven trigger such as hover, idle, AI mood, or user proximity.
- `event`: suggested trigger from plugin event or local API event.
- `unbound`: generated action is imported but not bound.

Plugin responsibilities:

- parse and store `triggerProposal`;
- display trigger proposal in the dashboard;
- include proposal in import and review artifacts;
- avoid mutating trigger rules directly.

Host responsibilities:

- own actual trigger-rule schema and persistence;
- provide UI for accepting or editing trigger proposals;
- validate trigger rules against available actions;
- apply click, random, state, event, or menu bindings through host-owned services.

Implemented host support:

- reviewed proposals can be accepted through the Actions configuration path;
- `click` proposals are validated against existing actions and applied to `clickAction`;
- `manual` and `unbound` proposals are acknowledged without mutating bindings;
- `random`, `state`, and `event` proposals create durable host-owned trigger rules with source provenance;
- Control Center Actions includes a trigger proposal review card and saved trigger-rule panel showing target action, proposal type meaning, immediate effect, host-owned boundary, and last acceptance result.

## Plugin Processing Pipeline

### 1. Intent parsing

Input: natural-language prompt plus optional context.

Output:

- `mode`
- `targetPet`
- `styleSource`
- action candidates
- trigger hints
- unresolved questions

The current version may stay deterministic. Model-assisted intent parsing is later work.

### 2. Task completion

Fill missing safe defaults:

- `actionId`: slugified from action name and deduplicated against current actions.
- `frameCount`: default 16 for one-shot actions, 8 to 12 for simple loops.
- `loop`: true for ambient or repeating actions, false for click or reaction actions.
- `transparentBackground`: always true.
- `styleSource`: current pet for single-action when possible.

### 3. Prompt compilation

Compile model prompts from:

- original user prompt;
- style reference strategy;
- character brief;
- action motion prompt;
- frame plan;
- strict output constraints.

Prompt constraints request:

- transparent background;
- consistent character identity;
- stable scale and anchor;
- ordered animation frames;
- no text, watermark, UI, or background scene;
- action readability at small desktop-pet size.

### 4. Generation

Use the existing backend adapter boundary:

- `fixture` remains deterministic for tests and demos;
- `provider` uses the host model bridge when the host provider is configured;
- missing provider configuration must produce an explicit blocked state.

Creator Studio must not silently fall back from provider-backed generation to fixture output.

### 5. QA and review

QA checks:

- frame count matches task;
- alpha channel exists;
- dimensions are valid;
- action ID is safe;
- generated frames can be imported through the host creator-tools bridge;
- preview or contact sheet exists.

Review shows:

- original prompt;
- interpreted task;
- trigger proposal;
- generated preview;
- playback diagnostics;
- import action button.

### 6. Import

For `single-action`, import through the existing creator asset or frame import bridge. The host remains responsible for writing action assets into the editable pet area.

For `full-pet`, import through the approved pet-pack import bridge.

## Dual-Layer Runtime Contract

### Default path: host-owned `生成并导入`

1. User enters a natural-language request from the host UI.
2. Host performs preflight checks:
   - Creator Studio plugin and service availability;
   - provider backend is configured and healthy enough to attempt generation;
   - current pet context exists when the request targets the current pet.
3. Host starts a Creator Studio run using `provider`.
4. Creator Studio drafts the `GenerationTask`.
5. Safe remaining questions are auto-answered by policy:
   - missing trigger defaults to `manual`;
   - other questions may only be auto-answered when product policy explicitly marks them safe.
6. The run is confirmed automatically.
7. Generation executes on the host-owned model bridge.
8. If hard QA passes, the flow auto-approves and auto-imports.
9. The host shows the imported result summary and points users to `Actions -> Trigger Proposal Inbox` when follow-up review is relevant.

### Failure and fallback rules

- missing provider configuration: block before generation and route the user to AI/model settings;
- provider generation failure: keep the run workspace, show failure status, and offer advanced details for the same run;
- QA blocked: do not auto-approve; route the run to advanced review or repair;
- import or trigger-handoff failure: preserve the run, surface the host-side failure, and route users to advanced run details or Control Center follow-up UI.

### Failure routing matrix

| Failure point | Host surface behavior | Advanced follow-up |
| --- | --- | --- |
| plugin disabled / service stopped | block before run start | user enables plugin or starts service |
| provider unavailable | block before generation and point to AI provider settings | user fixes provider config, then retries |
| extra unanswered question beyond safe trigger default | stop the default path without discarding the run | open the same run in details and answer manually |
| generation failure | show concise failure summary | open the same run in details for retry / diagnosis |
| QA blocked | do not auto-approve or auto-import | open the same run in review / repair state |
| import failure | preserve generated artifacts and approval state | open the same run and host follow-up UI |

### Advanced path: Creator Studio dashboard

The dashboard remains the expert surface for:

- viewing the interpreted task and run history;
- editing drafted task fields before confirmation;
- step-by-step draft, answer, confirm, generate, approve, and import execution;
- QA review, frame repair, playback inspection, and prompt provenance;
- debugging provider failures and import or handoff failures.

The dashboard is no longer the required default path for ordinary users.

## Packaged UI Boundary

The shipped packaged Creator Studio evidence runner and packaged fixture UI E2E runner cover different proof tiers:

- `npm run run-packaged-creator-studio-evidence` proves declaration, service health, and `draft-task` readiness in a packaged session;
- `npm run run-packaged-creator-studio-ui-e2e` proves a full packaged fixture dashboard interaction path through Control Center;
- neither command proves provider-backed packaged generation quality.

The next packaged UI milestone is `packaged + provider` smoke on top of the landed packaged fixture UI path. That follow-up validates the technical chain in a real packaged UI session and still requires human review before any visual-quality claim.

## Remaining Work After This Milestone

- provider-backed packaged Creator Studio UI smoke;
- richer trigger-rule editor semantics, scheduler controls, and runtime simulation;
- model-assisted intent parsing;
- reference image upload and current-pet visual reference extraction;
- partial regeneration for one bad action or frame range;
- batch full-pet generation from the same `GenerationTask` shape;
- prompt examples for common pets and action archetypes.
