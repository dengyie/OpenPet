# 15 · IPC 通道退役台账

> v1.0 · 2026-09-04 · T40 · 以 `src/shared/ipc-channels.ts` 为当前清单

本台账登记当前 154 个 IPC 常量的去向。`keep` 是 02 篇允许长期存在的窗口/原生边界；`cutover:<domain>` 表示 03 篇已有 HTTP/SSE 对等入口；`blocked:Txx` 表示等待指定任务卡完成后再切换；`retired` 表示已从当前清单删除并保留历史记录；`dead` 仅用于确认没有生产调用方的遗留常量。

当前台账由 146 个 `ipcMainService.handle/on` 注册和 8 个事件-only 通道组成。Source 列是实际生产引用文件，不是推测路径；门禁会逐项检查 TS/JS 清单、注册/事件来源、重复项和未知 `IPC.*` 引用。

T40 卡面与 T39 后的 03 篇有一处数字演进：T40 的硬上限仍为 `keep ≤ 41`，因此新增的 QQ/WeCom 四个 host-secret 通道登记为 `blocked:T44`，而不是伪装成长期 keep。T41 及后续任务可把已删除常量保留为 `retired` 历史行，并在 Retired by 列记录提交 SHA；历史行不计入当前通道对账或 keep 上限。

## Summary

| Scope | Count |
| --- | ---: |
| Current IPC constants | 154 |
| Current direct registrations | 146 |
| Current event-only channels | 8 |
| Current keep | 41 |
| Current cutover | 43 |
| Current blocked | 72 |
| Current dead | 0 |
| Historical retired | 4 |

## Ledger

| IPC channel | Status | HTTP route / blocker | Source | Reason | Retired by |
| --- | --- | --- | --- | --- | --- |
| `pet:get-animations` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-pet-runtime-ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet:animations-changed` | `keep` | `IPC-only (native/window)` | `preload.js` | Window/native IPC remains the intended boundary | — |
| `pet:get-bounds` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-pet-runtime-ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet:get-movement-state` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-pet-runtime-ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet:set-viewport` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-pet-runtime-ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet:set-position` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-pet-runtime-ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet:set-mouse-passthrough` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-pet-runtime-ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet:request-focus-for-cursor` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-pet-runtime-ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet:record-app-log` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-pet-runtime-ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet:drag-ended` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-pet-runtime-ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet:move-by` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-pet-runtime-ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet:say` | `keep` | `IPC-only (native/window)` | `preload.js` | Window/native IPC remains the intended boundary | — |
| `pet:play-action` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-pet-runtime-ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet:show-context-menu` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-pet-runtime-ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet:menu-command` | `keep` | `IPC-only (native/window)` | `preload.js` | Window/native IPC remains the intended boundary | — |
| `pet:quit` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-system-ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-chat:open` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-chat:get-state` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-chat:hide` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-chat:set-always-on-top` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-chat:open-settings` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-chat:send-message` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-chat:cancel-message` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-chat:state-changed` | `keep` | `IPC-only (native/window)` | `src/main/pet-chat-preload.js` | Window/native IPC remains the intended boundary | — |
| `pet-bubble-chat:get-state` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-bubble-chat:open` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-bubble-chat:show-message` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-bubble-chat:hide` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-bubble-chat:set-pinned` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-bubble-chat:set-interacting` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-bubble-chat:set-hit-test-mode` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-bubble-chat:drag-to` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-bubble-chat:send-message` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-bubble-chat:cancel-message` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-bubble-chat:state-changed` | `keep` | `IPC-only (native/window)` | `src/main/pet-bubble-chat-preload.js` | Window/native IPC remains the intended boundary | — |
| `settings:open` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-system-ipc.js` | Window/native IPC remains the intended boundary | — |
| `settings:get` | `retired` | `GET /settings` | `src/main/ipc/register-settings-ipc.js` | Control Center reads the versioned, redacted Backend envelope through HTTP | 13a419a66eb2b42781fc2a79d193499fc6b99916 |
| `settings:save` | `retired` | `PATCH /settings` | `src/main/ipc/register-settings-ipc.js` | Control Center writes canonical point-path patches through Backend optimistic locking; trusted Shell effects are applied from Backend snapshots | 13a419a66eb2b42781fc2a79d193499fc6b99916 |
| `settings:import-cursor` | `blocked:T41` | `POST /settings/cursor/import` — unavailable fallback | `src/main/ipc/register-settings-ipc.js` | Route registration receives no handler from the backend composition root, so it returns `BACKEND_UNAVAILABLE`; T41 must bridge the host dialog and cursor importer | — |
| `settings:preview-scale` | `blocked:T41` | `POST /settings/preview-scale` — unavailable fallback | `src/main/ipc/register-settings-ipc.js` | Route registration receives no handler from the backend composition root, so it returns `BACKEND_UNAVAILABLE`; T41 must bridge the host preview side effect | — |
| `settings:close` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-settings-ipc.js` | Window/native IPC remains the intended boundary | — |
| `settings:changed` | `blocked:T41` | `SSE settings.changed` — renderer/bootstrap parity pending | `control-center-preload.js` | SSE only publishes changed paths and version after backend PATCH; IPC still synchronizes pet-renderer settings and multiplexes backend bootstrap updates, which T41 must replace before retirement | — |
| `actions:get` | `cutover:actions` | `GET /actions` | `src/main/ipc.js` | Existing backend route is the migration target | — |
| `actions:inspect-frames` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `actions:reinspect-frames` | `cutover:actions` | `POST /actions/frames/reinspect` | `src/main/ipc.js` | Existing backend route is the migration target | — |
| `actions:clear-frame-selection` | `cutover:actions` | `DELETE /actions/frames/selection` | `src/main/ipc.js` | Existing backend route is the migration target | — |
| `actions:import-frames` | `cutover:actions` | `POST /actions/frames/import` | `src/main/ipc.js` | Existing backend route is the migration target | — |
| `actions:save-config` | `cutover:actions` | `PUT /actions/config` | `src/main/ipc.js` | Existing backend route is the migration target | — |
| `actions:preview-trigger-proposal` | `cutover:actions` | `POST /actions/triggers/preview` | `src/main/ipc.js` | Existing backend route is the migration target | — |
| `actions:submit-trigger-proposal` | `cutover:actions` | `POST /actions/triggers/proposals` | `src/main/ipc.js` | Existing backend route is the migration target | — |
| `actions:accept-trigger-proposal` | `cutover:actions` | `POST /actions/triggers/proposals/:id/accept` | `src/main/ipc.js` | Existing backend route is the migration target | — |
| `actions:reject-trigger-proposal` | `cutover:actions` | `POST /actions/triggers/proposals/:id/reject` | `src/main/ipc.js` | Existing backend route is the migration target | — |
| `actions:update-trigger-rule` | `cutover:actions` | `PATCH /actions/triggers/rules/:id` | `src/main/ipc.js` | Existing backend route is the migration target | — |
| `actions:delete-trigger-rule` | `cutover:actions` | `DELETE /actions/triggers/rules/:id` | `src/main/ipc.js` | Existing backend route is the migration target | — |
| `actions:delete` | `cutover:actions` | `DELETE /actions/:id` | `src/main/ipc.js` | Existing backend route is the migration target | — |
| `pet-packs:list` | `blocked:T42` | `GET /pet-packs` — sidecar-only snapshot | `src/main/ipc.js` | Backend owns a process-local `activePackId` and omits the Shell `PetPackService` root path, provenance, package, action, validity, and block metadata; no existing Shell snapshot bridge provides parity | — |
| `pet-packs:inspect-directory` | `keep` | `IPC-only (native/window)` | `src/main/ipc.js` | Window/native IPC remains the intended boundary | — |
| `pet-packs:clear-selection` | `blocked:T42` | `POST /pet-packs/validate` — no selection-clear peer | `src/main/ipc.js` | Validation accepts a filesystem path but cannot clear the Shell `PetPackService` pending selection handle | — |
| `pet-packs:import` | `blocked:T42` | `POST /pet-packs/import` — asynchronous ZIP-only sidecar job | `src/main/ipc.js` | Shell IPC consumes a pending directory or ZIP selection synchronously and can activate the pack, reload animations, and refresh chat; Backend accepts a ZIP path and returns a Job submission | — |
| `pet-packs:export` | `blocked:T42` | `POST /pet-packs/:id/export` — asynchronous sidecar job | `src/main/ipc.js` | Shell IPC owns the native output picker and returns completed archive metadata; Backend returns a Job submission against separate sidecar state | — |
| `pet-packs:set-active` | `blocked:T42` | `POST /pet-packs/:id/activate` — sidecar-only activation | `src/main/ipc.js` | Backend mutates only its process-local active id and does not update Shell settings, `PetPackService`, animations, trigger rules, or AI/chat context | — |
| `pet-packs:active-changed` | `blocked:T42` | `SSE pet.pack-activated` — not emitted by Shell activation | `control-center-preload.js` | The SSE event covers only Backend-side activation and lacks the Shell mutation payload and runtime refresh effects | — |
| `pet-packs:remove` | `blocked:T42` | `DELETE /pet-packs/:id` — sidecar-only mutation | `src/main/ipc.js` | Backend removes from separate sidecar state without reconciling Shell settings, active-pack safeguards, animations, or chat context | — |
| `control-center:active-pet-pack-changed` | `blocked:T42` | `SSE pet.pack-activated` — no Shell event parity | `control-center-preload.js` | The retained Shell event carries refreshed Pet Pack and chat state; Backend SSE is not emitted for the Shell path and does not carry that payload | — |
| `ai:get-config` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:save-config` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:save-api-key` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:save-vision-api-key` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:clear-vision-api-key` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:test-connection` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:discover-models` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:discover-vision-models` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:get-persona-profile` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:generate-persona-draft` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:save-persona-override` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:get-memory-profile` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:delete-memory` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:clear-pet-pack-memories` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai-talk:get-trace-summary` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai-talk:export-trace` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `hatch-pet-agent:get-config` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `hatch-pet-agent:save-config` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `hatch-pet-agent:save-api-key` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `hatch-pet-agent:clear-api-key` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `hatch-pet-agent:check-capability` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `hatch-pet-agent:get-run-status` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `image-generation:get-config` | `blocked:T46` | `Backend image-generation Job not landed` | `src/main/ipc/register-ai-ipc.js` | Image generation waits for T46 Job handler | — |
| `image-generation:save-config` | `blocked:T46` | `Backend image-generation Job not landed` | `src/main/ipc/register-ai-ipc.js` | Image generation waits for T46 Job handler | — |
| `image-generation:save-api-key` | `blocked:T46` | `Backend image-generation Job not landed` | `src/main/ipc/register-ai-ipc.js` | Image generation waits for T46 Job handler | — |
| `image-generation:clear-api-key` | `blocked:T46` | `Backend image-generation Job not landed` | `src/main/ipc/register-ai-ipc.js` | Image generation waits for T46 Job handler | — |
| `image-generation:check-health` | `blocked:T46` | `Backend image-generation Job not landed` | `src/main/ipc/register-ai-ipc.js` | Image generation waits for T46 Job handler | — |
| `image-generation:discover-models` | `blocked:T46` | `Backend image-generation Job not landed` | `src/main/ipc/register-ai-ipc.js` | Image generation waits for T46 Job handler | — |
| `ai:get-conversation` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:chat` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai:export-trace-diagnostics` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai-behavior:get` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai-behavior:save` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai-behavior:dry-run` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai-behavior:replay-decision` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai-behavior:export-diagnostics` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `ai-behavior:clear-decisions` | `blocked:T47` | `Backend AI domain not landed` | `src/main/ipc/register-ai-ipc.js` | AI domain waits for T47 migration | — |
| `plugins:list` | `cutover:plugins` | `GET /plugins` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:set-enabled` | `cutover:plugins` | `POST /plugins/:id/enable` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:set-native-execution-approved` | `cutover:plugins` | `POST /plugins/:id/native-approval` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:save-config` | `cutover:plugins` | `PUT /plugins/:id/config` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:im-gateway:get-secret-state` | `cutover:plugins` | `GET /plugins/:id/config?operation=secret-state` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:im-gateway:save-telegram-token` | `cutover:plugins` | `PUT /plugins/:id/config?operation=secret-save` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:im-gateway:clear-telegram-token` | `cutover:plugins` | `PUT /plugins/:id/config?operation=secret-clear` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:im-gateway:save-qq-credentials` | `blocked:T44` | `Backend secrets boundary not landed` | `src/main/ipc/register-plugin-ipc.js` | Host-secret channel waits for T44 secrets boundary | — |
| `plugins:im-gateway:clear-qq-credentials` | `blocked:T44` | `Backend secrets boundary not landed` | `src/main/ipc/register-plugin-ipc.js` | Host-secret channel waits for T44 secrets boundary | — |
| `plugins:im-gateway:save-wecom-credentials` | `blocked:T44` | `Backend secrets boundary not landed` | `src/main/ipc/register-plugin-ipc.js` | Host-secret channel waits for T44 secrets boundary | — |
| `plugins:im-gateway:clear-wecom-credentials` | `blocked:T44` | `Backend secrets boundary not landed` | `src/main/ipc/register-plugin-ipc.js` | Host-secret channel waits for T44 secrets boundary | — |
| `plugins:run-creator-studio-default-flow` | `cutover:plugins` | `POST /plugins/:id/commands/:cmd?operation=creator-default-flow` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:run-command` | `cutover:plugins` | `POST /plugins/:id/commands/:cmd` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:run-setup` | `cutover:plugins` | `POST /plugins/:id/commands/:cmd?operation=setup` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:open-dashboard` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-plugin-ipc.js` | Window/native IPC remains the intended boundary | — |
| `plugins:start-service` | `cutover:plugins` | `POST /plugins/:id/start` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:stop-service` | `cutover:plugins` | `POST /plugins/:id/stop` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:check-service-health` | `cutover:plugins` | `POST /plugins/:id/start?operation=health` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:save-service-health-policy` | `cutover:plugins` | `PUT /plugins/:id/config?operation=health-policy` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:inspect-package` | `keep` | `IPC-only (native/window)` | `src/main/ipc/register-plugin-ipc.js` | Window/native IPC remains the intended boundary | — |
| `plugins:inspect-github-repository` | `cutover:plugins` | `POST /plugins/validate` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:clear-selection` | `cutover:plugins` | `POST /plugins/install?operation=clear-selection` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:install` | `cutover:plugins` | `POST /plugins/install` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:update` | `cutover:plugins` | `POST /plugins/install (update)` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:uninstall` | `cutover:plugins` | `DELETE /plugins/:id` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:get-logs` | `cutover:plugins` | `GET /plugins/:id/logs` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:export-logs` | `cutover:plugins` | `GET /plugins/:id/logs?operation=export` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:clear-logs` | `cutover:plugins` | `DELETE /plugins/:id/logs` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `plugins:clear-storage` | `cutover:plugins` | `POST /plugins/:id/enable?operation=storage-clear` | `src/main/ipc/register-plugin-ipc.js` | Existing backend route is the migration target | — |
| `creator:get-state` | `blocked:T48` | `Backend Creator domain not landed` | `src/main/ipc/register-creator-ipc.js` | Creator Studio waits for T48 migration | — |
| `creator:pick-reference-image` | `blocked:T48` | `Backend Creator domain not landed` | `src/main/ipc/register-creator-ipc.js` | Creator Studio waits for T48 migration | — |
| `creator:bind-reference` | `blocked:T48` | `Backend Creator domain not landed` | `src/main/ipc/register-creator-ipc.js` | Creator Studio waits for T48 migration | — |
| `creator:generate-new-character` | `blocked:T48` | `Backend Creator domain not landed` | `src/main/ipc/register-creator-ipc.js` | Creator Studio waits for T48 migration | — |
| `creator:generate-existing-action` | `blocked:T48` | `Backend Creator domain not landed` | `src/main/ipc/register-creator-ipc.js` | Creator Studio waits for T48 migration | — |
| `creator:retry-action` | `blocked:T48` | `Backend Creator domain not landed` | `src/main/ipc/register-creator-ipc.js` | Creator Studio waits for T48 migration | — |
| `creator:retry-identity` | `blocked:T48` | `Backend Creator domain not landed` | `src/main/ipc/register-creator-ipc.js` | Creator Studio waits for T48 migration | — |
| `creator:accept-identity` | `blocked:T48` | `Backend Creator domain not landed` | `src/main/ipc/register-creator-ipc.js` | Creator Studio waits for T48 migration | — |
| `creator:accept-action-candidate` | `blocked:T48` | `Backend Creator domain not landed` | `src/main/ipc/register-creator-ipc.js` | Creator Studio waits for T48 migration | — |
| `creator:export-recovery-bundle` | `blocked:T48` | `Backend Creator domain not landed` | `src/main/ipc/register-creator-ipc.js` | Creator Studio waits for T48 migration | — |
| `creator:import-available-actions` | `blocked:T48` | `Backend Creator domain not landed` | `src/main/ipc/register-creator-ipc.js` | Creator Studio waits for T48 migration | — |
| `creator:get-last-run` | `blocked:T48` | `Backend Creator domain not landed` | `src/main/ipc/register-creator-ipc.js` | Creator Studio waits for T48 migration | — |
| `creator:get-asset-preview` | `blocked:T48` | `Backend Creator domain not landed` | `src/main/ipc/register-creator-ipc.js` | Creator Studio waits for T48 migration | — |
| `service:get-status` | `cutover:service` | `GET /service/status` | `src/main/ipc/register-service-ipc.js` | Existing backend route is the migration target | — |
| `service:save-config` | `cutover:service` | `PUT /service/config` | `src/main/ipc/register-service-ipc.js` | Existing backend route is the migration target | — |
| `service:get-logs` | `cutover:service` | `GET /service/logs` | `src/main/ipc/register-service-ipc.js` | Existing backend route is the migration target | — |
| `service:export-logs` | `cutover:service` | `GET /service/logs?operation=export` | `src/main/ipc/register-service-ipc.js` | Existing backend route is the migration target | — |
| `service:clear-logs` | `cutover:service` | `DELETE /service/logs` | `src/main/ipc/register-service-ipc.js` | Existing backend route is the migration target | — |
| `service:rotate-token` | `cutover:service` | `POST /service/token/rotate` | `src/main/ipc/register-service-ipc.js` | Existing backend route is the migration target | — |
| `service:revoke-mcp-sessions` | `blocked:T45` | `Backend route not implemented: POST /service/token/revoke-sessions` | `src/main/ipc/register-service-ipc.js` | Waiting for T45 MCP sidecar migration; current backend route registry has no MCP session revoke endpoint | — |
| `about:get-info` | `retired` | `GET /about` | `src/main/ipc.js` | Control Center reads the host About view through Backend HTTP | 413c5825 |
| `about:check-updates` | `retired` | `POST /about/check-updates` | `src/main/ipc.js` | Control Center queues the existing update-check Job and follows its result through Backend Job/SSE APIs | 413c5825 |
| `catalog:get` | `cutover:catalog` | `GET /catalog` | `src/main/ipc/register-catalog-ipc.js` | Existing backend route is the migration target | — |
| `catalog:prepare-install` | `blocked:T42` | `Backend route not implemented: POST /catalog/prepare` | `src/main/ipc/register-catalog-ipc.js` | Current backend route registry has no prepare endpoint; report discrepancy before cutover | — |
| `catalog:install-selection` | `cutover:catalog` | `POST /catalog/install` | `src/main/ipc/register-catalog-ipc.js` | Existing backend route is the migration target | — |
| `catalog:clear-selection` | `blocked:T42` | `Backend route not implemented: POST /catalog/clear-selection` | `src/main/ipc/register-catalog-ipc.js` | Current backend route registry has no clear-selection endpoint; report discrepancy before cutover | — |
| `catalog:add-blocklist` | `blocked:T42` | `Backend route not implemented: POST /catalog/blocklist` | `src/main/ipc/register-catalog-ipc.js` | Current backend route registry has no blocklist endpoint; report discrepancy before cutover | — |
| `catalog:remove-blocklist` | `blocked:T42` | `Backend route not implemented: DELETE /catalog/blocklist/:id` | `src/main/ipc/register-catalog-ipc.js` | Current backend route registry has no blocklist endpoint; report discrepancy before cutover | — |

## Operating rules

- `npm run check:channel-retirement` 对当前 active 行与 TS 清单逐项对账；active 必须精确覆盖当前常量，历史 `retired` 行可以不再存在于当前源。
- 当前通道上限为 156，后续提交只能减少 active 数量；新增 IPC 常量必须先更新本台账和 T40 依据。
- `retired` 行必须保留原 channel、真实历史 source、删除提交的完整或短 SHA（至少 7 位）；它不计入 current、keep、cutover、blocked、dead 计数。
- `keep` 上限是 41。四个 QQ/WeCom host-secret 通道等待 T44 的 secrets 边界，不能借 `keep` 绕过上限。
- `cutover` 行在同一切换提交中完成 HTTP/SSE 接入、旧 IPC 删除和台账状态更新；不得先并行双写再补删除。

Refs #41
