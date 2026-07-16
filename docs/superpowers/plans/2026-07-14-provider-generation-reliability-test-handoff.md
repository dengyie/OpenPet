# Provider Generation Reliability Independent Test Handoff

> Source branch: `codex/dev8`
> Required implementation ancestor: `c6dae41dfc81883794432c66963b9d072973b7f1`
> Testing branch: `codex/dev8-provider-reliability-test` in a new isolated worktree
> Development status: implemented but unverified

## Isolation And Starting State

Create a new Codex testing task and an isolated worktree bound to `codex/dev8-provider-reliability-test`. Base it on the final `codex/dev8` HEAD that contains this handoff document. The required implementation commit above must be an ancestor of the testing branch.

Do not modify, reset, rewrite, rebase, merge into, push, clean, or switch `codex/dev8`. Do not modify or reuse `codex/dev8-quality-governance-test`. Do not touch the primary worktree or any other development/testing worktree. All tests, fixtures, Provider calls, evidence, test-only fixes, human labels, calibrated profiles, and approval records belong only to the new testing branch.

Before any change, report:

```bash
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
git rev-parse HEAD
git merge-base --is-ancestor c6dae41dfc81883794432c66963b9d072973b7f1 HEAD
git worktree list --porcelain
```

Continue only when the worktree is isolated, the branch is `codex/dev8-provider-reliability-test`, the implementation ancestor check succeeds, and the worktree is clean. If Codex creates the worktree at a detached HEAD, switch only that new worktree to the pre-created testing branch before continuing.

## Background And Objective

The preceding independent quality-governance task passed its automated suites but could not close real Provider acceptance:

1. `gpt-image-2` returned two outputs for a deliverable action request; the delivery gate correctly rejected the ambiguous response.
2. A full-pet image edit intermittently failed with `fetch failed`.
3. A later full-pet retry reached the required `idle` start keyframe, but candidate QA rejected it with `identity-descriptor-distance-high` and `raw-score-below-minimum`.

Independently verify the reliability follow-up without relying on development-task conversation:

- JSON generations and multipart edits request exactly one Provider output with `n=1`.
- Actual zero/multi-output deliverable responses remain fail-closed and are never silently truncated to the first output.
- One transient `fetch failed` or supported bounded transport failure retries on the same model within the existing attempt and deadline budgets.
- Normal full-pet generation and scoped repair build one canonical full-pet action identity board, send at most one Provider reference attachment, and compare keyframe QA against the canonical generated identity.
- `idle` uses minimal-motion semantics and prompt schema v4 without lowering identity or quality thresholds.

## Automated Test Work

Add or update focused tests for:

- generation payload `n: 1`, multipart edit field `n=1`, conditioning/log `requestedOutputCount`, and sanitized transport cause codes;
- materialization of all actual Provider outputs and rejection of zero or multiple deliverable action/sprite-row outputs;
- same-model retry for `fetch failed`, connection reset, closed socket, `ECONNRESET`, `ECONNREFUSED`, `EPIPE`, `ETIMEDOUT`, `UND_ERR_CONNECT_TIMEOUT`, and `UND_ERR_SOCKET`;
- unchanged retry count, retry delay, deadline accounting, fallback behavior, and final failure evidence;
- full-pet action identity-board construction in normal generation and scoped repair;
- Provider reference attachment count of zero or one, canonical-primary/original-secondary board roles, bounded data-relative evidence, and no absolute-path exposure;
- separate canonical `qualityReferenceImages` for start and peak keyframe QA;
- rejection of multiple canonical base outputs;
- `isIdleAction`, stationary-loop inference, fixed minimal moving parts, one/two/multi-frame idle plans, canonical start pose, minimal peak pose, and non-idle behavior preservation;
- prompt schema v4, full-pet identity-board authority wording, idle start/peak wording, and conditioning-board wording;
- documentation and smoke-summary contracts affected by the new behavior.

Do not weaken thresholds, delivery gates, reference-image limits, human-review gates, approval gates, or production code merely to satisfy tests. Never commit credentials, authorization headers, raw Provider payloads, unsafe host paths, or fabricated human judgments.

## Required Verification Commands

Run and record the exact command, exit status, and failure output for:

```bash
npm run check:syntax
npm run test:core
npm run test:core:all
npm run test:control-center
```

Also run focused suites covering at least:

```bash
node --test \
  tests/services/image-generation-model-service.test.js \
  tests/examples/creator-studio-host-model-bridge.test.js \
  tests/examples/creator-studio-action-semantics.test.js \
  tests/examples/creator-studio-anchor-prompt-builder.test.js \
  tests/examples/creator-studio-anchor-reference-board.test.js \
  tests/docs/live-docs-creator-studio.test.js \
  tests/docs/live-docs-project-context.test.js
```

Adjust the focused list only when a named test file does not exist; report the replacement suite. Run any additional action QA, row QA, atlas, repair, workflow, IPC, and smoke-summary tests that exercise the changed paths. Resolve focused failures before rerunning broad suites.

## Real Provider Verification

Use real Provider credentials only through the host-owned configuration boundary. Never echo or commit secrets.

Run real smoke for both an action request and a normal full-pet request. Evidence must show:

- Provider, model, active quality profile, and dataset identifiers;
- request endpoint and requested output count `n=1`;
- actual returned output count;
- zero or one reference attachment per request;
- multipart edits use `image`, never `image[]`;
- a transient transport retry, if naturally encountered or safely injected by the test harness, remains on the same model and stays inside the existing budgets;
- ambiguous multi-output deliverables are still rejected rather than truncated.

Obtain at least one successful full-pet run that reaches `ready_for_review` with the required `idle` row. Do not lower quality thresholds, skip keyframe QA, replace Provider-authored motion with transforms, or mark a failed run successful.

After that successful full-pet run:

1. exercise a real supported action repair and verify only the selected action scope is regenerated while other hash-valid rows are reused;
2. exercise a real identity repair and verify canonical identity plus all action checkpoints are invalidated and regenerated;
3. confirm both repair scopes archive prior evidence and stop at `ready_for_review` or `failed` without auto-approval, import, or activation.

## Human Review, Calibration, And Provider Approval

Create human-approved and human-rejected registry records only after visually inspecting real generated artifacts. Use safe data-relative evidence paths and fixed reason codes. Do not invent labels to make tests, calibration, or claim gates pass.

Calibrate a non-default quality profile only if real reviewed labels and recorded metrics support it. Bind the profile to the exact real dataset and a safe review-evidence path, compare it against `pet-generation-default-v1`, and do not silently replace the default.

Human acceptance must inspect:

- source image beside canonical generated identity;
- every available action contact sheet;
- every available animated preview or GIF;
- canonical-to-action and cross-row identity, markings, and accessories;
- idle minimal motion, action semantics, direction, and loop quality;
- transparent-background cleanliness and edge contact;
- desktop-scale readability, centroid, scale, and baseline stability;
- final atlas dimensions, row placement, visible used cells, and fully transparent unused cells.

Add a Provider art approval only after all automated checks, real Provider flows, repair exercises, and human acceptance pass for the exact Provider, every successful model including fallback/reused models, active profile, and human dataset. Re-run focused claim tests and smoke summary after adding approval. Provider approval may change only `artReadiness`; it must not set per-run `artisticApproval`, approve a run, import a package, or activate a pet.

Until this full closure succeeds, keep approval registries unchanged, report `technical-chain-ready` or the applicable fail-closed reason, and do not claim `production-art-ready`.

## Result And Branch Rules

Keep testing changes and any necessary fixes in focused commits on `codex/dev8-provider-reliability-test`. Do not merge or push unless the user explicitly requests it. Do not rewrite the development commits.

Report:

- testing branch, starting commit, and ancestor check;
- commits created only on the testing branch;
- every verification command and result;
- real Provider/model/profile/dataset identifiers without secrets;
- request `n=1`, actual output-count, endpoint, and zero/one-reference evidence;
- transient retry behavior and exhausted-retry behavior;
- successful full-pet run ID and required `idle` outcome;
- action-repair and identity-repair outcomes;
- real human-approved/rejected example IDs and evidence paths, if legitimately created;
- profile calibration evidence, if legitimately supported;
- contact-sheet, GIF, identity, transparency, scale, baseline, and atlas review findings;
- whether Provider approval and `production-art-ready` are justified, with exact approval record IDs if they exist;
- a final pass/fail decision and every unresolved defect.

Until every required automated, Provider, repair, and human check passes, report the development result as implemented but unverified.
