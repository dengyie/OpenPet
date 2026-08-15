# OpenPet 前后端分离 · 开发文档 v1.4

> 📌 **状态** M0 进行中:契约包、后端骨架与 agent 执行文档已落地 · **版本** v1.4 · **代码基线** `dengyie/OpenPet@c56a3f1` (main / v1.0.1-rc.3) · **编写日期** 2026-08-09

> **本目录是这份文档的权威副本。** 文档最初写在 Notion,现已随代码进入
> `refactor/frontend-backend-split`。代码在 Git、文档在别处会必然漂移,而这份文档里有
> 154 条通道映射和一整张契约表 —— 漂了就等于没有。后续变更改这里,不改 Notion。
> Notion 原稿已于 2026-08-15 降为归档副本并回指本目录。

> 🤖 **如果你是来实现代码的 agent,不要从本文件开始。** 直接去 [00 · 从这里开始](./00-START-HERE.md)。
> 01–07 篇是给人看的设计文档,00、08–11 篇才是给你看的执行文档。

## 一、文档目的与读者

本文档定义 OpenPet 从「Electron 单体」演进到「前端 + 本地后端服务」的完整技术方案,覆盖架构、协议、契约、数据、改造步骤、测试门禁与风险。

| 读者 | 关注章节 |
| --- | --- |
| 架构 / 主开发 | 全部 |
| 前端开发 | 02 目标架构、03 API 契约、05 前端改造 |
| 后端开发 | 02 目标架构、03 API 契约、04 子系统改造 |
| 插件作者 | 04 插件运行时改造(桥接协议变更) |
| 发布负责人 | 06 迁移路线、测试门禁、打包影响 |
| **实现 agent** | **00 入口 → 08 执行手册 → 09 仓库现状 → 10/11 任务卡**;背景不足时再回查 03、04 |

## 二、执行摘要

**核心判断:OpenPet 已经是「逻辑分离、物理耦合」。分离工作的本质不是拆分业务,而是把 154 个 Electron IPC 通道替换为协议边界,并把重负载模块迁出主进程。**

三个已经存在、可直接复用的接缝:

1. `src/shared/openpet-contracts.ts`（96 KB）—— 完整类型契约已存在,这是分离中最贵的一步,已经付过成本。
2. `src/main/ipc/register-*-ipc.js`（13 个域注册器）—— IPC 已按业务域切分,几乎就是未来的路由表。
3. `src/main/services/local-http-service.js`（15 KB）—— 已具备 loopback 绑定校验、Bearer token 常量时间比较、1 MB body 上限、访问日志、MCP session 管理,是后端 HTTP 层的现成骨架。

三个必须重写而非平移的部分:

1. **长任务模型** —— 图像生成单次可达 265 秒,同步请求/响应模型无法承载,必须任务化。
2. **插件反向通道** —— 插件桥当前直接调用宠物;进程拆分后需要「后端 → 主进程 → 渲染进程」的反向推送。
3. **`demo-control-center-api.ts`（181 KB）** —— 前端内的影子后端,分离后会造成三份业务语义,必须替换为契约生成的 mock。

## 三、目标与非目标

### 3.1 目标

| # | 目标 | 可度量验收 |
| --- | --- | --- |
| G1 | 插件管理完全迁出渲染链路 | 渲染进程零 `plugin*` IPC 依赖 |
| G2 | AI 生成迁出主进程并任务化 | 生成请求 3 秒内返回 jobId,进度可查 |
| G3 | 前端仅保留渲染 / 动作 / 状态展示 | `control-center-preload.js` 从 19 KB 降至 5 KB 以内 |
| G4 | 后端可独立启停与调试 | `curl` 可完成除窗口操作外的全部管理动作 |
| G5 | 后端崩溃不影响宠物基础行为 | 杀掉 sidecar 后宠物仍走动、仍可播动作 |
| G6 | 密钥不因分离而降级 | 任何响应体不含明文密钥,仅返回存在性状态 |
| G7 | 契约单一来源 | 前后端类型均由 `packages/contracts` 生成,无手写副本 |
| G8 | 分离不带来可感知的变慢 | `GET /settings` P95 低于 30 ms,冷启动到前端可用低于 2 s（完整预算见 [03 篇 §10](./03-api-contract.md)） |

### 3.2 非目标（本期明确不做）

- 不做远程/云端后端,后端仅监听回环地址。
- 不做多用户、多租户、账号体系。
- 不做插件强沙箱（维持现有「本地软件」定位与免责声明）。
- 不改 `cat_anime/` 目录结构与 pet-pack 磁盘格式。
- 不改 MCP 对外协议与现有 `/mcp` 端点行为。
- 不在本期解决 macOS 签名公证问题（独立轨道推进）。

## 四、架构决策速览（ADR）

| ID | 决策 | 结论 | 理由 |
| --- | --- | --- | --- |
| ADR-001 | 前端 ↔ 后端协议 | loopback HTTP/1.1 + SSE | 渲染进程只能发 fetch;`/mcp` 已依赖 HTTP;可 curl 调试 |
| ADR-002 | 后端 ↔ 主进程协议 | `child_process.fork` 消息通道 | 不占端口、本机其他进程不可达、无需二次鉴权 |
| ADR-003 | PetService 位置 | 保留在 Electron 主进程 | 仅 3.8 KB 纯状态机,被窗口/菜单/气泡三处同步依赖,跳进程会导致动画抖动 |
| ADR-004 | sidecar 打包形态 | 同 asar 内 Node 脚本,复用 Electron 内置 Node | RC 阶段避免体积 +40 MB 与二次签名 |
| ADR-005 | 长任务模型 | 统一 Job 模型（queued/running/succeeded/failed/canceled/interrupted） | 生成类操作耗时 60–420 秒,需可查询、可取消、可恢复 |
| ADR-006 | 持久化 | SQLite（WAL）替代大 JSON 文件 | `ai-talk-store.js` 已 56 KB,全量读改写模式不支持并发 |
| ADR-007 | 配置写者 | 后端为唯一写者,窗口瞬时状态独立文件 | 避免两进程并发覆盖同一 JSON |
| ADR-008 | 前端 mock | 契约生成的 MSW handler 替换 demo-api | 消除 181 KB 影子后端与三份语义 |
| ADR-009 | 兼容策略 | `/api/pet/*` 与 `/mcp` 原路径保留一个大版本 | 已有外部脚本与 MCP 客户端在用 |
| ADR-010 | 密钥加密（原待定决策 D3） | Shell 侧 `safeStorage` 解密,启动时经 `init` 消息一次性注入后端内存 | fork 出的纯 Node 进程拿不到 `safeStorage`;改成每次读都代理会给每个 AI 请求加一跳 |
| ADR-011 | 反向通道版本 | 消息统一套 `v: 1` 信封,版本不符即杀并重拉 sidecar | 升级或崩溃重拉会产生新旧进程配对,HTTP 有 `/api/v1` 兜底,此通道原本没有 |
| ADR-012 | 旧契约文件 | `openpet-contracts.ts` 降为薄壳 re-export,M5 删除 | 避免出现两份可编辑的类型定义 |
| ADR-013 | HTTP 框架（原 D2） | 原生 `node:http` + 自写约 150 行 router,不引 Express/Fastify | 只有一个消费者、路由形状规整;middleware 用函数数组就够,能把依赖树与启动开销压到零 |
| ADR-014 | SQLite 驱动（原 D4） | `node:sqlite`,并在 `store/db.js` 封一层 driver 接口作为退路 | 避开 native 重建与公证（签名已经是开口伤）;但 sidecar 跑在 `ELECTRON_RUN_AS_NODE` 下,可用性必须由 M0 spike 先证明 |
| ADR-015 | 前端数据层（原 D5） | TanStack Query,禁用窗口聚焦重取,`staleTime: Infinity`,失效只由 SSE 触发 | 自写要正确处理请求去重、乱序响应丢弃、卸载取消,成本远高于一个 13 KB 依赖,且这类 bug 极难定位 |
| ADR-016 | 运行时校验（原 D6） | zod 定义契约,`z.infer` 派生类型;仅后端与 dev 模式校验,生产前端不打包 zod | 同一份 schema 同时喂给类型、运行时校验与 MSW handler,一次写消除三处漂移 |
| ADR-017 | 包管理（原 D8） | npm workspaces,根 `workspaces: ["apps/*", "services/*", "packages/*"]` | electron-builder 与 npm 的组合最成熟;pnpm 的符号链接需额外 hoist 配置,而 `build.files` 白名单已经很脆 |

> ✅ **到此全部待定决策已关闭。** D1（fork 可行性）由 M0 spike 验证,D3 → ADR-010,D2/D4/D5/D6/D8 → ADR-013–017,D7（MCP 归属）已在 [03 篇 §8](./03-api-contract.md) 定下。开工前不再需要其他技术选型讨论,只剩 M0 spike 的六条验证（新增的第 6 条用来验 ADR-014 的前提）。

## 五、里程碑总览

| 阶段 | 名称 | 主要产出 | 预估 | 可独立发版 |
| --- | --- | --- | --- | --- |
| M0 | 契约与骨架 | `packages/contracts`、154 通道映射表、空壳 sidecar、`check:api-contract` | 1.5 周 | 是（用户零感知） |
| M1 | 进程骨架与存储 | 启停与崩溃重拉、双 token、SQLite 与 JSON 迁移、密钥搬迁 | 2 周 | 是 |
| M2 | 轻域切换 | about / service / catalog / settings / pet-packs / actions 共 40 个通道 | 2 周 | 是 |
| M3 | 插件与 Job | Job 引擎、插件域 23 个通道、桥搬迁、反向通道白名单 | 3 周 | 建议仅预发布 |
| M4 | AI 与 Creator | AI 37 个通道、Creator 13 个通道、删除 demo-api、pane 拆分 | 2.5 周 | 是 |
| M5 | 清理与固化 | 删除 113 个 IPC 处理器、preload 清零、样式拆分、文档同步 | 1 周 | 是 |

合计约 **12 人周**（含测试与文档）。**注意是「人周」而非「日历周」**:全职单人约 3 个月;业余每周投入 10 小时则约 10 个月。**风险最高的是 M1**（动数据层与密钥,出错不可逆）,M0–M1 为关键路径。每阶段的任务清单、验收标准与回滚方案以 [06 篇](./06-roadmap.md) 为准。

## 六、工作量分布参考

| 模块 | 现状体积 | 迁移动作 | 复杂度 |
| --- | --- | --- | --- |
| `creator-workflow-service.js` | 165 KB | 平移 + 任务化 | 高 |
| `plugin-service.js` | 103 KB | 平移 + 反向通道改造 | 高 |
| `ai-talk-service.js` | 80 KB | 平移 + 流式改造 | 中高 |
| `ai-service.js` | 77 KB | 平移 | 中 |
| `image-generation-model-service.js` | 74 KB | 平移 + 任务化 | 高 |
| `control-center-adapters.js` | 73 KB | 拆分为后端 DTO 与前端 ViewModel | 高 |
| `ai-talk-store.js` | 56 KB | 重写为 SQLite | 中高 |
| `demo-control-center-api.ts` | 181 KB | 删除并替换 | 中 |
| `AiPane.tsx` | 110 KB | 拆分为 4–5 个组件 | 中 |

## 七、术语表

| 术语 | 含义 |
| --- | --- |
| Shell | Electron 主进程,负责窗口、托盘、生命周期、原生能力 |
| Sidecar / Backend | 由 Shell fork 出的独立 Node 进程,承载插件与 AI 域 |
| Frontend | 渲染进程,含宠物窗口与 Control Center |
| Job | 后端长任务的统一抽象,含状态机与进度事件 |
| 反向通道 | 后端主动通知 Shell 执行宠物动作的消息路径 |
| 单写者原则 | 每份持久化数据只有一个进程拥有写权限 |
| 降级模式 | sidecar 不可用时,前端仅保留渲染与动作播放的运行状态 |

## 八、子文档索引

本文档按下列顺序拆分,每份子文档均可独立作为开发依据。

**给人看的设计文档(01–07)** —— 讲「为什么这样设计」:

| # | 文档 | 内容 |
| --- | --- | --- |
| 01 | [现状盘点与问题诊断](./01-current-state.md) | 代码体积、耦合点、五个真实阻碍 |
| 02 | [目标架构、进程职责与安全设计](./02-architecture.md) | 三层架构、边界、降级、密钥 |
| 03 | [API 契约与通信协议](./03-api-contract.md) | 154 通道映射、完整路由表、错误码、SSE |
| 04 | [关键子系统改造](./04-subsystems.md) | 插件运行时、Job 引擎、存储与并发 |
| 05 | [前端改造方案](./05-frontend.md) | pane 拆分、api client、mock 替换、preload 清零 |
| 06 | [迁移路线图、测试门禁与风险登记](./06-roadmap.md) | 六阶段任务清单、验收、回滚 |
| 07 | [M0 Spike 代码骨架与验证清单](./07-spike.md) | 六条假设的可运行探针、判定标准与结论去向 |

**给实现 agent 看的执行文档(00、08–11)** —— 讲「具体做什么、做到什么程度算完」:

| # | 文档 | 内容 |
| --- | --- | --- |
| 00 | [从这里开始](./00-START-HERE.md) | 入口:读的顺序、三条门禁命令、领卡方式、三个真相源（**实现 agent 从这里开始**） |
| 08 | [Agent 执行手册](./08-agent-guide.md) | 十条硬规则 H1–H10、错误怎么抛、测试怎么写、分支与 PR 规范、八条已知陷阱 |
| 09 | [仓库现状快照](./09-repo-state.md) | 每个已落地文件的对外接口逐一列出、待建文件、缺口 G1–G10 |
| 10 | [M1 任务卡:存储层与 Job 引擎](./10-tasks-m1.md) | T01–T08,每卡含精确导出签名与验收断言 |
| 11 | [M1 任务卡:HTTP、SSE、Shell 侧](./11-tasks-m1-http.md) | T09–T13,含 M1 完成判定 |

> 💡 **为什么要多这一层。** 人看不懂会来问,agent 不问 —— 它按自己的理解发明。而几个 agent 各自为同一个概念发明不同名字,就是契约漂移最常见的来源。08–11 篇的目的不是把设计写得更清楚,而是**消除自由度**:列名一律照 `001_init.sql`,事件名与错误码一律从 `packages/contracts` 取,状态字符串一律从 `jobs/state-machine.js` 取。

对应的可运行代码在仓库根的 [`spike/`](../../spike/) 目录;契约包在 [`packages/contracts/`](../../packages/contracts/)。

## 九、当前进度

截至 2026-08-15,分支 `refactor/frontend-backend-split` 上已落地:

| 产出 | 位置 | 状态 |
| --- | --- | --- |
| 十二篇子文档 | `docs/refactor/` | ✅ 已提交并逐篇 review |
| 六条 spike 探针 | [`spike/`](../../spike/) | ⏳ 代码就绪,待上机跑（推荐顺序 `6 → 1 → 2 → 5 → 3 → 4`） |
| 契约包首版 | [`packages/contracts/`](../../packages/contracts/) | ✅ 信封、错误码、Job、SSE 事件、反向通道 |
| 契约门禁 | [`scripts/check-api-contract.mjs`](../../scripts/check-api-contract.mjs) | ✅ 可运行:`npm run check:api-contract` |
| 根 `package.json` | 仓库根 | ✅ workspaces、`build.files`、`build:contracts` / `test:backend` / `check:node` 脚本 |
| 后端骨架 | [`services/backend/`](../../services/backend/) | ✅ 入口、router、中间件链、桥层、SQLite driver、Job 状态机、`001_init.sql` |
| 后端单测 | [`tests/backend/`](../../tests/backend/) | ✅ 状态机穷举 + 与 `001_init.sql` 的一致性对账 |
| agent 执行文档层 | `docs/refactor/00`、`08`–`11` | ✅ 手册、现状快照、M1 全部 13 张任务卡 |

**下一步的顺序:**

1. **跑六条 spike** —— 这是目前唯一的真阻塞项,需要真实 Electron 与打包环境。推荐顺序 `6 → 1 → 2 → 5 → 3 → 4`,见 [07 篇](./07-spike.md)。
2. **并行开 T01–T13** —— 这 13 张卡全部隔在注入式接缝之后,裸 node 下即可完整验收,**不必等 spike**。见 [10 篇](./10-tasks-m1.md)、[11 篇](./11-tasks-m1-http.md)。
3. M2（AI 40 通道)与 M3（插件 23 通道)的任务卡待开,等 M1 入库后再写 —— 免得卡片与实际接口提前漂移。

> ⚠️ **一处有意的顺序偏离,记录在此以免日后误判。** 原计划是「spike 5(`npm run pack` 手验安装包)绿了之后才动根 `package.json` 的 `workspaces` 与 `build.files`」。实际执行中这一步提前做了,因为后端骨架与 `test:backend` 都依赖 workspaces 才能装依赖与跑测试。**代价是**:若 spike 5 报错,打包问题会与 workspaces 改动混在一起,定位变难(这正是 R10 的形状)。**缓解**:这两处改动集中在单个提交 `304a5a34` 内,可整体 revert 后再单独验证打包。

> ⚠️ **`package-lock.json` 当前与根 `workspaces` 不同步。** 首次 `npm install` 会重写它(新增 `zod` 与两个 workspace 符号链接),这是预期行为而非 bug。缺口清单见 [09 篇 §4](./09-repo-state.md) G5。

## 十、变更记录

| 版本 | 日期 | 变更 | 作者 |
| --- | --- | --- | --- |
| v1.0 | 2026-08-09 | 首版草案,基于 `c56a3f1` 全量代码盘点 | mango |
| v1.1 | 2026-08-09 | 深入 review 后修复:新增 ADR-010–017 并关闭全部待定决策;补性能预算（03 §10）与端口 ready 门禁;补 M0 spike、R16、R17;新增 07 篇 spike 代码骨架与判定分支 | mango |
| v1.2 | 2026-08-14 | 随代码进入 `refactor/frontend-backend-split`,本目录成为权威副本;修正 hub 标题版本号与 ADR-013 的连接符;07 篇 §0 补 `03-frontend-gate/package.json`,§3 第 2 条断言标注为已知红 | mango |
| v1.3 | 2026-08-15 | 03 篇 §5 补登 `system.jobs-recovered` 与 `system.events-dropped`（此前只写在 04 篇 §2.6）,并补全 8 个 topic 的可选值清单、明确 `system` 不受订阅过滤;新增 `packages/contracts` 首版与可运行的 `scripts/check-api-contract.mjs`;新增§九当前进度（含下一步顺序约束）;Notion 原稿已降为归档副本 | mango |
| v1.4 | 2026-08-15 | 新增 agent 执行文档层:00 入口、08 执行手册、09 仓库现状快照、10/11 篇 M1 全部 13 张任务卡;§八 索引改为「设计文档 / 执行文档」两组;§一 读者表新增实现 agent 行;§九 刷新为后端骨架与根 `package.json` 已落地,并记录 workspaces 提前改动这一有意的顺序偏离与其缓解手段;清除 §九 中「`packages/contracts` 尚未接入 workspaces」的陈旧说明 | mango |
