# Pet Character And Action Generation

> Updated: 2026-07-25
> Owner: `codex/dev8`
> Status: quality-first replacement implemented; focused development checks passed; independent Provider and visual verification pending

This document is the current implementation contract for generating an OpenPet character and its official actions from one user reference image. It replaces the former keyframe-parent full-pet workflow documentation.

## 1. Product outcome

The normal Create flow produces:

- one source-faithful canonical character selected deterministically from candidates that pass the immutable quality gates, with an optional pre-action human identity checkpoint;
- a required `idle` action and any optional actions that independently pass unchanged quality gates;
- retained raw, processed, prompt, evaluator, contact-sheet, GIF, checkpoint, and package evidence;
- a partial or complete official atlas that never substitutes copied idle art for a failed action;
- explicit review, import, and activation boundaries.

Visual quality and identity consistency take priority over latency and cost. Automated code and model evaluation may reject or request repair, but may not grant artistic approval, import a pack, activate a pack, or weaken a threshold.

Official-quality output requires a source-faithful canonical character plus action-specific Provider generation. Base-image transforms or transform-only frames are preview fallbacks, not official-quality action rows.

This branch does not claim `production-art-ready`. Real Provider requests, visual inspection, optional identity-checkpoint rehearsal, GIF/contact-sheet/atlas review, and final import/activation checks belong to the independent test task.

## 2. Production state machine

```text
source image
  -> validate and copy into host-owned run storage
  -> Hatch Pet structured sprite plan
  -> canonical candidate pool
  -> deterministic candidate QA
  -> one canonical comparison evaluator board
  -> code-owned per-candidate visual gates
  -> deterministic unique canonical anchor selection
  -> optional awaiting_identity_review when requireIdentityReviewBeforeActions=true
  -> idle candidate pool
  -> lock character scale profile
  -> remaining action candidate pools
  -> deterministic running-left mirror
  -> package/atlas QA
  -> fixed source/canonical/contact-sheet/atlas evaluator board
  -> code-owned final-package visual gate
  -> ready_for_review
  -> explicit human approval
  -> explicit import
  -> optional activation
```

Public Create states include:

- `generating`: planning, candidate generation, processing, evaluation, or packaging is active;
- `awaiting-identity-review`: optional configured checkpoint; canonical candidates are visible and no action request has started;
- `recovery-required`: required idle failed; paid assets are retained but no runnable pet may be imported;
- `review-required`: the accepted action/package result is ready for human review;
- `completed`: an explicit import completed.

The Create pane polls durable run/checkpoint state during identity acceptance and repairs. It shows stage, current action, candidate counts, pass/fail/omitted state, reason codes, retained assets, prompt evidence, and the next legal user action.

### 2.1 Generation readiness gate

Before a full-pet run is drafted, the Host must establish both of these independent prerequisites:

1. the configured image Provider is healthy and has an eligible image model;
2. Hatch Pet Agent is enabled, has an effective saved key and model, and passes the bounded structured-tool capability probe.

Static Hatch Pet readiness is exposed to Create using only `ok`, `code`, `message`, `enabled`, `configSource`, `provider`, and `model`. The renderer uses the same snapshot to disable Generate Character and names the exact AI settings destination. The Host repeats the check authoritatively on click; renderer state is never trusted as permission to start.

If either Hatch Pet check fails, the workflow returns `hatch-pet-not-ready` before `draft-task`. It must not create or confirm a run, dispatch an image request, consume a reference token, or report the failure as human review. A capability failure is a generation preflight failure and tells the user to repair the Agent configuration before retrying.

The structured-tool capability probe allows 60 seconds per call. A timeout, transport interruption, HTTP 408, or Provider 5xx response receives at most one immediate retry with the same configured model and the same request contract. Other 4xx responses and structurally valid `supported=false` results are not retried. Both attempts failing remains an explicit preflight failure.

This gate applies to the quality-first full-pet path because its planner and evaluators are required dependencies. The separate legacy single-action path does not call those components and remains available when Hatch Pet Agent is disabled. No path auto-enables the Agent or silently changes the user's model configuration.

## 3. Entry-point cutover

All production full-pet entry points stamp or require `pipeline: quality-first-v1`:

- Create → New Character;
- conversational Creator Studio full-pet drafting;
- `run-step` for Provider-backed full-pet runs;
- optional `accept-identity` when the saved Hatch Pet setting requires a pre-action identity checkpoint;
- `retry-identity`;
- `retry-action`;
- Creator Studio dashboard identity/action repair routes.

A Provider-backed full-pet run that requests `legacy-keyframe-v1` fails with `legacy_full_pet_pipeline_removed`. The former separate action start/peak keyframe chain and direct raw 1xN row chain are not legal production full-pet paths. The existing single-action feature retains its dedicated legacy implementation and is not part of this full-pet cutover.

## 4. Non-negotiable Provider contract

The workflow accepts exactly one source image. Every creative image request:

1. uses `/images/edits`;
2. carries exactly one validated local reference image;
3. uses the multipart field `image`, never `image[]`;
4. requests `n=1`;
5. fails closed on zero or multiple returned outputs;
6. writes every returned paid output before downstream validation;
7. uses a Provider-neutral prompt compiled from typed code-owned fields.

Each request therefore carries at most one image attachment. When several visual cues are needed, code must compose them into one local composite reference board before the request; it must not send multiple attachments.

The upstream prompt contains no OpenPet terminology, run/action IDs, internal reference roles, filesystem paths, credentials, transport instructions, or unrestricted planner prose. It describes only:

- the requested canvas and invisible grid;
- the visible character and attached reference board;
- ordered frame poses expanded from a registered motion preset;
- fixed identity, scale, anchor, and continuity requirements;
- visible exclusions such as text, borders, scenery, floor, and cast shadow.

Planner-authored free text never reaches the image Provider.

## 5. Planning and budgets

The Hatch Pet model proposes a strict plan. Code accepts only registered:

- character morphology classes;
- official action IDs;
- motion preset IDs;
- bounded `intensity` and `leadSide` values;
- fixed layouts and frame counts.

Code expands each preset into the complete immutable frame plan and hashes it. Unknown fields, free-form poses, wrong frame counts, unknown actions, and invalid layouts are rejected.

The production planner must return the complete generated-action set (`idle`, `running-right`, `waving`, `jumping`, `failed`, `waiting`, `running`, and `review`) exactly once. `running-left` remains code-derived and is never a planner or Provider job.

Default worst-case limits are:

```text
creative dispatches             36
Provider HTTP calls             72
planner calls                   34
evaluator calls                 68
internal elapsed budget         43,200,000 ms (12 hours)
command watchdog                43,500,000 ms
same-model transport retry      at most one within the operation deadline
```

Planner, evaluator, and image Provider HTTP usage is host-owned and persisted under `runs/<runId>/budgets/ledger.json`. Every image bridge call reserves before dispatch and records success or failure afterward, so a same-model 524/transport retry consumes a second Provider-call slot. The Create diagnostics expose only sanitized limits, usage, failures, and remaining counts; plugin-supplied ledgers are not trusted.

Sprite visual evaluation allows 120 seconds per model call because its single review board may be several megabytes. `maxEvaluationAttemptsPerArtifact` is the total call limit for one artifact (default 2, configurable from 1 through 3). Within that limit, a timeout, transport interruption, HTTP 408, or Provider 5xx response may retry with the same model and unchanged request; every attempt consumes an evaluator-call slot. Invalid structured output still receives at most one repair request, even when the artifact limit is 3. Non-transient 4xx responses are never retried, and exhausting the attempt limit fails closed without weakening the visual gate.

## 6. Canonical identity pool

Canonical generation makes three initial paid dispatches and permits a fourth dispatch when the initial pool contains a duplicate or technical generation failure. Registered diversity strategies may emphasize balanced fidelity, silhouette readability, or small-scale detail, but may not change identity, viewpoint, proportions, palette, accessories, or rendering medium.

The first three dispatches use the registered balanced-fidelity, silhouette-readability, and small-scale-detail strategies. If those calls produce fewer than three distinct eligible candidates, dispatch four is an explicit `duplicate-replacement` using `identity-safe-alternate-neutral-v1`; it requests a visibly different calm neutral presentation through small source-compatible limb separation and a subtle natural head angle while preserving identity, proportions, markings, accessories, view, palette, lighting, and rendering style. It is not allowed to repeat the first prompt, introduce an action gesture, or weaken the duplicate gate.

Candidate distinctness uses actual image content as ranking and review evidence:

- 64-bit perceptual hash;
- 8x8 alpha-mask descriptor;
- normalized silhouette/centroid and three-band color identity descriptor;
- mean-color descriptor.

Encoded-file hashes or candidate names are not used as visual proxies. Perceptually duplicate outputs remain retained as paid evidence. A duplicate is not automatically a bad asset and does not lose quality eligibility merely because its presentation resembles another candidate.

Every technically usable paid candidate, including duplicates, is composed with the source into one fixed 3072x2048 canonical comparison board. The board supports one through four candidate regions. The evaluator returns one strict score record per candidate region. Code independently reapplies identity, silhouette, small-scale, completeness, style, confidence, and overall thresholds to each candidate. An overall model recommendation cannot turn a failing candidate into a passing candidate.

At least one candidate passing all candidate-level quality gates is sufficient. Passing candidates are ranked deterministically by overall score, then identity score, then stable candidate ID. The winner becomes the unique `selected-anchor`; other passing candidates remain `alternate` or `duplicate-alternate`, and failed candidates remain `unusable`. All downstream anchor grids, action reference boards, checkpoints, package hashes, and action Provider requests bind only to that selected anchor.

Only when no candidate passes does the run fail closed with `canonical_identity_candidates_unusable` and phase `identity-generation-failed`. Create exposes every retained paid candidate, its safe relative asset path, disposition, duplicate binding, evaluator evidence, and failure codes. The next legal recovery action is `retry-identity`, which archives the existing evidence before generating a new pool. A running backend progress message is never presented as a failure reason.

By default `requireIdentityReviewBeforeActions=false`, so the selected anchor immediately continues into `idle` and the only mandatory human art boundary is the final review. When the setting is explicitly enabled, the run enters `awaiting_identity_review` and exact `runId + candidateId + sha256` acceptance is required before action generation.

Candidate cards show:

- 128-pixel preview access;
- candidate ID and exact sha256 binding;
- eligibility, score, model, and failure codes;
- safe relative evidence paths.

No action Provider request is legal before deterministic selection or, when configured, exact human identity acceptance.

## 7. Action generation

After canonical selection (and optional identity acceptance), `idle` runs first. Every action uses:

- one 1536x1024 action reference board containing the repeated canonical anchor grid and source detail;
- a square 1024x1024 Provider canvas;
- a fixed invisible multi-row layout;
- two strategy-distinct initial candidate requests;
- at most one duplicate replacement;
- at most one reason-directed repair candidate.

Candidate generation, deterministic processing, code QA, visual evaluation, and persistence are isolated steps. Processing or evaluation failure on one candidate does not hide that candidate or prevent comparison with the other candidate. Perceptual duplicates remain paid candidates and still enter processing and evaluation; diversity is comparison evidence, not a quality failure.

The selected action candidate must pass both deterministic QA and the code-owned evaluator gate. Selection uses evaluator overall score, then identity distance, then a stable candidate ID tie-breaker. At least one passing candidate is sufficient. When fewer than two candidates are perceptually distinct, the accepted result records `diversityStatus=degraded` and warning `action_candidate_diversity_insufficient`, but continues without weakening any quality threshold. Failed paid action candidates remain visible; an optional action may be omitted, but a low-quality candidate must never be relabeled as passed.

An action retry following the former diversity hard gate reloads hash-verified retained candidate records and evaluates those paid raw sheets before issuing another image request. If the recovered `idle` candidate passes before a scale profile exists, the runtime reconstructs and persists `character-scale-profile.json`, reuses the new idle checkpoint, and resumes the remaining planned actions before final package generation.

`running-right` and `running-left` form an atomic pair. `running-left` is never generated independently: it is a deterministic framewise horizontal mirror of an accepted `running-right` result, receives its own checkpoint and official-row QA, and is invalidated whenever `running-right` is repaired. The workflow does not issue a separate Provider request for `running-left`.

## 8. Processing, scale, and package geometry

Raw Provider grids are split exactly according to the plan. The processor:

- thresholds alpha;
- performs reference-guided connected-component selection;
- records unmatched components before cleanup;
- rejects contamination, empty/used-cell mismatch, edge touch, or paste clamping;
- computes morphology-aware thickness, occupancy, centroid, root, trajectory, and scale metrics;
- applies one sheet-level scale and deterministic anchor policy;
- emits frames, processed sheet, contact sheet, GIF, metadata, and hashes.

Quality-first processing uses 128x128 normalized intermediate frames. Packaging places those frames into the unchanged official runtime cells without per-frame rescaling:

```text
atlas                       1536x1872
grid                        8 columns x 9 rows
runtime cell                192x208
normalized character frame  128x128, deterministic placement
unused cells                fully transparent
```

The accepted idle result locks `character-scale-profile.json`. All later compatible actions bind to the plan hash, canonical hash, scale-profile hash, processor version, and quality-profile hash.

Finalization first builds the real atlas and deterministic contact-sheet/GIF evidence. It then composes one fixed 2048x1536 review board containing source identity, accepted canonical identity, action contact sheet, and final atlas. The Hatch Pet evaluator scores the `final-package` schema, and code reapplies immutable package thresholds. A missing package, failed atlas QA, failed package visual gate, unsafe evidence path, or incomplete idle checkpoint fails closed before approval.

After that gate passes, quality-first finalization publishes the existing import contract without a compatibility bypass:

- `run.artifacts.outputDir`;
- `run.artifacts.petJson`;
- `run.artifacts.spritesheet`;
- `run.artifacts.bundle`;
- `run.artifacts.qa` and `run.artifacts.sourceImageQa`;
- canonical `run.artifacts.generatedImage` provenance whose source path and hash match the source-QA evidence.

`approve-run` and `import-approved-pet` therefore continue to enforce atlas dimensions, visible pixels, source and atlas hashes, required idle coverage, manifest presence, and pack inspection.

## 9. Official actions and partial results

| Row | Action | Frames | Policy |
| ---: | --- | ---: | --- |
| 0 | `idle` | 6 | required |
| 1 | `running-right` | 8 | optional; source of mirror |
| 2 | `running-left` | 8 | optional deterministic mirror |
| 3 | `waving` | 4 | optional |
| 4 | `jumping` | 5 | optional airborne gate |
| 5 | `failed` | 8 | optional |
| 6 | `waiting` | 6 | optional |
| 7 | `running` | 6 | optional non-directional work loop |
| 8 | `review` | 6 | optional |

An optional failure is recorded as omitted and does not block later actions. The atlas keeps the corresponding row transparent. Partial import is legal only when a real accepted idle checkpoint exists.

`idle` is the only required action. A missing optional action is acceptable and appears in `omittedActionIds`; every real completed row appears in `availableActionIds`. A low-quality action must not be accepted merely to make the package look complete.

The landed official full-pet row package counts only `row-real` Provider output and an `approved-mirror` derived from an accepted directional row as official coverage. Deterministic packaging is implemented, but real Provider row generation and human visual review remain required before any art-readiness claim.

If idle fails, generation stops in `recovery-required`. It does not create an idle placeholder or a misleading runnable pet.

## 10. Evidence, retries, and recovery

Every candidate record is atomic and hash-verifies each referenced artifact. Evaluator evidence is bound to the review-board hash, so candidates and actions cannot overwrite one another's evaluation files.

Identity retry:

- archives the prior run, candidates, prompts, evaluations, quality-first package, scale profile, and checkpoints;
- invalidates all dependent action checkpoints;
- preserves paid evidence;
- generates a new canonical pool, deterministically selects the best passing anchor, and continues automatically unless the saved optional identity checkpoint is enabled.

Action retry:

- archives the requested action raw candidates, candidate records, processed frames, reference boards, prompts, evaluator evidence, packaged frames, and prior package evidence;
- invalidates only that action, plus `running-left` when repairing `running-right`;
- reuses the accepted canonical identity and locked scale profile;
- regenerates only the requested action candidate pool;
- rebuilds package evidence.

When a reason-directed repair moves the initial candidate revision, every candidate record path is rewritten to the immutable archive location before the repair candidate is persisted. Paid evidence links therefore do not point at a directory that has been moved or overwritten.

Idle failure writes `runs/<runId>/recovery/recovery.json`. The manifest lists every retained run file using only safe relative paths, sha256, and byte size. Creator service verifies the manifest's own hash before exposing it as an exportable recovery bundle.

No renderer-facing view includes absolute paths, secrets, raw Provider payloads, or unbounded prompt text.

## 11. Human authority

The model and deterministic gates may only propose, score, reject, omit, or request repair. Human actions remain explicit:

1. optionally select canonical identity when the pre-action checkpoint is enabled;
2. inspect the selected anchor, alternates, unusable candidates, and action assets;
3. approve the final art result;
4. import the pack;
5. optionally activate it.

The product is personal software, but hash binding and durable evidence still prevent accidental approval of a different candidate or stale artifact.

## 12. Verification boundary

Focused development tests cover strict planning, budgets, reference boards, processing, scale profiles, diversity evidence, one-to-four-candidate comparison schema, deterministic anchor selection, optional identity pause, code-owned gates, action orchestration, repairs, recovery manifests, renderer-safe diagnostics, IPC, and Create UI contracts.

The independent test task must still run:

- `npm run check:syntax`;
- `npm run test:core`;
- `npm run test:control-center`;
- `npm run test:core:all`;
- real Provider evidence confirming one reference and `n=1` for every request;
- canonical candidate visual comparison and selected-anchor inspection;
- full action contact-sheet/GIF/atlas inspection;
- identity/action retry rehearsal;
- partial import and recovery export;
- explicit approval, import, and activation.

Until those checks pass on the final integrated commit, the correct status is **implemented but independently unverified**.

Archived host-path evidence remains available at `docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-38-29-834Z-dev8-acceptance/` and `docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-56-30-104Z-main-acceptance/`. It proves the historical host request path, not production art quality or the newly changed canonical-selection behavior.
