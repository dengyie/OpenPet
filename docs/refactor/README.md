# OpenPet 前后端分离 · 开发文档 v1.6

> 📌 **状态** M0 已完成:E1–E10 真机结果已回填 · **版本** v1.6 · **代码基线** `main` · **更新日期** 2026-08-16

> **本目录是这份文档的权威副本。** 文档最初写在 Notion,现已随代码进入
> `main`。代码在 Git、文档在别处会必然漂移,而这份文档里有
> 154 条通道映射和一整张契约表 —— 漂了就等于没有。后续变更改这里,不改 Notion。
> Notion 原稿已于 2026-08-15 降为归档副本并回指本目录。

> 🤖 **如果你是来实现代码的 agent,不要从本文件开始。** 直接去 [00 · 从这里开始](./00-START-HERE.md)。
> 01–07 篇是给人看的设计文档,00、08–13 篇才是给你看的执行文档。

## 一、文档目的与读者

本文档定义 OpenPet 从「Electron 单体」演进到「前端 + 本地后端服务」的完整技术方案,覆盖架构、协议、契约、数据、改造步骤、测试门禁与风险。

| 读者 | 关注章节 |
| --- | --- |
| 架构 / 主开发 | 全部 |
| 前端开发 | 02 目标架构、03 API 契约、05 前端改造 |
| 后端开发 | 02 目标架构、03 API 契约、04 子系统改造 |
| 插件作者 | 04 插件运行时改造(桥接协议变更) |
| 发布负责人 | 06 迁移路线、测试门禁、打包影响 |
| **实现 agent** | **00 入口 → 08 执行手册 → 09 仓库现状 → 10–13 任务卡**;背景不足时再回查 03、04 |

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

> 本节 G1–G8 是**目标编号**,与 [09 篇 §4](./09-repo-state.md) 的缺口 G1–G11 无关;引用时必须写明「目标」或「缺口」。

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
| ADR-004 | sidecar 打包形态 | 同安装包内的 `app.asar.unpacked` Node 脚本,复用 Electron 内置 Node | E6 命中 R20 后采用 `asarUnpack` + unpacked resolver;避免体积 +40 MB 与二次签名 |
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
| 06 | [迁移路线图、测试门禁与风险登记](./06-roadmap.md) | 六阶段任务清单、验收、回滚、R1–R20 |
| 07 | [M0 Spike 代码骨架与验证清单](./07-spike.md) | 六条假设的可运行探针、判定标准与结论去向 |

**给实现 agent 看的执行文档(00、08–13)** —— 讲「具体做什么、做到什么程度算完」:

| # | 文档 | 内容 |
| --- | --- | --- |
| 00 | [从这里开始](./00-START-HERE.md) | 入口:读的顺序、三条门禁命令、领卡方式、三个真相源（**实现 agent 从这里开始**） |
| 08 | [Agent 执行手册](./08-agent-guide.md) | 十条硬规则 H1–H10、错误怎么抛、测试怎么写、分支与 PR 规范、八条已知陷阱 |
| 09 | [仓库现状快照](./09-repo-state.md) | 每个已落地文件的对外接口逐一列出、待建文件、缺口 G1–G10 |
| 10 | [M1 任务卡:存储层与 Job 引擎](./10-tasks-m1.md) | T01–T08,每卡含精确导出签名与验收断言 |
| 11 | [M1 任务卡:HTTP、SSE、Shell 侧](./11-tasks-m1-http.md) | T09–T13,含 M1 完成判定 |
| 12 | [M1 补卡与 M2 任务卡](./12-tasks-m2.md) | T14（JSON → SQLite 迁移,M1 漏卡）、T15–T23（轻域切换与前端数据层） |
| 13 | [M3 任务卡](./13-tasks-m3.md) | T24–T33（插件域、桥搬迁、反向通道白名单、pid 台账、Job handler） |
| 协议 | [Agent 交接协议](./AGENT-PROTOCOL.md) | GitHub 派单、HANDBACK、巡检与独立 worktree 规则 |

> 💡 **为什么要多这一层。** 人看不懂会来问,agent 不问 —— 它按自己的理解发明。而几个 agent 各自为同一个概念发明不同名字,就是契约漂移最常见的来源。08–13 篇的目的不是把设计写得更清楚,而是**消除自由度**:列名一律照 `001_init.sql`,事件名与错误码一律从 `packages/contracts` 取,状态字符串一律从 `jobs/state-machine.js` 取。

> 💡 **任务卡不重复路由表。** 12/13 篇的卡只写「实现 03 篇 §4.x 表中的哪一节」与「怎么对账」,不把表格内容抄进卡里。理由是已经吃过一次:13 个通用错误码的状态映射同时存在于契约包与 `http/middleware.js`,两份就是 09 篇里的缺口 **G3**。任何一份契约信息在仓库里出现第二次,它就已经开始漂了。

对应的可运行代码在仓库根的 [`spike/`](../../spike/) 目录;契约包在 [`packages/contracts/`](../../packages/contracts/)。

## 九、当前进度

截至 2026-08-16,`main` 的真实状态如下:

| 产出 | 位置 | 状态 |
| --- | --- | --- |
| M0 验收 | [07 篇 §7](./07-spike.md) | ✅ E1–E10 真机完成;E7 为预期的 3/4,第 2 条清算归 T20 |
| 原任务卡进度 | [10–13 篇](./10-tasks-m1.md) | **1/33**:仅 T03 / [#9](https://github.com/dengyie/OpenPet/issues/9) 完成;不得声称 M1–M3 已完成 |
| 契约包首版 | [`packages/contracts/`](../../packages/contracts/) | ✅ 信封、错误码、Job、SSE 事件、反向通道 |
| 契约门禁 | [`scripts/check-api-contract.mjs`](../../scripts/check-api-contract.mjs) | ✅ 可运行:`npm run check:api-contract` |
| 打包 sidecar | [02 篇 §8](./02-architecture.md) | ✅ E6 命中 R20 后采用 `asarUnpack` + `app.asar.unpacked` resolver |
| 后端骨架 | [`services/backend/`](../../services/backend/) | ✅ 入口、router、中间件链、桥层、SQLite driver、Job 状态机、`001_init.sql` |
| 新增验收卡 | #41 §5 卡面 / #41 §4 进度 | ⏳ T34 contracts 打包、T35 file-backed WAL、T36 显式 CI 门禁;均不计入原 1/33 |

**下一步的顺序:**

1. **领卡与 agent 交互看 [#41](https://github.com/dengyie/OpenPet/issues/41)**,以动态标签筛选和卡内依赖为准。
2. **验收结论与文档欠账看 [#41](https://github.com/dengyie/OpenPet/issues/41)**;缺口 G1/G11 分别归 T34/T35 的 #41 §5 卡面与 #41 §4 进度。
3. **原 T01–T33 当前可直接认领 T01、T05、T12、T20**;T03 已完成,其余按 10/11 篇主链推进。
4. **M2 与 M3 的卡已写好,不代表阶段已完成。** T20 无后端依赖可并行,其余以各卡「依赖与阻塞」为准。

> ⚠️ **一处有意的顺序偏离,记录在此以免日后误判。** 原计划是「spike 5(`npm run pack` 手验安装包)绿了之后才动根 `package.json` 的 `workspaces` 与 `build.files`」。实际执行中这一步提前做了,因为后端骨架与 `test:backend` 都依赖 workspaces 才能装依赖与跑测试。**代价是**:若 spike 5 报错,打包问题会与 workspaces 改动混在一起,定位变难(这正是 R10 的形状)。**缓解**:这两处改动集中在单个提交 `304a5a34` 内,可整体 revert 后再单独验证打包。

> ⚠️ **缺口 G1 已重新打开。** E2 只证明 `build:contracts` 能运行,但 `dist/` 未入库,打包与 CI 都没有显式调用该脚本;修复归 T34 的 #41 §5 卡面与 #41 §4 进度。SQLite file-backed WAL 的未决证据归缺口 G11 / T35,同样以 #41 §5 卡面与 #41 §4 进度为准。

> 原任务卡文档统计为 **1/33**(T01–T33);#41 §4 总控任务板含 T34–T36,按 **1/36** 统计。

> ⚠️ **`SETTINGS_*` 的归属与 06 篇 §4 的字面说法不一致。** 06 篇把设置域列为 M2 第 4 项,但它实际已由 M1 的 T03(设置存储 + 乐观锁)与 T10(5 条路由)完成,M2 只剩前端切换。**不要按 06 篇 §4 再实现一遍后端设置域** —— 这一条在 [12 篇 §2.0](./12-tasks-m2.md) 有对照表。

## 十、变更记录

| 版本 | 日期 | 变更 | 作者 |
| --- | --- | --- | --- |
| v1.0 | 2026-08-09 | 首版草案,基于 `c56a3f1` 全量代码盘点 | mango |
| v1.1 | 2026-08-09 | 深入 review 后修复:新增 ADR-010–017 并关闭全部待定决策;补性能预算（03 §10）与端口 ready 门禁;补 M0 spike、R16、R17;新增 07 篇 spike 代码骨架与判定分支 | mango |
| v1.2 | 2026-08-14 | 随代码进入仓库,本目录成为权威副本;修正 hub 标题版本号与 ADR-013 的连接符;07 篇 §0 补 `03-frontend-gate/package.json`,§3 第 2 条断言标注为已知红 | mango |
| v1.3 | 2026-08-15 | 03 篇 §5 补登 `system.jobs-recovered` 与 `system.events-dropped`（此前只写在 04 篇 §2.6）,并补全 8 个 topic 的可选值清单、明确 `system` 不受订阅过滤;新增 `packages/contracts` 首版与可运行的 `scripts/check-api-contract.mjs`;新增§九当前进度（含下一步顺序约束）;Notion 原稿已降为归档副本 | mango |
| v1.4 | 2026-08-15 | 新增 agent 执行文档层:00 入口、08 执行手册、09 仓库现状快照、10/11 篇 M1 全部 13 张任务卡;§八 索引改为「设计文档 / 执行文档」两组;§一 读者表新增实现 agent 行;§九 刷新为后端骨架与根 `package.json` 已落地,并记录 workspaces 提前改动这一有意的顺序偏离与其缓解手段;清除 §九 中「`packages/contracts` 尚未接入 workspaces」的陈旧说明 | mango |
| v1.5 | 2026-08-15 | 新增 12 篇(T14 M1 补卡 + T15–T23 M2)与 13 篇(T24–T33 M3),任务卡总数 13 → 33;04 篇 §2.6 的过期注记已关闭(G7);06 篇 §9 补登 **R20 ESM-in-asar** 并收紧 spike 5 的判定标准(G8);§九 修正 v1.4 的一处笔误 ——「M2(AI 40 通道)」应为轻域 40 通道,AI 37 通道在 M4;新增 `SETTINGS_*` 归属说明,避免按 06 篇 §4 重复实现;整条分支已摊在 draft PR #6 | mango |
| v1.6 | 2026-08-16 | 基线切到 `main`;M0 E1–E10 完成,E7 3/4 为预期红;原任务卡 1/33;采用 `asarUnpack`;缺口 G1/G11 统一指向 #41 §5 卡面与 #41 §4 进度;新增 #41 领卡与验收入口 | mango |
