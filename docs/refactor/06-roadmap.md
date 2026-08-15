# 06 · 迁移路线图、测试门禁与风险登记

> 🗺️ 本篇是执行层:每个里程碑做什么、怎么验收、怎么回滚,以及哪些风险会真的发生。总量约 **12 人周**(含测试与文档) —— 全职单人约 3 个月,业余每周投入 10 小时约 10 个月。

## 1. 里程碑总览

| 阶段 | 名称 | 周数 | 核心产出 | 可发布 |
| --- | --- | --- | --- | --- |
| M0 | 契约与骨架 | 1.5 | `packages/contracts` + 空壳 sidecar | ✅ 无感知 |
| M1 | 进程骨架与存储 | 2 | 启停管理、SQLite、密钥迁移 | ✅ 无感知 |
| M2 | 轻域切换 | 2 | settings/about/catalog/service | ✅ 可发布 |
| M3 | 插件与 Job | 3 | 插件域 + Job 引擎 + 反向通道 | ⚠️ 建议仅预发布 |
| M4 | AI 与 Creator | 2.5 | 37 个 AI 通道 + Creator + 删 demo-api | ✅ 可发布 |
| M5 | 清理与固化 | 1 | 删 IPC 残留、样式拆分、文档 | ✅ 可发布 |

```text
M0 ──► M1 ──► M2 ──► M3 ──► M4 ──► M5
1.5w    2w      2w      3w     2.5w    1w
 │       │       │       │      │      │
 └──────┴───────┴───────┴──────┴──────┴──► 每阶段结束都能停住
                                        (不得出现「停不下来」的中间态)
```

> 📌 **最重要的约束:每个里程碑结束时代码都必须能正常构建、正常跑、正常打包。** 不允许出现「改到一半跑不起来」的状态超过一天。这是单人项目的生存线 —— 一旦跑不起来,反馈环断了,重构就会卡死。

## 2. M0 · 契约与骨架(1.5 周)

### 第 0 步:六条 spike(半天,必须先做)

在写任何契约之前,先用最小代码验证六条假设。**这个 spike 会直接逼出 D1、ADR-010、ADR-014、端口时序四个答案,比继续完善文档有效得多。**

❗ **六条验证的可跑代码已经写好**,在仓库 `spike/` 目录下,逐条的断言表、跑法与已知红项见 [07 篇](./07-spike.md)。推荐跑序 `6 → 1 → 2 → 5 → 3 → 4`。

1. Electron 主进程 `child_process.fork` 一个 Node 脚本 —— 验证 D1 的进程形态。
2. 脚本 `listen(0)` 拿到端口,通过 `ready` 消息回传主进程 —— 验证端口发现时序(见 [03 篇 §1.2](./03-api-contract.md))。
3. 主进程注入渲染进程,前端发一个 `fetch` 拿到 200 —— 验证就继门禁与请求排队。
4. 在脚本里尝试 `require("electron")` —— **确认 `safeStorage` 确实不可用**,为 ADR-010 留下证据。
5. 立即跑一次 `npm run pack` 并手动打开安装包 —— 验证 sidecar 在 asar 内的路径解析。**判定标准是「打包后的 sidecar 真的发出了 `ready` 消息」,不是「路径能解析出来」** —— `services/backend` 是 ESM 包,而 Electron 的 asar 补丁只覆盖 `fs` 与 CJS `require`,ESM loader 解析 `app.asar` 内的入口并不在覆盖范围(风险 R20)。这一条只在打包后才会暴露,开发态永远是绿的。
6. 在同一个脚本里 `require("node:sqlite")` 并建一张表 —— **验证 ADR-014 的前提**。sidecar 跑的是 `ELECTRON_RUN_AS_NODE` 下的 Electron 内置 Node,`node:sqlite` 到底暴露不暴露、是否仍要 `--experimental-sqlite`,只有实测能确认。不可用就当场切 `better-sqlite3`,此时 R11(公证)重新升为高风险。

这 6 条全绿才进入下面的正式任务。任何一条不通,先改方案而不是先写契约。

### 任务

1. 建 `packages/contracts`,从 `openpet-contracts.ts`(96.6 KB)抽出请求/响应 schema
2. 定义统一响应体与错误码枚举(见 [03 篇 §2](./03-api-contract.md))
3. 定义 154 个通道的去向清单(见 [03 篇 §3](./03-api-contract.md))
4. 建 `services/backend`,只实现 `GET /health` 与 `GET /api/v1/about`
5. 建 `apps/desktop/src/sidecar/spawn.js`,能启停并健康检查
6. 新增 `npm run check:api-contract`(实现与 schema 对账)
7. 新增 `tests/backend/` 目录与首个契约测试
8. 按 **ADR-012** 把 `openpet-contracts.ts` 搬为 `packages/contracts/legacy.ts`,原路径改为薄壳 re-export
9. 反向通道骨架落地 **ADR-011** 的 `v: 1` 信封与「版本不符即重拉」逻辑
10. 按 **ADR-017** 建 npm workspaces 根配置(`apps/*`、`services/*`、`packages/*`),并同步扩 `build.files` 白名单;第一个 commit 只调目录不改逻辑
11. 按 **ADR-013** 写 `services/backend/http/router.js`(约 150 行),按 **ADR-016** 用 zod 写首批 schema 并以 `z.infer` 导出类型

### 验收

- `npm start` 后能看到 sidecar 进程,`curl 127.0.0.1:<port>/health` 返 200
- 关闭应用后 sidecar 进程消失(`ps` 验证)
- 现有全部测试与 `pack` 仍通过
- 宠物行为零变化
- **`pack` 产物里 sidecar 路径正确**,安装包能真的启动 sidecar(不拖到 M5 才发现)
- 前端在 sidecar 未就继时不报错,请求被正确排队后冲刷

### 回滚

删除 sidecar 启动调用(一行),应用回到现状。风险极低。

## 3. M1 · 进程骨架与存储(2 周)

### 任务

1. 完整启停生命周期(见 [02 篇 §4](./02-architecture.md):12 步启动 / 6 步关闭 / 崩溃重拉)
2. 双 token 机制(会话 token + 外部 token)
3. SQLite 接入 + `001_init.sql`
4. JSON → SQLite 迁移与回滚
5. 密钥服务搬迁,按 **ADR-010** 落地:Shell 侧 `safeStorage.decrypt` → `init` 消息一次性注入 → 后端只持内存副本,永不落盘、永不进日志、永不出现在任何响应体。`safeStorage.isEncryptionAvailable()` 为 false 时退回 0600 权限明文文件,并在界面显式告警
6. 日志与 `requestId` 贯穿
7. 反向通道骨架(白名单 + 校验,先只通 `pet.say`)
8. 子进程 pid 台账与孤儿清理

### 验收

| # | 验收项 |
| --- | --- |
| A1 | 后端被 `kill -9` 后 3 秒内自动重拉,重拉 3 次后停止并提示 |
| A2 | 宠物在后端崩溃期间完全正常(漫步、拖拽、右键菜单) |
| A3 | 迁移后对话数据条数与旧 JSON 一致 |
| A4 | 迁移失败时自动回滚,旧数据完好 |
| A5 | 密钥迁移后旧密钥仍可用,且日志里无明文 |
| A6 | 杀残留插件子进程生效(手工造孤儿验证) |
| A7 | 两个实例无法同时占用同一端口(单实例锁生效) |
| A8 | 后端进程的日志与诊断包中均搜不到密钥明文(ADR-010 验证) |
| A9 | 手动换成旧版 sidecar 启动,Shell 因 `v` 不符重拉 2 次后进降级模式(ADR-011 验证) |

### 回滚

SQLite 与 JSON 双写一个迭代,以 JSON 为准;确认无差异后切单写。

> ⚠️ **M1 是风险最高的阶段,不是 M3。** 因为它动了数据层与密钥 —— 这两个出错是不可逆的用户数据丢失。插件出错大不了重装。**建议 M1 全程双写,并在真机用自己的真数据跑满一周再进 M2。**

## 4. M2 · 轻域切换(2 周)

### 任务

按风险升序切换:

1. `ABOUT_*`(2 个)—— 零风险,验证链路通
2. `SERVICE_*`(7 个)—— 本地 HTTP 服务管理(注意嵌套:后端管理另一个 HTTP 服务)
3. `CATALOG_*`(6 个)—— 只读为主
4. `SETTINGS_*`(5 个,不含留在 IPC 的 OPEN/CLOSE)—— **同时完成 `PATCH` + 乐观锁改造**
5. `PET_PACKS_*`(8 个)—— 含文件导入,首次验证两段式弹框
6. `ACTIONS_*`(12 个)—— 含帧导入,首次验证 Job(可提前引入简易 Job)
7. 前端 `api/client.ts` + `transport.ts` + `useSse` 上线

### 验收

- 上述 40 个通道前端已无 `ipcRenderer.invoke`
- 设置修改能在 500 ms 内通过 SSE 反映到宠物(如缩放)
- 并发修改同一设置字段时能正确返 409
- 两段式文件导入在 mac 与 Windows 都通
- 断网/后端杀掉时降级横幅正确出现

### 回滚

每个域独立开关:`transport: "http" | "ipc"`。出问题改回 `ipc` 即恢复。IPC 处理器在 M5 前不删。

> 💡 把 `SETTINGS_*` 放在 M2 而不是更早,是因为它要同时改接口语义(`SAVE` → `PATCH`)。先用 about/service/catalog 把链路、鉴权、错误处理、SSE 都跑通,再动设置。

## 5. M3 · 插件与 Job(3 周)

### 任务

1. Job 引擎完整实现(队列、状态机、进度、取消、恢复)
2. `PLUGINS_*` 25 个通道迁移(23 转 HTTP;`OPEN_DASHBOARD` 与 `INSPECT_PACKAGE` 留 IPC,与 [03 篇 §3](./03-api-contract.md) 的 25/2/23 一致)
3. `plugin-runtime-bridge-server.js` 搬入后端
4. `plugin-command-bridge-server.js` 搬入后端
5. 反向通道完整白名单(pet.say / playAction / event / dialog / window)
6. 插件子进程父进程切换 + 孤儿回收
7. 插件日志转 SQLite + SSE 推送
8. 前端 `useJob` + 全局任务面板

### 验收

| # | 验收项 |
| --- | --- |
| B1 | 现有内置插件全部正常安装、启动、停止 |
| B2 | 插件调 `pet:say` 能正确让宠物说话(反向通道打通) |
| B3 | 插件调未授权能力被拒,且拒给发生在后端 |
| B4 | 插件 dashboard 窗口能正常开启并在插件停止时关闭 |
| B5 | 图像生成 Job 完整跑完 265s 不断链,进度正常 |
| B6 | Job 运行中刷新面板,进度不丢 |
| B7 | Job 运行中杀后端,重启后标为 `interrupted` 且可重试 |
| B8 | 取消 Job 能真止住子进程(`ps` 验证) |
| B9 | 杀 sidecar 后无残留插件进程(或下次启动被清) |
| B10 | `validate:plugin` 与全部插件相关测试通过 |

### 回滚

插件域整体回滚开关(`plugins.transport = "ipc"`)。但注意:**桥服务器一旦搬迁,回滚需同时回滚桥的位置**,比其他域复杂。建议在单独分支做,满足全部验收后才合入。

> ⚠️ **M3 不建议直接发布。** 插件域涉及子进程、权限、窗口三重跳进程交互,集成测试很难盖全。建议自己日常用两周再发。

## 6. M4 · AI 与 Creator(2.5 周)

### 任务

1. AI 域 37 个通道全量迁移
2. `ai-talk-service.js`(80 KB)与 `ai-service.js`(77 KB)搬入后端
3. `ai-talk-store.js`(56 KB)改为 SQLite 仓库层
4. 对话流式输出改 SSE
5. `image-generation-model-service.js`(74 KB)接 Job
6. `hatch-pet-agent-*`(6 个文件)搬入后端,预算账本入库
7. `CREATOR_*` 13 个通道 + `creator-workflow-service.js`(**165 KB,单体最大**)
8. **删除 `demo-control-center-api.ts`**(181 KB),MSW 全面接管
9. AiPane / CreatorPane 拆分

### 验收

| # | 验收项 |
| --- | --- |
| C1 | `smoke:ai-provider` 通过 |
| C2 | `smoke:creator-studio-provider` 通过 |
| C3 | `smoke:creator-workflow-host` 通过 |
| C4 | `run-ai-talk-local-smoke` 通过 |
| C5 | `run-agent-awareness-local-smoke` 通过 |
| C6 | 对话流式输出逗号级延迟无可感退化 |
| C7 | 密钥在前端完全不可见(DevTools 网络面板验证) |
| C8 | `dev:control-center` 用 MSW 能跑完主要流程 |
| C9 | Creator 完整工作流跑通且可取消 |
| C10 | `test:control-center` 全部通过 |

### 回滚

AI 与 Creator 可分开回滚。但 `demo-control-center-api.ts` 删除不可逆(除非 git revert),所以**要放在 M4 最后一步**,并单独一个 commit。

## 7. M5 · 清理与固化(1 周)

### 任务

1. 删除 113 个已迁移通道的 IPC 处理器
2. `ipc.js`(41.5 KB)与 `control-center-adapters.js`(73.1 KB)清空或大幅缩减
3. `control-center-preload.js` 降到 5 KB 以下
4. 删除 `ipcTransport`
5. `src/shared` JS/TS 双版本漂移治理(单一真相源)
6. `styles.css` 拆分 + design-system token
7. 文档更新:`AGENTS.md`、`STARTUP-GUIDE.md`、`PROJECT-SUMMARY.md`、`docs/project-context.json`
8. `check:docs-drift` 扩展到新结构

### 验收

- 全部测试与 evidence 脚本通过
- `pack` 与 `dist` 在 mac / Windows 两平台成功
- 安装包体积变化在 ± 15% 内
- 冷启动到宠物可见时间不劣于现状
- 内存占用总和增幅低于 80 MB
- **[03 篇 §10](./03-api-contract.md) 的性能预算全部达标**(`tests/backend/perf.test.js` 保绿)

## 8. 测试门禁矩阵

### 8.1 现有门禁(必须全程保绿)

| 命令 | 作用 | M0 | M1 | M2 | M3 | M4 | M5 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `check:node` | Node 版本与环境 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `typecheck` | TS 类型 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `check:syntax` | 语法 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `check:docs-drift` | 文档漂移 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `test:core` | 核心单测 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `test:core:all` | 全量核心 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `test:tools` | 工具链 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `test:control-center` | 前端 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `validate:plugin` | 插件校验 | — | — | — | ✅ | ✅ | ✅ |
| `smoke:ai-provider` | AI 烟雾 | — | — | — | — | ✅ | ✅ |
| `smoke:creator-studio-provider` | Creator 烟雾 | — | — | — | — | ✅ | ✅ |
| `smoke:creator-workflow-host` | 工作流宿主 | — | — | — | — | ✅ | ✅ |
| `run-ai-talk-local-smoke` | 对话烟雾 | — | — | — | — | ✅ | ✅ |
| `run-agent-awareness-local-smoke` | 代理感知 | — | — | — | — | ✅ | ✅ |
| `pack` | 打包 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 8.2 新增门禁

| 命令 | 作用 | 引入阶段 |
| --- | --- | --- |
| `check:api-contract` | 实现与 schema 对账,缺失/多余路由报错 | M0 |
| `test:backend` | 后端单测与契约测试 | M0 |
| `test:integration` | 真启两进程跑关键链路 | M1 |
| `check:preload-size` | preload < 5 KB | M2(先设宽松阀值) |
| `check:file-size` | 单文件 < 400 行 | M4 |
| `test:degraded` | 后端不可用时的降级行为 | M2 |
| `test:resilience` | 杀进程/断 SSE/超时注入 | M3 |

### 8.3 必须新建的测试类型

| 类型 | 覆盖内容 | 工具 |
| --- | --- | --- |
| 契约测试 | 每个路由的请求/响应 schema | zod + vitest |
| 进程生命周期 | 启动、关闭、崩溃重拉、端口冲突 | node:test + 真子进程 |
| 降级行为 | 后端不可用时各 pane 表现 | Playwright + MSW |
| SSE 可靠性 | 断线重连、Last-Event-ID、背压 | 集成测试 |
| Job 生命周期 | 创建、进度、取消、中断恢复 | 集成测试 |
| 存储迁移 | JSON → SQLite 正向与回滚 | 单测 + 真文件 |
| 安全 | 未鉴权拒给、路径逃逸、权限越界 | 单测 |
| 反向通道 | 白名单之外消息被丢弃 | 单测 |

## 9. 风险登记册

| ID | 风险 | 概率 | 影响 | 缓解措施 |
| --- | --- | --- | --- | --- |
| R1 | 存储迁移丢用户数据 | 中 | **极高** | 双写一个迭代、自动备份、条数对账、旧 JSON 不删 |
| R2 | 孤儿插件进程 | **高** | 中 | pid 台账 + 启动清理 + 进程名校验 |
| R3 | 启动变慢(多一个进程) | **高** | 低 | 宠物不等后端([02 篇 §4](./02-architecture.md) 第 8 步),后端异步就继 |
| R4 | 本机其他进程冒充前端 | 中 | 高 | 会话 token 每次启动随机、仅 loopback、timingSafeEqual |
| R5 | 密钥加密降级(sidecar 内无 safeStorage) | **已消除** | 中 | 已由 ADR-010 定案:Shell 解密 + `init` 一次性注入。仅剩「系统不支持加密」的退化路径,需界面告警 |
| R6 | Job 引擎超出预估工量 | 中 | 中 | M0 先做最小可用版(无持久化),M3 再完善 |
| R7 | `creator-workflow-service.js` 165 KB 难搬 | **高** | 中 | 整体平移不拆,仅改入口与依赖注入 |
| R8 | 契约与实现漂移 | 中 | 中 | `check:api-contract` 入 CI,从 M0 开始 |
| R9 | JS/TS 双版本共享层漂移加剧 | **高** | 中 | M5 治理;期间只改 TS 并自动生成 JS |
| R10 | 打包后 sidecar 路径错误 | 中 | 高 | M0 就跑 `pack` 并手验安装包,不拖到 M5 |
| R11 | macOS 公证因新二进制失败 | 中 | 高 | 纯 JS sidecar(不引入 native),沿用现有 entitlements;M0 就跑 `pack` 验证 |
| R12 | 端口未就继时前端已发出请求(冷启动竞态) | **必然发生** | 中 | 端口 0 自动分配;前端强制走 [03 篇 §1.2](./03-api-contract.md) 就继门禁与请求排队,`getBackend()` 返 `null` 视为正常初始态而非错误 |
| R13 | 内存占用上升 | **高** | 低 | 目标 < 80 MB 增幅,作为 M5 验收项 |
| R14 | 单人项目 12 周周期中断 | **高** | 中 | 每阶段可停住;每个里程碑都能发布 |
| R15 | 反向通道成为提权通道 | 低 | **极高** | 严格白名单、Shell 硬编码窗口参数、不执行后端传的任意路径 |
| R16 | 已发布版本回退后读不到新数据(M2/M4 发版后再 revert) | 中 | **极高** | 双写必须覆盖「已发布版本回退」而不只是开发期:入 SQLite 的同时继续追加写旧 JSON,直到下一个大版本才停双写 |
| R17 | 多一跳回环 HTTP 导致面板体感变慢 | 中 | 中 | [03 篇 §10](./03-api-contract.md) 的 P95 预算入 CI;超标即按表中「超标处理」加缓存或拆端点 |
| R18 | `node:sqlite` 在 Electron 内置 Node 下不可用或仍需启动 flag(ADR-014 前提不成立) | 中 | 中 | §2 spike 第 6 条先验,不等到 M1 才发现;`store/db.js` 只暴露 driver 接口,换 `better-sqlite3` 只需替一个实现文件,仓库层零改动 |
| R19 | TanStack Query 退化成第二套状态模型(组件里到处 `useQuery`) | 中 | 中 | `useQuery` 只允许出现在 pane 级 hook;`staleTime: Infinity` + 关闭聚焦重取;失效入口统一收在 `useSse` 的事件处理里,review 时按此卡 |
| R20 | sidecar 是 ESM 包却跑在 `app.asar` 内,ESM loader 不在 Electron 的 asar 补丁覆盖范围 | 已缓解 | 高 | E6 实测 app.asar 内 `cwd` 导致 `spawn ENOTDIR`;采用 `build.asarUnpack` 的 `services/backend/**` 和 unpacked 入口解析。打包 Electron 已收到 ready;代价是后端代码以明文落在安装目录 |

### 9.1 最值得盯的三个

> 🚨 **R1(数据丢失)** —— 唯一不可逆的风险。其他全部能回滚代码解决,这个不能。
> **R15(反向通道提权)** —— 概率低但后果严重,且一旦设计错了很难事后补。
> **R14(项目中断)** —— 对单人项目而言这是最现实的风险,所以架构必须允许「停在任何阶段都可用」。

## 10. 决策台账(全部已关闭)

| ID | 决策 | 备选项 | 状态 | 结论 |
| --- | --- | --- | --- | --- |
| D1 | 后端进程形态 | `utilityProcess` vs `child_process.fork` vs 独立二进制 | ✅ 已验证 | **`fork`**:Electron 42.4.0 / Node 24.16.0 实测 IPC 双向可用,ready +145 ms,不依赖 Electron API |
| D2 | 后端 HTTP 框架 | 原生 `node:http` vs Hono vs Fastify | ✅ ADR-013 | **原生 `node:http` + 自写约 150 行 router**:method/path 匹配、路径参数解析、middleware 函数数组、统一错误兜底。鉴权、body 上限、访问日志三块直接复用 `local-http-service.js` 的实现经验 |
| D3 | 密钥加密 | 反向通道每次代理 vs 后端自管密钥文件 | ✅ ADR-010 | Shell 侧 `safeStorage` 解密,经 `init` 消息一次性注入后端内存;两个备选项均被否决(一个多一跳、一个丢钥匙串) |
| D4 | SQLite 驱动 | `node:sqlite` vs `better-sqlite3` | 🟡 ADR-014 | **`node:sqlite`** 在 Electron 42.4.0 / Node 24.16.0 无需 flag且索引/事务可用;G11 尚须以 file-backed DB 验证 WAL。`store/db.js` 保持可替换 driver 接口 |
| D5 | 前端数据层 | TanStack Query vs 自写 `useResource` | ✅ ADR-015 | **TanStack Query**。四条硬约束:`staleTime: Infinity`、关闭 `refetchOnWindowFocus`、缓存失效只由 SSE 事件触发、`useQuery` 只允许出现在 pane 级 hook 中 |
| D6 | 契约 schema 工具 | zod vs TypeBox vs 手写 | ✅ ADR-016 | **zod**。schema 是唯一真相源,类型由 `z.infer` 派生;后端请求与响应都校验,前端仅 dev 模式校验,生产构建把 zod tree-shake 掉(前端零体积代价) |
| D7 | 外部 HTTP/MCP 服务位置 | 后端内嵌 vs 保留现位 | ✅ 已关闭 | **后端内嵌**,与业务服务同进程;**必须继承原对外端口与路径**,否则违反「不改 MCP 对外行为」这条非目标(见 [03 篇 §8](./03-api-contract.md)) |
| D8 | 是否引入 monorepo 工具 | npm workspaces vs 无 | ✅ ADR-017 | **npm workspaces**,零新依赖。根 `workspaces: ["apps/*", "services/*", "packages/*"]`。注意工作区依赖会 hoist 到根 `node_modules`,`build.files` 白名单必须同步更新,否则打包后缺依赖 |

> ✅ **8 项决策已全部关闭。** D1 → fork(spike 第 1 条确认)、D2 → ADR-013、D3 → ADR-010、D4 → ADR-014、D5 → ADR-015、D6 → ADR-016、D7 见 03 篇 §8、D8 → ADR-017。**开工前不再需要任何技术选型讨论,只剩 spike 的六条验证。**

## 11. Definition of Done

全部完成的定义(逐项可验):

- [ ] `apps/desktop` 不包含任何业务服务(除 PetService 与窗口)
- [ ] `services/backend` 可脱离 Electron 单独启动并通过契约测试
- [ ] 113 个通道已转 HTTP,41 个保留 IPC 且有文档依据
- [ ] `control-center-preload.js` 小于 5 KB
- [ ] `demo-control-center-api.ts` 已删除
- [ ] 后端崩溃时宠物完全正常,面板降级而不白屏
- [ ] 所有长任务走 Job,刷新不丢进度
- [ ] 密钥从未进入渲染进程或日志
- [ ] 存储迁移可正向与回滚,有自动备份
- [ ] 新增 7 个门禁全部入 CI
- [ ] 前端只有一套缓存实现(TanStack Query),无自写并行缓存(ADR-015)
- [ ] `store/db.js` 的 driver 接口可整体替换,换驱动不动仓库层代码(ADR-014)
- [ ] [03 篇 §10](./03-api-contract.md) 性能预算全部达标
- [ ] 反向通道带 `v` 信封,版本不符能正确重拉(ADR-011)
- [ ] `openpet-contracts.ts` 薄壳已删除,类型只剩一份(ADR-012)
- [ ] mac / Windows 安装包均可用,macOS 公证通过
- [ ] 打包后的 sidecar 真的发出 `ready`(R20 已验证,非仅路径可解析)
- [ ] 文档(`AGENTS.md` 等 4 份)已同步,`check:docs-drift` 绿

## 12. 下一步建议

1. **先跑 §2 的六条 spike**(半天)—— 代码已在 `spike/` 目录就继,跑法与断言见 [07 篇](./07-spike.md)。它会直接给出 D1 与端口时序的答案,也会验证 ADR-010 与 ADR-014 的前提
2. **技术选型已全部关闭**(D2 → ADR-013、D4 → ADR-014、D5 → ADR-015、D6 → ADR-016、D8 → ADR-017),开工前不需要再讨论选型;只有 D1 与 ADR-014 的前提要靠 spike 第 1、6 条实测确认
3. **先跑一次 `pack`**,确认当前基线可打包(`docs/project-context.json` 里 `releaseReady: false` 且有 macOS 签名报错待解)
4. **M0 的第一个 commit 建议只做目录调整**(npm workspaces + 目录搬迁),不改逻辑,方便出问题时 revert
5. 实现阶段的任务拆解已经做好:M1 的 13 张任务卡见 [10 篇](./10-tasks-m1.md) 与 [11 篇](./11-tasks-m1-http.md),agent 执行规范见 [08 篇](./08-agent-guide.md),入口在 [00 篇](./00-START-HERE.md)
