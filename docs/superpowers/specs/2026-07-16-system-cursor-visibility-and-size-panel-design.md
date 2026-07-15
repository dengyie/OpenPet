# System Cursor Visibility And Size Panel Design

## Goal

When a custom cursor is applied to the whole macOS desktop, OpenPet must keep the native system cursor hidden so users never see two overlapping pointers. The Control Center cursor-size controls must also be compact, visually grouped, and easy to scan without changing cursor data or scope behavior.

## Scope

- Harden the existing macOS overlay helper built on public AppKit and CoreGraphics APIs.
- Add native regression evidence for cursor visibility recovery and shutdown restoration.
- Compact the existing cursor-size panel while preserving the top cursor-selection banner.
- Preserve cursor upload, selection, deletion, resizing, hotspot scaling, and scope persistence.

Windows cursor replacement, private macOS APIs, release signing, and cursor-library data migrations are out of scope.

## Native Cursor Visibility

The current helper hides the system cursor once during startup and then only repositions the custom overlay. macOS or a foreground application can later show the native cursor again, leaving the custom overlay and native pointer visible together.

The helper will own at most one outstanding hide assertion:

1. On startup, check `CGCursorIsVisible()` before hiding.
2. If visible, call `CGDisplayHideCursor` for the display under the pointer and mark the hide assertion as owned.
3. During the existing 120 Hz poll, check visibility. If the native cursor becomes visible again, reassert hiding once. A visible cursor means the previous hide assertion is no longer outstanding, so the helper still owns only one current assertion.
4. On shutdown, call `CGDisplayShowCursor` once only when the helper owns a hide assertion.
5. If hiding fails, terminate activation or report a protocol error rather than claiming whole-computer mode is active.

The display under the pointer is resolved from `NSScreen.screens`; the main display is the fallback. No private cursor replacement APIs are introduced.

## Native Verification

The opt-in native smoke test will compile a small temporary CoreGraphics probe. The proof sequence is:

1. Launch the real helper and wait for `ready`.
2. Verify the native cursor is hidden.
3. Use the probe to show the native cursor, reproducing the current failure condition.
4. Wait for the running helper to hide it again.
5. Stop the helper and verify the native cursor is visible again.

The test must restore cursor visibility in cleanup even when an assertion fails.

## Compact Size Panel

The top cursor-selection banner and horizontal cursor cards remain unchanged. The size panel becomes a compact two-row control:

- Row one: selected cursor name and rendered dimensions on the left; percentage badge and `恢复默认大小` action on the right.
- Row two: the size slider directly below with minimum and maximum labels at its ends.
- The long explanatory paragraph and duplicated metadata row are removed.
- When no cursor is selected, the panel keeps a short single-line empty hint.
- On narrow screens, the header controls wrap without stretching the slider or introducing horizontal overflow.

The reset action remains available only when the selected cursor has a persisted non-default size.

## Error Handling And Observability

- Startup hide failure remains a hard activation failure.
- Re-hide failures emit a protocol error containing the active config version so the host can fail safely.
- Cleanup never performs an unmatched show call.
- Existing host lifecycle logs remain the source of activation, update, deactivation, and fallback evidence.

## Acceptance Criteria

- Whole-computer mode shows only the custom cursor after activation.
- If another process or system transition reveals the native cursor, it is hidden again automatically within the helper polling interval.
- Disabling whole-computer mode or quitting OpenPet restores the native cursor.
- The size panel presents name, dimensions, percentage, reset action, and slider as one compact visual group.
- Desktop and narrow Control Center layouts remain readable and free of overflow.
- Native smoke, Control Center Playwright regression, typecheck, syntax/build checks, and relevant Node tests pass.
