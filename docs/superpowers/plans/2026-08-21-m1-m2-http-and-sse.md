# M1/M2 HTTP and SSE Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the remaining M1 HTTP/Shell contracts and the M2 migration, SSE, degraded-mode, and preload gates without changing the protected main worktree directly.

**Architecture:** Keep the existing native `node:http` router and thin repository/domain boundaries. T10 owns settings HTTP behavior, T11 owns the event hub and SSE transport, and T13 owns Shell-side bridge handling and orphan PID bookkeeping. T14-T23 then consume those seams rather than duplicating contract data or business logic.

**Tech Stack:** Node.js native test runner, native `node:http`, TypeScript React control center, SQLite driver, Zod contracts, Electron child-process IPC.

## Global Constraints

- Work only in the isolated `codex/m1-http-m2` worktree; main remains protected until review and serial integration.
- Route names, event names, topics, error envelopes, and bridge message shapes come from `@openpet/contracts` or the canonical refactor docs; do not create duplicate tables.
- Preserve loopback-only HTTP, Bearer authentication, 1 MB JSON limit, sidecar degraded mode, and the existing pet IPC path.
- Every task ends with focused tests, relevant project gates, `git diff --check`, and a small commit.

### Task 1: T10 Settings Routes

**Files:** Create `services/backend/routes/settings.js`, `tests/backend/settings-routes.test.js`; modify `services/backend/index.js`.

- [ ] Add failing tests for the five settings routes, optimistic-lock conflict details, invalid paths, empty patch no-op, and `settings.changed` emission.
- [ ] Implement `registerSettingsRoutes({ router, store, emit })` using `store.read`, `store.patch`, `settings.changed` from contracts, and the existing response/error helpers.
- [ ] Register the route module after runtime initialization and pass the injected settings store/event emitter.
- [ ] Run `node --test tests/backend/settings-routes.test.js tests/backend/health-routes.test.js` and commit.

### Task 2: T11 Event Hub and SSE

**Files:** Create `services/backend/events/hub.js`, `services/backend/routes/events.js`, `tests/backend/event-hub.test.js`; modify `services/backend/index.js`.

- [ ] Test event/topic validation, system-topic delivery, FIFO buffering, 1,000-frame backpressure, dropped-event notification, heartbeat, and close behavior with fake time and sinks.
- [ ] Implement `createEventHub({ logger, now })` with the documented constants and contract-derived event/topic validation.
- [ ] Implement the authenticated SSE route with `ctx.hijacked = true`, `text/event-stream` headers, `: ping` heartbeats, `id/event/data` frames, topic filtering, and cleanup on disconnect.
- [ ] Wire the hub into startup and publish `system.jobs-recovered` from T09 recovery output.
- [ ] Run focused backend tests plus `npm run test:backend`, then commit.

### Task 3: T13 Shell Message Handler and Orphan Cleanup

**Files:** Create `apps/desktop/src/sidecar/message-handler.js`, `apps/desktop/src/sidecar/orphan-cleanup.js`, `tests/backend/orphan-cleanup.test.js`, `tests/backend/message-handler.test.js`; modify `apps/desktop/src/sidecar/spawn.js`.

- [ ] Test all nine backend-to-shell message types, dialog cancellation, unknown-message warnings, PID identity checks, malformed/missing ledgers, and cleanup persistence.
- [ ] Implement injected `createMessageHandler({ dialog, petService, logger, send })` and `cleanupOrphans({ file, isAlive, kill, logger })` as CommonJS modules.
- [ ] Invoke orphan cleanup before spawning the sidecar and persist only the current process ledger.
- [ ] Run the focused bridge tests, `npm run check:node`, and commit.

### Task 4: T14 JSON Import and Dual Write

**Files:** Create `services/backend/store/migrate-from-json.js`, `tests/backend/migrate-from-json.test.js`; modify T09 startup wiring.

- [ ] Add real-filesystem tests for backup creation, exact conversation/message counts, rollback deletion, idempotent rerun, and dual-writer parity.
- [ ] Implement the six-step transactional import and `createDualWriter` while retaining legacy JSON through the rollback release window.
- [ ] Run backend migration tests and commit.

### Task 5: T15-T19 Domain Route Seams

**Files:** Create the domain/route modules and focused route tests for `about`, `service`, `catalog`, `pet-packs`, and `actions`; modify startup route registration.

- [ ] For each domain, first assert `router.routes()` against the canonical route table, then implement only the behavior required by its card and existing Shell services.
- [ ] Keep jobs behind T06/T07, dialogs behind T12, and events behind T11; preserve all path and size security constraints.
- [ ] Run each domain test independently before moving to the next domain and commit each domain separately.

### Task 6: T22 SSE/Job Hooks and T23 Gates

**Files:** Create `src/control-center/src/hooks/useSse.ts`, `src/control-center/src/hooks/useJob.ts`, `tests/control-center/sse-job-hooks.test.js`, `tests/backend/degraded.test.js`, `scripts/check-preload-size.mjs`; modify `package.json`.

- [ ] Test contract-topic filtering, 1/2/5/10-second reconnects, 45-second silence, dropped-event full invalidation, job refresh/cancel, and degraded-mode route behavior.
- [ ] Implement hooks using the T20 transport and T21 QueryClient, with invalidation as the only SSE cache action.
- [ ] Add `test:degraded` and `check:preload-size` scripts with `process.exitCode = 1` failure semantics.
- [ ] Run all M1/M2 gates and commit.

### Final Integration

- [ ] Rebase the feature branch onto the latest main.
- [ ] Review each commit against its card and run `npm run check:node`, `npm run test:backend`, `npm run check:api-contract`, `npm test`, `npm run test:tools`, `npm run test:control-center`, and packaging/build checks.
- [ ] Merge commits serially into main only after fresh verification; preserve unrelated untracked user files.
