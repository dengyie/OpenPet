# Packaged Runtime Smoke Evidence

Generated: 2026-10-09T02:18:20.645Z

This is a real launch of the fresh unsigned macOS arm64 package using an isolated temporary user-data directory. The packaged runtime smoke report passes **11/14** checks. Launch, the visible pet window, transparent background, sprite and action playback, floating bubble chat, all four bundled pet packs, and stable final state passed.

The three incomplete checks are `plugin-picker-evidence-linked` (pending), `pet-picker-evidence-linked` (pending), and `invalid-package-feedback` (blocked). The available desktop picker report at [`../../desktop-picker/2026-10-08T21-01-48Z-darwin-arm64/desktop-picker-smoke-report.json`](../../desktop-picker/2026-10-08T21-01-48Z-darwin-arm64/desktop-picker-smoke-report.json) predates the Pet Pack picker HTTP cutover, so it is not linked as current packaged evidence. Source-level Backend HTTP to Sidecar reverse-channel smoke separately verifies accept, cancel, and renderer path rejection without opening desktop UI.

## Claim Boundary

- This continuation did not interact with the desktop UI.
- The package is unsigned local demo evidence and does not establish release readiness.
- Screenshots are Electron `BrowserWindow.capturePage()` captures, not full-desktop screenshots.

## Evidence Files

- [`packaged-runtime-smoke-report.json`](./packaged-runtime-smoke-report.json)
- [`packaged-runtime-smoke-evidence.json`](./packaged-runtime-smoke-evidence.json)
- [`packaged-runtime-smoke-runbook.md`](./packaged-runtime-smoke-runbook.md)
- `screenshots/packaged-runtime.png` and `screenshots/packaged-runtime-bubble-chat.png`
