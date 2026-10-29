# OpenPet Current Migration Development Plan

> **For agentic workers:** Execute this plan task by task with a focused test cycle after each task.

**Goal:** Continue the Shell/Backend migration without treating target API rows, stale IPC paths, or historical snapshots as shipped behavior.

**Architecture:** Electron remains the Shell for windows, native dialogs, PetService, cursor, and lifecycle. The sidecar coordinator under apps/desktop/src/sidecar owns Backend lifecycle and the reverse bridge. services/backend owns HTTP domains, Jobs, SQLite, SSE, and plugin/AI management. packages/contracts is the shared contract source.

**Tech Stack:** Electron 42, Node.js >=22.12, node:http, ESM Backend, CommonJS Shell, node:sqlite, TypeScript/Zod, React/Vite, Node native test runner, Playwright.

## Global Constraints

- PetService is the only Shell authority for pet state, speech, actions, and events.
- Provider keys stay out of renderer state, API responses, logs, evidence archives, and ordinary plugin bridges.
- /api/v1 remains loopback-only and bearer-authenticated, including /health.
- Do not modify cat_anime/ material structure.
- routes/registry.js, packages/contracts, and executable contract checks are one change surface.
- A route is shipped only after its handler, registry entry, document status, focused test, and caller exist.

## Current Truth

The 2026-10-15 continuation is tracked on the review branch `codex/openpet-review-recovery-20261014` before integration into the canonical `main` branch.

    main.js -> createOpenPetRuntime() -> createSidecarRuntimeCoordinator()
      -> spawnSidecar() -> services/backend/index.js

Current source baseline freshly reconciled on 2026-10-29: **86 current IPC channels (41 keep, 37 cutover, 8 blocked), 136 registered REST routes, 149 documented route rows, 21 SSE events, 8 topics, 17 Job kinds, and 6 Job statuses**. The Settings cursor import and scale preview use strict Backend HTTP routes and a typed reverse bridge to Shell-owned picker/effects. T46 image Provider operations have Backend routes and remain compatibility entries pending reachability proof; T49 moved the Service pane to Backend HTTP and retired `service:revoke-mcp-sessions` in `a6dd003c`. Creator routes are registered; route registration does not establish real-provider or account acceptance. AI Talk's Control Center schemas use Valibot, keeping Zod and the Zod-based shared contracts out of the production browser graph. Fresh 2026-10-29 verification: Backend passes, Tools **688/688**, pure Node tests excluding the two browser-test files **3354 passed, 0 failed, 1 skipped**, and typecheck/syntax, contracts build, API/channel reconciliation, docs drift, and Control Center production build pass. Full `test:all` has **26 browser-launch failures** because the pinned Chromium headless shell is absent from the configured cache. No Electron or desktop UI acceptance was performed.

## Task 1: Contract Inventory

Files: services/backend/routes/<domain>.js, services/backend/routes/registry.js, docs/refactor/03-api-contract.md, docs/refactor/15-channel-retirement.md, scripts/check-api-contract.mjs when rules change, tests/backend/, and tests/scripts/.

Call chain: register*Routes() -> router.routes() -> registeredImplementedRoutes() -> check-api-contract.mjs -> document rows.

- [x] Add a failing route assertion: removing the implemented revoke-sessions row now fails `check:api-contract`; no transitional route whitelist remains.
- [x] Verify the handler, registry, caller, API row, retirement status, and focused tests for `POST /service/token/revoke-sessions`.
- [x] Keep target/blocked rows out of the implemented registry; this Task 1 checkpoint recorded route reconciliation at `117/119`.
- [x] Verify: `npm run build:contracts` + `npm run check:api-contract` + `npm run check:channel-retirement` (all pass).

Completed slice: `registerServiceRoutes()` delegates to `createLocalHttpManager().revokeMcpSessions()`, and the Control Center Service pane calls `POST /service/token/revoke-sessions` through `apps/control-center/src/features/service/api.ts`. The MCP sidecar integration test proves active sessions are invalidated without rotating the token; source reachability coverage in `tests/control-center/service-cutover.test.js` proves the old preload/registrar boundary is absent. The API contract owns this route and the retirement ledger records `service:revoke-mcp-sessions` as retired by `a6dd003c`.

## Task 2: Settings Single Writer

Methods: createSettingsStore.patch/read/invalidate; createSettingsMutationCoordinator.runHttp/runTrusted/publish; createSettingsMutationAuthority.patch; createOpenPetRuntime.flushDeferredSettingsPersistence/persistSettingsWhenBackendReady; settings-sidecar-bridge.fetchSnapshot/persistCanonicalSettings/mergeCanonicalSettings/hydrate/handle.

Call chain: Control Center PATCH -> registerSettingsRoutes -> coordinator -> authority -> settingsStore.patch -> awaitHostApply -> Shell host effect -> bridge result -> deferred FIFO replay.

- [x] Test stale ifVersion, trusted paths, concurrent HTTP/trusted writes, host-effect failure, and sidecar-startup deferred writes.
- [x] Keep settingsStore.patch as the only Backend settings disk writer: read current version, CAS, temp-file write, atomic rename, then cache update.
- [x] On host failure return BACKEND_UNAVAILABLE, roll back only values still equal to the failed request, and publish the settled version.
- [x] Keep every write cloned and serialized through one FIFO queue, including writes submitted while ready; retain the failed head after replay failure or a sidecar-loss race and replay it before later entries.
- [x] Run focused settings tests, npm run test:backend, and npm run check:syntax.

Implementation completed in `services/backend/domains/settings.js`, `services/backend/routes/settings.js`, `src/main/settings-sidecar-bridge.js`, `src/main/bootstrap/create-openpet-runtime.js`, and the new `src/main/settings-persistence-queue.js`. The queue is covered by `tests/main/settings-persistence-queue.test.js` and the sidecar restart/replay path by `tests/main/bootstrap-openpet-runtime.test.js`.

## Task 3: Job Cancellation and Recovery

Methods: state-machine.isCancelable/assertCancelable/canRetry/assertRetry; queue.cancel/release/expire/stop; runner.run/cancel/shutdown; recoverJobs; registerJobRoutes; dispatcher.resume.

Call chain: HTTP cancel/retry -> jobs route -> runner/dispatcher -> repository CAS -> process-tree signal -> terminal event -> SSE hub.

- [x] Test queued cancel, running cancel, finalizing rejection (423), duplicate cancel, retry after failed/interrupted, and restart recovery.
- [x] Running cancel requests cancellation, signals the registered process tree, waits for exit/grace timeout, and lets the handler settle terminal state. Creating the cancellation promise is the idempotency window: duplicate requests reuse it immediately. Never write canceled while a child runs. Only a request with no existing cancellation and a `finalizing` phase returns 423; duplicate requests share one in-flight cancellation and emit one `job.canceled` event.
- [x] Recovery is idempotent: running -> interrupted, retry-safe kinds requeued, redacted plugin commands stay interrupted, job-* temp directories removed, one system.jobs-recovered event. Backend startup now injects the event publisher into `initializeBackendRuntime`.
- [x] Run focused Job, plugin, health/recovery, and resilience tests; full backend and contract gates remain required before merge.

## Task 4: Shell Reverse Channel

Methods: parseEnvelope/createEnvelope; shell-client.request/waitFor/receive/dispose; spawnSidecar.launch/spawnSidecar/stopSidecar; message-handler dispatch; runtime-coordinator.start/stop/publish/rejectBackendPending.

Call chain: Backend shell.request() -> fork envelope -> Shell message-handler -> PetService/dialog/settings/catalog/pet-pack -> same-id response.

- [x] Test init-before-ready, correlation, unknown messages, strict ready envelope/body field validation, timeout, version mismatch exit 78, ready timeout, early exit, pending rejection, synchronous response delivery, asynchronous request/shutdown send errors, graceful shutdown, and immediate SIGKILL fallback when the shutdown IPC callback reports an asynchronous send error.
- [x] Route plugin production operations through the typed reverse channel. Each operation has an exact request shape; Shell returns a same-id `plugin.production.result` with `requestId`, `ok`, and exactly one valid payload branch: successful responses require `result`, failures require only a fixed redacted error. HTTP plugin setup, Creator default-flow, secret, storage, and health-policy routes await the Promise.
- [x] Keep waitFor(init) registration before inbox draining in services/backend/index.js.
- [x] Keep fork-handle PID authoritative; reject pending requests on stop/exit and clear timers.
- [x] Retry only SIDECAR_VERSION_MISMATCH; do not retry deterministic path/module/ready-timeout failures.
- [x] Run focused bridge tests and syntax checks. Core and Control Center Playwright verification passed on 2026-10-08 using the isolated `/tmp/openpet-playwright-20261008` browser cache; earlier missing-browser notes are historical.

## Task 5: Backend Domains Before UI

Files: services/backend/domains/<domain>.js, services/backend/routes/<domain>.js, services/backend/index.js, routes/registry.js, then src/control-center/src/api/control-center-api.ts and the owning pane hook. Tests mirror backend and UI paths.

| Capability | Backend owner | Shell owner | Boundary |
| --- | --- | --- | --- |
| settings | domains/settings.js + routes | settings bridge/host effects | Backend canonical write; Shell trusted/native effects |
| actions | domains/actions.js + routes + Jobs | ActionService/actionImportService/PetService/trigger runtime | HTTP/domain is implemented for the Actions vertical slice; legacy IPC remains until retirement proof |
| pet packs | domains/pet-packs.js + routes | native picker/assets | Keep inspect-directory IPC until path handoff is tested |
| catalog | domains/catalog.js + routes | native UI only | Installs use Jobs |
| plugins | domains/plugins/* + routes | dashboard/picker dialogs | no shell expansion; native approval explicit |
| AI/images | domains/ai/* + routes + handlers | secret persistence/pet bridge | keys never reach renderer/plugins |

- [x] Trace the shipped route-to-domain-to-side-effect path in the Settings, Actions, Pet Packs, Catalog, Plugins, and AI/images matrices below; the Catalog install slice records its path at vertical-slice depth. Route registry parity is separately enforced by `check:api-contract`.
- [x] Add focused success, validation, dependency-failure, retryability, event, and terminal-state regressions for the implemented and migrated operations. The 2026-10-08 Plugins accepted-operation matrix completes every declared HTTP branch; Actions selection cleanup and Job terminals are covered by the continuation below.
- [x] Keep route handlers as validation/response adapters and update route/domain status together. The current domain rows identify Shell-owned native boundaries and intentional partial cutovers.
- [x] Add HTTP callers after route behavior; the Actions, Pet Packs, Catalog, Plugins, and AI/images rows identify Control Center callers and demo adapters.

The following matrix is the required implementation record for the remaining
Task 5 work. A domain is not complete because its route is registered: the
listed method, caller, side effect, terminal behavior, and focused tests must
all be present before its status can move from `partial` or `blocked` to
`implemented`.

### 5.1 Settings

| Layer | Concrete owner / method | Responsibility and acceptance boundary |
| --- | --- | --- |
| UI | `src/control-center/src/hooks/usePetSettingsPane.ts:usePetSettingsPane`; `src/control-center/src/features/settings/api.ts:createSettingsApi`, `saveSettingsWithRetry` | Reads the versioned snapshot and sends a `PATCH /settings` patch with `ifVersion`; must surface `409 CONFLICT` and host-effect failure without replacing a newer local draft. |
| HTTP | `services/backend/routes/settings.js:registerSettingsRoutes`; `createSettingsMutationCoordinator.runHttp/runTrusted/publish`; `createSettingsMutationAuthority.patch` | Validates paths and client boundary, serializes HTTP/trusted mutations, writes only through the store, waits for `settings.apply.result`, publishes only settled `settings.changed`. |
| Store | `services/backend/domains/settings.js:createSettingsStore.patch/read/invalidate` | Sole Backend disk writer: CAS version check, canonical envelope write, atomic rename, cache update, and compensating rollback on failed host apply. |
| Shell handoff | `src/main/settings-sidecar-bridge.js:createSettingsSidecarBridge.handle/fetchSnapshot/persistCanonicalSettings/mergeCanonicalSettings/hydrate`; `src/main/bootstrap/create-openpet-runtime.js:awaitHostApply`; `src/main/settings-persistence-queue.js:createSettingsPersistenceQueue.enqueue/flush` | Shell owns native/window effects and deferred cursor/display repairs; every write remains FIFO across ready and restart states, and the failed head is replayed before later entries. |
| Current status | **implemented for the Settings HTTP vertical slice; overall Task 5 remains partial** | The cursor import picker is opened only by Shell, scale preview is bounded and non-persistent, and GET schema exposes the versioned path/limit contract. The compatibility IPC handlers remain until retirement proof; packaged picker and wider manual acceptance stay conditional. |
| Required tests | `tests/backend/settings.test.js`, `tests/backend/settings-routes.test.js`, `tests/backend/settings-commands.test.js`, `tests/control-center/settings-cutover.test.js`, `tests/main/settings-persistence-queue.test.js`, `tests/main/bootstrap-openpet-runtime.test.js`, `tests/main/ipc-cursor-settings.test.js`, `tests/backend/reverse-channel-allowlist.test.js` | Stale version, concurrent HTTP/trusted writes, host failure rollback, ready-time failure, FIFO replay, sidecar restart, settled event ordering, renderer cannot forge trusted paths, native picker cancellation, strict command/result DTOs, scale bounds, and schema response. |

### 5.2 Actions

| Layer | Concrete owner / method | Responsibility and acceptance boundary |
| --- | --- | --- |
| UI | `src/control-center/src/features/actions/api.ts:createActionsHttpApi`, `actionsApi`; `src/control-center/src/hooks/useActionsPane.ts:useActionsPane`; `useJob`/`resolveActionImportJob` | `get/save/preview/submit/accept/reject/updateRule/deleteRule/inspect/reinspect/clearSelection/remove` call the HTTP routes. `importFrames` expects `202 { jobId }`; `useJob` reads `/jobs/:id`, and `resolveActionImportJob` accepts only a validated `succeeded` result or surfaces failed/canceled/interrupted/malformed terminal states. Demo mode keeps the legacy adapter only when no Backend is present in dev. |
| HTTP | `services/backend/routes/actions.js:registerActionRoutes` | The 13 route handlers are response adapters only: `GET /actions`, config/proposal/rule mutations, frame inspect/reinspect/selection clear, `POST /actions/frames/import` Job enqueue, and action deletion. No native picker, sprite generation, file write, PetService call, or trigger-runtime side effect is allowed here. |
| Domain | `services/backend/domains/actions.js:createActionService.list/get/updateConfig/remove/inspectFrames/reinspect/importFrames/runImportFrames/clearSelection/previewProposal/submitProposal/acceptProposal/rejectProposal/updateRule/deleteRule` | Validates HTTP input, creates `actions.import-frames` with `resourceKey=actions:<actionId>`, calls `shell.request({ type: "actions.request", request: { operation, payload } })`, validates correlated `actions.result`, maps structured Shell errors, and publishes `EVENT_ACTIONS_CHANGED` only after a successful mutation. It does not persist `cat_anime/animations.json`; persistence stays in Shell ActionService/actionImportService. |
| Job/bridge | `services/backend/index.js:createRunner` (`actions.import-frames` handler); `apps/desktop/src/sidecar/message-handler.js` (`actions.request` dispatch); `src/main/bootstrap/create-openpet-runtime.js:onActionsRequest`; `src/main/actions-sidecar-bridge.js:createActionsSidecarBridge` | Import runs through `runImportFrames({ signal, report, finalize })`; durable Job input contains only `actionId`, while selection ID/path/label live in the dispatcher's process-local private-input map. Queued cancel/expiry clears the Shell selection; execution clears it on success, failure, or running cancellation. Restart recovery interrupts redacted imports rather than replaying them; a Shell selection left by a sidecar restart expires through its 10-minute TTL. The Shell bridge executes `actionImportService.importActionFrames`, reloads PetService animations, refreshes trigger runtime, and returns the full view. |
| Current status | **implemented for the Actions vertical slice; Task 5 remains partial** | All 13 HTTP routes have a real route → domain → reverse channel → Shell authority path and Control Center caller. The legacy Actions IPC/preload surface remains in source and must not be deleted until the retirement ledger, renderer callers, tests, packaging, and `check:channel-retirement` prove no reachability. |
| Required tests | `tests/backend/routes-actions.test.js`, `tests/backend/reverse-channel-allowlist.test.js`, `tests/backend/bridge-dialog.test.js`, `tests/main/actions-sidecar-bridge.test.js`, `tests/control-center/actions-cutover.test.js`, `tests/main/ipc-actions-diagnostics.test.js` | Verify all 13 route registrations, input validation, Shell outage and malformed result mapping, structured error codes (`NOT_FOUND`/`CONFLICT`/`ACTION_FRAMES_MISSING`/unknown), Job enqueue and every terminal status, selection TTL/cleanup, PetService/trigger refresh, and no premature `working=false` before Job terminal state. |

### 5.3 Pet packs

| Layer | Concrete owner / method | Responsibility and acceptance boundary |
| --- | --- | --- |
| UI | `src/control-center/src/features/pet-packs/api.ts:createPetPackHttpApi`, `resolvePetPackJob`; `src/control-center/src/hooks/useActionsPane` and pet-pack pane callers | Uses HTTP for list/pick/clear/import/export/activate/remove; maps `queued/running/succeeded/failed/canceled/interrupted` and rejects malformed Job results. The HTTP picker request carries only `{ operation: "pick" }`; selection paths remain inside Shell. |
| HTTP/domain | `services/backend/routes/pet-packs.js:registerPetPackRoutes`; `services/backend/domains/pet-packs.js:createPetPackService.list/get/inspect/clearSelection/activate/remove/import/export/runImport/runExport` | Validates safe IDs and paths, enqueues `pet-pack.import`/`pet-pack.export`, and validates the exact reverse-channel operation/result. Import/export must not execute native asset writes in the route process. |
| Sidecar/Shell | `apps/desktop/src/sidecar/message-handler.js` pet-pack dispatch; `src/main/bootstrap/create-openpet-runtime.js:onPetPackRequest`; Shell pet-pack service; `finalize()` in Job runner | Shell remains native picker/assets authority. Bridge failures become `BACKEND_UNAVAILABLE`; invalid Shell result becomes `INTERNAL`/business error. Active-pack change must refresh animations and trigger runtime and publish the activation event. |
| Current status | **partial** | Import/export Job and activate/remove/list paths are wired. The Control Center invokes the native picker through HTTP and imports only by opaque selection ID; the old picker IPC stays until retirement reachability proof. Fresh source tests cover accept/cancel and path redaction. Packaged acceptance of the new HTTP handoff and wider desktop acceptance remain open. |
| Required tests | `tests/backend/routes-pet-packs.test.js`, `tests/backend/reverse-channel-allowlist.test.js`, `tests/main/ipc-plugin-install.test.js`, `tests/control-center/pet-packs-cutover.test.js`, and action cutover tests | Safe-ID/path validation, HTTP picker dispatch and timeout, reverse DTO rejection, Shell picker cancel/accept and path redaction, bridge outage, malformed result, finalizing cancellation, import/export cleanup, activation event payload, active pack side effects, and UI handling of every terminal status. |

### 5.4 Catalog

The Catalog install slice above is the only Task 5 domain currently documented
at full vertical-slice depth. Keep its explicit boundaries: `registerCatalogRoutes`
only validates/enqueues, `createRunner().finalize()` is the non-cancelable Shell
side-effect boundary, `createCatalogService.request()` validates the reverse
response, and `createCatalogSidecarBridge.handle()` owns native installation.

| Required gap | Concrete evidence still missing |
| --- | --- |
| Event semantics | `createCatalogService.refresh()` publishes `catalog.refreshed` after a successful read. Successful `installSelection()`, `addBlocklistEntry()`, and `removeBlocklistEntry()` mutations now publish the same event after the Shell response has a valid `result.catalog`; malformed mutation results fail with `INTERNAL` and do not publish. `prepareInstall()` and `clearSelection()` remain selection bookkeeping and do not publish. The payload is `{ updatedAt, at }`, where `updatedAt` comes from the returned Catalog snapshot and `at` is the publisher timestamp. Control Center `useCatalogPane` subscribes to `useSse(['catalog'])`, de-duplicates by SSE event id, and re-reads `/catalog`; overlapping reads are sequence-guarded so only the newest response commits, while direct mutation/Job snapshots invalidate older reads. Install Job terminal results still own install progress/result rendering, so the event is cache invalidation and not a replacement for Job completion. |
| Failure/retry | `catalog.install` has `MAX_ATTEMPTS_BY_KIND = 2`; `INTERNAL`/5xx dependency failures retry once. Shell request failures map to `BACKEND_UNAVAILABLE` and never publish `catalog.refreshed`; a second failure is terminal with `canRetry: false`. Duplicate `catalog-selection:<selectionId>` jobs are rejected by the SQLite active-resource constraint. `createRunner().finalize()` rejects cancellation with 423 before the native side effect. |
| Tests | `tests/backend/routes-catalog.test.js` covers Shell outage mapping, malformed mutation results, and duplicate resource keys through the real router/SQLite repository. `tests/backend/runner.test.js` covers one retry, exhausted retry budget, terminal event order, and `catalog.refreshed` before `job.succeeded`. `tests/backend/runtime-bindings.test.js` covers finalizing cancellation and the real sidecar bridge; `tests/control-center/catalog-cutover.test.js` covers HTTP/SSE/cache invalidation. |

### 5.5 Plugins

| Layer | Concrete owner / method | Responsibility and acceptance boundary |
| --- | --- | --- |
| UI | `src/control-center/src/features/plugins/api.ts:createPluginHttpApi`; `usePluginsPaneData`; `usePluginsPaneActions` | Uses one HTTP route plus explicit `operation` query branches for install/inspect, service health, setup, Creator default flow, logs, storage, and secrets; falls back to legacy command only when Backend is unavailable before dispatch. Native dashboard/package picker and QQ/WeCom credential paths stay Shell IPC. |
| HTTP | `services/backend/routes/plugins.js:registerPluginRoutes`, `enqueue`, `githubInstallInput`, `requireMethod` | Route handlers validate and dispatch. `plugin.install`, `plugin.install.github`, `plugin.command`, and `plugin.sync-bundled` enter Jobs; operation branches call typed domain methods and must not be counted as extra REST routes. GitHub URLs are normalized by `normalizePluginGithubRepositoryUrl()` before `pluginGithubResourceKey()` derives `github:{owner}/{repo}`; equivalent repository homepages therefore share one active-resource lock. |
| Domain | `services/backend/domains/plugins/index.js:createPluginService.list/get/inspectInstall/commitInstall/install/inspectGithub/commitGithubInstall/installGithub/remove/start/stop/status/setEnabled/setNativeExecutionApproved/runSetup/serviceStart/serviceStop/serviceHealth/saveServiceHealthPolicy/getSecretState/saveSecret/clearSecret/appendLog/getLogs/clearLogs/syncBundled/productionRequest` | Installation/lifecycle/log persistence and redacted result mapping live here. Production operations use the typed reverse channel; secrets remain Shell-owned and never appear in renderer/plugin responses. |
| Job/bridge | `services/backend/jobs/handlers/{plugin-install,plugin-install-github,plugin-command,plugin-sync-bundled}.js`; `services/backend/jobs/dispatcher.js:createJobDispatcher`; `services/backend/jobs/runner.js:createRunner`; `services/backend/jobs/handlers/common.js:resolvePrivatePluginInput`; `services/backend/bridge/shell-client.js`; `apps/desktop/src/sidecar/message-handler.js` | Job handlers define progress, cancellation, `finalize()` boundaries, resource keys, and recovery behavior. Local paths, selection IDs, and canonical GitHub URLs are passed as `privateInput` into the same-process dispatcher/runner Map; `jobs.input_json`, HTTP Job responses, logs, and evidence retain only the redacted summary. `takePrivateInput()` consumes the value before execution and `forgetPrivateInput()` clears it on success, failure, cancellation, duplicate-lock rejection, or runner cleanup. Reverse responses require correlation, exact operation, and one mutually exclusive success/error branch. |
| Current status | **partial** | Core install/command/sync Jobs and typed production operations are wired. Dashboard/picker and QQ/WeCom secret IPC remain intentional native boundaries. Install, enable, start, logs, and command routes reject unsupported `operation` queries before dispatch; all Plugin routes reject duplicate query keys before dispatch; Telegram secret state/save/clear accept only the owning `openpet.im-gateway` ID. Validation accepts only `{ path }` or `{ repositoryUrl }`; install, native approval, secret, storage, and health-policy DTOs reject unsupported fields before side effects. The declared HTTP operation branches now have a complete success and missing-domain dependency matrix (`24/24` route tests); native and packaged acceptance remain open. |
| Required tests | `tests/backend/routes-plugins.test.js`, `tests/backend/plugins-domain.test.js`, `tests/backend/plugin-handlers.test.js`, `tests/backend/recovery.test.js`, `tests/backend/state-machine.test.js`, `tests/control-center/plugin-command-result.test.js`, `tests/control-center/plugin-log-format.test.js` | Manifest/GitHub validation, duplicate resource serialization, real route → dispatcher → queue → runner execution with local path and canonical URL recovery, private input absence/cleanup, redacted input persistence, missing-input `409 CONFLICT` with `canRetry: false`, restart interruption without replay, native approval, secret redaction, service health timeout, dashboard IPC boundary, malformed reverse result, and pre-dispatch fallback without duplicate command execution. |

Plugin install input has a deliberate two-tier representation. `persistedInput(kind,
input)` in `services/backend/store/repositories/jobs.js` stores only `{ redacted: true,
summary }` for every `plugin.*` Job. `registerPluginRoutes()` therefore passes the
original `{ path, pluginId? }`, `{ selectionId, update }`, or canonical
`{ repositoryUrl }` as `privateInput`; `createJobDispatcher()` puts that value in a
process-local Map and strips it before `queue.enqueue()`. `createRunner()` consumes it
through `takePrivateInput()` and gives it to `resolvePrivatePluginInput()` in both
install handlers. This is transient process memory, not a general HTTP
`Idempotency-Key` or result-replay facility. A retry in the same process may reuse the
value; a queued/running redacted install discovered after restart is marked
`interrupted` by `recoverJobs()` and is never automatically replayed. `canRetry()` and
the repository's public `canRetry` projection must both reject redacted
`plugin.command`, `plugin.install`, and `plugin.install.github` Jobs.

### 5.6 AI / images

| Layer | Concrete owner / method | Responsibility and acceptance boundary |
| --- | --- | --- |
| UI | `src/control-center/src/hooks/useAiPane.ts:useAiPane`; `src/control-center/src/features/ai/talk-api.ts:createAiTalkHttpApi`; `src/control-center/src/api/control-center-api.ts` AI methods | Provider config, persona, memories, chat, behavior, trace, Hatch, and image configuration/key/health/model calls use Backend HTTP in runtime mode. Standalone development uses the demo adapter; conversation list/get/delete and Hatch capability results retain demo-specific response shapes. Chat uses POST SSE and validates terminal payloads. Hatch configuration/key/capability/run status and Behavior replay/export/clear now use the Backend AI facade. |
| HTTP/secrets | `services/backend/routes/ai.js:registerAiSecretRoutes`, `registerAiRoutes`, `registerAiTalkRoutes` | Registered: provider key PUT/DELETE, image configuration GET/PATCH, image key PUT/DELETE, image generation POST, persona GET/PUT/draft, memory list/create/delete/clear, config GET/PATCH, provider test/models, chat SSE, conversation list/get/delete, talk start/stop, behavior config/rule CRUD/dry-run/replay/diagnostics/clear, trace get/export, Hatch agents/config/key/capability/run-status/start/budget, image health/models. |
| Domain/Job | `services/backend/domains/ai/talk.js:createAiTalkService`; `services/backend/domains/ai/image-generation.js:createAiService.getConfig/saveConfig/saveProviderApiKey/clearProviderApiKey/prepareGeneratedImage/commitGeneratedImage`; `services/backend/jobs/handlers/image-generate.js:run`; `services/backend/index.js:createRunner` | AI Talk operations use a typed `ai.talk.request/result` Shell reverse channel. Image configuration is saved through the versioned Backend settings store, while API keys remain in the Shell secret store and HTTP waits for persistence before returning a masked result. Image generation uses the `image.generate` Job. Hatch start validates and reconstructs a bounded input object before enqueue; `hatch.run` uses a typed `hatch.stop` reverse request so runner cancellation aborts the Shell provider request before the Job can succeed. |
| Current status | **partial** | The HTTP route/caller vertical slice is present, including image configuration/key, conversation list/read/delete, Hatch config/key/capability/run status, and Behavior replay/diagnostics/clear workflows. Historical conversation selection is held separately from the PetService main snapshot. Remaining AI-specific compatibility IPC is image-generation configuration and Hatch capability/run status; native Pet Chat window IPC remains a separate UI boundary. Migrated business handlers are removed from the Control Center preload and registrar. Hatch runner cancellation now propagates through `hatch.stop` to the Shell service and provider signal. Route/service failure evidence and real provider/account acceptance remain open. |
| Required tests | `tests/backend/routes-ai-talk.test.js`, `tests/backend/reverse-channel-allowlist.test.js`, `tests/backend/runtime-bindings.test.js`, `tests/control-center/ai-talk-cutover.test.js` | Cover strict input validation, SSE framing/parser errors and abort cleanup, provider failure/timeout, secret redaction, Hatch duplicate lock and terminal states, and demo/runtime facade parity. |

### Task 5 continuation evidence (2026-10-06)

- Fixed `POST /plugins/validate` GitHub inspection to await the asynchronous domain result before `sendSuccess()` serializes it. A router-level regression test first reproduced the old `{}` response from a Promise and now asserts the complete review payload. `tests/backend/routes-plugins.test.js` passes 11/11.
- Removed three Settings placeholder handlers from the runtime route list and implemented registry: `/settings/cursor/import`, `/settings/preview-scale`, and `/settings/schema` have no Backend caller/domain owner. The API table labels them unregistered goals; settings route tests assert only `GET /settings` and `PATCH /settings` register.
- Rebuilt contracts and reconciled the API: **104/110** registered/documented rows at that historical checkpoint. Updated live count owners and regression assertions; historical review records retain their earlier snapshots.
- Settings and plugin focused suites plus live docs regression pass 43/43; `check:channel-retirement` reports `dead=0`; `check:docs-drift` passes. This was an earlier checkpoint before the AI Talk HTTP expansion; Task 5 remains partial because Pet Packs retains the Shell native picker/path boundary, Plugins retains dashboard/package picker and selected credential IPC, and AI still retains configuration and behavior compatibility channels. Real provider/account and packaged native picker acceptance still require their external runtime/evidence.

### Task 5 continuation evidence (2026-10-06, AI Talk persona/memory)

- Added six registered Backend routes for persona read/save/draft and memory list/delete/clear-current-Pet-Pack. The Backend domain validates persona DTO fields and the correlated `ai.talk.result` operation; Shell retains `AiTalkService` and existing view adapter ownership.
- Added strict `ai.talk.request/result` reverse-channel validation. Persona draft generation is bounded to a 2,000-character instruction and a 60-second HTTP timeout; no credential fields are allowed.
- Control Center persona and memory callers use Backend HTTP in runtime mode and retain the demo API only for standalone development.
- Focused Backend and Control Center tests cover registration, validation, malformed/mismatched responses, dependency failure cause, structured error mapping, route paths, and timeout settings.
- At that point the API reconciliation was 79/105; this is a historical checkpoint. The current live reconciliation is recorded below.

### Task 5 continuation evidence (2026-10-06, AI Talk HTTP expansion)

- Added Backend operations for config/provider discovery, SSE chat, conversations, behavior/rules, trace, Hatch, and image provider health/model discovery. The last recorded contract output at that checkpoint was 104/110; rerun it after later edits.
- Control Center runtime callers use the Backend facade for AI config, chat, behavior, trace, Hatch, and image checks. The SSE reader handles chunked UTF-8, rejects malformed delta/terminal payloads, and cancels the reader on abort or parse failure. The demo facade lists/deletes conversations and returns Hatch config plus capability in the runtime response shape.
- Focused Control Center AI API tests and `npx tsc --noEmit` passed during this continuation. Broad Backend, tools, core, resilience, and Playwright gates have not been rerun.
- Added `hatch.stop` to the typed reverse channel. The Job runner now forwards its abort signal to the Shell Hatch service, and structured provider requests honor it; the Hatch service records a canceled run state and the runner cannot report success after cancellation.
- Remaining AI work: connect conversation operations to an owning UI workflow; test route validation, failure mapping, trace redaction, and all Job states; prove migrated Hatch/Behavior IPC channels have no production Control Center reachability before retiring handlers and preload entries.

### Task 5 continuation evidence (2026-10-06, AI reverse contract closure)

- Reproduced a contract/runtime gap: the shared `ai.talk.request` contract accepted credential-bearing and operation-unknown payload fields that the Shell dispatcher rejects. Added operation-specific required/allowed-field checks, credential rejection, provider capability checks, message bounds, and identifier/runId validation to the shared contract.
- Added a regression proving `config.apiKeyRef`, unknown per-operation fields, unsupported provider ids, malformed trace identifiers, and success responses without `result` fail the contract.
- Tightened `createAiTalkService()` response handling to reject extra top-level fields and invalid success/failure branch combinations before returning a result or mapping a structured error. A regression first demonstrated acceptance of an extra `leaked` field and now rejects it.
- Verified at that checkpoint: `npm run build:contracts`, `npm run check:api-contract` (140 IPC; 104/110 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses), `npx tsc --noEmit`, `git diff --check`, and 35 focused reverse-channel/AI tests passed.
- Remaining AI work is still the route/service failure matrix, all Hatch terminal/resource-lock cases, image health/model dependency failures, conversation UI ownership, and retirement proof for compatibility IPC. Trace-export redaction now has a fresh Store, service, orchestrator, and demo regression; this contract closure does not mark the AI domain complete.
- Fixed a demo-only API facade mismatch found during parity review: clearing `ai.default` had no demo method and would reject, while vision-key clearing was incorrectly selected for both providers. The demo adapter now clears only the selected provider; focused facade/demo tests cover that chat clearing leaves the vision key configured. Runtime mode continues using Backend HTTP.
- Latest verification after the demo facade fix: `npm run check:syntax` passes (Node syntax, TypeScript, native cursor helper, Control Center build); focused Backend/bridge/AI/demo tests pass 87/87. Playwright UI execution remains unverified because the configured Chromium headless shell is absent at `/Users/mango/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`.
- Continued the AI reverse-contract audit and reproduced three Shell boundary gaps: empty or non-string `trace.get` identifiers, non-string `memory.delete` identifiers, and non-string `conversation.list` filters reached `onAiTalkRequest`. Added the missing required/type checks to both the shared contract and Shell validator. Contract assertions and sidecar regressions verify malformed requests are rejected before dispatch. Fresh verification: `npm run build:contracts` and the focused bridge, reverse-channel, AI route, and AiTalkService suites pass 97/97, with the final bridge slice at 31/31.
- Closed two HTTP presentation gaps in the same AI slice. `GET /ai/traces` now rejects a missing, empty, non-string, or overlong `conversationId` before invoking the domain, and `GET /ai/hatch/budget` rejects a missing or malformed `runId` before invoking the domain. `createAiTalkService.getTrace()` now applies the same non-empty ID guard for direct callers. Regressions first observed the old 200/dispatch behavior, then passed with the route suite at 13/13 after the fix.

### Task 5 continuation evidence (2026-10-06, AI boundary hardening)

- Reproduced three HTTP boundary leaks: behavior rule update/delete accepted whitespace IDs, behavior dry-run coerced a numeric `reply` into a string, and the domain sent those malformed values to the reverse channel. Routes and `createAiTalkService` now reject empty rule IDs and non-string dry-run replies before Shell dispatch.
- Reproduced a reverse-channel Hatch gap: the shared contract and Shell validator accepted object `mode` values and overlong `stage` values even though the HTTP route bounded them. Added bounded Hatch input validation for mode, user intent, stage, scope, workflow evidence, and provider evidence across the shared contract, Shell dispatcher, and Backend AI domain; the domain no longer coerces malformed values with `String()`.
- Aligned Shell-side nested AI validation with the shared contract for config scalar types, memory config fields, persona fields, and memory DTO bounds. Invalid config and memory payloads now fail closed before reaching Shell service methods.
- Fresh verification: `node --test tests/backend/bridge-dialog.test.js tests/backend/reverse-channel-allowlist.test.js tests/backend/routes-ai-talk.test.js` passed **47/47**; `npm run test:backend` passed **318/318**; `npm run check:syntax`, `npm run build:contracts`, `npm run check:api-contract` (**108/112**), `npm run check:channel-retirement` (**140 current, 70 cutover, 29 blocked, 0 dead**), `npm run check:docs-drift`, `node --test tests/docs/live-docs-development-plan.test.js` (**23/23**), and `git diff --check` passed. The existing Vite bundle-size advisory remains non-failing.
- `npm run test:core` was attempted and exited nonzero because the local Playwright executable is missing at `/Users/mango/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`; the affected Creator Studio browser tests therefore remain unverified in this environment.

### Task 5 continuation evidence (2026-10-06, conversation ownership and SSE DTO)

- The Control Center keeps the selected conversation ID and messages in AI pane state without overwriting the PetService main conversation snapshot. The conversation selector remains populated for historical sessions, and delete is enabled only for non-main sessions.
- The Backend chat route now accepts the Shell behavior result branch while retaining a strict top-level allowlist. The Control Center SSE parser applies the same terminal DTO boundary and rejects unexpected fields or malformed terminal payloads.
- Previous checkpoint evidence: `node --test tests/backend/routes-ai-talk.test.js tests/control-center/ai-talk-cutover.test.js` passed 17/17; `npx tsc --noEmit` passed; `npm run test:backend` passed 303/303; the prior `check:channel-retirement` report was 140 current, 66 cutover, 33 blocked, and 0 dead; `npm run check:docs-drift` and `node --test tests/docs/live-docs-development-plan.test.js` passed 54/54 combined. Playwright remains unverified because the configured Chromium headless shell is absent.

### Task 5 continuation evidence (2026-10-06, image provider configuration)

- Added HTTP reads/writes for image Provider configuration and API keys. Control Center runtime callers now use `aiTalkApi`; standalone Vite mode delegates to the existing demo facade.
- Configuration requests reject owner-controlled fields and enforce provider, length, timeout, and concurrency bounds. Key responses expose only the secret reference, configured state, and masked preview. Backend awaits Shell key persistence and maps failures to retryable `BACKEND_UNAVAILABLE`.
- The four image configuration/key IPC entries move from `blocked:T46` to `cutover:ai`; health and model discovery were already cut over. Keep the IPC compatibility handlers until retirement proof justifies deleting them.
- Focused verification and current contract/retirement counts are recorded after the implementation below; Task 5 remains partial because Hatch configuration, behavior compatibility operations, and other domain gaps remain.

### Task 5 continuation evidence (2026-10-06, image persistence compatibility)

- A fresh baseline reproduced seven failures in `tests/services/image-generation-model-service.test.js`: changing the shared image Provider methods to `async` broke synchronous Shell callers and their validation contracts.
- Restored the default synchronous service API and added opt-in `awaitPersistence` for the Backend instance. Backend writes serialize per settings/key resource, await each request's own persistence result, retain failure causes, and expose Shell persistence faults as retryable `BACKEND_UNAVAILABLE`; Provider validation remains `VALIDATION_FAILED`.
- Added a concurrent settings-write regression: the second partial update waits behind a failed first write, applies against the latest version, and does not hide the first request failure.
- Fresh verification: focused image service, route, and Job tests passed 76/76; `test:backend` passed 311/311; `test:tools` passed 666/666; `test:resilience` passed 3/3; `check:syntax`, `build:contracts`, `check:api-contract` (108/112), `check:channel-retirement` (140 current, 70 cutover, 29 blocked, 0 dead), `check:docs-drift`, the 23-test live-docs suite, and `git diff --check` passed. `test:core` and `test:core:all` fail in this environment because their Playwright browser cases cannot launch the missing Chromium headless shell at the configured cache path.

### Task 5 continuation evidence (2026-10-06, Hatch cancellation observability)

- Added a focused runtime regression for a Shell `hatch.stop` failure. The Job still settles as `canceled`, while Backend stderr carries a structured `Hatch Job stop request failed` warning with only `jobId`, `runId`, and the normalized error code; the provider error text is not logged.
- The fix keeps the stop request asynchronous so cancellation does not wait for an optional diagnostic round trip. The focused runtime binding suite passes 6/6, including the existing duplicate-lock and cannot-finish-succeeded coverage.

### Task 5 continuation evidence (2026-10-06, Trace export redaction)

- Reproduced a real export leak with free-text sentinels in behavior `reason`, `providerReason`, `inputSummary`, and `blockedReason`; the old Store export copied those fields even though it removed replay payloads.
- The Store, Behavior Orchestrator, and standalone demo export paths now emit only bounded structural decision metadata: id, normalized timestamp, matched/type/displayMode, cooldown/fallback, and `replayRedacted`. Rule ids, action ids, intents, reasons, input summaries, blocked reasons, provider text, and replay data are omitted.
- Fresh regressions cover Store input, `AiTalkService` forwarding, direct behavior diagnostics, and the demo facade. The focused AI Store/service/orchestrator suites pass **90/90**.
- Fresh broader gates after the change: `npm run test:backend` **312/312**, `npm run test:resilience` **3/3**, the focused AI/demo Control Center suites **57/57**, Store/service/orchestrator/demo suites **138/138**, `npm run check:syntax`, `npm run build:contracts`, `npm run check:api-contract` (**108/112**), `npm run check:channel-retirement` (**140 current, 70 cutover, 29 blocked, 0 dead**), `npm run check:docs-drift`, the live plan docs suite (**23/23**), and `git diff --check` all pass. Vite reports the existing bundle-size advisory (>500 kB); the build succeeds.
- This closes the trace-export redaction proof only. AI route/service failure mapping, Hatch terminal/resource-lock coverage, image health/model dependency failures, conversation UI ownership, legacy IPC retirement proof, and real provider/account acceptance remain open.

### Task 5 continuation evidence (2026-10-06, AI reverse response DTO closure)

- Added one shared operation-to-result schema mapping in packages/contracts/src/bridge.ts, including strict success/failure branch rules, operation-specific DTO fields, bounded arrays/exports, and recursive rejection of credential-shaped result fields while allowing non-secret references and masked previews.
- Reused the same parser in services/backend/domains/ai/talk.js and services/backend/bridge/shell-client.js; mismatched operation DTOs now fail as INTERNAL before Backend callers receive a result.
- The CommonJS Sidecar uses cached dynamic import("@openpet/contracts") and validates every successful onAiTalkRequest() return before sending ai.talk.result. An invalid success value is converted to { ok: false, error: { code: "INTERNAL", message: "Shell AI talk response is invalid" } }; the original value is never forwarded.
- The result map covers config/provider, persona/memory, chat/conversation/talk cancellation, behavior/rules/replay, trace, Hatch, and image health/model operations. Failure responses remain exactly { code, message } with normalized error codes and sanitized messages.
- Fresh verification for this slice: `node --test tests/backend/bridge-dialog.test.js tests/backend/reverse-channel-allowlist.test.js tests/backend/routes-ai-talk.test.js` passed **49/49**, alongside `npm run build:contracts`, `npm run check:syntax`, and `git diff --check`. The focused regression covers the shared contract, Backend domain/client, Shell allowlist, and representative Sidecar DTO fixtures. Full Core/Playwright acceptance remains subject to the documented Chromium availability limitation.

### Task 5 continuation evidence (2026-10-06, AI IPC reachability proof)

- Added `tests/control-center/ai-ipc-reachability.test.js` to prove the migrated AI compatibility channels remain intentionally reachable from the shared channel table, `control-center-preload.js`, `register-ai-ipc.js`, and the Electron packaging file list. The same regression scans `useAiPane` and the AI HTTP facade to prove Control Center business calls no longer use those legacy methods; only native pet chat window lifecycle calls remain on `controlCenterAPI`.
- The proof also records the existing IPC suites as compatibility coverage rather than production Control Center callers. This is evidence for the current `cutover:ai` ledger state; it does not authorize retiring the handlers or preload entries while the compatibility surface and packaged Shell remain reachable.
- Fresh verification: `node --test tests/control-center/ai-ipc-reachability.test.js` passed 3/3; the combined AI/demo/reachability suite passed 60/60; `npm run build:contracts`, `npm run check:api-contract` (117/119), `npm run check:channel-retirement` (140 current, 79 cutover, 20 blocked, 0 dead), `npm run check:docs-drift`, `npm run check:syntax`, and `git diff --check` all pass.

### Task 5 continuation evidence (2026-10-06, focused AI acceptance matrix)

- The focused bridge, reverse-channel, AI route/image, Hatch runtime, AI IPC reachability, and Control Center AI suites now pass **75/75**. The new boundary regressions cover missing `memory.enabled`, non-string memory pet-pack ids, and non-finite memory confidence before dispatch at the shared contract and Shell parser.
- Fresh `npm run test:backend` passes **320/320**. `npm run build:contracts`, `npm run check:syntax`, `npm run check:api-contract` (140 IPC; 117/119 REST rows; 21 SSE events; 8 topics; 17 Job kinds; 6 statuses), `npm run check:channel-retirement` (140 current; 79 cutover; 20 blocked; 0 dead), `npm run check:docs-drift`, the 23-test live-docs suite, and `git diff --check` pass.
- This closes the focused local route/service/provider failure evidence for the currently migrated AI operations. It does not close real provider/account acceptance, packaged/manual desktop acceptance, or retirement of compatibility IPC that remains intentionally reachable.

### Task 5 continuation evidence (2026-10-06, Hatch Job terminal matrix and AI dependency mapping)

- Added a Sidecar-to-HTTP runtime regression that exercises `hatch.run` through enqueue, Shell reverse request, Job runner, and `/jobs/:id`. It verifies successful completion, typed permanent provider failure, cancellation through the existing `hatch.stop` path, duplicate active `runId` lock rejection, and reuse of the run lock after a failed terminal Job.
- The regression waits through retryable `failed` intermediate states and asserts the final Job attempt/result. This preserves the runner's documented retry lifecycle instead of mistaking the first retry transition for a terminal outcome.
- `registerAiTalkRoutes()` now turns an absent operation method in a partially assembled AI service into a typed retryable `BACKEND_UNAVAILABLE` response. A route regression proves the failure returns 503 rather than exposing a `TypeError` as an unclassified 500.
- Fresh verification for this continuation: focused AI routes/images and runtime bindings passed **35/35**; the targeted runtime binding suite passed **7/7**; `npm run test:backend` passed **323/323**; `npm run build:contracts`, `npm run check:syntax`, `npm run check:api-contract` (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**), `npm run check:channel-retirement` (**140 current; 79 cutover; 20 blocked; 0 dead**), `npm run check:docs-drift`, the live plan docs suite (**23/23**), and `git diff --check` passed. Vite retained its non-failing >500 kB chunk advisory.
- Hatch runner coverage now has local runtime evidence for succeeded, failed, and canceled terminal paths plus retry and resource-lock release. Restart interruption still relies on the generic Job recovery suite; real Provider/account behavior and packaged/manual acceptance remain external.

### Verified vertical slice: Catalog install

This is a completed slice inside Task 5, not completion of the whole task. The
route intentionally does not perform the native install inline:

```text
useCatalogPane.onInstallSelection()
  -> catalogApi.install(selectionId)
  -> POST /catalog/install
  -> registerCatalogRoutes() validates selectionId and inserts catalog.install
  -> createRunner() handler
  -> runtime.catalog.installSelection()
  -> createCatalogService.request({ operation: "installSelection" })
  -> Shell catalog.request reverse channel
  -> createOpenPetRuntime.onCatalogRequest()
  -> createCatalogSidecarBridge.handle()
  -> Shell catalogService.installSelection()
  -> reloadAndSendAnimations()/refreshTriggerRuleRuntime() when an active pet pack changes
  -> Job result consumed by resolveCatalogInstallJob()
```

Concrete owners and evidence:

- `services/backend/routes/catalog.js:registerCatalogRoutes` owns request
  validation, `202` response shape, and the `resourceKey` used to serialize
  selection installs.
- `services/backend/index.js:createRunner` owns the `catalog.install` handler;
  `finalize()` makes the Shell side effect the non-cancelable boundary.
- `services/backend/domains/catalog.js:createCatalogService` owns response
  validation and converts bridge failures to `BACKEND_UNAVAILABLE`.
- `apps/desktop/src/sidecar/message-handler.js:createMessageHandler` owns the
  allowlisted `catalog.request` dispatch and redacted failure response.
- `src/main/bootstrap/create-openpet-runtime.js:onCatalogRequest` and
  `src/main/catalog-sidecar-bridge.js:createCatalogSidecarBridge` own the Shell
  handoff. The bridge keeps native selection/install state in the Shell and
  refreshes animations and trigger diagnostics only when the active pet pack
  actually changes.
- `src/control-center/src/features/catalog/api.ts:createCatalogHttpApi` and
  `src/control-center/src/hooks/useCatalogPane` own the HTTP caller and Job
  polling/result mapping; the old Catalog IPC path is retired.
- `tests/backend/routes-catalog.test.js`,
  `tests/backend/runtime-bindings.test.js`, and
  `tests/control-center/catalog-cutover.test.js` cover route insertion, the
  runner-to-Shell side effect, cancellation at the finalizing boundary, UI HTTP
  calls, Job result mapping, and retired IPC registrations.

Remaining work before this slice can be generalized to every domain is the same
route/domain/side-effect trace and failure matrix for settings, actions, pet
packs, plugins, and AI. Catalog's install retry, outage, resource locking,
finalizing cancellation, event ordering, and Shell bridge boundaries now have
focused executable evidence; that does not close Task 5 for the other domains.

### Task 5 continuation evidence (2026-10-06, Pet Pack validation boundary)

- Reproduced two Pet Pack boundary leaks. `POST /pet-packs/validate`
  treated an unknown `operation` as a path inspection request when a `path` was also
  present, and a successful `pet-packs.result` without a `result` field was
  returned to Backend callers as `undefined`.
- The HTTP route now accepts only the `{ path }` inspection shape or the exact
  `{ operation: "clear-selection", selectionId }` shape. Unknown operations,
  mixed shapes, and extra fields fail with `VALIDATION_FAILED` before Shell
  dispatch.
- The Pet Pack contract, Shell client, and Backend domain now require a
  successful reverse result, reject unexpected response fields, and enforce
  mutually exclusive success/error branches. Structured Shell failures allow
  only `{ code, message }` and retain their contract error code and message.
- Fresh verification: the focused Pet Pack, reverse-channel, and bridge slice
  passes **39/39** after `npm run build:contracts`; `npm run test:backend`
  passes **327/327**; `npm run check:syntax`, `npm run check:api-contract`
  (`140 IPC`, `117/119 REST`), `npm run check:channel-retirement`
  (`dead=0`), `npm run check:docs-drift`, and `git diff --check` pass.
- This closes the local Pet Pack validation/reverse-result evidence only.
  Native picker behavior, packaged desktop acceptance, legacy IPC retirement,
  and real provider/release evidence remain external or partial boundaries.

### Task 5 continuation evidence (2026-10-06, plugin host-secret route boundary)

- Reproduced a plugin secret boundary leak: unknown `operation` values on
  `/plugins/:id/config` fell through to ordinary `setConfig`, so attempted
  `secret-save-wecom`, `secret-clear-wecom`, `secret-qq-save`, and
  `secret-qq-clear` HTTP calls returned `200` instead of respecting the
  documented host-secret IPC boundary.
- The GET and PUT config routes now allow only their registered operations and
  return `VALIDATION_FAILED` for unknown operations without invoking
  `setConfig`. The HTTP transport exposes only Telegram `state/save/clear`;
  the Control Center runtime adapter routes QQ and WeCom credential operations
  through the existing preload IPC. Demo mode keeps its in-memory adapter.
- Fresh evidence: plugin route/domain/handler tests pass **36/36**; the
  Control Center backend/SSE focused suite passes **21/21**, including positive
  Telegram HTTP calls and negative QQ/WeCom host IPC assertions; `npx tsc
  --noEmit` passes. The broader migration remains partial because native
  picker behavior, compatibility IPC retirement, real provider/account
  acceptance, and packaged/manual release evidence are still open.

### Task 5 continuation evidence (2026-10-06, plugin operation validation)

- Reproduced an unsupported-operation fallback on `POST /plugins/install`:
  `?operation=unsupported` with a valid path returned `202` and reached Job
  dispatch instead of rejecting the unknown operation. The same fallthrough
  existed on plugin enable, start, logs, and command routes.
- The five routes now validate `operation` against their accepted values before
  reading the request body or dispatching a domain method/Job. Unsupported values
  return `VALIDATION_FAILED`; requests without `operation` retain their existing
  default behavior, and registered operation branches remain available.
- Fresh evidence: the focused Plugins/backend/SSE regression slice passes
  **75/75**; `npm run test:backend` passes **329/329**; contract build and API
  contract checks pass (**140 IPC; 117/119 REST**); channel retirement reports
  `dead=0`; syntax/typecheck/native cursor build/Control Center build pass;
  `check:docs-drift`, the live development-plan docs suite (**23/23**), and
  `git diff --check` pass. The Control Center build retains its existing
  non-failing large-chunk advisory.
- This closes unknown-operation fallback evidence for those five routes only.
  Plugins and Task 5 remain partial: accepted-operation behavior still needs a
  complete matrix, and native picker, compatibility retirement, real provider,
  and packaged/manual acceptance boundaries remain open.

### Task 5 continuation evidence (2026-10-06, plugin request DTO validation)

- Reproduced three permissive DTO paths: `/plugins/validate` selected GitHub
  inspection when both `path` and `repositoryUrl` were present; local install
  ignored mixed/extra fields and treated a non-boolean `update` value as false;
  GitHub install ignored extra fields and still enqueued a Job.
- Validation now accepts exactly `{ path }` or `{ repositoryUrl }`. Local
  install accepts exactly `{ path }` or `{ selectionId, update? }`, preserving
  the established `update: false` default; the GitHub install route accepts
  exactly `{ repositoryUrl }`. Invalid shapes fail with `VALIDATION_FAILED`
  before inspection or Job enqueue.
- Fresh evidence: `tests/backend/routes-plugins.test.js` passes **18/18**;
  `npm run test:backend` passes **334/334**; `npm run test:resilience` passes
  **3/3**; `npm run build:contracts`, `npm run check:api-contract`
  (**140 IPC; 117/119 REST**), `npm run check:channel-retirement` (`dead=0`),
  and `npm run check:syntax` pass. `git diff --check` passes. Follow-up docs
  drift and live plan tests are rerun after this entry is recorded.
- The focused route suite now also proves unknown `operation` rejection on five
  dispatching routes, exact request shapes for validation and install, and
  field rejection for native approval, secret, storage, and health-policy
  mutations. It keeps positive checks for selection install/update and valid
  secret/policy operations. `tests/backend/routes-plugins.test.js` passes
  **18/18**. Native picker, dashboard IPC, the remaining route success/failure
  matrix, provider/account, compatibility retirement, and packaged/manual
  acceptance remain open.

### Task 5 continuation evidence (2026-10-07, plugin logs and lifecycle DTO closure)

- Reproduced and fixed four additional HTTP boundary gaps in the Plugins slice. Log `level` and free-text filters were accepted by the UI but ignored by the SQLite repository; `page`/`pageSize` were also ignored, forcing the UI to receive the default 200 rows. Uninstall silently coerced any `removeStorage` value other than the exact string `true` to `false`. Bodyless `restart` and default command requests were rejected because the route only treated `null` as an empty DTO, and `sync-bundled` accepted arbitrary request fields.
- The log repository now performs bounded SQL filtering for `level` and case-insensitive `pluginId`/`message` text, supports bounded `page`/`pageSize` or cursor pagination, rejects invalid cursors and conflicting cursor/page usage, and keeps the per-plugin 5,000-row limit. Plugin CSV export now uses standard doubled-quote escaping for messages containing quotes or commas. Plugins routes apply exact query allowlists, require `removeStorage` to be `true` or `false`, accept bodyless restart/command calls as `{}`, and require an empty DTO for bundled sync.
- Regressions were written before fixes for ignored log filters, invalid CSV quoting, malformed uninstall booleans, bodyless restart/command rejection, and arbitrary sync payloads. Fresh evidence: the combined Plugins route/domain/handler/log slice passes **57/57**; `npm run test:backend` passes **339/339**; `npm run check:syntax`, `npm run build:contracts`, `npm run check:api-contract` (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**), `npm run check:channel-retirement` (**140 current; 79 cutover; 20 blocked; 0 dead**), `npm run check:docs-drift`, and `git diff --check` pass. The Control Center Vite build retains its existing non-failing large-chunk advisory.
- This closes the newly audited Plugins HTTP DTO/log behavior slice only. Plugins and Task 5 remain **partial**: native dashboard/package picker behavior, compatibility IPC retirement, real provider/account acceptance, packaged/manual acceptance, and the broader remaining route/provider failure matrix still require evidence.

### Task 5 continuation evidence (2026-10-07, AI query and SSE DTO boundaries)

- Reproduced ignored query parameters on `GET /ai/traces`, `GET /ai/hatch/budget`, provider test/model discovery, and image health/model diagnostics. Those routes now apply exact query allowlists (Trace permits only `conversationId`; Hatch budget permits only `runId`; diagnostics and provider probes permit no query fields) before invoking the AI domain. The provider-key write/delete routes now accept only the canonical `ai.default` and `ai.vision` references and reject query fields before Shell persistence.
- Reproduced Control Center SSE acceptance of an `ai.chat-delta` payload with extra fields and silent acceptance of frames after `ai.chat-done`. The parser now validates delta envelopes (`conversationId`, `delta` only), rejects unknown events and any frame after the terminal event, while keeping UTF-8 chunk decoding and terminal DTO validation.
- Fresh verification: Backend AI route/secret/image tests pass **36/36**; Control Center AI API/SSE tests pass **11/11**, including truncated-stream and reader-cancellation behavior; `npm run test:backend` passes **342/342**; `npm run test:resilience` passes **3/3**; `npm run check:syntax`, `npm run build:contracts`, `npm run check:api-contract` (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**), `npm run check:channel-retirement` (**140 current; 79 cutover; 20 blocked; 0 dead**), `npm run check:docs-drift`, the 23-test live-docs suite, and `git diff --check` pass. The Control Center Playwright baseline is blocked at browser launch because the configured Chromium headless shell is absent at `/Users/mango/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`.
- This closes the audited AI query, provider-key reference, and SSE parser boundary slice only. Task 5 and AI remain **partial**: provider/account acceptance, remaining dependency and abort/failure cases, IPC retirement proof, and packaged/manual acceptance remain open.

### Task 5 continuation evidence (2026-10-07, wrapped AI route audit)

- The unified AI route wrapper validates query allowlists and duplicate query keys before dispatch, including destructive writes and Job enqueue. The HTTP router preserves scalar query values and reports duplicate keys without silently collapsing them for AI validation. The focused router/AI route/secret/image regression now passes **39/39**, including HTTP coverage proving duplicate `conversationId`, `entrypoint`, and `runId` keys never reach domain methods.
- Before the duplicate-key integration regression, fresh verification was: `npm run test:backend` **344/344**, `npm run test:resilience` **3/3**, `npm run test:tools` **667/667**, `npm run check:syntax`, `npm run build:contracts`, `npm run check:api-contract` (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**), `npm run check:channel-retirement` (**140 current; 79 cutover; 20 blocked; 0 dead**), `npm run check:docs-drift`, the live docs suite **23/23**, retirement-checker tests **12/12**, focused Control Center AI/SSE/reachability tests **30/30**, and `git diff --check` passed. The fresh post-regression broad counts are recorded in the following continuation entry.
- The retirement checker now recognizes literal AI method/path registrations only when they flow through the shared wrapper with unchanged arguments. This keeps dynamic validation wrappers auditable without accepting arbitrary route-like strings. `npm run test:control-center` and `npm run test:core` remain blocked at browser launch because the configured Chromium headless shell is absent at `/Users/mango/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`; browser acceptance is unverified.
- This closes a route-audit compatibility slice only. Task 5 and AI remain **partial**: provider/account acceptance, remaining dependency and abort/failure cases, IPC retirement proof, and packaged/manual acceptance remain open.

### Task 5 continuation evidence (2026-10-07, duplicate AI query keys)

- Added an HTTP-level regression for duplicate values on every AI read route that permits query fields: conversations, trace lookup, and Hatch budget lookup. All return `VALIDATION_FAILED` before invoking their domain method. The router-level regression confirms scalar query compatibility is preserved while duplicate-key presence is separately available to route policy.
- Tightened route retirement parsing with positive and negative fixtures: literal registrations through the shared AI wrapper count only when `registerAiRoute()` binds `router[method]` and calls it with the forwarded path. An empty helper or an unrelated router call does not count as an implemented route.
- Fresh verification after the duplicate-key integration regression: AI routes plus router tests **26/26**; full focused router/AI route/secret/image tests **39/39**; retirement checker **13/13**; full Backend **345/345**; tools **668/668**; `npm run check:syntax`; and `npm run check:channel-retirement` (**140 current, 79 cutover, 20 blocked, 0 dead**). The final provider-key fix and documentation update receive a separate fresh verification checkpoint below.
- A secret-response boundary regression also demonstrated that an injected secret service returning `{ apiKey }` would previously have leaked that field through the provider key HTTP route. The route now waits for persistence and constructs only `{ configured, maskedTail }` from the submitted value; DELETE always returns the fixed empty status DTO. Fake-service tests exercise extra fields and plaintext values on both responses.
- Final verification after the provider-key response fix: focused Backend router/AI route/secret/image tests **39/39**, full Backend **345/345**, tools **668/668**, Control Center AI/SSE/reachability **30/30**, retirement checker **13/13**, resilience **3/3**, `check:syntax`, contracts/API reconciliation, channel retirement, docs drift, live docs **23/23**, and `git diff --check` pass. The >500 kB Vite chunk message remains advisory. Browser suites remain unverified because the configured Chromium headless shell is unavailable.
- A follow-up end-to-end HTTP regression reproduced provider-key PUT and DELETE persistence failures returning 500. `registerAiSecretRoutes()` now maps non-API Shell persistence failures to retryable `BACKEND_UNAVAILABLE` while retaining `cause`; fixed error text prevents the Shell error or submitted credential from entering the response. The regression verifies both methods return 503, keep the prior in-memory key unchanged, and omit sensitive text.
- Fresh verification after this persistence-error mapping: focused secret/image route tests **14/14**, full Backend **346/346**, tools **668/668**, `check:syntax`, `build:contracts`, API reconciliation, channel retirement, docs drift, live docs **23/23**, and `git diff --check` pass. The Vite chunk-size notice is advisory. Full core and Control Center browser acceptance remains unverified because the configured Chromium headless shell is unavailable.
- This adds query-policy and route-audit proof only. AI and Task 5 remain **partial** pending route/provider failure matrix completion, real provider/account acceptance, IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, AI chat disconnect cancellation)

- The new HTTP regression initially timed out after a client abort because `/ai/chat` continued awaiting `talk.chat()` and never requested Shell cancellation. The route now observes early response closure, races it against chat completion, and sends `talk.stop` with the same supplied or generated `ai-chat:<UUID>` request ID. A disconnected request returns without publishing SSE frames or chat events.
- If Shell cancellation fails, the route emits a fixed warning containing only the request ID and a constrained error code; `services/backend/index.js` injects the existing structured logger. Regressions cover successful cancellation and a secret-bearing stop error that must not appear in the warning.
- AI chat dependency errors also have an HTTP regression: `BACKEND_UNAVAILABLE` stays retryable, the internal cause is absent from the response, and neither SSE nor chat events are emitted.
- Fresh verification: focused AI Talk routes **28/28**, full Backend **349/349**, tools **668/668**, Resilience **3/3**, the full Node suite excluding the two browser-dependent files **3127/3127 with 1 skipped**, `npm run check:syntax`, `npm run build:contracts`, API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**), channel retirement (**140 current; 79 cutover; 20 blocked; 0 dead**), docs drift, live docs **23/23**, and `git diff --check` pass. Standard `npm test` is blocked by the missing configured Chromium headless shell. The Control Center Vite build retains its non-failing chunk-size advisory.
- This closes the HTTP client-disconnect cancellation slice only. AI and Task 5 remain **partial**: the wider failure/cancellation matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance remain open.

### Task 5 continuation evidence (2026-10-07, provider key size bound)

- A route regression reproduced that `PUT /ai/providers/:id/key` accepted a 4097-character value and reached Shell secret persistence, while image and Hatch key routes already enforce a 4096-character limit.
- The shared AI key body parser now rejects values over 4096 characters before any secret-service call. The same route test verifies the oversized value is rejected and persistence is untouched.
- Fresh verification: focused AI secret/image/Talk route tests **42/42**, full Backend **349/349**, `npm run check:syntax`, `npm run build:contracts`, API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**), channel retirement (**140 current; 79 cutover; 20 blocked; 0 dead**), docs drift, and `git diff --check` pass. Task 5 and AI remain **partial**; provider/account acceptance, the wider failure/cancellation matrix, compatibility IPC retirement, and packaged/manual acceptance remain open.

### Task 5 continuation evidence (2026-10-07, Pet Pack reverse request DTOs)

- The Pet Pack import route/domain regression already rejects mixed `selectionId` and path input before enqueue. The follow-up reverse-channel audit found a separate boundary gap: `pet-packs.request` only constrained `operation` to an allowlist and `payload` to an object, so fields such as an extra `path` on `validate`, an unexpected `sourcePath` on `activate`, or `packId` on `list` reached the Shell callback. The regression failed before the change and now verifies no Shell dispatch occurs for those shapes.
- `petPackRequestSchema` now defines strict per-operation payloads for list, manifest, validate, clear-selection, import, export, activate, and remove. It validates safe pack IDs, bounded path/selection strings, optional export target, and exactly one import selection handle or path. Sidecar parsing applies the matching field/type/length checks before invoking Shell authority.
- Fresh focused evidence: reverse-channel allowlist, bridge/dialog, and Pet Packs route/domain tests pass **43/43**; `npm run build:contracts` and Sidecar syntax validation pass. The contract tests directly reject mixed/extra fields and unsafe IDs.
- Pet Packs and Task 5 remain **partial**. Native picker cancel/accept behavior, export failure/cancellation cleanup, and desktop/manual acceptance remain open. The 2026-10-07 selection lifecycle continuation adds cleanup after import success, import failure, and pre-finalizing cancellation; cleanup failure preserves the import result and logs only the operation, selection ID, and error code. Fresh Sidecar/HTTP/Job evidence verifies finalizing cancellation is rejected and both successful and failed imports request selection cleanup. A follow-up Shell IPC regression now verifies that repeated activation of the current pack returns its snapshot without reloading animations, refreshing trigger rules, or broadcasting duplicate activation/chat events.

### Task 5 continuation evidence (2026-10-07, Pet Pack export path bounds)

- The export route/domain audit reproduced two boundary gaps: a 4097-character `target` returned `202` and entered the Job queue, and the direct `runExport()` handler accepted the same unbounded value. The route now accepts only an empty DTO or one non-empty `target` no longer than 4096 characters; Domain enqueue and execution validate the same bound before progress or Shell dispatch.
- The shared Contract previously accepted whitespace-only `sourcePath` and export `target` because `z.string().min(1)` does not trim. Its Pet Pack path and selection schemas now require trimmed non-empty values while preserving the original value. Contract tests cover extra fields, mixed import sources, unsafe IDs, whitespace paths, and whitespace targets.
- Fresh evidence: serialized reverse-channel and Pet Pack route/domain tests pass **27/27** after `npm run build:contracts`; route/domain tests prove invalid export requests do not enqueue Jobs, and direct execution rejects before Shell dispatch. Pet Packs and Task 5 remain **partial** pending native picker/manual acceptance, broader Job failure/cancellation cleanup, and activation side-effect/event evidence.

### Task 5 continuation evidence (2026-10-07, Pet Pack selection lifecycle)

- The prior `runImport()` returned or threw before releasing Shell-owned selection handles. It now requests `clear-selection` after successful imports, import failures, and cancellation before the uncancelable finalizing boundary; path-based imports have no selection handle to clear.
- Cleanup is best effort because Shell Pet Pack import consumes the pending selection during successful installation. A cleanup transport failure after success must not make a committed import look failed. The Backend records a warning with only the operation, selection ID, and error code. If import and cleanup both fail, the import error remains primary and the cleanup error is attached as `cleanupError`.
- Fresh evidence: focused route/domain cleanup regressions cover import failure, pre-finalizing cancellation, cleanup transport failure, and dual failure precedence. Sidecar/HTTP/Job runtime tests verify success is non-cancelable while finalizing and cleanup runs after success; a separate runtime regression verifies cleanup runs after a typed import failure.
- This closes the identified selection-handle cleanup slice only. Pet Packs and Task 5 remain **partial** pending native picker acceptance, packaged/manual acceptance, and the wider migration acceptance matrix. Export finalizing cancellation and Shell failure terminal behavior are now covered by the real Sidecar/HTTP/Job regression path.

### Task 5 continuation evidence (2026-10-07, Pet Pack activation idempotency)

- The Shell `activate` adapter previously reloaded PetService animations, refreshed the trigger runtime, and broadcast `pet.pack-activated` even when the requested pack was already active. The shared Shell integration regression reproduced this: import auto-activated Doro, then explicit activation emitted a duplicate change event.
- The adapter now compares the active pack ID before and after `setActivePack()`. It always returns the normalized current mutation snapshot, but reloads animations, refreshes trigger rules, and broadcasts to SSE/chat only when the active ID changes.
- Fresh focused evidence: the Shell Pet Pack mutation bridge regression passes and asserts one animation reload, one trigger refresh, and no duplicate activation notification for the repeated activation.
- This closes redundant activation side effects only. Pet Packs and Task 5 remain **partial** pending native picker acceptance, packaged/manual acceptance, compatibility IPC retirement, and the wider migration acceptance matrix.

### Task 5 continuation evidence (2026-10-07, Pet Pack export Job lifecycle)

- The export route/domain already bounded targets and delegated native writes to Shell. The remaining Job boundary evidence now runs through the real Sidecar and HTTP server: `finalize()` marks the export non-cancelable before the Shell export request, and a cancellation attempt returns `JOB_NOT_CANCELABLE` without a second request.
- A second runtime regression injects a typed `BACKEND_UNAVAILABLE` Shell failure. Because `pet-pack.export` has one attempt by policy, the Job settles `failed` with the typed retryable error but `canRetry: false`, and no duplicate export dispatch occurs.
- Fresh focused evidence: export lifecycle runtime tests pass 2/2; the broader Pet Pack route/domain, Shell IPC, Control Center cutover, and native Pet Pack service suites remain green.
- This closes the export Job failure/cancellation evidence slice only. Pet Packs and Task 5 remain **partial** pending native picker acceptance, packaged/manual acceptance, compatibility IPC retirement, and the wider migration acceptance matrix.

### Task 5 continuation evidence (2026-10-07, AI reverse request DTO alignment)

- A failing shared-contract regression exposed a drift from the Shell Sidecar: `chat` and `talk.start` accepted non-string or over-160-character optional `conversationId`, `entrypoint`, and `requestId`; `persona.draft` also accepted a non-string or over-2000-character optional instruction.
- Aligned the shared AI request contract with the Shell validator and added Sidecar regressions proving malformed values are rejected before `onAiTalkRequest` dispatch. `node --test tests/backend/bridge-dialog.test.js tests/backend/reverse-channel-allowlist.test.js` passes **34/34** after `npm run build:contracts`.
- This closes this reverse DTO discrepancy only. AI and Task 5 remain **partial** pending wider HTTP/provider failure evidence, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, Pet Pack native picker cancellation)

- The Shell-only Pet Pack picker already returned `{ canceled: true }` before inspecting a source, but the cancellation branch had no regression coverage. The new IPC test verifies a canceled native dialog returns the cancellation DTO and never dispatches `inspectPackSource`; the existing acceptance test continues to verify folder/zip picker options and selected-path delegation.
- Fresh focused evidence: `tests/main/ipc-plugin-install.test.js` passes **33/33**. This closes the synthetic IPC cancellation boundary only. Real Electron picker behavior, packaged/manual acceptance, and the remaining migration acceptance matrix stay external or partial.

### Task 5 continuation evidence (2026-10-07, AI behavior dry-run DTO bounds)

- Reproduced malformed `behaviorIntent` and `rules` reaching the AI Shell domain: the HTTP route returned 200 for wrong confidence types, unsupported intent fields, invalid action types, and more than 50 rules. The Sidecar also accepted malformed behavior intents before Shell dispatch.
- Added shared strict contracts for behavior intents and rules, including bounded text/identifiers, confidence ranges, valid rule action types, at most 20 match terms per rule, and at most 50 rules. HTTP route, Backend domain, shared reverse-channel contract, and Shell Sidecar now validate through this DTO before dispatch. Existing Control Center rule structures remain valid.
- Fresh verification: AI Talk routes plus reverse-channel tests pass **46/46**; bridge-dialog plus Sidecar spawn tests pass **29/29**; Backend passes **364/364**; `npm run build:contracts`, `npm run check:syntax`, `npm run check:api-contract` (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**), `npm run check:channel-retirement` (**140 current; 79 cutover; 20 blocked; 0 dead**), `npm run check:docs-drift`, live development-plan docs (**23/23**), and `git diff --check` pass. The Control Center production build retains its advisory for a chunk over 500 kB.
- This closes this malformed behavior dry-run DTO slice only. AI and Task 5 remain **partial** pending the broader provider/dependency failure matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, AI behavior rule mutation DTOs)

- Reproduced the same nested DTO gap on `POST /ai/behavior/rules` and `PATCH /ai/behavior/rules/:id`: unsupported condition fields returned a dependency error after dispatch, while an unsupported action type returned 200. The reverse Sidecar path also accepted both shapes.
- Reused the shared strict `aiBehaviorRuleSchema` for HTTP create/update validation, Backend domain validation, reverse Contract payload issues, Sidecar pre-dispatch validation, and the Control Center dry-run request schema. The rule schema preserves optional fields and empty-rule compatibility while bounding identifiers/text, confidence values, condition terms, priorities, and action types.
- Fresh verification: the combined bridge/route/reverse AI suite passes **65/65** and full Backend passes **365/365**; `npm run build:contracts`, `npm run check:syntax` (including typecheck and Control Center build), `npm run check:docs-drift`, live development-plan docs (**23/23**), and `git diff --check` pass. The Control Center build retains its non-failing >500 kB chunk advisory.
- This closes the AI behavior mutation DTO slice only. AI and Task 5 remain **partial** pending the wider provider/dependency failure matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, AI behavior save DTO bounds)

- Reproduced the remaining Behavior save gap: HTTP accepted an unknown config field and a malformed nested rule with `200`, the Backend domain forwarded both values to the Shell, and the Sidecar only checked that `config` was an object. Existing callers also sent the read-only `decisions` history back with every full-state save.
- Added the shared strict `aiBehaviorConfigPatchSchema` for the incremental writable fields `enabled`, `useTools`, `cooldownMs`, and `rules` (bounded by the existing rule DTO and 50-rule limit). The same schema now guards the HTTP route, Backend domain, reverse Contract, Shell Sidecar, and Control Center HTTP request. `decisions` remains service-generated and is rejected by config saves; the Control Center now submits only writable fields, so decision history stays owned by the Behavior Orchestrator and its clear endpoint.
- Fresh verification: AI Talk route plus reverse-channel suites pass **49/49**; focused AI/Core and Control Center suites pass **137/137**; Demo Control Center tests pass **48/48**; full Backend passes **367/367**; tools/docs suites pass **668/668**; `npm run build:contracts`, `npm run check:syntax` (typecheck and Control Center production build included), `check:api-contract` (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**), `check:channel-retirement` (**140 current; 79 cutover; 20 blocked; 0 dead**), `check:docs-drift`, and `git diff --check` pass. The Control Center build retains its non-failing >500 kB chunk advisory.
- This closes the AI Behavior save DTO slice only. AI and Task 5 remain **partial** pending the wider provider/dependency failure matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, shared Control Center schema import revalidation)

- Final continuation revalidation confirmed `src/control-center/src/features/ai/talk-api.ts` imports the shared `aiBehaviorConfigPatchSchema` from `@openpet/contracts` and applies it to the `PATCH /ai/behavior` request. Fresh gates pass: `npm run check:syntax`, contracts build, API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**), channel retirement (**140 current; 79 cutover; 20 blocked; 0 dead**), docs drift, live docs **23/23**, tools/docs **668/668**, Backend **367/367**, the combined AI Talk/reverse/service/Control Center focus **144/144**, and adjacent Control Center migration suites **81/81**. The production build keeps its non-failing >500 kB chunk advisory.
- This revalidates the shared-schema import and Behavior save DTO slice only. AI and Task 5 remain **partial** pending broader provider/dependency failure coverage, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, Plugins log-clear query boundary)

- A Plugins route audit found that `DELETE /plugins/:id/logs` performed its destructive clear without rejecting undeclared query fields. The route now applies an empty query allowlist before calling the domain clear method; a regression proves an unexpected query returns `VALIDATION_FAILED` without dispatch and a valid request still clears logs.
- Fresh verification: Plugins routes **22/22**, full Backend **368/368**, `npm run check:syntax` (typecheck and Control Center production build included), and both affected files pass Node syntax validation. This closes the log-clear query boundary only; Plugins and Task 5 remain **partial** pending the wider accepted-operation/failure matrix, native picker/dashboard boundaries, compatibility IPC retirement, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, AI talk stop request boundary)

- An AI cancellation audit found that `POST /ai/talk/stop` accepted empty, non-string, and overlong request IDs at the HTTP boundary. The route now applies the same required bounded string validation used by the domain and reverse Contract before dispatching `talk.stop`; a regression proves malformed IDs do not reach the domain while a valid stop remains successful.
- Fresh verification: AI Talk routes **31/31**, full Backend **369/369**, and `npm run check:syntax` (typecheck and Control Center production build included) pass. This closes the HTTP stop-ID boundary only; AI and Task 5 remain **partial** pending the wider provider/dependency failure matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, AI memory delete identifier bound)

- Reproduced that `DELETE /ai/memories/:id` accepted whitespace-only and 161-character identifiers and dispatched them to the domain. The HTTP route, Backend domain, shared reverse Contract, and Shell Sidecar now require a non-empty memory ID of at most 160 characters. Regression coverage proves malformed values are rejected before dispatch and a 160-character ID remains accepted.
- Fresh verification: AI Talk routes and reverse-channel allowlist pass **51/51**; Backend **370/370**; Resilience **3/3**; tools/docs **668/668**; `npm run build:contracts`; `npm run check:syntax` (typecheck and Control Center production build included); API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**); channel retirement (**140 current; 79 cutover; 20 blocked; 0 dead**); `npm run check:docs-drift`; live development docs **23/23**; and `git diff --check` pass. The Control Center build retains its non-failing >500 kB chunk advisory.
- This closes the memory-delete identifier boundary only. AI and Task 5 remain **partial** pending broader provider/dependency failure coverage, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, Vision provider authentication diagnostics)

- A failing service regression showed that Vision model discovery classified HTTP 401 as generic `provider_http_error`, while chat model discovery maps the same response to `auth_failed`. The Vision probe now sends non-optional HTTP errors through the shared safe provider error classifier. Its failed diagnostic retains the HTTP status and normalized code while discarding provider response text.
- Fresh verification: `tests/services/ai-service.test.js` **79/79**; AI service plus AI Talk service **135/135**; Backend **370/370**; Resilience **3/3**; `npm run check:syntax` (typecheck and Control Center build included); contracts build; API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**); channel retirement (**140 current; 79 cutover; 20 blocked; 0 dead**); and `git diff --check` pass. The >500 kB Control Center chunk advisory remains non-failing.
- This closes Vision 401 diagnostic classification only. AI and Task 5 remain **partial** pending the broader provider/dependency failure matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, unreadable model-probe cache protection)

- A failing service regression reproduced that a reachable provider returning HTTP 200 with an unreadable `/models` body was reported as `ok` with an empty catalog and replaced the saved chat or Vision cache. The root cause was both discovery paths ignoring the `ok` result from `readJsonBody()` after the HTTP status check.
- Chat and Vision discovery now preserve the parse result and return `provider_reachable_models_unavailable` for an unreadable successful `/models` response before calling `persistModelCatalog()` or `persistVisionModelCatalog()`. The Vision regression stores its prior cache in the persisted `ai.visionModelCatalog` field, matching the service contract, and verifies that the public runtime projection remains unchanged.
- Fresh verification: AI service **81/81**; AI service plus AI Talk **137/137**; Backend **370/370**; Resilience **3/3**; tools **668/668**; live development docs **23/23**; `npm run check:syntax` (typecheck and Control Center production build included); `npm run build:contracts`; API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**); channel retirement (**140 current; 79 cutover; 20 blocked; 0 dead**); `npm run check:docs-drift`; and `git diff --check` pass. The Control Center build retains its non-failing >500 kB chunk advisory.
- This closes unreadable model-probe cache protection only. AI and Task 5 remain **partial** pending the broader provider/dependency failure matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, invalid model-catalog response shape)

- Failing regressions showed that a successful HTTP 200 response containing valid JSON but no model array was treated as an empty catalog and persisted by AI connection testing, chat/Vision discovery, and Image Provider health/discovery. Image Provider's existing parser supports either `data` or `models`; both remain accepted formats.
- AI probes now require an object with a `data` array. Image health and discovery require an object with either a `data` or `models` array. Missing-array responses use the safe `provider_reachable_models_unavailable` path and skip catalog persistence. A valid empty array remains authoritative and can clear the catalog. AI connection testing still succeeds when chat completion succeeds and classifies this optional catalog probe as unavailable; unreadable JSON retains its existing `failed` probe classification.
- Fresh verification: AI service **84/84**; Image model service **65/65**; Creator Workflow service **57/57**; Backend **370/370**; Resilience **3/3**; tools **668/668**; live development docs **23/23**; `npm run check:syntax` (typecheck and Control Center production build included); `npm run build:contracts`; API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**); channel retirement (**140 current; 79 cutover; 20 blocked; 0 dead**); `npm run check:docs-drift`; and `git diff --check` pass. The Control Center build retains its non-failing >500 kB chunk advisory.
- This closes malformed model-catalog response-shape protection only. AI and Task 5 remain **partial** pending the broader provider/dependency failure matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, Image Provider authentication diagnostics)

- Failing Image Provider service regressions showed that health checks and model discovery classified HTTP 401/403 as generic `provider_unhealthy`, while the equivalent AI probes returned `auth_failed`.
- Added one safe HTTP status classifier shared by Image Provider health, model discovery, and generation failures. HTTP 401/403 now report `auth_failed` with the fixed message `Image Provider rejected the API key`; generation does not retry these permanent responses, and provider response bodies remain out of results and logs. Other non-optional probe statuses keep the existing `provider_unhealthy` behavior.
- Fresh verification: Image Provider service **68/68**; AI service plus AI Talk **140/140**; Creator Workflow **57/57**; Backend **370/370**; Resilience **3/3**; tools **668/668**; `npm run check:syntax` (typecheck and Control Center production build included); `npm run build:contracts`; API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**); channel retirement (**140 current, 79 cutover, 20 blocked, 0 dead**); docs drift; live development docs **23/23**; and `git diff --check` pass. The Control Center build retains its non-failing >500 kB chunk advisory.
- This closes Image Provider 401/403 classification and redaction coverage for health, discovery, and generation only. AI and Task 5 remain **partial** pending the broader provider/dependency failure matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, Image Job Provider cancellation)

- A failing Backend regression showed that canceling a running image Job did not interrupt its in-flight Provider fetch; it ended only when the Provider timeout fired. A service-level regression also showed that a request canceled while waiting for `maxConcurrentJobs` still acquired a slot and ran later.
- The Backend image domain now passes the runner signal to the image service. The concurrency queue removes aborted waiters and rejects them with the abort reason. Provider transport links external cancellation to its internal timeout controller during fetch and response-body consumption, removes signal listeners/timers in `finally`, and avoids transport retry/model fallback after cancellation. The provider slot is released through the existing `finally` path.
- Fresh verification: image Job plus Provider service tests pass **75/75**; full Backend passes **371/371**; resilience passes **3/3**; non-browser Core Node tests pass **2120 with 1 skipped**; focused Pet Pack activation tests pass **2/2**; `npm run check:syntax`, `npm run check:docs-drift`, and `git diff --check` pass. One concurrent Backend run had a transient process-tree PID fixture failure; the isolated test file passed **20/20**, and a subsequent full Backend run passed. Full `test:core` remains blocked because the configured Playwright Chromium executable is absent.
- This closes running and queued Image Provider cancellation only. AI and Task 5 remain **partial** pending real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, Creator Studio Hatch bridge cancellation)

- A failing Creator Studio command-bridge regression showed that the loopback HTTP handler created an abort signal on client disconnect, but `creatorHatchPetPlan` did not accept the bridge context, so the Shell Hatch service never received it. The evaluator had the same missing handoff.
- The plan/evaluate handlers now pass the bridge signal to `planSprite()` / `evaluateSprite()`, and both Hatch operations pass it to `completeStructuredTool()`. Abort errors stop planner repair and evaluator retry paths immediately. Regressions prove HTTP disconnect cancellation reaches the fake Hatch dependency and that direct planner/evaluator requests deliver the caller signal to the provider exactly once without repair/retry.
- Fresh verification: Hatch plus Plugin Service tests **211/211**; focused AI routes, reverse-channel, AI services, AI Talk, Hatch, and Plugin Service tests **402/402**; `npm run check:syntax` (Node syntax, TypeScript, cursor-helper build, and Control Center build), `npm run build:contracts`, `npm run check:api-contract` (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 Job statuses**), `npm run check:channel-retirement` (**140 current; 79 cutover; 20 blocked; 0 dead**), and `npm run check:docs-drift` pass. Vite retains its non-failing >500 kB bundle advisory.
- This closes the Creator Studio Hatch bridge-to-provider cancellation handoff only. AI and Task 5 remain **partial** pending the broader domain failure matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, AI chat/Vision config provider boundary)

- Reproduced a cross-layer contract gap: `/ai/config` returned 200 for an unsupported chat provider; the shared `ai.talk.request` Contract and Shell Sidecar also accepted unsupported chat/Vision providers and over-2000-character endpoint/model fields. The eventual Shell service rejected unsupported providers only after the reverse request had crossed the process boundary.
- Added shared `aiTalkConfigSchema` validation for the sole supported chat/Vision provider (`openai-compatible`), HTTP(S)-only endpoint strings without embedded credentials/query/hash, non-empty model IDs, endpoint/model strings up to 2000 characters, and system prompts up to 12000 characters. Backend domain validation reuses the schema; the shared reverse Contract and CommonJS Sidecar enforce the same limits before dispatch. HTTP, Contract, and Sidecar regressions cover unsupported chat/Vision providers, unsafe URLs, empty models, overlong endpoint/model values, and an accepted provider config at the declared bounds.
- Fresh verification: focused bridge, Sidecar, AI route, AI service, and AI Talk service suites pass **209/209**; full Backend passes **371/371**; `npm run build:contracts`, `npm run check:syntax` (Node syntax, typecheck, cursor helper, and Control Center build), API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**), channel retirement (**140 current; 79 cutover; 20 blocked; 0 dead**), docs drift, live docs (**26/26**), and `git diff --check` pass. The Control Center build retains its non-failing >500 kB chunk advisory.
- This closes the AI config provider/size boundary only. AI and Task 5 remain **partial** pending broader domain failure coverage, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, image Job input confidentiality)

- The image Job data-boundary review found that prompts, local reference-image paths, and output paths must never become durable Job input or leak through public Job reads. HTTP and plugin image-generation entry points now dispatch the original request as Backend-process transient input; SQLite persists only { redacted: true, summary: "Image generation input withheld" }. Repository reads mask historical rows before startup recovery, and repository initialization scrubs their persisted input.
- The Backend-owned transient map is removed on enqueue/runner errors, queued cancellation or expiry, and runner settlement; the runner retains its in-memory copy only while executing and across in-process retries. Recovery interrupts queued/running redacted image jobs because their transient input cannot survive a restart. A redacted image Job without transient input fails with non-retryable 409 CONFLICT. The plugin image capability now assigns a Job ID before dispatch.
- The generic 429/5xx runner transition regression now uses creator.workflow: an image Job is intentionally not externally retryable after its private input is gone. Fresh verification: the focused runner retry regression passes 1/1, full Backend passes 378/378, npm run check:syntax (Node syntax, TypeScript, cursor helper, and Control Center production build) passes, and git diff --check passes. The Control Center build keeps its non-failing >500 kB chunk advisory.
- This closes the image Job input-persistence boundary and preserves generic retry-policy coverage only. AI and Task 5 remain **partial** pending the wider provider/dependency failure matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, automatic Job retry lock lifecycle)

- A Runner regression reproduced that retryable `catalog.install` attempts were persisted as terminal `failed` during backoff. Since `idx_jobs_resource_active` covers only `queued` and `running`, a second install for the same selection could acquire the resource lock before the original Job retried; an SSE subscriber also observed `job.failed` while automatic retry was still active.
- Retryable failures now keep the Job `running` through backoff and do not publish a terminal failure event. The repository increments `attempt` with a running-state CAS immediately before invoking the next handler attempt. Exhausted/permanent failures still transition to `failed` and emit one `job.failed`; shutdown during backoff follows the existing running-to-interrupted recovery path.
- Added Runner and repository regressions for the backoff state, event silence, held resource lock, attempt boundary, retry success, and exhausted terminal failure. Updated the Job subsystem state/retry contract.
- Fresh verification: focused Job / repository / route / dispatcher / recovery / runtime / image tests **62/62**; `npm run test:backend` **380/380**; `npm run test:resilience` **3/3**; `npm run check:syntax` (Node syntax, typecheck, cursor-helper and Control Center production build); contract build and API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**); channel retirement (**140 current; 79 cutover; 20 blocked; 0 dead**); docs drift; live docs **23/23**; and `git diff --check` pass. A first backend run under parallel system load hit the plugin log ingestion timing threshold; the isolated test passed **12/12**, and the subsequent full Backend rerun passed.
- This closes the automatic retry resource-lock and terminal-event boundary only. AI and Task 5 remain **partial** pending the broader provider/dependency failure matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, AI provider dependency diagnostics)

- A focused reverse-result review found that `PROVIDER_TIMEOUT` and `BACKEND_UNAVAILABLE` retained their HTTP status and retryability but shared the generic `AI provider request failed` message, which misreported a Shell/Backend outage as an upstream Provider error.
- Sidecar errors now classify Provider HTTP failures, Provider timeouts, missing API keys, and Backend/Shell unavailability into typed error codes before returning over the reverse channel. Those cases use fixed messages that do not carry Provider bodies, key material, or infrastructure error text. Backend then maps the three retryable Provider/dependency classes to distinct public messages while preserving 502/504/503 and retryability.
- Fresh verification: reverse-channel + AI route tests **54/54**; full Backend **384/384**; AI, AI Talk, Image Provider, and Hatch service tests **246/246**; Resilience **3/3**; tools **668/668**; `npm run check:syntax` (Node syntax, TypeScript, cursor helper, Control Center production build); contracts build; API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**); channel retirement (**140 current; 79 cutover; 20 blocked; 0 dead**); docs drift; live development docs **23/23**; and `git diff --check` pass. Vite reports its existing non-failing >500 kB chunk advisory.
- This closes the typed AI Talk reverse-error message classification only. AI and Task 5 remain **partial** pending the wider route/provider failure matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, AI provider HTTP status mapping)

- A failing reverse-channel regression reproduced HTTP 401 provider authentication errors being collapsed into retryable `PROVIDER_ERROR`/502. The root cause was Sidecar normalization checking only whether a provider status existed, without interpreting its value.
- Sidecar now maps provider 401/403 to non-retryable `PERMISSION_DENIED`, 404 to non-retryable `NOT_FOUND`, 429 to retryable `RATE_LIMITED`, 408/504 to retryable `PROVIDER_TIMEOUT`, other 4xx to non-retryable `VALIDATION_FAILED`, and 5xx/network failures to `PROVIDER_ERROR`. Stream transport failures are included; errors use fixed safe messages while Backend preserves ordinary AI domain messages such as memory `NOT_FOUND`. The HTTP error boundary now emits `Retry-After: 1` for every `RATE_LIMITED` response as required by the API contract.
- Fresh verification: reverse-channel + AI route + HTTP middleware tests **63/63**; Backend **385/385**; AI service + AI Talk service **140/140**; Resilience **3/3**; `npm run check:syntax` (Node syntax, TypeScript, cursor helper, Control Center production build); `npm run test:tools` **668/668** including live docs **23/23**; contracts build; API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**); channel retirement (**140 current; 79 cutover; 20 blocked; 0 dead**); docs drift; and `git diff --check` pass.
- This closes Provider HTTP error-code mapping and its HTTP status/retryability path only. AI and Task 5 remain **partial** pending the wider domain/provider failure matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-07, Provider probe DTO status mapping)

- A failing AI service regression reproduced HTTP 408 from the chat connection probe being returned as `provider_http_error`. The same `classifyConnectionError()` path is used by chat and Vision model discovery, so the normal-return DTO path had not inherited the status distinctions implemented for reverse-channel exceptions.
- The AI probe classifier maps 408/504 to `timeout`, 429 to `rate_limited`, and 5xx to `provider_unavailable`, with fixed safe messages; 401/403 and 404 retain their existing authentication and endpoint classifications. A follow-up failing regression showed optional `/models` HTTP 501 was captured by the general 5xx branch before its unavailable fallback. A second regression found chat and Vision model discovery read the optional error body before classifying the status, so a stalled error body could turn an unsupported optional endpoint into a failed discovery. Connection testing and both discovery paths now handle 401/403/404/405/501 before general 5xx classification and before reading those error bodies. Regressions verify 404/405/501 leave connection/discovery successful and preserve saved catalogs even when the response body stalls; shared status coverage checks connection testing plus chat and Vision model discovery for 408, 429, 500, 503, and 504, including that provider response text is absent.
- Fresh verification: AI service + AI Talk tests **143/143**; Backend **385/385**; tools **668/668**; non-browser Core Node tests **2102 passed, 1 skipped**; Resilience **3/3**; `npm run check:syntax` (Node syntax, TypeScript, cursor helper, Control Center production build); contracts build; API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 Job statuses**); channel retirement (**140 current; 79 cutover; 20 blocked; 0 dead**); docs drift; live docs **23/23**; and `git diff --check` pass. Full `npm run test:core` remains blocked because the configured Chromium headless shell is missing. The Control Center build retains its non-failing >500 kB bundle advisory.
- This closes Provider HTTP status classification for AI connection/model-probe DTOs and restores the documented optional `/models` 501 fallback, including stalled optional error bodies. AI and Task 5 remain **partial** pending the broader failure matrix, real provider/account acceptance, compatibility IPC retirement proof, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-08, Plugins duplicate query rejection)

- A failing route regression reproduced `GET /plugins/:id/logs?level=info&level=error` returning `200` and dispatching the last value. The router already records duplicate keys as `ctx.hasDuplicateQueryKeys`, but Plugin handlers only validated the collapsed query object.
- `registerPluginRoutes()` now installs a scoped middleware for `/plugins` paths and returns `VALIDATION_FAILED` before any Plugin domain or Job dispatch when query keys repeat. The response does not include submitted query values.
- Fresh verification: Plugin routes **22/22**; Backend **385/385**; `npm run check:syntax` (Node syntax, TypeScript, cursor helper, Control Center production build); contracts build; API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**); channel retirement (**140 current; 79 cutover; 20 blocked; 0 dead**). Documentation drift and `git diff --check` are verified after this entry.
- This closes duplicate-query rejection for Plugin routes only. Plugins and Task 5 remain **partial** pending the wider route/failure matrix, native picker/dashboard boundaries, compatibility IPC retirement, and packaged/manual acceptance.
- A second failing route regression reproduced Telegram secret state/save/clear operations dispatching for arbitrary plugin path IDs even though all three operations target the host-owned `openpet.im-gateway` secret. The HTTP routes now reject any other plugin ID before calling the Shell secret bridge; the accepted UI path already uses the owning ID.
- Fresh verification after the owner check: Plugin routes **23/23**; Backend **386/386**; `npm run check:syntax`; `npm run test:resilience` **3/3**; and `npm run test:tools` **668/668**. Contract/API/channel-retirement/docs-drift gates and `git diff --check` remain green from the preceding duplicate-query slice.
- This closes secret-operation route ownership validation only. Plugins and Task 5 remain **partial** pending the wider route/failure matrix, native picker/dashboard boundaries, compatibility IPC retirement, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-08, Plugins accepted-operation matrix)

- Added route-level success coverage for every accepted operation branch that was missing from the matrix: storage clear, service start/health/stop and restart fallback, log export, setup, Creator default flow, permissions read/write, bundled sync Job enqueue, and config read/write. A partially assembled Plugin service also proves missing domain methods map to retryable `BACKEND_UNAVAILABLE`/503.
- Fresh verification: `tests/backend/routes-plugins.test.js` **24/24**, `npm run test:backend` **387/387**, `npm run test:tools` **669/669**, the live development-plan docs suite **24/24**, `npm run check:syntax` (Node syntax, typecheck, cursor helper, Control Center production build), `npm run build:contracts`, `npm run check:api-contract` (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**), `npm run check:channel-retirement` (**140 current; 79 cutover; 20 blocked; 0 dead**), `npm run check:docs-drift`, and `git diff --check` pass. The Vite build retains its non-failing >500 kB chunk advisory.
- Plugin HTTP accepted-operation coverage is now complete for the declared route branches. Plugins and Task 5 remain **partial** pending native picker/dashboard behavior, compatibility IPC retirement proof, real Provider/account acceptance where included in the demo, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-08, Actions import private input and queued cancellation)

- Failing repository and recovery regressions reproduced that Actions import `selectionId`, local `path`, and `label` were written to SQLite and queued/running imports were automatically requeued after restart despite the Shell selection map being process-local. The running sample also exercised the existing unique `resourceKey` constraint; each recovery fixture now uses a distinct key.
- `actions.import-frames` now stores only `{ actionId }` in its durable Job row, passes selection/path/label via the dispatcher's process-local `privateInputs` map, and exposes the same fixed redacted summary as image Jobs. Repository initialization scrubs legacy persisted values and every repository read masks legacy rows. Recovery marks queued/running imports interrupted rather than requeueing them; redacted imports cannot be explicitly retried without fresh selection data.
- A real Sidecar/HTTP/Job regression saturates both pack workers, queues an Actions import, cancels it, verifies the Shell selection clear request, and confirms no import request was dispatched. Existing runtime tests cover success and typed failure cleanup.
- Fresh verification: Actions/Jobs/recovery/runtime focused tests **48/48** before the legacy-row regressions; repository/recovery/state-machine tests **40/40** after those regressions; Core **2155 passed, 1 skipped** with `PLAYWRIGHT_BROWSERS_PATH=/tmp/openpet-playwright-20261008`; Backend **393/393**; Resilience **3/3**; contracts build and API reconciliation (**140 IPC; 117/119 REST; 21 SSE; 8 topics; 17 Job kinds; 6 statuses**); channel retirement (**140 current; 79 cutover; 20 blocked; 0 dead**); docs drift passed. Final Tools, syntax, and full runtime gate results are recorded after the final continuation below.
- This closes the identified Actions import input persistence, restart replay, and queued cancellation cleanup slice only. Task 5 remains partial pending real native picker/dashboard observation, compatibility IPC retirement proof, conditional real Provider/account acceptance, and packaged/manual acceptance.

### Task 5 continuation evidence (2026-10-08, credential-backed Provider and Telegram checks)

- The Obsidian canonical test-API note supplied the configured OpenAI-compatible gateway target and test key. The follow-up run discovered 182 models and completed a `deepseek-v4-flash` chat request with HTTP 200. Image generation remained opt-in and was skipped. A separate `gpt-5.5` attempt reached the same gateway but received a sanitized HTTP 404 `Application not found`, so model selection remains tied to a currently routable model. Passing record: `docs/release-evidence/ai-provider-smoke/2026-10-08T21-20-30Z-deepseek-chat-check/README.md`; routing variation: `docs/release-evidence/ai-provider-smoke/2026-10-08T21-19-28Z-gpt55-routing-failure/README.md`.
- The canonical Telegram infrastructure note identifies the Bot API token as reserved for an existing long-poll deployment. One read-only `getMe` request returned HTTP 200 and confirmed bot identity. No polling, updates, webhook operation, command, or message send was performed; starting the OpenPet adapter with this token could conflict with the existing poller. Sanitized record: `docs/release-evidence/telegram-account-smoke/2026-10-08-read-only-token-check/README.md`. OpenPet real-account acceptance remains open.
- These checks validate credential metadata only and do not close the conditional demo acceptance items or broader Task 5 packaged/manual acceptance. No credentials or Telegram identifiers are stored in the repository evidence.

### Task 5 continuation evidence (2026-10-09, configured Provider retry and Telegram read-only recheck)

- Re-ran the configured Provider smoke without image generation. The gateway returned HTTP 200 for `/models`, reported 182 discovered models, and returned a short HTTP 200 chat response for `deepseek-v4-flash`. The companion `gpt-5.5` attempt returned a sanitized 404 routing response, which is retained as a model-routing variation rather than treated as credential failure. Evidence: `docs/release-evidence/ai-provider-smoke/2026-10-08T21-20-30Z-deepseek-chat-check/` and `docs/release-evidence/ai-provider-smoke/2026-10-08T21-19-28Z-gpt55-routing-failure/`.
- Re-ran Telegram `getMe` only. It returned HTTP 200 and a valid Bot API identity; no polling, `getUpdates`, webhook operation, command, or message send was attempted. The canonical infrastructure note still reserves this token for the HK Hermes long-poll deployment, so OpenPet account behavior remains unverified without a separate token or a coordinated maintenance window. Evidence: `docs/release-evidence/telegram-account-smoke/2026-10-08T21-21-00Z-read-only-token-check/`.
- This closes the configured development-gateway Provider smoke evidence for the demo. It does not close packaged Provider wiring, optional image generation, compatibility IPC retirement, or live Telegram account acceptance.

## Task 6: Delete Only After Reachability Proof

Inspect src/main/ipc.js, src/main/ipc/register-*-ipc.js, shared IPC constants, preload exports, demo-control-center-api.ts, package build files, tests, and dynamic channel strings.

- [x] Re-run `npm run check:channel-retirement`: current `dead=0`; no IPC channel is a deletion candidate.
- [x] Preserve Shell-only native picker and remaining migration channels because their callers, audit entries, tests, or packaging roles remain reachable. No files or compatibility wrappers were deleted.
Retirement rule for future proposals: when a channel or module is nominated for deletion, first prove full source, caller, preload, test, and packaging reachability; then run `check:node`, focused IPC tests, and `pack` whenever packaging changes.

Task 6 status: no candidate is safe to delete. `dead=0` is positive evidence that the current retirement ledger still assigns every channel a keep, cutover, or blocked role; it is not a request to force a deletion.

## Task 7: Live Documentation

Update the narrowest owner among AGENTS.md, README.md, live docs, docs/refactor/03-api-contract.md, docs/refactor/09-repo-state.md, and project-context.json. Keep historical phase/review files as audit records.

- [x] Capture exact gate counts before editing: 140 IPC, 117 registered REST routes, 119 documented rows, 21 SSE events, 8 topics, 17 Job kinds, 6 Job statuses. The older 108/112 values above remain labeled historical checkpoint.
- [x] Keep regression assertions for branch metadata, route count, target/blocked distinction, contract build prerequisite, and synthetic-vs-real evidence boundaries.
- [x] Run `npm run check:docs-drift` and the docs/script regression suites; current docs gates pass. On 2026-10-08, `npm run test:tools` passed **669/669**, including the live development-docs suite at **24/24**.

## Merge Acceptance Matrix

| Change | Required verification |
| --- | --- |
| Docs/contracts/tools | build:contracts; check:api-contract; check:channel-retirement; check:docs-drift; test:tools; git diff --check |
| Backend routes/Jobs | focused tests; test:backend; test:resilience; check:syntax; contract gates |
| Shell/bridge/lifecycle | focused tests; test:core; test:core:all; check:syntax |
| Control Center | focused tests; test:core; test:control-center; check:syntax |
| Release/provider/signing | pack/dist plus real signed/provider/manual evidence; synthetic rehearsal is not a substitute |

## Self-Review Checklist

- [x] Every changed method has a named caller and owner.
- [x] Every new route is in registry, contract/document, and focused tests; this patch adds no route.
- [x] Reviewed changed async paths for timeout, cancellation, cleanup, and terminal event behavior; remaining gaps are listed as partial/blocked domain rows above.
- [x] Settings and Job persistent writes have a single owner, version/state semantics, and rollback/recovery behavior covered by focused tests.
- [x] Secret paths remain Shell-owned and are not exposed to renderer, HTTP results, logs, evidence, or ordinary plugin bridges.
- [x] Current counts are recorded from fresh `build:contracts`, `check:api-contract`, and `check:channel-retirement` output; historical review values remain labeled as snapshots.
- [x] No deletion is proposed without import/call-site/test/build reachability proof; current retirement gate reports `dead=0`.

### 2026-10-08 Continuation Verification

- Installed Playwright Chromium 148.0.7778.96 (revision 1223) and its headless shell in the isolated `/tmp/openpet-playwright-20261008` cache. Browser verification used the repository-pinned version without changing the user's shared browser cache.
- Prior 2026-10-08 verification before the Actions import private-input follow-up: `npm test` **3213 passed, 1 skipped**; `npm run test:core` **2154 passed, 1 skipped**; `npm run test:control-center` **77/77**; `npm run test:backend` **387/387**; `npm run test:tools` **669/669**; `npm run test:resilience` **3/3**; contracts, API/channel-retirement, docs drift, and `git diff --check` passed. The fresh post-follow-up results are recorded in the continuation evidence below.
- Built the local unsigned macOS arm64 package with `CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack` so this demo verification incurs no signing/notarization work, then ran packaged runtime smoke. The report at `docs/release-evidence/packaged-runtime/2026-10-08T03-39-52-914Z-darwin-arm64/` passes **11/14**; native Plugin/Pet picker and invalid-package checks remain untested because those dialogs were not exercised.
- The configured Provider smoke now has a passing development-gateway record for model discovery and `deepseek-v4-flash` chat; image generation was skipped, and a separate `gpt-5.5` model-routing variation returned a sanitized 404. Telegram `getMe` returned HTTP 200, but the Bot Token remains reserved for an existing Hermes long-poll deployment; OpenPet polling was not started. Sanitized evidence is in the dated Provider and Telegram release-evidence directories.
- Task 4's Core and Control Center browser gates are verified. Task 5 remains partial: code paths have deterministic regression evidence, while desktop-native picker/dashboard observation, compatibility IPC retirement proof, packaged Provider wiring, optional image generation, and live Telegram account acceptance are not established. Public signed distribution remains deferred for the demo target.

### 2026-10-08 Post-Actions Verification

- Fresh `npm run test:backend` passes **395/395** after the Actions import persistence/recovery regressions were added. Focused repository/recovery/state-machine/dispatcher tests pass **43/43**.
- Actions private input review confirms the queue-terminal callback consumes and clears the in-memory selection on queued cancellation/expiry; the runner consumes private input before handler execution and forgets it after success, failure, running cancellation, and runner rejection. On restart, the redacted Job cannot be replayed; any Shell-side selection retained across a Sidecar restart is bounded by its existing 10-minute TTL.
- Fresh verification: Backend **395/395**; Core **2155 passed, 1 skipped** with the isolated Chromium cache; Control Center Playwright **77/77**; Tools **669/669**; Resilience **3/3**; `npm run check:syntax` (Node syntax, TypeScript, cursor helper, and Control Center production build); contracts/API (**140 IPC, 117/119 REST**); channel retirement (**140 current, 79 cutover, 20 blocked, 0 dead**); docs drift; and `git diff --check` pass. The Control Center build retains its existing non-failing >500 kB chunk advisory.
- The first post-change `npm test` run used Playwright's default cache and failed because its Chromium headless shell was installed only under `/tmp/openpet-playwright-20261008`. Added `npm run test:all`, which reads the pinned Chromium revision from Playwright's manifest and selects a cache containing both Chromium and its headless shell. Its focused resolver tests pass **2/2**, and the fresh full run passes **3224/3224 with 1 skipped**. This leaves the existing direct `npm test` command unchanged.
- The current unsigned packaged runtime report remains **11/14** with plugin/pet native picker and invalid-package checks pending because those UI dialogs were not exercised; this is an observed-evidence gap, not a code/test failure. Provider `/models` returned 401 and the Telegram Bot Token remains reserved for the Hermes poller. Task 5 therefore remains partial; paid signing is outside the demo target.

### 2026-10-09 Continuation Verification

- A real packaged Control Center refresh reproduced a lifecycle regression: the first load received the Shell `__openpetBackend` bootstrap, but a second `did-finish-load` reset the preload's in-memory Backend value and the panes showed `BACKEND_UNAVAILABLE` with empty plugin data even though the sidecar was healthy. The focused bootstrap regression first failed with one payload for two loads, then passed after `createOpenPetRuntime()` kept one persistent `did-finish-load` listener per Control Center `webContents` and read the current coordinator Backend for each load.
- Fresh focused verification: `node --test tests/main/bootstrap-openpet-runtime.test.js` passes **2/2**. `CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack` passes and rebuilds the unsigned macOS arm64 package; the existing Vite >500 kB chunk advisory remains non-failing.
- The rebuilt package was launched with `OPENPET_USER_DATA_DIR=/tmp/openpet-demo-picker-followup-20261009`. After a renderer refresh, Pet remained available, Plugins still showed **3 installed / 3 enabled**, Service still showed HTTP API off with port `0`, and the imported `Picker Smoke Pet` remained installed while `legacy-cat` stayed active. The app was then exited normally.
- The packaged native-picker evidence packet is `docs/release-evidence/desktop-picker/2026-10-08T21-01-48Z-darwin-arm64/`; it records **8/9** checks passing: launch, Control Center, plugin cancel, valid plugin review, invalid-package feedback, Actions frame-picker cancel, Pet Pack picker cancel, Pet Pack import, and post-refresh state. `plugin-install-disabled` remains pending because the reviewed plugin was not installed without separate confirmation.
- This closes the Control Center renderer-refresh bootstrap regression, adds fresh local demo picker evidence, and records a passing configured development-gateway Provider chat smoke. Task 5 remains partial: plugin installation acceptance, compatibility IPC retirement, packaged Provider wiring, optional image generation, wider packaged/manual acceptance, and live Telegram account smoke remain open. Signed macOS/Windows distribution remains deferred for the demo target.

### 2026-10-09 Continuation Verification (Agent Awareness rollout tail handling)

- A fresh real-Codex smoke surfaced 24 malformed records. A redacted local scan showed exactly one malformed line in each of the 24 scanned files; every offending line began at the fixed-size tail window boundary, and every window started inside a record rather than at a newline. The same files complete records are JSONL; the poller treated the leading window fragment as a malformed record.
- Added a regression that writes a record larger than the bounded tail window between valid session/turn records. It failed before the fix with one malformed record, then passed after readTailLines started at the window offset, checked the preceding byte, and discarded only the leading fragment when the offset was inside a line. The separate first-line read still preserves session metadata.
- The Codex rollout adapter also maps current nested event_msg.token_count.info.total_token_usage and token_usage_record shapes, while classifying current metadata and content-bearing records without retaining command output, assistant content, or local paths.
- Fresh verification: node --test tests/examples/agent-awareness-plugin.test.js passes 59/59. A new sanitized real-Codex smoke/archive at docs/release-evidence/agent-awareness-local-smoke/2026-10-08T22-40-35-815Z/ found 19 sessions and 515 events with malformedRecordCount = 0, unknownRecordCount = 0, and unsupportedLifecycleRecordCount = 0; all automated redaction checks pass. Native execution was not enabled and the plugin service was not started, so dashboard usefulness and pet speech/noise remain manual acceptance items.

### 2026-10-09 Continuation Verification (current unsigned packaged runtime)

- Rebuilt the current worktree with CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack; contract generation, native helper check, Control Center production build, and Electron packaging completed. Electron Builder skipped signing, and notarization was not attempted because no Apple credentials were configured.
- Launched the packaged macOS arm64 app through scripts/run-packaged-runtime-smoke.js with an isolated temporary user-data directory. The fresh report at docs/release-evidence/packaged-runtime/2026-10-08T22-46-00-691Z-darwin-arm64/ validates with 11/14 checks passing, 2 pending, 1 blocked, 0 failed. The captures use Electron BrowserWindow.capturePage, not full-desktop screenshots; app paths in the archived JSON were redacted.
- Remaining packaged gaps are the unlinked native picker checks and invalid-package feedback. The artifact is unsigned and is demo runtime evidence only; signed distribution remains deferred.

### 2026-10-09 Continuation Verification (documentation truth and gate refresh)

- `npm run test:tools` first reproduced one stale docs assertion: it required the live summaries to reference the 2026-06 packaged runtime archive and did not accept the current relative evidence link. Updated the packaged-runtime truth test to target the 2026-10-08 report, accept both supported relative path forms, and aligned the architecture/status summaries with the latest 11/14 runtime and 8/9 picker evidence. The focused regression now passes.
- Fresh gates pass: `npm run test:tools` **672/672**; `npm run test:backend` **397/397**; `npm run test:resilience` **3/3**; `npm run test:all` **3233 passed, 1 skipped**; test:core:all **2161 passed, 1 skipped**; `npm run build:contracts`; `npm run check:api-contract` (**140 IPC, 117/119 REST, 21 SSE, 8 topics, 17 Job kinds, 6 statuses**); `npm run check:channel-retirement` (**140 current, 79 cutover, 20 blocked, 0 dead**); `npm run check:docs-drift`; `npm run check:syntax`; and `git diff --check`. The Control Center build keeps its existing non-failing >500 kB chunk advisory.
- Core (**2161 passed, 1 skipped**) and Control Center Playwright (**77/77**) were last verified on 2026-10-08; this continuation changed documentation and its truth assertion only. The packaged runtime remains **11/14**, and the paired picker report remains **8/9** with `plugin-install-disabled` pending; no manual acceptance or release-readiness claim is added here.

### 2026-10-09 Continuation Verification (packaged-picker summary truth)

- The packaged runtime is now archived at `docs/release-evidence/packaged-runtime/2026-10-08T23-14-43-864Z-darwin-arm64/` with **14/14** passing checks. The paired picker report at `docs/release-evidence/desktop-picker/2026-10-08T21-01-48Z-darwin-arm64/` remains **8/9** because `plugin-install-disabled` has not been observed.
- A live-docs assertion found that `development-summary.md` named the 8/9 result without linking the picker report; docs drift also still expected the pre-observation “picker evidence needs real archived runs” wording. Updated the development and project-status summaries, the project-context fact, and the live-docs/drift assertions to carry the current paths and pending status.
- Fresh verification: live documentation suites **31/31**; docs-drift checker tests **38/38**; `npm run test:tools` **672/672**; `npm run check:docs-drift`; `git diff --check`; and focused packaged-runtime evidence tests **10/10** all pass.
- This closes documentation truth drift only. Picker installation remains pending until the install check is separately confirmed and observed; Agent Awareness desktop review, a distinct Telegram polling credential/window, optional billable image generation, and a compatible external plugin source remain conditional/manual or external gaps. Signed macOS/Windows distribution remains deferred for the demo target.

### 2026-10-09 Continuation (Pet Pack native picker HTTP handoff)

- Added a strict `pick` operation to the Pet Pack reverse contract. The Control Center now calls the existing `POST /pet-packs/validate` route; Backend sends an empty typed request over the reverse channel, and Shell owns the native file/directory picker and source inspection. Both the HTTP request and reverse call allow 180 seconds for the native interaction. Picker results omit the selected local path and preserve the opaque selection ID used by the import Job.
- The HTTP import route now accepts only `selectionId`; validation accepts only `pick` or `clear-selection`; export accepts an empty request and lets Shell open its picker. The old `pet-packs:inspect-directory` compatibility IPC remains registered pending reachability proof.
- At the time of this entry the source change had no fresh build or regression evidence; the follow-up verification below supersedes that status. Packaged/manual evidence for the new HTTP handoff, compatibility IPC retirement proof, and wider desktop acceptance remain open.

### 2026-10-09 Continuation Verification (Pet Pack picker and demo cursor fallback)

- Added reverse-channel and route coverage for the strict `pick` operation, including the 180-second Shell request timeout and rejection of renderer-supplied selection paths. Added Shell bridge tests for native picker cancellation and acceptance; the accepted result excludes both the selected source path and pack `rootPath`. Control Center coverage confirms its HTTP picker request sends only `{ operation: "pick" }` and does not retry.
- The first full Playwright run with the pinned Chromium cache exposed two existing cursor-picker failures. Both traced to the browser-only Vite Settings fallback returning `{ canceled: true }` after the cursor import caller moved to `settingsHttpApi.importCursor()`. Updated that demo adapter to return the existing `demo-cursor` fixture with the required `enabled` field; no packaged HTTP behavior changed. Both original failures then passed, and the fresh complete Playwright suite passes **77/77**.
- Fresh verification: Pet Pack route/reverse/Shell/Control Center focused suites **78/78**; `npm run test:all` **3244 passed, 1 skipped**; `npm run check:syntax` including typecheck and production build; API reconciliation (**140 IPC, 120/119 REST**); channel retirement (**140 current, 82 cutover, 18 blocked, 0 dead**); docs drift; and `git diff --check` all pass. The existing production bundle >500 kB advisory is non-failing.
- Task 5 remains **partial**. The 2026-10-09 packaged picker observation predates this HTTP picker cutover and remains **8/9**; a fresh unsigned package and packaged picker evidence are still needed. `plugin-install-disabled` remains pending until the observed app reports the reviewed fixture installed and disabled and both its SQLite enablement state and package inventory are captured. Signed distribution, live Telegram polling, provider image generation, and external compatible plugin intake remain outside current locally verified completion for the reasons recorded in TODO.

### 2026-10-09 Continuation (code-only packaged runtime and HTTP picker smoke)

- At the user's request, no more desktop UI interaction was performed. The test OpenPet processes were confirmed stopped before continuing.
- Ran the fresh unsigned package at `/tmp/openpet-package-fresh-20261009/mac-arm64/OpenPet.app` through `scripts/run-packaged-runtime-smoke.js` with isolated user data under `/tmp/openpet-runtime-http-picker-20261009`. The new archived report at `docs/release-evidence/packaged-runtime/2026-10-09T02-18-20-646Z-darwin-arm64/` validates with **11/14** checks: launch, visible pet window, transparency, sprite/action playback, Bubble Chat, all four built-in packs, and stable final state pass. Plugin/Pet picker links remain pending and invalid-package feedback remains blocked because the available paired picker report predates this HTTP cutover. The earlier 2026-10-08 **14/14** report is retained as historical evidence for its earlier build.
- Added a real Backend child-process integration regression in `tests/backend/runtime-bindings.test.js`: HTTP pick requests travel over the Sidecar reverse channel to the Shell handler and back; accept returns an opaque selection without a path, cancel returns `{ canceled: true }`, and renderer-supplied path injection is rejected before dispatch. The focused Pet Pack/reverse/Shell/Control Center suite passes **92/92**.
- Archived the two Electron `BrowserWindow.capturePage()` screenshots and sanitized the evidence JSON so it contains no machine username or temporary absolute paths. The archived smoke report passes structural validation with pending checks allowed and explicitly remains unsigned demo evidence.
- Remaining TODO items still needing outside/code-independent conditions: the user declined work-machine UI acceptance; target-OS runtime/install evidence requires the corresponding platform; image generation can incur provider charges; the Telegram Bot Token is already held by the running Hermes poller; native Agent Awareness UX requires desktop approval; and no compatible external plugin package source is known. Paid signing and notarization are out of scope under the self-managed-signing policy.

### 2026-10-09 Continuation Verification (documentation assertion and code-only gates)

- `npm run test:all` initially found one stale maintainer-summary assertion: it required the historical packaged-runtime `14/14` count even though the current report is `11/14`. Updated the assertion to require the current count and preserve the `8/9` picker plus pending `plugin-install-disabled` facts. The focused docs file passes **3/3**; the fresh full Node run passes **3245 passed, 0 failed, 1 skipped**.
- Fresh code-only gates: `npm run test:tools` **672/672**; Core non-browser Node suites **2139 passed, 0 failed, 1 skipped**; `npm run check:syntax` (Node syntax, TypeScript, cursor helper, Control Center production build); `npm run build:contracts`; `npm run check:api-contract` (**140 IPC, 120 registered / 119 documented REST rows**); `npm run check:channel-retirement` (**140 current, 82 cutover, 18 blocked, 0 dead**); `npm run check:docs-drift`; and `git diff --check` all pass. Vite reports the existing non-failing >500 kB chunk advisory.
- A direct full `npm run test:core` attempt reaches 2140 tests but 26 browser tests fail to launch because the configured Playwright Chromium headless-shell executable is absent. The missing browser was not installed, and no desktop UI acceptance was performed. No OpenPet test process remains running.
- No further code-only TODO was safe to close: packaged native-picker observation, Agent Awareness desktop acceptance, self-signed distribution pipeline adaptation and target-OS smoke, live Telegram account use, billable image generation, and an external compatible plugin source require platform/human/credential/provider/external inputs. Paid signing and notarization are not planned. Task 6 still reports `dead=0`, so no compatibility IPC is a proven deletion candidate.
