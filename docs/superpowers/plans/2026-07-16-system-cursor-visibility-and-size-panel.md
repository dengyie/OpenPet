# System Cursor Visibility And Size Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the native macOS pointer hidden while the whole-computer custom cursor is active and make the Control Center cursor-size controls compact.

**Architecture:** Extend the existing Swift overlay helper with a visibility watchdog that owns at most one hide assertion and restores it exactly once. Keep the React state flow unchanged and reshape only the size-panel markup and CSS, with native and Playwright regressions proving behavior.

**Tech Stack:** Swift/AppKit/CoreGraphics, Electron/Node.js, React/TypeScript, Node test runner, Playwright.

## Global Constraints

- Use only public macOS APIs.
- Do not change cursor persistence, upload, deletion, scope, or hotspot scaling contracts.
- Whole-computer cursor replacement remains macOS-only.
- The helper must restore the native pointer on every clean shutdown path.
- Preserve the existing top cursor-selection banner and cursor cards.

---

### Task 1: Self-healing native cursor hiding

**Files:**
- Modify: `native/macos-system-cursor/OpenPetSystemCursor.swift`
- Modify: `tests/services/system-cursor-native-smoke.test.js`

**Interfaces:**
- Consumes: existing helper protocol events `ready`, `updated`, and `error`.
- Produces: a helper-internal `ensureSystemCursorHidden()` operation; no host contract changes.

- [ ] **Step 1: Extend the native smoke with failing visibility evidence**

Compile a temporary CoreGraphics probe from the test. It accepts `status`, `show`, and `hide`, uses `CGCursorIsVisible()`, `CGDisplayShowCursor(CGMainDisplayID())`, and `CGDisplayHideCursor(CGMainDisplayID())`, and always restores visibility in test cleanup.

After helper `ready`, assert hidden, invoke `show`, wait longer than one helper poll, and assert hidden again. After helper exit, assert visible.

- [ ] **Step 2: Run the opt-in smoke and verify the existing helper fails**

Run:

```bash
OPENPET_RUN_NATIVE_CURSOR_SMOKE=1 node --test tests/services/system-cursor-native-smoke.test.js
```

Expected: FAIL because the native cursor remains visible after the probe invokes `show`.

- [ ] **Step 3: Implement the minimal visibility watchdog**

In `CursorOverlayController`, replace the one-shot startup hide with:

```swift
private var ownsCursorHide = false

private func ensureSystemCursorHidden() throws {
    guard CGCursorIsVisible() else { return }
    let result = CGDisplayHideCursor(displayUnderPointer())
    guard result == .success else { throw CursorHelperError.cursorHideFailed(result) }
    ownsCursorHide = true
}
```

Resolve the display under `NSEvent.mouseLocation` through `NSScreen.screens`, falling back to `CGMainDisplayID()`. Call the method during startup and every poll. On polling failure emit an `error` event for the current version and shut down. Cleanup calls `CGDisplayShowCursor` exactly once only when `ownsCursorHide` is true.

- [ ] **Step 4: Rerun native and service regressions**

Run:

```bash
OPENPET_RUN_NATIVE_CURSOR_SMOKE=1 node --test tests/services/system-cursor-native-smoke.test.js
node --test tests/services/system-cursor-service.test.js
```

Expected: native smoke and service tests pass with zero failures.

- [ ] **Step 5: Commit the native fix**

```bash
git add native/macos-system-cursor/OpenPetSystemCursor.swift tests/services/system-cursor-native-smoke.test.js
git commit -m "fix(system-cursor): keep native pointer hidden"
```

### Task 2: Compact cursor-size controls and visual regression

**Files:**
- Modify: `src/control-center/src/panes/PetPane.tsx`
- Modify: `src/control-center/src/styles.css`
- Modify: `tests/control-center/control-center-smoke.spec.js`

**Interfaces:**
- Consumes: existing `selectedScalableCursor`, `pendingCursorSizePercent`, `onResizeCursor`, and `onResetCursorSize` values.
- Produces: compact `.cursor-size-panel`, `.cursor-size-summary`, `.cursor-size-actions`, and `.cursor-size-range-labels` presentation classes.

- [ ] **Step 1: Add failing Playwright layout assertions**

In the existing cursor picker smoke, select/import a cursor and assert that the size panel contains one compact summary row, the reset action shares that row when present, min/max labels flank the slider, and the removed explanatory/meta blocks are absent. Add CSS geometry assertions that the summary and slider are separated by no more than the panel gap.

- [ ] **Step 2: Run the focused Playwright test and verify failure**

Run:

```bash
npm run test:control-center -- --grep "custom pet hover cursor|built-in cursor cards"
```

Expected: FAIL because the compact classes and range labels do not exist.

- [ ] **Step 3: Implement the compact panel**

Render the selected state as:

```tsx
<div className="cursor-size-summary">
  <div className="cursor-size-identity">...</div>
  <div className="cursor-size-actions">...</div>
</div>
<div className="cursor-size-control">...</div>
```

Move the selected name and rendered dimensions into the identity block, keep the percentage badge and conditional reset in the actions block, place `50%` and `200%` labels beside the slider, and remove the long description and duplicate metadata row. Use a short one-line empty state.

CSS uses compact padding and an 8-10px internal gap, keeps the slider full width, and wraps `.cursor-size-summary` and `.cursor-size-actions` safely below 820px.

- [ ] **Step 4: Run focused and full UI verification**

Run:

```bash
npm run test:control-center -- --grep "custom pet hover cursor|built-in cursor cards"
npm run test:control-center
npm run typecheck
```

Expected: focused tests, all Control Center tests, and typecheck pass.

- [ ] **Step 5: Run final repository gates and commit**

Run:

```bash
npm run check:syntax
npm test
git diff --check
```

Expected: zero failures except the existing opt-in native smoke skip in default `npm test`.

```bash
git add src/control-center/src/panes/PetPane.tsx src/control-center/src/styles.css tests/control-center/control-center-smoke.spec.js
git commit -m "fix(cursor-ui): compact size controls"
```
