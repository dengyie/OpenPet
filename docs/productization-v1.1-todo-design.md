# OpenPet v1.1 TODO Design

> Date: 2026-06-16
> Baseline: Phase 37 development state
> Scope: Convert the remaining productization TODO into a phase-ready design for v1.1 work. This document does not upgrade platform support claims. Windows remains not release-ready until signed runtime smoke evidence passes.

## 1. Goal

OpenPet has reached the intended platform shape: Electron desktop pet runtime, Control Center, pet packs, Codex pet import, bundled pets, plugins, AI behavior orchestration, local HTTP/MCP, desktop release tooling, and release evidence validators.

The v1.1 TODO is no longer about proving the platform can exist. It is about making the platform trustworthy for real users and maintainable for third-party contributors:

- signed release evidence is auditable,
- packaged runtime behavior is validated against actual app bundles,
- plugin authors have a safe and repeatable path,
- pet assets have lifecycle and provenance,
- AI behavior is explainable and replayable,
- TypeScript migration keeps tightening cross-boundary contracts without destabilizing Electron startup.

## 2. Current Baseline

### Completed or Effectively Baseline

- Control Center is modular and covered by Playwright smoke/regression tests.
- PetService remains the single source of truth for `say`, `action`, and event state.
- Pet pack runtime supports legacy cat assets, OpenPet packs, Codex pet directory import, Codex pet zip import, and bundled packs.
- Bundled pet assets are integrated without replacing the legacy `cat_anime/` structure.
- Plugin runtime has manifest validation, permission review, isolated runner, storage limits, network allowlist, logs, catalog, blocklist, and submission tooling.
- AI provider configuration and API keys remain in the main process boundary.
- Local HTTP/MCP is loopback-only, token-gated, logged, and off by default.
- TypeScript scaffold and Control Center view contracts exist.
- Windows, desktop picker, packaged runtime, and release evidence tooling exist as validators, reports, runbooks, or archive manifests.

### Still Open

- macOS signed/notarized release evidence still needs real artifact capture and archive.
- Windows signed installer/zip smoke evidence still needs real Windows execution.
- Packaged runtime smoke reports still need real app evidence for pet window visibility, transparent rendering, bundled pack switching, and native picker flows.
- Plugin secrets policy is not finalized.
- Plugin scaffolding is not yet a one-command authoring path.
- Plugin sandbox strategy has not been re-evaluated against SES or Electron `utilityProcess`.
- Pet pack export, version overwrite/upgrade rules, and provenance/license metadata are still incomplete.
- AI behavior orchestration lacks a user-facing decision viewer and replay/dry-run tool.
- Documentation still needs another consolidation pass after the v1.1 execution track stabilizes.

## 3. Non-Goals

- Do not claim Windows release readiness before signed Windows smoke evidence passes.
- Do not move API keys into renderer code, plugin configuration, or ordinary plugin storage.
- Do not rewrite the Electron main process to TypeScript/ESM in one step.
- Do not replace the existing plugin runner before a sandbox comparison proves the migration path.
- Do not change the existing `cat_anime/` asset structure.
- Do not build a remote marketplace backend before local submission, review, and provenance workflows are solid.

## 4. Design Principles

1. **Evidence before claims**: README, release notes, About text, and release checklist must only state what evidence supports.
2. **Contracts before rewrites**: TypeScript work should prioritize IPC payloads, settings, manifests, catalog entries, release evidence summaries, and Control Center API boundaries.
3. **Packaged app before dev-only proof**: pet rendering, pack switching, and native pickers must be proven against an installed or packaged app, not only Vite/demo paths.
4. **Plugin expansion must be reviewable**: every new plugin capability must appear in manifest validation, Control Center review, logs, and submission tooling.
5. **Asset lifecycle must be auditable**: built-in and imported pet packs need source, license, version, and export behavior.
6. **Debuggability is a product feature**: AI behavior and plugin decisions should be explainable from Control Center without reading logs by hand.

## 5. Phase Design

### Phase 38: Plugin Secrets Decision and Scaffolding

**Goal**: remove ambiguity around plugin secrets and give plugin authors a reliable starting path.

**Scope**:

- Decide whether v1.1 supports plugin-scoped secrets.
- If secrets are supported, define a main-process-only capability such as `secrets:get` / `secrets:set` with explicit manifest permission and Control Center review.
- If secrets are not supported, make validators and docs reject or warn on secret-like plugin config fields.
- Add a local plugin scaffold command or template set for:
  - minimal pet command plugin,
  - network allowlist plugin,
  - private storage plugin.
- Update `docs/plugin-development.md` and submission workflow docs.

**Likely files**:

- `src/main/plugins/manifest-schema.js`
- `src/main/services/plugin-install-service.js`
- `src/main/services/plugin-service.js`
- `scripts/validate-plugin-package.js`
- `scripts/create-plugin-submission-report.js`
- `examples/plugins/`
- `docs/plugin-development.md`
- `docs/plugin-submission-workflow-playbook.md`
- `tests/plugins/manifest.test.js`
- `tests/services/plugin-install-service.test.js`
- `tests/scripts/validate-plugin-package.test.js`

**Acceptance**:

- A new plugin author can create, validate, package, and produce a submission packet without reading internal source files.
- Plugin secret policy is consistent across docs, validator output, review packet, and Control Center install/update review.
- Existing example plugins still pass validation.

**Status**: completed in the current Phase 38 implementation. The next open track is Phase 39.

### Phase 39: Plugin Sandbox Evaluation

**Goal**: compare the current child process + Node permission-model runner against stronger isolation candidates before expanding third-party trust.

**Scope**:

- Document current sandbox guarantees and known limits.
- Build small POCs for SES and Electron `utilityProcess`, or document why a candidate cannot be evaluated in the current Electron/Node version.
- Compare startup cost, API surface restriction, filesystem/network behavior, debugging experience, crash isolation, packaging impact, and migration cost.
- Produce a recommendation: keep current runner for v1.1, migrate partially, or plan a later breaking change.

**Likely files**:

- `docs/plugin-sandbox-evaluation.md`
- `docs/phases/phase-39-plugin-sandbox-evaluation.md`
- `docs/reviews/phase-39-plugin-sandbox-evaluation-review.md`
- Optional POC files under `experiments/` or `tests/fixtures/`, if kept small and non-production.

**Acceptance**:

- The project has a clear, reviewable sandbox decision instead of an assumed security story.
- Docs stop short of saying plugins are absolutely safe.
- Any future runner migration has a concrete trigger and risk list.

### Phase 40: Pet Pack Export and Provenance

**Goal**: make pet packs portable, upgradeable, and auditable.

**Scope**:

- Add `.openpet-pet.zip` export for installed user packs.
- Define reinstall, overwrite, upgrade, downgrade, and same-version behavior.
- Extend pack metadata with provenance fields:
  - `sourceUrl`,
  - `assetAuthor`,
  - `license`,
  - `licenseUrl`,
  - `importedAt`,
  - `originalFormat`.
- Add Control Center review text for version conflicts and provenance.
- Ensure bundled packs include clear metadata without changing the legacy asset layout.

**Likely files**:

- `src/main/pet-pack/schema.js`
- `src/main/pet-pack/importer.js`
- `src/main/pet-pack/loader.js`
- `src/main/services/pet-pack-service.js`
- `src/control-center/src/panes/ActionsPane.jsx`
- `src/control-center/src/hooks/useActions.js`
- `src/shared/`
- `tests/pet-pack/schema.test.js`
- `tests/pet-pack/importer.test.js`
- `tests/services/pet-pack-service.test.js`

**Acceptance**:

- An installed pack can be exported and re-imported.
- Version conflict behavior is deterministic and visible to the user.
- Built-in and imported packs expose enough metadata for a release reviewer to audit source and license status.

### Phase 41: AI Behavior Replay and Decision Viewer

**Goal**: make AI-triggered pet actions explainable, testable, and safe to tune.

**Scope**:

- Add a Control Center decision viewer for recent behavior decisions.
- Show matched rule, input intent, selected `actionId`, cooldown result, fallback path, and disabled/blocked reason.
- Add dry-run/replay input for an AI reply or behavior intent.
- Allow exporting and clearing behavior logs.
- Ensure exported logs do not include API keys or full sensitive prompts.

**Likely files**:

- `src/main/services/behavior-orchestrator-service.js`
- `src/main/services/ai-service.js`
- `src/main/services/settings-service.js`
- `src/control-center/src/panes/AiPane.jsx`
- `src/control-center/src/hooks/useAiSettings.js`
- `src/shared/`
- `tests/services/behavior-orchestrator-service.test.js`
- `tests/services/ai-action-orchestrator.test.js`
- `tests/control-center/control-center-smoke.spec.js`

**Acceptance**:

- A user can explain why a specific AI response did or did not trigger an action.
- Rule edits can be dry-run before saving.
- Log export is useful for debugging and covered by redaction tests.

### Phase 42: Real Packaged Runtime Evidence Capture

**Goal**: convert packaged runtime smoke tooling into real release evidence.

**Scope**:

- Run packaged app smoke on the built macOS app bundle.
- Capture evidence for:
  - pet window creation,
  - transparent background,
  - visible sprite pixels,
  - speech bubble visibility,
  - action playback,
  - bundled pack switching,
  - plugin zip picker,
  - pet zip picker,
  - cancel and invalid-package picker paths.
- Fill packaged runtime and desktop picker smoke reports with real evidence.
- Store release evidence in an archive that can be verified later.

**Likely files**:

- `docs/release-evidence/`
- `scripts/update-packaged-runtime-smoke-report.js`
- `scripts/validate-packaged-runtime-smoke-report.js`
- `scripts/update-desktop-picker-smoke-report.js`
- `scripts/validate-desktop-picker-smoke-report.js`
- `scripts/create-release-evidence-archive-manifest.js`
- `docs/desktop-release-design.md`
- `docs/release-checklist.md`

**Acceptance**:

- Reports are no longer pending templates for the tested release artifact.
- The earlier transparent-model regression is represented as a release smoke check.
- Archive manifest validates and still keeps `releaseReady` false unless all required signed evidence is present.

### Phase 43: Signed Release Evidence Closure

**Goal**: decide whether v1.1 can make stronger release claims based on signed artifact evidence.

**Scope**:

- For macOS:
  - capture `codesign --verify --deep --strict`,
  - capture notarization accepted status,
  - capture Gatekeeper assessment,
  - capture first launch from downloaded artifact.
- For Windows:
  - capture Authenticode status for installer and zip contents,
  - capture clean-machine install/uninstall,
  - capture launch and transparent pet window behavior,
  - capture plugin runner and native picker smoke,
  - document SmartScreen/reputation result without overstating trust.
- Feed reports into the release evidence archive manifest.

**Likely files**:

- `docs/release-evidence/`
- `docs/desktop-release-design.md`
- `docs/release-checklist.md`
- `.github/workflows/release.yml`
- `scripts/create-release-evidence-archive-manifest.js`
- `tests/release/release-evidence-archive-manifest.test.js`

**Acceptance**:

- macOS release claim is backed by signed/notarized evidence.
- Windows remains explicitly not release-ready if any signed Windows smoke evidence is missing or failing.
- If Windows passes, docs are updated in one controlled phase with evidence links and support wording review.

### Phase 44: TypeScript Boundary Expansion

**Goal**: continue TypeScript migration where it gives the highest defect-reduction value.

**Scope**:

- Add shared contracts for:
  - pet pack manifests,
  - plugin manifests and review summaries,
  - catalog entries,
  - AI behavior settings,
  - local service state,
  - release evidence summaries.
- Consume these contracts from Control Center API facades, hooks, defaults, and test fixtures.
- Keep CommonJS main process stable; use JSDoc or narrow helper modules where necessary.

**Likely files**:

- `src/shared/`
- `src/control-center/src/api/`
- `src/control-center/src/hooks/`
- `src/control-center/src/lib/`
- `tests/shared/`
- `tsconfig.json`

**Acceptance**:

- New Control Center views cannot silently drift from main-process IPC payload shape.
- `npm run typecheck` is meaningful for real product data, not only scaffold files.
- `npm start`, `npm test`, `npm run test:control-center`, and `npm run check:syntax` remain passing.

### Phase 45: Documentation Consolidation

**Goal**: reduce repeated historical prose and keep current facts easy to find.

**Scope**:

- Keep README focused on current user-facing capabilities and conservative support claims.
- Keep `docs/HANDOFF.md` focused on current state, next step, and dirty-worktree warnings.
- Keep `docs/project-context.json` as the compact machine-readable state.
- Keep phase/review docs as immutable historical records.
- Collapse duplicated long-form status summaries where they no longer guide execution.

**Likely files**:

- `README.md`
- `README.zh-CN.md`
- `docs/HANDOFF.md`
- `docs/project-context.json`
- `docs/development-summary.md`
- `docs/project-status-review.md`
- `docs/project-documentation-design.md`

**Acceptance**:

- A new contributor can find current state in under five minutes.
- Test counts, platform support, release readiness, and next-phase guidance are not contradictory across live docs.
- Human-facing docs read like product/engineering documentation, not a phase transcript.

## 6. Priority Order

| Priority | Work | Reason |
|----------|------|--------|
| P0 | Phase 42 real packaged runtime evidence | Directly proves the desktop pet actually renders after packaging. |
| P0 | Phase 43 signed release evidence closure | Controls release/support claims and user trust. |
| P1 | Phase 38 plugin secrets and scaffolding | Required before plugin ecosystem expansion. |
| P1 | Phase 40 pet pack export and provenance | Required for sustainable asset distribution. |
| P1 | Phase 44 TypeScript boundary expansion | Prevents cross-process and UI data drift during v1.1 work. |
| P2 | Phase 41 AI behavior replay | Improves debuggability and user control. |
| P2 | Phase 39 plugin sandbox evaluation | Important for trust, but can follow secrets/scaffold decision if no new high-risk permissions are added. |
| P2 | Phase 45 documentation consolidation | Should happen after the v1.1 evidence and lifecycle work settles. |

## 7. Recommended Execution Sequence

1. Finish and commit the current Phase 37 release evidence archive work.
2. Execute Phase 42 to turn existing smoke tooling into real packaged runtime evidence.
3. Execute Phase 43 to close signed release evidence or explicitly preserve not-ready platform claims.
4. Execute Phase 38 and Phase 39 before adding more plugin capabilities.
5. Execute Phase 40 to make pet packs exportable and auditable.
6. Execute Phase 41 to expose AI behavior replay and diagnostics.
7. Execute Phase 44 in parallel only when a touched boundary already has active product work.
8. Execute Phase 45 after the live docs stabilize.

## 8. Verification Contract

Every implementation phase should include:

- one phase document under `docs/phases/`,
- one production review document under `docs/reviews/`,
- targeted tests for new behavior,
- live-doc updates only where current facts change,
- no unrelated staging or cleanup.

Minimum local verification:

```bash
npm run check:syntax
npm test
npm run test:control-center
```

Additional verification by scope:

```bash
npm run pack
npm run validate-packaged-runtime-smoke-report -- <report>
npm run validate-desktop-picker-smoke-report -- <report>
npm run validate-windows-smoke-report -- <report>
npm run create-release-evidence-archive-manifest -- <archive-dir> --require-signed
```

## 9. Success Criteria

v1.1 productization is complete when:

- macOS release claims are backed by signed/notarized/Gatekeeper evidence.
- Windows wording exactly matches signed smoke evidence status.
- packaged app pet rendering and native picker paths have filled, validated evidence.
- plugin authors have a clear scaffold, validation, submission, and review path.
- plugin secrets are either safely supported or explicitly rejected.
- pet packs can be exported, re-imported, version-reviewed, and source-audited.
- AI behavior can be replayed and explained from Control Center.
- shared TypeScript contracts cover the boundaries most likely to drift.
- live docs are concise, current, and not contradicted by phase history.
