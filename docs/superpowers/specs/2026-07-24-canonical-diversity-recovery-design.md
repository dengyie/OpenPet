# Canonical Diversity Recovery Design

> Date: 2026-07-24
> Owner: `codex/dev8`
> Status: approved design, implementation pending

## 1. Problem

Run `2026-07-24-pet` generated four paid canonical images successfully. Every image request used one reference, requested one output, returned HTTP 200, and persisted its artifact. The pool nevertheless contained only two distinct eligible candidates because `canonical-2` and `canonical-4` matched an earlier candidate under the existing perceptual duplicate contract.

The fourth dispatch was intended to replace a duplicate, but the current modulo selection reused the first dispatch's `identity-faithful-balanced-v1` strategy and identical upstream prompt. The Create UI also treated the running backend message `Generating canonical identity candidates` as a failure reason, and a failed pool did not expose its retained candidate assets or identity retry action.

## 2. Goals

- Preserve the quality-first requirement of three distinct eligible canonical candidates.
- Preserve the four-dispatch paid-image ceiling.
- Make the fourth dispatch an explicit identity-safe duplicate replacement instead of repeating an earlier prompt.
- Retain and expose every paid candidate, including duplicates and technical failures.
- Show an actionable identity-failure state with a one-click identity retry.
- Never label an ordinary running backend message as a failure reason.

## 3. Non-goals

- Do not lower perceptual, identity, alpha-mask, or mean-color duplicate thresholds.
- Do not accept a two-candidate pool.
- Do not increase the canonical dispatch budget beyond four.
- Do not auto-select identity, grant artistic approval, import, or activate a pet.
- Do not inspect image quality in the main development task.

## 4. Candidate strategy contract

The first three dispatches keep their registered strategies:

1. `identity-faithful-balanced-v1`
2. `silhouette-readability-v1`
3. `small-scale-detail-v1`

If fewer than three distinct eligible candidates remain, dispatch four uses `identity-safe-alternate-neutral-v1` with `attemptKind=duplicate-replacement`.

Its Provider-neutral visible request must:

- preserve the exact referenced identity, proportions, markings, accessories, palette, medium, and subject lighting;
- keep one complete full-body character at the existing scale, padding, root, canvas, and background contract;
- ask for a visibly different but calm neutral presentation through small source-compatible limb separation, a subtle natural head angle, and a readable silhouette;
- forbid action gestures, expression redesign, camera/viewpoint changes that hide identity features, new anatomy, new accessories, and style changes.

The replacement strategy is code-owned. Planner prose, failure text, candidate IDs, and internal OpenPet terms do not reach the image Provider.

## 5. Failed-pool persistence

`assertCanonicalPool` continues to fail closed when fewer than three distinct eligible candidates exist. Before throwing, it attaches a bounded public candidate-pool snapshot to the error. The backend persists this snapshot in `run.qualityFirst`:

```json
{
  "version": 1,
  "phase": "identity-generation-failed",
  "canonicalCandidates": [],
  "nextAction": "retry-identity",
  "failureCode": "canonical_candidate_diversity_insufficient"
}
```

The snapshot contains only safe relative artifact paths, candidate IDs, eligibility, exact content hashes, model names, scores, duplicate bindings, and bounded failure codes. It contains no absolute path, data URL, prompt body, credential, or Provider response body.

The existing identity retry command remains the only regeneration path. It archives the prior run evidence before generating a new candidate pool.

## 6. Create diagnostics and UI

Failure reason derivation is status-aware:

- `artifacts.generatedImage.failure.message` and `run.error` remain failures;
- `backendStatus.message` is a failure reason only when `run.status=failed` or `backendStatus.state=failed`;
- while generating, the same backend message is progress text only.

`createQualityFirstIdentityReviewView` supports both `awaiting_identity_review` and `identity-generation-failed`. The failed phase renders the retained candidate cards, marks duplicates and technical failures red, disables acceptance, explains the distinct count, and presents `重新生成身份候选`.

The visible failure explanation is human-readable and includes the achieved and required distinct counts. The raw stable failure code remains available in diagnostics.

## 7. State transitions

```text
generating canonical candidates
  -> 3 distinct eligible
     -> awaiting_identity_review
  -> fewer than 3 after 4 dispatches
     -> failed + identity-generation-failed
     -> user retry-identity
     -> archive previous paid evidence
     -> generating canonical candidates
```

No failed candidate is silently deleted, accepted, imported, or substituted.

## 8. Tests

Automated regression coverage must prove:

1. dispatch four uses `duplicate-replacement` and `identity-safe-alternate-neutral-v1` rather than repeating dispatch one;
2. the replacement prompt contains a visible alternate-neutral instruction and retains all identity/background/output constraints;
3. a pool with only two distinct candidates still fails closed;
4. the thrown failure carries a bounded retained-candidate snapshot;
5. the backend persists `identity-generation-failed` while retaining candidate metadata;
6. diagnostics do not expose absolute paths, prompt bodies, or data URLs;
7. a running backend message never becomes `failureReason`;
8. a failed backend message does become `failureReason`;
9. Create renders failed identity assets and the identity retry button while keeping acceptance disabled;
10. existing successful identity review and exact-hash acceptance remain unchanged.

## 9. Acceptance criteria

- No quality threshold or paid-dispatch ceiling is weakened.
- The real failure mode has an automated red-green regression.
- Failed paid identity assets are visible and actionable in Create.
- Retry preserves and archives the previous evidence.
- Focused suites, syntax/type/build checks, `test:core`, and `test:core:all` pass before integration.
- Real Provider and visual acceptance remain a separate verification step.
