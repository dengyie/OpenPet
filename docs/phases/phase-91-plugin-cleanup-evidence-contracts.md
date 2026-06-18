# Phase 91: Plugin Cleanup Evidence Contracts

> Date: 2026-06-18
> Scope: add shared TypeScript contracts for plugin cleanup archive manifests and runner results.

## Goal

Phase 91 closes the contract gap left by the Phase 89/90 cleanup evidence tooling.

Phase 89 introduced cleanup evidence archive manifests. Phase 90 introduced an executable cleanup evidence runner that records collector transcripts and returns a structured run result. Those JSON shapes now have shared TypeScript contracts in `src/shared/openpet-contracts.ts` and representative fixtures in the shared typecheck suite.

This phase is contract-only. It does not change cleanup execution, cleanup readiness rules, plugin runtime behavior, or release support claims.

## Scope

In scope:

- `PluginCleanupEvidenceValidationResult` and summary contracts;
- `PluginCleanupEvidenceArchiveManifest` and nested archive/evidence file contracts;
- `PluginCleanupEvidenceCollectorRun` transcript contract;
- `PluginCleanupEvidenceRunResult` contract;
- representative fixtures in `tests/shared/openpet-contracts-type-fixture.ts`;
- documentation updates that make Phase 91 the current TypeScript cleanup-evidence boundary.

Out of scope:

- changing Phase 89 archive manifest runtime behavior;
- changing Phase 90 runner behavior;
- marking cleanup checks as passed automatically;
- packaged app UI cleanup automation;
- universal process-tree cleanup guarantees.

## Implementation

Updated files:

- `src/shared/openpet-contracts.ts`
- `tests/shared/openpet-contracts-type-fixture.ts`
- `docs/superpowers/plans/2026-06-18-plugin-cleanup-evidence-contracts-phase91.md`

Behavior:

1. Cleanup evidence report validation output is now represented as a shared TS contract.
2. Cleanup archive manifests now have typed report, collector, evidence, error, and warning sections.
3. Collector runs now have typed transcript metadata for start/end timestamps, command, timeout, exit status, signal, paths, and serialized error text.
4. Runner results now tie the collector transcript to the archive manifest in one typed result shape.
5. Representative fixtures prove the contracts match the script output shapes used by Phase 89/90.

## Decision Record

### Contract-only instead of runtime rewrite

The cleanup evidence scripts are already covered by Node tests and are intentionally conservative CommonJS release tooling. Phase 91 keeps that runtime stable and adds compile-time coverage at the shared boundary.

### Partial report environment/scenario in manifests

The archive manifest script falls back to empty objects when a report cannot be loaded. The contract uses partial report environment/scenario shapes so invalid archives can still be typed and diagnosed instead of pretending the fields always exist.

### Readiness wording unchanged

`cleanupReady` still comes from strict report validation. A successful runner/archive can remain `cleanupReady: false` until a maintainer reviews evidence and marks every required check as pass.

## Validation

Red check:

```bash
npm run typecheck
```

Result before implementation:

- failed because `PluginCleanupEvidenceArchiveManifest`, `PluginCleanupEvidenceCollectorRun`, and `PluginCleanupEvidenceRunResult` were not exported.

Targeted validation:

```bash
npm run typecheck
node --test tests/release/plugin-cleanup-evidence-archive-manifest.test.js tests/release/plugin-cleanup-evidence-runner.test.js
```

Result:

- TypeScript no-emit passed.
- 19/19 targeted cleanup archive/runner tests passed.

Full verification is recorded in the Phase 91 review note.
