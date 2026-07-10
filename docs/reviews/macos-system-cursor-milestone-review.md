# macOS Whole-Computer Cursor Milestone Review

> Date: 2026-07-11
> Mode: final production review
> Result: pass

## Scope

Reviewed the native macOS helper, `SystemCursorService`, settings transaction, startup and shutdown recovery, renderer suppression, Control Center state flow, packaging, tests, and current documentation truth.

## Findings

- Blocking issues: none.
- Medium issues: none remaining. The first verification run exposed ambiguous Playwright text locators after adding `仅 OpenPet`; the locators now use exact accessible-name matching.
- Non-blocking suggestions: Windows and Linux whole-computer cursor support remains backlog and must use a separate native recovery design.
- Security risk: low. The helper is host-owned, receives only a managed image path and numeric metadata, creates a click-through window, and does not edit OS cursor preferences.
- Stability risk: low. Activation precedes persistence; startup repair precedes restore; helper failure falls back to `openpet`; app quit awaits helper disposal; the helper monitors its Electron parent.
- Maintainability risk: low. Native behavior is isolated behind `SystemCursorService`, while renderer and Control Center consume typed runtime status.
- Test coverage: service lifecycle, IPC transaction and rollback, bootstrap restore/fallback, renderer suppression, UI persistence, full Node regression, full Control Center regression, and real native helper smoke.

## Verification

- `npm run check:syntax`: pass.
- `npm test`: 1753 passed, 0 failed, 1 opt-in native smoke skipped.
- `npm run test:control-center`: 68 passed, 0 failed.
- `OPENPET_RUN_NATIVE_CURSOR_SMOKE=1 node --test tests/services/system-cursor-native-smoke.test.js`: 1 passed.

Quality score: 94/100. Status: pass.

## Post-review hardening

The final independent review identified and fixed bounded failure-path issues before merge: failed stop signals no longer suppress unexpected-exit fallback or wait forever, failed immediate cursor mutations conditionally restore cursor fields without overwriting newer fallback state or unrelated Control Center drafts, display lifecycle payloads retain native runtime status, shutdown timeout logs use runtime ownership, macOS packaging prepares both supported architectures, and the unused hidden-built-in list export was removed.
