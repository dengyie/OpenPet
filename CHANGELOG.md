# Changelog

All notable OpenPet release records are kept here. Dates use Asia/Shanghai local time.

## v1.0.1-rc.1 - 2026-06-13

### Changed

- Renamed the product and package from ibot to OpenPet / openpet.
- Renamed the GitHub repository target to `dengyie/openpet` and updated local release, catalog, README, and MCP documentation references.
- Renamed the bundled catalog file from `catalog/ibot-catalog.json` to `catalog/openpet-catalog.json`.
- Updated public integration names to `openpet.*`, `openpet_behavior`, `X-OpenPet-Token`, and `.openpet-plugin.zip`.

### Compatibility

- Preserved legacy user data by pinning Electron `userData` to the existing `appData/ibot` directory during startup.
- Kept backward-compatible aliases for `ibot.*` MCP tools, `ibot_behavior`, `X-ibot-token`, `ibotApiVersion`, and `.ibot-plugin.zip`.

### Validation

- `npm test` passes: 171/171 tests.
- `npm run check:syntax` passes, including the Control Center production build.
- Local RC upgrade smoke test passed with seeded legacy `Library/Application Support/ibot` data.

## v1.0.0 - 2026-06-12

### Added

- Completed Phase 1-7 productization: Control Center modularization, pet pack management, plugin ecosystem, AI behavior orchestration, MCP transport, release pipeline, and catalog/blocklist operations.
- Added bilingual README, technical handoff, release checklist, MCP usage docs, and production review documents.
- Added Electron distribution configuration and GitHub release workflow.

### Validation

- Tagged as the first productized baseline release.
