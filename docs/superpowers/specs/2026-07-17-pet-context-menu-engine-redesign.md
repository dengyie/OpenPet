# Pet Context Menu Engine Redesign

Date: 2026-07-17
Status: Accepted
Supersedes: Positioning and session-management sections of `2026-06-27-pet-context-cascade-menu-design.md`

## 1. Goal

Rebuild the pet context menu around one deterministic layout and session engine.

The redesign must preserve the accepted menu information architecture while removing the accumulated positioning, sizing, and focus special cases that caused clipping, detached submenus, pet overlap, and unreliable dismissal.

## 2. Preserved Product Decisions

The first-level menu remains compact:

- `动作` when at least one manually triggerable animation is available;
- `和宠物聊天` when chat is available;
- `设置`;
- `退出`.

The action submenu remains click-triggered:

- `散步` is the first submenu item;
- manually triggerable animations follow in resource order;
- state-like actions remain hidden;
- the submenu opens only to the left or right of the first-level menu;
- right is the final tie-break preference, not an unconditional choice;
- the submenu stays flush with the first-level menu with a zero-pixel gap.

## 3. Problems Being Replaced

The current implementation has three independent sources of behavior:

- menu dimensions are estimated with constants that do not match the rendered CSS;
- root and submenu placement use separate ad hoc fallback rules;
- menu dismissal relies on a one-time blur suppression flag between two focusable windows.

This creates concrete failure modes:

- a large action list creates a window taller than the display work area;
- transparent window space can be larger than the visible menu surface;
- when neither submenu side fits, clamping can cover most of the first-level menu;
- focus moving from the submenu back to the first-level menu can be mistaken for an outside click;
- repeated submenu opening replaces windows and can flicker even when the requested submenu did not change.

## 4. Architecture

### 4.1 Menu model

`src/main/pet-context-menu-model.js` owns menu semantics only.

It will:

- filter manual actions;
- build the first-level and action-submenu item tree;
- keep command callbacks outside geometry and window code.

### 4.2 Layout engine

`src/main/pet-context-menu-layout.js` is a pure geometry module.

It will:

- define the single source of truth for row, separator, padding, margin, and width metrics;
- measure natural content size;
- constrain window height to the selected display work area;
- report whether vertical scrolling is required;
- rank root-menu candidates around the pet;
- rank submenu candidates on the immediate left and right of the first-level menu;
- report overflow, parent overlap, pet overlap, and the reason a candidate won.

Candidate ranking is lexicographic, not a collection of nested fallback branches.

Root-menu ranking order:

1. fully inside the work area;
2. no pet overlap;
3. user placement preference rank;
4. shortest displacement from the requested click anchor.

Submenu ranking order:

1. fully inside the work area;
2. no overlap with the first-level menu;
3. no pet overlap;
4. smallest parent-menu overlap when space is insufficient;
5. smallest pet overlap when space is insufficient;
6. smallest displacement from the ideal flush position;
7. right side as the final tie-break.

The submenu never uses an above or below cascade placement.

### 4.3 Window renderer

`src/main/pet-context-menu-window.js` consumes a completed layout result.

It will:

- render CSS from the same metrics used by the layout engine;
- size the BrowserWindow to the constrained menu viewport;
- enable vertical scrolling only when content exceeds that viewport;
- close the session when transparent/background space inside the window is clicked;
- preserve the zero-gap parent/child visual attachment.

### 4.4 Menu session

The root and submenu windows form one focus group.

The session will:

- close any previous pet-menu session before opening a new one;
- keep a stable root window reference;
- reuse and focus an already-open submenu when the same submenu is requested;
- defer blur dismissal and close only when neither menu window is focused;
- allow focus to move root -> submenu and submenu -> root without dismissal;
- close both windows after any action, Escape, parent movement, parent close, or a true outside focus transition;
- cancel pending dismissal work when the session closes.

## 5. Settings Semantics

The existing setting continues to affect only the first-level menu.

The Control Center label changes from `菜单位置` to `一级菜单位置` so users do not interpret it as a fixed submenu direction.

Configured directions remain preferences. The engine may choose another direction to keep the menu visible and avoid covering the pet.

## 6. Diagnostics

Menu popup logs must include:

- natural content size;
- constrained window size;
- whether scrolling is active;
- selected placement and selection reason;
- pet overlap area;
- parent overlap area for submenu candidates;
- ideal and final coordinates.

The diagnostics are intended to make future positioning reports reproducible without screenshots alone.

## 7. Testing

Pure Node tests must cover:

- exact metric parity for rows and separators;
- long action lists constrained to the work area and marked scrollable;
- all root-menu preference directions and edge fallback;
- right and left submenu placement;
- pet avoidance when both sides fit;
- parent-menu visibility when neither side fits;
- shifted and negative-coordinate display work areas;
- menu model filtering and ordering.

Window-session tests must cover:

- root-to-submenu focus transfer;
- submenu-to-root focus transfer;
- true outside blur dismissal;
- repeated requests reusing one submenu window;
- opening a new root session closing the previous session;
- background click and Escape closing both windows;
- selecting first-level and submenu actions closing both windows exactly once.

IPC tests must cover:

- model callbacks reaching the renderer command channel;
- layout and scroll diagnostics reaching the application log;
- the saved first-level placement preference reaching the layout engine.

## 8. Non-Goals

This redesign does not:

- return to Electron native menus;
- add hover-open behavior;
- add more than one submenu level;
- add user-configurable submenu direction;
- redesign pet actions or pet-pack manifests;
- add speculative grouping, search, favorites, or recent-action ranking.

## 9. Acceptance Criteria

The redesign is complete when:

- the accepted first-level and action-submenu structure is unchanged;
- rendered dimensions and geometry metrics have one source of truth;
- no menu window exceeds its display work area;
- long action lists scroll inside the submenu;
- the submenu is flush left or right of the first-level menu;
- a non-overlapping side is chosen whenever one exists;
- insufficient-space fallback minimizes first-level-menu overlap before pet overlap;
- focus can move between menu levels without closing the session;
- outside click, Escape, action selection, pet movement, and parent close dismiss the full session;
- focused menu tests, core runtime tests, syntax/type checks, and Control Center tests pass.
