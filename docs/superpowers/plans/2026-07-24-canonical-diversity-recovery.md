# Canonical Quality Selection Recovery Implementation Plan

> Updated: 2026-07-25
> Owner: `codex/dev8`
> Status: implementation in progress; supersedes the completed but incorrect three-distinct-candidate recovery plan

## Goal

Make canonical generation continue whenever at least one paid candidate passes the real quality gates, retain every paid asset for review, and fail only when all candidates are unusable.

## Invariants

- Four canonical image dispatches maximum.
- Exactly one local reference image on every image request.
- Duplicate detection never weakens identity thresholds and never converts a quality-passing candidate into a failure.
- Candidate-level deterministic and model visual gates remain immutable.
- One deterministic selected anchor owns every downstream action reference and checkpoint binding.
- Default execution pauses only at final human review; the optional identity checkpoint remains configurable.
- No automatic approval, import, or activation.
- No renderer-visible absolute path, secret, raw prompt body, data URL, or Provider response body.

## Task 1: Candidate/evaluator contract

- [x] Change duplicates from quality failures into separate diversity evidence.
- [x] Preserve `technicalEligible`, duplicate binding, and paid artifacts.
- [x] Evaluate all technically usable candidates, including duplicates.
- [x] Support one through four candidate regions in the review board, validator, tool schema, gate, and evidence persistence.
- [x] Add red-green tests for one and four candidates and duplicate evaluation.

## Task 2: Deterministic anchor selection

- [x] Remove `canonical_candidate_diversity_insufficient` from production code.
- [x] Rank passing candidates by overall score, identity score, then candidate ID.
- [x] Persist `selected-anchor`, `alternate`, `duplicate-alternate`, and `unusable` dispositions.
- [x] Fail only with `canonical_identity_candidates_unusable` when zero candidates pass.
- [x] Prove downstream actions receive only the selected anchor.

## Task 3: Execution state machine

- [x] Make `requireIdentityReviewBeforeActions=false` the normalized default.
- [x] Return the saved checkpoint choice from Hatch Pet planning to the Creator runtime.
- [x] Continue automatically through idle/actions when the checkpoint is disabled.
- [x] Preserve exact hash-bound identity acceptance when explicitly enabled.
- [x] Classify automatic post-selection failures as action failures and retain selected-anchor state.
- [x] Keep retry-identity scoped to canonical evidence and dependent checkpoints.

## Task 4: Diagnostics and UI

- [x] Replace distinct-count failure guidance with candidate-quality guidance.
- [x] Expose candidate disposition and passing count using renderer-safe fields.
- [x] Show selected anchor and paid alternates during final review.
- [x] Explain duplicate alternates without marking them as bad assets.
- [x] Keep unusable assets visible with failure codes and retry guidance.
- [x] Preserve status-aware failure derivation so progress messages are not errors.

## Task 5: Documentation and verification

- [x] Update the canonical generation contract and superseding design.
- [ ] Run `git diff --check`.
- [ ] Run `npm run check:syntax`.
- [ ] Run focused canonical/Creator suites.
- [ ] Run `npm run test:core` and `npm run test:core:all`.
- [ ] Run `npm run test:tools` and repair relevant live-doc truth drift.
- [ ] Perform a production-grade deep review and fix every confirmed finding.
- [ ] Commit the verified implementation on `codex/dev8`.

## Independent visual verification

The code task must not claim production art readiness. A separate isolated test task must run the real Provider path, confirm exactly one reference and `n=1`, inspect all retained canonical assets, verify the selected anchor, review action contact sheets/GIF/atlas, exercise identity/action retry, and perform explicit human approval/import/activation.
