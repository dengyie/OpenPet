# Pet Context Menu Engine Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pet context menu's independent sizing, positioning, and blur workarounds with one tested menu model, geometry engine, and focus-group session.

**Architecture:** Menu semantics move into a pure model module, all dimensions and candidate ranking move into a pure layout module, and the BrowserWindow layer consumes completed layouts while managing root and submenu windows as one focus group. Existing IPC remains the integration boundary and records richer layout diagnostics.

**Tech Stack:** Electron 42, Node.js CommonJS, Node native test runner, React/TypeScript Control Center, Playwright.

## Global Constraints

- Preserve the accepted first-level items and click-open action submenu.
- Keep `散步` first in the action submenu and `和宠物聊天` in the first-level menu.
- Hide `动作` when no manually triggerable animation exists.
- Open submenus only on the immediate left or right with a zero-pixel gap.
- Keep all menu windows inside the active display work area.
- Do not modify the existing `cat_anime/` material structure.
- Do not expose Node or Electron APIs to the menu renderer.
- Do not add new runtime dependencies.

---

### Task 1: Extract Menu Semantics and Shared Metrics

**Files:**
- Create: `src/main/pet-context-menu-model.js`
- Create: `src/main/pet-context-menu-layout.js`
- Modify: `src/main/pet-context-menu.js`
- Create: `tests/main/pet-context-menu-model.test.js`
- Modify: `tests/main/pet-context-menu.test.js`

**Interfaces:**
- Produces: `filterManualPetActions(actions)` and `buildPetContextMenuItems(options)` from `pet-context-menu-model.js`.
- Produces: `MENU_METRICS`, `measurePetContextMenu(items)`, and `constrainPetContextMenuSize({ contentSize, workArea })` from `pet-context-menu-layout.js`.
- Preserves: `pet-context-menu.js` as a compatibility facade while callers migrate.

- [ ] **Step 1: Write failing menu-model tests**

Add tests that call:

```js
const items = buildPetContextMenuItems({
  actions,
  canChat: true,
  onWalk,
  onAction,
  onChat,
  onSettings,
  onQuit
})
```

Assert that the resulting labels are `动作`, `和宠物聊天`, separator, `设置`, separator, `退出`; that `散步` is the first submenu item; and that hidden action kinds never appear.

- [ ] **Step 2: Run the model test and verify RED**

Run: `node --test tests/main/pet-context-menu-model.test.js`

Expected: FAIL because `pet-context-menu-model.js` does not exist.

- [ ] **Step 3: Implement the menu model**

Implement these exact exports:

```js
module.exports = {
  buildPetContextMenuItems,
  filterManualPetActions
}
```

`buildPetContextMenuItems` accepts callbacks and returns item objects with stable `id`, `type`, `label`, `submenu`, and `onSelect` fields. Use `id: 'actions'`, `id: 'walk'`, `id: 'chat'`, `id: 'settings'`, and `id: 'quit'` for built-in items.

- [ ] **Step 4: Run the model test and verify GREEN**

Run: `node --test tests/main/pet-context-menu-model.test.js`

Expected: PASS.

- [ ] **Step 5: Write failing metric-parity and scrolling tests**

Add assertions for:

```js
assert.deepEqual(measurePetContextMenu([
  { type: 'action', label: '设置' },
  { type: 'separator' },
  { type: 'action', label: '退出' }
]), {
  width: 112,
  height: MENU_METRICS.padding * 2 + MENU_METRICS.rowHeight * 2 + MENU_METRICS.separatorBlockHeight
})
```

Also assert that a 30-row menu is constrained to `workArea.height - MENU_METRICS.screenMargin * 2` and returns `scrollable: true`.

- [ ] **Step 6: Run the layout test and verify RED**

Run: `node --test tests/main/pet-context-menu.test.js`

Expected: FAIL because the new metrics and constrained sizing API are missing.

- [ ] **Step 7: Implement shared metrics and constrained sizing**

Define metrics that match rendered CSS exactly:

```js
const MENU_METRICS = Object.freeze({
  screenMargin: 8,
  petGap: 12,
  submenuGap: 0,
  minWidth: 112,
  maxWidth: 220,
  padding: 6,
  rowHeight: 30,
  separatorHeight: 1,
  separatorMargin: 3,
  separatorBlockHeight: 7
})
```

Return `{ width, height }` from `measurePetContextMenu` and `{ width, height, contentHeight, scrollable }` from `constrainPetContextMenuSize`.

- [ ] **Step 8: Run Task 1 tests and verify GREEN**

Run: `node --test tests/main/pet-context-menu-model.test.js tests/main/pet-context-menu.test.js`

Expected: PASS.

### Task 2: Replace Placement Fallbacks with Ranked Layout Candidates

**Files:**
- Modify: `src/main/pet-context-menu-layout.js`
- Modify: `src/main/pet-context-menu.js`
- Modify: `tests/main/pet-context-menu.test.js`

**Interfaces:**
- Consumes: `MENU_METRICS` and constrained menu sizes from Task 1.
- Produces: `layoutPetContextMenu(options)` and `layoutPetContextSubmenu(options)`.

- [ ] **Step 1: Write failing root-layout tests**

Cover `auto`, `right`, `left`, `above`, and `below` preferences; bottom-edge vertical clamping; negative display coordinates; and preference fallback when the requested side cannot fit.

Assert this result shape:

```js
{
  placement: 'left',
  point: { x, y },
  size: { width, height, contentHeight, scrollable },
  reason: 'avoids-overflow',
  candidates: [{ placement, point, overflowArea, petOverlapArea, displacement }]
}
```

- [ ] **Step 2: Run root-layout tests and verify RED**

Run: `node --test tests/main/pet-context-menu.test.js --test-name-pattern='root layout'`

Expected: FAIL because `layoutPetContextMenu` is missing.

- [ ] **Step 3: Implement root candidate generation and ranking**

Generate four ideal candidates around the pet, clamp them to the work area, calculate rectangle overflow and pet intersection, and sort with one comparator based on the design's root ranking order. Keep the configured direction as a preference rank rather than an absolute constraint.

- [ ] **Step 4: Run root-layout tests and verify GREEN**

Run: `node --test tests/main/pet-context-menu.test.js --test-name-pattern='root layout'`

Expected: PASS.

- [ ] **Step 5: Write failing submenu-layout tests**

Cover:

- both sides fit and right avoids the pet;
- both sides fit and left avoids the pet;
- only left fits;
- only right fits;
- neither side fits and the chosen result minimizes first-level-menu overlap;
- the submenu top aligns with the trigger row unless work-area clamping is required;
- shifted and negative-coordinate work areas.

Assert candidate diagnostics contain `parentOverlapArea`, `petOverlapArea`, `overflowArea`, `idealPoint`, and `point`.

- [ ] **Step 6: Run submenu-layout tests and verify RED**

Run: `node --test tests/main/pet-context-menu.test.js --test-name-pattern='submenu layout'`

Expected: FAIL because the ranked submenu API is missing.

- [ ] **Step 7: Implement left/right submenu ranking**

Generate only flush right and flush left ideal candidates. Clamp to the work area, then rank by full fit, parent overlap, pet overlap, displacement, and right-side tie-break. Return a `reason` that distinguishes normal preference, pet avoidance, edge fallback, and constrained-space compromise.

- [ ] **Step 8: Run all pure menu tests and verify GREEN**

Run: `node --test tests/main/pet-context-menu-model.test.js tests/main/pet-context-menu.test.js`

Expected: PASS.

### Task 3: Rebuild Menu Rendering and Focus-Group Session Management

**Files:**
- Modify: `src/main/pet-context-menu-window.js`
- Modify: `tests/main/pet-context-menu-window.test.js`

**Interfaces:**
- Consumes: `MENU_METRICS`, `measurePetContextMenu`, `constrainPetContextMenuSize`, and `layoutPetContextSubmenu`.
- Produces: `showPetContextMenuWindow(options)` with one session owning root and submenu windows.

- [ ] **Step 1: Extend the fake BrowserWindow test harness**

Add `isFocused()`, `focus()`, `blur()`, and a controllable deferred-task queue to the fake window. The tests must be able to move focus root -> submenu -> root before running deferred dismissal.

- [ ] **Step 2: Write failing focus-group tests**

Add tests proving:

- root blur followed by submenu focus keeps both windows open;
- submenu blur followed by root focus keeps both windows open;
- blur with neither window focused closes both;
- opening the same submenu twice reuses the same BrowserWindow;
- starting a new root menu closes the previous root and submenu.

- [ ] **Step 3: Run focus tests and verify RED**

Run: `node --test tests/main/pet-context-menu-window.test.js --test-name-pattern='focus|reuses|previous session'`

Expected: FAIL under the current one-time blur suppression model.

- [ ] **Step 4: Implement deferred focus-group dismissal**

Replace `suppressBlurWindow` with session methods:

```js
scheduleDismissIfUnfocused()
cancelPendingDismiss()
isMenuFocused()
openSubmenu({ key, items, anchorOffsetTop })
closeSubmenu()
closeAll()
```

The deferred callback closes only when neither live menu window reports `isFocused() === true`.

- [ ] **Step 5: Run focus tests and verify GREEN**

Run: `node --test tests/main/pet-context-menu-window.test.js --test-name-pattern='focus|reuses|previous session'`

Expected: PASS.

- [ ] **Step 6: Write failing rendering and scroll tests**

Assert that generated HTML uses the shared metrics, applies `overflow-y: auto` only for a scrollable layout, and navigates to `openpet-menu://close` when the window background rather than a menu item is clicked.

- [ ] **Step 7: Run rendering tests and verify RED**

Run: `node --test tests/main/pet-context-menu-window.test.js --test-name-pattern='scroll|background'`

Expected: FAIL because the current HTML is not layout-aware and background clicks are ignored.

- [ ] **Step 8: Implement layout-aware HTML and submenu reuse**

Pass `{ size, contentSize, scrollable }` into HTML generation. Use the shared metrics for padding, row height, separator dimensions, and width. Reuse the live submenu window when its stable item `id` matches the requested submenu key.

- [ ] **Step 9: Run all menu-window tests and verify GREEN**

Run: `node --test tests/main/pet-context-menu-window.test.js`

Expected: PASS.

### Task 4: Integrate the New Engine with IPC, Settings, and Diagnostics

**Files:**
- Modify: `src/main/ipc/register-pet-runtime-ipc.js`
- Modify: `src/control-center/src/panes/PetPane.tsx`
- Modify: `tests/main/ipc-context-menu.test.js`
- Modify: `tests/control-center/control-center-smoke.spec.js`

**Interfaces:**
- Consumes: `buildPetContextMenuItems`, `measurePetContextMenu`, `constrainPetContextMenuSize`, and `layoutPetContextMenu`.
- Produces: existing `IPC.PET_SHOW_CONTEXT_MENU` behavior plus structured layout diagnostics.

- [ ] **Step 1: Write failing IPC integration tests**

Update tests to assert that IPC passes a completed root layout to `showContextMenuWindow`, built-in callbacks still emit `walk` and `action` commands, and popup logs include `contentHeight`, `windowHeight`, `scrollable`, `reason`, and candidate overlap fields.

- [ ] **Step 2: Run IPC tests and verify RED**

Run: `node --test tests/main/ipc-context-menu.test.js`

Expected: FAIL because IPC still assembles items and legacy placement data inline.

- [ ] **Step 3: Replace inline assembly and placement**

Build item callbacks in IPC, pass them to `buildPetContextMenuItems`, calculate the display-constrained root layout once, and pass that layout to the window layer. Keep renderer command payloads unchanged.

- [ ] **Step 4: Expand submenu diagnostics**

Record `reason`, `scrollable`, `contentHeight`, final size, ideal coordinates, overflow area, parent overlap area, and pet overlap area from the layout result. Preserve existing event names so external log consumers do not break.

- [ ] **Step 5: Run IPC tests and verify GREEN**

Run: `node --test tests/main/ipc-context-menu.test.js`

Expected: PASS.

- [ ] **Step 6: Write the failing Control Center label assertion**

Change the smoke test to query the group by `一级菜单位置`.

- [ ] **Step 7: Run the focused Control Center test and verify RED**

Run: `npm run test:control-center -- --grep "一级菜单位置"`

Expected: FAIL while the UI still says `菜单位置`.

- [ ] **Step 8: Update the settings label**

Change only the visible `SegmentedControl` label to `一级菜单位置`; keep the persisted `menuPosition` key and contract unchanged.

- [ ] **Step 9: Run the Control Center test and verify GREEN**

Run: `npm run test:control-center -- --grep "一级菜单位置"`

Expected: PASS.

### Task 5: Regression, Review, and Documentation Closure

**Files:**
- Modify: `docs/testing-strategy.md`
- Review: every source and test file changed in Tasks 1-4

**Interfaces:**
- Consumes: all Task 1-4 deliverables.
- Produces: a verified and reviewed menu engine ready for user acceptance.

- [ ] **Step 1: Run focused menu regression**

Run:

```bash
node --test \
  tests/main/pet-context-menu-model.test.js \
  tests/main/pet-context-menu.test.js \
  tests/main/pet-context-menu-window.test.js \
  tests/main/ipc-context-menu.test.js \
  tests/renderer-menu-viewport.test.js
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run core runtime regression**

Run: `npm run test:core`

Expected: exit code 0.

- [ ] **Step 3: Run syntax, type, and build checks**

Run: `npm run check:syntax`

Expected: Node syntax, TypeScript, system cursor build, and Control Center build all pass.

- [ ] **Step 4: Run Control Center regression**

Run: `npm run test:control-center`

Expected: exit code 0.

- [ ] **Step 5: Perform production code review**

Review the final diff for geometry correctness, focus races, cleanup leaks, Electron security settings, logging compatibility, and test blind spots. Fix every P0/P1 and strong P2 finding, then rerun the affected tests.

- [ ] **Step 6: Verify documentation consistency**

Run: `npm run check:docs-drift`

Expected: exit code 0. Update `docs/testing-strategy.md` only if the new test boundary is not already described.

- [ ] **Step 7: Final verification**

Run: `npm run test:core:all && npm run check:syntax`

Expected: all core, Control Center, syntax, type, and build checks pass.
