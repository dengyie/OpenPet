# OpenPet 开发文档

> 最后更新：2026-10-05
> 当前代码基线：`4b6a1ac2`；运行时与文档门禁数字以 `npm run build:contracts`、`npm run check:api-contract` 和 `npm run check:docs-drift` 的新鲜输出为准。
> 角色：OpenPet 的中文主开发文档，负责解释代码结构、开发流程、测试策略和当前工程边界。

## 1. 这份文档负责什么

这份文档是维护者和新开发者进入仓库后的第一份详细开发资料。它只回答四类问题：

1. 代码现在是怎么组织的。
2. 新功能应该落到哪个边界。
3. 日常开发、调试、测试该怎么跑。
4. 当前哪些能力已经落地，哪些还是明确未完成。

它不是阶段历史，也不是 release 证据归档。那些内容分别放在：

- `docs/HANDOFF.md`：继续当前工作的接力说明。
- `docs/development-summary.md`：英文短摘要。
- `docs/openpet-current-todo-architecture.md`：按架构边界维护的当前 TODO。
- `docs/phases/` 与 `docs/reviews/`：历史实施记录与 review 结论。

## 2. 开发入口

### 启动与构建

```bash
npm start
npm run dev:control-center
npm run build:control-center
```

- `npm start`：先构建 Control Center，再启动 Electron；这是最重要的主流程。
- `npm run dev:control-center`：只启动 Control Center 的 Vite 开发服务。
- `npm run build:control-center`：验证前端可构建。

### 测试与校验

```bash
npm run test:core
npm run test:core:all
npm run test:tools
npm test
npm run test:control-center
npm run check:syntax
```

- `npm run test:core`：主进程、service、renderer、shared、pet-pack、examples、control-center 的 Node 回归。
- `npm run test:core:all`：`test:core` 加 Playwright Control Center UI 基线。
- `npm run test:tools`：release / evidence / scaffold / 维护工具链测试。
- `npm test`：全量 Node 原生测试。
- `npm run test:control-center`：Control Center Playwright 用例。
- `npm run check:syntax`：`node --check` + `tsc --noEmit` + `vite build`。

本轮新鲜证据应以命令输出为准：Actions vertical slice focused tests 为 38 项通过，
文档与 channel-retirement focused tests 为 33 项通过；`npm run test:tools`、完整
Backend glob、`npm test` 和 Control Center Playwright 必须在本机重新执行后才能写入
通过数字。此前的 31/664 等数字属于旧快照，不再作为当前基线。若完整 Backend 因
既有 `plugins-domain` 清理用例的 `kill ESRCH` 竞态失败，或 Playwright 因缺少匹配的
Chromium 无法启动，必须记录实际失败原因，不能把未执行或环境阻塞的证据写成通过。

迁移或文档变更还必须按顺序运行：

```bash
npm run build:contracts
npm run check:api-contract
npm run check:channel-retirement
npm run check:docs-drift
```

`build:contracts` 是 API 合同门禁的前置步骤；`check:api-contract` 当前只承认
`routes/registry.js` 中实际注册的路由。当前基线为 140 个 IPC（45 个保留 Shell、
95 个迁移台账）、120 个已注册 REST 路由、119 个 API 文档行、21 个 SSE 事件、8 个
topic、17 个 Job kind 和 6 个 Job status。完整测试若受本机 Playwright 浏览器缺失
影响，必须如实记录失败原因，不能把未执行的 UI 证据写成通过。

### 资源生成

```bash
npm run generate-sprites
```

- 从 `cat_anime/flames/` 重新生成精灵图和动作配置。
- 不要手改 `cat_anime/` 的素材组织方式。

## 3. 架构总览

OpenPet 现在是一个由 Electron Shell、Backend sidecar 和 Control Center 组成的桌面宠物平台。迁移仍在进行中，`src/main/` 不是历史目录；它继续持有窗口、PetService、原生 picker、密钥和生命周期等 Shell authority。

```text
main.js
  -> createOpenPetRuntime()
  -> createSidecarRuntimeCoordinator()
  -> spawnSidecar()
  -> services/backend/index.js

Electron Shell (`src/main/`)
  -> windows / preload / PetService / native dialogs
  -> settings host effects / secrets / pet-pack authority
  -> sidecar reverse-channel message handling

Backend sidecar (`services/backend/`)
  -> HTTP router and routes/registry.js
  -> domain services / SQLite / Jobs / SSE
  -> plugin and image-generation handlers

Shared contracts (`packages/contracts/`)
  -> bridge envelopes / API envelopes / event and Job schemas

Control Center (`src/control-center/`)
  React + Vite
  Pet / Actions / AI / Plugins / Catalog / Service / About
```

### 核心边界

| 边界 | 主要文件 | 负责内容 | 不该做什么 |
| --- | --- | --- | --- |
| Shell 组装与生命周期 | `main.js`、`src/main/bootstrap/create-openpet-runtime.js`、`apps/desktop/src/sidecar/*` | 依赖装配、窗口、sidecar 启停、反向通道 | 不把 Backend 域逻辑复制到 renderer 或 route |
| Backend 组合根 | `services/backend/index.js`、`services/backend/routes/registry.js` | route/domain/Job/SSE 装配与运行时绑定 | 不绕过 registry 把目标路由当作已实现 |
| 宠物状态 | `src/main/services/pet-service.js` | 动作播放、说话、事件和运行时状态 | 不绕过它直接改 renderer 状态 |
| 设置 | `services/backend/domains/settings.js`、`services/backend/routes/settings.js`、`src/main/settings-sidecar-bridge.js` | Backend canonical 写入；Shell host effects 与 FIFO deferred persistence | 不让多个进程直接写同一 settings 文件 |
| 动作与素材 | `src/control-center/src/features/actions/api.ts`、`src/control-center/src/hooks/useActionsPane.ts`、`services/backend/domains/actions.js`、`services/backend/routes/actions.js`、`src/main/actions-sidecar-bridge.js`、`src/main/services/action-import-service.js` | HTTP/Job 负责动作请求与终态；`actions.request` 反向通道把 ActionService、素材导入、PetService 动画刷新和 trigger runtime 留在 Shell；selection 由 Shell 持有并有 TTL | 不在 Backend 直接写 `cat_anime/animations.json`，不在 route 执行 native side effect；旧 Actions IPC/preload 仍待退役验收 |
| Pet packs | `services/backend/domains/pet-packs.js`、`services/backend/routes/pet-packs.js`、`src/main/services/pet-pack-service.js` | HTTP/Job 编排；Shell 负责 picker、资产和激活副作用 | 不在 Backend 伪造 native path/激活动作 |
| AI 与图像 | `services/backend/routes/ai.js`、`services/backend/domains/ai/image-generation.js`、`src/main/services/ai-service.js` | 当前 Backend 只注册 AI key 与 image Job；聊天/人设等仍按实际 caller 走 Shell 旧边界 | 不把目标 AI 路由当成当前接口，不把密钥交给 renderer |
| 插件宿主 | `services/backend/domains/plugins/index.js`、`services/backend/routes/plugins.js`、`src/main/services/plugin-service.js` | 安装、启停、Job、typed production bridge、日志和权限 | 不允许未受控 Node/Electron 访问；secret 只能由 Shell 持有 |
| 本地服务 | `services/backend/routes/service.js`、`src/main/services/local-http-service.js`、`src/main/services/mcp-transport-service.js` | loopback HTTP / MCP | 不默认暴露公网服务 |
| 控制中心 | `src/control-center/src/` | HTTP caller、SSE/Job 状态和用户操作 | 不复制 Backend/PetService 业务状态 |

## 4. 必须保持的工程约束

这些约束在做功能时不能被稀释：

- `PetService` 是宠物状态唯一可信源。
- 所有新的用户配置都必须能在 Control Center 中操作。
- API Key 和其他敏感凭证必须只留在主进程。
- 插件权限必须显式声明，且仍然受宿主白名单和 bridge 约束。
- `npm start` 必须始终可用。
- `cat_anime/` 的既有素材结构不能随意改。
- Local HTTP / MCP 只能是 loopback only，默认关闭。
- Creator Studio 负责提示词、任务、QA、导入请求；宿主负责模型调用、结果写入、最终导入和触发规则持久化。

## 5. 目录速览

```text
main.js
preload.js
renderer.js
control-center-preload.js

src/main/
  ipc.js
  window.js
  bootstrap/
  settings-sidecar-bridge.js
  settings-persistence-queue.js
  services/
  plugins/
  pet-pack/
  pet-chat/

apps/desktop/src/sidecar/

services/backend/
  routes/
  domains/
  jobs/
  bridge/
  events/

packages/contracts/

src/control-center/src/
  api/
  components/
  hooks/
  lib/
  panes/

src/shared/
  ipc-channels.js
  ipc-channels.ts
  openpet-contracts.ts

tests/
  main/
  services/
  shared/
  pet-pack/
  plugins/
  examples/
  control-center/
  scripts/
  release/

examples/plugins/
assets/pet-packs/
docs/
```

## 6. 关键业务面应该怎么理解

### 6.1 宠物与动作

- 宠物窗口负责渲染，不负责保存真状态。
- 动作配置来源于当前 active pet pack。
- 导入动作时，宿主负责校验帧数、像素约束、精灵图生成和配置写入。
- 当前 Backend `createActionService` 只做参数校验、Job 入队、`shell.request()` 和结构化结果映射；Shell `createActionsSidecarBridge` 调用真实 ActionService/actionImportService，并在成功写入后刷新 PetService 动画与 trigger runtime。
- `POST /actions/frames/import` 返回 `202 { jobId }`；`useActionsPane.onImport()` 通过 `useJob` 等待 `succeeded/failed/canceled/interrupted` 终态，malformed succeeded result 也会显式报错。
- `inspect-frames` 的 native directory picker 和 selection TTL 属于 Shell；clear/import/expiry 都会释放 selection timer。旧 IPC/preload 仍保留，直到 channel-retirement 和 renderer reachability 证据允许删除。
- proposal/rule 的 HTTP 语义已经接到 Shell authority；Task 5 仍需补全其它域的同等 vertical slice，不能因此标记为全量完成。
- `random` / `state` / `event` 仍然缺 durable host schema/editor。

### 6.2 AI 与聊天

- 聊天 Provider 配置采用 draft / active 分离。
- 保存与测试连接是两个动作，测试使用已保存配置。
- AI Talk 负责 persona、history、memory，不应该再在 renderer 里复制一套对话逻辑。
- 桌宠气泡聊天和桌面聊天窗口应该共享同一个会话脑，而不是各自演化。

### 6.3 Creator Studio

- Creator Studio 不是宿主内建页面，而是当前插件体系上的一条能力链。
- 插件负责任务、提示词、素材、QA 和 review；宿主负责 Provider 密钥、模型调用、输出写盘、导入、激活和 trigger proposal 持久化。
- 当前英文权威规范是 [`pet-character-generation.md`](./pet-character-generation.md)，其中统一维护单参考图、每次 Provider 最多一张附件、内部复合参考板、Codex Pet 九行动作、`running-left` 镜像策略和质量门禁；本中文架构文档不再重复这些生成协议。

### 6.4 插件系统

- 插件支持显式 `entries.setup`、`entries.commands`、`entries.services`。
- declaration-only command 通过短生命周期 bridge 访问有限宿主能力。
- creator-tools 目前覆盖：
  - action 读取 / 校验 / 受限写入
  - package-local frame inspect / import
  - 用户批准的 picker frame inspect / import
  - active installed user pack manifest workflow
- 插件现在依然不是“完全沙箱”；它只是被显式约束、审计和最小能力暴露。

## 7. 测试策略

### 核心流程必须有测试

以下流转属于强约束，改动时必须补或改测试：

- `npm start` 可启动
- Control Center 能构建并打开
- 设置保存与应用
- 动作导入、动作配置保存、trigger proposal 审核
- pet pack 导入 / 切换 / 删除
- AI Provider 保存、测试、脱敏诊断
- 插件安装、启停、命令执行、service 健康检查与清理
- Creator Studio 导入闭环
- loopback HTTP / MCP 默认关闭与显式启用

### 非核心测试的取舍

- 工具链脚本测试保留在 `tests/scripts/` 和 `tests/release/`。
- 纯文案、纯布局、纯展示辅助函数不需要机械地堆测试。
- 如果某个测试只是在重复更高层已经稳定覆盖的路径，可以删减。

## 8. 当前已知重点缺口

当前文档层面已经明确的工程缺口只有这些高优先项：

1. Task 5 只有 Catalog install 完成了完整 route → domain → Job → reverse channel → Shell → UI vertical slice；Settings、Actions、Pet packs、Plugins、AI/images 的方法级矩阵和剩余验收见 `docs/superpowers/plans/2026-10-04-openpet-development-plan.md`。
2. 当前 `Idempotency-Key` 由 Control Center client 自动附带，Backend 只允许/透传 header，没有通用服务端去重或结果缓存；没有单独证据的写操作不能宣称幂等。
3. `random` / `state` / `event` 触发规则还没有宿主持久化 schema 与编辑器。
4. Windows 的历史归档未通过旧的正式签名门槛；当前策略改为自签名，不购买证书或公证。Windows 目标系统安装与运行 smoke 仍待验证，自签名不得表述为 SmartScreen 或发行者可信。
5. Creator Studio 的生成现状和剩余质量工作统一维护在 [`pet-character-generation.md`](./pet-character-generation.md)；其部分能力仍通过插件 native boundary 运行。
6. Creator Studio 的用户流仍偏命令驱动，Dashboard-first 体验还需要继续收敛；气泡聊天与桌面聊天的最终主次关系还需要继续产品化收口。

这份文档不维护长期愿景列表；更完整的待办请看 `docs/openpet-current-todo-architecture.md`。

## 9. 文档维护规则

如果你改了下面内容，请同步更新对应文档：

| 变更内容 | 至少更新这些文档 |
| --- | --- |
| 服务职责、IPC 边界、开发命令 | `docs/jishuwendang.md` |
| 当前可用能力、验证基线、主要风险 | `docs/development-summary.md` |
| 当前接手信息、继续工作的导读 | `docs/HANDOFF.md` |
| 当前 TODO 和下一里程碑边界 | `docs/openpet-current-todo-architecture.md` |
| 历史实施与 review 结论 | `docs/phases/` 与 `docs/reviews/` |

优先保持一份文档说清一个主题，不要把同一段大篇幅现状复制到四五个文件里。

## 10. 建议阅读顺序

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/HANDOFF.md`
4. `docs/jishuwendang.md`
5. `docs/development-summary.md`
6. `docs/openpet-current-todo-architecture.md`

如果只是继续一个具体里程碑，再补读对应的 `docs/phases/`、`docs/reviews/`、`docs/superpowers/specs/` 即可。
