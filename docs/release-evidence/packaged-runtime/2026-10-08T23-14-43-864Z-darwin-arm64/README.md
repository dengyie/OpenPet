# Packaged Runtime Smoke Evidence

Generated: 2026-10-08T23:14:43.864Z

This is a real launch of the unsigned macOS arm64 package from the active development worktree, using an isolated temporary user-data directory. All **14/14** packaged-runtime checks passed.

The smoke report links the observed native picker evidence at [`desktop-picker-smoke-report.json`](../../desktop-picker/2026-10-08T21-01-48Z-darwin-arm64/desktop-picker-smoke-report.json). It maps only the picker checks needed by the packaged-runtime checks. The linked picker report remains **8/9** because `plugin-install-disabled` was not run; the runtime evidence does not claim that behavior passed.

## Claim boundary

- Verified launch, visible transparent pet window and sprite, floating chat, action playback, four built-in pet packs, stable final state, plugin picker cancel/review, Pet Pack and Actions picker paths, and invalid-package feedback.
- The artifact is unsigned. This is local demo evidence and does not prove macOS release readiness.
- Screenshots are Electron `BrowserWindow.capturePage()` captures, not full-desktop screenshots.

## Evidence files

- [`packaged-runtime-smoke-report.json`](./packaged-runtime-smoke-report.json)
- [`packaged-runtime-smoke-evidence.json`](./packaged-runtime-smoke-evidence.json)
- [`packaged-runtime-smoke-runbook.md`](./packaged-runtime-smoke-runbook.md)
- `screenshots/packaged-runtime.png` and `screenshots/packaged-runtime-bubble-chat.png`
