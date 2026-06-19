# OpenPet Testing Strategy

OpenPet keeps all automated tests available through `npm test`, but day-to-day
runtime work should use the smaller core suites first.

## Required Core Flow Tests

Run `npm run test:core` for main-process, service, renderer, pet-pack, plugin
runtime, examples, shared contracts, and lightweight Control Center unit tests.
This suite protects the desktop pet's core flows:

- app lifecycle, single-instance handling, user data paths, and window sizing;
- pet movement, context menu placement, cursor hitboxes, renderer scaling, and action playback;
- settings, action import, pet pack loading/import/export, AI config, local HTTP, catalog, and plugin runtime services;
- plugin manifest/install/runtime permission boundaries and example plugin smoke paths;
- shared IPC/channel/cursor/hitbox contracts used across Electron boundaries.

Run `npm run test:core:all` before merging user-facing runtime changes. It runs
`test:core` plus the Control Center Playwright regression suite.

## Auxiliary Tool Tests

Run `npm run test:tools` when touching release tooling, report generators,
plugin submission tooling, smoke evidence helpers, or maintenance CLIs. These
tests are important, but they do not need to block every tight runtime iteration.

Auxiliary tests currently include:

- `tests/scripts/*.test.js`: plugin scaffolding, validation, submission, and rehearsal CLIs;
- `tests/release/*.test.js`: release evidence, Windows/macOS smoke reports,
  packaged runtime reports, cleanup evidence, and signed release closure tools.

## Full Regression

Run `npm test` before release or broad refactors. It still runs every Node test
under `tests/**/*.test.js`.

Run `npm run check:syntax` before merge when JavaScript, TypeScript contracts,
or Control Center build output may be affected.

## Deletion Guidance

Do not delete core flow tests unless the product flow is removed. For
auxiliary tests, prefer moving them behind `test:tools` or narrowing fixtures
before deleting them. Delete a test only when it is both:

- covering a script or product behavior that no longer exists; and
- not the only executable specification for a release, plugin, security, or
  migration boundary.
