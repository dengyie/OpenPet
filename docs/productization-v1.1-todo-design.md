# OpenPet v1.1 TODO Design

> Date: 2026-06-16
> Baseline: Phase 48 completed locally
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
- TypeScript scaffold, Control Center view contracts, API facade, hook state boundaries, and pane prop surfaces exist.
- Windows, desktop picker, packaged runtime, and release evidence tooling exist as validators, reports, runbooks, or archive manifests.

### Still Open

- macOS signed/notarized release evidence still needs real artifact capture and archive.
- Windows signed installer/zip smoke evidence still needs real Windows execution.
- Packaged runtime smoke reports still need real app evidence for pet window visibility, transparent rendering, bundled pack switching, and native picker flows.
- Plugin secrets policy is not finalized.
- Plugin scaffolding is not yet a one-command authoring path.
- Plugin sandbox strategy has been evaluated against SES and Electron `utilityProcess`; current recommendation is to keep the existing runner for v1.1 while documenting limits.
- AI behavior orchestration has a Control Center decision viewer, replay, redacted diagnostics export, and clear-history controls.
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

**Status**: completed in Phase 39. The evaluation lives in `docs/plugin-sandbox-evaluation.md`, with generator coverage in `scripts/create-plugin-sandbox-evaluation.js` and `tests/scripts/create-plugin-sandbox-evaluation.test.js`.

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
- `src/control-center/src/hooks/useActionsPane.ts`
- `src/shared/`
- `tests/pet-pack/schema.test.js`
- `tests/pet-pack/importer.test.js`
- `tests/services/pet-pack-service.test.js`

**Acceptance**:

- An installed pack can be exported and re-imported.
- Version conflict behavior is deterministic and visible to the user.
- Built-in and imported packs expose enough metadata for a release reviewer to audit source and license status.

**Status**: completed in Phase 40. Export is available through service, IPC, preload, and Control Center Actions. Provenance and deterministic conflict summaries are covered by service and IPC tests.

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
- `src/control-center/src/hooks/useAiPane.ts`
- `src/shared/`
- `tests/services/behavior-orchestrator-service.test.js`
- `tests/services/ai-action-orchestrator.test.js`
- `tests/control-center/control-center-smoke.spec.js`

**Acceptance**:

- A user can explain why a specific AI response did or did not trigger an action.
- Rule edits can be dry-run before saving.
- Log export is useful for debugging and covered by redaction tests.

**Status**: completed in Phase 41. Control Center AI now shows behavior decisions, supports replay by decision id, exports redacted diagnostics, and clears decision history.

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

**Status**: completed for automated packaged runtime evidence. The archived macOS session `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/` proves launch, pet window, transparent background, visible sprite, speech bubble, action playback, built-in pack switching, and final state restore. Native picker checks still require a linked ready desktop picker smoke report before full runtime readiness can be claimed.

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

**Status**: completed as a signed release claim gate. The archived closure report under `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/` records the current truth as `releaseReady: false` for official desktop, macOS, and Windows claims. Real signed macOS evidence, Windows Authenticode smoke, native picker evidence, and Windows packaged runtime evidence are still required before any official release-ready wording can be used.

### Phase 44: Plugin Author Experience Rehearsal

**Goal**: turn plugin authoring from "tools exist" into a documented, repeatable third-party-style workflow.

**Scope**:

- Keep the current child-process + Node permission-model + VM runner and conservative security language.
- Exercise scaffolded minimal, network, storage, and AI-assisted plugin paths.
- Generate README, validation command, package command, and submission checklist from the author path.
- Run one third-party-style submission rehearsal through validation, review packet, PR packet, and workflow bundle tooling.
- Keep secret-like config fields rejected unless a future main-process-only secret capability is explicitly designed.

**Likely files**:

- `scripts/create-openpet-plugin.js`
- `examples/plugins/`
- `docs/plugin-development.md`
- `docs/plugin-submission-workflow-playbook.md`
- `docs/plugin-ecosystem-rules.md`
- `tests/scripts/create-openpet-plugin.test.js`
- `tests/scripts/validate-plugin-package.test.js`

**Acceptance**:

- A new plugin author can scaffold, run, validate, package, and create a submission bundle from documented commands.
- Example coverage spans the main permission classes without exposing secrets.
- Submission rehearsal produces reviewable Markdown and JSON artifacts.
- No user-facing docs claim unrestricted plugin safety.

**Status**: completed as an author rehearsal. `create-openpet-plugin` now covers minimal, network, storage, and AI-assisted templates; `create-plugin-author-rehearsal` generates and validates the full author path, including an AI plugin zip and a ready-for-human-review submission bundle. The archived rehearsal lives under `docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/`.

### Phase 45: TypeScript Boundary Expansion

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

**Status**: completed for the first high-value boundary expansion. Control Center API facade is now TypeScript, `window.controlCenterAPI` is typed, demo API satisfies `ControlCenterApi`, shared contracts cover actions, pet packs, plugins, catalog, AI, service, release evidence, and signed release summaries, and a type fixture keeps representative payloads in the no-emit check. Review fixes aligned catalog pet pack `kind: 'pet-pack'`, required `sourcePackageHash`, and modeled canceled/validation-failure result paths accurately.

### Phase 46: Documentation Consolidation

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

**Status**: completed as live-doc consolidation. `project-status-review.md` is now a concise current snapshot, `HANDOFF` and `development-summary` are shorter and link-oriented, roadmap/TODO facts reflect Phase 45 completion, and `project-context.json` remains the compact machine-readable state.

### Phase 47: TypeScript Hook Boundary Migration

**Goal**: continue the TypeScript migration from API facade contracts into Control Center hook state and handler boundaries.

**Scope**:

- Rename Control Center pane hooks from `.js` to `.ts`.
- Type hook state and user-event handlers with shared contracts.
- Convert small renderer helpers that are directly consumed by typed hooks.
- Keep Electron main process CommonJS stable and avoid broad UI rewrites.
- Preserve existing Control Center behavior and Playwright baselines.

**Likely files**:

- `src/control-center/src/hooks/`
- `src/control-center/src/lib/`
- `src/control-center/src/App.jsx`
- `src/control-center/src/panes/PetPane.jsx`
- `package.json`
- `package-lock.json`

**Acceptance**:

- `npm run typecheck` covers migrated hook state and handler boundaries.
- Hook initialization failures do not leave tabs stuck in loading.
- `npm run check:syntax`, `npm run test:control-center`, `npm test`, and `git diff --check` pass.
- Renderer changes do not expose API keys or widen plugin privileges.

**Status**: completed in Phase 47. The seven Control Center hooks, download helper, and renderer error helper are typed; React type dependencies are installed; initialization failure paths now surface status messages; review caught and fixed a Pet status-line regression.

### Phase 48: Control Center Pane Prop Surfaces

**Goal**: close the renderer UI TypeScript loop by checking the props each Control Center Pane consumes.

**Scope**:

- Rename Control Center Pane components from `.jsx` to `.tsx`.
- Export a props interface from each Pane.
- Make each hook return `paneProps satisfies XxxPaneProps`.
- Type small renderer support components and constants used by typed Panes.
- Keep plugin schema validation in the main process and use renderer guards only for displayable config fields.

**Likely files**:

- `src/control-center/src/panes/`
- `src/control-center/src/hooks/`
- `src/control-center/src/components/`
- `src/control-center/src/constants.ts`
- `src/shared/openpet-contracts.ts`

**Acceptance**:

- `npm run typecheck` covers Pane props and hook `paneProps` contracts.
- `npm run check:syntax`, `npm run test:control-center`, `npm test`, and `git diff --check` pass.
- Shared contract additions match existing runtime payloads.
- Renderer changes do not expose API keys or widen plugin privileges.

**Status**: completed in Phase 48. The seven Control Center Panes, shared support components, and constants are typed; each hook now satisfies its Pane props contract; shared contracts were aligned with existing action, pet pack, catalog, plugin schema, and update payloads.

## 6. Priority Order

| Priority | Work | Reason |
|----------|------|--------|
| P0 | Phase 42 real packaged runtime evidence | Directly proves the desktop pet actually renders after packaging. |
| P0 | Phase 43 signed release evidence closure | Controls release/support claims and user trust. |
| P1 | Phase 40 pet pack export and provenance | Completed; keep provenance and conflict review as constraints for future catalog work. |
| P1 | Phase 44 plugin author experience rehearsal | Completed; use the archived rehearsal as the plugin author baseline. |
| P1 | Phase 45 TypeScript boundary expansion | Completed; preserve shared contracts as the migration gate for future UI and IPC work. |
| P1 | Phase 47 TypeScript hook boundary migration | Completed; use typed Control Center hooks as the next UI boundary baseline. |
| P1 | Phase 48 Control Center pane prop surfaces | Completed; use Pane props plus hook `satisfies` checks as the current renderer UI contract baseline. |
| P2 | Phase 41 AI behavior replay | Completed; preserve redacted diagnostics and replay semantics while future AI tooling evolves. |
| P2 | Phase 39 plugin sandbox evaluation | Completed; keep current runner for v1.1 and revisit on high-risk plugin capability changes. |
| P2 | Phase 46 documentation consolidation | Completed; keep future live-doc updates fact-only and link-oriented. |

## 7. Recommended Execution Sequence

1. Phase 42 is complete; use archived packaged runtime evidence as the automated macOS runtime baseline.
2. Phase 43 is complete; use the signed release closure report to preserve not-ready platform claims until real signed evidence exists.
3. Phase 38 and Phase 39 are complete; keep their plugin secrets and sandbox boundaries as constraints for future plugin work.
4. Phase 40 is complete; preserve pet pack export/provenance behavior while catalog work evolves.
5. Phase 41 is complete; use AI behavior replay and diagnostics as the baseline for future behavior tooling.
6. Phase 44 is complete; keep the archived author rehearsal as the plugin onboarding baseline.
7. Phase 45 is complete; use the shared contracts and Control Center API facade as the API boundary baseline.
8. Phase 46 is complete; keep future live-doc updates fact-only and link-oriented.
9. Phase 47 is complete; typed Control Center hooks are the UI state boundary baseline.
10. Phase 48 is complete; Pane props are now checked against hook output. Choose the next phase from evidence work, main-process JSDoc adapters, or a high-drift service boundary.

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
- shared TypeScript contracts, typed Control Center hooks, and typed Pane props cover the UI/API boundaries most likely to drift.
- live docs are concise, current, and not contradicted by phase history.
