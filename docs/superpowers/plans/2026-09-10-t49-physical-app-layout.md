# T49 Physical App Layout Implementation Plan

> **For agentic workers:** Use the executing-plans workflow and keep this change in one reversible commit.

**Goal:** Move the Electron desktop shell and Control Center source trees into their `apps/` owners while preserving runtime, test, Vite, and packaged-app behavior.

**Architecture:** The Electron entry point and shell-only code will live under `apps/desktop`; shell code will be grouped under `src/windows`, `src/pet`, `src/native`, `src/ipc`, and `src/services`, with `src/sidecar` retained beside those groups. The React/Vite application will live under `apps/control-center`. Shared runtime and contract files will move to `apps/desktop/src/shared` in this slice so the packaged renderer remains self-contained; T50 can later promote that directory to `packages/shared`.

**Tech Stack:** Electron, CommonJS shell modules, React, Vite, TypeScript, electron-builder, Node native test runner, Playwright.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/openpet-issue41-t49` on `codex/issue41-t49-layout`, based on T47 `5c33dbbcb97de6379d69f8d14636600ec82f039e`.
- Keep the primary `main` worktree untouched.
- Do not modify `services/backend/store/migrations/001_init.sql`, `cat_anime/`, or `examples/plugins/im-gateway/`.
- Keep `services/backend/**`, `services/**`, `packages/**`, and existing sidecar behavior unchanged except for import paths required by the physical move.
- Use one final commit so the whole relocation can be reverted atomically.
- Preserve the root package as the Electron application package; do not add `package.json` files under `apps/desktop` or `apps/control-center`.

### Task 1: Capture baseline and define relocation map

**Files:**
- Read: `package.json`, `main.js`, `src/main/**`, `src/control-center/**`, `src/shared/**`, tests, scripts, and `.github/workflows/release.yml`.
- Create: `docs/superpowers/plans/2026-09-10-t49-physical-app-layout.md`.

- [x] Confirm clean T47 baseline and linked worktree identity.
- [x] Count the source trees and enumerate direct path consumers.
- [x] Record that shared files must move with the desktop tree because `index.html` loads them at runtime and T49 removes the root `src/shared/**` packaging entry.

### Task 2: Move shell and frontend files

**Files:**
- Move: `main.js`, `preload.js`, `renderer.js`, `control-center-preload.js`, `index.html` to `apps/desktop/`.
- Move: `src/main/window.js`, screen/window and chat/context-menu modules to `apps/desktop/src/windows/`.
- Move: pet state/movement and pet-pack modules to `apps/desktop/src/pet/`.
- Move: cursor/native and lifecycle host modules to `apps/desktop/src/native/`.
- Move: IPC assembly, IPC registrars, adapters, and shell bridges to `apps/desktop/src/ipc/`.
- Move: remaining services, bootstrap, plugin, runtime, settings, JSON, and packaged-runner modules to `apps/desktop/src/services/` while preserving their internal subdirectories.
- Move: `src/shared/**` to `apps/desktop/src/shared/**` for packaged renderer/runtime completeness.
- Move: `src/control-center/**` to `apps/control-center/**`.

- [x] Keep `apps/desktop/src/sidecar/**` in place and do not overwrite it.
- [x] Preserve file contents while moving; only path literals and relative imports should change.
- [x] Ensure no root entry files or `src/main`, `src/control-center`, or `src/shared` directories remain.

### Task 3: Rewrite path contracts after the move

**Files:**
- Modify: `apps/desktop/main.js`, shell modules under `apps/desktop/src/**`, `apps/control-center/vite.config.js`, `package.json`, `playwright.config.js`, `tsconfig.json`, scripts, backend imports, tests, and release workflow path filters.

- [x] Set root `package.json.main` to `apps/desktop/main.js`.
- [x] Make the desktop bootstrap pass the repository/package root to runtime services even though `__dirname` is now `apps/desktop`.
- [x] Update BrowserWindow entry/preload paths to `apps/desktop/index.html`, `apps/desktop/preload.js`, `apps/desktop/control-center-preload.js`, and `dist/control-center/index.html`.
- [x] Update pet chat and bubble chat entry/preload paths to their new `apps/desktop/src/windows/**` locations.
- [x] Update Vite root to `apps/control-center`, and keep output at root `dist/control-center`.
- [x] Update all Control Center imports from root shared files to `apps/desktop/src/shared/**`.
- [x] Update backend, scripts, and tests to import the new desktop service/IPC/shared paths.
- [x] Update Playwright's dev server command to use `apps/control-center/vite.config.js` through the npm script.
- [x] Change `check:node` to scan `apps/desktop`, `apps/control-center`, scripts, services, tests, and examples without root entry/source paths.
- [x] Change `build.files` and `asarUnpack` to cover `apps/desktop/**/*`, `apps/control-center/**/*`, `services/**/*`, `packages/**/*`, and the generated `dist/control-center/**/*`; remove root `src/main/**` and `src/shared/**` entries.

### Task 4: Add relocation guard tests

**Files:**
- Create: `tests/scripts/t49-layout.test.js`.
- Modify: `tests/main/window.test.js`, `tests/main/ipc-module-entry.test.js`, renderer/preload tests, Control Center contract tests, and any tests whose source paths moved.

- [x] Assert the five desktop entry files exist only under `apps/desktop`.
- [x] Assert `apps/control-center/index.html` and `apps/control-center/vite.config.js` exist and Vite output remains `dist/control-center`.
- [x] Assert the package main, build file list, unpack list, and `check:node` command point at the new trees.
- [x] Assert forbidden legacy roots `main.js`, `preload.js`, `renderer.js`, `control-center-preload.js`, `index.html`, `src/main`, `src/control-center`, and `src/shared` are absent.
- [x] Assert protected files remain byte-identical to the baseline (`services/backend/store/migrations/001_init.sql` and `cat_anime/**`).

### Task 5: Verify the relocated tree and package

- [x] Run `npm run check:syntax`.
- [x] Run focused relocation and window/preload tests.
- [x] Run `npm test` and record pass/fail counts.
- [x] Run `npm run pack`; inspect the generated app tree for `services/backend/index.js` and `dist/control-center/**` and record the result.
- [x] Run `git diff --check`, confirm only intended files changed, and commit the complete relocation once.

## Self-Review Checklist

- The plan covers every T49 path named in issue #41, including package main, build files, unpack rules, syntax scanning, Vite, and Playwright.
- It explicitly accounts for `src/shared` packaging so the renderer does not lose `cursor-style.js` or `pet-hitbox.js`.
- It excludes the frozen migration, `cat_anime`, and IM gateway material.
- It keeps the relocation atomic and provides a new guard test for future path drift.
