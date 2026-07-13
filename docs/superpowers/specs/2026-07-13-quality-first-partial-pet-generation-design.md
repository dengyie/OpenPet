# Quality-First Partial Pet Generation Design

Date: 2026-07-13  
Status: Approved design  
Branch: `codex/dev8`

## 1. Objective

OpenPet must prefer a smaller set of production-quality pet actions over a complete nine-row package containing weak, identity-drifting, opaque, static, or semantically incorrect animation.

The workflow must:

- require one approved `idle` action;
- treat every other action as optional;
- never count preview fallback, copied frames, failed QA output, or unreviewed repair output as a production action;
- continue attempting independent optional actions after one optional action fails;
- preserve enough evidence to retry only the failed or missing scope;
- keep the stable nine-row runtime atlas contract;
- prevent missing actions from being selected at runtime;
- require human visual review before import.

This design does not lower any existing image, motion, identity, transparency, or semantic QA threshold.

## 2. Review Findings

The current implementation enforces all-or-nothing completion in several layers:

1. `full-pet-basic-actions.js` classifies every official action as `required-real`.
2. `generateFullPetBasicActionSources` stops at the first failed action.
3. `generateViaHostModelBridge` rejects any result that does not contain every official row.
4. `buildOfficialAtlasFromRows` rejects a missing official row before atlas composition.
5. `assertFullPetQaPassed` rejects missing official action coverage before approval or import.
6. A retry starts the full Provider chain again instead of reusing verified action artifacts.

This makes overall completion probability depend on every Provider call and every action passing in one uninterrupted run. It also conflicts with the product requirement that low-quality actions must be omitted instead of accepted merely to complete the matrix.

## 3. Action Policy

### 3.1 Required action

`idle` is the only required production action.

If `idle` cannot be generated, extracted, automatically validated, and presented for review, the run remains `review-required` or `failed` and cannot produce an importable pet pack.

### 3.2 Optional independent actions

The following actions are independently optional:

- `waving`
- `jumping`
- `failed`
- `waiting`
- `running`
- `review`

Failure of one optional action does not stop generation of later optional actions. A failed action is recorded as omitted and does not enter the production atlas.

### 3.3 Directional pair

`running-right` and `running-left` form one optional atomic pair.

- The Provider generates and QA-validates only `running-right`.
- `running-left` is derived frame-by-frame with the approved mirror path.
- Frame order and official durations are preserved.
- The derived row is marked `approved-mirror`.
- If generation, QA, mirroring, extraction, or pair-level review fails, neither direction enters the production action set.
- No Provider stage or Provider action job may exist for `running-left`.

## 4. Action Attempt State

Each official action has one durable action-attempt record. The record is safe run metadata and contains no secrets or raw authorization material.

Required fields:

```json
{
  "actionId": "waving",
  "required": false,
  "status": "approved-auto",
  "attemptCount": 1,
  "sourceKind": "provider-row",
  "row": {},
  "keyframes": [],
  "generationStages": [],
  "quality": {},
  "failure": null,
  "artifactHashes": {},
  "updatedAt": "2026-07-13T00:00:00.000Z"
}
```

Allowed statuses:

- `pending`: not attempted in this run;
- `generating`: current bounded action operation;
- `approved-auto`: Provider output passed deterministic QA and may be included in the review draft;
- `approved-mirror`: approved `running-left` derived from approved `running-right`;
- `omitted-provider`: Provider timeout, gateway error, or no usable output;
- `omitted-quality`: deterministic QA rejected the action;
- `omitted-mirror`: the directional derivation failed;
- `invalidated`: previously approved artifacts no longer match their recorded hashes.

`approved-auto` does not mean human art approval. It only means the row is eligible for the review draft.

## 5. Generation And Recovery Flow

### 5.1 Identity and idle gate

The workflow first validates the source, generates the canonical identity artifacts, and generates `idle`.

`idle` must pass all existing automatic gates before optional action generation begins. A failed `idle` ends the generation attempt without creating an importable package.

### 5.2 Optional action continuation

After `idle` succeeds, the orchestrator attempts optional actions in policy order.

For each optional action:

1. Look for a reusable approved action-attempt record.
2. Verify every recorded artifact hash and required file.
3. Reuse the action only when the record, files, model/prompt provenance, and hashes remain valid.
4. Otherwise generate the bounded action scope.
5. Persist the action result immediately.
6. On Provider or QA failure, mark the action omitted and continue.

The orchestrator must distinguish optional action failure from workflow failure. It may stop only for:

- required `idle` failure;
- corrupt or unsafe run state;
- exhausted workflow-level time budget before a safe checkpoint can be persisted;
- atlas, manifest, or import integrity failure affecting already approved actions.

### 5.3 Retry behavior

Retrying the same run reuses valid `approved-auto` and `approved-mirror` rows. It retries only:

- `pending` actions;
- omitted actions selected for retry;
- invalidated actions;
- a required `idle` action that has no valid approved checkpoint.

Provider 5xx, timeout, and gateway failures retain the existing bounded same-stage retry. Exhausting that retry omits an optional action instead of restarting the run.

Quality failures are not silently retried in a loop. They remain review evidence until the user requests a scoped repair or regeneration.

## 6. Partial Atlas Contract

The atlas keeps the official nine stable row slots so the renderer and existing frame-coordinate contract do not need a migration.

For an available action:

- compose only QA-approved frames into its official row;
- retain the official frame count and durations;
- record row quality and artifact hashes.

For an omitted action:

- write fully transparent cells into the stable row slot;
- do not manufacture preview motion;
- do not copy `idle` frames into the missing row;
- do not count the row as real action coverage.

The generated manifest and QA artifacts include:

```json
{
  "requiredActionIds": ["idle"],
  "availableActionIds": ["idle", "waving"],
  "omittedActionIds": ["running-right", "running-left"],
  "actionAvailability": {
    "idle": { "available": true, "quality": "row-real" },
    "running-right": {
      "available": false,
      "reason": "identity-descriptor-distance-high"
    }
  }
}
```

Omission reasons must be sanitized, bounded, and based on recorded failure conditions.

## 7. QA And Human Review

### 7.1 Deterministic QA

All current quality gates remain active:

- safe background preparation;
- alpha and edge integrity;
- coverage, padding, centering, and crop safety;
- identity color and identity descriptor distance;
- frame uniqueness and real silhouette motion;
- action-specific semantic checks;
- baseline, size, and anchor stability;
- final file and hash integrity.

Only `approved-auto` and `approved-mirror` rows may be composed into the review draft.

### 7.2 Review draft

Successful generation produces a review draft, not an automatically approved import.

Review artifacts show:

- the canonical identity beside the source;
- one contact sheet and animation preview per available action;
- explicit omitted-action cards with safe failure reasons;
- cross-row identity evidence;
- the final partial atlas;
- the exact list of actions that will be available at runtime.

The run remains `review-required` until the user approves the current artifact hashes. Any file or availability change invalidates approval.

### 7.3 Import gate

Import requires:

- approved and hash-valid `idle`;
- every included action to have passing row QA;
- no included preview fallback or failed row;
- a valid partial-atlas QA record;
- human approval for the exact current artifact set.

Missing optional actions are warnings, not import blockers.

## 8. Runtime Behavior

The runtime reads `availableActionIds` from the imported pet pack.

- Discovery and random action selection exclude omitted actions.
- A direct request for an unavailable action resolves to approved `idle`.
- Trigger proposals for unavailable actions remain disabled or pending instead of silently targeting another non-idle action.
- Existing complete nine-row packs remain compatible; absence of availability metadata means all manifest actions are available.

This fallback is runtime state selection only. It does not write copied `idle` art into omitted atlas rows or claim the missing action exists.

## 9. Component Changes

### Creator Studio policy

- Change required real actions to `['idle']`.
- Keep all official action IDs as stable atlas layout IDs.
- Represent optional action and directional-pair policy explicitly.

### Provider orchestration

- Replace fail-fast optional generation with per-action result accumulation.
- Persist an action checkpoint after every bounded action attempt.
- Reuse hash-valid approved rows on retry.
- Preserve current single-reference Provider boundary.

### Atlas and QA

- Accept missing optional rows.
- Compose transparent slots for missing actions.
- Fail closed if any included row fails QA.
- Emit availability and omission evidence.

### Backend workflow

- Preserve partial action state in the run record after every action.
- Separate `generation-complete-review-required` from `generation-failed`.
- Keep import blocked until review approval.

### Runtime and import

- Persist availability metadata in the pack.
- Exclude unavailable actions from discovery and triggers.
- Fall back safely to `idle` for unavailable direct requests.

## 10. Error Handling

| Failure | Required `idle` | Optional action |
| --- | --- | --- |
| Provider 5xx/timeout | Fail attempt after bounded retry | Omit action and continue |
| No materialized output | Fail attempt | Omit action and continue |
| Unsafe background | Fail attempt | Omit action and continue |
| Identity or composition QA | Fail attempt | Omit action and continue |
| Motion or semantic QA | Fail attempt | Omit action and continue |
| Running mirror failure | Not applicable | Omit both directions and continue |
| Checkpoint write failure | Fail closed | Fail closed |
| Approved artifact hash mismatch | Invalidate and block import | Exclude or regenerate action |
| Human rejection | Keep run unapproved | Exclude or request scoped repair |

No error path may convert a rejected action into preview fallback production art.

## 11. Testing Strategy

### Policy tests

- `idle` is the only required action.
- `running-left` is never a Provider action ID.
- directional availability is atomic.

### Orchestration tests

- failed optional action does not stop later actions;
- failed `idle` stops the run;
- Provider 502 on one optional action records omission and continues;
- quality rejection records full evidence and continues;
- running mirror failure omits both directions while preserving other actions;
- retry reuses hash-valid approved rows and calls Provider only for missing scopes;
- changed or missing files invalidate reuse.

### Atlas and QA tests

- partial atlas contains transparent missing rows;
- omitted rows do not count as real coverage;
- any included failed row blocks atlas completion;
- complete legacy nine-row packs remain valid;
- import succeeds with approved `idle` plus zero or more approved optional actions;
- import fails without approved `idle`.

### Runtime tests

- random action selection ignores omitted actions;
- direct unavailable action request falls back to `idle`;
- unavailable triggers remain inactive;
- legacy packs without availability metadata retain current behavior.

### Real Provider acceptance

Use one front reference image and verify:

- every `/images/edits` request has exactly one reference image;
- an optional Provider failure does not discard approved earlier actions;
- low-quality rows are absent from the package;
- `running-left` has no Provider stage;
- the final report distinguishes technical completion from human visual approval.

## 12. Delivery Phases

### Phase 1: Quality policy and partial atlas

- make only `idle` required;
- continue after optional action failures;
- exclude failed actions;
- compose transparent missing rows;
- emit availability metadata;
- update QA and import gates.

### Phase 2: Durable action checkpoints and scoped retry

- persist per-action attempt records;
- validate artifact hashes;
- reuse approved actions;
- retry only missing, invalidated, or explicitly selected scopes.

### Phase 3: Runtime availability enforcement and review UX

- filter runtime action discovery and triggers;
- provide safe `idle` fallback;
- show available and omitted actions in review;
- invalidate approval when artifact availability changes.

### Phase 4: Quality enhancement

- add bounded candidate generation only for actions rejected for identity or semantics;
- calibrate candidate ranking with human-reviewed fixtures;
- keep candidate generation optional and cost-bounded.

## 13. Acceptance Criteria

The design is complete when all of the following are true:

1. A pet with approved `idle` and no optional actions can reach human review and import.
2. A failed optional action never appears in the production atlas or available action list.
3. One optional failure does not prevent later optional actions from being attempted.
4. `running-left` is derived only from approved `running-right` and is never requested from the Provider.
5. Retrying a run does not regenerate hash-valid approved actions.
6. Missing actions occupy transparent stable atlas slots.
7. Runtime selection and triggers cannot play omitted actions.
8. Human approval is required for the exact final artifact set.
9. Existing complete pet packs remain compatible.
10. Automated tests and real Provider evidence do not claim that automated QA proves artistic approval.

## 14. Out Of Scope

- lowering QA thresholds;
- fabricating local motion from one accepted frame;
- replacing omitted actions with copied `idle` art;
- changing the one-reference-image Provider contract;
- redesigning the entire Creator Studio UI;
- automatic aesthetic approval;
- unlimited best-of-N Provider generation.
