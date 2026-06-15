# Phase 17 Electron Plugin Package IPC Smoke Review

## Findings

No blocking issues found.

## Review Notes

- `registerIpcHandlers()` now accepts injectable `ipcMainService` and `dialogService` while preserving Electron's real `ipcMain` and `dialog` as production defaults.
- The injection keeps IPC registration testable without changing channel names, preload contracts, plugin install service behavior, or renderer-facing API shape.
- The new IPC smoke test covers the native picker cancel path and asserts the picker still advertises directory + zip selection options.
- The real package path uses a generated `.openpet-plugin.zip` fixture with `plugin.json`, `index.js`, and `signature.json`, then flows through `plugins:inspect-package` and `plugins:install` using the actual `PluginInstallService`.
- Install assertions preserve the plugin security posture: package signature hash metadata is verified, install mode is reviewed, the plugin is installed disabled by default, and installed metadata records the signature status.
- The change does not alter third-party plugin runner permissions, SDK capabilities, manifest permission allowlists, API-key handling, or local HTTP/MCP exposure.

## Verification

Commands run for this phase:

```bash
node --test tests/main/ipc-plugin-install.test.js
npm test
npm run test:control-center
npm run check:syntax
git diff --check
```

Observed result:

- Targeted IPC smoke test: 2/2 passed.
- Full Node test suite: 238/238 passed.
- Full Control Center Playwright suite: 9/9 passed.
- Syntax/build check: passed, including Node syntax validation and Control Center production build.
- Diff whitespace check: passed.

## Residual Risk

- This phase validates the main-process IPC glue with a fake dialog result and a real zip fixture. It does not visually exercise a native macOS or Windows file picker in a launched Electron window.
- This phase does not launch a packaged app, run the Windows NSIS installer, inspect transparent-window compositor behavior, or fill real Windows smoke evidence.
- Windows release readiness remains unchanged: signed artifact evidence and real Windows smoke validation are still required before public Windows support can be claimed.
