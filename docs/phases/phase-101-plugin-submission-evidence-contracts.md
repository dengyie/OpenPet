# Phase 101: Plugin Submission Evidence Contracts

> Date: 2026-06-18
> Scope: add shared TypeScript contracts for plugin submission bundles, maintainer approval records, and submission evidence rehearsal summaries.

## Goal

Phase 74 through Phase 76, Phase 99, and the Phase 100 intake layer introduced a full plugin submission evidence chain:

- submission bundle summaries;
- maintainer approval records;
- existing-plugin real-world rehearsal summaries;
- remote-source rehearsal summaries;
- community-source submission evidence summaries.

Those JSON boundaries were already persisted by the release tooling, but they were still missing from the shared TypeScript contract surface. Phase 101 closes that gap so the submission evidence chain now type-checks against representative fixtures in the same way earlier release and cleanup evidence artifacts do.

This phase is contract-only. It does not change plugin validation behavior, submission readiness rules, maintainer approval semantics, provenance wording, or runtime trust claims.

## Scope

In scope:

- shared contracts for plugin submission reports, PR packets, bundle summaries, and bundle validation results;
- shared contracts for maintainer approval records and approval validation results;
- shared contracts for existing-plugin, remote-source, and community-source submission evidence summaries;
- representative fixtures in `tests/shared/openpet-contracts-type-fixture.ts`;
- live-doc updates that make Phase 101 the current plugin-submission TypeScript boundary.

Out of scope:

- changing submission bundle generation behavior;
- changing maintainer approval readiness logic;
- changing Phase 75 / 76 / 99 archive contents;
- upgrading signing, publication, runtime safety, or release readiness claims;
- collecting a live independent third-party community archive.

## Implementation

Updated files:

- `src/shared/openpet-contracts.ts`
- `tests/shared/openpet-contracts-type-fixture.ts`

Added files:

- `docs/phases/phase-101-plugin-submission-evidence-contracts.md`
- `docs/reviews/phase-101-plugin-submission-evidence-contracts-review.md`

Live-doc updates:

- `docs/HANDOFF.md`
- `docs/development-summary.md`
- `docs/project-status-review.md`
- `docs/project-context.json`
- `docs/productization-v1.1-todo-design.md`
- `docs/project-review-todo-design.md`

Behavior:

1. Shared contracts now cover submission-bundle JSON summaries and validation output.
2. Shared contracts now cover maintainer approval JSON records and validation output.
3. Shared contracts now cover the top-level evidence summaries produced by the existing-plugin, remote-source, and community-source submission rehearsal commands.
4. Representative fixtures now mirror real archived Phase 75 / 76 / 99 output shapes so `npm run typecheck` proves the shared contract surface matches persisted evidence.

## Decision Record

### Decision 1: keep submission evidence work contract-only

- Problem: the current gap was type drift across persisted JSON artifacts, not runtime behavior.
- Choice: add shared contracts and fixtures without touching the submission scripts.
- Reason: the submission evidence tooling is already covered by runtime tests and intentionally stays conservative and file-oriented.
- Risk: runtime shape changes in the future still require fixture updates; that is intentional because it keeps drift visible.

### Decision 2: match real JSON optionality instead of idealizing the schema

- Problem: some persisted submission summary fields, especially signature details, are omitted unless the underlying scripts actually emit them.
- Choice: keep optional properties optional in the shared contracts.
- Reason: the contract should describe the real artifact boundary, not a stricter invented variant that breaks type-checking on valid archives.
- Risk: consumers must continue handling missing optional signature metadata explicitly.

### Decision 3: reuse archived evidence shapes instead of synthetic “nice” fixtures

- Problem: hand-invented fixtures can drift from the actual evidence chain and give false confidence.
- Choice: derive the fixture shapes from the archived Phase 75 / 76 outputs and the Phase 99 script output contract.
- Reason: the shared type suite is most useful when it locks onto the real persisted artifacts.
- Risk: fixture values are verbose, but the tradeoff is worthwhile for evidence-boundary accuracy.

## Validation

Red check:

```bash
npm run typecheck
```

Result before implementation:

- failed because plugin submission evidence summaries were still untyped at the shared contract boundary.

Targeted validation:

```bash
npm run typecheck
```

Result:

- TypeScript no-emit passed with the new submission evidence fixtures.

Full verification is recorded in the Phase 101 review note.
