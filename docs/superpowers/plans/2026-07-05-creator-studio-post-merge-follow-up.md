# Creator Studio Post-Merge Follow-Up Plan

> **For agentic workers:** Read current live docs first in the order defined by `docs/README.md`. This file is a bounded execution spec for the next Creator Studio follow-up slice. It does not replace `docs/TODO.md` as the active backlog.

**Goal:** convert the newly merged one-click generation chain from "technically working on the narrowed happy path" into a stable, operator-trustworthy product surface with explicit evidence, explicit model truth, explicit unsupported-input handling, and explicit next-slice quality rules.

**Current truth to preserve:**

- the phase-6 one-click chain is already merged;
- `npm run test:core` is green on the merged baseline;
- the stable shortest path is one clean front-facing reference image on the saved `gpt-image-2` gateway path;
- full-pet QA/import currently requires real `idle` base coverage;
- default full-pet generation does not spend provider calls on extra action poses;
- base-only local fallback rows are preview compatibility only and must not be described as official-quality action generation;
- multi-view collage input is not yet a default supported path.

This plan exists to keep the next round honest. It is not permission to reopen architecture, widen support claims, or reintroduce fuzzy fallback behavior.

---

## Milestone Contract

Milestone: post-merge stabilization and bounded follow-up for Creator Studio one-click generation

Target outcome:

- `main` has a freshly revalidated one-click path for both new-pet and existing-action flows using the currently recommended material shape.
- verified image-model eligibility is enforced from one host-owned source of truth instead of scattered heuristics.
- multi-view collage input has one explicit product contract for the default path: detect and block with guidance.
- any future full-pet quality expansion follows the official Codex/hatch-pet row-strip contract before code lands.
- user and operator docs say exactly what the product currently supports and where failures belong.

P0/P1 scope:

- P0: re-run the complete one-click path on `main` and archive the result in one canonical evidence location.
- P0: harden verified-model truth and `/images/edits` failure classification at the host boundary.
- P1: add one bounded multi-view contract for the default path: detect unsupported collage or multi-view input and route users to the supported front-image path.
- P1: define the official-quality full-pet row-strip generation slice with explicit quality gates before implementation starts.
- P1: publish one user-facing material guide and one maintainer-facing triage guide at fixed live-doc locations.

Out of scope:

- new atlas dimensions or row semantics;
- a broad dynamic provider catalog;
- treating smoke success as proof of production art quality;
- promoting multi-view to supported generation in this slice;
- expanding active backlog ownership beyond `docs/TODO.md`.

Manual-required:

- real provider credentials and reachable gateway/runtime;
- human art-quality review for generated outputs;
- human decision on whether future multi-view support is good enough to promote beyond blocked guidance.

Acceptance boundary:

- the current supported path can be reproduced on `main` and archived as evidence;
- verified-model behavior is identical across host runtime, host bridge, fallback policy, UI exposure, and probe tooling;
- multi-view input no longer silently pretends to be a supported default path;
- future follow-up work cannot overclaim support without first updating the relevant live docs and tests.

---

## Canonical Output Rules

This plan fixes one major ambiguity from the previous draft: every workstream has a fixed output location.

### Active truth stays in live docs only

- `docs/TODO.md`: active backlog priority only
- `docs/HANDOFF.md`: maintainer continuation truth only
- `docs/development-summary.md`: compact engineering truth only
- `docs/project-status-review.md`: compact product/release truth only
- `docs/one-click-action-generation-complete-chain.md`: creator one-click chain behavior truth only

Do not create a second active TODO, roadmap, or general follow-up note elsewhere.

### Evidence goes in one canonical archive family

For this follow-up slice, host acceptance evidence belongs under:

```text
docs/release-evidence/creator-workflow-host-smoke/<timestamp>-main-acceptance/
```

Use that location for:

- new-pet one-click acceptance on `main`;
- existing-action one-click acceptance on `main`;
- saved run summaries or sanitized smoke artifacts produced by the host workflow tooling.

Do not scatter acceptance notes into ad hoc markdown files, random temp directories, or new top-level evidence folders.

### Live docs only receive conclusion updates

After an acceptance run, live docs should only record the bounded result, for example:

- front-image path still verified on `main`;
- provider path still limited to verified models X and Y;
- multi-view remains blocked with guidance.

They should not absorb raw run logs, debug transcripts, or temporary investigation detail.

---

## Verified Model Truth Contract

This plan also fixes the previous ambiguity around "verified models."

### Single source of truth

Verified image-model eligibility is owned by the host runtime in:

- `src/main/services/image-generation-model-service.js`

That owner must define one canonical helper or policy surface for:

- which discovered model ids are eligible for this chain;
- which model ids are merely discovered templates;
- which models can be used for fallback retries.

### Derived consumers only

The following surfaces must derive from that host-owned truth, not invent parallel allowlists:

- AI pane recommended/eligible image model exposure;
- Creator Studio host bridge model selection;
- provider fallback and retry selection;
- probe output classification in `scripts/run-image-edits-provider-probe.js`;
- any user-facing copy that says a model is supported, verified, or experimental.

### Enforcement rule

A model is eligible for the default one-click chain only if it satisfies at least one of:

1. archived smoke evidence exists for the relevant image-generation path; or
2. repeatable local chain evidence exists on the current gateway path and is linked from the acceptance archive.

Otherwise it remains one of:

- discovered only;
- operator experiment only;
- preset/template only.

### Required regression boundary

Tests must prove that:

- the host runtime and host bridge share the same eligibility decision;
- unsupported discovered models are not surfaced as equal default candidates;
- fallback retries cannot silently jump to unverified models.

---

## Workstream A: Main-Branch Real Acceptance

**Why first:** before expanding capability, prove that the merged baseline still works in the branch users will actually run.

### Success definition

- A maintainer can complete:
  - new-pet one-click generation on `main`;
  - existing-action one-click generation on `main`;
  - import and immediate verification in OpenPet;
- the result is archived under the canonical evidence location above.

### Implementation checklist

- [ ] run the full `Create` path on `main`, not only in a dev worktree;
- [ ] use the currently recommended input class: one clean front-facing reference image;
- [ ] archive the resulting evidence under `docs/release-evidence/creator-workflow-host-smoke/<timestamp>-main-acceptance/`;
- [ ] classify any failure as exactly one of:
  - provider/gateway failure,
  - host code regression,
  - Creator Studio workflow regression,
  - input-material mismatch;
- [ ] update live docs only with the bounded conclusion, not with the raw artifact detail.

### Files likely involved

- `scripts/run-creator-workflow-host-smoke.js`
- `tests/scripts/run-creator-workflow-host-smoke.test.js`
- `docs/release-evidence/creator-workflow-host-smoke/`
- `docs/one-click-action-generation-complete-chain.md`

### Stop rule

If `main` cannot reproduce the previously verified front-image path, stop all follow-up expansion work and treat that regression as the next active engineering task.

---

## Workstream B: Provider And Gateway Truth Hardening

**Why second:** the biggest remaining instability is provider-path truth, not core OpenPet orchestration.

### Success definition

- verified-model eligibility is enforced from the single host-owned truth surface;
- `/images/edits` failures are classifiable without hand-reading raw gateway logs;
- UI and docs no longer imply that all discovered fallback models are supported.

### Implementation checklist

- [ ] consolidate verified-model eligibility in `image-generation-model-service.js`;
- [ ] make AI settings, host bridge, and retry logic derive from that same host decision;
- [ ] refine probe tooling so `/images/edits`, timeout, malformed-response, decode, and empty-image failures are distinguishable;
- [ ] keep model discovery sanitization in place so malformed provider ids never surface as eligible;
- [ ] update user/operator copy anywhere support claims drift from the verified-model contract.

### Files likely involved

- `src/main/services/image-generation-model-service.js`
- `scripts/run-image-edits-provider-probe.js`
- `tests/services/image-generation-model-service.test.js`
- `tests/scripts/run-image-edits-provider-probe.test.js`
- `docs/one-click-action-generation-complete-chain.md`

### Stop rule

If the host runtime, UI, host bridge, and probe script cannot all agree on the same verified-model set, do not ship further provider-facing UX changes.

---

## Workstream C: Multi-View Input Handling

**Bounded contract for this slice:** the default path must detect collage or multi-view input and block it with actionable guidance. This slice does **not** attempt multi-view generation, fusion, or dominant-view extraction.

This fixes the biggest problem in the previous draft: the next step is now one explicit behavior, not three parallel options.

### Success definition

- the default path no longer silently accepts files like `全面.png` as if they were equivalent to a supported front-image input;
- the user receives guidance to provide one clean front-facing image;
- the single-image path remains untouched.

### Implementation checklist

- [ ] define a bounded detector for likely unsupported collage or multi-view inputs;
- [ ] block such input before generation starts;
- [ ] return one concise user-facing message explaining the supported input shape;
- [ ] keep Creator Studio advanced/manual routes available if a maintainer still wants to experiment;
- [ ] add tests for both:
  - accepted supported front-image input;
  - blocked multi-view/collage input with guidance.

### Files likely involved

- `src/main/services/creator-reference-service.js`
- `src/main/services/creator-workflow-service.js`
- `tests/services/creator-reference-service.test.js`
- `tests/services/creator-workflow-service.test.js`
- any relevant Control Center Create-pane test surface

### Explicit non-goal for this slice

Do not implement "best effort" dominant-view extraction in the same round. If that becomes the next product move, it needs a new spec after blocked-guidance behavior is stable.

---

## Workstream D: Official-Quality Full-Pet Row Pipeline

**Why this replaces the previous optional-action plan:** the previous draft treated one-by-one row expansion from a base pose as acceptable. That is not accurate. The official hatch-pet contract requires generated state-specific row strips for normal rows; local base-image transforms are preview compatibility only.

### Current default gate

Keep this unchanged until a later spec explicitly changes it:

- base identity coverage is allowed for the economical default path
- legacy required/real basic action arrays remain empty for base-only output
- all rows may exist only as explicitly labeled preview/fallback compatibility rows
- fallback rows must not be presented as official-quality `idle`, `waving`, `running`, `jumping`, `waiting`, `failed`, or `review`

### Official row contract

Official-quality full-pet output requires row-specific generation for:

1. `idle`
2. `running-right`
3. `running-left`
4. `waving`
5. `jumping`
6. `failed`
7. `waiting`
8. `running`
9. `review`

Only `running-left` may be derived deterministically, and only by framewise mirroring of an approved `running-right` row while preserving frame order and timing semantics.

### Row acceptance gate

Before any row is considered official-quality, it must satisfy all of:

- the row-specific source strip decodes successfully;
- visible-pixel validation passes;
- atlas row QA records it as a real row rather than a base-pose fallback or transform preview;
- row extraction uses connected components, valid slots, or explicit `stable-slots` only as a QA-driven correction;
- contact sheet and preview GIFs show stable baseline and no unintended size popping;
- row semantics match the official state contract;
- the row is not merely the base/reference image with translate, scale, crop, or other local geometric transforms;
- import eligibility for the current `idle` gate is not weakened;
- timeout budget and retry behavior are explicitly documented;
- failure either blocks official-quality claims or degrades to an explicitly labeled preview/fallback row without turning the whole economical run into a fatal error.

### Implementation checklist

- [x] codify anchor/centroid/baseline stability metrics in tests before changing generation logic;
- [x] codify a regression that rejects rows made only from local base-image transforms;
- [x] add a row-strip generation manifest shaped after the official hatch-pet flow;
- [x] generate `running-right` before deciding whether `running-left` can be mirrored;
- [x] add deterministic extraction, `stable-slots` correction, atlas composition, validation, contact sheet, and preview GIF artifacts;
- [x] document rows as one of:
  - `base-real`,
  - `row-real`,
  - `approved-mirror`,
  - `preview-fallback`;
- [x] stop immediately if a generated row destabilizes identity, style, baseline, or row semantics.

### Files likely involved

- `examples/plugins/creator-studio/lib/full-pet-basic-actions.js`
- `examples/plugins/creator-studio/lib/host-model-bridge.js`
- `examples/plugins/creator-studio/lib/real-atlas-builder.js`
- `examples/plugins/creator-studio/lib/full-pet-qa.js`
- new or adapted row extraction/composition/QA helpers under `examples/plugins/creator-studio/lib/`
- `tests/examples/creator-studio-full-pet-basic-actions.test.js`
- `tests/examples/creator-studio-host-model-bridge.test.js`
- `tests/examples/creator-studio-real-atlas-builder.test.js`

---

## Workstream E: User And Operator Guidance

This workstream now has fixed live-doc destinations so future development does not fork documentation again.

### Live doc destinations

- user-facing material guidance:
  - `examples/plugins/creator-studio/README.md`
- maintainer/operator failure triage:
  - `docs/one-click-action-generation-complete-chain.md`
- compact current-state truth:
  - `docs/HANDOFF.md`
  - `docs/development-summary.md`
  - `docs/project-status-review.md`

Do not create a separate "creator materials guide" or "failure FAQ" file unless one of these docs is explicitly retired.

### Success definition

- a user can tell what reference image to prepare before clicking generate;
- a maintainer can distinguish code bugs from provider bugs from unsupported-input bugs;
- multi-view is not accidentally described as default-supported anywhere.

### Implementation checklist

- [ ] update `examples/plugins/creator-studio/README.md` with one explicit supported-material rule: use one clean front-facing image;
- [ ] update `docs/one-click-action-generation-complete-chain.md` with a failure-triage table mapping common symptoms to ownership;
- [ ] ensure compact live docs mention the narrowed stable path and the blocked multi-view default-path rule;
- [ ] keep advanced Creator Studio and Actions routes described as recovery/customization surfaces, not required ordinary-user steps.

---

## Workstream F: Hygiene And Cleanup

### Checklist

- [ ] remove temporary dev-worktree artifacts such as `tmp/` after their evidence value is exhausted;
- [ ] keep only archived evidence that contributes to operator truth or debugging value;
- [ ] avoid letting local scratch output look like official release evidence.

This workstream must never block Workstreams A-E.

---

## Required Verification Spine

The previous draft under-protected UI behavior. This slice now requires both service and UI verification where behavior changes.

### Baseline code health

```bash
npm run test:core
```

### Provider truth verification

```bash
node --test tests/services/image-generation-model-service.test.js \
  tests/scripts/run-image-edits-provider-probe.test.js
```

### Workflow and input-contract verification

```bash
node --test tests/scripts/run-creator-workflow-host-smoke.test.js \
  tests/services/creator-reference-service.test.js \
  tests/services/creator-workflow-service.test.js
```

### Full-pet policy verification

```bash
node --test tests/examples/creator-studio-full-pet-basic-actions.test.js \
  tests/examples/creator-studio-full-pet-qa.test.js \
  tests/examples/creator-studio-real-atlas-builder.test.js \
  tests/examples/creator-studio-host-model-bridge.test.js
```

### UI regression requirements for this slice

The following UI checks are required whenever Workstream C or E changes behavior:

```bash
npx playwright test tests/control-center/control-center-smoke.spec.js --grep "Create|Creator"
```

Expected UI coverage:

- supported front-image input still reaches the default path;
- blocked multi-view/collage input shows the correct guidance;
- failure routing still points to advanced details where applicable;
- no new wording implies that multi-view is a supported default path.

Use real provider smoke only when the workstream changes provider claims or provider-path behavior.

---

## Exit Criteria

This follow-up plan is complete only when all of the following are true:

- `main` has a fresh archived acceptance run for the current supported front-image path;
- verified-model truth is centralized and enforced consistently across runtime, UI, host bridge, and probe tooling;
- the default path explicitly blocks unsupported multi-view/collage input with guidance;
- user-facing and maintainer-facing docs point to fixed locations and say the same thing;
- any future official-quality full-pet action expansion must satisfy the row-strip generation and visual QA gate before it can ship.

If those conditions are not met, the work is still active stabilization rather than optional polish.
