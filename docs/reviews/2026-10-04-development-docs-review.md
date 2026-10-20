# Review Summary

- 审查范围：基线 HEAD `4b6a1ac2` 加上当前隔离分支工作树中的未提交实现、测试和文档修改；未把主工作树或历史 phase 文档的差异混入本次结论。

- 是否建议合并：**本次隔离分支的文档、契约门禁和已验证运行时修复可以进入评审；在完整生产门禁完成前仍不应宣称生产就绪。** 本次同时落地了 `createSettingsPersistenceQueue()`、Job cancellation/recovery、plugin production reverse-channel 接线，以及 `POST /service/token/revoke-sessions` 的契约闭环。
- 整体风险：**中等**。主要残余风险来自迁移状态被误读：Shell 仍在 `src/main/` 持有窗口、原生能力和部分服务，Backend 在 `services/backend/` 只覆盖已注册域；把目标路由或历史任务卡当成交付能力会导致错误实现和错误发布判断。Settings deferred replay、Job 取消/恢复、反向通道严格校验已有 focused 回归，完整 core/打包/provider 证据仍需独立验证。
- 最重要的 3 个问题：
  1. Backend Domains/UI 阶段仍未完成全量 route → domain → side-effect 对账；Actions vertical slice 已闭合，但其它域仍不能被当作已交付能力。
  2. `AGENTS.md`、README 和开发摘要虽然已补充 Shell/sidecar/backend/contracts 主链，但 `src/main/` 仍是活跃迁移边界，继续扩展时仍有跨层耦合风险。
  3. `src/main/settings-persistence-queue.js` 的 ready 直写路径曾绕过统一 FIFO，sidecar 在第一笔写入期间退出时，后续设置可能越过失败队头；现已统一进入 `flush()` 并补充并发失败回归。`apps/desktop/src/sidecar/spawn.js` 另补了 init callback 晚到时的 settled guard，避免 ready 后误杀。
- 其他高风险文档问题：`docs/refactor/00-START-HERE.md` 把历史任务卡和“设计冻结/三条门禁”写成当前执行规则，且没有提示 `build:contracts` 是 API 合同门禁的前置条件；现已降级历史入口并补齐门禁顺序。当前文档真值测试为 22/22，Catalog focused 为 6/6，`check:docs-drift` 与 `check:api-contract` 均通过。
- 结构与架构评价：当前代码已经形成 `main.js → createOpenPetRuntime() → createSidecarRuntimeCoordinator() → spawnSidecar() → services/backend/index.js` 的 Shell/sidecar 分层，但 `src/main/` 仍是活跃边界，不能在文档中宣称已完成 monorepo 迁移。Backend 的 `index.js` 仍是组合根，route registry 是已实现路由的执行登记表；设置写入责任已收敛到 `createSettingsStore.patch()`，Shell 侧只负责 host effect 和队列调度。
- 扩展性评价：`packages/contracts`、Backend route/domain/job 分层和 Shell bridge 为继续迁移提供了稳定接缝；扩展新域时必须同时更新 route module、`routes/registry.js`、03 篇对应实现/目标标记、契约和测试，不能只新增目标表行。
- 测试评价：当前合同门禁和文档漂移门禁可执行；本轮 Actions vertical slice 聚焦测试为 38/38，`build:contracts` 与 `typecheck` 通过。此前新鲜验证显示 `check:api-contract`、`check:channel-retirement`、`check:docs-drift`、`check:syntax`、Control Center build、完整 Backend 套件（284/284）、Catalog/runner/runtime focused（69/69）、resilience（3/3）、tools（665/665）和文档 focused tests（22/22）通过。纯 Node `test:core` 为 2086/2113，另有 1 skip；完整 `npm test` 为 3038/3065，26 个失败均为本机缺少 Playwright Chromium 的 browser specs。此前完整 Backend 的 `kill ESRCH` 竞态已在 `signalServiceProcessTree()` 统一忽略，并保留“无 PID 实际发送时返回 false”的 child-kill fallback 语义。真实 provider、打包和签名仍是独立的生产门禁，不能据此宣称生产就绪。
- 是否存在应删除的废弃或重复内容：**没有能够在当前 HEAD 确认可安全删除的文件。** `src/main/`、旧任务卡和历史快照仍有调用方、迁移上下文或审计价值；本次用状态标记降级，不删除。

# Findings

## [P1] API 契约把目标能力当成当前实现（已修复）

- 文件与位置：[`docs/refactor/03-api-contract.md`](../refactor/03-api-contract.md) §4、§4.11；`services/backend/routes/registry.js`；`scripts/check-api-contract.mjs`。
- 所属维度：正确性、架构、兼容性、测试。
- 问题：§4 的表格同时列出已注册、目标和 blocked 路由。修复前 `POST /service/token/revoke-sessions` 已存在于 handler、registry 和 Shell caller，却被 API 文档漏列，并由 checker 的 `TRANSITIONAL_ROUTES` 白名单掩盖；同时旧文字声称 registry 有 74 条。当前真实输出是 `实际路由、注册表与 §4 精确对账(76/103 行)`。
- 触发条件：开发者按 §4 直接实现或调用一个没有进入 registry 的目标路由，或根据旧 74 条数字编写路由数量断言。
- 实际影响：前端可能依赖只抛 `BACKEND_UNAVAILABLE` 的 handler；迁移者可能过早删除保留 IPC；发布评估会高估 HTTP 覆盖率。
- 根本原因：设计表、当前登记表和迁移台账没有在文档结构上分层，过渡白名单绕过了 route/document 对账。
- 最小修改方案：已将 revoke route 加入 §4，台账改为 `cutover:service`，移除 checker 白名单和无用退役文档依赖，并让缺少任一已实现路由文档行的 fixture 直接失败。
- 需要补充的测试：已通过 `npm run build:contracts && npm run check:api-contract`、`npm run check:channel-retirement`、`tests/scripts/check-api-contract.test.js` 和 `tests/backend/mcp-sidecar.test.js`。
- 是否阻塞合并：**否；当前实现和契约已闭环。**

## [P1] 架构入口遗漏 sidecar/backend/contracts，导致错误依赖方向

- 文件与位置：[`AGENTS.md`](../../AGENTS.md)；[`README.md`](../../README.md)；[`docs/development-workflow.md`](../development-workflow.md)；[`docs/development-summary.md`](../development-summary.md)。
- 所属维度：架构、可维护性、扩展性。
- 问题：旧描述只把 `src/main/services/` 作为 operating core，没有说明 `apps/desktop/src/sidecar/runtime-coordinator.js`、`spawn.js`、`services/backend/index.js` 和 `packages/contracts` 的职责。
- 触发条件：新开发者把 AI、Job、插件或设置业务继续放进 Shell，或在 Control Center 中复制 Backend 业务逻辑。
- 实际影响：主进程负载继续膨胀，跨进程契约被绕过，出现第二个状态源或 renderer 直连基础设施。
- 根本原因：monorepo 目录已先于根开发入口文档完成迁移，文档没有反映真实调用链。
- 最小修改方案：在开发入口明确 Shell/sidecar/backend/contracts 分层；注明当前 Control Center 仍在 `src/control-center/`，不存在 `apps/control-center/`；保留 `src/main/` 为活跃迁移区域。
- 需要补充的测试：文档回归测试检查关键路径和调用链文字；`npm run check:syntax`、`npm run test:core` 验证文档所指入口仍存在。
- 是否阻塞合并：**阻塞新增跨层功能；不阻塞本次文档修订合并。**

## [P1] 重构入口把历史任务卡当成当前唯一开发流程

- 文件与位置：[`docs/refactor/00-START-HERE.md`](../refactor/00-START-HERE.md)、[`docs/refactor/README.md`](../refactor/README.md)。
- 所属维度：正确性、可维护性、项目治理。
- 问题：旧入口写“设计已经冻结”“后三条全绿才能开 PR”，并称 `check:api-contract` 仍有可忽略的 todo；当前脚本已经是 10 项硬对账，且 API 检查依赖先构建 workspace contract。
- 触发条件：agent 从 `00-START-HERE` 开始工作，却跳过 live docs、TODO/HANDOFF 或未运行 `build:contracts`。
- 实际影响：执行过期 T01–T33 任务卡，误判门禁状态，或把依赖缺失误报为 API 路由缺失。
- 根本原因：历史迁移文档没有被降级为“执行参考/历史上下文”。
- 最小修改方案：入口先指向 `development-workflow.md`、`HANDOFF.md`、`TODO.md`；把任务卡标为迁移执行参考；门禁顺序加入 `build:contracts`、`check:channel-retirement`、`check:docs-drift`。
- 需要补充的测试：文档测试断言入口含历史状态、contracts build 前置条件、76/103 路由和 live docs 链接。
- 是否阻塞合并：**不阻塞本次文档修订；阻塞按旧入口执行迁移任务。**

## [P2] 仓库快照与 Backend README 的实现数字过期

- 文件与位置：[`docs/refactor/09-repo-state.md`](../refactor/09-repo-state.md) §1/§3/§4/§6；[`services/backend/README.md`](../../services/backend/README.md)。
- 所属维度：正确性、可维护性、测试。
- 问题：快照和 README 曾分别写 74、68 条路由，并把旧 commit 证据当作当前事实；当前 HEAD 的执行对账结果是 76 条已注册路由，文档展开 103 行。
- 触发条件：维护者根据 README 估算覆盖率、创建 route count 测试或判断迁移是否完成。
- 实际影响：错误的回归基线和错误的发布报告，尤其会掩盖目标/blocked 路由未实现。
- 根本原因：数字没有绑定到可执行门禁输出。
- 最小修改方案：更新当前快照为 HEAD 和门禁输出，旧数字只留在变更记录并标为历史。
- 需要补充的测试：`npm run check:api-contract`；文档测试检查当前数字和历史快照标识。
- 是否阻塞合并：不阻塞本次文档修订。

## [P2] Catalog 安装的跨层调用链在开发计划中不完整（已修复）

- 文件与位置：`docs/superpowers/plans/2026-10-04-openpet-development-plan.md` Task 5；实际实现为 `services/backend/routes/catalog.js:registerCatalogRoutes`、`services/backend/index.js:createRunner`、`services/backend/domains/catalog.js:createCatalogService`、`apps/desktop/src/sidecar/message-handler.js:createMessageHandler`、`src/main/bootstrap/create-openpet-runtime.js:onCatalogRequest`、`src/main/catalog-sidecar-bridge.js:createCatalogSidecarBridge`、`src/control-center/src/hooks/useCatalogPane`。
- 所属维度：正确性、架构、可维护性、测试。
- 问题：计划原先只写“Catalog installs use Jobs”，没有说明 route 只入队、`finalize()` 才进入 Shell side effect，也没有写出 Shell bridge 在 active pet pack 变化时的动画/trigger runtime 更新。
- 触发条件：开发者把安装副作用直接放到 HTTP route，或误以为 `catalog.installSelection()` 是 Backend 本地文件操作；新增同类域时也会漏掉 Job 取消边界和 Shell authority。
- 实际影响：绕过 `resourceKey` 串行化、`finalizing` 取消边界或 Shell 单一状态源，可能造成重复安装、UI 显示已完成但宠物资源未刷新，或跨进程错误被吞掉。
- 根本原因：开发计划只记录了层级名称，没有记录具体方法、owner 和测试证据。
- 最小修改方案：已在 Task 5 增加 Catalog vertical slice，明确 `useCatalogPane.onInstallSelection()` → HTTP → route → runner → Backend domain → reverse channel → `createCatalogSidecarBridge.handle()` → Shell `catalogService.installSelection()` → Job result 的完整链路，并保留“Task 5 全量审计仍未完成”的未勾选状态。
- 需要补充的测试：已有 `tests/backend/routes-catalog.test.js`、`tests/backend/runtime-bindings.test.js`、`tests/control-center/catalog-cutover.test.js` 覆盖入队、真实 Shell side effect、finalizing 取消、UI HTTP/Job 映射和旧 IPC 退役；本轮又补充了 Shell 断连、重复 resource key、一次 retry、retry budget exhausted、`catalog.refreshed` → `job.succeeded` 时序断言。其它域仍需沿同一矩阵补证据。
- 是否阻塞合并：**不阻塞本次文档修订；阻塞将 Catalog 证据外推为 Task 5 全量完成。**

## [P1] 中文主开发文档仍把过期单进程结构当成当前入口（已修复）

- 文件与位置：`docs/jishuwendang.md` §3、§5；对应实现为 `main.js`、`src/main/bootstrap/create-openpet-runtime.js`、`apps/desktop/src/sidecar/*`、`services/backend/index.js` 和 `packages/contracts/`。
- 所属维度：正确性、架构、可维护性、扩展性。
- 问题：文档更新时间停留在 `2026-07-05`，架构图只列 `main.js -> src/main/services`，没有 sidecar/backend/contracts 主链；动作、AI、插件和设置职责因此被描述成 Shell 内部单进程能力。
- 触发条件：新维护者按中文主文档定位代码、添加新域或判断迁移完成度。
- 实际影响：业务逻辑可能继续写入错误层，绕过 route registry、Job、SSE 和 reverse channel；维护者也会错把 `src/main/` 当作应删除的旧目录。
- 根本原因：迁移实现先于中文主入口更新，且没有文档回归测试锁定主调用链。
- 最小修改方案：已更新为 `main.js → createOpenPetRuntime() → createSidecarRuntimeCoordinator() → spawnSidecar() → services/backend/index.js`，列出 Shell authority、Backend domain/Job/SSE、shared contracts 和 Control Center 的边界，并标明迁移仍在进行中。
- 需要补充的测试：`tests/docs/live-docs-development-plan.test.js` 断言中文主文档含当前调用链、计数和幂等边界；`npm run check:docs-drift` 检查入口引用。
- 是否阻塞合并：**不阻塞本次文档修订；阻塞依赖该文档开发新跨层功能。**

## [P1] API 文档对服务端幂等能力过度承诺（已修复）

- 文件与位置：`docs/refactor/03-api-contract.md` §1、§1.3；实现依据为 `src/control-center/src/api/client.ts`、`services/backend/http/middleware.js` 及 Catalog/Pet Pack/Plugin callers。
- 所属维度：正确性、可靠性、性能、兼容性。
- 问题：原文写“所有写操作支持可选 `Idempotency-Key`”，但 client 只是生成并携带 header，Backend 没有通用 key store、dedupe lookup 或 replay response。Job/native side-effect 请求仅由 caller 关闭自动 retry，不能把 header 当成服务器去重。
- 触发条件：维护者按契约对安装、导入、生成等 POST 做自动重试，或把同一 key 的重复请求当成安全重放。
- 实际影响：sidecar 恢复或网络超时后可能重复创建 Job、重复安装/导入或重复写入；发布说明会错误宣称幂等保证。
- 根本原因：传输层 header 能力被误写成业务语义，且没有按 endpoint 登记实现/测试状态。
- 最小修改方案：已改为“client 自动附带；Backend 仅允许/透传；服务端去重按端点确认”，并明确 Job/native side-effect caller 默认 `retry: false`。
- 需要补充的测试：文档测试锁定无通用去重声明；新增 endpoint 时必须同时提供重复请求行为测试或明确 `retry: false`。
- 是否阻塞合并：**不阻塞本次文档修订；阻塞任何依赖未证实幂等的自动重试设计。**

## [P2] Task 5 只写域名表，无法指导方法级实现和生产验收（已修复）

- 文件与位置：`docs/superpowers/plans/2026-10-04-openpet-development-plan.md` Task 5；涉及 `services/backend/domains/*`、`services/backend/routes/*`、`services/backend/jobs/handlers/*`、Shell bridge 和 Control Center hooks。
- 所属维度：正确性、结构、扩展性、测试、可维护性。
- 问题：原计划只有 settings/actions/pet packs/catalog/plugins/AI 的六行 owner 表，没有具体方法、调用链、失败/取消/重试/事件和测试验收，无法区分已实现、partial、blocked，也无法防止 operation query 分支被误计为独立 route。
- 触发条件：开发者新增同类域、把 route 直接做 native side effect、或只补表格不补 Job/SSE/bridge 测试。
- 实际影响：跨层职责泄漏、错误状态传播、重复执行和 route 覆盖率高估；在修复前，Actions proposal/rule 轻量实现、Pet Pack picker、Plugin secret/native dashboard 和 AI 未装配路由容易被误当作完成。
- 根本原因：计划按组件名而非按可验证行为编写，Catalog vertical slice 之前没有被抽象为验收模板。
- 最小修改方案：已新增 Task 5.1–5.6 方法级矩阵。每个域列出 UI caller、route/domain owner、Shell/Job side effect、当前 status、失败/重试/事件边界和具体测试文件；Catalog 明确保留 event/retry gaps。
- 需要补充的测试：按矩阵逐项补 success、validation、dependency outage、retryability、cancellation/finalization、event ordering、secret/path safety 和 malformed result 测试。
- 是否阻塞合并：**不阻塞本次文档修订；阻塞把 Task 5 标记为全量完成。**

## [P1] Actions 文档与实际 HTTP → Shell authority 调用链漂移（已修复）

- 文件与位置：`docs/refactor/03-api-contract.md` §3/§4.4/§7、`docs/refactor/09-repo-state.md` §2.3/§2.10/§4、`docs/refactor/15-channel-retirement.md` Actions rows、`docs/superpowers/plans/2026-10-04-openpet-development-plan.md` §5.2、`docs/jishuwendang.md` §5/§6.1、`docs/refactor/08-agent-guide.md` §8；实现对应 `src/control-center/src/features/actions/api.ts`、`src/control-center/src/hooks/useActionsPane.ts`、`services/backend/routes/actions.js`、`services/backend/domains/actions.js`、`services/backend/index.js`、`apps/desktop/src/sidecar/message-handler.js`、`src/main/actions-sidecar-bridge.js`。
- 所属维度：正确性、架构、可靠性、可维护性、测试。
- 问题：旧文档把 Actions 仍写成 12 条 `blocked:T42`、Backend 直接维护简化动作数据并写 `cat_anime/animations.json`，且把反向通道计数锁定为 17/14。实际实现已经完成 Actions vertical slice：HTTP route/domain 通过 `actions.request` 调 Shell authority，导入返回 Job，UI 通过 `useJob` 读取终态，失败使用结构化 `{ code, message }`，Shell 负责 ActionService/actionImportService/PetService/trigger runtime 与 selection TTL。
- 触发条件：维护者按旧台账继续在 Backend 添加动作文件写入、把 import 当同步响应、从 UI 删除 Job polling，或因错误的 bridge 数字拒绝合法 Actions 消息。
- 实际影响：会重新引入双状态源、重复导入、selection 泄漏和错误码丢失；也会错误地把已接入的 Actions HTTP 路径当成不可用能力，阻止正确的后续迁移。
- 根本原因：代码先于开发文档完成 vertical slice，契约、台账、计划、中文入口和漂移测试没有同步更新。
- 最小修改方案：已同步 03/08/09/15 篇、开发计划、中文开发文档与 `tests/docs/live-docs-development-plan.test.js`；明确 18 条 Backend → Shell、15 条 Shell → Backend；保留 legacy `actions:inspect-frames` IPC 和其它旧 IPC，直到 reachability proof 允许删除；在计划中记录具体方法、Job handler、桥接 owner、TTL 和验收测试。
- 需要补充的测试：`tests/control-center/actions-cutover.test.js`、`tests/main/actions-sidecar-bridge.test.js`、`tests/backend/routes-actions.test.js`、`tests/backend/reverse-channel-allowlist.test.js`、`tests/backend/bridge-dialog.test.js` 已覆盖 38 个场景；合并前仍需运行 docs/API/channel/syntax 全套门禁。
- 是否阻塞合并：**修复前阻塞 Actions 迁移和任何依赖旧契约的实现；当前文档修复已解除该阻塞，但 Task 5 其它域仍未完成。**

## [P2] Catalog 成功安装与 `catalog.refreshed` 事件语义仍不闭环（已修复当前阶段）

- 文件与位置：`services/backend/domains/catalog.js:createCatalogService.refresh/installSelection/clearSelection`、`src/main/catalog-sidecar-bridge.js:createCatalogSidecarBridge.handle`、`services/backend/index.js:createRunner`、`src/control-center/src/hooks/useCatalogPane`。
- 所属维度：正确性、事件一致性、可靠性、测试。
- 问题：安装 Job terminal events、Shell pet-pack activation event 和 Catalog refresh event 需要保持不同职责；若文档把它们混为一个缓存或结果信号，UI 会错误地用 SSE 事件代替 Job 终态。
- 触发条件：调用方把 `catalog.refreshed` 当作安装完成结果，或在事件重放/重复投递时不按 SSE event id 去重。
- 实际影响：可能提前显示安装成功、漏掉安装失败，或因重复重拉造成竞态。
- 根本原因：此前 mutation 发布边界和前端消费规则没有落到代码与契约。
- 最小修改方案：当前阶段已落地：`installSelection()`、`addBlocklistEntry()`、`removeBlocklistEntry()` 只有在 response 含有效 `result.catalog` 时才发布 `{ updatedAt, at }`，格式错误按 `INTERNAL` 失败且不发布；`prepareInstall()`、`clearSelection()` 不发布；`useCatalogPane` 订阅 `useSse(['catalog'])`，按 event id 去重并用 sequence guard 防止旧 `/catalog` 响应覆盖新快照，Job/直接 mutation 快照会使旧请求失效，而 Job terminal 仍负责安装进度与结果。
- 需要补充的测试：已加入 `tests/backend/routes-catalog.test.js` 的 mutation/selection/malformed-result、Shell outage、重复资源键断言，`tests/backend/runner.test.js` 的一次 retry、预算耗尽和事件顺序断言，以及 `tests/control-center/catalog-cutover.test.js` 的 SSE/cache/sequence 静态断言；`tests/backend/runtime-bindings.test.js` 已覆盖 finalizing cancellation。该证据只闭合 Catalog install slice，不代表其它域完成。
- 是否阻塞合并：**不阻塞当前文档和事件语义修订；阻塞将 Catalog 的 retry、取消和时序证据宣称为完整。**

## [P2] 前端方案把目标数据层和开发替身写成已交付能力

- 文件与位置：`docs/refactor/05-frontend.md` §2.2、§2.5、§7、§9；对应实现为 `src/control-center/src/api/transport.ts`、`src/control-center/src/api/client.ts`、`src/control-center/src/hooks/useJob.ts`、`src/control-center/src/hooks/useSse.ts`、`src/control-center/src/hooks/useCatalogPane.ts` 和 `src/control-center/src/api/demo-control-center-api.ts`。
- 所属维度：正确性、可维护性、测试、架构迁移边界。
- 问题：旧方案把 MSW transport、SSE 断线后的 2 秒轮询、TanStack Query 作为当前唯一数据/失效模型，并把 `demo-control-center-api.ts` 删除列成无条件验收项；实际代码仍在 dev 无 preload 路径使用 demo/内存 adapter，`useJob` 只在 SSE 事件到达时重新 GET Job，没有定时轮询 fallback，现有 pane 大量使用 `useState` 与显式 reload。`useCatalogPane` 当前已经订阅 `useSse(['catalog'])`，但这项局部修复不等于全局数据层迁移完成。同一篇文档还把 shutdown 的 `graceMs` 混入过期的 Backend envelope 语义，容易与当前严格 `{ type: 'shutdown' }` 契约混淆。
- 触发条件：维护者按 §2、§7 或 F2/F10/F13 直接删除 demo API、在断线场景假设 2 秒轮询已存在、移除现有显式刷新，或按旧 shutdown 示例生成跨进程消息。
- 实际影响：dev 环境可能失去可用 fallback；Job 在无 SSE 事件时可能长期停留旧状态；Query 迁移未完成时删除显式 reload 会造成陈旧数据；跨进程发送错误字段会导致握手/关闭契约漂移。
- 根本原因：目标架构文档没有在每个验收项旁标出当前实现状态，也没有按实际 hook、transport 和 bridge 调用链核对目标与现状。
- 最小修改方案：已将 `05-frontend.md` 标记为“目标方案 + 当前实现对照”，明确 MSW、页面可见性、Job 定时轮询、Query 全量迁移和 demo API 删除仍未完成；将 F2/F10/F13 降级为目标项；把 Query 失效示例改为目标方案，并在 Task 5.4 记录 Catalog 由 Job 终态结果驱动、`catalog.refreshed` 只负责缓存重读；`02-architecture.md` 已明确 Backend 只接收严格 `{ type: 'shutdown' }`，`graceMs` 仅属于 Shell 本地等待预算。
- 需要补充的测试：文档回归测试锁定 MSW 尚未接管、`useJob` 无定时轮询、Query 迁移未闭合、demo API 不可删除和 shutdown envelope 边界；Catalog 的 SSE 订阅、event-id 去重、malformed result 和 sequence guard 已有 focused/static 回归。后续实现 MSW/Query/Job fallback 时再增加真实 dev 启动、Playwright 断线恢复和跨域缓存回归。
- 是否阻塞合并：**不阻塞本次文档修订；阻塞将 F2/F10/F13 或 Job/Catalog 事件闭环宣称为已完成。**

## [P2] sidecar 启动时序文档与实际 init/ready 责任边界含混

- 文件与位置：[`docs/refactor/02-architecture.md`](../refactor/02-architecture.md) 启动时序；`apps/desktop/src/sidecar/spawn.js` `launch()`/`spawnSidecar()`；`services/backend/index.js` init/ready 编排。
- 所属维度：正确性、可靠性、可维护性。
- 问题：文档旧流程把 `sessionToken`、init 参数和 ready 责任写成 Shell 生成并注入，但当前 `spawn.js` 发送 `initBody`，Backend `index.js` 生成运行时 session token 并在 ready 返回；`runtime-coordinator.js` 再向渲染层发布 ready。
- 触发条件：修改启动握手、重启或 token 注入时照抄旧时序。
- 实际影响：token 生命周期错误、前端提前请求、sidecar ready/timeout 竞态回归。
- 根本原因：目标架构图与实际实现没有注明以方法实现为准。
- 最小修改方案：文档明确 `createOpenPetRuntime` → coordinator → spawn → backend 的调用链，区分 Shell 注入 init 数据与 Backend 生成 ready session token。
- 需要补充的测试：`tests/main/sidecar-runtime-coordinator.test.js`、`tests/main/sidecar-spawn.test.js`、`tests/backend/*` 中验证 init-before-ready、超时、版本不符重拉和 graceful stop。
- 是否阻塞合并：**阻塞修改启动协议；不阻塞本次文档修订。**

## [P1] shutdown IPC 异步发送错误会延迟孤儿进程清理

- 文件与位置：`apps/desktop/src/sidecar/spawn.js` 的 `stopSidecar()`；调用方为 `apps/desktop/src/sidecar/runtime-coordinator.js` 的 `stop()` 与重启路径。
- 所属维度：可靠性、资源生命周期、异常处理。
- 问题：`ChildProcess.send()` 既可能同步抛错，也可能通过 callback 异步回传错误。旧实现只捕获同步异常并继续等待 `SHUTDOWN_GRACE_MS`，因此 IPC 已断但子进程仍存活时会白等完整宽限期。
- 触发条件：sidecar 已断开或 IPC channel 在退出竞态中关闭，`child.send(shutdown, callback)` callback 收到 error，而 `exit` 事件尚未到达。
- 实际影响：应用退出、重启或崩溃恢复期间延迟确认停止，短时间内残留孤儿 sidecar；连续重启时可能与新 sidecar 争用资源。
- 根本原因：shutdown 的发送失败没有和同步发送异常共享同一幂等清理路径。
- 最小修改方案：异步 callback 收到 error 时取消 grace timer、调用 `SIGKILL` 并 resolve `killed`；同步异常走同一 helper；`exit` 事件与 timer 通过 settled 标志保证只完成一次。当前已在 `stopSidecar()` 落地。
- 需要补充的测试：构造 `child.send()` 在 microtask callback 返回 error，断言立即 `SIGKILL`、结果为 `killed` 且不等待完整宽限期；另测 child 随后触发 `exit` 不重复 resolve。已加入 `tests/main/sidecar-spawn.test.js`。
- 是否阻塞合并：**已修复；修复前阻塞 Shell 生命周期代码合并。**

## [P1] Backend reverse-channel 异步发送错误会伪装成 60 秒超时

- 文件与位置：`services/backend/bridge/shell-client.js` 的 `request()`；调用链为 `services/backend/domains/plugins/index.js` / settings / catalog → `shell.request()` → `process.send()`；`services/backend/index.js` 提供实际 IPC sender。
- 所属维度：可靠性、异常处理、资源生命周期。
- 问题：旧实现只处理 `send(envelope)` 的同步 throw；Node `process.send()` 也会通过 callback 异步报告 IPC channel 关闭。旧路径不会删除 `pending` 或清理 timer，调用方只能在默认 60 秒 `PROVIDER_TIMEOUT` 后才失败。
- 触发条件：Shell 正在退出、sidecar stop/restart 竞态、或 IPC 管道在消息排队后关闭，导致 callback 收到 error 而没有同步 throw。
- 实际影响：插件 secret/setup/health、settings host effect 等请求在应用退出或 sidecar 故障时长时间挂起；HTTP route 会占用请求槽位并把真实 channel failure 误报为 provider timeout。
- 根本原因：Backend bridge 没有把异步发送失败接入与 pending correlation 共用的清理路径，且 `services/backend/index.js` 没有透传 `process.send` callback。
- 最小修改方案：让 shell client sender 接受 callback；callback 收到 error 时按 request id 删除 pending、清理 timer、reject 原错误；同步 throw 仍走同一清理逻辑。当前已在 `createShellClient().request()` 与 `services/backend/index.js` 落地。
- 需要补充的测试：异步 callback 返回 `channel closed` 时，`request()` 应立即 reject 且不等待 60 秒；与同步响应竞态、dispose 和 stop/restart 一起跑。已加入 `tests/backend/bridge-dialog.test.js`。
- 是否阻塞合并：**已修复；修复前阻塞 Backend reverse-channel 代码合并。**

## [P1] 共享 plugin production 结果契约允许非法双态响应

- 文件与位置：`packages/contracts/src/bridge.ts` 的 `shellToBackendSchema`；运行时对应 `services/backend/bridge/shell-client.js` 的 `validateExpectedResponse()`。
- 所属维度：正确性、契约一致性、可靠性。
- 问题：旧 Zod schema 只要求失败有 `error`，没有要求成功有 `result`，也没有禁止失败同时携带 `result`；Shell 的 JS validator 已经更严格，导致 TypeScript/契约消费者与实际桥接行为不一致。
- 触发条件：任何调用方使用共享 schema 验证 `plugin.production.result`，收到 `ok: true` 无结果或 `ok: false` 带结果的 envelope。
- 实际影响：非法响应可能在跨层边界被当作合法数据继续传递；不同消费者对同一响应产生不同状态判断，尤其影响 secret/setup/health 等同步 HTTP 路由。
- 根本原因：结果分支的互斥规则只在 Shell runtime 中实现，没有回填到共享 contract schema。
- 最小修改方案：在 `shellToBackendSchema` 的 `superRefine` 中强制成功必须有 `result`，失败必须有且只能有 `error`；保留 runtime validator 作为不信任 IPC 的第二道校验。当前已落地。
- 需要补充的测试：schema 对成功缺 result、失败带 result 的响应均应拒绝，同时保留合法成功/失败样例；已加入 `tests/backend/bridge-dialog.test.js`。
- 是否阻塞合并：**已修复；修复前阻塞共享契约发布。**

## [P1] Init/ready 共享契约与生产握手字段漂移

- 文件与位置：`packages/contracts/src/bridge.ts` 的 `shellToBackendSchema`；`apps/desktop/src/sidecar/runtime-coordinator.js` 的 `createDefaultInitBody()`；`apps/desktop/src/sidecar/spawn.js` 的 `launch()`；`services/backend/index.js` 的 `initPromise`/ready 发布。
- 所属维度：正确性、架构、兼容性、可靠性。
- 问题：旧契约仍要求 `init.userDataPath/sessionToken/logLevel` 和 `shutdown.graceMs`，而生产 Shell 实际发送 `userDataDir/providerKeys/legacyToken/localHttpConfig/appInfo`，shutdown 也不带字段；文档 §7 同样保留旧类型。这会让契约消费者生成错误握手，或把合法生产消息判成非法。
- 触发条件：新 host、测试 harness 或类型消费者直接按旧 `shellToBackendSchema`/§7 组装 init/shutdown envelope。
- 实际影响：Backend 可能在 init 阶段超时退出，或不同版本对同一握手的校验结果不一致；这是启动不可用级别的迁移风险。
- 根本原因：Shell 侧运行时改为 Backend 生成 session token 后，旧设计型契约没有同步收敛到实际 init/ready 调用链。
- 最小修改方案：以 `createDefaultInitBody()` 和 `services/backend/index.js` 为唯一现状，更新 Zod schema、TS 示例、README 和测试；init 严格允许 `userDataDir`、可选 secrets/local HTTP/app metadata，shutdown 采用无字段 envelope；ready 由 Backend 生成 token，Shell 严格校验固定字段。当前已落地。
- 需要补充的测试：contract parse 生产 init、strict shutdown、ready extra-field rejection、init-before-ready 和 packaged sidecar ready smoke。已加入 `tests/backend/about-domain.test.js`、`tests/main/sidecar-spawn.test.js`，既有 coordinator/integration 测试继续覆盖调用链。
- 是否阻塞合并：**已修复；修复前阻塞任何依赖 bridge contract 的开发或发布。**

## [P1] Settings ready 竞态可能丢失 Shell 修复写入

- 文件与位置：`src/main/settings-persistence-queue.js` 的 `enqueue()`/ready 写路径；调用方为 `src/main/bootstrap/create-openpet-runtime.js` 的 `persistSettingsWhenBackendReady()`，上游包括 `registerCursorRepair()`、`registerDisplayLifecycle()` 和 system cursor fallback。
- 所属维度：正确性、数据一致性、竞态、可靠性。
- 问题：旧队列在 `isReady()` 返回 true 时直接执行 `persist()`；若 sidecar 在 ready 检查后、`fetchSnapshot()` 或 PATCH 期间退出，失败 entry 不会进入 `pending`，下一次 ready 也不会重放。
- 触发条件：sidecar restart/stop 与 Shell display/cursor repair 同时发生，或 Backend 在请求已发出后断开。
- 实际影响：内存中的 canonical settings 已切换，但 Backend 磁盘版本仍是旧值；后续重启可能恢复旧 cursor scope/anchor，造成状态不一致。
- 根本原因：FIFO 保留逻辑只覆盖“未 ready 时入队”和“flush 中失败”，没有覆盖 ready 直写的 send/fetch/PATCH 失败。
- 最小修改方案：ready 直写失败时将克隆 entry 放回 pending 头并记录错误；下次 `onReady` 继续按 FIFO 重试，调用方仍收到原始失败以便当前操作记录。当前已在 `createSettingsPersistenceQueue()` 落地。
- 需要补充的测试：`isReady() === true` 下第一次 persist 抛错，断言 entry 保留、第二次 flush 成功且只执行两次同一写入。已加入 `tests/main/settings-persistence-queue.test.js`。
- 是否阻塞合并：**已修复；修复前阻塞设置持久化迁移。**

## [P2] stopSidecar 忽略显式零宽限期

- 文件与位置：`apps/desktop/src/sidecar/spawn.js` 的 `stopSidecar(child, options)`。
- 所属维度：正确性、可维护性、测试。
- 问题：旧实现用 `(options && options.graceMs) || SHUTDOWN_GRACE_MS`，因此契约允许的 `graceMs: 0` 会被替换成 5000ms。
- 触发条件：调用方为测试、快速重启或故障隔离明确传入 `{ graceMs: 0 }`。
- 实际影响：停止路径额外等待 5 秒，破坏调用方对零宽限期的明确控制；在重启竞态中扩大资源占用窗口。
- 根本原因：把合法数值 0 当作“未提供”。
- 最小修改方案：使用 nullish fallback `options?.graceMs ?? SHUTDOWN_GRACE_MS`，保留 0；新增零宽限期回归测试。当前已落地。
- 需要补充的测试：传入 `{ graceMs: 0 }` 后应快速进入 `SIGKILL`，且不等待默认 5 秒。已加入 `tests/main/sidecar-spawn.test.js`。
- 是否阻塞合并：**已修复；修复前阻塞需要精确 shutdown budget 的调用方。**

## [P1] Settings ready 写入失败时后续写入可能越过 FIFO 队头

- 文件与位置：`src/main/settings-persistence-queue.js` 的 `enqueue()`/`flush()`；调用方为 `src/main/bootstrap/create-openpet-runtime.js` 的 `persistSettingsWhenBackendReady()`。
- 所属维度：正确性、数据一致性、竞态、可靠性。
- 问题：如果 Backend 已 ready，旧实现为每次调用单独建立 promise 链；第一笔写入在 ready 检查后失败时会被重新入队，但同一时间提交的后续 ready 写入已经排在独立链上，可能先成功落盘，越过失败队头。
- 触发条件：cursor/display 修复或多个启动归一化在同一事件循环中提交，sidecar 在第一笔 fetch/PATCH 期间断开，第二笔请求仍然到达 Backend 或重连后的写入先执行。
- 实际影响：后续设置可能覆盖前一笔尚未成功持久化的 canonical 修复；重放顺序与内存状态不一致，重启后可能恢复错误版本。
- 根本原因：队列只有 deferred pending 路径是共享 FIFO，ready 直写路径绕过了同一 flush loop。
- 最小修改方案：让 ready 和 deferred 写入都先进入同一个 `pending` 队列，由 `flush()` 串行执行；失败时保留队头并拒绝受影响 waiter，下一次 ready 继续按原顺序重放。当前已在 `createSettingsPersistenceQueue()` 落地。
- 需要补充的测试：ready 状态下连续提交两笔，第一笔失败时断言第二笔尚未调用；修复故障后按 `first, first, second` 顺序成功重放。已加入 `tests/main/settings-persistence-queue.test.js`。
- 是否阻塞合并：**已修复；修复前阻塞设置持久化迁移。**

## [P1] init IPC 的晚到异步错误会误杀已 ready 的 sidecar

- 文件与位置：`apps/desktop/src/sidecar/spawn.js` `launch()` 的 `child.send(init, callback)`；调用链为 `createSidecarRuntimeCoordinator.start()` → `spawnSidecar()` → `launch()`。
- 所属维度：可靠性、资源生命周期、竞态。
- 问题：`ChildProcess.send()` 的 callback 可能在 `message(ready)` 已经让 `launch()` resolve 之后才回报错误；旧 callback 无条件执行 `SIGKILL`，会杀掉已经被 coordinator 接受并对外公布的 Backend。
- 触发条件：init 消息已经被 Backend 处理并发出 ready，但 IPC channel 随后关闭或 Node 在发送回调中报告异步错误；通常发生在启动与退出/重启交错时。
- 实际影响：Shell 已把有效 `baseUrl/sessionToken` 暴露给 Control Center，随后 sidecar 被误杀，首批请求收到 connection reset 或 `BACKEND_UNAVAILABLE`，并触发不必要的降级/重启。
- 根本原因：init callback 没有检查 `launch()` 的 settled 状态，与 ready resolve 路径缺少同一幂等保护。
- 最小修改方案：callback 收到错误时先判断 `settled`；若 ready 已接受则交给 child 的 `exit` 生命周期处理，不再主动 `SIGKILL`。同步发送异常仍在未 settled 时立即清理。当前已落地。
- 需要补充的测试：ready 与异步 init callback 错误在同一 microtask 中到达时，断言 `launch()` 成功且 child 未被 kill；原有 init 异步错误测试继续断言未 ready 时立即拒绝并杀进程。已加入 `tests/main/sidecar-spawn.test.js`。
- 是否阻塞合并：**已修复；修复前阻塞 sidecar 启动生命周期代码合并。**

## [P1] 插件停止在进程表快照与 kill 之间存在 ESRCH 竞态（已修复）

- 文件与位置：`src/main/services/service-process-tree.js:signalServiceProcessTree()`；调用链为 `services/backend/domains/plugins/process-runtime.js:stop()` → `signalTree()`。
- 所属维度：正确性、可靠性、资源生命周期、测试。
- 问题：POSIX 停止流程先用 `ps` 收集 descendant PID，再逐个调用 `process.kill()`。目标进程可能在两步之间自行退出，Node 会抛出 `ESRCH`；旧实现把它直接传给插件 stop Promise，导致已经退出的插件被报告为停止失败，并使全量 Backend 测试出现 `kill ESRCH` 后无法收敛。
- 触发条件：插件服务或其子进程在 Shell/Backend 发出 SIGTERM 前自行退出，或多个清理路径同时处理同一 PID。
- 实际影响：插件被错误禁用、stop 调用 reject、进程台账清理和 runner cancellation 可能进入错误分支；重复 stop 不再具备应有的幂等性。
- 根本原因：进程树快照不是锁，`process.kill()` 的 `ESRCH` 没有按“目标已经达到停止状态”处理。
- 最小修改方案：`signalServiceProcessTree()` 增加 `killIfPresent()`，仅吞掉 `error.code === 'ESRCH'` 并继续处理其它 descendant/root；EPERM 等真实系统错误仍然抛出。Windows `taskkill` 路径保持不变。
- 需要补充的测试：`tests/services/service-process-tree.test.js` 已覆盖 descendant 已退出、root 已退出和非 ESRCH 错误传播；插件 domain、process ledger 和完整 Backend 套件已重新验证。
- 是否阻塞合并：**已修复；修复前阻塞插件生命周期和完整 Backend 门禁。**

## [P1] 插件安装 Job 的脱敏输入丢失导致真实安装链路无法执行（已修复）

- 文件与位置：`services/backend/routes/plugins.js:enqueue/registerPluginRoutes/githubInstallInput`；`services/backend/store/repositories/jobs.js:persistedInput/toJob`；`services/backend/jobs/dispatcher.js:createJobDispatcher`；`services/backend/jobs/runner.js:createRunner`；`services/backend/jobs/handlers/common.js:resolvePrivatePluginInput`；`services/backend/jobs/handlers/plugin-install.js:run`；`services/backend/jobs/handlers/plugin-install-github.js:run`；`services/backend/jobs/recovery.js:recoverJobs`。
- 所属维度：正确性、数据一致性、可靠性、隐私、安全、测试。
- 问题：真实 `POST /plugins/install`、`POST /plugins/install/github` 入队后，repository 会把所有 `plugin.*` 输入持久化为 `{ redacted: true, summary }`。修复前两个安装 handler 仍直接读取 `input.path`、`input.selectionId` 和 `input.repositoryUrl`，所以脱敏输入到达 runner 后已不包含安装所需的本地路径、selection ID 或 GitHub URL。
- 触发条件：通过真实 HTTP route 入队本地目录、zip、selection 或 GitHub 安装，而不是直接调用 domain/handler fixture；或者 runner 在重启后看到已持久化的 redacted 安装 Job。
- 实际影响：安装 handler 会把 `undefined` 传给底层安装服务并失败，或无法识别待安装 selection；如果错误地把 redacted Job 自动重试，还会重复执行一个没有原始输入的任务。HTTP Job 响应和日志不能泄漏这些路径或 URL，因此不能简单取消脱敏。
- 根本原因：repository 的敏感输入脱敏与 handler 的输入恢复没有对称协议；既有 `plugin.command` 的 transient `commandServer.takeInput()` 机制没有推广到安装 Job，且 repository 的 `canRetry` 投影一度没有把脱敏 input 传给状态机。
- 最小修改方案：route 层使用 `githubInstallInput()` 和 `normalizePluginGithubRepositoryUrl()` 规范化 URL，并将原始安装参数作为 `privateInput` 传给 `createJobDispatcher()`；dispatcher 以同进程 Map 保存并从 SQLite 入参剥离，runner 通过 `takePrivateInput/forgetPrivateInput` 注入和清理，两个安装 handler 统一调用 `resolvePrivatePluginInput()`。缺失 transient input 返回不可重试的 `409 CONFLICT`；`recoverJobs()` 将重启时的 redacted plugin install/command Job 标为 `interrupted`，不自动重放；`canRetry()` 与 `toJob()` 同步禁止这三类 redacted Job 重试。
- 需要补充的测试：`tests/backend/plugin-handlers.test.js` 覆盖真实 dispatcher/queue/runner 对本地 path 和 canonical GitHub URL 的取回、SQLite 只保存 redacted JSON、终态清理和缺失输入 `409/canRetry=false`；`tests/backend/routes-plugins.test.js` 覆盖 URL 规范化和等价 GitHub resource lock；`tests/backend/recovery.test.js` 覆盖重启不重放；`tests/backend/state-machine.test.js` 覆盖三类 redacted Job 的 retry 边界。
- 是否阻塞合并：**已修复；修复前阻塞所有真实插件安装链路。**

# Delete List

没有确认可删除的内容。历史快照 `docs/refactor/01-current-state.md`、任务卡和旧 review/phase 文档仍被 `docs/README.md` 作为审计背景引用；`src/main/` 与 legacy IPC 也仍由 `main.js`、IPC 注册器、Shell bridge 或迁移台账调用。删除前必须由 `rg` 调用链、测试引用和打包清单共同证明不可达。

# Final Verdict

- 是否可合并：**本次文档修订可合并到隔离分支，待评审后再合入 `main`；当前代码本身仍不可宣称生产就绪。**
- 合并前必须修复的问题：如果要合并任何依赖迁移契约的运行时代码，必须先构建 `packages/contracts`，让 `check:api-contract` 通过；新增 API 必须同时更新 route registry、契约文档和测试；启动协议改动必须覆盖 coordinator/spawn/backend 的 ready、timeout、version mismatch 和 shutdown 测试。
- 可后续处理的问题：继续补齐目标/blocked 路由的语义对等、未归属 SQLite 仓储、真实 provider/打包/签名证据；这些不是本次文档修订的必要代码改动。
- 推荐的最小修改路径：
  1. 先运行 `npm install` 与 `npm run build:contracts`。
  2. 修改对应 `services/backend/domains/*` 或 `routes/*`，同时更新 `routes/registry.js` 和 `docs/refactor/03-api-contract.md`。
  3. 对长任务沿 `createQueue` → `createRunner` → `createJobDispatcher` → `routes/jobs.js` → SSE hub 验证状态、取消、恢复和脱敏。
  4. 对 Shell 能力沿 `createOpenPetRuntime` → `createSidecarRuntimeCoordinator` → `message-handler` → 原生服务验证 reverse channel，不在 renderer 复制业务状态。
  5. 对设置写入沿 `createSettingsMutationCoordinator` → `createSettingsMutationAuthority` → `createSettingsStore.patch` 验证版本、回滚、trusted host effect 和事件发布。
  6. 合并前运行 `npm run check:api-contract`、`npm run check:channel-retirement`、`npm run check:docs-drift`、相关 focused tests、`npm run test:tools` 和 `git diff --check`；再按 Grade A/B/C 选择完整矩阵。
