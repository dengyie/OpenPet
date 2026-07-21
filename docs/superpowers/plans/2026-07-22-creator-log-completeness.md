# Creator Log Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Creator Provider failures traceable to a run/action and keep critical evidence available after log pressure or partial writes.

**Architecture:** Keep correlation ownership in Creator Studio and the host bridge, transport only bounded trace metadata through the existing image-generation bridge, and persist returned Provider request ids in existing generation evidence. Keep app-log retention and run-journal parsing local to their stores.

**Tech Stack:** Node.js CommonJS services, JSONL/JSON persistence, Node native test runner.

## Global Constraints

- Never log prompt text, credentials, absolute paths, URLs, or image bytes.
- Preserve existing Provider request and run-state behavior.
- Keep `runId`, `actionId`, `stage`, `candidateId`, and `requestId` bounded and sanitized.
- Do not expose app logs through a new renderer API in this task.

### Task 1: Harden app-log retention and compaction

**Files:**
- Modify: `src/main/services/app-log-service.js`
- Test: `tests/services/app-log-service.test.js`

- [ ] Add failing tests for critical non-debug retention and compaction failure safety.
- [ ] Implement priority-aware compaction that retains non-debug entries before debug entries.
- [ ] Implement temporary-file atomic compaction and cleanup.
- [ ] Run app-log tests and confirm they pass.

### Task 2: Propagate Provider trace context and request ids

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Modify: `src/main/services/image-generation-model-service.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `examples/plugins/creator-studio/lib/full-pet-action-checkpoints.js`
- Test: `tests/services/image-generation-model-service.test.js`
- Test: `tests/services/plugin-service.test.js`
- Test: `tests/examples/creator-studio-host-model-bridge-quality-first.test.js`

- [ ] Add failing tests proving bounded trace context reaches image-service logs and request results.
- [ ] Pass trace context through the Creator bridge without allowing Provider owner overrides.
- [ ] Add trace context to Provider started/retry/completed/failed events.
- [ ] Persist `requestId` and trace fields in generation attempt/stage/checkpoint records.
- [ ] Run focused bridge and image tests.

### Task 3: Complete and harden Creator run journals

**Files:**
- Modify: `examples/plugins/creator-studio/lib/run-store.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Modify: `examples/plugins/creator-studio/lib/quality-first-full-pet-orchestrator.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Test: `tests/examples/creator-studio-run-store.test.js`
- Test: `tests/examples/creator-studio-quality-first-full-pet-orchestrator.test.js`

- [ ] Add failing tests for malformed journal lines and explicit action failure events.
- [ ] Make run journal parsing tolerant while reporting a bounded corruption event.
- [ ] Append identity and per-action started/completed/failed events around quality-first work.
- [ ] Run focused run-store and orchestrator tests.

### Task 4: Full verification and integration

- [ ] Run `npm run check:syntax`.
- [ ] Run focused logging, Creator, and Provider tests.
- [ ] Run `npm run test:core` and `npm run test:control-center`.
- [ ] Review `git diff --check`, commit the implementation, and rebase onto local `main`.
- [ ] Fast-forward merge `codex/dev8` into `/Users/mango/project/codex/OpenPet`.
- [ ] Re-run syntax, core, and Control Center verification on merged `main`.
