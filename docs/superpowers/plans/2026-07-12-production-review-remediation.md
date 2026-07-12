# Production Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the confirmed production correctness, durability, security, lifecycle, and performance defects found in the review of `9f9ad6345581fc5ae665492eb9c7e4fe98490b5e` before the next release.

**Architecture:** Preserve the existing Electron main-process service boundaries and React Control Center structure. Each workstream owns a disjoint file set, begins with a reproducing test, fixes the root cause without compatibility wrappers, and can be reviewed independently before integration.

**Tech Stack:** Electron 42, Node.js CommonJS services and native test runner, React 19, TypeScript 6, Vite 8, Playwright.

## Global Constraints

- Develop in isolated worktrees and branches; do not edit the protected primary `main` worktree.
- Rebase each implementation branch onto the latest `main` before merge.
- `PetService` remains the single source of truth for pet state and action/event flows.
- API keys must never be exposed to renderers, ordinary plugins, logs, or error payloads.
- Plugin network access remains HTTPS-only and manifest-host-allowlisted.
- Do not add compatibility wrappers, broad fallback behavior, or new dependencies unless the task explicitly requires them.
- Do not change the `cat_anime/` material structure.
- Every task must add a failing regression first, implement the smallest root-cause fix, run its focused suite, and commit only its owned files.
- Before final integration run `npm test`, `npm run test:control-center`, and `npm run check:syntax`.

---

## Reviewed Baseline

Review commit: `9f9ad6345581fc5ae665492eb9c7e4fe98490b5e`.

Fresh baseline verification:

- `npm test`: 1791 passed, 1 skipped, 0 failed.
- `npm run test:control-center`: 68 passed.
- `npm run check:syntax`: passed, including TypeScript, native cursor helper, and Control Center production build.

The green baseline does not cover the failure modes below. These findings are release blockers until their new regression tests pass.

## Non-Goals

- No broad service-layer rewrite.
- No replacement of Node's test runner, Electron IPC model, or React state model.
- No unrelated UI redesign or historical-document cleanup.
- No claim that DNS validation alone closes SSRF; the connection must use the validated address.
- No asynchronous rewrite of unrelated synchronous stores.

## Required Invariants

1. In-memory state represents usable domain data; persisted DTOs represent serialized/encrypted data. They must not share mutable objects.
2. A failed durable write must leave both memory and the last valid disk state unchanged.
3. Conversation history order must match provider execution order.
4. A superseded child process must not settle waiters belonging to its replacement.
5. Plugin package mutations are all-or-nothing from the user's perspective.
6. A validated network destination and the connected destination must be the same IP address.
7. Async UI saves must not erase edits made after the save started.
8. Retrying a committed Agent Awareness event must not duplicate history, usage, or notifications.

## Agent Assignment And Ownership

| Agent | Workstream | Exclusive write scope |
| --- | --- | --- |
| A | Secret storage integrity | `src/main/services/secret-service.js`, `tests/services/secret-service.test.js` |
| B | Settings durability | `src/main/settings.js`, `src/main/services/settings-service.js`, `tests/services/settings-service.test.js`, new settings storage test if needed |
| C | AI Talk queue ordering | `src/main/ipc.js`, `src/main/services/ai-talk-service.js`, focused IPC/AI Talk ordering tests |
| D | AI Talk streaming throughput | `src/main/services/app-log-service.js`, streaming-only portions of `src/main/services/ai-talk-service.js` and `src/main/ipc.js`, focused logging/stream tests |
| E | macOS cursor child lifecycle | `src/main/services/system-cursor-service.js`, `tests/services/system-cursor-service.test.js` |
| F | Plugin package transactions and ZIP limits | `src/main/services/plugin-install-service.js`, `tests/services/plugin-install-service.test.js`, `tests/main/ipc-plugin-install.test.js` only if IPC behavior changes |
| G | Plugin network DNS pinning | `src/main/services/plugin-network-client.js`, network invocation in `src/main/services/plugin-service.js`, focused plugin network tests |
| H | Control Center draft preservation | `src/control-center/src/hooks/usePetSettingsPane.ts`, `src/control-center/src/hooks/useAiPane.ts`, Control Center tests |
| I | Agent Awareness idempotency | `examples/plugins/agent-awareness/service/agent-awareness-service.js`, `tests/examples/agent-awareness-plugin.test.js` |
| J | Dead IPC entry removal | `src/main/ipc/index.js`, one module-entry regression test |

Agents C and D both touch AI Talk files and therefore must run sequentially. Agent D starts only after Agent C is merged or rebased onto C's result. All other agents must stay within their listed write scope; integration conflicts are a signal that ownership needs reassignment, not a reason to overwrite another agent's work.

## Task 1: Separate Secret Runtime State From Encrypted Persistence

**Severity:** P1

**Files:**
- Modify: `src/main/services/secret-service.js`
- Test: `tests/services/secret-service.test.js`

**Evidence:** With mocked `safeStorage`, setting `alpha` immediately returns Base64 ciphertext (`ZW5jOmFscGhh`) instead of plaintext. After restart, setting a second key serializes the first decrypted value as if it were ciphertext; the following restart cannot decrypt it and returns an empty value.

**Required design:** Keep a plaintext runtime map such as `{ id: { label, value } }`. Build a fresh disk DTO during each persist, encrypting every non-empty runtime value exactly once. Parse and decrypt the disk DTO into a new runtime object during load. Write through a sibling temporary file and rename only after the complete JSON is flushed.

**Interfaces:**
- Preserve `setSecret({ id, value, label })`, `getSecretValue(id)`, `deleteSecret(id)`, and `listSecretRefs()`.
- `listSecretRefs()` must expose metadata only, never plaintext or ciphertext values.
- Legacy plaintext entries may be read once and converted on the next successful write; do not retain mixed runtime representations.

- [ ] Add a test that sets one encrypted secret and asserts immediate `getSecretValue(id) === plaintext`.
- [ ] Add a restart test that loads key A, writes key B, restarts, and reads both plaintext values.
- [ ] Add a write-failure test proving the previous file remains parseable and unchanged.
- [ ] Implement separate runtime and disk models plus atomic temp-file rename.
- [ ] Run `node --test tests/services/secret-service.test.js`; expect all tests to pass.
- [ ] Commit only the service and its tests with `fix(secrets): separate runtime and encrypted storage state`.

**Acceptance:** No API returns ciphertext as a secret value; repeated load/write cycles do not corrupt untouched keys; failed writes preserve the prior store; no secret appears in test output or logs.

**Prohibited shortcuts:** Do not decrypt opportunistically in `getSecretValue`, mutate entries between plaintext and ciphertext forms, or swallow decryption/write errors into empty global state.

## Task 2: Make Settings Commits Durable And Recoverable

**Severity:** P1

**Files:**
- Modify: `src/main/settings.js`
- Modify: `src/main/services/settings-service.js`
- Test: `tests/services/settings-service.test.js`
- Test: add a focused `tests/main/settings-storage.test.js` if storage behavior cannot be isolated cleanly

**Evidence:** `settings-service.save()` assigns `currentSettings` before `saveSettings()` succeeds. A simulated `disk full` throws while `get()` returns the unpersisted value. `settings.json` is overwritten directly, and malformed JSON silently resets all settings.

**Required design:** Compute and validate `nextSettings`, durably write it with temp-file plus rename, then publish it to `currentSettings`, side effects, and the event bus. Maintain one last-known-good backup during replacement. On startup, log primary-file parse/read failure, attempt the backup, and use defaults only when neither source is valid.

**Interfaces:**
- Keep `save(settings)`, `update(updater)`, `preview(partialSettings)`, `reload()`, `loadSettings()`, and `saveSettings(settings)` behavior visible to callers.
- `save()` and `update()` must throw on persistence failure without emitting `settings:changed` or running side effects.
- `preview()` remains non-persistent.

- [ ] Add a service test asserting failed persistence leaves `get()`, side effects, and change events unchanged.
- [ ] Add storage tests for atomic replacement, malformed-primary backup recovery, and both-files-invalid default fallback with an explicit warning/error record.
- [ ] Implement atomic primary/backup rotation and post-commit memory publication.
- [ ] Run `node --test tests/services/settings-service.test.js tests/main/settings-storage.test.js`; expect all tests to pass.
- [ ] Commit with `fix(settings): commit durable state before publication`.

**Acceptance:** Disk and memory never disagree after a failed save; a valid backup survives a malformed primary; fallback is observable; save-time side effects occur once and only after commit.

**Prohibited shortcuts:** Do not catch and ignore write errors, reset a malformed store without logging/recovery, or add a second settings source of truth.

## Task 3: Preserve Conversation Order For Queued Bubble Messages

**Severity:** P1

**Files:**
- Modify: `src/main/ipc.js`
- Modify: `src/main/services/ai-talk-service.js`
- Test: `tests/services/ai-talk-service.test.js`
- Test: the existing focused Bubble Chat IPC test file discovered by `rg "pet-bubble-chat" tests/main tests/services`

**Evidence:** The Bubble Chat send handler persists every user message before deciding whether the active stream owns it. Sending `user-two` during `user-one` streaming stores `user-one, user-two, assistant-one`, while the second provider prompt ends at `assistant-one` instead of its own user message.

**Required design:** Queue raw pending messages without adding them to conversation history. At the moment a queued batch becomes the active request, append that batch's user turn, construct the provider prompt from the now-correct history, and append the assistant turn only after completion. Cancellation/error behavior must have an explicit policy: retain a user turn only if provider execution actually started; never duplicate it on retry.

**Interfaces:**
- Preserve existing Bubble Chat IPC response shape, request IDs, queue state, and `aiTalkService.streamChat()` public contract.
- Introduce one internal ownership point for appending the user turn; IPC and service layers must not both persist it.

- [ ] Add a two-message streaming regression asserting stored order `user1, assistant1, user2, assistant2`.
- [ ] Assert the second provider request ends with `user2` and includes `assistant1` before it.
- [ ] Add cancellation and provider-failure tests proving pending messages are neither lost nor duplicated.
- [ ] Move persistence to conversation-queue turn acquisition and remove the earlier append.
- [ ] Run the focused AI Talk and Bubble Chat IPC tests; expect all tests to pass.
- [ ] Commit with `fix(ai-talk): serialize queued conversation turns`.

**Acceptance:** Stored history and every provider prompt preserve causal order under rapid sends, streaming, cancellation, and failure.

**Prohibited shortcuts:** Do not sort history by timestamp after the fact, hide the defect in prompt construction, or disable queuing.

## Task 4: Coalesce Streaming UI And Log Work

**Severity:** P2

**Dependency:** Task 3 must be integrated first.

**Files:**
- Modify: `src/main/services/ai-talk-service.js`
- Modify: `src/main/ipc.js`
- Modify: `src/main/services/app-log-service.js`
- Test: `tests/services/ai-talk-service.test.js`
- Test: focused app-log and IPC stream tests

**Evidence:** Every provider delta can synchronously append a log record, reread/compact the log, and broadcast state to both chat windows. A local 1000-record benchmark consumed about 249 ms in one log service, before renderer work.

**Required design:** Keep token accumulation in memory. Coalesce renderer updates to a bounded cadence (target 30-60 ms, with an immediate final/error/cancel flush). Emit lifecycle logs for start, bounded progress summaries, completion, cancellation, and error; never log every token. Ensure pending timers are cleared on all terminal paths and service disposal.

- [ ] Add a synthetic 1000-delta test with fake timers asserting bounded IPC broadcasts and bounded log records.
- [ ] Add final-flush tests for normal completion, cancellation, provider error, and empty stream.
- [ ] Implement one coalescer per active request and terminal cleanup.
- [ ] Run focused stream and app-log tests; expect all tests to pass.
- [ ] Commit with `perf(ai-talk): coalesce stream updates and logging`.

**Acceptance:** Final rendered text is byte-for-byte complete; event count is bounded by elapsed time rather than token count; no timer or request state survives a terminal path.

**Prohibited shortcuts:** Do not drop the final delta, use an unbounded queue, or move synchronous disk work onto another per-token callback.

## Task 5: Bind Cursor Protocol Waiters To A Child Generation

**Severity:** P2

**Files:**
- Modify: `src/main/services/system-cursor-service.js`
- Test: `tests/services/system-cursor-service.test.js`

**Evidence:** After a startup ready timeout, the service signals the old helper and immediately retries. Protocol waiters are global, so the old child's later exit rejects the new child's ready waiter.

**Required design:** Give each spawned child a generation/context containing its own waiters, readiness state, output reader, and shutdown promise. A message or exit may settle only its own context. Before spawning a replacement, await graceful/forced shutdown of the previous context.

- [ ] Add the reproduced timeout/retry/late-exit test and assert the replacement reaches ready.
- [ ] Add stale `updated` and stale exit tests proving they cannot affect the current generation.
- [ ] Implement child-scoped contexts and awaited replacement shutdown.
- [ ] Run `node --test tests/services/system-cursor-service.test.js`; expect all tests to pass.
- [ ] Commit with `fix(cursor): isolate helper protocol generations`.

**Acceptance:** Old helper output/exit cannot resolve or reject current operations; stop/dispose clears readers, timers, and waiters exactly once.

## Task 6: Make Plugin Package Mutations Transactional And Bound ZIP Extraction

**Severity:** P2

**Files:**
- Modify: `src/main/services/plugin-install-service.js`
- Test: `tests/services/plugin-install-service.test.js`
- Test: `tests/main/ipc-plugin-install.test.js` only if public error/result shapes change

**Evidence:** Update deletes the installed directory before copying the replacement; uninstall deletes files before settings commit. ZIP extraction is synchronous and has no expanded-byte, entry-count, single-file, compression-ratio, or timeout limit.

**Required design:** Inspect archive metadata before extraction. Reject unsafe paths and links plus configurable hard limits for entry count, total expanded bytes, largest file, and compression ratio. Extract asynchronously into a unique staging directory, validate manifest and content hash there, rename the current install to backup, atomically rename staging into place, persist settings, then remove backup. Roll back filesystem and settings on any failure. Uninstall first stages the directory as a backup, commits settings, then deletes the backup.

- [ ] Add failure-injection tests at copy/extract, validation, rename, settings save, and cleanup boundaries.
- [ ] Add ZIP tests for path traversal, too many entries, oversized total, oversized single file, suspicious compression ratio, timeout/abort, and staging cleanup.
- [ ] Implement archive inspection, asynchronous bounded extraction, staged install/update, and rollback-capable uninstall.
- [ ] Run `node --test tests/services/plugin-install-service.test.js tests/main/ipc-plugin-install.test.js`; expect all tests to pass.
- [ ] Commit with `fix(plugins): transact package mutations and bound extraction`.

**Acceptance:** The old plugin remains usable after every failed update; failed uninstall leaves both files and settings installed; rejected archives never write outside staging; no staging/backup directories leak after success or handled failure.

**Prohibited shortcuts:** Do not delete the active directory before a validated replacement exists, trust compressed size alone, or perform unbounded synchronous extraction on the Electron main thread.

## Task 7: Pin Plugin Network Connections To Validated DNS Results

**Severity:** P2

**Files:**
- Modify: `src/main/services/plugin-network-client.js`
- Modify: the network request call site in `src/main/services/plugin-service.js`
- Test: add or extend the focused plugin network client/service tests

**Evidence:** Safety validation resolves the hostname once, while `fetch` resolves it again. A rebinding resolver can return a public IP during validation and a private/link-local IP during connection.

**Required design:** Replace the fetch path with an HTTPS transport/dispatcher whose connect callback uses one address selected from the validated set. Preserve the original hostname for TLS SNI and certificate verification and preserve the original `Host` header. Revalidate every redirect target and pin each redirect connection separately. Retain request/response byte limits, timeout/cancellation, allowed methods, headers, and manifest host allowlist.

- [ ] Add a deterministic resolver/connector test where validation returns a public IP and a later system lookup would return `127.0.0.1`; assert only the validated IP is dialed.
- [ ] Add TLS hostname, IPv4/IPv6, multi-address, redirect-to-private, timeout, cancellation, and response-limit tests.
- [ ] Implement pinned HTTPS connection handling and route plugin requests through it.
- [ ] Run focused plugin network tests and `npm run test:core`; expect all tests to pass.
- [ ] Commit with `fix(plugins): pin network connections to validated addresses`.

**Acceptance:** The connector receives only a previously validated address; certificate verification uses the requested hostname; redirects cannot escape policy.

**Prohibited shortcuts:** Do not replace the URL hostname with an IP without preserving SNI/certificate checks, disable TLS verification, or keep a second unpinned fetch fallback.

## Task 8: Preserve Newer Control Center Drafts During Async Saves

**Severity:** P2

**Files:**
- Modify: `src/control-center/src/hooks/usePetSettingsPane.ts`
- Modify: `src/control-center/src/hooks/useAiPane.ts`
- Test: existing Control Center hook/component tests and `tests/control-center/control-center-smoke.spec.js` where user-level coverage is needed

**Evidence:** Save completion replaces the whole local state with the server response. Behavior save also reads a stale closure. Edits made while a save is pending can be overwritten by an older response.

**Required design:** Track the fields owned by each save operation and merge only those fields into the latest functional state. Preserve fields changed after dispatch using a request revision or per-field dirty revision. Related controls may be disabled only when the whole logical form is intentionally locked; partial disabling that still permits erased edits is not acceptable.

- [ ] Add deferred-promise tests: start save A, edit field B, resolve A, and assert B remains the new draft.
- [ ] Add overlapping save tests where stale response A resolves after response B and cannot overwrite B.
- [ ] Replace whole-object response assignment and stale-closure reads with functional/revision-aware merging.
- [ ] Run focused tests and `npm run test:control-center`; expect all tests to pass.
- [ ] Commit with `fix(control-center): preserve drafts across async saves`.

**Acceptance:** Save responses update persisted/owned fields and status without reverting newer user input; failure leaves the draft editable and intact.

## Task 9: Make Agent Awareness Event Ingestion Idempotent

**Severity:** P2

**Files:**
- Modify: `examples/plugins/agent-awareness/service/agent-awareness-service.js`
- Test: `tests/examples/agent-awareness-plugin.test.js`

**Evidence:** The service persists an event before notifying the OpenPet bridge. Bridge failure returns HTTP 400, encouraging the sender to retry a request that has already modified history and usage.

**Required design:** Require or derive a stable event ID from sanitized source/session/turn/event metadata. Persist a bounded dedupe index with the event result. A repeated ID returns the original successful ingestion result without incrementing history/usage or repeating notification. Treat bridge delivery as a separate post-commit outcome: committed ingestion returns success even when notification fails, with a sanitized `notification.status` field and observable retry policy.

- [ ] Add a bridge-failure test asserting the HTTP ingestion result is successful and history/usage contain one event.
- [ ] Retry the same event ID and assert no duplicate mutation or notification.
- [ ] Add bounded dedupe reload/expiry tests and distinct-ID tests.
- [ ] Implement stable IDs, persisted bounded dedupe, and separate notification result handling.
- [ ] Run `node --test tests/examples/agent-awareness-plugin.test.js`; expect all tests to pass.
- [ ] Commit with `fix(agent-awareness): deduplicate committed events`.

**Acceptance:** At-least-once senders produce exactly-once local mutations per event ID; notification failure is visible but does not misreport ingestion failure; dedupe storage is bounded.

## Task 10: Delete The Unused IPC Directory Entry

**Severity:** Confirmed delete

**Files:**
- Delete: `src/main/ipc/index.js`
- Test: add a narrow module-entry assertion to the existing main bootstrap/module-resolution tests

**Evidence:** There are no callers. `main.js` resolves `src/main/ipc.js`; the directory index is an unused duplicate entry surface.

- [ ] Add a test or static assertion that the runtime imports the canonical `src/main/ipc.js` module and no source imports `src/main/ipc/index.js` or `src/main/ipc` ambiguously.
- [ ] Delete `src/main/ipc/index.js` and remove any newly discovered references.
- [ ] Run the focused main bootstrap tests and `npm run check:syntax`; expect all tests/checks to pass.
- [ ] Commit with `chore(ipc): remove unused directory entry`.

**Acceptance:** Runtime bootstrap still registers IPC handlers through the canonical file; no package/build reference expects the deleted wrapper.

## Integration Order

1. Merge Task 1 and Task 2 after independent review; they establish persistence semantics.
2. Merge Task 3, then rebase and merge Task 4.
3. Merge Tasks 5, 6, and 7 after security/lifecycle review.
4. Merge Tasks 8 and 9 after user-flow and idempotency review.
5. Merge Task 10 last to keep module-entry cleanup easy to diagnose.
6. Rebase the integration branch onto latest `main`, resolve conflicts at the owning workstream, and run the full matrix below.

## Full Regression Matrix

```bash
npm run check:docs-drift
npm test
npm run test:control-center
npm run check:syntax
git diff --check
```

Additional manual acceptance:

- Start OpenPet, save two provider/API secrets, restart twice, and verify both providers can still use their keys without exposing values in UI/logs.
- Simulate an unwritable settings location and confirm the UI reports failure while the prior settings remain active after restart.
- Send two Bubble Chat messages rapidly during streaming and confirm visual and persisted order.
- On macOS, force one cursor helper startup timeout and confirm the retry activates without reverting or hanging.
- Install, update, and uninstall a plugin; inject a failed settings write and confirm rollback.
- Verify a plugin request to an allowlisted HTTPS host connects to a validated address and rejects private-address redirects.
- Edit AI/pet settings while a save is pending and confirm the later draft remains.
- Submit the same Agent Awareness event twice around a bridge failure and confirm one history/usage mutation.

## Definition Of Done

- Every listed reproducer has a committed regression test that fails on `9f9ad634` and passes on the remediation branch.
- All P1 and P2 tasks are merged; none are converted into undocumented accepted risk.
- No secrets, private paths, raw prompts, or plugin payloads are added to logs or fixtures.
- Full Node, Playwright, syntax, type, native helper, and production build checks pass from a clean integration worktree.
- `docs/TODO.md` marks each remediation item complete only after the corresponding commit and verification evidence exist.
- A final production review finds no unresolved P0/P1 issue in these changed paths.

## Rollback Guidance

- Revert by individual workstream commit, not by reverting the whole remediation series.
- Persistence migrations must remain backward-readable; if rollback is required, do not write a new incompatible disk format.
- Plugin transaction rollback must restore the last validated directory and settings snapshot before reporting failure.
- Streaming performance changes may be reverted independently only if Task 3 ordering semantics remain intact.
- DNS pinning must not be rolled back to unpinned fetch in a release branch; disable plugin network permission instead if an emergency transport issue cannot be repaired safely.
