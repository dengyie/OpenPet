# Cursor Card Delete Management Design

> Date: 2026-07-03
> Status: approved for implementation
> Scope: Control Center cursor card deletion UX and state contract
> Out of scope: cursor editing, bulk management, built-in cursor reset, renderer overlay bugfixes unrelated to deletion

## 1. Background

OpenPet's current cursor settings page already supports:

- selecting a cursor,
- importing a custom cursor,
- resizing the selected non-system cursor,
- persisting selected cursor and size metadata.

The current gap is that uploaded custom cursors cannot be deleted from the new card-based picker UI. There is no visible delete affordance, so the user can only keep adding new uploaded cursors.

This document defines the bounded management feature for the current milestone: add a delete affordance directly onto eligible cursor cards without reintroducing a separate management panel.

## 2. Current Code Truth

As of this design pass:

- Cursor cards are rendered in `src/control-center/src/panes/PetPane.tsx`.
- Cursor settings state is owned in `src/control-center/src/hooks/usePetSettingsPane.ts`.
- Persisted cursor selection and cursor collection normalization are owned by `src/shared/cursor-library.ts` and `src/shared/cursor-library.js`.
- Main-process settings save and orphaned custom cursor asset cleanup are already handled by `src/main/ipc/register-settings-ipc.js` and `src/main/ipc/pet-settings-adapter.js`.
- `customCursors` is no longer a pure "user-uploaded cursor list". It now also stores built-in cursor size override records.

This last point is the main design constraint: deletion rules must not treat all `customCursors` entries as user-managed removable cursors.

## 3. Product Goal

Allow users to delete uploaded custom cursors directly from the cursor picker cards, with a low-friction but safe interaction, while preserving the existing built-in and system cursor model.

Success looks like:

- uploaded custom cursor cards show a delete affordance,
- clicking delete removes the card and persists the change,
- deleting the currently selected uploaded cursor falls back to `system`,
- built-in cursor cards never show delete,
- system default never shows delete,
- no accidental deletion of built-in size override records,
- existing upload/select/resize flows keep working,
- save failure never leaves the picker UI showing a deleted card that was not actually persisted.

## 4. Confirmed Decisions

- Only uploaded custom cursor cards show the delete button.
- Built-in cursor cards do not show a delete button.
- System default does not show a delete button.
- Deleting the currently selected uploaded cursor immediately switches selection to `system`.
- The current cursor picker continues to hide the `system` card in this milestone.
- Delete is a card-local interaction in the top-right corner of the card.
- Delete requires confirmation before mutation.
- Delete only removes the uploaded cursor record and lets existing host cleanup remove orphaned cursor assets.
- Built-in cursor "restore default size" is a future reset feature and is not part of this delete design.
- No separate "My custom cursors" management panel returns in this milestone.

## 5. Scope Boundary

### In scope

- Card-level delete affordance for uploaded custom cursors
- Delete confirmation UX
- State update and persistence
- Fallback selection behavior
- Status feedback
- Tests and document updates tied to deletion

### Out of scope

- Editing custom cursor name
- Replacing custom cursor image
- Bulk delete
- Built-in cursor removal
- Built-in cursor reset button
- Card re-layout or page redesign beyond what delete needs
- Renderer-side custom cursor hitbox, duplicate cursor, focus, or hotspot bugs unless deletion work directly breaks them

## 6. Interaction Design

### 6.1 Eligible cards

Delete is only available when all of the following are true:

- the card represents a cursor option rendered from user-uploaded custom cursor data,
- the card id is not a built-in cursor id,
- the card id is not `system`.

Implementation should not infer eligibility from storage location alone. Use the rendered option type and built-in id lookup to prevent accidental delete affordances on built-in override-backed cards.

### 6.2 Button placement

- The delete button sits inside the cursor card, aligned to the top-right corner.
- It is visually secondary to the card preview and card check state.
- It must remain visible and clickable on selected cards.
- It must not overlap enough to hide the cursor preview meaningfully.

### 6.3 Button visual behavior

- Default state: low emphasis, compact circular or rounded-square icon button.
- Hover state: stronger contrast to signal destructive interaction.
- Disabled state: hidden or non-rendered; do not leave a dead control on non-deletable cards.
- The control should use an icon that clearly communicates removal, such as `x` or trash, but avoid making the card feel cluttered.

### 6.4 Event behavior

- Clicking the delete button must not select the card.
- The delete button must stop event propagation so the parent card `onClick` does not fire.
- Keyboard activation should remain accessible if the delete control is focusable.

### 6.5 Confirmation

The delete action requires explicit confirmation before mutation.

Recommended default for this milestone:

- browser-native `window.confirm(...)` or the repo's simplest existing confirmation pattern,
- copy should name the cursor being deleted,
- copy should mention that the action removes the uploaded cursor from the list,
- copy does not need to mention built-in cursors because they never expose delete.

Suggested copy:

- Title/body equivalent: `确认删除自定义指针 “{name}”？`
- Secondary detail: `删除后会从指针列表移除；如果它正在使用中，将自动切回系统默认。`

## 7. State And Data Rules

### 7.1 Source of truth

The source of truth remains the settings object managed by `usePetSettingsPane`, persisted through the existing `saveSettings` path.

### 7.2 Deletion target

Deletion removes exactly one uploaded custom cursor record from `settings.customCursors`.

Deletion must not remove:

- any built-in cursor option,
- any `system` option,
- unrelated built-in override entries,
- unrelated uploaded custom cursors.

### 7.3 Selected cursor fallback

If the deleted cursor id equals `settings.selectedCursorId`:

- set `selectedCursorId` to `SYSTEM_CURSOR_ID`,
- let `applyCursorState(...)` normalize the runtime `customCursor` payload,
- persist in the same settings save request.
- because the current page still hides the `system` card, the post-delete UI is allowed to show no selected cursor card while the size panel and status copy reflect that the app is back on system default.

If the deleted cursor is not selected:

- keep the current `selectedCursorId` unchanged,
- persist only the filtered `customCursors` collection.

### 7.4 Asset cleanup

No new explicit delete-assets IPC is needed.

The existing settings-save orphan cleanup path already compares previous and next custom cursor asset paths and deletes orphaned files. This should remain the only asset cleanup mechanism for this milestone.

Guardrail:

- because built-in overrides now use `builtin://...` pseudo paths, cleanup must continue filtering those pseudo paths out of file deletion logic.

## 8. Failure Modes

### User cancels confirmation

- No mutation.
- No status error.
- No selection change.

### Save fails

- The implementation must not rely on the current `persistSettings(...)` helper to restore local UI state automatically; today it only records status text on failure.
- Deletion must therefore use one of these explicit strategies:
  - preferred: do not remove the card from local UI until the save succeeds, or
  - acceptable: optimistically remove it, but explicitly restore `originalRef.current` when the save fails.
- Show a clear status message such as `自定义指针删除失败`.
- Do not silently remove the card only in local UI if persistence fails.

### Selected custom cursor deleted

- UI must immediately reflect `system` as selected after the persisted save succeeds.
- Size panel should reflect the new selected state and stop showing deleted cursor metadata.

### Attempted deletion of unsupported cursor type

- The UI should never expose the control for unsupported cards.
- If a guard is still reached in code, fail safely with no mutation and a neutral status message.

## 9. Implementation Plan

### 9.1 `src/control-center/src/panes/PetPane.tsx`

Add:

- delete button rendering in each eligible uploaded custom cursor card,
- `onClick` stopPropagation for delete,
- visual class hooks for the delete button,
- prop plumbing for `onDeleteCursor`.

Eligibility rule in the view layer:

- card option type must be `custom`.

This is sufficient because built-in override-backed options are merged back into the card list as `builtin`.

### 9.2 `src/control-center/src/hooks/usePetSettingsPane.ts`

Add:

- `onDeleteCursor(cursorId)` action,
- lookup of the targeted uploaded cursor,
- confirmation prompt,
- filtered `customCursors`,
- `selectedCursorId` fallback to `SYSTEM_CURSOR_ID` when needed,
- an explicit save-failure consistency strategy so local card state does not diverge from persisted settings,
- `persistSettings(...)` call with success and error feedback.

Suggested success copy:

- deleting current selection: `已删除指针：{name}，并切换为系统默认`
- deleting non-selected item: `已删除指针：{name}`

Suggested error copy:

- `自定义指针删除失败`

### 9.3 `src/control-center/src/styles.css`

Add:

- positioning rules for the delete control inside `.cursor-option-card`,
- hover/focus/destructive styling,
- spacing that preserves current card density,
- selected-state compatibility,
- responsive behavior on narrow screens.

### 9.4 Tests

Add or update:

- Control Center smoke or component-level regression for delete affordance visibility rules
- delete uploaded custom cursor path
- delete currently selected uploaded custom cursor path with fallback to `system`
- delete failure path proving the card is still present after a rejected save
- no delete affordance on built-in cards
- demo-mode cursor deletion path if the delete interaction is reachable in the demo Control Center shell

Potential file targets:

- `tests/control-center/control-center-smoke.spec.js`
- `tests/main/ipc-cursor-settings.test.js` only if a new host-side persistence nuance appears
- `src/control-center/src/api/demo-control-center-api.ts` if demo-mode deletion needs to mutate mock cursor state

## 10. Acceptance Criteria

- Uploaded custom cursor cards show a top-right delete affordance.
- Built-in cursor cards do not show a delete affordance.
- System default does not show a delete affordance.
- Clicking delete does not also select the card.
- Confirmation appears before deletion.
- Confirming deletion removes the uploaded cursor card from the picker.
- Deleting the currently selected uploaded cursor automatically switches to `system`.
- When the deleted cursor was selected, the page may show no selected cursor card because the current milestone still hides the `system` card; the status and size-panel empty state must still make the fallback clear.
- Deleting a non-selected uploaded cursor keeps the current selection unchanged.
- Refreshing settings after deletion preserves the updated list.
- Orphaned uploaded cursor files continue to be cleaned by the existing settings save path.

## 11. Manual Verification Checklist

1. Open Control Center -> Pet -> 指针选择.
2. Confirm built-in cards have no delete button.
3. Import a new custom cursor.
4. Confirm the new card shows a delete button in the top-right corner.
5. Click the delete button and cancel.
6. Confirm the card remains.
7. Click delete again and confirm.
8. Confirm the card disappears and status updates.
9. Import a second custom cursor and select it.
10. Delete the selected custom cursor.
11. Confirm the selected state falls back to system default.
12. Reload the settings page and confirm the deleted cursor stays gone.

## 12. Follow-Up Ideas

These are intentionally deferred:

- built-in cursor reset-to-default-size action,
- custom cursor rename,
- image replacement,
- dedicated cursor management drawer,
- usage badge or recently used ordering,
- undo toast for deletion.
