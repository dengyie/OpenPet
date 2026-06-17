# OpenPet v1.1 TODO Design

> Date: 2026-06-16
> Baseline: Phase 64 completed locally
> Scope: Convert the remaining productization TODO into a phase-ready design for v1.1 work. This document does not upgrade platform support claims. Windows remains not release-ready until signed runtime smoke evidence passes.

## 1. Goal

OpenPet has reached the intended platform shape: Electron desktop pet runtime, Control Center, pet packs, Codex pet import, bundled pets, a local extension ecosystem with explicit `entries.setup` execution, language-neutral explicit `entries.commands` process execution, explicit dashboard opening, explicit service start/stop controls, manual loopback service health checks, and opt-in periodic health checks for running services, AI behavior orchestration, local HTTP/MCP, desktop release tooling, and release evidence validators.

The v1.1 TODO is no longer about proving the platform can exist. It is about making the platform trustworthy for real users and maintainable for third-party contributors:

- signed release evidence is auditable,
- packaged runtime behavior is validated against actual app bundles,
- extension authors have a transparent and repeatable path,
- pet assets have lifecycle and provenance,
- AI behavior is explainable and replayable,
- TypeScript migration keeps tightening cross-boundary contracts without destabilizing Electron startup.

## 2. Current Baseline

### Completed or Effectively Baseline

- Control Center is modular and covered by Playwright smoke/regression tests.
- PetService remains the single source of truth for `say`, `action`, and event state.
- Pet pack runtime supports legacy cat assets, OpenPet packs, Codex pet directory import, Codex pet zip import, and bundled packs.
- Bundled pet assets are integrated without replacing the legacy `cat_anime/` structure.
- Extension ecosystem docs now use a developer-first local extension model while current runtime/tools keep legacy JavaScript SDK compatibility, manifest validation, normalized `entries` declarations, explicit user-triggered `entries.setup` execution, `entries.commands` support through the existing JavaScript runner and explicit short-lived process execution for declaration-only local extensions, a short-lived command bridge for `pet.say` / `pet.action` / `pet.event` / read-only context, entry declaration visibility, explicit HTTP/HTTPS dashboard opening, explicit `entries.services` start/stop, manual loopback service health checks, logs, catalog, blocklist, and submission tooling.
- AI provider configuration and API keys remain in the main process boundary.
- Local HTTP/MCP is loopback-only, token-gated, logged, and off by default.
- TypeScript scaffold, Control Center view contracts, API facade, hook state boundaries, pane prop surfaces, main-process Control Center adapters for service/catalog/plugin/pet pack/About/update/actions payloads, plugin entry/dashboard/service contracts, and full release evidence archive / signed closure report contracts exist.
- Windows, desktop picker, packaged runtime, and release evidence tooling exist as validators, reports, runbooks, or archive manifests.

### Still Open

- macOS signed/notarized release evidence still needs real artifact capture and archive.
- Windows signed installer/zip smoke evidence still needs real Windows execution.
- Packaged runtime smoke reports still need real app evidence for pet window visibility, transparent rendering, bundled pack switching, and native picker flows.
- Extension runtime support for explicit setup execution, explicit short-lived command execution, explicit short-lived command bridge access, explicit service start/stop, manual loopback service health checks, opt-in periodic health checks for running services, and best-effort process-group cleanup now exists. Richer bridge surfaces for authoring workflows, richer command orchestration, and hard process-tree cleanup guarantees are still future work. Dashboard entries can now be opened explicitly as external HTTP/HTTPS URLs from Control Center.
- Legacy SDK plugin secrets policy remains conservative; target extension docs require honest disclosure for extension-managed secrets and data.
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
4. **Extension expansion must be observable**: every new extension capability should appear in manifest declarations, lifecycle controls, logs, health, uninstall behavior, and submission tooling.
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

### Phase 49: Main Process Control Center Adapters

**Goal**: start typing production-side Control Center payload assembly without rewriting the Electron main process.

**Scope**:

- Add a small `@ts-check` main-process adapter module.
- Consume shared contracts through JSDoc imports.
- Move Service status and Catalog blocklist result shaping out of inline IPC handlers.
- Cover adapter defaults and registered IPC handler response shape with Node tests.

**Likely files**:

- `src/main/control-center-adapters.js`
- `src/main/ipc.js`
- `tests/main/control-center-adapters.test.js`
- `tests/main/ipc-plugin-install.test.js`

**Acceptance**:

- `npm run typecheck` covers the adapter against shared contracts.
- Service status IPC returns a stable Control Center view shape.
- Catalog blocklist mutation IPC returns `{ catalog, blocklist }` through the adapter.
- `npm run check:syntax`, `npm run test:control-center`, `npm test`, and `git diff --check` pass.

**Status**: completed in Phase 49. Service status and Catalog blocklist result now use a main-process `@ts-check` adapter; targeted adapter and IPC tests were added.

### Phase 50: Plugin Mutation Control Center Adapter

**Goal**: continue typing production-side Control Center payload assembly by moving plugin mutation result shaping into the main-process adapter module.

**Scope**:

- Add a plugin mutation adapter in `src/main/control-center-adapters.js`.
- Consume `PluginMutationResult` and `PluginViewState` through JSDoc imports.
- Move plugin install/update/uninstall result shaping out of inline IPC handlers.
- Keep `PLUGINS_CLEAR_STORAGE` on its existing `Partial<PluginViewState>` contract.
- Cover the pure adapter and registered IPC handler response shape with Node tests.

**Likely files**:

- `src/main/control-center-adapters.js`
- `src/main/ipc.js`
- `src/shared/openpet-contracts.ts`
- `tests/main/control-center-adapters.test.js`
- `tests/main/ipc-plugin-install.test.js`

**Acceptance**:

- `npm run typecheck` covers the adapter against shared contracts.
- Plugin install/update/uninstall IPC returns `PluginMutationResult` with refreshed `plugins`.
- Uninstall preserves `storageRemoved`.
- `npm run check:syntax`, `npm run test:control-center`, `npm test`, and `git diff --check` pass.

**Status**: completed in Phase 50. Plugin install/update/uninstall mutation results now use the main-process `@ts-check` adapter; `PluginMutationResult` includes the real uninstall `storageRemoved` field; targeted adapter and IPC tests were added.

### Phase 51: Pet Pack Mutation Control Center Adapter

**Goal**: continue typing production-side Control Center payload assembly by moving Pet pack mutation result shaping into the main-process adapter module.

**Scope**:

- Add a Pet pack mutation adapter in `src/main/control-center-adapters.js`.
- Consume `PetPackMutationResult`, `PetPacksViewState`, and `ActionsConfigViewState` through JSDoc imports.
- Move Pet pack import/set-active/remove result shaping out of inline IPC handlers.
- Keep `PET_PACKS_EXPORT` on its existing export-result contract.
- Cover the pure adapter and registered IPC handler response shape with Node tests.

**Likely files**:

- `src/main/control-center-adapters.js`
- `src/main/ipc.js`
- `tests/main/control-center-adapters.test.js`
- `tests/main/ipc-plugin-install.test.js`

**Acceptance**:

- `npm run typecheck` covers the adapter against shared contracts.
- Pet pack import/set-active/remove IPC returns `PetPackMutationResult` with refreshed `petPacks`.
- set-active preserves returned `animations` and pet-window animation notifications.
- `npm run check:syntax`, `npm run test:control-center`, `npm test`, and `git diff --check` pass.

**Status**: completed in Phase 51. Pet pack import/set-active/remove mutation results now use the main-process `@ts-check` adapter; set-active preserves the animation refresh path; targeted adapter and IPC tests were added.

### Phase 52: About Update Control Center Adapter

**Goal**: continue typing production-side Control Center payload assembly by moving About info and update-check result shaping into the main-process adapter module.

**Scope**:

- Add About/update adapters in `src/main/control-center-adapters.js`.
- Consume `AboutInfoViewState`, `AboutUpdateInfo`, and `UpdateCheckViewState` through JSDoc imports.
- Move `ABOUT_GET_INFO` and `ABOUT_CHECK_UPDATES` response shaping out of direct IPC service returns.
- Keep GitHub release fetch, timeout, and platform asset filtering in `aboutService`.
- Cover the pure adapters and registered IPC handler response shape with Node tests.

**Likely files**:

- `src/main/control-center-adapters.js`
- `src/main/ipc.js`
- `tests/main/control-center-adapters.test.js`
- `tests/main/ipc-plugin-install.test.js`

**Acceptance**:

- `npm run typecheck` covers the adapters against shared contracts.
- About IPC returns stable `AboutInfoViewState`.
- Update-check IPC returns stable `UpdateCheckViewState`, including not-configured defaults.
- `npm run check:syntax`, `npm run test:control-center`, `npm test`, and `git diff --check` pass.

**Status**: completed in Phase 52. About info and update-check payloads now use the main-process `@ts-check` adapter; partial update-check responses are normalized to the shared contract; targeted adapter and IPC tests were added.

### Phase 53: Actions Control Center Adapter

**Goal**: continue typing production-side Control Center payload assembly by moving action mutation result shaping into the main-process adapter module.

**Scope**:

- Add action import and action mutation adapters in `src/main/control-center-adapters.js`.
- Consume `ActionFrameImportResult`, `ActionsMutationResult`, and `ActionsConfigViewState` through JSDoc imports.
- Move `ACTIONS_IMPORT_FRAMES`, `ACTIONS_SAVE_CONFIG`, and `ACTIONS_DELETE` response shaping out of inline IPC handlers.
- Preserve action import validation feedback and pet-window animation notifications.
- Cover the pure adapters and registered IPC handler response shape with Node tests.

**Likely files**:

- `src/main/control-center-adapters.js`
- `src/main/ipc.js`
- `tests/main/control-center-adapters.test.js`
- `tests/main/ipc-plugin-install.test.js`

**Acceptance**:

- `npm run typecheck` covers the adapters against shared contracts.
- Action import IPC returns success and validation-failure shapes through the adapter.
- Action save/delete IPC returns `ActionsMutationResult` without leaking internal service fields.
- `npm run check:syntax`, `npm run test:control-center`, `npm test`, and `git diff --check` pass.

**Status**: completed in Phase 53. Action import/save/delete payloads now use the main-process `@ts-check` adapter; action service internal fields no longer cross the renderer boundary; targeted adapter and IPC tests were added.

### Phase 54: Release Evidence Contracts

**Goal**: continue TypeScript boundary expansion into release evidence and release-claim payloads, where report drift can directly affect support wording.

**Scope**:

- Add full shared contracts for release evidence archive manifests.
- Add full shared contracts for signed release closure reports.
- Preserve existing lightweight summary contracts for current fixtures and summaries.
- Extend type fixtures so `npm run typecheck` covers the complete report payloads.
- Add generator tests that prove `createReleaseEvidenceArchiveManifest()` and `createSignedReleaseClosureReport()` return the shared contract shape.
- Do not generate or imply new signed evidence.
- Do not change `releaseReady` semantics or platform support wording.

**Likely files**:

- `src/shared/openpet-contracts.ts`
- `tests/shared/openpet-contracts-type-fixture.ts`
- `tests/release/release-evidence-archive-manifest.test.js`
- `tests/release/signed-release-closure-report.test.js`

**Acceptance**:

- `npm run typecheck` covers full release evidence archive and signed closure payload fixtures.
- Release archive generator tests cover `files`, `macos`, `reports`, `errors`, and `warnings`.
- Signed closure generator tests cover `manifest`, `claims`, `smartScreen`, and `nextActions`.
- Release readiness remains evidence-based and conservative.
- `npm run check:syntax`, `npm run test:control-center`, `npm test`, and `git diff --check` pass.

**Status**: completed in Phase 54. Release evidence archive manifest and signed release closure report payloads now have complete shared contracts; type fixtures and generator tests were added; Node baseline is now 424 tests.

### Phase 55: Extension Ecosystem Documentation

**Goal**: align current author-facing and ecosystem-facing docs with the developer-first local extension boundary.

**Scope**:

- Rewrite `docs/plugin-development.md` as the extension author entry point.
- Rewrite `docs/plugin-ecosystem-rules.md` around lifecycle management, transparent declarations, structural package safety, honest product language, and broad third-party local automation.
- Update README English/Chinese entry points from plugin-only language to extension development language.
- Preserve historical phase documents and legacy SDK compatibility wording.
- Do not change runtime behavior or claim a stronger sandbox.

**Likely files**:

- `README.md`
- `README.zh-CN.md`
- `docs/plugin-development.md`
- `docs/plugin-ecosystem-rules.md`
- `docs/superpowers/plans/2026-06-17-extension-ecosystem-docs.md`

**Acceptance**:

- New docs define extensions around `plugin.json`, `entries.commands`, `entries.services`, `entries.dashboards`, `manifest`, optional `config`, and `assets`.
- Legacy short-lived JavaScript SDK examples and validation commands are marked as compatibility surfaces, not the future ecosystem ceiling.
- README and ecosystem rules state that OpenPet does not fully sandbox arbitrary local processes or control every extension-managed secret.
- `rg` stale-claim search leaves only intentional legacy compatibility or non-guarantee language.
- `npm run check:syntax`, `npm run test:control-center`, `npm test`, and `git diff --check` pass.

**Status**: completed in Phase 55. Author-facing and ecosystem-facing docs now use the developer-first local extension model while preserving legacy SDK compatibility and honest non-sandbox safety language.

### Phase 56: Extension Command Entries Runtime

**Goal**: make the first target extension entry shape real without expanding process capabilities too quickly.

**Scope**:

- Normalize `entries.commands`, `entries.services`, and `entries.dashboards` in plugin manifests.
- Derive `manifest.commands` from `entries.commands` when legacy top-level `commands` are absent.
- Keep top-level `commands` as the compatibility source when both command shapes exist.
- Expose `entries` through install review and plugin list contracts.
- Let packages that still provide JavaScript `main` run `entries.commands` ids through the existing isolated SDK runner.
- Do not execute shell command strings, start services, open dashboards, or relax sandbox wording.

**Acceptance**:

- Manifest tests cover entry normalization, unsafe declaration rejection, and command precedence.
- Plugin install review accepts declaration-only extension packages and rejects missing declared assets.
- Plugin service tests prove `main` + `entries.commands` packages can run through `runCommand()`.
- Shared TypeScript contracts cover command/service/dashboard entry view shapes.
- Full verification passes with conservative docs that keep service/dashboard runtime out of current claims.

**Status**: completed in Phase 56. `entries.commands` now has compatibility runtime support through existing JavaScript `main` packages; service entries remain declarations, with dashboard runtime handled in Phase 57.

### Phase 57: Plugin Dashboard Opening

**Goal**: make dashboard entries useful while preserving explicit user action and conservative runtime boundaries.

**Scope**:

- Display command/service/dashboard/config/assets/manifest declarations in plugin review and installed-plugin surfaces.
- Add an explicit Control Center action to open declared dashboard entries for enabled plugins.
- Validate plugin policy, enabled state, dashboard id, and HTTP/HTTPS URL protocol before opening externally.
- Record success/failure in plugin logs.
- Do not start services, run setup commands, execute shell commands, host dashboards, or inspect dashboard content.

**Acceptance**:

- Plugin service tests cover successful dashboard opens and disabled, blocked, unknown-id, and unsafe-protocol rejection paths.
- IPC tests cover the `plugins:open-dashboard` bridge.
- Control Center smoke tests cover declaration visibility, disabled dashboard buttons, enabled dashboard opening, and log output.
- Shared TypeScript contracts include `openPluginDashboard`.
- Full verification passes with docs that keep service/setup/health/shell execution out of current claims.

**Status**: completed in Phase 57. Enabled plugins can explicitly open declared HTTP/HTTPS dashboards from Control Center; service entries become start/stop capable in Phase 58.

### Phase 58: Plugin Service Lifecycle

**Goal**: make declared service entries explicitly startable and stoppable while preserving user control and conservative process boundaries.

**Scope**:

- Add `PluginService.startService(pluginId, serviceId)` and `stopService(pluginId, serviceId)`.
- Validate plugin existence, ecosystem policy, enabled state, service id, and plugin-local cwd before spawning.
- Start service entries with `spawn(..., { shell: false })`, a minimal inherited environment, captured stdout/stderr, and runtime state.
- Stop managed services on explicit Stop, plugin disable, and app quit.
- Expose service runtime state and Start/Stop buttons in Control Center.
- Do not auto-start services on install/enable/dashboard open.
- Do not implement setup, health checks, bridge token injection, generic shell command execution, or process-tree cleanup in this phase.

**Acceptance**:

- Plugin service tests cover start/stop, disabled rejection, blocklist rejection, unknown service ids, duplicate starts, cwd symlink escapes, disable cleanup, and non-zero exit failure state.
- IPC tests cover `plugins:start-service` and `plugins:stop-service`.
- Control Center smoke tests cover disabled buttons, enable/start/stop, runtime text, and logs.
- Shared TypeScript contracts include plugin service runtime and control result shapes.
- Full verification passes with docs that keep setup/health/bridge/process-tree cleanup out of current claims.

**Status**: completed in Phase 58. Enabled local plugins can explicitly start/stop declared service entries from Control Center, with runtime state and logs. Services do not auto-start, and service commands are spawned without shell expansion.

### Phase 59: Plugin service health checks

**Goal**: make declared service health visible and manually checkable without expanding plugin network authority.

**Scope**:

- Add `PluginService.checkServiceHealth(pluginId, serviceId)` for enabled, policy-allowed plugins.
- Accept `entries.services[].health` with `type: "http"` and HTTP/HTTPS loopback URLs only.
- Use an abortable timeout for slow health endpoints and record `healthy`, `unhealthy`, `checking`, `unknown`, or `not-configured` runtime health state.
- Expose `plugins:check-service-health` through IPC, preload, shared contracts, and Control Center.
- Show service health state and a disabled-when-ineligible Check Health action in Control Center.
- Do not auto-start services, poll in the background, run setup, inject bridge tokens, execute generic shell commands, or claim full process-tree cleanup.

**Acceptance**:

- Plugin service tests cover healthy responses, non-2xx unhealthy responses, timeouts, disabled plugins, missing health declarations, unsafe protocols, and non-loopback host rejection before fetch.
- IPC tests cover `plugins:check-service-health`.
- Control Center smoke tests cover disabled health checks, enabled health check action, health state rendering, and health logs.
- TypeScript contracts include service health state and health check result shapes.
- Production review verifies the loopback-only boundary, timeout behavior, renderer IPC path, and operator-facing logs.

**Status**: completed in Phase 59. Enabled local plugins can manually check declared loopback service health endpoints from Control Center, with runtime health state and logs. Health checks are explicit user actions only and do not background poll.

### Phase 60: Plugin setup status and service cleanup

**Goal**: make setup declarations visible and service stop cleanup stronger without expanding the plugin execution surface.

**Scope**:

- Normalize `entries.setup` declarations and carry them through shared contracts, demo/review payloads, and Control Center entry details.
- Show setup entries with read-only `not-run` status; do not execute setup commands or mix them into runnable plugin commands.
- Start declared service entries as detached process-group roots where Node and the host OS support it.
- On explicit Stop, plugin disable, and app quit, attempt process-group `SIGTERM` before falling back to direct child-process kill.
- Preserve existing service runtime state, logs, health state, and Control Center behavior.
- Keep cleanup wording honest: this is best-effort process-group cleanup, not a complete process-tree sandbox or hard descendant termination guarantee.
- Do not auto-start services, poll health in the background, run setup, inject bridge tokens, or execute generic shell commands.

**Acceptance**:

- Manifest, contract, service, and UI smoke tests cover setup declarations and visible `not-run` status.
- Plugin service tests cover detached spawn options, process-group stop, and child-kill fallback.
- Existing lifecycle tests still prove disable/app-quit cleanup paths.
- Docs move setup status and process-tree cleanup out of the totally-missing bucket while keeping setup execution and hard cleanup guarantees out of public claims.

**Status**: completed in Phase 60. Setup entries are visible with read-only `not-run` status, and service stop now attempts best-effort process-group cleanup before falling back to the previous child kill path when group signalling is unsupported or fails.

### Phase 61: Plugin setup execution

**Goal**: let enabled, policy-allowed local plugins run declared setup entries from an explicit user action without turning install or enable into code execution.

**Scope**:

- Add `PluginService.runSetup(pluginId, setupId)` for declared setup entries.
- Require the plugin to be enabled and allowed by ecosystem policy before spawning setup.
- Resolve setup cwd inside the plugin directory and reject escaping paths or symlinks.
- Spawn setup commands without shell expansion and with the same minimal host environment used for service processes.
- Record setup runtime status, exit code, errors, stdout/stderr snippets, and lifecycle logs.
- Expose `plugins:run-setup` through IPC, preload, shared contracts, the typed Control Center API facade, and demo API.
- Render Run Setup buttons in Control Center that are disabled for disabled, blocked, or already-running setup entries.
- Keep setup strictly user-triggered. Do not run setup during install, update, enable, service start, or health check.

**Acceptance**:

- Plugin service tests cover success, failure exit codes, disabled plugins, policy blocks, unknown setup ids, cwd symlink escapes, duplicate running setup, no shell expansion, and runtime/log updates.
- IPC tests cover `plugins:run-setup`.
- TypeScript contracts include setup run result shape and the Control Center API method.
- Control Center smoke tests cover disabled setup buttons, enabled setup execution, succeeded status, and setup logs.
- Docs state the new capability without claiming install-time setup, generic shell execution, bridge token injection, background automation, or hard process-tree cleanup.

**Status**: completed in Phase 61. Setup entries can be run only by explicit Control Center action for enabled, policy-allowed local plugins. Setup is spawned without shell expansion, records runtime/log state, and remains separated from install and enable.

### Phase 62: Plugin command process execution

**Goal**: let enabled, policy-allowed local plugins run declared `entries.commands` from an explicit user action without requiring a legacy JavaScript `main`.

**Scope**:

- Keep official and JavaScript compatibility commands on the existing SDK runner path.
- Add a declaration-only command path inside `PluginService.runCommand(pluginId, commandId, payload)`.
- Require the plugin to be enabled and allowed by ecosystem policy before spawning command processes.
- Resolve command cwd inside the plugin directory and reject escaping paths or symlinks.
- Spawn command processes without shell expansion, with a minimal environment, stdin JSON context, stdout/stderr log snippets, duplicate-running protection, and timeout handling.
- Return a typed command run result containing `ok`, `pluginId`, `commandId`, `exitCode`, optional parsed final-stdout JSON result, and optional raw output.
- Keep commands strictly user-triggered. Do not run commands during install, update, enable, setup, service start, or health check.
- Do not add bridge token injection, background automation, arbitrary shell consoles, or hard process-tree cleanup guarantees.

**Acceptance**:

- Plugin service tests cover success, failure exit codes, disabled plugins, policy blocks, unknown command ids, cwd symlink escapes, duplicate running command, timeout, non-JSON payload rejection before spawn, stdin JSON context, stdout/stderr logs, and no shell expansion.
- IPC tests cover `plugins:run-command` payload/result delegation.
- TypeScript contracts include command run result shape and the Control Center API method.
- Control Center smoke tests cover disabled command buttons and enabled command execution.
- Docs state the new capability without claiming install-time command execution, bridge token injection, background automation, arbitrary shell consoles, or complete sandboxing.

**Status**: completed in Phase 62. Declaration-only local `entries.commands` can run as explicit short-lived processes for enabled policy-allowed plugins, receive JSON stdin context, log stdout/stderr snippets, parse final stdout JSON results, timeout when stalled, and remain separated from install and enable.

### Phase 63: Plugin command result UX

**Goal**: show useful immediate feedback for the most recent plugin command result in Control Center, so users do not have to inspect logs to understand a successful command.

**Scope**:

- Keep the Phase 62 command execution boundary unchanged.
- Add a per-session latest command result preview in the Plugins pane.
- Prefer `result.message`, then `result.petSay`, then a generic exit-code summary.
- Display parsed JSON result previews and bounded stdout/stderr snippets when available.
- Update demo API and smoke coverage so the result path remains verifiable without the real host runtime.
- Keep the preview compact and session-local; do not add persistent history or a new orchestration surface.

**Acceptance**:

- Plugins pane shows a visible command result block after a successful command run.
- Status line uses the result summary rather than a generic success string.
- Helper test covers preview shaping directly.
- Playwright smoke covers the manual plugin result preview.
- Docs keep the UX improvement honest as a renderer presentation improvement, not a bridge or sandbox change.

**Status**: completed in Phase 63. The Plugins pane now shows the latest command result summary on the matching plugin card, including message, exit code, JSON result preview, and bounded stdout/stderr snippets.

### Phase 64: Plugin command bridge

**Goal**: let declaration-only local plugin commands perform a small amount of pet-aware behavior during an explicit run without falling back to the legacy JavaScript runner.

**Scope**:

- Keep the Phase 62 command execution boundary unchanged.
- Keep the Phase 63 command result UX unchanged.
- Inject a short-lived bridge URL and token into explicit declaration-only command runs.
- Support bounded read-only context plus `pet.say`, `pet.action`, and `pet.event`.
- Keep bridge calls loopback-only, token-gated, run-scoped, and logged.
- Do not add renderer bridge access, install-time execution, background automation, or hard process-tree cleanup guarantees.

**Acceptance**:

- Declaration-only command runs receive bridge env vars.
- Bridge-backed `pet.say`, `pet.action`, and `pet.event` mutate through `PetService`.
- Invalid token, missing permission, and expired bridge requests are rejected.
- `GET /context` returns bounded read-only context.
- Docs keep the bridge honest as a short-lived command capability, not a general sandbox or background API.

**Status**: completed in Phase 64. Declaration-only commands now receive a short-lived bridge URL/token pair and can explicitly call `pet.say`, `pet.action`, `pet.event`, and read a bounded context during an active run.

### Phase 68: Plugin service exit-confirmed stop

**Goal**: make declaration-only plugin service stop state and logs reflect confirmed child-process exit rather than only a stop signal attempt.

**Scope**:

- Keep the Phase 58 service lifecycle surface unchanged.
- Keep the Phase 60 best-effort process-group cleanup behavior unchanged.
- Keep explicit stop, disable cleanup, and app-shutdown cleanup on the same `PluginService` stop path.
- Return service runtime state as `stopping` until the child `exit` event confirms shutdown.
- Log `Service stop requested` during the shutdown window and `Service stopped` only after exit confirmation.
- Preserve existing duplicate-start protection while a service is still `stopping`.
- Do not add `SIGKILL` escalation, retry loops, setup/command cleanup expansion, background health policy, or hard process-tree guarantees.

**Acceptance**:

- Service tests prove explicit stop, process-group success, child fallback, and disable cleanup all remain `stopping` until exit.
- Stop-completion logs are emitted only after exit confirmation.
- Live docs describe the narrower service-stop truth without overstating cleanup guarantees.
- `npm run check:syntax`, `npm test`, `npm run test:control-center`, `npm run typecheck`, and `git diff --check` pass.

**Status**: completed in Phase 68. Declared service entries now stay `stopping` until child exit confirmation, and service logs distinguish stop intent from confirmed stop completion while hard descendant termination remains future work.

### Phase 69: Plugin service force stop

**Goal**: add a bounded host-side force-stop path for stubborn declaration-only service entries that ignore the initial stop request.

**Scope**:

- Keep the Phase 68 exit-confirmed stop semantics unchanged.
- Keep the work limited to `entries.services`.
- Add a grace-period timer after the current best-effort `SIGTERM` stop request.
- If the service still has not exited when the grace period expires, attempt a host-side force stop with the existing process-group-first model and direct-child fallback.
- Keep the final terminal state inside the existing `failed` contract instead of adding new renderer/runtime enums.
- Do not expand setup cleanup, declaration-command cleanup, background health policy, or broader sandbox claims.

**Acceptance**:

- Graceful service exits do not trigger force stop.
- Stubborn services trigger one bounded force-stop attempt after the grace period.
- Explicit stop, disable cleanup, and app-shutdown cleanup share the same bounded service cleanup contract.
- Tests cover graceful stop, stubborn stop, disable cleanup, and app-shutdown cleanup deterministically.
- Live docs describe the stronger service-only cleanup truth without overstating descendant guarantees.

**Status**: completed in Phase 69. Declared service entries now use a bounded grace period plus one host-side force-stop attempt for stubborn shutdowns, while final forced-stop outcomes remain on the existing `failed` contract.

### Phase 70: Plugin setup and command cleanup parity

**Goal**: make explicit setup runs and declaration-only command runs keep stop intent visible until child exit confirmation, matching the narrower cleanup truth already established for services.

**Scope**:

- Keep the Phase 61 explicit setup execution boundary unchanged.
- Keep the Phase 62 declaration-only command execution boundary unchanged.
- Keep the Phase 69 service-only force-stop behavior unchanged.
- Make setup disable/app-shutdown cleanup enter `stopping` before terminal completion.
- Make declaration-only command disable/app-shutdown cleanup log stop intent first and reject only after exit confirmation.
- Keep setup and declaration-only command cleanup on direct-child best effort only.
- Do not add process-group cleanup, force-stop escalation, bridge expansion, background health policy, or hard process-tree guarantees for setup/command paths.

**Acceptance**:

- Setup runtime exposes `stopping` until child exit confirms cleanup.
- Declaration-only command cleanup logs `Command stop requested` before final `Command stopped`.
- Disable cleanup and app-shutdown cleanup share the same stop-intent boundary for setup and declaration-only commands.
- Tests cover setup stop intent, declaration-only command stop intent, and setup cleanup failure paths.
- Live docs describe the new cleanup truth without widening sandbox/support claims.

**Status**: completed in Phase 70. Explicit setup runs and declaration-only command runs now keep stop intent visible until child exit confirmation, while both paths remain on direct-child best effort without service-style force-stop escalation.

### Phase 71: Plugin service periodic health policy

**Goal**: add a host-managed periodic health policy for declared service entries without widening plugin manifest authority or auto-start behavior.

**Scope**:

- Keep Phase 59 manual loopback health checks unchanged as the base health path.
- Persist host-owned per-service periodic health policy in OpenPet settings.
- Expose policy state through shared contracts, IPC, preload, demo API, and Control Center.
- Schedule recurring checks only while the declared service runtime is `running`.
- Reuse the existing loopback-only health check logic and timeout behavior.
- Clear timers on stop, exit, error, disable cleanup, shutdown cleanup, and policy changes.
- Do not add service auto-start, plugin manifest-owned scheduler hints, retries, notifications, or remote health checks.

**Acceptance**:

- Control Center can enable/disable periodic health checks and choose a bounded interval for services with declared health URLs.
- Periodic checks never auto-start stopped services.
- Periodic checks stop when the service stops or the policy is disabled.
- Malformed persisted policy values sanitize safely instead of accidentally enabling polling.
- Tests cover persistence, sanitization, scheduling, cleanup, IPC, and the Control Center flow.
- Docs describe the capability as host-managed loopback polling for running services, not plugin-owned background execution.

**Status**: completed in Phase 71. Running declared services can now receive opt-in host-managed periodic health checks from Control Center, while services still do not auto-start and plugin manifests still do not own scheduler policy.

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
| P1 | Phase 49 main-process Control Center adapters | Completed; use `@ts-check` adapters as the current production-side Control Center payload baseline. |
| P1 | Phase 50 plugin mutation Control Center adapter | Completed; plugin install/update/uninstall result shape now follows the production-side adapter baseline. |
| P1 | Phase 51 Pet pack mutation Control Center adapter | Completed; Pet pack import/set-active/remove result shape now follows the production-side adapter baseline. |
| P1 | Phase 52 About/update Control Center adapter | Completed; About info and update-check result shape now follows the production-side adapter baseline. |
| P1 | Phase 53 Actions Control Center adapter | Completed; action import/save/delete result shape now follows the production-side adapter baseline. |
| P1 | Phase 54 Release Evidence contracts | Completed; release archive manifest and signed closure report shapes now follow shared TypeScript contracts. |
| P1 | Phase 55 Extension Ecosystem docs | Completed; author and ecosystem docs now follow the developer-first local extension boundary. |
| P1 | Phase 56 Extension command entries | Completed; `entries.commands` can feed the JavaScript compatibility runner while service entries remain declarations and dashboard runtime moves to Phase 57. |
| P1 | Phase 57 Plugin dashboard opening | Completed; dashboard entries can be opened explicitly as external HTTP/HTTPS URLs. |
| P1 | Phase 58 Plugin service lifecycle | Completed; service entries can be explicitly started/stopped with runtime state and logs while auto-start, shell expansion, setup, health, and bridge remain out of scope. |
| P1 | Phase 59 Plugin service health checks | Completed; service entries can be manually health-checked against declared loopback endpoints while background polling, setup, bridge, and process-tree cleanup remain out of scope. |
| P1 | Phase 60 Plugin setup status and service cleanup | Completed; setup entries are visible but not executed, and service stops attempt best-effort process-group cleanup while setup execution, bridge, generic shell execution, background health polling, and hard cleanup guarantees remain out of scope. |
| P1 | Phase 61 Plugin setup execution | Completed; setup entries can be run by explicit Control Center action for enabled policy-allowed local plugins, without install/enable auto-run or shell expansion. |
| P1 | Phase 62 Plugin command process execution | Completed; declaration-only local command entries can run as explicit short-lived processes with stdin JSON context, without install/enable auto-run or shell expansion. |
| P1 | Phase 63 Plugin command result UX | Completed; Plugins pane now shows the latest command result summary, JSON preview, and bounded stdout/stderr snippets for successful runs. |
| P1 | Phase 64 Plugin command bridge | Completed; declaration-only commands can receive a short-lived bridge URL/token and use it for bounded pet-aware mutations and context reads. |
| P1 | Phase 68 Plugin service exit-confirmed stop | Completed; declared service entries now remain `stopping` until child exit confirmation, and logs distinguish stop request from confirmed stop completion while hard cleanup guarantees remain out of scope. |
| P1 | Phase 69 Plugin service force stop | Completed; stubborn declared service entries now trigger one bounded host-side force-stop attempt after a grace period, while final forced-stop outcomes remain on the existing `failed` contract. |
| P1 | Phase 70 Plugin setup and command cleanup parity | Completed; setup and declaration-only command cleanup now keep stop intent visible until child exit confirmation, while staying on direct-child best effort rather than service-style force-stop escalation. |
| P1 | Phase 71 Plugin service periodic health policy | Completed; running declared services can now receive opt-in host-managed periodic health checks from Control Center, while services still do not auto-start and plugin manifests still do not own scheduler policy. |
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
10. Phase 48 is complete; Pane props are now checked against hook output.
11. Phase 49 is complete; first main-process Control Center adapters are checked against shared contracts.
12. Phase 50 is complete; plugin mutation results now follow the same adapter contract.
13. Phase 51 is complete; Pet pack mutation results now follow the same adapter contract.
14. Phase 52 is complete; About/update results now follow the same adapter contract.
15. Phase 53 is complete; action mutation results now follow the same adapter contract.
16. Phase 54 is complete; release evidence archive and signed closure report payloads now have full shared contracts.
17. Phase 55 is complete; extension ecosystem docs now follow the developer-first local extension boundary.
18. Phase 56 is complete; `entries.commands` now feeds the JavaScript compatibility runner.
19. Phase 57 is complete; dashboard entries can be opened explicitly as external HTTP/HTTPS URLs.
20. Phase 58 is complete; service entries can be explicitly started/stopped with runtime state and logs, without auto-start or shell expansion.
21. Phase 59 is complete; service health checks are manual, loopback-only, timeout-protected, and visible in Control Center.
22. Phase 60 is complete; setup entries are visible with read-only `not-run` status, and service stops attempt best-effort process-group cleanup with child-kill fallback.
23. Phase 61 is complete; setup entries can be explicitly run from Control Center for enabled policy-allowed local plugins, with runtime status and logs.
24. Phase 62 is complete; declaration-only local command entries can be explicitly run from Control Center for enabled policy-allowed local plugins, with stdin JSON context, timeout handling, logs, and no shell expansion.
25. Phase 63 is complete; the Plugins pane now shows the latest command result summary on the matching plugin card, with result message, exit code, JSON preview, and bounded stdout/stderr snippets.
26. Phase 64 is complete; declaration-only commands now receive a short-lived bridge URL/token and can use it for pet-aware mutations and bounded context reads.
27. Phase 68 is complete; declaration-only service entries now remain `stopping` until child exit confirmation and only log final stop completion after that confirmation.
28. Phase 69 is complete; declaration-only service entries now use a bounded grace period plus one host-side force-stop attempt for stubborn shutdowns, while setup and command cleanup remain on their previous paths.
29. Phase 70 is complete; setup and declaration-only command cleanup now share the stop-intent/exit-confirmation boundary while still keeping their direct-child best-effort cleanup model.
30. Phase 71 is complete; running declared services can now receive opt-in host-managed periodic health checks from Control Center, while services still do not auto-start and plugin manifests still do not own scheduler policy.

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
- shared TypeScript contracts, typed Control Center hooks, typed Pane props, main-process adapters for service/catalog/plugin/pet pack/About/update/actions payloads, and full release evidence archive / signed closure report contracts cover the UI/API/report boundaries most likely to drift.
- live docs are concise, current, and not contradicted by phase history.
