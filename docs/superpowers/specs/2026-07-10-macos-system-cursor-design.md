# macOS System Cursor Design

> Date: 2026-07-10
> Status: approved for implementation
> Scope: make the existing `customCursorScope: 'system'` control apply the selected OpenPet cursor across macOS

## Outcome

When a macOS user selects a non-system cursor and enables `应用到整个电脑`, OpenPet must hide the native pointer and display the selected cursor at the global mouse location, including while another application owns focus. Switching back to `仅 OpenPet`, selecting `系统默认`, deleting the active cursor, helper failure, or quitting OpenPet must restore the native pointer.

The UI must report the actual runtime result. A failed native activation keeps `customCursorScope: 'openpet'`; it must never persist or display a false enabled state.

## Architecture

### Native helper

`native/macos-system-cursor/OpenPetSystemCursor.swift` is a small AppKit executable. It:

- decodes a PNG cursor asset supplied by the host;
- creates a click-through, non-activating transparent panel at the cursor window level;
- polls the global mouse location and positions the image so the configured hotspot stays under the pointer;
- calls `CGDisplayHideCursor` exactly once after the panel is ready;
- balances that hide call with `CGDisplayShowCursor` on every normal termination path;
- emits one JSON `ready` line only after the image, panel, and hidden-cursor state are active.

The helper owns both hiding and drawing so those operations cannot drift across two processes. It never edits macOS preference files or changes the user's installed cursor theme.

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

`scripts/build-macos-system-cursor-helper.js` compiles the helper with the installed Swift toolchain into `build/native/<arch>/OpenPetSystemCursor`. The script skips cleanly on non-macOS hosts. Development startup and packaging build the helper before launching or packaging Electron. The helper source and compiled runtime path are included by electron-builder; compiled output remains ignored by git.

## Failure And Recovery

- The helper exits before `ready`: activation fails and settings remain unchanged.
- The helper exits after `ready`: the service records the failure and persists a fallback to `openpet` through a host callback.
- A replacement cursor fails to start: the current working helper remains active until the replacement is ready.
- Electron quits: runtime lifecycle awaits `dispose()` before final quit.
- Helper receives `SIGTERM`, `SIGINT`, or `SIGHUP`: it restores the native pointer before exit.
- A force kill or machine crash cannot run cleanup. macOS releases process-owned cursor hiding when the process exits; this behavior is verified by an isolated helper smoke test in this milestone.

## Verification

- Node unit tests cover platform support, helper readiness, replacement, startup failure, unexpected exit, stop, and settings fallback.
- IPC tests cover successful persistence, failure without persistence, and local-overlay suppression in system mode.
- Swift helper smoke launches against a generated cursor, confirms `ready`, verifies the overlay process stays alive, then terminates and confirms clean exit.
- `npm run check:syntax`, focused tests, `npm test`, and Control Center cursor Playwright regressions run before merge readiness.

