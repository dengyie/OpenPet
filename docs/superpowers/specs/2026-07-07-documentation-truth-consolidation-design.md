# Documentation Truth Consolidation Design

> Date: 2026-07-07
> Branch: `codex/dev7`
> Status: approved design, pending implementation plan
> Scope: docs entry cleanup, current-truth alignment, evidence-path consistency, and drift prevention

## 1. Purpose

OpenPet now has several mature documentation tracks: product overview, active TODOs, handoff notes, Agent Awareness, release evidence, plugin authoring, and historical phase/review archives. The content is valuable, but contributors can still lose time deciding which document is the current source of truth.

This milestone consolidates the documentation truth model without rewriting the entire docs tree. The goal is a small number of clear entry points, honest current-state language, and a drift-resistant map from overview docs to detailed evidence.

## 2. Problem Statement

The current docs set has three maintenance risks:

1. multiple documents describe "current status" with overlapping detail;
2. live docs and historical phase docs can look equally authoritative to a new reader;
3. synthetic evidence, real smoke evidence, and manual-required gaps are easy to blur if repeated in too many places.

There is also a product-quality truth that must stay explicit: Creator Studio and image-provider evidence may prove command wiring, provider reachability, prompt generation, and frame/atlas QA, but pet image generation is not production-quality unless the generated pet remains highly consistent with the user's original pet image. Visual identity and style fidelity are a product acceptance gate, not a fact to infer from synthetic or provider smoke tests alone.

## 3. Milestone Contract

### Milestone

Documentation Truth Consolidation And Entry Cleanup.

### Goal

Make OpenPet docs maintainable as a "few current entry points plus focused truth docs plus historical archives" system.

### P0/P1 Scope

- Clarify the responsibilities of `docs/README.md`, `docs/HANDOFF.md`, `docs/TODO.md`, and `docs/openpet-current-todo-architecture.md`.
- Align Agent Awareness, desktop release, plugin/community-source, and release-evidence narratives with current repository truth.
- Absorb the currently dirty documentation edits for Agent Awareness and desktop release, deciding which content belongs in canonical live docs and which remains narrow runbook/evidence context.
- Preserve the distinction between automated evidence, synthetic rehearsals, real smoke evidence, and manual-required acceptance.
- Make generated pet image quality language explicit: high consistency with the user's original pet image remains required before claiming asset/product quality.
- Keep the docs drift suite aligned with the consolidated truth model.

### Out Of Scope

- New product code or UI behavior.
- Full rewrite of all historical phase, review, or plan documents.
- New real-provider, packaged-app, signing, notarization, or Windows machine evidence.
- New image generation QA implementation beyond documentation truth and future acceptance wording.
- Marketing copy expansion.

### Manual-Required

- Human review of generated pet image fidelity against the user's original image.
- Human desktop acceptance for Agent Awareness dashboard usefulness and speech noise.
- Real packaged app, signing, notarization, and Windows smoke validation.
- Any provider account, production key, certificate, notarization, or third-party permission.

## 4. Documentation Architecture

The docs should follow a hub-and-spoke model.

### 4.1 Main navigation hub

`docs/README.md` should answer one question: "Where should I read next?"

It should not carry long current-state narration. It should point readers to:

- maintainer continuation: `docs/HANDOFF.md`;
- active queue: `docs/TODO.md`;
- architecture-owned backlog explanation: `docs/openpet-current-todo-architecture.md`;
- Agent Awareness: `docs/agent-awareness-development-design.md`;
- desktop release truth: `docs/desktop-release-design.md`;
- plugin authoring and community-source path: `docs/plugin-development.md`;
- release evidence index: `docs/release-evidence/README.md`;
- historical audit records: `docs/phases/`, `docs/reviews/`, and old `docs/superpowers/` plans/specs.

### 4.2 Current-state entry points

`docs/HANDOFF.md` should stay compact. It is for maintainers resuming work, not for complete design history.

`docs/TODO.md` should remain the canonical active queue. It should not become a second handoff or a full architecture document.

`docs/openpet-current-todo-architecture.md` should explain why TODOs belong to specific architecture boundaries. It can be longer than `HANDOFF.md`, but it should still describe current facts and future queue items without reopening closed milestones.

### 4.3 Focused truth docs

`docs/agent-awareness-development-design.md` remains the canonical Agent Awareness overview. It should define shipped baseline, phase boundaries, privacy rules, manual acceptance gaps, and links to the runbook/evidence.

`docs/desktop-release-design.md` remains the desktop release truth source. It should keep macOS and Windows claims conservative, distinguish archived-but-not-ready evidence from release readiness, and preserve the current `v1.0.1-rc.3` signed-readiness failures.

`docs/plugin-development.md` remains the plugin authoring and ecosystem-entry document. It should keep current `plugin.json` package requirements, community-source intake/bridge/discovery flow, and external ecosystem split language accurate.

`docs/release-evidence/README.md` remains the evidence index. It should keep synthetic rehearsal boundaries, real smoke evidence, archive manifests, and manual-required gates visible without copying full runbooks.

### 4.4 Historical archive docs

Historical `docs/phases/`, `docs/reviews/`, and older `docs/superpowers/plans/` files remain useful audit records. They should not be edited into current status documents unless a specific broken current link or misleading current claim is found.

If an old file conflicts with a live entry point, the live entry point wins.

## 5. Generated Pet Image Quality Truth

The user-facing expectation is stricter than "the provider returned an image" or "the atlas QA passed." The docs must preserve this truth:

- Generated pet images should stay highly consistent with the user's original pet image, including recognizable identity, silhouette, palette, style, and important visual traits.
- Provider smoke evidence proves reachability and command/data flow, not final visual quality.
- Frame/atlas QA proves structural import readiness, not human visual fidelity.
- Any claim that a generated pet is production-quality requires human review or a future explicit visual-fidelity acceptance gate.
- Creator Studio docs should prefer language like "provider path and QA chain verified" unless there is actual evidence of original-image fidelity.
- Future implementation work may add automated visual checks, but that is outside this documentation consolidation milestone.

This requirement should be reflected where the docs discuss Creator Studio provider smoke, one-click pet generation, full-pet QA, and manual-required acceptance.

## 6. Implementation Phases

### Phase 1: Entry responsibility cleanup

Update live entry docs so each file has a clear job:

- `docs/README.md`: navigation map and current source-of-truth routing;
- `docs/HANDOFF.md`: short maintainer continuation note;
- `docs/TODO.md`: active queue;
- `docs/openpet-current-todo-architecture.md`: architecture-owned TODO explanation.

Verification:

- a new contributor can find the current queue and the right focused truth doc from `docs/README.md`;
- `HANDOFF.md` stays compact and does not duplicate detailed release or Agent Awareness design sections;
- current-priority language does not claim manual-required evidence is complete.

### Phase 2: Focused truth alignment

Align focused docs:

- `docs/agent-awareness-development-design.md`;
- `docs/desktop-release-design.md`;
- `docs/plugin-development.md`;
- `docs/release-evidence/README.md`;
- `docs/superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md` if its acceptance text needs to match the current mock/real boundary.

Verification:

- Agent Awareness truth distinguishes shipped Phase A code, synthetic rehearsal, real smoke evidence, and human desktop acceptance;
- desktop release truth keeps current macOS signed-readiness failures and Windows pending/unsigned status explicit;
- plugin/community-source truth distinguishes current OpenPet `plugin.json` packages from adjacent `openpets.plugin.json` or package.json-based ecosystems;
- generated image quality language does not overstate provider smoke evidence as identity/fidelity proof.

### Phase 3: Drift checks and final review

Use the existing docs truth suite first. Add only narrow checks if the consolidation creates a new high-value invariant that is not currently protected.

Verification commands:

```bash
npm run check:docs-drift
npm run test:tools
```

Run `npm run test:core` only if the implementation changes shared docs-driven fixtures, package scripts, or code-adjacent contracts.

## 7. Acceptance Criteria

The milestone is complete when:

- docs have one obvious navigation hub;
- active current-state docs no longer compete for the same role;
- Agent Awareness, release, plugin/community-source, and release-evidence docs agree on current truth;
- generated pet image quality is documented as an original-image fidelity requirement, not inferred from provider smoke or structural QA;
- synthetic, real-smoke, and manual-required evidence boundaries remain explicit;
- docs drift checks pass;
- production code review finds no P0/P1 documentation-risk blockers;
- changes are committed in one or more small documentation commits.

## 8. Review Risks

Primary risks:

- making `HANDOFF.md` too long again;
- turning `TODO.md` into another architecture essay;
- accidentally implying that synthetic rehearsals replace real acceptance;
- accidentally implying that provider generation quality is proven when only command/data flow is proven;
- over-editing historical audit documents that should remain stable.

Review should focus on whether a future contributor can identify the current truth without reading every historical phase.

## 9. Backlog

Not part of this milestone:

- a full docs site or generated docs navigation;
- automated visual-fidelity scoring for generated pets;
- new Creator Studio UI for side-by-side original/generated image review;
- provider-specific image quality benchmark reports;
- a complete phase archive migration.
