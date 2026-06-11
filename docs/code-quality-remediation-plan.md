# Code Quality Remediation Plan

> Last updated: 2026-06-11
> Source: production code quality review before the next development phase

## Goal

Stabilize the current Electron desktop pet platform before adding more features. The focus is not formatting cleanup; it is fixing reachable production risks around local HTTP control, action data integrity, runtime consistency, AI reliability, and pet pack validation.

## Current Baseline

Validation already passes:

```bash
npm test
npm run check:syntax
npm run build:control-center
```

Current result from post-remediation run:

- `npm test`: 63 tests passing
- `npm run check:syntax`: passing
- `npm run build:control-center`: passing

## Remediation Status

Implemented in this workspace:

- [x] Local HTTP mutating endpoints require a token and reject browser-simple unauthenticated posts.
- [x] Local HTTP unauthenticated status no longer returns the full pet snapshot.
- [x] Local HTTP start validates token/port and preserves the previous server if replacement startup fails.
- [x] Local HTTP same-port saves update token/config without restarting the socket.
- [x] Service config is saved after runtime start/stop succeeds.
- [x] Deleting the last valid action is blocked in `ActionImportService`.
- [x] Action deletion uses a backup/restore flow around regeneration.
- [x] AI requests use timeout-based cancellation.
- [x] AI conversation history is bounded.
- [x] Pet pack actions require safe sprite paths and valid runtime numbers.
- [x] Legacy animation configs are normalized with compatibility defaults before strict pet pack validation.
- [x] Regression tests cover the repaired risk paths.

## Post-Remediation Review

Reviewed after implementation:

- No blocking findings remain in the repaired paths.
- Local HTTP fixed-port saves are handled in place when host and port are unchanged, so saving an already-running fixed port no longer collides with the existing server.
- Local HTTP replacement startup still preserves the previous server when the new port is unavailable.
- Strict pet pack schema applies to runtime-ready manifests, while legacy `animations.json` input is first filled with conservative defaults so older configs do not collapse to an empty action pack.
- If a legacy action receives fallback dimensions (`1x1`), it remains loadable but may preview incorrectly until sprites are regenerated. Prefer `npm run generate-sprites` or the Control Center action import flow to restore accurate dimensions.

## Priority Order

1. P1: Protect the local HTTP API from browser-origin side effects.
2. P1: Prevent deleting the final valid action from corrupting local assets.
3. P2: Make local HTTP config persistence transactional with runtime startup.
4. P2: Add AI request timeouts and bounded conversation history.
5. P2: Harden pet pack/action schema validation for runtime numeric fields.

---

## Task 1: Secure Local HTTP API

**Severity:** P1

**Problem:** `src/main/services/local-http-service.js` accepts unauthenticated POSTs to `/api/pet/say`, `/api/pet/action`, and `/api/pet/event`. A browser page can send a simple `text/plain` POST to `127.0.0.1:<port>` and trigger side effects when the service is enabled.

**Target files:**

- `src/main/services/local-http-service.js`
- `src/main/settings.js`
- `src/main/ipc.js`
- `src/control-center/src/main.jsx`
- `tests/services/local-http-service.test.js`

**Implementation plan:**

- [ ] Add an API token concept to `localHttp` settings or runtime state.
- [ ] Generate a token when enabling the service if one does not exist.
- [ ] Require the token for all mutating endpoints.
- [ ] Prefer an `Authorization: Bearer <token>` header or `X-ibot-Token` header.
- [ ] Reject mutating requests without the token before reading the body.
- [ ] Reject unsupported content types for JSON endpoints.
- [ ] Decide whether `GET /api/status` should expose full `petService.getSnapshot()` without a token. If not, return only service status publicly and require token for the full snapshot.
- [ ] Update Control Center Service tab to show/copy the token only if needed for local integrations.
- [ ] Add tests proving browser-simple `text/plain` POSTs cannot trigger `say/action/event`.
- [ ] Add tests for valid token success, missing token failure, invalid token failure, and malformed JSON failure.

**Acceptance criteria:**

- A request without the configured token cannot trigger any pet side effect.
- A browser-simple POST without custom headers returns 401 or 403 and does not call `petService`.
- Existing loopback-only host protection remains intact.
- Service remains off by default.

---

## Task 2: Prevent Last Action Deletion Data Loss

**Severity:** P1

**Problem:** `src/main/services/action-import-service.js` deletes the target action folder and sprite before regenerating config. If the deleted action is the last valid action, `generateSpritesFromFrames()` throws `No valid actions found`, but the files have already been removed.

**Target files:**

- `src/main/services/action-import-service.js`
- `src/main/ipc.js`
- `tests/services/action-import-service.test.js`

**Implementation plan:**

- [ ] Move the "at least one valid action must remain" invariant into `ActionImportService`.
- [ ] Before deleting, inspect current actions and refuse deletion when only one valid action remains.
- [ ] Make deletion transactional where practical: validate the post-delete state before removing files, or move deleted files to a temporary backup and restore on failure.
- [ ] Return a user-facing error such as `Cannot delete the last action`.
- [ ] Keep the UI disabled state, but treat it as convenience only.
- [ ] Add a service test for refusing to delete the last action.
- [ ] Add a service test for failed regeneration not removing source assets.
- [ ] Add an IPC-level or handler-level test if IPC test harness exists later.

**Acceptance criteria:**

- Deleting the last valid action fails before any frame or sprite file is removed.
- Deleting one action from a multi-action pack still regenerates config correctly.
- The service layer enforces the invariant even if UI state is stale or bypassed.

---

## Task 3: Make Local HTTP Config Save Transactional

**Severity:** P2

**Problem:** `src/main/ipc.js` saves `settings.localHttp.enabled = true` before `localHttpService.start(nextConfig)` succeeds. If start fails because the port is invalid, unavailable, or occupied, settings remain enabled with a broken runtime.

**Target files:**

- `src/main/ipc.js`
- `src/main/services/local-http-service.js`
- `tests/services/local-http-service.test.js`
- Future: IPC handler tests

**Implementation plan:**

- [ ] Change `SERVICE_SAVE_CONFIG` flow to validate and start/stop first, then save settings only after success.
- [ ] If replacing a running server fails, preserve the previous running server when possible.
- [ ] Return `{ config, runtime }` where `config.enabled` reflects the last successfully saved state.
- [ ] Add a small helper for normalizing and validating service config before persistence.
- [ ] Add tests for invalid port not being persisted.
- [ ] Add tests for occupied port failure preserving previous config.

**Acceptance criteria:**

- Failed service start does not persist `enabled: true` for a failed runtime.
- App restart does not repeatedly retry a known-bad saved config.
- Control Center cannot display "enabled" config while runtime failed unless it is explicitly represented as an error state.

---

## Task 4: Add AI Timeout And History Bounds

**Severity:** P2

**Problem:** `src/main/services/ai-service.js` calls `fetch` without cancellation. `chat()` also stores conversation history in an unbounded `Map`, and each conversation grows indefinitely.

**Target files:**

- `src/main/services/ai-service.js`
- `src/control-center/src/main.jsx`
- `tests/services/ai-service.test.js`

**Implementation plan:**

- [ ] Add an AI request timeout setting with a conservative default, for example 30 seconds.
- [ ] Use `AbortController` for `complete()`.
- [ ] Convert abort errors into clear user-facing errors.
- [ ] Limit stored messages per conversation, for example keep the latest 20 messages plus the system prompt.
- [ ] Limit total conversations or add an idle eviction strategy.
- [ ] Validate empty/oversized user messages before calling the provider.
- [ ] Add tests for timeout/abort behavior.
- [ ] Add tests proving conversation history is trimmed.

**Acceptance criteria:**

- A slow provider cannot leave Control Center permanently in `saving` or `chatting`.
- Repeated chats do not grow memory or provider payloads without bound.
- Existing AI config and secret isolation behavior remains unchanged.

---

## Task 5: Harden Pet Pack Schema

**Severity:** P2

**Problem:** `src/main/pet-pack/schema.js` converts `frameCount`, `frameMs`, `frameWidth`, and `frameHeight` with `Number(...)` but does not reject `NaN`, zero, negative, or non-integer values. Malformed pet packs can reach renderer animation math.

**Target files:**

- `src/main/pet-pack/schema.js`
- `tests/pet-pack/schema.test.js`
- Possibly `src/main/services/sprite-generator.js`

**Implementation plan:**

- [ ] Add helpers for positive integer validation.
- [ ] Require `frameCount >= 1`.
- [ ] Require `frameMs` to be a reasonable positive integer, for example `16 <= frameMs <= 5000`.
- [ ] Require `frameWidth > 0` and `frameHeight > 0` for runtime-ready actions.
- [ ] Decide whether legacy actions without dimensions should be rejected or normalized only at import/generation time.
- [ ] Validate sprite paths are relative and do not contain path traversal.
- [ ] Add schema tests for `NaN`, zero, negative, huge timing, and unsafe sprite paths.

**Acceptance criteria:**

- Invalid pet pack manifests fail fast in the main process.
- Renderer never receives invalid animation dimensions or timing from a normalized manifest.
- Legacy generated assets still load successfully.

---

## Suggested Execution Sequence

1. Fix Task 1 and Task 2 first. These are the data/safety blockers.
2. Run full validation:

   ```bash
   npm test
   npm run check:syntax
   npm run build:control-center
   ```

3. Fix Task 3 to remove config/runtime mismatch.
4. Fix Task 4 and Task 5 before adding more AI, plugin, local HTTP, or pet pack features.
5. Update `docs/HANDOFF.md` after the remediation work lands so future agents see the new invariants.

## Regression Test Checklist

- [ ] Local HTTP rejects unauthenticated mutating requests.
- [ ] Local HTTP still serves valid authenticated local integrations.
- [ ] Local HTTP failed startup does not persist bad enabled config.
- [ ] Last action cannot be deleted through service or IPC.
- [ ] Multi-action deletion still works.
- [ ] AI timeout returns a controlled error.
- [ ] AI conversation history is bounded.
- [ ] Pet pack schema rejects invalid numeric fields.
- [ ] Existing `npm start` path remains functional.

## Notes For Future Development

- Keep security and data integrity rules in the service layer, not only in React disabled states.
- Treat Control Center UI checks as ergonomics, not authorization or invariant enforcement.
- Keep local HTTP disabled by default unless a user explicitly enables it.
- Do not expose API keys or local HTTP tokens to ordinary plugins.
- Prefer adding focused tests next to each service before broad UI work.
