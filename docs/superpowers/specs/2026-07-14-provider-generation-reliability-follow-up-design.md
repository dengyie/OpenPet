# Provider Generation Reliability Follow-Up Design

## Status

- Source branch: `codex/dev8`
- Starting commit: `69ed65b5249d3eb776a83c50556c2cdc290fa383`
- Evidence source: independent test branch `codex/dev8-quality-governance-test`, commit `feb92197457e86a85e678fc3a49ec93edd217dc8`
- Development verification rule: do not run tests, builds, Provider calls, browser checks, or visual acceptance on `codex/dev8`
- Claim boundary: implemented changes remain unverified until a new isolated testing task completes

## Problem Statement

The independent quality-governance test task passed all automated suites but could not complete the real full-pet acceptance loop. Three concrete Provider-path failures remain:

1. A real text-to-image action request returned two outputs. The deliverable action gate correctly rejected the result because an action must be one complete Provider-generated sprite sheet.
2. A real `/images/edits` request failed with the generic network error `fetch failed`. The current host bridge treats that message as eligible for a different model, but same-model retry is limited to selected HTTP status codes. A run with only `gpt-image-2` therefore stops after one transient network failure.
3. A later full-pet attempt reached the required `idle` start keyframe, but every candidate failed `identity-descriptor-distance-high` and `raw-score-below-minimum`. The action pipeline sends the raw source frame directly and compares the neutralized generated keyframe to that raw frame, even after a canonical character output has succeeded. For a valid but non-neutral action frame, pose normalization can look like identity drift to the descriptor gate.

The existing quality gates behaved correctly. The fix must improve request determinism, transient recovery, and identity conditioning without weakening thresholds or accepting ambiguous output.

## Approaches Considered

### A. Contract-first reliability and canonical action identity (selected)

- Request exactly one Provider output with `n=1` for generations and edits.
- Preserve fail-closed rejection when a Provider still returns multiple deliverable sheets.
- Retry one `fetch failed` or bounded network transport failure on the same verified model inside the existing two-attempt and total-time budgets.
- Build one local full-pet action identity board with the canonical generated identity as the primary panel and the original source as secondary evidence.
- Use that single board for Provider action calls while comparing keyframe identity against the canonical generated identity.
- Give `idle` explicit minimal-motion semantics instead of the generic reaction/extreme-pose fallback.

This addresses each observed cause at its ownership boundary and preserves all quality gates.

### B. Downstream first-output selection and prompt-only idle changes

Taking the first Provider output would make the action smoke continue, but it cannot distinguish two complete candidates from a multi-frame response and would bypass the deliberate deliverable gate. Prompt-only idle changes also leave QA comparing a normalized neutral pose against a possibly dynamic raw source frame. This approach is rejected.

### C. More Provider attempts or looser identity thresholds

Increasing candidates may increase cost without correcting the request or reference contract. Loosening descriptor or score thresholds would convert a real identity failure signal into accepted output. This approach is rejected.

## Design

### 1. One-output Provider request contract

`src/main/services/image-generation-model-service.js` owns the public Provider request contract.

- Add a fixed requested output count of one.
- Include `n: 1` in JSON `/images/generations` payloads.
- Include multipart field `n=1` in `/images/edits` payloads.
- Record `requestedOutputCount: 1` in bounded conditioning and request logs.
- Continue materializing every returned item for diagnosis; do not silently discard unexpected Provider outputs at this layer.

Deliverable ownership remains in Creator Studio:

- generic single-action delivery continues to require exactly one output;
- the keyframe sprite-row final stage explicitly checks the actual output count and rejects anything other than one;
- Provider stage evidence records the actual count, including failed multi-output responses.

Intermediate keyframe candidates may still contain several outputs because the existing candidate evaluator scores every output from one response. The one-output request is a Provider instruction, not a reason to delete defensive candidate handling.

### 2. Bounded same-model recovery for transport failures

The existing `generateWithModelFallback` loop already limits each model to two attempts and subtracts elapsed time from the model budget.

- Extend its transient predicate to include the exact bridged message `fetch failed` and a bounded set of transport indicators such as connection reset, closed socket, connect timeout, and Undici network error codes.
- Do not retry validation failures, Provider business errors, HTTP 4xx errors other than existing transient statuses, or deterministic QA rejection.
- Preserve the current short retry delay and total workflow deadline.
- Add a sanitized transport cause code to main-process Provider failure logs when Node exposes `error.cause.code`; do not expose raw cause text, URLs, headers, or credentials.

This makes one intermittent edit failure recover inside the same run while retaining bounded cost and time.

### 3. Canonical identity conditioning for full-pet actions

After base full-pet generation succeeds, create one local identity board under the run inputs:

```text
canonical generated identity (primary panel)
+ original validated source (secondary panel when present)
-> full-pet action identity board
-> one Provider reference attachment
```

The board metadata records its role, sources, active profile, and panel authority. No labels are rendered into pixels.

Thread three separate concepts through full-pet action generation:

- `referenceImages`: the single Provider attachment, normally the new identity board;
- `qualityReferenceImages`: the canonical generated identity used by keyframe identity QA;
- identity-board evidence: bounded relative paths recorded on the generation result.

Normal full-pet generation and scoped action repair use the same helper. If no canonical output exists, the pipeline falls back to the existing validated source behavior and remains fail-closed when no usable identity reference exists.

The canonical generated identity does not override the user source. The board retains the source as identity evidence, while the canonical primary panel defines the normalized pose, framing, scale, and appearance that all action rows must share.

### 4. Idle-specific motion contract

Add an explicit `idle` semantic classifier and fixed instructions:

- start keyframe: match the canonical pose, viewpoint, silhouette, scale, markings, and accessories as closely as possible;
- peak keyframe: only subtle breathing, blink, ear, or tail-tip motion;
- frame plan: small loopable changes with no action extreme, large limb movement, camera change, or body redesign;
- prompt wording: do not force front-facing normalization when the canonical identity uses another readable viewpoint.

Other action semantics and all quality thresholds remain unchanged.

## Evidence And Error Handling

Generation evidence should make the new behavior inspectable without leaking secrets:

- requested and actual output counts;
- endpoint and zero/one reference count;
- safe reference roles and relative metadata paths;
- same-model retry attempts and bounded error messages;
- sanitized transport cause code when available;
- full-pet action identity board role and metadata path;
- canonical quality-reference role;
- unchanged quality-profile evidence.

Unexpected multi-output, exhausted network retry, and failed idle identity QA remain explicit failures. None auto-approves or imports a run.

## Out Of Scope

- Changing source-image eligibility or choosing a different default smoke fixture.
- Lowering keyframe, row, atlas, or identity thresholds.
- Accepting the first item from an ambiguous deliverable multi-output response.
- Creating human-approved/rejected examples without real visual review.
- Calibrating a non-default profile on synthetic labels.
- Writing a Provider approval or claiming `production-art-ready`.

## Independent Verification

A new isolated testing branch must add regression coverage and rerun:

- image-generation request payload tests for `n=1` on generations and edits;
- actual multi-output fail-closed tests for deliverable action paths;
- same-model retry tests for bridged `fetch failed` and bounded transport failures;
- full-pet identity-board and canonical QA-reference tests;
- idle prompt and frame-plan tests;
- syntax, core, core-all, Control Center, and focused suites;
- real action and full-pet Provider smoke;
- action and identity repair after a successful full-pet run;
- human contact-sheet, GIF, identity, transparency, scale, baseline, and atlas acceptance.

Until those checks pass, the outcome remains implemented but unverified and technical-chain-ready only.
