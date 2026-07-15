# Pet Character And Action Generation

> Updated: 2026-07-15
> Owner: `codex/dev8`
> Status: implemented on the development branch; independent verification pending
> Scope: generate a Codex-compatible pet character and its basic actions from one user reference image, with visual quality taking priority over generation cost.

This is the sole current development document for OpenPet character and action generation. It replaces the branch's earlier one-click chain notes, row-pipeline specifications, anchor-reference specifications, action-quality plans, and duplicated live-doc summaries.

## 1. Purpose And Current Truth

OpenPet should let an ordinary user provide exactly one source image and receive:

- a recognizable, transparent-background pet character;
- a stable canonical identity suitable for a small desktop window;
- an approved `idle` action and any optional actions that independently pass QA;
- inspectable quality evidence;
- an importable `pet.json` and `spritesheet.webp` package.

The quality target is not “a technically valid atlas.” The generated character must remain recognizably the same character across all frames, and every action must read correctly when animated.

Official-quality output means an approved canonical character followed by genuine action-specific Provider row generation, deterministic extraction and QA, and human visual approval. A base identity plus compatibility transforms does not meet that bar. Missing optional actions are acceptable, but a low-quality action must not enter the package.

The branch already contains:

- host-owned source selection and reference validation;
- image-first identity conditioning;
- local composite reference-board generation;
- character and action anchor stages;
- keyframe-conditioned provider action-sheet generation;
- frame extraction, background removal, stable-slot correction, and atlas composition;
- technical, identity, motion, and row QA;
- contact-sheet and preview artifacts;
- guarded approval, import, and activation flows;
- deterministic support for `approved-mirror` row quality;
- quality-first partial packaging with stable transparent atlas slots;
- durable per-action checkpoints and scoped retry;
- fail-closed single-reference enforcement at plugin and host image-generation boundaries;
- explicit single-output Provider requests with fail-closed deliverable output-count enforcement;
- bounded same-model retry for transient Provider transport failures;
- canonical full-pet action identity boards with separate canonical QA references;
- idle-specific minimal-motion semantics and prompt schema v4;
- versioned human-example registries and immutable quality profiles;
- profile-bound prompts, reference-board metadata, keyframe QA, row QA, and atlas QA;
- action-scoped and identity-scoped repair with archived prior evidence;
- machine-readable Provider production-art claim gates.

The landed deterministic official row package can compose and validate complete or partial sets of `row-real` and `approved-mirror` inputs. That packaging support is not evidence that a real Provider has produced approved art for every available row.

Real-provider smoke success proves that the host bridge and provider path can complete. It does not prove production art quality. Production approval still requires human visual review.

The current generation implementation on `codex/dev8` is developed but intentionally unverified. This branch does not run automated tests, real Provider smoke, browser checks, or visual acceptance. The latest reliability follow-up must be verified through the isolated testing task described in `docs/superpowers/plans/2026-07-14-provider-generation-reliability-test-handoff.md`.

### Hatch Pet Agent Phase 1 boundary

Phase 1 adds a disabled-by-default Hatch Pet Agent configuration surface and a text-only shadow planner beside the fixed Creator Studio workflow. Users may follow the saved chat Provider/model configuration or save a dedicated hatch-pet Provider/model and host-owned secret. Follow-chat inherits only Provider configuration and its secret reference: hatch-pet never reads or writes ordinary pet-chat conversation history, memory, behavior state, or prompts.

The product design uses the same resolved hatch-pet model for later planning and visual evaluation, with separate stateless roles. Phase 1 implements only structured text planning: it sends no image attachment, performs no model visual evaluation, and executes no model decision. Runtime execution is fixed to `shadow`; recorded suggestions and failures are additive diagnostics only.

Control Center exposes the shadow enable flag, follow-chat/dedicated configuration, bounded budget settings, the future identity-review checkpoint, capability status, and sanitized run diagnostics. Budgets and the identity checkpoint are recorded for the future bounded workflow but do not change the fixed generator in Phase 1. Durable artifacts stay under `runs/<runId>/agent/` and contain bounded snapshots, state, budgets, prompt metadata, and decision records. API keys remain host-owned and must not appear in renderer responses, logs, snapshots, diagnostics, or agent artifacts.

Shadow planning never changes image Provider selection, generation prompts, retry behavior, deterministic QA, human approval, import, activation, or any Creator Studio command payload. Disabled mode performs no hatch-pet model or store work, and enabled-mode configuration, model, validation, or persistence failures must not block the fixed workflow. This Phase 1 implementation is **implemented but unverified** until the isolated assignment in `docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase1-test-handoff.md` passes. It supplies no Provider approval, human visual acceptance, or `production-art-ready` evidence.

## 2. User Experience

The normal flow is:

```text
one clean user reference image
  -> source validation and local normalization
  -> canonical character identity
  -> action-specific generation
  -> frame extraction and stabilization
  -> deterministic QA
  -> contact-sheet and animated-preview review
  -> Codex Pet atlas and manifest packaging
  -> import and activation
```

The user does not prepare a collage, multi-view sheet, sprite sheet, contact sheet, model sheet, or action grid. OpenPet creates the required intermediate artifacts.

The default interface should ask for:

- one clean reference image;
- an optional character name or short description;
- an optional explicit style transformation;
- an optional action request for the advanced single-action flow.

Text can describe temperament, action intent, or a requested transformation. Text must not silently override visible identity from the image.

### Non-goals

- Generating several unrelated character variants from one request.
- Treating a local transform of the base image as an action.
- Asking users to understand the Codex atlas layout.
- Exposing Provider credentials to the renderer or Creator Studio plugin.
- Claiming that automated metrics alone prove artistic quality.
- Changing the official Codex Pet atlas dimensions or row semantics.

## 3. Official Codex Pet Output Contract

The final atlas contract is fixed:

```text
spritesheet.webp or spritesheet.png
1536x1872 pixels
8 columns x 9 rows
192x208 pixels per cell
transparent background
unused cells fully transparent
```

The official rows are:

| Row | Action | Frames | Meaning |
| ---: | --- | ---: | --- |
| 0 | `idle` | 6 | Calm breathing, blinking, or a quiet standing loop |
| 1 | `running-right` | 8 | Directional movement to the right |
| 2 | `running-left` | 8 | Framewise horizontal mirror of the approved `running-right` row |
| 3 | `waving` | 4 | Clear greeting or attention gesture |
| 4 | `jumping` | 5 | Anticipation, lift, peak, descent, and settle |
| 5 | `failed` | 8 | Error, sad, deflated, or disappointed reaction |
| 6 | `waiting` | 6 | Waiting for user input or approval |
| 7 | `running` | 6 | Active work, processing, scanning, or focus; not directional foot-running |
| 8 | `review` | 6 | Focused inspection, reading, or thinking loop |

Used cells must contain visible pixels. Unused cells must have zero visible alpha and no transparent RGB residue. Frame order and durations come from `full-pet-row-contract.js` and must not be inferred from the generated sheet.

`idle` is the only required action. Every other official action is optional. A failed optional action is omitted while generation continues with later actions. The fixed nine-row atlas layout does not change: unavailable optional rows remain fully transparent and are never filled with copied `idle` art.

`running-right` and `running-left` form one optional atomic pair. The pair is available only when `running-right` passes generation and QA and its framewise mirrored `running-left` derivative also passes. If either half fails, both directions are omitted.

The generated manifest records the production action set explicitly:

- `requiredActionIds`: currently `['idle']`;
- `availableActionIds`: only actions whose rows passed the applicable gates;
- `omittedActionIds`: official actions excluded from the package;
- `actionAvailability`: bounded quality or omission evidence for review.

Legacy complete Codex Pet manifests without availability metadata continue to expose all nine rows. New partial manifests must include `idle` in `availableActionIds`.

Official real coverage consists only of:

- `row-real`: a genuine provider-generated, action-specific row that passed row QA;
- `approved-mirror`: the QA-gated `running-left` derivative of an approved `running-right` row.

Preview fallbacks and base-image transforms never count as official real coverage.

## 4. Single-Reference Provider Rule

The user supplies exactly one source image for a normal run. Every image-generation Provider request may contain at most one image attachment.

This rule applies to:

- canonical character generation;
- character-anchor generation;
- action-anchor generation;
- action-sheet or row generation;
- repair or regeneration requests.

OpenPet may derive several local artifacts from the source image and earlier approved outputs. When one generation stage needs identity, pose, and continuity cues together, OpenPet must compose those cues locally into one composite reference board and send that board as the request's only image.

```text
source image + approved character anchor + bounded pose cues
  -> local composite reference board
  -> one Provider request with one image attachment
```

The source image, character anchor, action anchor, and keyframes must never be attached as separate images in one request. The composite board is an inspectable run artifact with metadata recording its source roles and layout.

Provider configuration, API keys, model discovery, and output writes stay in the main process. Creator Studio receives bounded host-bridge results and data-relative artifact paths, not credentials or arbitrary filesystem access.

The plugin bridge rejects more than one reference before resolving paths. The public image-generation service rejects more than one reference before output-path work or Provider queue acquisition, and the normalized edit/multipart path repeats the invariant before request construction. Multipart edits use the single field name `image`, never `image[]`. All boundaries use the stable failure text:

```text
Image generation accepts at most one reference image; compose multiple sources into one local reference board
```

Every JSON generation request and multipart edit request explicitly asks the Provider for one output with `n=1`. The host still materializes all outputs actually returned so downstream delivery gates can validate reality rather than silently truncate the response. A deliverable action sheet or final keyframe-conditioned sprite row must contain exactly one complete Provider output; zero or multiple outputs are explicit failures, and OpenPet never selects the first ambiguous deliverable output.

## 5. Identity Contract

The source image is the highest authority for visible identity. Unless the user explicitly requests a transformation, generation must preserve:

- species and overall silhouette;
- head-to-body proportions;
- face structure and eye treatment;
- primary and secondary colors;
- fur, fabric, metal, or other material treatment;
- markings, patterns, and signature accessories;
- the overall rendering style visible in the source.

The canonical character must:

- have a transparent background;
- show the complete body with safe padding;
- remain readable at desktop-pet scale;
- use a stable lower-center root anchor;
- avoid text, borders, guide marks, UI, scenery, or unrelated effects;
- provide enough identity information for every later action row.

The optional text description can add name, temperament, or action intent. If text conflicts with the visible source identity, the image wins.

## 6. End-To-End Generation Architecture

### Stage 1: source validation

Validate the single source before making a Provider call. Reject:

- collages or multi-view sheets;
- undecodable or unsupported images;
- oversized input;
- images without a readable subject;
- unsafe paths or references outside the host-owned data boundary.

Record the sanitized source metadata and copy the approved source into the run workspace.

### Stage 2: canonical character identity

Normalize the source locally and prepare the identity-bearing reference artifact. Generate or select one canonical character anchor with complete-body framing, transparency intent, stable scale, and a lower-center root.

The canonical identity is reviewed before it becomes the parent reference for actions. Regenerating actions from an unapproved identity only multiplies visual drift.

### Stage 3: action semantics

Build an explicit action plan before generation. The plan identifies:

- animation type;
- moving body parts;
- start, peak, recovery, and loop-closing poses;
- expected frame count and grid layout;
- stationary versus directional root behavior;
- semantic rejection conditions.

For example, a wave requires a readable raised-limb peak rather than whole-body jitter. Directional running requires alternating gait. The non-directional `running` row must communicate focused work rather than movement across the screen.

`idle` uses a stricter fixed contract. Its start keyframe matches the canonical pose, viewpoint, silhouette, scale, markings, accessories, and lower-center root. Its motion peak may add only subtle breathing, blink, ear, or tail-tip movement, with no action extreme, large limb change, camera change, body-root movement, or character redesign. The final frame settles back to the canonical start pose for a quiet loop.

### Stage 4: one composite action reference

Compose a bounded action reference board locally. For full-pet action generation, the board uses the canonical generated identity as its primary panel and the original user source as secondary visible-detail evidence. The canonical panel controls pose, framing, scale, and cross-row continuity; the original source remains authoritative for visible identity details. The board remains one image file and is not itself a deliverable sprite sheet.

The Provider receives that one board as its only reference attachment. Keyframe identity QA separately compares candidates against the canonical generated identity rather than against the composite board or a dynamic raw source pose. The board should prioritize identity over decorative guidance. Labels, borders, or layout elements must not leak into the generated output.

### Stage 5: Provider action-sheet generation

Send the composite board as the only image attachment and request a complete action-specific sheet or row. The Provider must author the actual pose changes. OpenPet may specify layout, key poses, transparency, scale, and continuity, but it must not later fabricate missing semantics from the base pose.

Transient transport failures such as `fetch failed`, connection reset, a closed socket, or a bounded timeout/connectivity code receive at most one same-model retry inside the existing two-attempt and total-time budgets. The retry does not change the selected model, quality thresholds, output-count contract, or request evidence. An exhausted retry remains an explicit failure with sanitized transport evidence.

Independent per-frame Provider generation is not the preferred production method. Existing evidence showed large whole-character redraw and stable face/body-core drift between frames even when each request succeeded. A complete keyframe-conditioned sheet gives the Provider shared visual context for the sequence.

When one Provider response contains multiple keyframe candidates, OpenPet evaluates every materialized candidate from that response. It selects the highest-scoring candidate that passes all unchanged composition and identity gates. This does not make another Provider request. If none pass, the action is rejected and every candidate's bounded QA record remains available for diagnosis.

### Stage 6: extraction and stabilization

After a sheet is generated:

1. remove an edge-connected opaque background only when the cutout is safe;
2. verify the declared grid and unused cells;
3. extract the exact official frame count;
4. fit frames into `192x208` transparent cells;
5. preserve vertical motion where the action requires it;
6. apply stable-slot correction only to valid provider-authored rows with extraction jitter;
7. record frame hashes and extraction metadata.

Stable-slot correction may fix baseline or size popping caused by extraction. It cannot turn one static pose into an action.

### Stage 7: QA and review

Run deterministic QA, produce contact sheets and animated previews, and require human review before approval. Repair the smallest failing scope: one artifact, one row, or the character identity. Regenerate the full pet only when a shared identity failure affects all rows.

The active quality profile is loaded once for a generation workflow. Its evidence record is written into keyframe, row, atlas, generation-stage, and reference-board metadata:

```json
{
  "version": 1,
  "id": "pet-generation-default-v1",
  "sourceDatasetId": ""
}
```

The default profile preserves the pre-governance thresholds. A configured non-default profile is accepted only as a complete, bounded profile tied to the loaded human-review dataset and a safe review-evidence path.

### Stage 8: atlas composition and import

Compose only approved `row-real` and `approved-mirror` rows into the official atlas. Validate the final atlas, bind QA evidence to its hash, create the manifest/package, then import and activate through the host-owned bridge.

The pipeline writes a durable checkpoint after each bounded action attempt. A retry reuses a successful row only when all checkpointed frame paths remain inside the run data directory and their SHA-256 hashes still match. Failed quality output is preserved as evidence but is never reused as an approved row.

## 7. Directional Pair Optimization

`running-right` and `running-left` are the same motion design viewed in opposite directions. Generating them independently wastes a Provider call and introduces avoidable differences in gait, timing, silhouette, scale, and identity.

The required pipeline is:

```text
single composite running reference board
  -> Provider-generated running-right sheet
  -> frame extraction
  -> running-right QA and explicit approval
  -> framewise horizontal mirror
  -> running-left direction and stability QA
  -> paired atlas rows with identical frame timing
```

The standard flow does not spend a separate Provider request on `running-left`. Nine official action rows therefore require eight action-generation jobs in the normal case.

Mirroring must preserve:

- frame order;
- per-frame duration;
- cell size and alpha;
- scale and baseline timing;
- the relationship between gait phases.

The mirrored result receives `approved-mirror` quality only after QA. No other action may use `approved-mirror`.

If readable text, a directional symbol, an asymmetric marking, or a one-sided accessory makes the mirrored identity invalid, block the directional pair for human review. Do not silently issue an independent `running-left` generation request inside the standard flow, and do not import an inconsistent pair.

## 8. Quality Gates

Quality thresholds come from the active immutable profile. `pet-generation-default-v1` is behavior-compatible with the prior constants. Prompt and reference-board guidance is derived only from validated, bounded human rejection reason codes; an empty example registry injects no additional guidance.

### Technical integrity

Reject output with:

- incorrect dimensions, layout, row, or frame count;
- empty used cells or visible unused cells;
- opaque backgrounds that cannot be removed safely;
- invalid alpha or transparent RGB residue;
- cropping or unsafe edge contact;
- unsafe paths, missing artifacts, or file-hash mismatches.

### Identity consistency

Compare frames with the approved canonical identity. Reject:

- major palette or material changes;
- species, silhouette, proportion, or accessory drift;
- excessive whole-sprite redraw between adjacent frames;
- excessive stable face/body-core redraw;
- multiple character variants inside one sheet.

### Motion quality

Reject:

- repeated or near-static frames;
- base-image transforms or transform-only frames;
- recolor-only motion;
- unintended centroid, baseline, scale, or visible-area instability;
- missing gait alternation or missing action peaks;
- movement of the whole sprite when only one limb or expression should move.

### Semantic correctness

Each row must read as its assigned state. Directional rows must face the correct direction. `waving` must show a clear greeting gesture. `jumping` must leave and return to the baseline. `failed`, `waiting`, `running`, and `review` must remain visibly distinct.

### Final atlas integrity

Validate dimensions, cells, alpha, unused cells, row-source classification, spritesheet hash, manifest agreement, and preview output before import.

## 9. Mandatory Human Visual Review

Deterministic QA catches known measurable failures. It cannot prove character appeal, semantic clarity, natural timing, or production readiness.

Human visual review must inspect:

- the canonical character beside the user source;
- each action contact sheet;
- each animated preview or GIF;
- cross-row identity consistency;
- small-window silhouette readability;
- baseline stability and size continuity;
- transparent-background cleanliness;
- the final composed atlas.

The reviewer may approve, reject, or request a scoped repair. A Provider HTTP success, zero automated warnings, or a successful import does not replace this review.

Human-approved and human-rejected examples use the versioned registry at:

```text
examples/plugins/creator-studio/quality/pet-generation-human-examples.json
```

Each record binds an official action ID to `approved` or `rejected`, a safe data-relative evidence path, bounded numeric metrics, and fixed rejection reason codes. Approved examples cannot contain rejection reasons; rejected examples require at least one reason. Free-form reviewer prose, host paths, and raw Provider payloads are not accepted. The development registry is valid and empty; no visual labels were fabricated.

Supported rejection reasons are `identity-drift`, `semantic-mismatch`, `static-motion`, `transform-only-motion`, `edge-contact`, `background-contamination`, `baseline-instability`, `scale-instability`, and `direction-mismatch`. Only fixed phrases derived from these codes may enter prompts.

## 10. Failure Recovery

| Failure | Owner | Recovery |
| --- | --- | --- |
| Invalid or collage source | Source validation | Ask for one clean reference image |
| Transient Provider transport or bounded gateway error | Host Provider bridge | Preserve sanitized stage evidence and retry the same model once within the existing attempt and deadline budgets |
| Provider returns zero or multiple deliverable outputs | Host Provider bridge | Reject explicitly; never select the first ambiguous action sheet or final sprite row |
| Canonical identity drift | Identity anchor | Rebuild the composite board or regenerate the canonical character |
| One action loses identity | Action generation | Regenerate that action using the approved identity reference |
| Wrong action semantics | Prompt/action plan | Strengthen key-pose guidance and regenerate the row |
| Opaque or contaminated background | Extraction/provider output | Apply safe edge cutout or regenerate if safe separation is impossible |
| Baseline or size popping | Extraction | Apply stable-slot correction when provider art is otherwise valid |
| Static or transform-only row | Provider generation | Reject and regenerate; never accept local motion fabrication |
| Mirrored accessory/text is invalid | Directional-pair review | Block the pair for human decision |
| Artifact hash mismatch | Approval/import | Invalidate approval and rerun QA on current files |
| Human visual rejection | Selected identity/action scope | Keep unapproved and repair the smallest rejected scope |

Failures must remain explicit. The pipeline must not silently downgrade an official-quality request to preview fallback art. Failure of required `idle` blocks packaging; failure of an optional action records its bounded reason, omits that action, and continues. Runtime requests for an omitted action fall back to the approved `idle` action and report the originally requested action ID.

Action repair invalidates only the selected generated action checkpoint, reuses other hash-valid rows, rebuilds derived atlas/review artifacts, and does not regenerate the canonical identity. `running-left` cannot be repaired independently; repair `running-right` and derive the mirror. Identity repair archives the prior evidence, invalidates all action checkpoints and generated identity artifacts, and runs a true full-pet regeneration.

Repair evidence is archived under `runs/<runId>/repairs/` before active artifacts are replaced. Both repair scopes stop at `ready_for_review` or `failed`; they never auto-approve, auto-import, or auto-activate output.

## 11. Artifacts And Provenance

A run should preserve inspectable, data-relative artifacts for:

- copied and validated source metadata;
- composite reference-board image and metadata;
- character anchor and action anchors;
- prompt snapshots and model snapshot;
- human-review dataset identity and active quality-profile evidence;
- Provider generation stage summaries;
- generated sheets/rows;
- extracted frame sequences;
- frame hashes and QA JSON;
- contact sheets and animated previews;
- row-source classifications;
- per-action checkpoint hashes and action-availability metadata;
- repair scope and archived pre-repair evidence;
- structured Provider art-readiness claim metadata;
- source-image, row, and final-atlas validation;
- import and activation result.

Logs and public dashboard responses must remove API keys, authorization headers, raw host paths, unbounded Provider payloads, and secret-like values.

## 12. Code Map And Ownership

| Responsibility | Current implementation |
| --- | --- |
| Source selection and stored bindings | `src/main/services/creator-reference-service.js` |
| Host workflow and import orchestration | `src/main/services/creator-workflow-service.js` |
| Host-owned image Provider and output boundary | `src/main/services/image-generation-model-service.js` |
| Provider stages and full-pet row orchestration | `examples/plugins/creator-studio/lib/host-model-bridge.js` |
| Composite and conditioning boards | `examples/plugins/creator-studio/lib/anchor-reference-board.js` |
| Anchor and action prompt contracts | `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`, `openpet-prompt-builder.js` |
| Action semantics and key-pose plans | `examples/plugins/creator-studio/lib/action-semantics.js` |
| Action-sheet frame extraction and QA | `examples/plugins/creator-studio/lib/action-frame-builder.js`, `action-frame-qa.js` |
| Official row/frame/duration contract | `examples/plugins/creator-studio/lib/full-pet-row-contract.js` |
| Official row extraction and mirror support | `examples/plugins/creator-studio/lib/full-pet-row-extractor.js` |
| Row technical, identity, and motion QA | `examples/plugins/creator-studio/lib/full-pet-row-qa.js` |
| Stable-slot correction | `examples/plugins/creator-studio/lib/full-pet-row-stable-slots.js` |
| Atlas composition and final validation | `examples/plugins/creator-studio/lib/real-atlas-builder.js`, `full-pet-atlas-composer.js` |
| Human examples, quality profiles, and prompt governance | `examples/plugins/creator-studio/lib/pet-generation-human-examples.js`, `pet-generation-quality-profile.js`, `pet-generation-governance.js` |
| Action checkpoints and repair orchestration | `examples/plugins/creator-studio/lib/full-pet-action-checkpoints.js`, `backend-runner.js` |
| Provider production-art approval registry | `examples/plugins/creator-studio/lib/provider-art-approval.js` |
| Dashboard review surface | `examples/plugins/creator-studio/service/studio-service.js`, `web/dashboard/index.html` |

The host owns Provider credentials, writes, approval boundaries, import, activation, and trigger-proposal persistence. The plugin owns bounded task, prompt, artifact, QA, and review workflows.

## 13. Verification Matrix

The following commands define the independent testing task. They must not be run on `codex/dev8`; use the isolated testing branch and worktree named in the handoff document.

### Documentation contract

```bash
node --test tests/docs/live-docs-creator-studio.test.js \
  tests/docs/live-docs-project-context.test.js
npm run check:docs-drift
```

### Deterministic generation and QA

```bash
node --test \
  tests/examples/creator-studio-anchor-reference-board.test.js \
  tests/examples/creator-studio-anchor-prompt-builder.test.js \
  tests/examples/creator-studio-action-frame-builder.test.js \
  tests/examples/creator-studio-full-pet-row-extractor.test.js \
  tests/examples/creator-studio-full-pet-row-qa.test.js \
  tests/examples/creator-studio-real-atlas-builder.test.js
```

### Host workflow

```bash
node --test \
  tests/services/creator-reference-service.test.js \
  tests/services/creator-workflow-service.test.js \
  tests/services/image-generation-model-service.test.js \
  tests/examples/creator-studio-host-model-bridge.test.js
```

### Repository baseline

```bash
npm run check:syntax
npm run test:core
```

Real Provider behavior should be rechecked only when the Provider request contract, model path, generation stages, or support claims change:

```bash
npm run smoke:creator-studio-provider -- --prompt "<character and action request>"
npm run smoke:creator-workflow-host -- --reference-image <file>
```

Never put raw secrets or local paths into committed smoke evidence.

## 14. Known Limitations And Independent Verification Work

- The development branch contains no fabricated human-review examples and no Provider production-art approvals. Both registries intentionally remain empty.
- No non-default profile is endorsed. Calibration must be derived from real approved/rejected examples and reviewed evidence on the isolated testing branch.
- Explicit `n=1`, fail-closed deliverable output counts, bounded transient retry, canonical action identity boards, canonical keyframe QA references, idle minimal-motion semantics, and prompt schema v4 are implemented but have not been exercised on this branch.
- Automated suites, real action and full-pet Provider smoke, successful full-pet generation, repair exercises, human labels, profile calibration, visual acceptance, and Provider approval remain assigned to `docs/superpowers/plans/2026-07-14-provider-generation-reliability-test-handoff.md`.
- A Provider or model change invalidates the corresponding support claim until the exact provider/model/profile/dataset tuple receives new human approval evidence.

## 15. Evidence And Claim Boundaries

Archived host workflow evidence:

- `docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-38-29-834Z-dev8-acceptance/`
- `docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-56-30-104Z-main-acceptance/`
- `docs/release-evidence/creator-workflow-host-smoke/2026-07-05T08-22-31-889Z-golden-cartoon-cat-dev8/`

Archived Creator Studio Provider evidence:

- `docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/`

These archives demonstrate bounded parts of the technical chain, including host orchestration, `/images/edits` reference conditioning, artifact writes, QA execution, and import flows. They do not by themselves prove production art quality, current model consistency, or final human approval.

Provider/model support claims use two levels:

- `technical-chain-ready`: the technical chain may be exercised, but no matching human art approval exists for the exact tuple;
- `production-art-ready`: every model that successfully generated part of the result, including fallback models and reused repair stages, has a matching approved record for the current Provider, quality profile, and human dataset.

Approval records live in `examples/plugins/creator-studio/quality/provider-art-approvals.json`. They are exact-match, versioned, path-safe records. One approved model cannot promote a result containing output from another unapproved successful model. This claim metadata never changes per-run deterministic QA, `artisticApproval`, human review status, approval, import, or activation rules.

The shipped empty approval registry means this development result is `technical-chain-ready` only. No `production-art-ready` claim is permitted until the independent testing task records real human acceptance evidence and adds the matching approval record.

When documentation, code, and evidence conflict, use this order:

1. this document for the required current generation contract;
2. current source and tests for implemented behavior;
3. release evidence for what one recorded run actually proved;
4. Git history for superseded dev8 design rationale.
