# OpenPet Testing Strategy

OpenPet keeps all automated tests available through `npm test`, but day-to-day
runtime work should use the smaller core suites first.

## Validation Grades

Use the highest grade touched by a change:

- **Grade A - security, persistence, lifecycle, and public runtime:** run
  focused tests, npm run test:core:all, npm test, npm run check:syntax,
  relevant manual acceptance, and git diff --check.
- **Grade B - user-facing Control Center and runtime integration:** run focused
  tests, npm run test:core, npm run test:control-center,
  npm run check:syntax, and git diff --check.
- **Grade C - tooling, contracts, and documentation:** run focused docs/tools
  tests, npm run test:tools, npm run check:docs-drift, and
  git diff --check. Broaden the matrix when a shared contract or tool is
  consumed by runtime code.

The canonical command flow and worktree rules live in
[development-workflow.md](./development-workflow.md).

## Required Core Flow Tests

Run `npm run test:core` for main-process, service, renderer, pet-pack, plugin
runtime, examples, shared contracts, and lightweight Control Center unit tests.
This suite protects the desktop pet's core flows:

- app lifecycle, single-instance handling, user data paths, and window sizing;
- pet movement, context menu model/layout metrics, work-area constrained submenu scrolling,
  cross-window focus-group dismissal, cursor hitboxes, renderer scaling, and action playback;
- settings, action import, pet pack loading/import/export, AI config, local HTTP, catalog, and plugin runtime services;
- plugin manifest/install/runtime permission boundaries and example plugin smoke paths;
- shared IPC/channel/cursor/hitbox contracts used across Electron boundaries.

Run `npm run test:core:all` before merging user-facing runtime changes. It runs
`test:core` plus the Control Center Playwright regression suite.

## Auxiliary Tool Tests

Run `npm run test:tools` when touching release tooling, report generators,
plugin submission tooling, smoke evidence helpers, maintenance CLIs, or live
documentation truth surfaces. These tests are important, but they do not need
to block every tight runtime iteration.

Auxiliary tests currently include:

- `tests/scripts/*.test.js`: plugin scaffolding, validation, submission, and rehearsal CLIs;
- `tests/docs/*.test.js`: live-doc truth checks that keep the active backlog,
  maintainer snapshots, archived release blocker wording, smoke evidence
  entrypoints, synthetic-versus-real acceptance boundaries, and current archive
  paths aligned with the current repository facts rather than older closure
  snapshots;
- `tests/scripts/mock-agent-awareness-flow.test.js`: synthetic end-to-end
  rehearsal that drives mock Codex rollout data through
  `run-agent-awareness-local-smoke`, archive creation, and manual-acceptance
  write-back so the smoke/archive/update chain stays covered without launching
  OpenPet; this proves tooling/data flow only and does not replace real desktop
  acceptance;
- `tests/scripts/mock-plugin-community-source-flow.test.js`: synthetic end-to-end
  rehearsal that drives a compatible community-source archive through Phase 100
  intake, Phase 103 bridge, Phase 99 evidence, and discovery status rollup,
  plus the incompatible foreign `plugin.json` downgrade path. It now also runs
  the shipped intake, bridge, and discovery CLIs end to end against a synthetic
  compatible archive by faking the HTTPS download boundary without touching real
  network state;
- `tests/release/mock-packaged-provider-flow.test.js`: synthetic packaged
  provider-path rehearsal that records provider-ready Create gating plus
  provider-backed packaged Creator Studio runtime and packaged UI archives. It
  now also runs the shipped packaged Create, Creator Studio runtime, and
  Creator Studio UI CLIs end to end against a synthetic provider-ready app shim
  without launching a real packaged desktop session;
- `tests/release/*.test.js`: release evidence, Windows/macOS smoke reports,
  packaged runtime reports, cleanup evidence, signed release closure tools, and
  synthetic dual-platform picker/runtime and release-closure rehearsals such as
  `tests/release/mock-picker-runtime-flow.test.js`, which now also runs the
  shipped macOS evidence/archive, release-manifest, and signed-closure CLI
  chain against synthetic signed fixtures without claiming real host evidence.

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
