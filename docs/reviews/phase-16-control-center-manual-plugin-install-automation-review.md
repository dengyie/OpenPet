# Phase 16 Control Center Manual Plugin Install Automation Review

## Findings

No blocking issues found.

## Review Notes

- The new demo API review payload mirrors the real plugin install contract closely enough for Control Center UI regression: selection id, install mode, plugin metadata, permission diff, signature status, block status, file count, size, and package hash are all represented.
- Manual plugin install remains disabled by default after install in the demo path, matching the safety posture documented for third-party plugins.
- The change is scoped to `src/control-center/src/api/control-center-api.js` and `tests/control-center/control-center-smoke.spec.js`; it does not alter main-process plugin installation, plugin runner permissions, preload IPC contracts, or SDK capabilities.
- Plugin logs now persist in demo session state, which lets the UI test verify install feedback and reload persistence without introducing filesystem state.
- The Playwright test asserts both cancel and install paths, reducing the chance that a stale review selection or hidden panel regression slips through.

## Verification

Commands run for this phase:

```bash
npm run test:control-center -- --grep "manual plugin packages"
npm run test:control-center
npm run check:syntax
npm test
git diff --check
```

Observed result:

- Targeted Playwright test: 1/1 passed.
- Full Control Center Playwright suite: 9/9 passed.
- Syntax/build check: `node --check` and Vite build passed.
- Node test suite: 236/236 passed.
- Diff whitespace check: passed.

## Residual Risk

- This phase validates the Control Center review UI in demo API mode. It does not prove the Electron-hosted native file picker works on every platform.
- This phase does not replace real plugin package validation tests for zip contents, path safety, hash handling, blocklist decisions, or signature verification.
- Windows release readiness remains unchanged: signed artifact evidence and real Windows smoke validation are still required before public Windows support can be claimed.
