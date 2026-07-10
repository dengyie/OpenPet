# macOS System Cursor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing whole-computer cursor scope apply the selected OpenPet cursor across macOS and restore the native pointer safely.

**Architecture:** A Swift AppKit helper owns global pointer hiding and click-through cursor drawing. An Electron main-process service owns helper build, launch, readiness, replacement, failure fallback, settings synchronization, logging, and shutdown cleanup.

**Tech Stack:** Electron CommonJS main process, React/TypeScript Control Center, Node native test runner, Swift/AppKit/CoreGraphics, Vite, Playwright.

## Global Constraints

- Implement macOS only; Windows and Linux must remain explicitly unsupported.
- Never edit macOS cursor preference files or persist OS-level cursor mutations.
- Never persist `customCursorScope: 'system'` unless the helper reports ready.
- Restore the native pointer when scope, selection, cursor deletion, helper process, or OpenPet lifecycle changes.
- Keep the pet renderer overlay disabled while system scope is active.
- Do not add a large native Node dependency or UI framework.

---

### Task 1: Native Helper And SystemCursorService

**Files:**
- Create: `native/macos-system-cursor/OpenPetSystemCursor.swift`
- Create: `scripts/build-macos-system-cursor-helper.js`
- Create: `src/main/services/system-cursor-service.js`
- Create: `tests/services/system-cursor-service.test.js`
- Create: `tests/scripts/build-macos-system-cursor-helper.test.js`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: `CustomCursorSettings`, `child_process.spawn`, app log service, user data path.
- Produces: `createSystemCursorService({ platform, arch, projectRoot, userDataPath, appLogService, spawnProcess, buildHelper })` with `getStatus()`, `apply(cursor)`, `sync(settings)`, `stop(reason)`, and `dispose()`.

- [ ] Write service tests for unsupported platforms, ready handshake, atomic replacement, pre-ready failure, unexpected exit fallback, and clean stop.
- [ ] Run `node --test tests/services/system-cursor-service.test.js` and confirm failure because the service does not exist.
- [ ] Implement the minimal lifecycle service and rerun until green.
- [ ] Write build-script tests for platform skip and Swift command arguments; confirm red, then implement and make green.
- [ ] Implement the Swift helper argument validation, PNG loading, click-through panel, hotspot positioning, ready output, signal cleanup, and balanced cursor show/hide.
- [ ] Run the real helper build and isolated launch/terminate smoke on macOS.

### Task 2: Settings, IPC, Runtime, And UI Truth

**Files:**
- Modify: `src/shared/cursor-library.js`
- Modify: `src/shared/cursor-library.ts`
- Modify: `src/main/ipc/pet-settings-adapter.js`
- Modify: `src/main/ipc/register-settings-ipc.js`
- Modify: `src/main/ipc.js`
- Modify: `src/main/bootstrap/create-core-services.js`
- Modify: `src/main/bootstrap/create-openpet-runtime.js`
- Modify: `src/main/bootstrap/startup-side-effects.js`
- Modify: `src/main/bootstrap/runtime-lifecycle.js`
- Modify: `main.js`
- Modify: `renderer.js`
- Modify: `src/control-center/src/hooks/usePetSettingsPane.ts`
- Modify: `src/control-center/src/panes/PetPane.tsx`
- Modify: `tests/shared/cursor-library.test.js`
- Modify: `tests/services/settings-cursor.test.js`
- Modify: `tests/main/ipc-adapters.test.js`
- Modify: `tests/main/ipc-cursor-settings.test.js`
- Modify: `tests/main/bootstrap-runtime-lifecycle.test.js`
- Modify: `tests/renderer-cursor-overlay.test.js`
- Modify: `tests/control-center/control-center-smoke.spec.js`

**Interfaces:**
- Consumes: Task 1 `systemCursorService.sync(settings)` and `getStatus()`.
- Produces: saved `customCursorScope: 'system'` only after activation; renderer payload `systemCursorStatus`; UI based on real platform/runtime capability.

- [ ] Change normalization and adapter tests to require preservation of valid `system` scope; run and confirm the existing openpet-only normalization fails.
- [ ] Add IPC tests requiring helper activation before save, unchanged persistence on activation failure, and helper stop on local/default scope; run red.
- [ ] Add lifecycle tests requiring startup sync and awaited shutdown disposal; run red.
- [ ] Add renderer test requiring local overlay suppression in system scope; run red.
- [ ] Implement normalization, service injection, save transaction, startup/shutdown sync, renderer suppression, logging, and UI status/error handling.
- [ ] Update Control Center Playwright assertions so the system mode reflects actual support and saved state.
- [ ] Run all focused cursor, IPC, lifecycle, renderer, and Control Center tests until green.

### Task 3: Regression, Review, And Delivery Commit

**Files:**
- Modify: `docs/superpowers/specs/2026-07-10-cursor-scope-simplification-design.md`
- Modify: `docs/TODO.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/project-context.json`
- Create: `docs/reviews/macos-system-cursor-milestone-review.md`

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: current documentation truth, production review evidence, and one atomic milestone commit.

- [ ] Remove the stale claim that system scope is intentionally unsupported and document the macOS-only boundary.
- [ ] Run `npm run check:syntax`, focused helper smoke, `npm test`, and cursor Playwright tests; read all exit codes and failure counts.
- [ ] Run the production review context collector and phase-gate review across the complete diff.
- [ ] Fix only P0/P1 findings, rerun the affected evidence chain, and repeat review up to three times.
- [ ] Rebase the branch onto the latest local `main`, rerun the merge-risk verification, and commit as `feat(phase-system-cursor): enable macOS system cursor scope`.
