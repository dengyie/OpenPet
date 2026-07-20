# Pet Character And Action Generation

> Updated: 2026-07-20
> Owner: `codex/dev8`
> Status: quality-first replacement implemented; focused development checks passed; independent Provider and visual verification pending

This document is the current implementation contract for generating an OpenPet character and its official actions from one user reference image. It replaces the former keyframe-parent full-pet workflow documentation.

## 1. Product outcome

The normal Create flow produces:

- one source-faithful canonical character selected by a human;
- a required `idle` action and any optional actions that independently pass unchanged quality gates;
- retained raw, processed, prompt, evaluator, contact-sheet, GIF, checkpoint, and package evidence;
- a partial or complete official atlas that never substitutes copied idle art for a failed action;
- explicit review, import, and activation boundaries.

Visual quality and identity consistency take priority over latency and cost. Automated code and model evaluation may reject or request repair, but may not grant artistic approval, import a pack, activate a pack, or weaken a threshold.

This branch does not claim `production-art-ready`. Real Provider requests, visual inspection, human identity selection rehearsal, GIF/contact-sheet/atlas review, and final import/activation checks belong to the independent test task.

## 2. Production state machine

```text
source image
  -> validate and copy into host-owned run storage
  -> Hatch Pet structured sprite plan
  -> canonical candidate pool
  -> deterministic candidate QA
  -> one canonical comparison evaluator board
  -> code-owned per-candidate visual gates
  -> awaiting_identity_review
  -> exact candidateId + sha256 human acceptance
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
- `awaiting-identity-review`: canonical candidates are visible and no action request has started;
- `recovery-required`: required idle failed; paid assets are retained but no runnable pet may be imported;
- `review-required`: the accepted action/package result is ready for human review;
- `completed`: an explicit import completed.

The Create pane polls durable run/checkpoint state during identity acceptance and repairs. It shows stage, current action, candidate counts, pass/fail/omitted state, reason codes, retained assets, prompt evidence, and the next legal user action.

## 3. Entry-point cutover

All production full-pet entry points stamp or require `pipeline: quality-first-v1`:

- Create → New Character;
- conversational Creator Studio full-pet drafting;
- `run-step` for Provider-backed full-pet runs;
- `accept-identity`;
- `retry-identity`;
- `retry-action`;
- Creator Studio dashboard identity/action repair routes.

A Provider-backed full-pet run that requests `legacy-keyframe-v1` fails with `legacy_full_pet_pipeline_removed`. The former separate action start/peak keyframe chain and direct raw 1xN row chain are not legal production full-pet paths. The existing single-action feature retains its dedicated legacy implementation and is not part of this full-pet cutover.

## 4. Non-negotiable Provider contract

Every creative image request:

1. uses `/images/edits`;
2. carries exactly one validated local reference image;
3. uses the multipart field `image`, never `image[]`;
4. requests `n=1`;
5. fails closed on zero or multiple returned outputs;
6. writes every returned paid output before downstream validation;
7. uses a Provider-neutral prompt compiled from typed code-owned fields.

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

## 6. Canonical identity pool

Canonical generation requests three distinct eligible candidates and permits at most four dispatches when one is a duplicate. Registered diversity strategies may emphasize balanced fidelity, silhouette readability, or small-scale detail, but may not change identity, viewpoint, proportions, palette, accessories, or rendering medium.

Candidate distinctness uses actual image content:

- 64-bit perceptual hash;
- 8x8 alpha-mask descriptor;
- normalized silhouette/centroid and three-band color identity descriptor;
- mean-color descriptor.

Encoded-file hashes or candidate names are not used as visual proxies. Perceptually duplicate outputs remain retained as paid evidence but do not count toward the three-candidate pool.

Exactly three eligible candidates are composed with the source into one 2048x2048 canonical comparison board. The evaluator returns one strict score record per candidate region. Code independently applies immutable canonical thresholds to every candidate. An overall model recommendation cannot turn a failing candidate into a passing candidate.

The run then enters `awaiting_identity_review`. Candidate cards show:

- 128-pixel preview access;
- candidate ID and exact sha256 binding;
- eligibility, score, model, and failure codes;
- safe relative evidence paths.

Accepting a candidate requires exact `runId + candidateId + sha256` equality. No action Provider request is legal before acceptance.

## 7. Action generation

After identity acceptance, `idle` runs first. Every action uses:

- one 1536x1024 action reference board containing the repeated canonical anchor grid and source detail;
- a square 1024x1024 Provider canvas;
- a fixed invisible multi-row layout;
- two distinct initial candidates;
- at most one duplicate replacement;
- at most one reason-directed repair candidate.

Candidate generation, deterministic processing, code QA, visual evaluation, and persistence are isolated steps. Processing or evaluation failure on one candidate does not hide that candidate or prevent comparison with the other candidate.

The selected candidate must pass both deterministic QA and the code-owned evaluator gate. Selection uses evaluator overall score, then identity distance, then a stable candidate ID tie-breaker. A single surviving candidate is never accepted when the two-distinct-candidate contract was not met.

`running-left` is never generated independently. It is a deterministic framewise horizontal mirror of an accepted `running-right` result, receives its own checkpoint and official-row QA, and is invalidated whenever `running-right` is repaired.

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

If idle fails, generation stops in `recovery-required`. It does not create an idle placeholder or a misleading runnable pet.

## 10. Evidence, retries, and recovery

Every candidate record is atomic and hash-verifies each referenced artifact. Evaluator evidence is bound to the review-board hash, so candidates and actions cannot overwrite one another's evaluation files.

Identity retry:

- archives the prior run, candidates, prompts, evaluations, quality-first package, scale profile, and checkpoints;
- invalidates all dependent action checkpoints;
- preserves paid evidence;
- generates a new canonical pool and returns to identity review.

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

1. select canonical identity;
2. inspect accepted and rejected action assets;
3. approve the final art result;
4. import the pack;
5. optionally activate it.

The product is personal software, but hash binding and durable evidence still prevent accidental approval of a different candidate or stale artifact.

## 12. Verification boundary

Focused development tests cover strict planning, budgets, reference boards, processing, scale profiles, candidate diversity, canonical comparison schema, code-owned gates, action orchestration, identity pause, repairs, recovery manifests, renderer-safe diagnostics, IPC, and Create UI contracts.

The independent test task must still run:

- `npm run check:syntax`;
- `npm run test:core`;
- `npm run test:control-center`;
- `npm run test:core:all`;
- real Provider evidence confirming one reference and `n=1` for every request;
- canonical candidate visual comparison and human selection;
- full action contact-sheet/GIF/atlas inspection;
- identity/action retry rehearsal;
- partial import and recovery export;
- explicit approval, import, and activation.

Until those checks pass on the final integrated commit, the correct status is **implemented but independently unverified**.
