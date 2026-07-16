# Pet Character Generation Documentation Consolidation Design

**Date:** 2026-07-12
**Owner:** dev8
**Status:** Approved
**Scope:** Consolidate only the `codex/dev8` documentation for reference-image-driven pet character and action generation.

## Goal

Replace the branch's overlapping pet-generation plans, specifications, summaries, and status fragments with one current English development document. The resulting documentation must explain how OpenPet accepts one user reference image, preserves the character identity, generates the character and Codex Pet action set, validates visual quality, packages the official atlas, and imports the result.

This effort does not reorganize the repository's general engineering documentation. It only updates current documents where they must link to or accurately summarize the pet-generation authority.

## Canonical Document Set

`docs/pet-character-generation.md` becomes the only current design and engineering authority for the dev8 pet-generation feature.

The supporting document responsibilities are:

- `examples/plugins/creator-studio/README.md`: installation, operation, command, and debugging guidance for Creator Studio. Design rules link to the canonical document instead of being duplicated.
- `docs/README.md`: one discoverable entry for the canonical document.
- `docs/HANDOFF.md`, `docs/development-summary.md`, `docs/project-status-review.md`, `docs/openpet-current-todo-architecture.md`, and `docs/project-context.json`: at most a short current-state summary plus a link to the canonical document. These files must not restate the generation protocol.
- `docs/release-evidence/`: immutable evidence archives. Existing provider and workflow evidence stays untouched.
- Git history: the permanent source for superseded dev8 implementation plans and intermediate design iterations.

## Documents To Consolidate

The canonical document must absorb the still-valid content from:

- `docs/one-click-action-generation-complete-chain.md`;
- dev8 Creator Studio specifications under `docs/superpowers/specs/` dated 2026-07-05 through 2026-07-10;
- dev8 Creator Studio implementation plans under `docs/superpowers/plans/` dated 2026-07-05 through 2026-07-10;
- the pet-generation sections of `docs/jishuwendang.md`;
- the operational portions of `examples/plugins/creator-studio/README.md`.

Once their current requirements and implementation truth are represented in `docs/pet-character-generation.md`, superseded branch-only plans and specifications are deleted. Evidence archives are not deleted. General project documents are not rewritten beyond removing duplicated detail and linking to the authority.

## Product Contract

The ordinary user flow is:

```text
one user reference image
  -> source validation and local normalization
  -> canonical character identity
  -> action-specific generation
  -> frame extraction and stabilization
  -> deterministic QA
  -> contact-sheet and animated-preview review
  -> Codex Pet atlas and manifest packaging
  -> import and activation
```

The user does not need to prepare a collage, sprite sheet, model sheet, or action grid. OpenPet owns those intermediate artifacts.

## Single-Reference Provider Contract

The user supplies exactly one source image for a normal generation run. Every image-provider request may contain at most one image attachment.

OpenPet may derive local artifacts from the source image and previously generated outputs. When a generation stage needs several visual cues, OpenPet must compose them locally into one bounded composite reference board and send that board as the request's only image. It must never attach the source, anchor, and keyframes as separate images in one provider request.

Each provider stage records which single artifact was used as its reference. Provider credentials and raw provider details remain host-owned and must not enter renderer or ordinary plugin payloads.

## Identity Contract

The source image is the highest authority for visible identity. Text may describe the name, temperament, requested action, or an explicitly requested transformation, but it must not silently override species, silhouette, proportions, face, eye treatment, palette, material, markings, or signature accessories.

The canonical character must use a transparent background, show the complete body with safe padding, remain readable at desktop-pet scale, and establish a stable lower-center root anchor. Every action stage reuses an identity-bearing single reference artifact.

## Codex Pet Action Contract

The deliverable follows the official Codex Pet atlas contract:

- atlas size: `1536x1872`;
- grid: `8` columns by `9` rows;
- cell size: `192x208`;
- transparent background and fully transparent unused cells.

The required rows are:

| Row | Action | Frames | Required semantics |
| ---: | --- | ---: | --- |
| 0 | `idle` | 6 | Calm breathing or blinking loop |
| 1 | `running-right` | 8 | Directional movement to the right |
| 2 | `running-left` | 8 | Framewise horizontal mirror of the approved `running-right` row |
| 3 | `waving` | 4 | Clear greeting gesture |
| 4 | `jumping` | 5 | Anticipation, lift, peak, descent, settle |
| 5 | `failed` | 8 | Error, sad, or deflated reaction |
| 6 | `waiting` | 6 | Waiting for user input or approval |
| 7 | `running` | 6 | Active work, processing, scanning, or focus; not directional running |
| 8 | `review` | 6 | Focused inspection or thinking loop |

The standard full-pet flow generates `running-right` once and deterministically derives `running-left` by mirroring the approved frames horizontally. It does not spend a separate provider request on `running-left`. Frame order, frame durations, alpha, cell dimensions, and root-anchor timing remain unchanged, and the mirrored row must pass direction, stability, and atlas QA before it receives `approved-mirror` quality.

If a directional accessory, marking, symbol, or text makes mirroring visually invalid, the standard flow blocks the pair for human review instead of silently issuing a second generation request or importing an inconsistent row. All other actions require genuine action-specific visual generation. Translation, scaling, rotation, deformation, or tiling of the base character cannot count as a real action.

## Directional Pair Optimization

`running-right` and `running-left` are one motion design expressed in two directions. Treating them as independent provider generations would introduce unnecessary identity, gait, timing, and silhouette variance.

The directional pair pipeline is:

```text
single composite reference board
  -> provider-generated running-right sheet
  -> frame extraction and running-right QA
  -> explicit running-right approval
  -> framewise horizontal mirror
  -> running-left direction and stability QA
  -> paired atlas rows with identical frame timing
```

This makes the official nine-row pet require eight action-generation jobs in the normal case. The ninth row is a deterministic, QA-gated directional derivative rather than an additional model output.

## Quality-First Generation Design

The current production direction is quality-first. The canonical document must not present a base-transform atlas as a successful full-pet mode.

Generation proceeds in inspectable stages:

1. Validate the single user image and reject collages, multi-view sheets, unsafe formats, excessive size, or unreadable sources.
2. Normalize the source locally and build a single identity reference artifact.
3. Generate or select the canonical character anchor.
4. Build action semantics and key-pose requirements for one action.
5. Compose one action reference board from the identity anchor and bounded action cues.
6. Request a complete provider-generated action sheet or row using that board as the only image attachment; skip a separate `running-left` request.
7. Extract frames, remove edge-connected backgrounds where safe, normalize slots, and preserve the stable root anchor.
8. After `running-right` passes QA and approval, mirror its frames into `running-left` without changing order or timing.
9. Run technical, identity, motion, semantic, directional-pair, and atlas QA.
10. Generate contact sheets and animated previews for human review.
11. Repair only the smallest failing scope, then compose and import the approved atlas.

Independent per-frame generation is not the preferred production strategy because it has produced unacceptable whole-character redraw and identity drift. Local deterministic processing may extract, cut out, align, mirror the one approved directional row, and package provider-generated art; it may not manufacture missing action semantics.

## Quality Gates

Technical QA blocks:

- incorrect image dimensions, grid shape, or frame count;
- empty used cells or non-transparent unused cells;
- unsafe file paths or mismatched artifact hashes;
- opaque provider backgrounds that prevent safe extraction;
- cropping, transparent RGB residue, or invalid alpha;
- excessive centroid, baseline, scale, or visible-area instability;
- repeated, near-static, or transform-only frames.

Identity QA checks whole-sprite and stable face/body-core consistency against the canonical identity reference. Motion QA checks that moving parts and key poses match the action plan. Semantic QA checks direction, gesture, work-state meaning, and loop readability.

Deterministic QA is necessary but not sufficient. Production approval also requires human inspection of the canonical character, per-action contact sheets, animated previews, cross-row identity consistency, silhouette readability, background cleanliness, and the final atlas.

## Failure And Repair Policy

Failures remain explicit and do not silently downgrade to base-transform output.

- Invalid source: ask for one clean reference image.
- Provider failure or timeout: retain sanitized stage evidence and allow a bounded retry.
- Identity drift: rebuild the single composite board or regenerate the smallest affected action scope.
- Motion or semantic failure: regenerate the failing row with stronger key-pose guidance.
- Extraction instability: apply deterministic stable-slot correction only when the provider art itself is valid.
- QA hash mismatch: invalidate approval and rerun QA against the current files.
- Human rejection: keep the result unapproved and repair the selected character or action artifact.

## Canonical Document Outline

`docs/pet-character-generation.md` uses this structure:

1. Purpose and current implementation truth
2. User experience and non-goals
3. Official Codex Pet output contract
4. Single-reference provider rule
5. End-to-end generation architecture
6. Canonical identity and composite reference boards
7. Action semantics and row generation
8. Frame extraction, stabilization, atlas composition, and import
9. Automated QA and mandatory human review
10. Failure recovery and artifact provenance
11. Code map and ownership boundaries
12. Test matrix and real-provider verification
13. Known limitations and next engineering work
14. Historical evidence links

The document distinguishes implemented behavior, current limitations, and future work. It must never describe a planned stage as already implemented or smoke success as proof of production art quality.

## Verification

Documentation consolidation must pass:

```sh
node --test tests/docs/live-docs-creator-studio.test.js
npm run check:docs-drift
npm run check:syntax
```

Any changed documentation link must resolve. A targeted documentation regression should assert that current project documents link to `docs/pet-character-generation.md` and do not duplicate superseded mode language. No real provider call is required for documentation-only consolidation.

## Acceptance Criteria

- One English document is the current authority for dev8 pet character and action generation.
- The document accurately reflects the branch implementation and its known quality gaps relative to `main`.
- The user supplies one reference image and every provider request accepts no more than one image attachment.
- Composite reference boards are explicitly local, bounded, inspectable intermediate artifacts.
- The official nine-row Codex Pet contract and quality-first policy are unambiguous.
- `running-right` is generated once and `running-left` is its deterministic, QA-gated framewise mirror, so the normal flow does not spend a second provider request on the directional pair.
- Base transforms cannot be presented as generated actions.
- Automated QA and human visual approval responsibilities are separated clearly.
- Superseded dev8 development plans and specifications are removed after their valid content is consolidated.
- Release evidence remains unchanged.
- General project documentation links to the authority without duplicating its protocol.
- Documentation verification passes and the worktree contains no unrelated changes.
