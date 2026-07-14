# Task 4 Static Review Report

## Scope

- Worktree: `/Users/mango/.codex/worktrees/ff3f/OpenPet`
- Branch: `codex/dev8`
- Task file: `src/main/services/hatch-pet-agent-service.js`
- Reviewed interfaces: `hatch-pet-agent-contracts.js`, `hatch-pet-agent-store.js`, `ai-service.js`, `secret-service.js`, `settings-service.js`, and `plugin-service.js`
- No other worktree or planned task file was modified.

## Changes

- Added the Phase 1 hatch-pet shadow planner service with bounded configuration, secret management, capability probing, snapshot construction, structured planner calls, one schema-repair attempt, durable shadow decision/status records, and bounded run-status reads.
- Preserved the required `hatch_pet_decision` schema and system prompt, text-only Phase 1 snapshots, stage-dependent legal decisions, empty model candidates, sanitized workflow evidence, and fail-open continuation of the fixed Creator Studio workflow.
- Fixed effective-secret enforcement so an enabled planner verifies the resolved follow-chat/override API-key reference before initializing a run or calling the model.
- Fixed repeated invalid model output handling so the second schema-invalid response is durably classified as `invalid_model_decision`, while the public result remains the required non-throwing `hatch_pet_shadow_failed` response.
- Added the failure classification to persisted run state and sanitized diagnostics without exposing secret values.

## Static Verification

- Confirmed the protected primary worktree remained separate and the active development worktree stayed on `codex/dev8`.
- Inspected the complete focused Task 4 diff against `/dev/null` before staging.
- Inspected the complete staged diff for `src/main/services/hatch-pet-agent-service.js` before commit.
- `git diff --check`: exit 0 before staging.
- `git diff --cached --check`: exit 0 after staging.
- Post-commit `git diff --check`: exit 0.
- Post-commit `git status --short --branch`: clean task worktree, `codex/dev8` ahead of `origin/codex/dev8` by 31 commits.
- Per the development-branch restriction, no tests, builds, syntax checks, Provider calls, browser checks, image generation, or visual acceptance were run.

## Commit

- Commit: `96254097c886194bde501b12fd62ad3ac5dfd314`
- Message: `feat add hatch pet shadow planner`
- Files committed: `src/main/services/hatch-pet-agent-service.js`

## Concerns

- No blocking static-review concern remains in Task 4.
- Runtime and integration behavior remains intentionally unexecuted on this development branch and must be verified by the designated isolated verification task.
- Phase 1 publishes an empty `modelCandidates` list and records shadow decisions only; later bounded-execution phases must retain host-side arbitrary-model rejection when candidates become non-empty.

## Important Review Fix

### Changes

- Unified invalid model-output handling across contract validation failures, a missing required `hatch_pet_decision` tool call, and invalid JSON or non-object tool arguments from `AiService`.
- Limited schema repair to the first occurrence of those model-output failures, reused the identical bounded snapshot and resolved completion config for the one repair attempt, and persisted any repeated model-output failure as `invalid_model_decision`.
- Kept network, timeout, provider HTTP, unsupported-provider, missing-secret, and other configuration failures outside the schema-repair path.
- Forced all stored and renderer-supplied hatch-pet override secret references to the dedicated `ai.hatch-pet` ref, including defensive normalization of historically polluted settings.
- Made `saveApiKey` and `clearApiKey` operate only on `ai.hatch-pet`; follow-chat continues to resolve and consume the chat endpoint and chat API-key ref together from one settings snapshot.

### Static Verification

- Re-read the Task 4 brief/report and the complete focused implementations in `hatch-pet-agent-service.js`, `ai-service.js`, and `hatch-pet-agent-contracts.js`.
- Inspected the focused service diff and confirmed the repair classifier matches only the three required model-output failure forms.
- Confirmed the same resolved completion config is passed to the initial decision request and the single repair request.
- Confirmed override reads, saves, resolution, and secret save/clear paths cannot consume a renderer-provided or historically polluted hatch-pet API-key ref.
- `git diff --check`: exit 0 before staging.
- Inspected the complete staged diff and ran `git diff --cached --check`: exit 0 before commit.
- Per the task restriction, no tests, builds, syntax checks, Provider calls, browser checks, or image operations were run.

### Commit

- Message: `fix harden hatch pet shadow planner`
- Files committed: `src/main/services/hatch-pet-agent-service.js`, `.superpowers/sdd/task-4-report.md`

### Remaining Concerns

- Runtime behavior remains intentionally unexecuted in this task and is deferred to the designated isolated verification work.
