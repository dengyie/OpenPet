# macOS System Cursor Design

> Date: 2026-07-10
> Status: approved for implementation
> Scope: make the existing `customCursorScope: 'system'` control apply the selected OpenPet cursor across macOS

## Outcome

When a macOS user selects a non-system cursor and enables `应用到整个电脑`, OpenPet must replace the WindowServer cursor across applications. Switching back to `仅 OpenPet`, selecting `系统默认`, deleting the active cursor, helper failure, or quitting OpenPet must restore the cursor theme that was active before OpenPet.

The UI must report the actual runtime result. A failed native activation keeps `customCursorScope: 'openpet'`; it must never persist or display a false enabled state.

## Architecture

### Native helper

`native/macos-system-cursor/OpenPetSystemCursor.swift` is a small AppKit executable. It:

- dynamically resolves the private CGS cursor APIs and fails closed if they are unavailable;
- copies the current named and auxiliary cursor images into OpenPet-owned backup registrations;
- registers the selected PNG, configured size, and hotspot for every covered cursor family;
- includes legacy identifiers, discovered system identifiers, and macOS 26 `ArrowS` / `IBeamS` aliases;
- runs a restore watchdog that restores backups if the helper exits unexpectedly;
- emits `ready` only after backup, watchdog, and replacement are active.

The helper does not create an overlay window and does not hide the native pointer. It replaces the native WindowServer cursor and restores the previous cursor theme on clean shutdown, helper loss, or the next activation after an unclean exit.

### Main-process service

`src/main/services/system-cursor-service.js` owns the helper lifecycle. It exposes:

- `getStatus()` for platform support and active state;
- `apply(cursor)` to materialize any built-in/data-URL cursor to a PNG, launch the helper, wait for readiness, and atomically replace an older helper;
- `stop(reason)` to terminate the helper and wait for exit;
- `sync(settings)` to apply only when scope is `system` and the selected runtime cursor is enabled;
- `dispose()` as the app-shutdown recovery path.

The service accepts injected spawn/build/file dependencies for deterministic tests. Production logs use `scope: 'system-cursor'` and record activation, deactivation, helper exit, and failures without cursor image content.

### Settings and IPC

`normalizeCustomCursorScope` accepts only `openpet` and `system`. The settings save IPC asks `SystemCursorService` to apply the candidate settings before persisting them. If activation fails, the IPC throws, leaves the previous settings untouched, and the Control Center keeps the previous scope with an error message.

Saving `openpet`, selecting `系统默认`, or deleting the selected cursor stops the helper before the new settings are committed. Startup synchronizes persisted settings after cursor asset repair. App shutdown stops the helper before the existing plugin-shutdown gate allows Electron to exit.

The pet renderer receives `customCursorScope`. Its local overlay is active only for `openpet`, preventing a second OpenPet cursor while system mode is active.

## Platform Boundary

This milestone implements macOS only. On Windows and Linux the service reports unsupported and the Control Center disables system scope with a platform-specific explanation. Windows system-cursor replacement remains backlog because `SetSystemCursor` mutates shared OS state and needs a separate recovery design.

## Build And Packaging

`scripts/build-macos-system-cursor-helper.js` compiles arm64 and x64 helpers with the installed Swift toolchain into `build/native/<arch>/OpenPetSystemCursor`. The script skips cleanly on non-macOS hosts. Development startup and packaging build both supported architectures before launching or packaging Electron, while runtime selection still follows `process.arch`. The helper source and compiled runtime paths are included by electron-builder; compiled output remains ignored by git.

## Failure And Recovery

- The helper exits before `ready`: activation fails and settings remain unchanged.
- A target cursor cannot be backed up without loss: activation fails and settings remain unchanged.
- The helper exits after `ready`: the restore watchdog restores the previous cursor theme, while the service records the failure and persists a fallback to `openpet` through a host callback.
- A replacement cursor fails to start: the current working helper remains active until the replacement is ready.
- Electron quits: runtime lifecycle awaits `dispose()` before final quit.
- Helper receives `SIGTERM` or `SIGINT`: it restores the previous cursor theme before exit. `SIGHUP` atomically re-registers the new OpenPet cursor while preserving the original backup set.
- A machine crash cannot run cleanup. The watchdog covers helper `SIGKILL`, but a full host crash still requires a fresh activation to restore stale OpenPet backups or, if the session was externally polluted, manual recovery of the system cursor theme.

## Verification

- Node unit tests cover platform support, helper readiness, replacement, startup failure, unexpected exit, stop, and settings fallback.
- IPC tests cover successful persistence, failure without persistence, and local-overlay suppression in system mode.
- Swift helper smoke launches against generated cursors, verifies representative named and auxiliary registrations, verifies update, then proves normal and abnormal exit restoration.
- `npm run check:syntax`, focused tests, `npm test`, and Control Center cursor Playwright regressions run before merge readiness.
