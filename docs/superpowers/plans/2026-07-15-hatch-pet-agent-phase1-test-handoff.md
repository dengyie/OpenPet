# Hatch Pet Agent Phase 1 Independent Test Handoff

> Source branch: `codex/dev8`
> Testing branch: `codex/dev8-hatch-pet-phase1-test` in a new isolated worktree
> Required start: the final Phase 1 `codex/dev8` HEAD that already contains this handoff
> Development status: implemented but unverified

## Isolation And Starting State

Create a new Codex testing task, branch, and isolated worktree from the final `codex/dev8` HEAD containing this file. Do not branch from implementation commit `da919cfc` alone: the starting commit must also include the final documentation handoff commit.

Do not modify, switch, reset, rewrite, rebase, merge into, push, clean, or reuse `codex/dev8`. Do not touch the primary worktree or any other development/testing worktree. Keep all tests, fixtures, failure evidence, and testing commits on the new testing branch. If the new worktree starts detached, attach only that worktree to the dedicated testing branch.

Before changing anything, record:

```bash
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
git rev-parse HEAD
git log -10 --oneline
git merge-base --is-ancestor da919cfcc57a8e55f48fc4b49b4113ca19b47614 HEAD
git worktree list --porcelain
test -f docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase1-test-handoff.md
```

Continue only when the branch is `codex/dev8-hatch-pet-phase1-test`, the worktree is clean and isolated, the ancestor check succeeds, and `HEAD` contains this handoff. Record that starting SHA as the final Phase 1 HEAD in the test report.

## Phase 1 Truth Boundary

Independently verify these claims without relying on the development conversation:

- the feature defaults to disabled and public/runtime execution is fixed to `shadow`;
- disabled mode performs no hatch-pet model call and creates no agent run artifacts;
- enabled mode requests one structured text decision, records only a suggestion, and never executes it;
- shadow success or failure is additive and never blocks or changes the fixed Creator Studio result;
- Provider selection, image prompts, retries, QA, approval, import, activation, and command payloads are unchanged;
- follow-chat inherits only saved chat Provider, endpoint, model, and secret reference; hatch-pet never reads or writes ordinary chat conversations, memory, behavior state, or the ordinary chat system prompt;
- dedicated mode uses the fixed `ai.hatch-pet` secret reference, while all secret values remain host-owned;
- the same resolved hatch-pet model is the future planning/evaluation model, but Phase 1 performs stateless text planning only: no images, evaluator call, visual verdict, or bounded execution;
- budgets and `requireIdentityReviewBeforeActions` are normalized, persisted, displayed, and snapshotted, but do not govern the fixed Phase 1 generation workflow;
- durable agent artifacts stay inside the Creator Studio data directory and public IPC/renderer/log surfaces expose neither secrets nor absolute host paths.

The expected result remains **implemented but unverified** until this assignment passes. This task cannot create Provider approval, human visual acceptance, or a `production-art-ready` claim.

## Focused Automated Test Work

Add focused Node-native tests, TypeScript fixtures, and Control Center coverage as needed. Prefer new files such as `tests/services/hatch-pet-agent-contracts.test.js`, `tests/services/hatch-pet-agent-store.test.js`, and `tests/services/hatch-pet-agent-service.test.js`, while extending existing suites where the interface already belongs.

### Contracts and settings

Cover exact defaults, disabled/shadow/follow-chat behavior, budget clamps, nullable cost, fixed API-key reference, base-URL credential/query/fragment sanitization, public config, follow-chat versus dedicated resolution, legal decisions, strict unknown-field rejection, bounded strings/arrays, action/reason patterns, and confidence clamping.

Verify `AiService` persists normalized `ai.hatchPet` settings through every settings update path without losing model catalogs, vision settings, ordinary conversations, memory, or behavior state. Saving/clearing the dedicated secret must use `ai.hatch-pet`; no secret value may enter settings or a public view.

### Structured tool completion and repair

Test the forced single-function request body, named-tool selection, timeout clamp, bounded return metadata, safe logging, Provider-error sanitization, and the absence of conversation persistence. Cover these three invalid model-output classes separately:

1. the required `hatch_pet_decision` call is missing or only a differently named tool is returned;
2. tool arguments are malformed JSON or parse to a non-object;
3. arguments parse but fail the hatch-pet contract, such as an unknown field, illegal decision, invalid identifier, or over-limit value.

For each class, verify exactly one schema-repair call is allowed. A valid repair records one shadow decision. A second invalid response must stop with `invalid_model_decision`, record a fail-closed shadow status when possible, make no third call, and leave Creator Studio running normally.

### Store confinement and redaction

Verify run/prompt ID validation, traversal and absolute-path rejection, `runs/<runId>/agent/` confinement, atomic JSON snapshots, compact JSONL append/read, prompt relative paths, bounded summaries/arrays/depth, and invalid JSONL failure behavior.

Exercise nested redaction for API keys, secret/credential/token fields, authorization/headers, raw Provider responses, hidden reasoning, credentialed or query-bearing base URLs, and absolute host paths. Assert that safe relative artifact paths, hashes, schema versions, Provider/model/config source, budget values, timestamps, result codes, and bounded public summaries survive.

### Shadow service and creator workflow

Use scripted fake structured completions and temporary Creator Studio data directories. Cover disabled no-work behavior, follow-chat and dedicated resolution, capability success/failure, full-pet and single-action legal decision snapshots, text bounds, empty image-model candidates, prompt hashes, durable success/status reads, missing-secret failure, invalid-output failure, store failure, and sanitized diagnostics.

Assert that ordinary chat conversation APIs and stores are never touched. Inspect request messages to confirm there are no image attachments, chat history, memory, behavior data, raw Provider payloads, or secret values.

In `creator-workflow-service` tests, prove the shadow call occurs only after `draft-task` returns a non-empty run ID; no shadow decision or model text enters `confirm-task`, `run-step`, retry, approval, import, activation, or trigger-proposal payloads. Compare enabled, disabled, thrown/failing, and successful-shadow runs to show the fixed result and command order are unchanged except for additive bounded diagnostics.

### Runtime, IPC, contracts, and Control Center

Update runtime/bootstrap factory fixtures so `createHatchPetAgentService` is constructed after its dependencies, injected into Creator Workflow and AI IPC, and represented in lifecycle/bootstrap tests without using a real Provider. Cover both the production factory map in `main.js` and test factory stubs in `tests/main/bootstrap-openpet-runtime.test.js` and related runtime fixtures.

Verify the six JS/TS IPC channel constants, `registerAiIpc` delegation, top-level IPC dependency wiring, preload methods, and `ControlCenterApi` TypeScript contracts. Public config/status views must exclude secret values, raw model output, and absolute paths.

Cover `useAiPane`, `AiPane`, `CreatorPane`, and `demo-control-center-api` for:

- disabled/shadow/follow-chat defaults;
- follow-chat and dedicated drafts, save behavior, dirty-state/capability gating, secret save/clear, and effective config display;
- budget normalization and identity-checkpoint editing;
- read-only Shadow presentation and copy that says suggestions do not alter generation;
- runtime/public diagnostics may include a bounded code; `CreatorPane` shows only mode, status, decision, and decision ID, with no raw output, message, or path;
- deterministic demo capability supported/unsupported paths and demo run status/diagnostics;
- no renderer secret or raw model-output exposure.

Known Minor to characterize and report before any production-code change: when the saved mode is `follow-chat`, switching an unsaved draft to `Dedicated model` temporarily sets draft `hasApiKey` to false. Even if an older dedicated secret exists, the UI therefore shows “专用密钥未保存” and disables Clear until the override config is saved, after which the correct dedicated-key state returns. Do not silently fix or reinterpret this behavior on the testing branch; first preserve evidence and report its user impact and recommended disposition.

## Required Verification Commands

Run focused suites first. At minimum include:

```bash
node --test \
  tests/services/hatch-pet-agent-contracts.test.js \
  tests/services/hatch-pet-agent-store.test.js \
  tests/services/hatch-pet-agent-service.test.js \
  tests/services/ai-service.test.js \
  tests/services/creator-workflow-service.test.js \
  tests/main/bootstrap-openpet-runtime.test.js \
  tests/main/bootstrap-runtime-lifecycle.test.js \
  tests/main/ipc-registration-groups.test.js \
  tests/shared/ipc-channels.test.js \
  tests/control-center/demo-control-center-api.test.js
```

If a suggested new file is named differently, report the replacement. Also run any focused preload, contract type-fixture, `useAiPane`, `AiPane`, `CreatorPane`, and Control Center specs added by the testing task.

Then run and record the exact command, exit status, and relevant failure output for all four required repository checks:

```bash
npm run check:syntax
npm run test:core
npm run test:core:all
npm run test:control-center
```

`npm run test:control-center` is automated UI regression coverage only. Do not turn it into a visual-quality or production-art claim.

## Prohibited Verification And Claim Work

Do not call a real chat, vision, or image Provider. Do not run Provider smoke, image generation, image evaluation, human visual acceptance, profile calibration, approval-registry mutation, import/activation rehearsal, or production-art review. Use scripted fakes and existing deterministic demo paths only. Never commit credentials, authorization material, raw Provider responses, unsafe host paths, fabricated human labels, Provider approvals, or screenshots presented as visual acceptance.

Do not weaken schemas, confinement, redaction, QA, approval, import, activation, secret ownership, or fixed-workflow behavior to make tests pass. Preserve failing evidence and report any production defect before changing production code; this is mandatory for the known follow-chat-to-dedicated draft-key Minor above.

## Result And Branch Rules

Keep testing work in focused commits on `codex/dev8-hatch-pet-phase1-test`. Do not merge, rebase, push, or rewrite the Phase 1 development commits unless the user explicitly requests it.

The final report must include:

- testing branch/worktree, final Phase 1 starting SHA, clean-start evidence, and ancestor result;
- every test or fixture file added/changed and every testing-branch commit;
- results for contracts, settings persistence, all three invalid-output classes, exactly-one repair, store confinement/redaction, disabled no-work, shadow non-blocking behavior, runtime/bootstrap factories, IPC/preload/contracts, `useAiPane`, `AiPane`, `CreatorPane`, and demo behavior;
- explicit evidence that no ordinary chat conversation was read/written and no shadow decision changed Creator Studio execution;
- exact results of focused tests and all four required repository commands;
- the known Minor evidence and disposition, without an unapproved production fix;
- every unresolved defect and a final pass/fail decision.

Until all required automated checks pass and the report closes every Phase 1 contract, continue to describe `codex/dev8` as **implemented but unverified**. Regardless of automated success, this Phase 1 task remains text-only shadow verification and cannot justify Provider approval or `production-art-ready`.
