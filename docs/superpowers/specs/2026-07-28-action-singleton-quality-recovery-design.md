# Action Singleton Quality Recovery Design

> Date: 2026-07-28
> Owner: `codex/dev8`
> Status: approved for implementation; automated verification pending

## 1. Problem

The quality-first action runner currently requires two perceptually distinct generated candidates before it processes or evaluates either candidate. A paid, visually usable action sheet can therefore be rejected with `action_candidate_diversity_insufficient` without ever entering deterministic processing or the visual quality gate.

The production action generator also ignores the runner's `attemptKind`, `dispatchIndex`, and `failureCodes`. Initial, duplicate-replacement, and repair attempts consequently compile the same prompt even though the runner expects different creative strategies.

## 2. Product contract

- Candidate quality and candidate diversity are independent signals.
- Every generated candidate with complete image descriptors enters deterministic processing and visual evaluation, including perceptual duplicates.
- One candidate passing deterministic QA and the code-owned visual gate is sufficient to continue the action pipeline.
- Passing candidates are ranked by the existing deterministic candidate selector.
- Fewer than two distinct candidates records `action_candidate_diversity_insufficient` as a non-blocking warning; it is not an action failure by itself.
- The action fails only when no generated candidate passes. Existing `idle` blocking and optional-action omission behavior remains unchanged for genuine quality failure.
- Provider responses containing multiple outputs remain fail-closed. The pipeline must retain all paid files as evidence and must not silently select the first output.
- Duplicate-replacement and reason-directed repair attempts must compile bounded, identity-safe requested changes and persist their strategy ID in prompt provenance.
- Existing QA, identity, layout, scale, anchor, semantic, transparency, and evaluator thresholds remain unchanged.
- A retry of an old `idle` diversity failure reloads hash-verified retained candidates before generating another image. When one passes, the runtime reconstructs the missing scale profile and resumes every remaining planned action rather than finalizing an idle-only package.

## 3. Data flow

```text
generate two initial candidates
  -> when fewer than two are distinct, generate one diversity replacement
  -> process and evaluate every descriptor-complete generated candidate
  -> one or more pass
     -> select the best passing candidate
     -> continue with diversity warning when fewer than two are distinct
  -> none pass
     -> generate one reason-directed repair candidate
     -> process and evaluate it
     -> pass: continue
     -> fail: block idle or omit optional action
```

Duplicate candidates remain retained paid assets and may be selected if they independently pass the quality gates. A duplicate binding is evidence about comparison breadth, not proof that the image itself is bad.

## 4. Prompt strategies

Action dispatches use fixed strategy identifiers:

1. `identity-strict-motion-v1`: strongest identity-lock ordering.
2. `motion-clarity-identity-locked-v1`: clearer silhouette and ordered motion while repeating all identity locks.
3. `identity-safe-action-alternate-v1`: duplicate replacement with a visibly different but action-correct pose realization, unchanged identity, viewpoint, grid, and style.
4. `reason-directed-action-repair-v1`: bounded corrections derived only from registered QA/evaluator failure codes.

Unknown failure codes do not enter the prompt. They remain diagnostic evidence only.

## 5. Diagnostics

Successful singleton selection returns:

- `ok=true` and the selected candidate;
- `diversityStatus=degraded`;
- warning code `action_candidate_diversity_insufficient`;
- `distinctCandidateCount` and `evaluatedCandidateCount`.

Normal two-candidate comparison returns `diversityStatus=sufficient` with no diversity warning. A failed action retains the same counts so Create can explain whether the failure came from generation, processing, evaluation, or limited comparison breadth.

## 6. Verification requirements

Automated tests must prove:

1. one distinct candidate plus a duplicate can still continue when one passes;
2. duplicate candidates enter processing and evaluation rather than being discarded;
3. zero passing candidates still trigger the bounded repair path and fail closed when repair fails;
4. initial, duplicate-replacement, and repair dispatches compile different bounded strategies;
5. multiple Provider outputs remain rejected without selecting the first;
6. diagnostics distinguish degraded diversity from quality failure;
7. existing distinct-candidate selection, processing failure, Provider failure, archive, and optional-action behavior remain covered.
