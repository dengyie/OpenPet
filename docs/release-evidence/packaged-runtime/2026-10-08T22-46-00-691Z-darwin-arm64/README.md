# Packaged Runtime Smoke Evidence

Generated: 2026-10-08T22:46:00.691Z

This is a real launch of the current unsigned local macOS arm64 package built from the active development worktree. The app used an isolated temporary user-data directory. The runtime smoke passed 11 of 14 checks, with no failed checks; plugin and pet native-picker evidence remain pending, and invalid-package feedback remains blocked on paired picker evidence.

## Result

- Platform: darwin / arm64
- Signed: false; this is demo evidence and does not establish release readiness.
- Checks: 11 pass, 2 pending, 1 blocked, 0 failed.
- Captures: the pet window and floating chat window are captured with Electron BrowserWindow.capturePage(), not as full-desktop screenshots.
- Report: packaged-runtime-smoke-report.json
- Sanitized runtime evidence: packaged-runtime-smoke-evidence.json

The runtime build reported an invalid macOS signature. Its local app path was redacted in the archived report. No signing or notarization credentials were used.

## Claim Boundary

The run covers launch, visible transparent pet window, sprite, floating bubble chat, action playback, four built-in pet packs, and stable final pack state. It does not establish native picker acceptance, invalid-package feedback, public installer readiness, Provider image generation, or Agent Awareness dashboard/noise acceptance.
