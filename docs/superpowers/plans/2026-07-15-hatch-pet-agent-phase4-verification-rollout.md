# Hatch-Pet Agent Phase 4 Independent Verification And Rollout Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for fresh bounded test/review tasks and superpowers:verification-before-completion before every pass claim. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Independently verify the complete model-driven hatch-pet implementation, close real Provider/repair/human-review evidence, and decide whether the feature may remain opt-in or become default-eligible.

**Architecture:** Create a new isolated testing branch from the final Phase 3 development HEAD. Run deterministic tests through the controller, but delegate every image-generating operation and every visual inspection to different fresh one-shot subagents with no inherited history. Preserve structured evidence and keep all readiness claims fail-closed.

**Tech Stack:** Node native test runner, Playwright, Electron/Control Center, real OpenAI-compatible Provider path, Creator Studio, JSON release evidence, one-shot Codex subagents.

## Global Constraints

- Never run this plan on `codex/dev8` or another development branch.
- Create a new isolated branch named `codex/dev8-hatch-pet-agent-test` from the final Phase 3 HEAD.
- Do not reset, rewrite, switch, clean, push, merge, or modify the development branch, primary worktree, prior Provider test branches, or unrelated worktrees.
- Record the exact implementation HEAD at test start and verify it remains an ancestor throughout testing.
- Automated test fixes and evidence commits belong only to the testing branch.
- The test controller must not generate, open, render, display, decode, screenshot, compare, or judge image content.
- Every real Provider operation that generates images uses a fresh subagent with `fork_turns="none"`.
- Every visual evaluation uses a different fresh subagent with `fork_turns="none"`.
- Never send follow-up work to or reuse an image subagent. Retry, repair, second opinion, and newly discovered image issues each require a new subagent identity.
- Image subagents write structured reports to files and return only status plus safe paths; the controller reads text/JSON/logs/hashes/metrics only.
- Do not lower QA thresholds, disable budgets, select the first ambiguous Provider output, fabricate labels, calibrate from synthetic judgments, or write Provider approval before legitimate human acceptance.
- Do not claim `production-art-ready` until every requirement in this plan passes.

---

### Task 1: Create And Verify The Isolated Testing Worktree

**Files:**
- Create on testing branch: `docs/release-evidence/hatch-pet-agent/2026-07-15-test-start.json`

**Interfaces:**
- Produces: immutable starting-state evidence and fixed implementation ancestor.

- [ ] **Step 1: Capture the final implementation commit**

From the clean development worktree:

```bash
IMPLEMENTATION_HEAD=$(git rev-parse HEAD)
git status --short --branch
git branch codex/dev8-hatch-pet-agent-test "$IMPLEMENTATION_HEAD"
```

Do not move an existing branch. If the branch already exists, stop and inspect ownership rather than resetting it.

- [ ] **Step 2: Create a Codex worktree task from the branch**

Use the Codex project thread tool with worktree starting state `codex/dev8-hatch-pet-agent-test`. If the new worktree is detached, switch only that new worktree to the pre-created branch.

- [ ] **Step 3: Report the full preflight**

```bash
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
git rev-parse HEAD
git merge-base --is-ancestor "$IMPLEMENTATION_HEAD" HEAD
git worktree list --porcelain
```

Continue only when the branch is correct, the ancestor check exits zero, and the worktree is clean.

- [ ] **Step 4: Write test-start evidence**

Record branch, exact implementation HEAD, test worktree basename, current date/time, feature configuration defaults, and the statement that no Provider or visual claim exists at start. Do not record absolute paths or secrets.

- [ ] **Step 5: Commit Task 1**

```bash
git add docs/release-evidence/hatch-pet-agent/2026-07-15-test-start.json
git commit -m "test record hatch pet agent start"
```

---

### Task 2: Add Contract, Configuration, Store, And AI Completion Tests

**Files:**
- Create: `tests/services/hatch-pet-agent-contracts.test.js`
- Create: `tests/services/hatch-pet-agent-store.test.js`
- Create: `tests/services/hatch-pet-agent-service.test.js`
- Modify: `tests/services/ai-service.test.js`
- Modify: `tests/services/settings-service.test.js`

**Interfaces:**
- Verifies Phase 1 contracts before executable workflow tests.

- [ ] **Step 1: Test exact defaults and bounds**

Assert disabled/shadow/follow-chat defaults, one identity regeneration, three action attempts, two evaluation attempts, 64 Provider calls, 3600000 ms, nullable cost cap, and all clamp bounds.

- [ ] **Step 2: Test decision validation**

Cover legal decisions, state-specific rejection, unknown keys, unsafe action IDs, oversized requested changes, unknown reason codes, confidence bounds, unavailable image models, approval/import attempts, and budget-changing output.

- [ ] **Step 3: Test chat fallback isolation**

Assert follow-chat copies only Provider/Base URL/model/API-key reference, never conversations, memory, behavior, chat system prompt, or vision history.

- [ ] **Step 4: Test structured tool completion**

Use a fake fetch response containing exactly one requested tool call. Cover missing tool, malformed JSON, wrong tool name, timeout, Provider error, dedicated override config, no conversation writes, safe logs, one multimodal image limit, unsupported data URL, and encoded-size rejection.

- [ ] **Step 5: Test store confinement and recovery**

Cover unsafe run IDs, path escape, atomic snapshots, JSONL append, bounded summaries, secret/absolute-path stripping, idempotency, corrupt file behavior, and restart reads.

- [ ] **Step 6: Run focused tests**

```bash
node --test \
  tests/services/hatch-pet-agent-contracts.test.js \
  tests/services/hatch-pet-agent-store.test.js \
  tests/services/hatch-pet-agent-service.test.js \
  tests/services/ai-service.test.js \
  tests/services/settings-service.test.js
```

Expected: all pass. Record exact counts.

- [ ] **Step 7: Commit Task 2**

```bash
git add tests/services/hatch-pet-agent-contracts.test.js tests/services/hatch-pet-agent-store.test.js tests/services/hatch-pet-agent-service.test.js tests/services/ai-service.test.js tests/services/settings-service.test.js
git commit -m "test cover hatch pet agent foundation"
```

---

### Task 3: Verify Timeout Alignment, Lease Recovery, Strategies, Candidates, And Evaluation

**Files:**
- Create: `tests/examples/creator-studio-generation-lease.test.js`
- Create: `tests/services/hatch-pet-agent-strategies.test.js`
- Create: `tests/services/hatch-pet-agent-model-candidates.test.js`
- Create: `tests/services/hatch-pet-agent-review-board.test.js`
- Create: `tests/services/hatch-pet-agent-evaluation.test.js`
- Modify: `tests/plugins/manifest.test.js`

**Interfaces:**
- Verifies Provider reliability P0 and Phase 2 quality boundary.

- [ ] **Step 1: Assert command budget consistency**

Read `plugin.json` and exported/full-pet workflow constant evidence. Assert `run-step`, `retry-action`, and `retry-identity` use `5700000`, are non-zero, and exceed 90 minutes by exactly 300000 ms.

- [ ] **Step 2: Test generation leases**

With a fake clock:

- active heartbeat under 120000 ms remains generating;
- missing lease on generating run recovers to failed;
- stale heartbeat recovers to failed with `generation-command-terminated`;
- completed checkpoints and evidence hashes remain unchanged;
- matching lease cleanup works;
- mismatched lease ID cannot clear a newer lease;
- generation/action repair/identity repair all create and refresh leases.

- [ ] **Step 3: Test strategy registry and fixed prompt ownership**

Cover every exact strategy ID, scope mismatch, unknown ID, requested-change bounds/sanitization, and prompt composition order. Assert agent guidance cannot remove fixed output, identity, action, negative, or quality-profile contracts.

- [ ] **Step 4: Test candidate filtering and switching**

Cover healthy/verified/image-capable candidates, disabled policy, unknown model, wrong Provider, more than 20 candidates, stable sort, same-model switch rejection, and model metadata redaction.

- [ ] **Step 5: Test review boards without human judgment**

Use deterministic fixture images and inspect only dimensions, file existence, safe paths, panel metadata, fixed labels, maximum sizes, and one-image output contract. Do not make artistic claims from fixtures.

- [ ] **Step 6: Test evaluation schema and combined gate**

Cover pass with no blocking defects, repair requirements, reject, cannot-evaluate retry, score bounds, defect limits, unknown reason codes, model pass/code fail, code pass/model reject, and no approval/import mutations.

- [ ] **Step 7: Run focused tests and commit**

```bash
node --test \
  tests/examples/creator-studio-generation-lease.test.js \
  tests/services/hatch-pet-agent-strategies.test.js \
  tests/services/hatch-pet-agent-model-candidates.test.js \
  tests/services/hatch-pet-agent-review-board.test.js \
  tests/services/hatch-pet-agent-evaluation.test.js \
  tests/plugins/manifest.test.js
```

```bash
git add tests/examples/creator-studio-generation-lease.test.js tests/services/hatch-pet-agent-strategies.test.js tests/services/hatch-pet-agent-model-candidates.test.js tests/services/hatch-pet-agent-review-board.test.js tests/services/hatch-pet-agent-evaluation.test.js tests/plugins/manifest.test.js
git commit -m "test cover hatch pet execution gates"
```

---

### Task 4: Verify Identity, Single-Action, Full-Pet, Budgets, And Recovery

**Files:**
- Modify: `tests/services/creator-workflow-service.test.js`
- Modify: `tests/examples/creator-studio-host-model-bridge.test.js`
- Create: `tests/examples/creator-studio-backend-runner-agent.test.js`
- Create: `tests/services/hatch-pet-agent-full-pet.test.js`
- Create: `tests/services/hatch-pet-agent-budget-ledger.test.js`
- Create: `tests/services/hatch-pet-agent-provenance.test.js`

**Interfaces:**
- Verifies scripted agent execution without real Provider images.

- [ ] **Step 1: Test shadow compatibility**

Disabled and shadow modes must preserve exact fixed Creator Studio command payload/outcome. Shadow model failures remain non-blocking and additive diagnostics contain no raw responses.

- [ ] **Step 2: Test identity loop**

Script planner/evaluator responses for initial pass, model visual repair, code QA failure, cannot-evaluate retry, one identity regeneration, exhausted identity budget, optional identity checkpoint, and cancellation. Assert no auto-import/activation.

- [ ] **Step 3: Test single-action loop**

Cover pass, three attempts, model switch, unavailable switch rejection, transient Provider call accounting, action budget exhaustion, cost/time/call exhaustion, evaluation retry, and review-required final state.

- [ ] **Step 4: Test full-pet queue and checkpoint reuse**

Cover exact action order, no `running-left` Provider request, hash-valid reuse, stale hash invalidation, identity-hash invalidation, `idle` required failure, optional omission, running pair omission, later-action continuation, and package composition from passed rows only.

- [ ] **Step 5: Test exact provenance**

Cover multiple successful models, fallback model, reused checkpoint model, rejected unused model exclusion, missing approvals, exact Provider/model/profile/dataset matching, and `artisticApproval` remaining false.

- [ ] **Step 6: Test pause/resume/restart/idempotency**

Assert one operation per step, paused state, explicit resume, cancel, stale lease recovery, same idempotency key reuse, no duplicate Provider call after restart, and first unresolved scope selection.

- [ ] **Step 7: Run focused tests and commit**

```bash
node --test \
  tests/services/creator-workflow-service.test.js \
  tests/examples/creator-studio-host-model-bridge.test.js \
  tests/examples/creator-studio-backend-runner-agent.test.js \
  tests/services/hatch-pet-agent-full-pet.test.js \
  tests/services/hatch-pet-agent-budget-ledger.test.js \
  tests/services/hatch-pet-agent-provenance.test.js
```

```bash
git add tests/services/creator-workflow-service.test.js tests/examples/creator-studio-host-model-bridge.test.js tests/examples/creator-studio-backend-runner-agent.test.js tests/services/hatch-pet-agent-full-pet.test.js tests/services/hatch-pet-agent-budget-ledger.test.js tests/services/hatch-pet-agent-provenance.test.js
git commit -m "test cover hatch pet workflow execution"
```

---

### Task 5: Verify IPC, Contracts, Demo API, And Control Center

**Files:**
- Modify: `tests/shared/ipc-channels.test.js`
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
- Modify: `tests/control-center/demo-control-center-api.test.js`
- Modify: `tests/control-center/control-center-smoke.spec.js`
- Create: `tests/main/ipc-hatch-pet-agent.test.js`

**Interfaces:**
- Verifies renderer-safe configuration and workflow controls.

- [ ] **Step 1: Test IPC parity and secret boundaries**

Assert JS/TS/preload channels match, every handler delegates to the correct service, config saves normalize, API key values never return, and unknown payload fields do not reach services.

- [ ] **Step 2: Test settings UI**

Cover disabled default, follow-chat/override, dedicated fields, key save/clear, capability result, budgets and bounds, identity checkpoint, shadow badge, bounded opt-in, and fallback copy.

- [ ] **Step 3: Test Creator UI**

Cover shadow status, identity review, action progress, model switch, omissions, budgets, pause/resume/cancel, ready for review, code QA versus model evaluation, and human-approval-required copy.

- [ ] **Step 4: Test dashboard evidence**

Assert agent timeline is bounded and redacts prompts, reasoning, secrets, and absolute paths while keeping decision/model/reason/budget evidence.

- [ ] **Step 5: Run and commit focused UI tests**

```bash
node --test \
  tests/shared/ipc-channels.test.js \
  tests/main/ipc-hatch-pet-agent.test.js \
  tests/control-center/demo-control-center-api.test.js
npm run test:control-center
```

```bash
git add tests/shared/ipc-channels.test.js tests/shared/openpet-contracts-type-fixture.ts tests/control-center/demo-control-center-api.test.js tests/control-center/control-center-smoke.spec.js tests/main/ipc-hatch-pet-agent.test.js
git commit -m "test cover hatch pet control center"
```

---

### Task 6: Run Repository Automated Baseline

**Files:**
- Create: `docs/release-evidence/hatch-pet-agent/2026-07-15-automated-results.md`

**Interfaces:**
- Produces: exact commands, exit codes, counts, and unresolved failures.

- [ ] **Step 1: Run serially**

```bash
npm run check:syntax
npm run test:core
npm run test:tools
npm run test:control-center
npm run test:core:all
npm test
```

Do not run broad Node and Playwright suites concurrently; the Provider reliability test report showed concurrency can create false plugin/process timing failures.

- [ ] **Step 2: Record evidence**

For every command record start/end time, exit code, pass/fail counts, retry reason, and final serial result. Never omit an initial failure.

- [ ] **Step 3: Commit automated evidence**

```bash
git add docs/release-evidence/hatch-pet-agent/2026-07-15-automated-results.md
git commit -m "test record hatch pet automated results"
```

Do not continue to real Provider work until all applicable automated suites pass.

---

### Task 7: Real Provider Generation Through Fresh One-Shot Subagents

**Files:**
- Create: `docs/release-evidence/hatch-pet-agent/image-tasks/*.md`
- Create: `docs/release-evidence/hatch-pet-agent/provider/*.json`

**Interfaces:**
- Produces: real structured Provider evidence without image content entering controller context.

- [ ] **Step 1: Create a file-based brief for each image task**

Each brief contains one bounded operation, exact command, expected artifact/report paths, secret rules, and report schema. The controller spawns with `fork_turns="none"` and never follows up.

Generation subagent report must include:

```json
{
  "status": "passed|failed|blocked",
  "runId": "",
  "operation": "identity|single-action|full-pet|action-repair|identity-repair",
  "provider": "",
  "models": [],
  "requestedOutputCounts": [],
  "actualOutputCounts": [],
  "referenceCounts": [],
  "endpoints": [],
  "attempts": [],
  "budgetUsage": {},
  "resultState": "",
  "reasonCodes": [],
  "artifactPaths": []
}
```

For every successful or attempted real image request, `referenceCounts` must contain only `1`; a `0` or value greater than `1` is an immediate verification failure.

- [ ] **Step 2: Reverify Provider reliability P0**

Use a fresh generation subagent to run a long full-pet path. Prove:

- outer command remains alive beyond 15 minutes when necessary;
- inner 90-minute budget owns timeout;
- heartbeat refreshes;
- simulated/killed command recovers stale generating run after the stale threshold;
- completed checkpoints survive recovery;
- `n=1`, exactly one reference, `/images/edits`, multipart field `image`, same-model retry, deadline accounting, and multi-output fail-closed still hold.
- zero/two reference requests fail before queue, output-path creation, request logging, or fetch;
- every compiled image prompt includes exact dimensions/aspect ratio and contains no product name, Provider/transport term, run/action ID, reference role, path, or checkpoint term;
- runtime evidence records multipart field `image`, logical stage, requested count, actual count, and count mismatch without leaking multipart content.

- [ ] **Step 3: Run bounded identity and single-action operations**

Use a new generation subagent for each operation. Require successful combined code/model gate or preserve explicit failure evidence. Exercise at least one model-directed prompt repair and one model switch when two eligible models exist.

- [ ] **Step 4: Run a complete bounded full-pet operation**

Use a new generation subagent. Require a run reaching `ready_for_review` with passed `idle`. Record passed/reused/omitted actions, every model tuple, budgets, evaluation verdicts, and no approval/import/activation.

- [ ] **Step 5: Never reuse image subagents**

Record the unique task name and completion status in `image-tasks/index.jsonl`. Any retry or issue receives a new task name and new subagent.

---

### Task 8: Independent Visual Evaluation Through New Subagents

**Files:**
- Create: `docs/release-evidence/hatch-pet-agent/visual/*.json`

**Interfaces:**
- Produces: real human-style visual findings for generated artifacts.

- [ ] **Step 1: Separate generation and evaluation agents**

For each generated identity/action/package, spawn a new evaluator subagent that did not generate it. It may open images/GIFs/atlas and writes a structured report.

- [ ] **Step 2: Require exact visual checks**

Each report covers:

- source versus canonical identity;
- markings/accessories/material/style;
- action semantics and direction;
- frame-to-frame and cross-row consistency;
- idle minimal motion;
- animation timing/loop quality from GIF;
- transparency/edge contamination;
- small-window readability;
- scale, centroid, baseline, and safe padding;
- final atlas layout, used cells, and transparent unused cells.

- [ ] **Step 3: Compare model evaluator with independent evaluator**

Record agreements and disagreements. A model `pass` with an independent blocking defect fails acceptance and requires a new repair generation subagent followed by a new evaluator subagent.

- [ ] **Step 4: Preserve controller isolation**

The controller reads only structured evaluator reports, never image data or rendered outputs.

---

### Task 9: Exercise Repair, Human Labels, Calibration, And Provider Approval

**Files:**
- Modify only when justified: `examples/plugins/creator-studio/quality/pet-generation-human-examples.json`
- Modify only when justified: quality profile registry/config files
- Modify only when justified: `examples/plugins/creator-studio/quality/provider-art-approvals.json`
- Create: `docs/release-evidence/hatch-pet-agent/2026-07-15-acceptance-report.md`

**Interfaces:**
- Produces: legitimate acceptance evidence and final pass/fail.

- [ ] **Step 1: Exercise real action repair**

Use a fresh generation subagent. Prove only the selected action is invalidated/regenerated, other hash-valid rows are reused, prior evidence is archived, and result stops at review or failed.

- [ ] **Step 2: Exercise real identity repair**

Use another fresh generation subagent. Prove identity and all dependent action checkpoints are invalidated/regenerated, evidence is archived, and no auto-approval/import/activation occurs.

- [ ] **Step 3: Re-evaluate repairs**

Use new visual evaluator subagents for repaired results. Do not reuse prior evaluators.

- [ ] **Step 4: Create labels only from actual reviewed artifacts**

Approved/rejected registry records require safe relative evidence paths, fixed reason codes, exact metrics, and real evaluator review. Do not add labels merely to satisfy tests.

- [ ] **Step 5: Calibrate only when labels support it**

If sample size or evidence is insufficient, keep the default profile and report calibration not justified. Never lower thresholds to pass known failures.

- [ ] **Step 6: Add Provider approval only after full acceptance**

Require exact approval records for every successful used Provider/model/profile/dataset tuple. Re-run claim tests. Confirm only `artReadiness` changes; `artisticApproval`, run approval, import, and activation remain human-owned.

- [ ] **Step 7: Write and commit final report**

Report automated commands/counts, Provider evidence, timeout/lease behavior, decisions, model switches, budgets, complete run, repair outcomes, visual findings, labels/calibration, approval IDs, unresolved defects, and final PASS/FAIL.

```bash
git add docs/release-evidence/hatch-pet-agent examples/plugins/creator-studio/quality
git commit -m "test record hatch pet agent acceptance"
```

---

### Task 10: Make The Rollout Decision

**Files:**
- Modify: `docs/pet-character-generation.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`

**Interfaces:**
- Produces: truthful release status; no code default change unless separately authorized.

- [ ] **Step 1: Apply the decision matrix**

| Evidence | Decision |
| --- | --- |
| Any automated, Provider, recovery, repair, or visual gate fails | Keep disabled/opt-in; implemented but unverified |
| All gates pass but cost/latency/regression evidence is insufficient | Keep opt-in; verified experimental |
| All gates pass with acceptable cost, latency, recovery, and human acceptance | Mark default-eligible; changing the default requires a separate user-approved implementation task |

- [ ] **Step 2: Update documents without overclaiming**

Record exact testing branch and evidence paths. Do not label default-eligible as default-enabled.

- [ ] **Step 3: Run final verification**

```bash
npm run check:syntax
npm run test:core:all
npm run test:tools
git diff --check
git status --short --branch
```

- [ ] **Step 4: Commit documentation decision**

```bash
git add docs/pet-character-generation.md docs/project-status-review.md docs/project-context.json
git commit -m "docs record hatch pet rollout decision"
```

Do not merge or push without explicit user instruction.

---

## Final Claim Boundary

The feature remains disabled/opt-in and not production-art-ready unless every automated, Provider, lease/recovery, full-pet, repair, independent visual, human-label, and exact Provider-approval requirement passes. A successful model self-evaluation is never sufficient by itself.
