# Pet Generation Quality Governance Design

> Date: 2026-07-14
> Owner: `codex/dev8`
> Status: approved for implementation planning
> Authority: extends `docs/pet-character-generation.md` without changing its atlas, action, or human-review contracts.

## 1. Goal

Complete the remaining engineering work in the canonical pet-generation document by adding:

1. a hard single-reference-image boundary at every host image-generation entry;
2. a versioned protocol for human-approved and human-rejected quality examples;
3. profile-driven prompt guidance, reference-board guidance, and QA thresholds;
4. same-run repair at the smallest failing scope;
5. a machine-readable production-art promotion gate for real Providers and models.

This branch implements the contracts and runtime behavior. A separate testing branch owns real image labels, threshold confirmation, Provider calls, regression execution, and human visual acceptance.

## 2. Non-Goals

- Do not generate, label, or commit new real image fixtures on `codex/dev8`.
- Do not claim artistic success from automated QA or Provider HTTP success.
- Do not change the fixed `1536x1872`, 8-column, 9-row Codex Pet atlas contract.
- Do not make optional actions required.
- Do not expose Provider credentials, absolute host paths, or unrestricted payloads to Creator Studio.
- Do not replace the current generation pipeline with a new general-purpose workflow engine.
- Do not run tests on the development branch for this task; verification belongs to the separate testing branch requested by the user.

## 3. Chosen Architecture

Use a centralized quality-governance layer consumed by the existing Provider bridge, prompt builders, reference-board builders, row QA, workflow service, and review surfaces.

The alternatives were rejected as follows:

- Scattered inline checks would be smaller initially but would keep thresholds, evidence, and promotion rules difficult to audit.
- Rebuilding the full Creator Studio workflow as a state machine would exceed the scope and increase regression risk.

The centralized layer consists of focused modules with stable data contracts. Existing generation code remains responsible for image generation and artifact construction; governance modules decide which inputs, profiles, repairs, and claims are valid.

## 4. Single-Reference Provider Boundary

### 4.1 Rule

Every Provider image-generation request may contain zero or one reference image. Multiple local inputs must first be composed into one local board.

### 4.2 Enforcement layers

The rule is enforced independently at three layers:

1. Creator plugin bridge sanitization in `src/main/services/plugin-service.js` rejects more than one sanitized reference image before calling the host model service.
2. `src/main/services/image-generation-model-service.js` rejects more than one reference image at its public `generateImage` boundary.
3. The internal Provider edit request builder rejects more than one normalized image before constructing multipart data.

The existing assertion in `examples/plugins/creator-studio/lib/host-model-bridge.js` remains as the earliest plugin-owned failure.

### 4.3 Error contract

Use one stable message family:

```text
Image generation accepts at most one reference image; compose multiple sources into one local reference board
```

The failure occurs before file reads, Provider slot acquisition, network calls, or multipart body construction whenever possible. Public logs may record the bounded reference count but not paths or payload contents.

The multipart edit request always uses the `image` field. The `image[]` compatibility path is removed because multi-image edit calls violate the canonical contract.

## 5. Human Quality Example Protocol

### 5.1 Purpose

The protocol lets an independent human-review task supply approved and rejected examples without hard-coding conclusions into runtime code.

### 5.2 Registry location

The default registry lives at:

```text
examples/plugins/creator-studio/quality/pet-generation-human-examples.json
```

The development branch ships a valid empty registry. The separate testing branch may add data-relative evidence records or load an external review registry during acceptance work.

### 5.3 Registry schema

```json
{
  "version": 1,
  "datasetId": "pet-generation-human-review-v1",
  "updatedAt": "2026-07-14T00:00:00.000Z",
  "examples": [
    {
      "id": "example-id",
      "actionId": "idle",
      "decision": "approved",
      "reasonCodes": [],
      "evidenceRelativePath": "runs/run-id/review/idle-contact-sheet.png",
      "metrics": {
        "identityDescriptorDistance": 0,
        "identityMeanRgbDistance": 0,
        "centroidDrift": 0,
        "baselineDrift": 0,
        "sizeDrift": 0,
        "upperMotionRatio": 0,
        "lowerMotionRatio": 0,
        "identityCoreAverageMotionRatio": 0,
        "identityCoreMaxMotionRatio": 0
      }
    }
  ]
}
```

### 5.4 Validation

The loader rejects:

- unsupported versions;
- missing or duplicate IDs;
- unknown decisions or action IDs;
- absolute or traversal evidence paths;
- non-finite metrics;
- approved records with rejection reason codes;
- rejected records without at least one bounded reason code.

Supported rejection reason codes include identity drift, semantic mismatch, static motion, transform-only motion, crop/edge contact, background contamination, baseline instability, scale instability, and direction mismatch.

No runtime component treats the presence of a registry record as import approval. It is calibration and prompt evidence only.

## 6. Versioned Quality Profiles

### 6.1 Purpose

Move quality thresholds out of scattered literals while preserving current behavior by default.

### 6.2 Default profile

Create a code-owned immutable profile with ID `pet-generation-default-v1`. Its values match the current thresholds in `full-pet-row-qa.js` and keyframe/anchor evaluation so the initial refactor is behavior-preserving.

The profile contains bounded groups:

```js
{
  id: 'pet-generation-default-v1',
  sourceDatasetId: '',
  row: {
    visibleAlphaThreshold: 8,
    safeMarginPx: 4,
    maxAlphaCoverage: 0.9,
    maxCentroidDrift: 40,
    maxBaselineDrift: 30,
    maxSizeDrift: 0.35,
    minWavingUpperMotionRatio: 0.01,
    minLocomotionLowerMotionRatio: 0.01,
    maxIdentityCoreAverageMotionRatio: 0.32,
    maxIdentityCorePairMotionRatio: 0.5,
    maxIdentityMeanRgbDistance: 120,
    maxIdentityDescriptorDistance: 90,
    minJumpExcursion: 8,
    maxJumpReturnDrift: 6
  },
  keyframe: {
    // Existing keyframe and action-anchor limits copied without relaxation.
  }
}
```

### 6.3 Calibrated profiles

A calibrated profile is accepted only when it contains:

- a unique profile ID;
- a supported version;
- the source human-review dataset ID;
- a non-empty reviewer-approved evidence reference;
- every required finite threshold within defensive bounds;
- no unknown threshold names.

Loading an invalid calibrated profile fails explicitly. It never falls back silently to partially applied values. Absence of a calibrated profile uses the immutable default profile.

### 6.4 Evidence binding

Every keyframe, row, and atlas QA artifact records:

```json
{
  "qualityProfile": {
    "id": "pet-generation-default-v1",
    "sourceDatasetId": "",
    "version": 1
  }
}
```

This makes a later threshold decision reproducible.

## 7. Prompt And Reference-Board Guidance

### 7.1 Guidance derivation

Build a bounded guidance summary from the human-example registry and active quality profile. Guidance is grouped by action ID and reason code. It contains counts and short fixed phrases, not raw reviewer prose or image paths.

Examples:

- identity drift: preserve species, silhouette, proportions, markings, palette, material, and accessories;
- semantic mismatch: make the action peak unambiguous and action-specific;
- static or transform-only motion: author real pose changes rather than moving or scaling one base sprite;
- edge/crop failure: keep the full body inside safe transparent padding;
- background contamination: return only one character on a clean transparent background;
- baseline/scale instability: maintain a stable lower-center root and consistent body scale.

### 7.2 Prompt integration

`anchor-prompt-builder.js` and `openpet-prompt-builder.js` accept an optional sanitized guidance summary. They append only relevant action and identity guidance. The default prompt remains valid when the registry is empty.

Prompts never include local paths, sample IDs, reviewer names, or unbounded evidence text.

### 7.3 Reference-board integration

Reference-board metadata records:

- active quality profile ID;
- guidance reason codes;
- source roles and layout;
- whether the primary panel is identity-authoritative or pose-guidance-only.

The board remains one generated local image attachment. Guidance changes metadata and composition priority, not the single-reference Provider rule.

## 8. Smallest-Scope Repair

### 8.1 Repair scopes

Two explicit scopes are supported:

- `action`: regenerate one official action in the same run;
- `identity`: invalidate canonical identity and every dependent action.

There is no implicit full-run restart for an action-only failure.

### 8.2 Action repair request

The Creator Studio service exposes a same-run endpoint:

```text
POST /api/runs/:runId/actions/:actionId/retry
```

The host-facing workflow service exposes an equivalent bounded method so Control Center can request the same operation without direct filesystem access.

An action repair request:

1. requires a full-pet run in `failed` or `ready_for_review` state;
2. validates that `actionId` is an official generated action ID;
3. invalidates only that action checkpoint and derived mirror partner when applicable;
4. invalidates final atlas, atlas QA, previews, approval, and import readiness;
5. retains other successful checkpoints whose frame paths and hashes remain valid;
6. regenerates the requested action through the existing Provider path;
7. rebuilds availability, previews, QA, and atlas from reused plus newly generated rows;
8. returns the run to `ready_for_review` only when required `idle` remains available and deterministic gates pass.

`running-right` repair also invalidates `running-left`. `running-left` cannot be retried independently because it is derived from `running-right`.

### 8.3 Identity repair request

Identity repair invalidates:

- canonical identity and anchor artifacts;
- every action checkpoint;
- generated rows, atlas, previews, QA, approval, and import readiness.

The original validated user source and sanitized task inputs remain reusable. Identity repair then follows the existing full-pet generation path.

### 8.4 Checkpoint API

Extend `full-pet-action-checkpoints.js` with explicit invalidation operations:

```js
invalidateActionCheckpoint({ dataDir, runId, actionId, now })
invalidateAllActionCheckpoints({ dataDir, runId, now })
```

Invalidation is atomic and records bounded reason metadata. Deleted or stale frame files are never reused merely because an old checkpoint remains present.

### 8.5 Concurrency and state

Repairs use the existing workflow exclusivity boundary. Concurrent generation or repair requests for the same workflow are rejected. A repair attempt preserves prior rejected output as evidence but never treats it as an approved row.

## 9. Provider Production-Art Promotion Gate

### 9.1 Claim levels

Provider/model support has two claim levels:

- `technical-chain-ready`: host bridge, Provider request, artifact write, QA execution, and import path can complete;
- `production-art-ready`: an independent human review has approved the exact Provider/model/profile/dataset combination.

Technical success never implies production-art readiness.

### 9.2 Approval registry

Use a versioned registry:

```text
examples/plugins/creator-studio/quality/provider-art-approvals.json
```

Each record contains:

```json
{
  "id": "provider-model-approval-id",
  "provider": "openai-compatible",
  "model": "model-id",
  "qualityProfileId": "pet-generation-calibrated-v1",
  "datasetId": "pet-generation-human-review-v1",
  "decision": "approved",
  "reviewedAt": "2026-07-14T00:00:00.000Z",
  "evidenceRelativePath": "release-evidence/.../approval.json"
}
```

The development branch ships a valid empty registry.

### 9.3 Gate behavior

A production-art-ready claim is returned only when the current Provider, exact model ID, active quality profile ID, and source dataset ID match one approved record with a safe evidence path.

Missing, rejected, malformed, stale, or mismatched records return `technical-chain-ready` with a bounded reason. They do not block ordinary development generation, but UI, smoke summaries, docs, and exported evidence must not call the model production-art-ready.

Approval records do not bypass per-run deterministic QA or human approval of a newly generated pet.

## 10. Data Flow

```text
human review registry (optional)
  -> validated bounded guidance + dataset identity
  -> active quality profile
  -> prompt builders and reference-board metadata
  -> one-reference Provider request
  -> keyframe and row QA bound to profile ID
  -> action checkpoints
  -> action-scoped repair or identity-scoped repair
  -> partial atlas and review artifacts
  -> per-run human approval
  -> Provider promotion lookup for claim wording only
```

The human-example registry influences guidance and calibration. It does not approve generated rows. The Provider approval registry influences support claims. It does not approve a run or bypass import gates.

## 11. Security And Privacy

- Registry and approval paths are data-relative or repository-relative and reject traversal.
- Logs and dashboard responses contain IDs, reason codes, counts, and profile metadata only.
- Raw prompts, raw Provider payloads, API keys, authorization headers, and absolute host paths remain excluded.
- The plugin cannot supply arbitrary threshold objects through the renderer bridge.
- Only validated code-owned or host-approved profile files may affect runtime gates.
- Repair APIs accept bounded run IDs and official action IDs; filesystem targets are resolved by existing host-owned services.

## 12. Compatibility

- Empty human-example and Provider approval registries are valid.
- The immutable default profile preserves current QA behavior.
- Existing complete and partial pet manifests remain valid.
- Existing runs without profile metadata are interpreted as using `pet-generation-default-v1` when read, but new QA artifacts always write explicit profile metadata.
- Existing failed-run retry remains available; the new action retry is the preferred path for one-action failure.
- Existing single-action frame repair remains unchanged.

## 13. Implementation Decomposition

The work is delivered as five ordered subprojects:

1. Single-reference enforcement and multipart simplification.
2. Human-example registry, quality profiles, and QA evidence binding.
3. Prompt/reference-board guidance integration.
4. Action- and identity-scoped repair with checkpoint invalidation.
5. Provider production-art approval registry and bounded claim surfaces.

Each subproject is independently reviewable. The implementation plan will name exact files and interfaces after final source mapping.

## 14. Testing And Acceptance Ownership

The `codex/dev8` implementation task does not run tests, real Provider smoke, or visual acceptance.

After implementation is committed, a separate testing task and branch must:

- add or update automated tests for every new contract;
- run focused Node suites, syntax checks, core regressions, and relevant Control Center tests;
- provide human-approved and human-rejected real image examples;
- calibrate a non-default profile only when evidence supports it;
- exercise action-scoped and identity-scoped repair;
- perform real Provider generation with the single-reference assertion enabled;
- inspect contact sheets, animated previews, cross-row identity, transparency, scale, baseline, and final atlas;
- create a Provider approval record only after human acceptance;
- report defects back without rewriting the development branch's existing history.

Until that testing task succeeds, the implementation may be described as developed but unverified. No production-art-ready claim is permitted.

## 15. Success Criteria

- No host or plugin Provider call can submit more than one reference image.
- Multiple local visual cues are sent only through one composite board.
- Human examples use a validated, versioned, path-safe protocol.
- QA uses one explicit versioned profile and records it in evidence.
- Prompt and board guidance is bounded, action-relevant, and secret-free.
- A failed action can be retried without regenerating unrelated valid actions.
- Identity rejection invalidates all dependent generated artifacts.
- Provider/model production-art claims require an exact machine-readable human approval match.
- Default behavior remains compatible when registries are empty.
- Development branch contains no fabricated visual verdicts and runs no tests for this task.
