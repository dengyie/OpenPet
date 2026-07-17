# System Cursor Replacement And Size Panel Design

## Goal

When a custom cursor is applied to the whole macOS desktop, OpenPet must replace the WindowServer cursor itself instead of drawing a second overlay and attempting to hide the native pointer. The Control Center cursor-size controls must remain compact, visually grouped, and easy to scan without changing cursor data or scope behavior.

## Scope

- Replace the macOS transparent cursor overlay with WindowServer cursor registration.
- Cover legacy cursor names, auxiliary cursor identifiers, and the macOS 26 `ArrowS` / `IBeamS` aliases.
- Back up the active system cursors before replacement and restore them on update failure, shutdown, helper loss, and the next activation after an unclean exit.
- Add native regression evidence for apply, update, normal restoration, and crash restoration.
- Keep the completed compact cursor-size panel and its responsive layout.

Windows cursor replacement, release signing, notarization, and cursor-library data migrations are out of scope.

## Root Cause

The previous helper combined a click-through overlay window with `CGDisplayHideCursor`. Cursor hiding is connection-scoped. A foreground application or another process can show or replace the native cursor through its own WindowServer connection, while OpenPet's overlay remains visible. Repeating the hide call, adding focus observers, or moving the hide call into another process does not establish ownership of the global cursor and cannot prevent the two pointers from appearing together.

## Native Cursor Replacement

The helper dynamically resolves the private WindowServer cursor APIs at runtime:

- `CGSRegisterCursorWithImages`
- `CGSRemoveRegisteredCursor`
- `CGSCopyRegisteredCursorImages`
- `CGSGetRegisteredCursorDataSize`
- `CGSCursorNameForSystemCursor`
- `CoreCursorCopyImages`

If any required symbol is unavailable, activation fails before settings are persisted and OpenPet remains in `openpet` scope.

The helper discovers named cursor identifiers through `CGSCursorNameForSystemCursor`, including macOS 26 aliases such as `com.apple.coregraphics.ArrowS` and `com.apple.coregraphics.IBeamS`, plus the animated `com.apple.coregraphics.Wait` cursor when available. It also covers the known auxiliary `com.apple.cursor.*` identifiers. Every covered identifier is registered with the selected OpenPet cursor image, dimensions, and hotspot. No transparent panel is created and the native cursor remains visible as the only rendered pointer.

## Backup And Recovery

Before applying a replacement, the helper copies each current cursor's images and metadata and registers them under OpenPet-owned backup identifiers. Animated backups with more frames than `CGSRegisterCursorWithImages` accepts are uniformly sampled down to the supported frame cap while preserving first and last frames. Existing OpenPet backups are treated as evidence of an unclean prior exit and are restored before a new backup is created.

The helper starts a small restore watchdog after backups are ready and before replacement begins. The watchdog observes the helper PID:

- normal shutdown: the helper restores all backups, removes the backup registrations, then stops the watchdog;
- helper crash or `SIGKILL`: the watchdog restores all backups and removes them;
- next activation after both processes were lost: startup restores stale OpenPet backups before applying a new cursor.

OpenPet never removes arbitrary third-party cursor registrations. Restoration uses only the OpenPet-owned backups captured immediately before activation, preserving the user's previous cursor theme.

## Updates

`SIGHUP` reloads the existing config and re-registers the selected image over the already-backed-up identifiers. The backup set is not replaced during an update, so disabling system scope still restores the cursor theme that existed before OpenPet first activated whole-computer mode.

If any identifier fails during initial apply, the helper restores the complete backup set and reports an activation error. If an update fails, it restores the previous OpenPet custom cursor registration for every identifier before reporting the error, so the running state remains consistent with the last acknowledged config.

## Native Verification

The opt-in native smoke compiles a temporary cursor inspection probe. The proof sequence is:

1. Capture representative named and auxiliary cursor metadata before launch.
2. Launch the real helper and wait for `ready`.
3. Verify both cursor families expose the configured dimensions and hotspot.
4. Reload a second config and verify the replacement changes immediately.
5. Stop the helper normally and verify the original cursor metadata is restored.
6. Launch again, terminate the helper with `SIGKILL`, and verify the watchdog restores the original metadata.

The test cleanup also runs stale-backup recovery so a failed assertion cannot leave the machine modified.

## Compact Size Panel

The top cursor-selection banner and horizontal cursor cards remain unchanged. The size panel uses a compact two-row control:

- row one groups the selected cursor name and rendered dimensions on the left, with the percentage and reset action on the right;
- row two places the slider directly below with `50%` and `200%` endpoints;
- the long explanatory paragraph and duplicated metadata row remain removed;
- narrow layouts wrap the summary controls without stretching the slider or introducing overflow.

## Compatibility Boundary

These CGS APIs are private and may change in a future macOS release. Runtime symbol checks and fail-closed activation prevent false success. The supported contract is therefore capability-based rather than version-assumed: if registration, backup, or restoration cannot be proven during activation, whole-computer mode is rejected and OpenPet-only mode remains active.

## Acceptance Criteria

- Whole-computer mode renders one custom WindowServer cursor, with no OpenPet overlay and no hidden native pointer.
- Arrow, I-beam, pointing, resize, and other covered cursor families use the selected image, including macOS 26 aliases.
- Cursor updates take effect without restarting OpenPet.
- Disabling whole-computer mode or quitting OpenPet restores the cursor theme that was active before OpenPet.
- A helper crash or `SIGKILL` is recovered by the watchdog; stale backups are recovered on the next activation.
- Unsupported private API availability fails closed without persisting system scope.
- The size panel remains compact on desktop and narrow layouts.
- Native smoke, service tests, Control Center tests, typecheck, syntax checks, and relevant Node tests pass.
