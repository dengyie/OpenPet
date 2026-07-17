# System Cursor Replacement And Size Panel Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` and verify each task before continuing.

**Goal:** Replace the macOS cursor through WindowServer registration, recover the prior cursor theme on every lifecycle path, and retain the completed compact cursor-size controls.

**Architecture:** Dynamically load the required private CGS functions in the Swift helper. Back up named and auxiliary cursor families under OpenPet-owned identifiers, register the selected image for every covered family, and run a restore watchdog that owns crash recovery. Keep the existing Node service protocol and React state flow unchanged.

**Tech Stack:** Swift/AppKit/CoreGraphics/Darwin, Electron/Node.js, React/TypeScript, Node test runner, Playwright.

## Global Constraints

- Private macOS cursor APIs are explicitly accepted for this feature.
- Runtime symbol resolution must fail closed before `ready`.
- Do not create a global transparent overlay or call cursor hide/show APIs.
- Preserve cursor persistence, upload, deletion, scope, and hotspot scaling contracts.
- Preserve the cursor theme that was active before OpenPet activation.
- Whole-computer cursor replacement remains macOS-only.

### Task 1: WindowServer replacement and recovery

**Files:**
- Modify: `native/macos-system-cursor/OpenPetSystemCursor.swift`
- Modify: `tests/services/system-cursor-native-smoke.test.js`

- [x] Replace visibility assertions with cursor registration inspection for representative named and auxiliary identifiers.
- [x] Prove the current overlay helper fails the new registration evidence.
- [x] Add runtime CGS symbol loading and cursor data copy/register/remove wrappers.
- [x] Discover named identifiers, including `ArrowS` and `IBeamS`, and enumerate supported auxiliary IDs.
- [x] Restore stale OpenPet backups, capture fresh backups, and register one selected image across every target identifier.
- [x] Replace config reload atomically without changing the original backup set.
- [x] Add a restore watchdog for helper death and clean normal shutdown restoration.
- [x] Verify activation, update, normal exit restoration, and `SIGKILL` restoration in the native smoke.

### Task 2: Compact cursor-size controls

**Files:**
- Modify: `src/control-center/src/panes/PetPane.tsx`
- Modify: `src/control-center/src/styles.css`
- Modify: `tests/control-center/control-center-smoke.spec.js`

- [x] Group cursor identity and rendered dimensions.
- [x] Group percentage and reset action.
- [x] Place the slider and range endpoints directly below the summary.
- [x] Remove duplicated explanatory and metadata content.
- [x] Verify focused and full Control Center regressions on desktop and narrow layouts.

### Task 3: Final gates and review

- [x] Update the original macOS system-cursor design so it no longer documents the removed overlay architecture.
- [x] Run the native smoke and system cursor service tests.
- [x] Run native smoke, system cursor service tests, and syntax/type/build checks for this slice.
- [x] Run full Node tests and full Control Center tests before merge if this branch has not already run them after the final native review.
- [x] Perform a production code quality review of the native lifecycle, recovery paths, and UI regression surface.
- [x] Fix all P0/P1 review findings and commit the native replacement separately from the existing UI commit.
