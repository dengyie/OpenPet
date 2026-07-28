# Human Quality Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a human select any technically usable retained canonical or action candidate while keeping automatic selection quality-first and preserving all failed quality evidence.

**Architecture:** A focused Creator Studio candidate-decision module owns the split between technical eligibility and quality recommendation plus hash-bound selection records. Canonical and action runners persist that decision, backend commands validate human acknowledgements and materialize exact candidates, Creator Workflow Service exposes sanitized views, and Create UI presents warnings without granting authority to the renderer.

**Tech Stack:** Electron, Node.js CommonJS, Node native test runner, React, TypeScript, IPC, Sharp, Creator Studio JSON run records.

## Global Constraints

- Work only on branch `codex/dev8` in `/Users/mango/.codex/worktrees/ff3f/OpenPet`.
- Automatic selection must require both `technicalEligible === true` and `recommended === true`.
- Human selection may require only `technicalEligible === true`, an exact SHA-256 match, and current warning acknowledgement.
- Human override must never mutate a failed recommendation into a pass.
- Provider failure, multiple outputs, unsafe paths, missing/corrupt files, hash mismatch, decode failure, missing processable subject, failed deterministic processing, incomplete processed frames, or stale bindings remain hard blockers.
- Every paid candidate remains visible and retained even when technically unusable.
- Manual selection must perform zero Provider calls.
- The renderer must receive no API keys, credentials, prompt secrets, absolute paths, or unrestricted filesystem handles.
- Do not generate real images or perform paid Provider smoke tests in this implementation task.
- Use TDD: observe each new focused test fail before production implementation, then rerun it to green.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `examples/plugins/creator-studio/lib/candidate-decision.js` | Normalize technical/recommended decisions and validate hash-bound human selections |
| `examples/plugins/creator-studio/lib/sprite-candidate-store.js` | Persist the new decision and selection metadata without discarding existing evidence |
| `examples/plugins/creator-studio/lib/quality-first-full-pet-orchestrator.js` | Automatic canonical ranking, human-review pause, and accepted canonical state |
| `examples/plugins/creator-studio/lib/quality-first-action-runner.js` | Automatic action ranking while retaining technically usable non-recommended candidates |
| `examples/plugins/creator-studio/lib/host-model-bridge.js` | Produce technical/recommended fields and materialize a retained action candidate into frames/checkpoints |
| `examples/plugins/creator-studio/lib/backend-runner.js` | Validate manual canonical/action selection and persist state transitions |
| `examples/plugins/creator-studio/commands/accept-identity.js` | Pass canonical override acknowledgement to backend |
| `examples/plugins/creator-studio/commands/accept-action-candidate.js` | Deterministically select a retained action candidate |
| `examples/plugins/creator-studio/plugin.json` | Declare the action-candidate selection command |
| `src/main/services/creator-workflow-service.js` | Sanitize candidate views and invoke selection commands |
| `src/main/ipc/register-creator-ipc.js` | Route canonical/action selection requests |
| `src/shared/ipc-channels.js`, `src/shared/ipc-channels.ts` | Declare the new IPC channel |
| `control-center-preload.js` | Expose the action selection API |
| `src/shared/openpet-contracts.ts` | Define selection requests and candidate/action review views |
| `src/control-center/src/hooks/useCreatorPane.ts` | Submit explicit override acknowledgements and synchronize results |
| `src/control-center/src/panes/CreatorPane.tsx` | Render candidate recommendations, warning confirmation, and action candidate review |
| `src/control-center/src/api/demo-control-center-api.ts` | Keep demo API aligned with production contracts |
| `docs/pet-character-generation.md` | Document human artistic authority and technical hard blockers |

---

### Task 1: Candidate Decision Contract

**Files:**
- Create: `examples/plugins/creator-studio/lib/candidate-decision.js`
- Modify: `examples/plugins/creator-studio/lib/sprite-candidate-store.js`
- Create: `tests/examples/creator-studio-candidate-decision.test.js`
- Modify: `tests/examples/creator-studio-sprite-candidate-store.test.js`

**Interfaces:**
- Produces: `normalizeCandidateDecision({ candidate, technicalEligible?, recommended? })`
- Produces: `createCandidateSelection({ candidate, expectedHash, authority, qualityOverride, acknowledgedWarningCodes, now })`
- Produces: `assertHumanCandidateSelection({ candidate, expectedHash, qualityOverride, acknowledgedWarningCodes })`
- Produces candidate fields: `technicalEligible`, `recommended`, `technicalFailureCodes`, `qualityWarningCodes`, optional `selection`

- [ ] **Step 1: Write failing decision tests**

```js
test('human selection accepts a technical candidate without changing its failed recommendation', () => {
  const candidate = normalizeCandidateDecision({
    candidate: { candidateId: 'canonical-4', sha256: 'f'.repeat(64), gate: { ok: false, failures: ['visual-score-overall-below-minimum'] } },
    technicalEligible: true,
    recommended: false
  })
  const selection = createCandidateSelection({
    candidate,
    expectedHash: 'f'.repeat(64),
    authority: 'human-override',
    qualityOverride: true,
    acknowledgedWarningCodes: candidate.qualityWarningCodes,
    now: () => '2026-07-28T00:00:00.000Z'
  })
  assert.equal(candidate.recommended, false)
  assert.equal(selection.selectionAuthority, 'human-override')
  assert.equal(selection.qualityOverride, true)
})

test('human selection rejects a technical blocker or stale warning acknowledgement', () => {
  const blocked = normalizeCandidateDecision({ candidate: { candidateId: 'broken', sha256: 'a'.repeat(64) }, technicalEligible: false, recommended: false })
  assert.throws(() => assertHumanCandidateSelection({ candidate: blocked, expectedHash: blocked.sha256, qualityOverride: true, acknowledgedWarningCodes: [] }), /technically unusable/i)
})
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node --test tests/examples/creator-studio-candidate-decision.test.js tests/examples/creator-studio-sprite-candidate-store.test.js`

Expected: FAIL because `candidate-decision.js` and new persisted fields do not exist.

- [ ] **Step 3: Implement the pure decision module**

Implement bounded, deduplicated code lists; exact lowercase SHA-256 validation; set equality for acknowledged warnings; automatic selection metadata; and human override metadata. Keep filesystem checks out of this pure module.

```js
const normalizeCandidateDecision = ({ candidate = {}, technicalEligible, recommended } = {}) => ({
  ...candidate,
  technicalEligible: technicalEligible === true,
  recommended: recommended === true,
  technicalFailureCodes: unique(candidate.technicalFailureCodes),
  qualityWarningCodes: unique(candidate.qualityWarningCodes)
})
```

- [ ] **Step 4: Persist decision and selection metadata**

Extend `sanitizeCandidate` so candidate records retain the four decision fields and a bounded selection object. Do not remove `qa`, `gate`, `evaluation`, or legacy `failureCodes`.

- [ ] **Step 5: Rerun focused tests and confirm GREEN**

Run: `node --test tests/examples/creator-studio-candidate-decision.test.js tests/examples/creator-studio-sprite-candidate-store.test.js`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add examples/plugins/creator-studio/lib/candidate-decision.js examples/plugins/creator-studio/lib/sprite-candidate-store.js tests/examples/creator-studio-candidate-decision.test.js tests/examples/creator-studio-sprite-candidate-store.test.js
git commit -m "feat split candidate technical and quality decisions"
```

### Task 2: Canonical Recommendation and Human Override

**Files:**
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `examples/plugins/creator-studio/lib/quality-first-full-pet-orchestrator.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Modify: `examples/plugins/creator-studio/commands/accept-identity.js`
- Modify: `tests/examples/creator-studio-host-model-bridge-quality-first.test.js`
- Modify: `tests/examples/creator-studio-quality-first-full-pet-orchestrator.test.js`
- Modify: `tests/examples/creator-studio-backend-runner-quality-first.test.js`

**Interfaces:**
- Consumes: Task 1 decision helpers
- Changes: `acceptQualityFirstCanonicalIdentity({ ..., qualityOverride, acknowledgedWarningCodes })`
- Changes: `acceptCanonicalIdentity({ ..., qualityOverride, acknowledgedWarningCodes })`
- Produces: `qualityFirst.acceptedCanonical.selection`

- [ ] **Step 1: Write failing canonical tests**

Add tests proving:

```js
test('canonical pool pauses for review when only technical non-recommended candidates exist', async () => {
  const pending = await orchestrator.start({ run, plan, actions: ['idle'], requireIdentityReviewBeforeActions: true })
  assert.equal(pending.status, 'awaiting_identity_review')
  assert.equal(pending.qualityFirst.canonicalCandidates[0].technicalEligible, true)
  assert.equal(pending.qualityFirst.canonicalCandidates[0].recommended, false)
})

test('canonical human override binds the hash and retains failed recommendation evidence', async () => {
  const accepted = await orchestrator.acceptCanonicalIdentity({
    run: pending,
    candidateId: 'canonical-4',
    sha256: 'f'.repeat(64),
    qualityOverride: true,
    acknowledgedWarningCodes: ['visual-score-overall-below-minimum'],
    actions: ['idle']
  })
  assert.equal(accepted.qualityFirst.acceptedCanonical.recommended, false)
  assert.equal(accepted.qualityFirst.acceptedCanonical.selection.selectionAuthority, 'human-override')
})
```

Also assert that automatic canonical ranking ignores non-recommended candidates and that technically unusable or hash-mismatched candidates remain rejected.

- [ ] **Step 2: Run canonical suites and confirm RED**

Run: `node --test tests/examples/creator-studio-host-model-bridge-quality-first.test.js tests/examples/creator-studio-quality-first-full-pet-orchestrator.test.js tests/examples/creator-studio-backend-runner-quality-first.test.js`

Expected: new assertions fail because model quality overwrites `eligible` and acceptance requires legacy `eligible === true`.

- [ ] **Step 3: Preserve canonical technical eligibility during model evaluation**

In `generateCanonicalCandidatePool`, preserve generation-time technical checks. In `evaluateCanonicalCandidatePool`, set `recommended = candidate.gate.ok === true` without rewriting `technicalEligible`. Derive legacy `eligible` from `recommended` only for old readers.

- [ ] **Step 4: Change canonical pool state transitions**

Rank only candidates satisfying `technicalEligible && recommended && sha256`. If none are recommended but at least one has `technicalEligible && sha256`, return an awaiting-review pool with no automatic selection instead of throwing `canonical_identity_candidates_unusable`. Throw only when no technically eligible candidate exists.

- [ ] **Step 5: Validate and persist canonical override**

Pass acknowledgement fields from `accept-identity.js` through backend runner and orchestrator. Re-read current candidate state, validate its exact hash and current warning set, write the selection record, and continue action generation with that exact candidate.

- [ ] **Step 6: Rerun canonical suites and confirm GREEN**

Run the same command from Step 2.

Expected: all tests pass, including old automatic selection ordering.

- [ ] **Step 7: Commit**

```bash
git add examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/lib/quality-first-full-pet-orchestrator.js examples/plugins/creator-studio/lib/backend-runner.js examples/plugins/creator-studio/commands/accept-identity.js tests/examples/creator-studio-host-model-bridge-quality-first.test.js tests/examples/creator-studio-quality-first-full-pet-orchestrator.test.js tests/examples/creator-studio-backend-runner-quality-first.test.js
git commit -m "feat allow warned canonical human selection"
```

### Task 3: Retained Action Candidate Selection

**Files:**
- Modify: `examples/plugins/creator-studio/lib/quality-first-action-runner.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js`
- Create: `examples/plugins/creator-studio/commands/accept-action-candidate.js`
- Modify: `examples/plugins/creator-studio/plugin.json`
- Modify: `tests/examples/creator-studio-quality-first-action-runner.test.js`
- Modify: `tests/examples/creator-studio-backend-runner-quality-first.test.js`
- Modify: `tests/examples/creator-studio-plugin.test.js`

**Interfaces:**
- Consumes: Task 1 decision helpers
- Produces: `acceptQualityFirstActionCandidate({ dataDir, runId, actionId, candidateId, expectedHash, qualityOverride, acknowledgedWarningCodes, runtime, plan, profile, now })`
- Produces host runtime method: `materializeActionCandidate({ actionId, candidate, canonical, profile, plan })`

- [ ] **Step 1: Write failing action-decision tests**

```js
test('action runner retains a processed candidate as technical when quality recommendation fails', async () => {
  const result = await runQualityFirstAction(harness({ gateOk: false, completeFrames: true }))
  assert.equal(result.ok, false)
  assert.equal(result.candidates[0].technicalEligible, true)
  assert.equal(result.candidates[0].recommended, false)
})

test('manual action selection materializes retained frames without Provider calls', async () => {
  const result = await acceptQualityFirstActionCandidate({
    dataDir,
    runId,
    actionId: 'waving',
    candidateId: 'candidate-2',
    expectedHash: 'b'.repeat(64),
    qualityOverride: true,
    acknowledgedWarningCodes: ['visual-score-motion-below-minimum'],
    runtime,
    plan,
    profile
  })
  assert.equal(providerCalls, 0)
  assert.equal(result.run.qualityFirst.actionResults.waving.selection.selectionAuthority, 'human-override')
})
```

- [ ] **Step 2: Run focused action suites and confirm RED**

Run: `node --test tests/examples/creator-studio-quality-first-action-runner.test.js tests/examples/creator-studio-backend-runner-quality-first.test.js tests/examples/creator-studio-plugin.test.js`

Expected: FAIL because action candidates have no independent decision or selection command.

- [ ] **Step 3: Persist action technical and recommendation decisions**

After deterministic processing, set `technicalEligible` only when the expected processed frame set and required artifacts exist. Set `recommended` only when both deterministic visual QA and model quality gate pass. Automatic selection continues to call a selector that requires both.

- [ ] **Step 4: Implement exact candidate materialization**

Add a host runtime method that re-reads the persisted candidate record, validates run-relative artifacts and hashes, restores processed frames, and returns an action result whose selection points to the exact retained candidate. It must not call `generateWithModelFallback` or the evaluator.

- [ ] **Step 5: Implement backend action selection and dependency invalidation**

Add `acceptQualityFirstActionCandidate`. Persist the run before invalidation. For `idle`, rebuild the scale profile and invalidate profile-dependent actions. For `running-right`, rebuild the mirror. For other actions, replace only the selected checkpoint. Rebuild the package and final QA. On failure, retain candidate records and enter `recovery-required` with `override_checkpoint_rebuild_failed`.

- [ ] **Step 6: Add the plugin command**

Declare `accept-action-candidate` in `plugin.json`. The command loads the current run, plan, profile, and host runtime, then calls the backend operation with the acknowledgement payload.

- [ ] **Step 7: Rerun action suites and confirm GREEN**

Run the same command from Step 2.

Expected: all tests pass; the no-Provider assertion remains zero.

- [ ] **Step 8: Commit**

```bash
git add examples/plugins/creator-studio/lib/quality-first-action-runner.js examples/plugins/creator-studio/lib/host-model-bridge.js examples/plugins/creator-studio/lib/backend-runner.js examples/plugins/creator-studio/commands/accept-action-candidate.js examples/plugins/creator-studio/plugin.json tests/examples/creator-studio-quality-first-action-runner.test.js tests/examples/creator-studio-backend-runner-quality-first.test.js tests/examples/creator-studio-plugin.test.js
git commit -m "feat select retained action candidates"
```

### Task 4: Main Service, IPC, and Safe Views

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/shared/ipc-channels.js`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `control-center-preload.js`
- Modify: `src/main/ipc/register-creator-ipc.js`
- Modify: `src/main/services/creator-workflow-service.js`
- Modify: `src/main/bootstrap/create-openpet-runtime.js`
- Modify: `src/control-center/src/api/demo-control-center-api.ts`
- Modify: `tests/services/creator-workflow-service.test.js`
- Modify: `tests/main/ipc-registration-groups.test.js`
- Modify: `tests/main/preload-ipc-consistency.test.js`

**Interfaces:**
- Changes: `CreatorAcceptIdentityRequest` adds `qualityOverride` and `acknowledgedWarningCodes`
- Produces: `CreatorAcceptActionCandidateRequest`
- Produces API method: `acceptCreatorActionCandidate(payload): Promise<CreatorWorkflowResult>`
- Produces IPC: `CREATOR_ACCEPT_ACTION_CANDIDATE`
- Expands action candidate views with the same decision, evidence, preview, and selection fields as canonical candidates

- [ ] **Step 1: Write failing service and IPC tests**

Cover safe exposure of a `technicalEligible: true, recommended: false` canonical candidate and action candidate; exact payload routing; rejection of invalid run/action/candidate/hash fields; and absence of absolute paths in serialized diagnostics.

```js
assert.equal(view.recommended, false)
assert.equal(view.technicalEligible, true)
assert.equal(view.selectionState, 'selectable-with-warning')
assert.equal(view.relativePath.startsWith('/'), false)
```

- [ ] **Step 2: Run focused service/IPC tests and confirm RED**

Run: `node --test tests/services/creator-workflow-service.test.js tests/main/ipc-registration-groups.test.js tests/main/preload-ipc-consistency.test.js`

Expected: new action selection API and candidate fields are absent.

- [ ] **Step 3: Extend shared contracts and IPC**

Add explicit request types, view types, channel constants, preload method, IPC registration, and runtime dependency wiring. Do not use a generic JSON payload in TypeScript contracts.

- [ ] **Step 4: Expose sanitized canonical and action candidates**

Refactor the existing safe candidate view helper to serve both scopes. Resolve persisted candidate records inside the selected run, verify preview paths, return bounded code lists, and derive `selectionState` from backend fields. Include action candidates in `qualityFirst.actionResults[actionId].candidates` rather than exposing only a count.

- [ ] **Step 5: Implement Creator Workflow Service commands**

Validate identifiers, hashes, boolean acknowledgement, and bounded warning arrays. Invoke `accept-identity` or `accept-action-candidate`, poll progress, refresh diagnostics, and return a review/recovery result with actionable messages.

- [ ] **Step 6: Rerun focused service/IPC tests and confirm GREEN**

Run the same command from Step 2.

- [ ] **Step 7: Commit**

```bash
git add src/shared/openpet-contracts.ts src/shared/ipc-channels.js src/shared/ipc-channels.ts control-center-preload.js src/main/ipc/register-creator-ipc.js src/main/services/creator-workflow-service.js src/main/bootstrap/create-openpet-runtime.js src/control-center/src/api/demo-control-center-api.ts tests/services/creator-workflow-service.test.js tests/main/ipc-registration-groups.test.js tests/main/preload-ipc-consistency.test.js
git commit -m "feat expose safe creator candidate selection"
```

### Task 5: Create UI Human Choice

**Files:**
- Modify: `src/control-center/src/hooks/useCreatorPane.ts`
- Modify: `src/control-center/src/panes/CreatorPane.tsx`
- Modify: `src/control-center/src/styles.css`
- Modify: `tests/control-center/creator-pane-copy.test.js`
- Modify: `tests/control-center/creator-pane-quality-review.test.js`

**Interfaces:**
- Consumes: Task 4 candidate views and API methods
- Produces handlers accepting `{ candidateId, sha256, qualityOverride, acknowledgedWarningCodes }`

- [ ] **Step 1: Write failing UI contract tests**

Assert source and rendered behavior for:

- `推荐使用`;
- `未达推荐标准，但可以选择`;
- `已由你选择`;
- `技术上不可用`;
- enabled selection for technical non-recommended candidates;
- disabled selection only for technical blockers or non-pending state;
- an explicit warning confirmation containing candidate ID, hash prefix, score, and warnings;
- action candidate review and selection controls.

- [ ] **Step 2: Run focused UI tests and confirm RED**

Run: `node --test tests/control-center/creator-pane-copy.test.js tests/control-center/creator-pane-quality-review.test.js`

Expected: FAIL because current UI disables every `eligible === false` candidate and exposes no action candidate chooser.

- [ ] **Step 3: Implement a shared candidate card presentation**

Render recommendation and technical state independently. Preserve previews, prompt/evidence links, Provider attempts, scores, defects, and hashes. Do not nest cards inside cards.

- [ ] **Step 4: Add explicit override confirmation**

Recommended candidates submit directly. Non-recommended technical candidates first show an inline confirmation. Submission includes the exact warning list displayed to the user. A changed backend warning set must return a stale-evidence error and prompt refresh.

- [ ] **Step 5: Add action candidate review**

Within each action result, allow comparing all retained candidates, keeping the current candidate, selecting another retained candidate, or starting the existing paid retry flow. Make it clear that selection reuses an existing asset and retry spends another generation attempt.

- [ ] **Step 6: Rerun UI tests and confirm GREEN**

Run the commands from Step 2.

- [ ] **Step 7: Commit**

```bash
git add src/control-center/src/hooks/useCreatorPane.ts src/control-center/src/panes/CreatorPane.tsx src/control-center/src/styles.css tests/control-center/creator-pane-copy.test.js tests/control-center/creator-pane-quality-review.test.js
git commit -m "feat let owners choose warned pet candidates"
```

### Task 6: Documentation and Migration Regression

**Files:**
- Modify: `docs/pet-character-generation.md`
- Modify: `docs/superpowers/specs/2026-07-20-quality-first-sprite-generation-pipeline-design.md`
- Modify: `tests/examples/creator-studio-candidate-decision.test.js`
- Modify: `tests/examples/creator-studio-quality-first-full-pet-orchestrator.test.js`
- Modify: `tests/examples/creator-studio-backend-runner-quality-first.test.js`
- Modify: `tests/services/creator-workflow-service.test.js`

**Interfaces:**
- Documents `technicalEligible`, `recommended`, automatic authority, human override, and hard blockers

- [ ] **Step 1: Add legacy-record regression tests**

Cover:

- canonical `{ technicalEligible: true, eligible: false }` remains manually selectable;
- a canonical record lacking `technicalEligible` requires successful artifact reconstruction;
- action candidates lacking processed artifacts remain technically unusable;
- existing accepted automatic selections remain valid;
- legacy `eligible` is never used alone to authorize manual selection.

- [ ] **Step 2: Run all candidate-focused suites and confirm behavior**

Run:

```bash
node --test \
  tests/examples/creator-studio-candidate-decision.test.js \
  tests/examples/creator-studio-sprite-candidate-store.test.js \
  tests/examples/creator-studio-host-model-bridge-quality-first.test.js \
  tests/examples/creator-studio-quality-first-full-pet-orchestrator.test.js \
  tests/examples/creator-studio-quality-first-action-runner.test.js \
  tests/examples/creator-studio-backend-runner-quality-first.test.js \
  tests/services/creator-workflow-service.test.js \
  tests/control-center/creator-pane-copy.test.js
```

Expected: all tests pass.

- [ ] **Step 3: Update authoritative documentation**

Document that quality scores are recommendations, automatic selection remains strict, human decisions are hash-bound, and only technical deliverability can block manual selection. Remove wording that claims every model-quality failure makes an asset unusable.

- [ ] **Step 4: Run syntax, type, and build checks**

Run: `npm run check:syntax`

Expected: JS syntax, TypeScript no-emit, and Control Center build pass.

- [ ] **Step 5: Commit**

```bash
git add docs/pet-character-generation.md docs/superpowers/specs/2026-07-20-quality-first-sprite-generation-pipeline-design.md tests
git commit -m "docs define human authority over quality advice"
```

### Task 7: Full Verification and Review

**Files:**
- Review all files changed by Tasks 1-6

**Interfaces:**
- Verifies the complete approved design without real Provider generation

- [ ] **Step 1: Run the full core suite**

Run: `npm run test:core`

Expected: exit 0 with no new skips.

- [ ] **Step 2: Run the Control Center suite**

Run: `npm run test:control-center`

Expected: all Playwright tests pass.

- [ ] **Step 3: Run the combined runtime suite**

Run: `npm run test:core:all`

Expected: core and Control Center suites pass.

- [ ] **Step 4: Run the complete Node suite**

Run: `npm test`

Expected: exit 0 except documented platform-only skips.

- [ ] **Step 5: Perform production code review**

Review the full diff for:

- any use of `eligible` as human selection authority;
- any path where a quality warning mutates technical eligibility;
- stale or mismatched hash acceptance;
- renderer-owned authorization;
- missing candidate retention;
- Provider calls during manual selection;
- incomplete idle/running-right dependency invalidation;
- absolute paths or sensitive data in public views/logs;
- duplicate fallback selectors or obsolete compatibility wrappers.

- [ ] **Step 6: Fix review findings with focused regression tests**

For each confirmed issue, add a failing regression test, run it to RED, implement the minimum correction, and rerun the focused and affected suites.

- [ ] **Step 7: Verify a clean worktree and summarize evidence**

Run:

```bash
git status --short --branch
git log --oneline -8
```

Expected: `codex/dev8` with no uncommitted changes and the task commits present. Do not push or merge without explicit user direction.
