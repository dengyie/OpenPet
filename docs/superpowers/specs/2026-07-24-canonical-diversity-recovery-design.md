# Canonical Quality Selection Recovery Design

> Date: 2026-07-25
> Owner: `codex/dev8`
> Status: supersedes the 2026-07-24 distinct-candidate hard-gate design; implementation under repository verification; real Provider and visual verification pending

## 1. Problem

Run `2026-07-24-pet` completed four paid canonical image calls, but two outputs were perceptually similar. The old orchestration treated diversity as a global eligibility requirement and failed with `canonical_candidate_diversity_insufficient`, even though at least one retained candidate could have passed the actual identity and visual quality gates. This converted useful paid output into a terminal failure and prevented action generation.

The same old design also forced `requireIdentityReviewBeforeActions=true` during config normalization, contradicting the configured default of one final human approval step.

## 2. Product contract

- Candidate quality and candidate diversity are independent signals.
- A perceptual duplicate remains a paid candidate and may still pass every quality gate.
- At least one candidate passing deterministic QA and the code-owned visual gate is sufficient.
- Passing candidates are ranked deterministically by evaluator overall score, evaluator identity score, then stable candidate ID.
- Exactly one candidate receives disposition `selected-anchor`.
- Other passing candidates receive `alternate` or `duplicate-alternate`.
- Failed candidates receive `unusable` with bounded failure codes.
- All downstream action generation, scale profiles, checkpoints, package artifacts, and hashes bind only to the selected anchor.
- The run fails only when no candidate passes, using `canonical_identity_candidates_unusable`.
- Default behavior continues automatically to action generation. `awaiting_identity_review` exists only when `requireIdentityReviewBeforeActions=true` was explicitly saved.
- Final artistic approval, import, and activation remain human actions.

## 3. Generation and evaluation

The first three dispatches use:

1. `identity-faithful-balanced-v1`
2. `silhouette-readability-v1`
3. `small-scale-detail-v1`

A fourth dispatch may use `identity-safe-alternate-neutral-v1` when a prior result is duplicate or technically unusable. Four remains the paid-dispatch ceiling.

Duplicate detection records `duplicateOfCandidateId`, `duplicateOfSha256`, and `diversityStatus=duplicate`. It must not add a quality failure code or set `eligible=false`.

Every technically usable candidate, including duplicates, enters one 3072x2048 review board with the source image. The board and structured evaluator accept one through four candidate regions. Code applies the immutable canonical thresholds separately to each candidate. The model's overall recommendation never overrides candidate gates.

## 4. State transitions

```text
generate 3-4 canonical candidates
  -> evaluate every technically usable candidate
  -> one or more pass
     -> deterministic selected-anchor
     -> optional awaiting_identity_review when configured
     -> idle and remaining action generation
     -> ready_for_review
  -> none pass
     -> failed + identity-generation-failed
     -> canonical_identity_candidates_unusable
     -> retry-identity archives old evidence and regenerates canonical only
```

An automatic post-selection action failure is logged and displayed as an action failure, not as identity generation failure. Durable intermediate state preserves the selected anchor and completed action checkpoints.

## 5. Renderer-safe evidence

Public candidate views may contain:

- candidate ID, exact SHA-256, score, model;
- `technicalEligible`, `eligible`, and disposition;
- safe run-relative image, prompt-record, candidate-record, and evaluation-evidence paths;
- bounded failure codes and duplicate binding;
- bounded evaluator and deterministic metrics.

They must not contain absolute paths, data URLs, raw prompt bodies, credentials, Provider payloads, or unbounded errors.

Create shows the selected anchor, alternates, duplicate alternates, and unusable paid assets. Duplicates are explained as retained alternatives rather than displayed as bad assets. When no candidate passes, the UI explains the quality-gate failure and offers identity retry.

## 6. Retry and authority

Identity retry archives canonical candidates, prompts, evaluations, package evidence, scale profiles, and dependent checkpoints. It preserves the source image and confirmed sprite plan, invalidates dependent action checkpoints, and regenerates canonical only.

When the optional identity checkpoint is disabled, retry deterministically selects the best new passing candidate and continues. When enabled, it pauses at `awaiting_identity_review` and requires exact candidate ID plus SHA-256 acceptance.

No automatic step grants artistic approval, imports the pet, or activates it.

## 7. Verification requirements

Automated tests must prove:

1. duplicate candidates remain quality-eligible and retained;
2. review boards and structured tools support one through four candidates;
3. one passing candidate continues;
4. multiple passing candidates produce a deterministic winner;
5. no passing candidates produce only `canonical_identity_candidates_unusable`;
6. downstream actions receive only the selected anchor;
7. automatic action failures retain selected-anchor state and are classified correctly;
8. the identity-review setting defaults false and preserves explicit true;
9. renderer diagnostics expose dispositions without unsafe data;
10. identity retry preserves plan/source and archives prior paid evidence.

Repository automation is necessary but does not prove visual quality. A separate test task must perform real Provider requests, selected-anchor inspection, action contact-sheet/GIF/atlas review, retry rehearsal, final human approval, import, and activation.
