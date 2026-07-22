# Creator Hatch-pet Readiness Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent Creator generation from creating a confirmed run when the Hatch-pet planner/evaluator is disabled or unavailable, while allowing generation to start immediately once its configured structured-tool capability is ready.

**Architecture:** Main owns a non-mutating static readiness snapshot and a bounded capability probe. Creator workflow performs the static check and capability probe before `draft-task`; the renderer consumes the same readiness view to disable Create with an actionable reason. The existing quality-first pipeline remains unchanged after the gate.

**Tech Stack:** Electron main services, Node native test runner, React/TypeScript Control Center.

## Global Constraints

- Never create a Creator run or call `confirm-task` when Hatch-pet readiness is blocked.
- Preserve the user's explicit `hatchPet.enabled` choice; do not auto-enable or silently change provider settings.
- Follow-chat mode uses the saved chat Provider/key; dedicated mode uses the saved Hatch-pet key.
- Do not call real Providers or generate images in automated verification.

### Task 1: Hatch-pet readiness contract

**Files:**
- Modify: `src/main/services/hatch-pet-agent-service.js`
- Test: `tests/services/hatch-pet-agent-service.test.js`

- [x] Add `getGenerationReadiness()` returning only safe fields: `ok`, `code`, `message`, `enabled`, `configSource`, `provider`, and `model`. Return `hatch_pet_disabled` before secret access when disabled, and `hatch_pet_api_key_missing` when the effective key is absent.
- [x] Add a bounded `checkGenerationCapability()` wrapper that returns the static readiness failure unchanged and otherwise delegates to `checkCapability()` with the existing structured-tool timeout.
- [x] Add tests for disabled, missing-key, and enabled follow-chat readiness.

### Task 2: Creator workflow preflight

**Files:**
- Modify: `src/main/services/creator-workflow-service.js`
- Test: `tests/services/creator-workflow-service.test.js`

- [x] Require a usable `hatchPetAgentService` at full-pet execution time and read its readiness before any `draft-task` command.
- [x] On static failure, record `creator.workflow.blocked` with `hatchPetAgent` code and return `state: 'hatch-pet-not-ready'`; do not create a run.
- [x] Run the capability probe before `draft-task`; on failure return the same blocked state with the sanitized capability code/message and no run.
- [x] Add tests proving disabled and failed capability preflight make zero plugin command calls, while a successful probe preserves the existing `draft-task -> confirm-task -> run-step` sequence. Prove single-action generation remains independent.

### Task 3: Control Center feedback

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/control-center/src/hooks/useCreatorPane.ts`
- Modify: `src/control-center/src/panes/CreatorPane.tsx`
- Test: `tests/control-center/creator-pane-copy.test.js`

- [x] Add the bounded Hatch-pet readiness view to Creator state/result contracts.
- [x] Disable Generate Character when static readiness is blocked and render the exact reason plus the AI settings destination.
- [x] Render capability-probe failure as a preflight failure, not as “人工复查”.
- [x] Add source-contract tests for disabled and capability-failure feedback.

### Task 4: Verification and documentation

**Files:**
- Modify: `src/control-center/src/panes/AiPane.tsx`
- Modify: `docs/pet-character-generation.md`

- [x] Replace the stale “Shadow only / does not alter generation” copy with the production planner/evaluator readiness explanation.
- [x] Document the required preflight gate and the no-run-on-blocked invariant.
- [x] Run focused tests, `npm run check:syntax`, and `npm run test:core:all`.
- [ ] Commit the implementation as one focused change.
