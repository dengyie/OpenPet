# 00 · 从这里开始(实现 agent 入口)

> v1.3 · 2026-10-04 · 基线分支 `main`

> **文档状态：迁移执行参考，不是当前唯一任务队列。** 当前代码已部分
> 落地 sidecar/backend；本目录保留设计和任务卡的历史上下文。当前工作优先读
> [`../development-workflow.md`](../development-workflow.md)、[`../HANDOFF.md`](../HANDOFF.md)
> 和 [`../TODO.md`](../TODO.md)，再按任务需要回查本目录。

你被叫来维护 OpenPet 的前后端分离重构。本文的目标设计和任务卡仍有参考价值，
但不得把未登记在当前代码和 `check:api-contract` 中的目标能力当成已交付功能。

## 读的顺序

1. **[08 执行手册](./08-agent-guide.md)** —— 十条硬规则、错误怎么抛、测试怎么写、分支与提交规范。先读完。
2. **[09 仓库现状](./09-repo-state.md)** —— 哪些文件已存在、它们导出什么、已知缺口 G1–G11。
3. **你的任务卡**:
   - M1:[10 存储层与 Job 引擎](./10-tasks-m1.md)(T01–T08)、[11 HTTP/SSE/Shell](./11-tasks-m1-http.md)(T09–T13),外加 [12 篇](./12-tasks-m2.md) 里的 **T14**(JSON → SQLite 迁移,M1 补卡,收尾必做)。
   - M2:[12 篇](./12-tasks-m2.md) T15–T23(轻域与前端接线)。
   - M3:[13 篇](./13-tasks-m3.md) T24–T33(插件域与反向通道)。
   - **等 M1 全绿再开 M2/M3 的卡。** 卡已经写好了,不代表现在就该做。
4. 需要背景才去翻 01–07 篇(设计文档,主要给人看)。`packages/contracts/src/` 是已迁移契约的源；**[03 接口契约](./03-api-contract.md)** 是目标映射与文档对账面，改任一侧都必须同步代码和门禁。

> 🔧 **如果你手上有真机**(能跑 Electron、能打包):先看 **[14 交接单](./14-handoff.md)** —— 六条 spike 与历史 E1–E10 执行记录在那里。只写代码的人不必读它。

## 装一次,门禁顺序

```bash
npm install                 # 首次会大改 package-lock.json,这是预期(G5)
npm run build:contracts     # 生成 @openpet/contracts/dist
npm run check:node          # 语法
npm run test:backend        # 单测
npm run check:api-contract  # 契约与文档对账
npm run check:channel-retirement
npm run check:docs-drift
```

**以上门禁必须按变更等级执行并如实记录。** `check:api-contract` 当前会对账
`140` 个 IPC、`120/119` 个 REST 路由单元；若缺少 `packages/contracts/dist`，先构建
workspace，不要把环境错误当成路由缺失。

`check:api-contract` 当前是硬门禁：会对账契约枚举、IPC 清单、文档路由和
`services/backend/routes/registry.js`。缺少 `packages/contracts/dist` 时先运行
`npm run build:contracts`；环境缺包不能被解释成路由未注册。

## 领卡方式

一卡一分支一 PR,分支名形如 `refactor/t07-jobs-runner`,在独立 worktree 中从最新 `main` 切出,PR base 也必须是 `main`。

依赖关系看卡顶部的**依赖与阻塞**字段。原 T01–T33 的认领顺序是历史参考；当前优先级和方法级修改边界以 `docs/superpowers/plans/2026-10-04-openpet-development-plan.md` 与 `TODO.md` 为准。

## 最重要的一条

**卡里没写的不要发明。**

几个 agent 各自为同一个概念发明不同名字(`jobId` / `job_id` / `taskId`),是这类重构死法的第一名。所以:列名一律照 `001_init.sql`,事件名与错误码一律从 `@openpet/contracts` 取,状态字符串一律从 `jobs/state-machine.js` 取。

发现卡写错了或漏了:**先改文档,和代码同一个 PR**。不要一声不响地按自己的理解实现。

同理,**任务卡不重抄路由表**。卡里写「实现 03 篇 §4.6 那一节」,你就去 03 篇读那张表,不要指望卡里有一份副本 —— 副本一出现就开始漂(G3 就是这么来的)。

## 已落地的代码怎么对待

`services/backend/` 下已有的文件(路由器、中间件、桥层、`db.js`、`state-machine.js`、`001_init.sql`)是**样板**。

按现状用,不要重写,不要改签名 —— 新文件的风格向它们对齐(tab 缩进、工厂函数 + 注入依赖、纯函数优先)。

⚠️ **唯一的例外是 `packages/contracts/**`:那里是 2 空格缩进,不是 tab。** 跳目录复制代码时注意。

## 文档地图

| 篇 | 内容 | 受众 |
| --- | --- | --- |
| 00 | 本文件,入口 | agent |
| 01–02 | 现状盘点、目标架构与 ADR 001–017 | 人 |
| 03 | **接口契约**(路由、错误码、事件目录、预算) | 人 + agent |
| 04 | 子系统详设(Job 引擎、存储、密钥、日志) | 人 + agent |
| 05 | 前端改造(F1–F14) | 人 |
| 06 | 路线图、风险 R1–R20、决策 D1–D8 | 人 |
| 07 | 六条 spike 的设计与判定(§7 是唯一权威结果表) | 需真机的人 |
| 08 | **执行手册** | agent |
| 09 | **仓库现状快照** | agent |
| 10–11 | **M1 任务卡 T01–T13** | agent |
| 12 | **M1 补卡 T14 + M2 任务卡 T15–T23** | agent |
| 13 | **M3 任务卡 T24–T33** | agent |
| 14 | **交接单:必须在真机上跑的 E1–E10** | 有真机的人 / agent |

## 当前状态

- 设计文档完成,8 个决策点全关闭。
- 后端**骨架**已落:入口、路由器、中间件链、桥层、SQLite 驱动、Job 状态机 + 单测、初始迁移、契约包 + 门禁。
- M0 的 spike 与 sidecar/backend/contracts 基础设施已落地；E1–E10 的历史证据仍见 [07 篇 §7](./07-spike.md)，不等同于所有迁移能力完成。
- M1–M3 任务卡是历史迁移参考，当前优先级与验收以 [`../TODO.md`](../TODO.md)、[`../HANDOFF.md`](../HANDOFF.md) 和 [`../superpowers/plans/2026-10-04-openpet-development-plan.md`](../superpowers/plans/2026-10-04-openpet-development-plan.md) 为准；不要使用旧的 `1/33` 计数判断当前进度。
