# Creator Studio TODO Development Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the next production slice for Creator Studio: conversational custom single-action generation, reviewable trigger proposals, deterministic fixture output, QA, and a clear host handoff for model settings and trigger persistence.

**Architecture:** Keep Creator Studio as a plugin-owned workflow for prompts, run state, artifacts, preview, QA, and import requests. Keep model credentials, model settings, current pet context, and trigger-rule persistence in the OpenPet host/main UI boundary. The plugin may propose actions and triggers, but OpenPet owns final application of pet state and trigger rules.

**Tech Stack:** Electron main process services, OpenPet plugin command runner, Node CommonJS modules, Node native test runner, Creator Studio local HTTP service, static dashboard HTML/JS.

---

## Milestone Contract

**Milestone:** Creator Studio conversational single-action generation closure.

**Target user capability:** A user can type a natural-language custom action request, review the interpreted `GenerationTask`, generate a deterministic fixture action output, inspect QA and trigger proposal metadata, and import the approved result through the existing OpenPet bridge without the plugin silently applying trigger rules.

**P0/P1 scope:**
- P0: Preserve existing `npm start`, plugin manifest validation, run creation, generation, approval, import, and secret redaction behavior.
- P0: Add stable task lifecycle routes/commands for drafting, answering follow-up questions, confirming, and generating a single custom action.
- P0: Persist original prompt, interpreted task, approval state, trigger proposal, QA metadata, and generated artifacts under the run workspace.
- P1: Add dashboard UI for prompt input, task preview, follow-up answer, run logs, QA summary, trigger proposal, and generate/import actions.
- P1: Add tests for prompt parsing, task updates, run persistence, dashboard service routes, fixture generation, QA failure paths, and import handoff metadata.

**Out of scope for this milestone:**
- Host model settings UI implementation.
- Host-managed secret storage changes beyond documenting the required interface.
- Host trigger-rule persistence implementation.
- Model-assisted intent parsing.
- Reference image upload.
- Partial regeneration of individual frames.
- Full-pet batch generation beyond keeping the shared `GenerationTask` shape compatible.
- Remote marketplace or production plugin submission changes.

**Manual-required:**
- Real cloud image generation requires a configured provider and user-approved secrets.
- Real packaged-app import smoke requires launching a packaged Electron app.
- Final trigger behavior requires host/main UI implementation of trigger-rule persistence.

**Phase limit:** 3 implementation phases.

**Acceptance criteria:**
- Existing targeted tests pass: `node --test tests/examples/creator-studio-plugin.test.js tests/examples/creator-studio-real-atlas-builder.test.js tests/services/image-generation-model-service.test.js tests/services/plugin-service.test.js`.
- Syntax check passes: `npm run check:syntax`.
- New Creator Studio task lifecycle tests prove draft, question answer, confirmation, fixture generation, QA, and import metadata.
- No API key, local provider URL, bridge token, or local file path is written into generated prompts or logs.
- `cloud` and `local` backends keep honest failure states when host configuration is unavailable; no silent fixture fallback.

## Current Baseline

The following pieces already exist and should be extended, not rewritten:

- `examples/plugins/creator-studio/lib/generation-task.js`: normalizes `GenerationTask`, actions, questions, trigger proposals, and safe action IDs.
- `examples/plugins/creator-studio/lib/conversation-wizard.js`: deterministic prompt-to-task draft logic for custom actions.
- `examples/plugins/creator-studio/lib/openpet-prompt-builder.js`: OpenPet-specific image prompt compiler with runtime, canvas, boundary, transparency, style, and negative constraints.
- `examples/plugins/creator-studio/lib/run-store.js`: durable run workspace, `run.json`, inputs, outputs, QA, logs, and state updates.
- `examples/plugins/creator-studio/lib/backend-runner.js`: backend dispatch, fixture support, host-model bridge path, append-only logs, and failure state persistence.
- `examples/plugins/creator-studio/lib/real-atlas-builder.js`: host-generated image to OpenPet atlas conversion with path/symlink safety checks.
- `examples/plugins/creator-studio/lib/action-frame-builder.js`: host-generated image to ordered transparent single-action frame sequence with QA evidence and repair support.
- `examples/plugins/creator-studio/commands/import-approved-action.js`: approved single-action import through the host creator asset bridge.
- `examples/plugins/creator-studio/service/studio-service.js`: loopback dashboard service with task lifecycle, generation, run list/detail/logs, action review, frame preview/repair, approval, and sanitized public artifact APIs.
- `examples/plugins/creator-studio/web/dashboard/index.html`: static dashboard UI for prompt entry, task review, generation, QA/action review, frame repair, approval, import handoff, and logs.
- `tests/examples/creator-studio-plugin.test.js`: broad Creator Studio plugin tests.
- `tests/examples/creator-studio-real-atlas-builder.test.js`: real atlas builder tests.
- `tests/examples/creator-studio-action-frame-builder.test.js`: action-frame generation and repair tests.

## Status Update 2026-06-24

Completed since this plan was written:
- Conversational single-action task workflow is implemented through `draft-task`, `answer-question`, `confirm-task`, dashboard routes, and persisted run state.
- Single-action runs can generate reviewable frame artifacts under the Creator Studio data directory instead of only producing a pet-pack atlas.
- Dashboard users can inspect action-review metadata, preview individual frames through data-relative URLs, repair a selected frame from the generated source image, approve the run, and receive the correct import command.
- `import-approved-action` imports approved action frames through `/creator/assets/import-frames`; the plugin still does not mutate trigger bindings directly.
- Approval/import paths gate action frames on passing QA metadata, ordered frame evidence, matching dimensions/count, and non-empty visible-pixel evidence.

Remaining production TODO:
- Consolidate action-frame QA validation into one shared module used by dashboard approval, CLI approval/import, and tests.
- Add real provider smoke coverage for configured `cloud` and `local` providers, without claiming visual quality automatically.
- Add Electron/Control Center E2E coverage for the Creator Studio plugin entry and dashboard click flow.
- Finish host-owned trigger proposal inbox/editor and durable non-click trigger-rule persistence.

## File Structure

### Plugin Runtime Files

- Modify `examples/plugins/creator-studio/lib/generation-task.js` to add explicit update helpers for trigger answers and task confirmation metadata.
- Modify `examples/plugins/creator-studio/lib/conversation-wizard.js` to support answer application without re-parsing the whole prompt.
- Modify `examples/plugins/creator-studio/lib/run-store.js` to persist `conversation`, `generationTask`, `taskStatus`, `approval`, and generated single-action metadata.
- Modify `examples/plugins/creator-studio/lib/backend-runner.js` to preserve single-action QA metadata in generated output artifacts.
- Modify `examples/plugins/creator-studio/lib/fake-hatch-pet.js` only if deterministic fixture output needs action-specific metadata in `creatorStudio`.
- Create `examples/plugins/creator-studio/lib/task-workflow.js` for draft, answer, confirm, and generate-action orchestration.

### Plugin Commands And Service

- Create `examples/plugins/creator-studio/commands/draft-task.js`.
- Create `examples/plugins/creator-studio/commands/answer-question.js`.
- Create `examples/plugins/creator-studio/commands/confirm-task.js`.
- Modify `examples/plugins/creator-studio/commands/create-run.js` so legacy run creation remains compatible while conversational runs are explicit.
- Modify `examples/plugins/creator-studio/commands/run-step.js` only if it must route to confirmed task generation.
- Modify `examples/plugins/creator-studio/plugin.json` to declare new command entries.
- Modify `examples/plugins/creator-studio/service/studio-service.js` to expose local dashboard APIs:
  - `POST /api/tasks/draft`
  - `POST /api/runs/:runId/questions/:questionId/answer`
  - `POST /api/runs/:runId/confirm`
  - `POST /api/runs/:runId/generate-action`

### Dashboard

- Replace the placeholder in `examples/plugins/creator-studio/web/dashboard/index.html` with a small static UI that can:
  - submit a natural-language prompt;
  - show task preview;
  - show one follow-up question;
  - confirm task;
  - start fixture generation;
  - show backend state, QA state, trigger proposal, logs, and import status.

### Tests

- Modify `tests/examples/creator-studio-plugin.test.js` for task workflow, service routes, dashboard HTML smoke, and fixture single-action metadata.
- Add `tests/examples/creator-studio-task-workflow.test.js` if the existing file becomes hard to read.
- Keep `tests/examples/creator-studio-real-atlas-builder.test.js` focused on image-to-atlas safety and do not mix wizard tests into it.

### Main UI / Host Handoff Docs

- Modify `docs/superpowers/specs/2026-06-19-openpet-model-settings-backlog.md` only if the host handoff contract changes.
- Modify `docs/superpowers/specs/2026-06-19-creator-studio-conversational-generation-todo.md` after implementation to mark completed plugin-slice items and preserve host-owned gaps.

## Phase 1: Task Lifecycle Contract

**Phase goal:** Make custom action prompts become durable, editable, confirmable `GenerationTask` runs without requiring dashboard UI.

**P0/P1 mapping:** P0 task lifecycle, P0 run persistence, P1 deterministic tests.

**Files:**
- Create `examples/plugins/creator-studio/lib/task-workflow.js`
- Create `examples/plugins/creator-studio/commands/draft-task.js`
- Create `examples/plugins/creator-studio/commands/answer-question.js`
- Create `examples/plugins/creator-studio/commands/confirm-task.js`
- Modify `examples/plugins/creator-studio/lib/generation-task.js`
- Modify `examples/plugins/creator-studio/lib/conversation-wizard.js`
- Modify `examples/plugins/creator-studio/lib/run-store.js`
- Modify `examples/plugins/creator-studio/plugin.json`
- Test `tests/examples/creator-studio-plugin.test.js`

- [ ] **Step 1: Write failing tests for task workflow**

Add tests that create a draft from this prompt:

```js
const draft = draftTaskRun({
  dataDir,
  payload: {
    prompt: '新增一个自定义动作：原地打滚，动作要循环。',
    backend: 'fixture'
  },
  now: () => '2026-06-20T00:00:00.000Z'
})
```

Expected assertions:

```js
assert.equal(draft.run.status, 'draft')
assert.equal(draft.run.taskStatus, 'needs_input')
assert.equal(draft.run.generationTask.mode, 'single-action')
assert.equal(draft.run.generationTask.actions[0].name, '原地打滚')
assert.equal(draft.run.generationTask.actions[0].triggerProposal.type, 'unbound')
assert.equal(draft.run.generationTask.questions[0].id, 'trigger')
```

Add a second test that answers the trigger question:

```js
const answered = answerTaskQuestion({
  dataDir,
  runId: draft.run.runId,
  questionId: 'trigger',
  answer: 'click',
  now: () => '2026-06-20T00:01:00.000Z'
})
```

Expected assertions:

```js
assert.equal(answered.run.taskStatus, 'ready_for_confirmation')
assert.equal(answered.run.generationTask.questions.length, 0)
assert.deepEqual(answered.run.generationTask.actions[0].triggerProposal, {
  type: 'click',
  binding: 'clickAction',
  notes: 'User selected click trigger.'
})
```

- [ ] **Step 2: Run tests and confirm the new workflow is missing**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected result: fail because `task-workflow.js`, `draftTaskRun`, `answerTaskQuestion`, or new command declarations do not exist yet.

- [ ] **Step 3: Implement `task-workflow.js`**

Implement these exported functions:

```js
module.exports = {
  answerTaskQuestion,
  confirmTaskRun,
  draftTaskRun
}
```

Behavior:
- `draftTaskRun` calls `draftGenerationTask`, creates a run, sets `taskStatus` to `needs_input` when questions exist, otherwise `ready_for_confirmation`.
- `answerTaskQuestion` only accepts known question IDs and allowed options.
- For `questionId === 'trigger'`, map answer values to trigger proposals:
  - `manual` -> `{ type: 'manual', notes: 'User selected manual trigger.' }`
  - `click` -> `{ type: 'click', binding: 'clickAction', notes: 'User selected click trigger.' }`
  - `random` -> `{ type: 'random', notes: 'User selected random trigger.' }`
  - `state` -> `{ type: 'state', notes: 'User selected state trigger.' }`
  - `event` -> `{ type: 'event', notes: 'User selected event trigger.' }`
  - `unbound` -> `{ type: 'unbound', notes: 'User selected unbound trigger.' }`
- `confirmTaskRun` requires no remaining questions and sets `taskStatus` to `confirmed`, `status` to `draft`, and `currentStep` to `confirmed`.
- Every mutation writes a log event through `appendRunLog`.

- [ ] **Step 4: Persist task workflow fields in `run-store.js`**

Update `createRun` so conversational runs include:

```js
taskStatus: generationTask
  ? (generationTask.questions.length > 0 ? 'needs_input' : 'ready_for_confirmation')
  : 'not_started',
conversation: {
  originalPrompt,
  answers: []
}
```

Write `inputs/original-prompt.txt` when `originalPrompt` exists.

- [ ] **Step 5: Add command entries**

Add commands to `examples/plugins/creator-studio/plugin.json`:

```json
{
  "id": "draft-task",
  "title": "Draft Creator Task",
  "entry": "commands/draft-task.js"
}
```

```json
{
  "id": "answer-question",
  "title": "Answer Creator Task Question",
  "entry": "commands/answer-question.js"
}
```

```json
{
  "id": "confirm-task",
  "title": "Confirm Creator Task",
  "entry": "commands/confirm-task.js"
}
```

Do not remove existing commands.

- [ ] **Step 6: Run targeted verification**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
npm run check:syntax
```

Expected result: all pass.

- [ ] **Step 7: Commit**

```bash
git add examples/plugins/creator-studio tests/examples/creator-studio-plugin.test.js
git commit -m "feat(phase-1): add creator studio task workflow"
```

## Phase 2: Single-Action Generation QA And Import Metadata

**Phase goal:** Generate a deterministic custom single-action fixture output with QA and trigger proposal metadata that can be reviewed before import.

**P0/P1 mapping:** P0 no silent backend fallback, P0 artifact persistence, P1 QA metadata.

**Files:**
- Modify `examples/plugins/creator-studio/lib/backend-runner.js`
- Modify `examples/plugins/creator-studio/lib/fake-hatch-pet.js`
- Modify `examples/plugins/creator-studio/lib/run-store.js`
- Modify `examples/plugins/creator-studio/commands/run-step.js`
- Test `tests/examples/creator-studio-plugin.test.js`

- [ ] **Step 1: Write failing tests for confirmed-task generation**

Create a run from:

```js
const draft = draftTaskRun({
  dataDir,
  payload: {
    prompt: '给当前猫猫加一个“被摸头后害羞转圈”的动作，点击触发，风格保持一致。',
    backend: 'fixture'
  },
  now: () => '2026-06-20T01:00:00.000Z'
})
const confirmed = confirmTaskRun({
  dataDir,
  runId: draft.run.runId,
  now: () => '2026-06-20T01:01:00.000Z'
})
const output = await runGenerationStep({
  dataDir,
  runId: confirmed.run.runId,
  now: () => '2026-06-20T01:02:00.000Z'
})
```

Expected assertions:

```js
assert.equal(output.run.status, 'ready_for_review')
assert.equal(output.run.reviewStatus, 'pending')
assert.equal(output.run.generationTask.actions[0].triggerProposal.type, 'click')
assert.ok(output.run.artifacts.qa)
assert.ok(output.run.artifacts.bundle.endsWith('.codex-pet.zip'))
```

Read `qa/action-generation-task.json` and assert:

```js
assert.equal(qa.ok, true)
assert.equal(qa.mode, 'single-action')
assert.equal(qa.actions[0].name, '被摸头后害羞转圈')
assert.equal(qa.actions[0].triggerProposal.type, 'click')
assert.equal(qa.importPolicy.appliesTriggerAutomatically, false)
```

- [ ] **Step 2: Run tests and confirm missing QA metadata**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected result: fail until fixture output writes action task QA and import policy metadata.

- [ ] **Step 3: Extend fixture metadata**

Update fixture generation so `creatorStudio` metadata includes:

```js
{
  generationTask: run.generationTask,
  actions: run.generationTask.actions,
  importPolicy: {
    importsFrames: true,
    appliesTriggerAutomatically: false,
    triggerProposalOwner: 'openpet-host'
  }
}
```

Keep legacy full-pet fixture output compatible for runs without `generationTask`.

- [ ] **Step 4: Add QA write path**

Ensure fixture and host-generated paths both write:

```text
qa/action-generation-task.json
```

The file must include:
- `ok`
- `originalPrompt`
- `mode`
- `targetPet`
- `styleSource`
- `actions`
- `importPolicy`
- `promptBuilder` when available

- [ ] **Step 5: Enforce confirmed generation**

Update `run-step.js` or `runGenerationStep` so a run with `generationTask.questions.length > 0` fails with:

```text
Creator Studio task must be confirmed before generation
```

Runs without `generationTask` keep legacy behavior.

- [ ] **Step 6: Run targeted verification**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js tests/examples/creator-studio-real-atlas-builder.test.js
npm run check:syntax
```

Expected result: all pass.

- [ ] **Step 7: Commit**

```bash
git add examples/plugins/creator-studio tests/examples/creator-studio-plugin.test.js
git commit -m "feat(phase-2): persist creator studio action QA"
```

## Phase 3: Dashboard And Service Review Flow

**Phase goal:** Make the plugin dashboard usable for prompt entry, task review, follow-up answering, generation, QA inspection, logs, and import handoff.

**P0/P1 mapping:** P1 dashboard flow, P1 route tests, P0 loopback-only service behavior preserved.

**Files:**
- Modify `examples/plugins/creator-studio/service/studio-service.js`
- Modify `examples/plugins/creator-studio/web/dashboard/index.html`
- Test `tests/examples/creator-studio-plugin.test.js`

- [ ] **Step 1: Write failing service route tests**

Start the service with a temp `dataDir`, then call:

```http
POST /api/tasks/draft
Content-Type: application/json

{"prompt":"新增一个自定义动作：原地打滚，动作要循环。","backend":"fixture"}
```

Expected JSON:

```json
{
  "ok": true,
  "run": {
    "taskStatus": "needs_input"
  }
}
```

Call:

```http
POST /api/runs/<runId>/questions/trigger/answer
Content-Type: application/json

{"answer":"click"}
```

Expected JSON:

```json
{
  "ok": true,
  "run": {
    "taskStatus": "ready_for_confirmation"
  }
}
```

Call:

```http
POST /api/runs/<runId>/confirm
Content-Type: application/json

{}
```

Expected JSON:

```json
{
  "ok": true,
  "run": {
    "taskStatus": "confirmed"
  }
}
```

- [ ] **Step 2: Run tests and confirm routes are missing**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js
```

Expected result: fail with HTTP 404 or missing route behavior.

- [ ] **Step 3: Add JSON body parsing to `studio-service.js`**

Implement a bounded JSON parser:

```js
const readJsonBody = (request, maxBytes = 64 * 1024) => new Promise((resolve, reject) => {
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
    if (Buffer.byteLength(body) > maxBytes) {
      reject(new Error('Request body is too large'))
      request.destroy()
    }
  })
  request.on('end', () => {
    if (!body.trim()) {
      resolve({})
      return
    }
    try {
      resolve(JSON.parse(body))
    } catch (_) {
      reject(new Error('Request body must be valid JSON'))
    }
  })
  request.on('error', reject)
})
```

Return `400` for invalid payloads and `500` only for unexpected errors.

- [ ] **Step 4: Add service routes**

Wire routes to `task-workflow.js` and `runGenerationStep`.

Route behavior:
- `POST /api/tasks/draft` returns `{ ok: true, run }`.
- `POST /api/runs/:runId/questions/:questionId/answer` returns `{ ok: true, run }`.
- `POST /api/runs/:runId/confirm` returns `{ ok: true, run }`.
- `POST /api/runs/:runId/generate-action` returns `{ ok: true, run, outputDir }`.

- [ ] **Step 5: Replace dashboard placeholder**

Build a static dashboard in `index.html` with these IDs for testability:

```html
<textarea id="prompt-input"></textarea>
<select id="backend-select"></select>
<button id="draft-button">Draft task</button>
<section id="task-preview"></section>
<section id="question-panel"></section>
<button id="confirm-button">Confirm task</button>
<button id="generate-button">Generate action</button>
<section id="qa-panel"></section>
<section id="trigger-panel"></section>
<pre id="run-logs"></pre>
```

The dashboard must never ask for or display API keys. It may display backend states and setup errors.

- [ ] **Step 6: Add dashboard HTML smoke assertions**

In tests, read `index.html` and assert:

```js
assert.match(html, /id="prompt-input"/)
assert.match(html, /id="task-preview"/)
assert.match(html, /id="trigger-panel"/)
assert.equal(html.includes('apiKey'), false)
assert.equal(html.includes('sk-'), false)
```

- [ ] **Step 7: Run final verification**

Run:

```bash
node --test tests/examples/creator-studio-plugin.test.js tests/examples/creator-studio-real-atlas-builder.test.js tests/services/image-generation-model-service.test.js tests/services/plugin-service.test.js
npm run check:syntax
```

Expected result: all pass.

- [ ] **Step 8: Commit**

```bash
git add examples/plugins/creator-studio tests/examples/creator-studio-plugin.test.js
git commit -m "feat(phase-3): add creator studio dashboard workflow"
```

## Host / Main UI Feature Request

These items are intentionally not plugin work. They should be assigned to the OpenPet main UI / host track.

### Model Settings

Add a Control Center model settings surface under AI or Service.

Required fields:
- Default backend: `fixture`, `cloud`, `local`.
- Cloud provider: provider id, display name, base URL, model id, masked API key state, optional organization/project.
- Local provider: endpoint URL, health URL, model id, timeout, max concurrent jobs.
- Health check action for cloud credential presence and local endpoint reachability.
- Safety copy explaining that credentials stay in OpenPet host secret storage.

Required security:
- Store secrets through `src/main/services/secret-service.js`.
- Renderer receives only `hasApiKey`, masked labels, and health status.
- Ordinary plugin code never receives raw API keys.
- Local endpoint URLs default to loopback-only.

### Host Model Bridge

If host-mediated generation is selected, expose command-scoped bridge routes:

- `GET /creator/model-settings`
- `POST /creator/model-health-check`
- `POST /creator/model-image-generate`

Required permission:

```text
model:image-generate
```

Generated files must be written under host-approved data directories. Large images should be returned as data references, not arbitrary filesystem paths.

### Trigger Rule System

The host owns trigger persistence and behavior. Creator Studio only proposes.

Required host capabilities:
- Trigger rule schema for `manual`, `click`, `random`, `state`, `event`, and `unbound`.
- Control Center UI to accept, edit, or reject plugin trigger proposals.
- Validation that trigger rules reference existing imported actions.
- Runtime application through host-owned services, not plugin writes.
- Clear audit trail showing source plugin, run ID, action ID, accepted trigger type, and timestamp.

## Backlog After This Milestone

- Model-assisted intent parsing through the future host model bridge.
- Reference image upload and current-pet visual reference extraction.
- Full-pet generation using the same `GenerationTask` contract.
- Partial regeneration for one bad action or frame range.
- Trigger simulation preview before applying trigger proposals.
- Prompt examples for common pets and actions.
- Packaged-app smoke for real dashboard interaction and native import picker paths.

## Review And Verification

At the end of each phase, run a production code quality review against:
- the phase diff;
- `examples/plugins/creator-studio`;
- `src/main/services/plugin-service.js` if command or permission behavior changed;
- `src/main/services/image-generation-model-service.js` if generation bridge behavior changed.

Review report format:

```text
严重问题：
中等问题：
非阻塞建议：
安全风险：
稳定性风险：
可维护性风险：
测试覆盖：
质量评分：
通过状态：通过 / 有条件通过 / 不通过
```

Blocking issues must be fixed before the phase commit. Non-blocking suggestions stay in backlog.

## Execution Stop Condition

Stop after Phase 3 when:
- task lifecycle works;
- fixture single-action generation writes reviewable QA;
- dashboard can run the draft-to-generate flow;
- targeted tests and syntax check pass;
- host/main UI requirements remain documented as a separate handoff.

Do not continue into host model settings, trigger persistence, reference uploads, or full-pet batch generation in the same milestone.
