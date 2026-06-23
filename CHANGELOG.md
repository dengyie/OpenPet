# Changelog

OpenPet release records. Dates use Asia/Shanghai local time.

## v1.0.1-rc.3 - 2026-06-24

### Added

- Expanded Creator Studio workflows with prompt planning, image-backed atlas generation, frame repair, approval, dashboard review, and generated pet/action import flows.
- Added AI talk memory, persona draft/override flows, and clearer OpenAI-compatible provider setup guidance.
- Added richer plugin runtime controls for declaration commands, dashboards, setup entries, services, bridge routes, periodic health checks, logs, storage stats, and cleanup evidence.
- Added release, plugin submission, community-source, Windows smoke, and packaged runtime evidence tooling.

### Fixed

- Stabilized custom cursor rendering, hotspot repair, focus behavior, and edge handling in transparent pet windows.
- Fixed pet viewport anchoring, scale preview jitter, walking interaction controls, context menu focus, and settings window stacking.
- Hardened AI provider save/test flows, image-generation failure reporting, Creator Studio imports, transparent atlas rejection, and plugin bridge diagnostics.
- Prevented narrow Control Center viewport overflow.

### Changed

- Split plugin service support logic into focused discovery, JSON, log, network, and local runner modules while preserving the public `PluginService` API.
- Refreshed README files for the current release-candidate platform shape and GitHub project presentation.
- Kept the release track macOS-first while continuing to build Windows packaging and smoke-evidence infrastructure.

### Validation

- `npm run check:syntax`: passed.
- `npm test`: 923/923 Node tests passed.
- `OPENPET_CONTROL_CENTER_PORT=5175 npm run test:control-center`: 20/20 Playwright UI tests passed.

## v1.0.1-rc.2 - 2026-06-16

### Added

- Native Codex pet import for `pet.json` + `spritesheet.webp` directories.
- Native Codex pet zip import for `.codex-pet.zip` packages.
- Built-in read-only pet packs: `doro`, `duodong`, and `chispa`.
- TypeScript migration baseline with `tsconfig.json`, `npm run typecheck`, and a shared IPC contract sample.

### Fixed

- Resolved bundled pet sprite URLs to packaged `file://` paths so built-in Codex pets render in the desktop pet window instead of appearing transparent.

### Changed

- `npm run check:syntax` now runs Node syntax checks, TypeScript no-emit checks, and the Control Center production build.
- README files now focus on product use and contributor entry points; phase details remain in `docs/phases/` and `docs/reviews/`.

### Validation

- `npm test`: 319/319 Node tests.
- `npm run test:control-center`: 9/9 Playwright UI tests.
- `npm run typecheck`: passed.
- `npm run check:syntax`: passed.

## v1.0.1-rc.1 - 2026-06-13

### Changed

- Renamed the product and package from ibot to OpenPet / openpet.
- Renamed the GitHub repository target to `dengyie/OpenPet` and updated local release, catalog, README, and MCP documentation references.
- Renamed the bundled catalog file from `catalog/ibot-catalog.json` to `catalog/openpet-catalog.json`.
- Updated public integration names to `openpet.*`, `openpet_behavior`, `X-OpenPet-Token`, and `.openpet-plugin.zip`.
- Polished user-facing OpenPet display names in plugin install dialogs and ecosystem documentation examples.

### Compatibility

- Preserved legacy user data by pinning Electron `userData` to the existing `appData/ibot` directory during startup.
- Kept backward-compatible aliases for `ibot.*` MCP tools, `ibot_behavior`, `X-ibot-token`, `ibotApiVersion`, and `.ibot-plugin.zip`.

### Validation

- `npm test`: 305/305 Node tests at the time of the release.
- `npm run check:syntax`: passed, including the Control Center production build.
- Local RC upgrade smoke test passed with seeded legacy `Library/Application Support/ibot` data.

## v1.0.0 - 2026-06-12

### Added

- Completed Phase 1-7 productization: Control Center modularization, pet pack management, plugin ecosystem, AI behavior orchestration, MCP transport, release pipeline, and catalog/blocklist operations.
- Added bilingual README, technical handoff, release checklist, MCP usage docs, and production review documents.
- Added Electron distribution configuration and GitHub release workflow.

### Validation

- Tagged as the first productized baseline release.
