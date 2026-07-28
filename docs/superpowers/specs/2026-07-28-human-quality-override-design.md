# Human Quality Override for Generated Pet Candidates

**Date:** 2026-07-28

**Status:** Approved design

## Purpose

OpenPet preserves every paid generated asset, but the current quality-first pipeline uses one `eligible` flag for two different decisions:

1. whether an asset is technically complete enough to continue through the pipeline; and
2. whether the automatic evaluator recommends the asset under the active quality profile.

The second decision currently overwrites the first. A complete candidate such as `canonical-4` from run `2026-07-27-pet-002` can therefore be visible but impossible to select solely because its visual score is below the automatic threshold. That contradicts the product's human-approval boundary: quality automation should guide the owner, while the owner retains the final artistic choice.

This design separates technical deliverability from quality recommendation for both canonical identity candidates and per-action candidates. Automatic generation remains quality-first. A human may explicitly choose a technically usable, non-recommended candidate after seeing its evidence and warnings.

## Goals

- Preserve strict quality-first behavior for automatic selection.
- Allow a human to select any technically usable retained canonical or action candidate.
- Keep evaluator scores, defects, and failure codes visible and unchanged after an override.
- Bind every manual decision to the exact candidate asset by scope, ID, and SHA-256.
- Rebuild only the checkpoints and package artifacts affected by an action override.
- Keep technically unusable paid assets visible for inspection without allowing them to corrupt a pet pack.
- Support existing quality-first run records without rewriting their stored evidence.

## Non-goals

- Lowering or disabling evaluator thresholds.
- Treating a human override as evidence that the candidate passed automated quality review.
- Automatically selecting a non-recommended candidate.
- Allowing corrupt, missing, unsafe, or structurally incomplete artifacts into a package.
- Regenerating an image as part of a manual selection operation.
- Replacing the existing retry and repair workflows.

## Decision Model

Every retained canonical and action candidate exposes two independent decisions.

### Technical eligibility

`technicalEligible` answers whether the exact retained asset can be used by the next deterministic pipeline stage.

For a canonical candidate, this requires:

- exactly one Provider output;
- a safe run-relative path;
- an existing, decodable image;
- a SHA-256 value matching the current file;
- a visible, processable subject;
- enough source padding and structural completeness for reference-board generation.

For an action candidate, this requires:

- the same path, file, decode, and hash guarantees;
- successful deterministic sprite-sheet processing;
- a complete processed frame set for the action layout;
- persisted processed artifacts needed to reconstruct an action checkpoint;
- valid bindings to the accepted canonical identity, plan, processor, and scale profile.

Provider failure, multiple outputs, missing files, hash mismatch, path escape, decode failure, missing subject, processing failure, missing frames, or stale dependency bindings remain hard blockers.

### Quality recommendation

`recommended` answers whether the candidate passes the active automated quality profile. It includes evaluator and deterministic visual-quality evidence such as:

- identity similarity;
- silhouette consistency;
- small-scale readability;
- style fidelity;
- composition and framing quality;
- motion readability;
- overall score;
- visual defect severity.

These findings are recommendations, including evaluator findings whose severity text is `major` or `blocking`. They do not change `technicalEligible` unless the same underlying condition independently makes deterministic downstream processing impossible.

### Derived selection states

The public candidate view derives one of four states:

| State | Technical | Recommended | Meaning |
| --- | --- | --- | --- |
| `recommended` | yes | yes | Automatic and human selection allowed |
| `selectable-with-warning` | yes | no | Human selection allowed after explicit warning |
| `selected-by-human` | yes | either | Exact candidate selected by a human |
| `technically-unusable` | no | either | Visible for evidence, selection forbidden |

The runtime must not infer technical eligibility from `recommended`, `gate.ok`, an overall score, or evaluator severity.

## Candidate Contract

Newly persisted candidate records use explicit fields:

```json
{
  "technicalEligible": true,
  "recommended": false,
  "technicalFailureCodes": [],
  "qualityWarningCodes": [
    "visual-score-silhouette-below-minimum",
    "visual-defect-identity-drift"
  ]
}
```

Existing `qa`, `gate`, `evaluation`, `failureCodes`, scores, artifacts, and model provenance remain authoritative evidence. The split code lists are derived and bounded public summaries; they do not erase the original evidence.

Selection records use an immutable, hash-bound decision:

```json
{
  "candidateId": "canonical-4",
  "sha256": "f754e7dac1d44a4953c2eccbc78c5a98e8c25a56474c7400ffe67154bf240c14",
  "selectionAuthority": "human-override",
  "qualityOverride": true,
  "acknowledgedWarningCodes": [
    "visual-score-silhouette-below-minimum",
    "visual-defect-identity-drift"
  ],
  "selectedAt": "2026-07-28T00:00:00.000Z"
}
```

Automatic selections use `selectionAuthority: "automatic"` and `qualityOverride: false`.

The legacy `eligible` field may be read for old records but is no longer the selection authority. New runtime decisions use only `technicalEligible` and `recommended`. Public contracts retain `eligible` only during the migration window as a deprecated alias for `recommended`; new code must not use it to authorize a human decision.

## Automatic Selection

Automatic canonical and action selection remains unchanged in intent:

1. discard candidates that are not technically eligible;
2. consider only recommended candidates;
3. rank by the existing score and tie-break contracts;
4. record the selected hash and `selectionAuthority: "automatic"`;
5. pause for mandatory canonical identity review when configured.

If no recommended candidate exists but at least one candidate is technically eligible, the pipeline does not report that all paid candidates are unusable. It pauses in a human-decision state and exposes the technically usable candidates with warnings.

If no candidate is technically eligible, the existing failure or recovery path remains active.

## Manual Canonical Selection

The existing canonical acceptance operation is extended with an explicit acknowledgement payload. The request binds:

- `runId`;
- scope `canonical`;
- `candidateId`;
- expected SHA-256;
- the currently displayed quality warning codes;
- confirmation of a non-recommended selection when applicable.

The backend re-reads the candidate record, verifies that the path remains inside the run, verifies the current file hash, recomputes or validates technical eligibility, and rejects stale warning evidence. A recommended candidate does not require a quality-override acknowledgement. A non-recommended candidate requires it.

After acceptance, every action request uses the exact accepted canonical candidate and hash. The accepted record retains the failed automated evaluation and adds the human decision metadata; it does not mutate `recommended` to `true`.

## Manual Action Selection

A new action-candidate acceptance operation is added for retained candidates. The request binds:

- `runId`;
- `actionId`;
- `candidateId`;
- expected SHA-256;
- acknowledged quality warnings;
- explicit quality-override confirmation when required.

The backend verifies the current accepted canonical hash, plan hash, scale-profile hash, processor version, quality-profile hash, candidate artifacts, processed frame count, and file hashes. It then materializes the selected candidate into the official action checkpoint.

The operation does not call the Provider and does not rerun model evaluation. It records the manual decision and preserves the original quality evidence.

### Dependency invalidation

- Selecting a new `idle` candidate rebuilds the character scale profile and invalidates all non-idle action checkpoints bound to the previous profile. Previously paid candidates remain visible, but only candidates whose stored artifacts can be reprocessed under the new profile may be selected without regeneration.
- Selecting a new `running-right` candidate rebuilds `running-right` and derives `running-left` again when the mirror contract permits it.
- Selecting any other action candidate replaces only that action checkpoint.
- After any accepted override, package and final QA artifacts are rebuilt from the current official checkpoints.

Final QA remains advisory when it reports visual quality concerns. Package construction, schema, missing required `idle`, corrupt output, and binding failures remain hard blockers.

## User Interface

Canonical and action candidate cards share the same language and controls.

### Recommended candidate

- Badge: `推荐使用`
- Primary action: `选择此候选`
- Shows scores, model, hash, prompt, artifacts, and Provider attempts.

### Selectable non-recommended candidate

- Badge: `未达推荐标准，但可以选择`
- Primary action remains enabled.
- Shows a concise recommendation followed by the exact score and warning list.
- Selecting opens an inline confirmation with candidate ID, hash prefix, and risks.
- Confirmation copy states that the quality result remains failed and that downstream animation may inherit the visible differences.

For `canonical-4`, the UI should communicate:

> 综合分 68，不推荐自动采用。身份、轮廓和小尺寸可读性存在风险，但图片技术完整，你仍可选择它作为 canonical identity。

### Human-selected candidate

- Badge: `已由你选择`
- When overridden, an additional badge states `采用时未达推荐标准`.
- The quality result continues to show `未通过自动质量建议` rather than `质量通过`.

### Technically unusable candidate

- Badge: `技术上不可用`
- Selection is disabled with a concrete technical reason.
- Preview, prompt, Provider attempts, artifacts, and evidence remain accessible.

### Action review

Each action result expands to show every retained candidate, not only the automatic winner. The user can compare previews, scores, defects, prompts, and hashes; select a retained candidate; retry generation; or keep the current selection.

## Service and IPC Boundaries

The renderer receives only sanitized run-relative paths, bounded warning lists, hashes, scores, and selection metadata. It never receives absolute paths, API keys, credentials, or unrestricted filesystem handles.

Creator Workflow Service owns renderer-safe views and invokes plugin commands. Creator Studio owns candidate validation, checkpoint materialization, dependency invalidation, and durable run transitions. The renderer never decides technical eligibility and cannot turn a failed candidate into a selected asset by changing client state.

The canonical acceptance request is versioned to include override acknowledgement. A separate action-candidate acceptance request and IPC channel are added rather than overloading retry-action, because selection is deterministic reuse while retry performs paid generation.

## State Transitions

Canonical review adds a non-terminal human-decision path when no recommended candidate exists:

```text
canonical evaluation
  -> recommended candidate exists -> awaiting identity review
  -> only selectable-with-warning candidates exist -> awaiting identity review with warnings
  -> no technically eligible candidate -> identity generation failed/recovery
```

Action review supports manual recovery without generation:

```text
action quality gate failed
  -> retained technical candidate exists -> review required
  -> human accepts candidate -> rebuild checkpoint -> rebuild package -> ready for review
  -> no retained technical candidate -> retry or omit action
```

The run persists before and after every destructive checkpoint invalidation. A failed rebuild leaves the paid candidate records intact and moves the run to recovery-required with a specific error code.

## Compatibility

Existing run records are interpreted conservatively:

- `technicalEligible === false` remains technically unusable.
- An existing canonical candidate with `technicalEligible === true` remains manually selectable even when legacy `eligible === false` after model evaluation.
- For legacy canonical candidates without `technicalEligible`, technical eligibility is reconstructed from the persisted candidate record and current artifact checks; it is not assumed from a score.
- Legacy action candidates become selectable only after their persisted processed artifacts and bindings are verified. Missing evidence is a hard blocker, not an inferred pass.
- Existing accepted and automatically selected records remain valid.

No stored candidate evidence is rewritten merely to migrate its view.

## Errors and Observability

Selection failures use stable public reason codes, including:

- `candidate_not_found`;
- `candidate_hash_mismatch`;
- `candidate_path_unsafe`;
- `candidate_asset_missing`;
- `candidate_decode_failed`;
- `candidate_technically_unusable`;
- `candidate_binding_stale`;
- `quality_override_acknowledgement_required`;
- `quality_override_evidence_stale`;
- `action_candidate_frames_incomplete`;
- `override_checkpoint_rebuild_failed`.

Logs record run ID, scope, action ID, candidate ID, hash prefix, selection authority, quality-override state, warning codes, affected checkpoint IDs, and final transition. They never include absolute paths, prompt bodies, credentials, or full Provider request payloads.

## Test Strategy

### Candidate decision tests

- Technical eligibility and recommendation are independent.
- Automatic selection excludes non-recommended candidates.
- Human selection accepts a technically eligible non-recommended candidate.
- Human selection rejects missing, corrupt, hash-mismatched, unsafe, or structurally incomplete candidates.
- Evaluator `major` and `blocking` quality defects remain warnings when deterministic technical checks pass.
- A human override never changes `recommended` or quality gate evidence to passing.

### Canonical workflow tests

- A pool containing only technically eligible non-recommended candidates pauses for human review instead of failing as unusable.
- Acceptance requires an exact hash and current warning acknowledgement.
- The accepted canonical record contains `human-override` metadata.
- All subsequent action generation binds to the overridden canonical hash.
- Existing run `technicalEligible: true, eligible: false` records are manually selectable.

### Action workflow tests

- Every retained action candidate is exposed with preview, technical status, recommendation, evidence, and hash.
- A non-recommended but processed-complete action candidate can replace the automatic selection.
- Selection performs zero Provider calls.
- Idle replacement rebuilds the scale profile and invalidates profile-dependent action checkpoints.
- Running-right replacement rebuilds its mirror.
- Other action replacement affects only the selected action.
- A failed checkpoint or package rebuild preserves candidate evidence and enters recovery-required.

### Service and UI tests

- Renderer contracts contain no absolute paths or secrets.
- Non-recommended technical candidates have enabled selection controls.
- Technically unusable candidates remain visible and disabled with a concrete reason.
- Override confirmation displays the exact candidate, hash prefix, scores, and warning codes.
- UI never labels an override as an automated quality pass.
- Stale client evidence is rejected by the backend.

### Regression tests

- Recommended automatic selection ordering is unchanged.
- Retry and repair continue to perform paid generation and are not conflated with selection.
- Partial import still includes only materialized official checkpoints.
- Existing accepted identities and action checkpoints remain readable.
- All core, Creator Studio, and Control Center suites remain green.

## Implementation Scope

Expected implementation areas include:

- Creator Studio candidate store and candidate-decision helpers;
- canonical pool evaluation and quality-first orchestrator;
- quality-first action runner and backend runner;
- host-model bridge checkpoint materialization;
- Creator Workflow Service safe views and commands;
- shared TypeScript contracts, IPC channels, preload, and runtime wiring;
- Create candidate review UI and hooks;
- focused Node and Control Center tests;
- authoritative pet-generation documentation.

The implementation should introduce one focused candidate-decision module shared by canonical and action paths. It should not add parallel fallback selectors or duplicate technical validation in the renderer.

## Acceptance Criteria

- A user can select `canonical-4` when its current file and persisted evidence prove it is technically eligible, despite its score of 68 and failed quality recommendation.
- The UI still advises against automatic adoption and shows the exact risks.
- Automatic selection remains restricted to recommended candidates.
- The same rule applies to every retained per-action candidate.
- Technical failures cannot be overridden.
- All selections are hash-bound, auditable, and reflected in downstream checkpoints and package output.
- No paid asset is hidden or deleted by quality evaluation or manual selection.
