# Canonical Diversity Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve canonical-pool success without weakening quality gates, and make every failed paid identity candidate visible and retryable in Create.

**Architecture:** Keep candidate generation and duplicate detection in the Host bridge, carry a bounded public failed-pool snapshot through the orchestrator error into durable run state, and derive renderer diagnostics from that run state. The fourth dispatch becomes a code-owned duplicate replacement strategy; Creator diagnostics distinguish progress text from terminal failure text.

**Tech Stack:** Node.js CommonJS services and plugin runtime, Electron IPC contracts, React/TypeScript Control Center, Node native test runner, Playwright regression suite.

## Global Constraints

- Require three distinct eligible canonical candidates.
- Limit canonical generation to four paid dispatches.
- Do not lower duplicate or identity quality thresholds.
- Preserve every paid output using safe run-relative paths and hashes.
- Never expose absolute paths, data URLs, Provider response bodies, prompts, or credentials in public failed-pool diagnostics.
- Do not auto-approve, import, activate, or inspect generated images in this development task.

---

### Task 1: Identity-safe duplicate replacement strategy

**Files:**
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Test: `tests/examples/creator-studio-host-model-bridge-quality-first.test.js`

**Interfaces:**
- Consumes: `generateCanonicalCandidatePool({ generateCandidate, persistCandidate, maxDispatches })`.
- Produces: generation callback inputs `{ candidateId, dispatchIndex, attemptKind, diversityProfileId }`, where dispatch four is `duplicate-replacement` plus `identity-safe-alternate-neutral-v1`.

- [ ] **Step 1: Write failing pool-strategy tests**

Add a test that returns duplicate outputs for the first two calls and captures callback input. Assert calls one through three are `initial`, call four is `duplicate-replacement`, and its strategy is not the first strategy.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="canonical pool assigns" tests/examples/creator-studio-host-model-bridge-quality-first.test.js
```

Expected: FAIL because `attemptKind` is absent and dispatch four repeats `identity-faithful-balanced-v1`.

- [ ] **Step 3: Implement registered replacement strategy**

Add `identity-safe-alternate-neutral-v1` as the fourth registered profile. Compute `attemptKind` from dispatch index and pass it to `generateCandidate`. Compile the new strategy to a Provider-neutral requested change that preserves identity while asking for small source-compatible limb separation, a subtle natural head angle, and a calm neutral silhouette; explicitly forbid action gestures and identity/view/style redesign.

- [ ] **Step 4: Run host bridge focused tests**

Run:

```bash
node --test tests/examples/creator-studio-host-model-bridge-quality-first.test.js tests/examples/creator-studio-provider-image-prompt-compiler.test.js
```

Expected: PASS.

---

### Task 2: Preserve a failed canonical pool in durable run state

**Files:**
- Modify: `examples/plugins/creator-studio/lib/quality-first-full-pet-orchestrator.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Test: `tests/examples/creator-studio-quality-first-full-pet-orchestrator.test.js`
- Test: `tests/examples/creator-studio-backend-runner-quality-first.test.js`

**Interfaces:**
- Produces on failure: `error.canonicalPool = { dispatchCount, distinctEligibleCount, requiredDistinctCount, candidates }`.
- Persists: `run.qualityFirst.phase = 'identity-generation-failed'`, `nextAction = 'retry-identity'`, stable failure code, and safe candidate views.

- [ ] **Step 1: Write failing orchestrator and backend tests**

Assert an insufficient pool still rejects, but the error carries all retained candidates, duplicate binding, safe paths, achieved count, and required count. Assert backend failure persistence keeps these fields in `run.json` and removes the generation lease.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test --test-name-pattern="failed canonical pool|identity stage preserves" tests/examples/creator-studio-quality-first-full-pet-orchestrator.test.js tests/examples/creator-studio-backend-runner-quality-first.test.js
```

Expected: FAIL because the thrown error has no pool and backend writes only status/error/backendStatus.

- [ ] **Step 3: Add a bounded public candidate mapper and attach the pool**

Reuse one candidate mapper for successful and failed pools. Include candidate ID, eligibility, hash, score, model, run-relative paths, failure codes, attempt kind, strategy ID, duplicate binding, and bounded evaluation metadata. Attach only this mapped pool to the insufficient-diversity error.

- [ ] **Step 4: Persist the failure phase**

In `runQualityFirstIdentityStage` catch handling, merge the bounded pool into `qualityFirst` only for `canonical_candidate_diversity_insufficient`. Preserve the existing terminal `failed` status, error code, backend failure, logs, and evidence. Other exceptions keep existing behavior.

- [ ] **Step 5: Run the orchestrator/backend suites**

Run:

```bash
node --test tests/examples/creator-studio-quality-first-full-pet-orchestrator.test.js tests/examples/creator-studio-backend-runner-quality-first.test.js
```

Expected: PASS.

---

### Task 3: Status-aware diagnostics and failed identity review UI

**Files:**
- Modify: `src/main/services/creator-workflow-service.js`
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/control-center/src/panes/CreatorPane.tsx`
- Test: `tests/services/creator-workflow-service.test.js`
- Test: `tests/control-center/creator-pane-copy.test.js`
- Test: `tests/control-center/creator-pane-quality-review.test.js`

**Interfaces:**
- Extends `CreatorCanonicalCandidateViewState` with optional `attemptKind`, `strategyId`, and `duplicateOfCandidateId`.
- Uses phase `identity-generation-failed` and `identityReview.status = 'failed'`.

- [ ] **Step 1: Write failing diagnostic tests**

Create a generating run whose backend message is `Generating canonical identity candidates`; assert `failureReason === ''`. Create a failed diversity run with a durable pool; assert the backend error is the failure reason, candidate paths remain run-relative, duplicate metadata is public, and no absolute path/data URL/prompt text appears.

- [ ] **Step 2: Write failing UI source-contract tests**

Assert Create renders the failed identity phase, distinct-count guidance, duplicate reason, retained candidate cards, and retry button; acceptance must be disabled outside `awaiting_identity_review`.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
node --test --test-name-pattern="running backend message|failed identity pool|failed identity assets" tests/services/creator-workflow-service.test.js tests/control-center/creator-pane-copy.test.js tests/control-center/creator-pane-quality-review.test.js
```

Expected: FAIL because running backend messages currently become failure reasons and the failed phase has no review panel.

- [ ] **Step 4: Implement status-aware failure derivation**

Use generated-image failure and `run.error` unconditionally, but use `backendStatus.message` only when `run.status === 'failed'` or `backendStatus.state === 'failed'`. Map the stable diversity code to a human-readable summary containing achieved/required counts while retaining the raw failure code in the quality-first view.

- [ ] **Step 5: Implement failed identity diagnostics and UI**

Expose safe optional candidate metadata, return `identityReview.status='failed'`, label the phase `身份候选生成失败`, render all candidates, disable acceptance unless the phase is `awaiting_identity_review`, and render `重新生成身份候选` for the failed phase.

- [ ] **Step 6: Run focused service/UI tests**

Run:

```bash
node --test tests/services/creator-workflow-service.test.js tests/control-center/creator-pane-copy.test.js tests/control-center/creator-pane-quality-review.test.js
```

Expected: PASS.

---

### Task 4: Documentation, verification, and integration

**Files:**
- Modify: `docs/pet-character-generation.md`
- Modify: `docs/superpowers/specs/2026-07-24-canonical-diversity-recovery-design.md`

- [ ] **Step 1: Update the current generation contract**

Document the fourth duplicate-replacement strategy, terminal failed-pool asset retention, Create retry guidance, and the unchanged three-candidate/four-dispatch gates. Mark the design status implemented only after verification.

- [ ] **Step 2: Run formatting and focused verification**

Run:

```bash
git diff --check
npm run check:syntax
```

Expected: exit 0.

- [ ] **Step 3: Run repository regressions**

Run:

```bash
npm run test:core
npm run test:core:all
```

Expected: Node core has zero failures and Control Center has zero failures.

- [ ] **Step 4: Review and commit implementation**

Review the full diff for threshold weakening, unsafe path exposure, stale state, unbounded dispatch, and duplicated compatibility logic. Commit production code, tests, and docs on `codex/dev8`.

- [ ] **Step 5: Integrate into main**

Confirm both worktrees are clean, rebase `codex/dev8` onto current local `main`, fast-forward `main`, and rerun `npm run check:syntax` plus `npm run test:core:all` from the main worktree. Preserve the branch-bound Codex worktree and do not push unless explicitly requested.
