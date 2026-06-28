# Pet Context Cascade Menu Design

Date: 2026-06-27
Status: Accepted
Scope: Reduce pet right-click menu density by replacing the flat action list with a compact first-level menu plus a cascaded action submenu

## 1. Goal

Refactor the pet right-click menu so it no longer dumps every action into the first-level menu.

The new menu should:

- keep the first-level menu short and stable;
- preserve direct access to the most important non-action entries;
- move manual pet actions behind a cascaded `动作` submenu;
- keep the menu usable near screen edges without clipping or flicker;
- preserve the current custom menu-window approach rather than reverting to Electron native menus.

This change is about menu information architecture and interaction reliability. It is not a redesign of pet actions, chat, settings, or movement systems.

## 2. Current Behavior

Today the pet context menu is generated in `src/main/ipc.js` by taking every action from `petService.getAnimations().actions` and flattening them into the first-level menu, followed by `散步`, optional `和宠物聊天`, `设置`, and `退出`.

Current implications:

- first-level menu height grows with action count;
- state-like actions such as `idle`, `working`, or `waiting` appear alongside user-triggered actions;
- different pet packs can create very tall first-level menus;
- the visual menu is implemented as a custom always-on-top menu window, not a native Electron `Menu.popup` surface.

Relevant code today:

- `src/main/ipc.js`
- `src/main/pet-context-menu.js`
- `src/main/pet-context-menu-window.js`
- `tests/main/ipc-context-menu.test.js`
- `tests/main/pet-context-menu-window.test.js`
- `tests/main/pet-context-menu.test.js`
- `tests/renderer-menu-viewport.test.js`

## 3. Product Decisions

The following decisions are confirmed for this phase.

### 3.1 First-level menu shape

The first-level menu should be compact and contain only:

- `动作`
- `和宠物聊天` when chat is available
- `设置`
- `退出`

`散步` is removed from the first-level menu and moved into the action submenu.

### 3.2 Action submenu

The `动作` entry opens a cascaded submenu.

Interaction rules:

- opening is click-based, not hover-based;
- the submenu prefers opening on the right side of the first-level menu;
- if the right side does not fit, it opens on the left side instead;
- no top/bottom cascade fallback is introduced in this phase;
- parent and child menus are treated as one menu session;
- moving the mouse between parent and child must not close either menu;
- clicking any actionable item closes both menus;
- clicking outside closes both menus;
- `Escape` should close the open menu session in a predictable way.

### 3.3 Which actions appear in the submenu

The submenu should only include actions considered manually triggerable.

Hide these kinds by default:

- `idle`
- `working`
- `waiting`
- `failure`

Allow these kinds by default:

- `greeting`
- `custom`
- `thinking`

Compatibility rule:

- if an action comes through normalized pet-pack or creator-action flows without an explicit kind, it will usually normalize to `custom`, so it remains visible;
- we should preserve that compatibility rather than requiring every older resource pack to backfill a perfect `kind`.

### 3.4 Empty and small action sets

If there are zero manually triggerable actions after filtering:

- hide the `动作` entry from the first-level menu completely.

If there is exactly one manually triggerable action:

- still show `动作` as a cascaded submenu entry;
- do not collapse it into a direct one-click action item.

### 3.5 Ordering

Visible submenu actions keep their original resource order.

We do not introduce heuristic re-sorting in this phase.

### 3.6 Chat entry

`和宠物聊天` stays as a first-level direct entry.

It is not grouped under `动作`, because it is a functional surface opener rather than a one-shot pet action.

## 4. Non-Goals

This phase does not:

- convert the menu back to native Electron menus;
- add hover-triggered submenu opening;
- add multi-level nested action groups beyond one cascaded submenu;
- redesign action authoring or pet-pack schema;
- add user-configurable submenu grouping rules;
- add keyboard-first arrow navigation between levels unless it falls out naturally from the implementation.

## 5. UX Requirements

### 5.1 First-level clarity

The first-level menu should feel stable across different pet packs.

Users should quickly learn:

- `动作` = interact with the pet
- `和宠物聊天` = open chat surface
- `设置` / `退出` = app controls

### 5.2 Submenu reliability

The cascaded submenu must not feel fragile.

The following failure modes are explicitly unacceptable:

- the parent menu closes while the pointer travels toward the submenu;
- the submenu opens off-screen when the pet is near the display edge;
- the submenu opens but immediately disappears because the parent loses focus;
- clicking `动作` repeatedly creates stacked orphaned submenu windows;
- clicking outside closes only one level and leaves another floating.

### 5.3 Empty-state behavior

If no manual actions are available, the first-level menu must remain clean.

Showing a disabled `动作` item is intentionally rejected for this phase.

## 6. Implementation Strategy

### 6.1 Keep the custom menu-window architecture

We should continue using the custom menu window path rather than reintroducing `Menu.popup`.

Reason:

- the project already invested in fixing clipping, dismiss behavior, and renderer/menu viewport interactions around custom windows;
- a cascaded submenu is easier to control consistently inside the custom window model than by mixing native and custom menu layers.

### 6.2 Introduce a menu session model

Current code stores only one `contextMenuWindow` on the parent pet window.

That is not enough for a parent + child cascade.

We should introduce a small session model, for example:

- `parentWindow.contextMenuSession`
- `rootMenuWindow`
- `submenuWindow`
- shared close helpers
- shared dismissal state

The important architectural rule is:

- parent and child menus should close as one session;
- menu-level blur handling must become session-aware, not purely window-local.

### 6.3 Separate menu item data from rendered menu windows

The current menu rendering path assumes a flat `items` array with either:

- separator rows, or
- clickable rows.

We should extend the item model to support submenu entries without immediately making the renderer recursive.

Recommended item shapes:

```js
{ type: 'action', label: '设置', onSelect: () => {} }
{ type: 'separator' }
{ type: 'submenu', label: '动作', submenu: [...] }
```

This keeps menu semantics explicit and avoids overloading plain button items.

### 6.4 Compute first-level and submenu sizes independently

Current sizing is tied to the full action list and fixed extra item counts.

That model breaks once actions move into a child menu.

We should:

- estimate first-level size from only the first-level visible items;
- estimate submenu size from only the visible action submenu items;
- keep width bounded by current min/max rules unless UX review shows a need to change them.

### 6.5 Add submenu placement helper

Current placement logic chooses where the main menu sits relative to the pet.

We need a second placement helper for submenu positioning relative to the first-level menu window, not the pet window.

Recommended behavior:

- align submenu vertically with the `动作` row;
- prefer placing to the right of the parent menu window;
- if right side overflows, place to the left;
- clamp vertical position inside the work area;
- do not add above/below cascade fallback in this phase.

## 7. Data and Filtering Rules

### 7.1 Manual-action filter

Add a helper that receives normalized actions and returns the visible submenu action set.

Suggested default rule:

```js
const HIDDEN_MANUAL_ACTION_KINDS = new Set(['idle', 'working', 'waiting', 'failure'])
```

Visible if:

- the action exists;
- it has an id;
- its normalized kind is not in the hidden set.

This should run after existing normalization, not on raw resource input.

### 7.2 Walk entry

`散步` moves into the action submenu.

It should appear as a stable action-like entry, separate from filtered animation-derived actions.

Recommended default placement:

- first row in the submenu, before animation actions.

Rationale:

- `散步` is user-triggered;
- it is not a pet-pack animation resource;
- it should remain easy to find.

## 8. Testing Plan

The change is menu-state-heavy and should be covered by focused tests, not just manual clicking.

### 8.1 Update existing tests

Revise:

- `tests/main/ipc-context-menu.test.js`
- `tests/main/pet-context-menu.test.js`
- `tests/main/pet-context-menu-window.test.js`
- `tests/renderer-menu-viewport.test.js`

### 8.2 Add new core scenarios

Required scenarios:

- first-level menu no longer flattens all actions;
- `动作` appears when manual actions exist;
- `动作` is hidden when no manual actions exist;
- a single visible action still produces a `动作` submenu entry;
- `散步` appears inside the submenu, not the first-level menu;
- `和宠物聊天` remains first-level only when the chat service is available;
- hidden action kinds do not appear in the submenu;
- unknown or normalized `custom` actions remain visible;
- submenu opens to the right by default;
- submenu flips to the left when the right side would overflow;
- moving between parent and child does not prematurely dismiss the menu session;
- clicking a submenu action closes both windows;
- clicking outside closes both windows;
- repeated clicks on `动作` do not leak extra submenu windows.

### 8.3 Verification commands

At minimum, verify with:

- `node --test tests/main/ipc-context-menu.test.js tests/main/pet-context-menu.test.js tests/main/pet-context-menu-window.test.js tests/renderer-menu-viewport.test.js`
- `npm run check:syntax`

Run broader core coverage if surrounding menu/runtime state changes spread further than expected.

## 9. Rollout Notes

This is a contained interaction change with low migration cost.

Reversibility is good because:

- the old flat menu model is localized to context-menu item construction;
- no persisted schema changes are required;
- action filtering is runtime-only;
- first-level menu content can be toggled back without touching pet-pack data.

The main risk is not data loss. The main risk is interaction fragility in parent/child menu focus handling.

## 10. Acceptance Criteria

The phase is complete when:

- the first-level pet context menu no longer displays the full action list;
- `动作` opens a cascaded submenu on click;
- the submenu prefers right-side placement and flips left when needed;
- hidden action kinds are excluded from the submenu;
- `散步` is available only inside the action submenu;
- `和宠物聊天` remains a first-level direct action when available;
- no-manual-action pet packs hide the `动作` entry entirely;
- single-manual-action pet packs still show `动作` as a cascaded entry;
- parent and child menus dismiss as one reliable session;
- the core context-menu tests cover the new structure and pass.
