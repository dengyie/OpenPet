# 08 · 实现 Agent 执行手册

> v1.1 · 2026-08-16 · 基线分支 `main`

**读者**:领到任务卡去写代码的 agent。
**读法**:本篇 → [09 篇 仓库现状](./09-repo-state.md) → 手上那张任务卡。01–07 篇只在任务卡明确指向某一节时才读,不要通读。

---

## 0. 这一篇为什么存在

01–07 篇是**给人看的设计文档**,讲的是「为什么这么设计」,留了大量需要判断力去填的空白。人碰到空白会回来问;agent 碰到空白会自己发明,而发明是契约漂移的主要来源。

本篇的目标不是解释设计,而是**消除自由度**。

> **总原则:任务卡没写的,不要发明。发现任务卡漏了,先补任务卡再写代码 —— 补的内容和代码放在同一个 PR 里。**

---

## 1. 十条硬规则

违反任何一条,PR 直接打回,不进入功能讨论。

**H1 契约只有一处来源。** `packages/contracts/src/*.ts` 是错误码、事件名、事件归属 topic、Job kind、Job 状态的唯一来源。要新增或改名,必须**同一个提交**里同时改契约和 `docs/refactor/03-api-contract.md` —— `npm run check:api-contract` 会逐字对账,漏一处就红。

**H2 迁移文件不可变。** `services/backend/store/migrations/001_init.sql` 已冻结。任何 schema 变更 = 新增 `002_*.sql`。原因:`schema_migrations` 存每个迁移的校验和,改动已发布的迁移会让**已经升级过的库**启动时校验失败,而这类故障只在用户机器上出现。

**H3 ESM / CJS 边界不能踩错。** 仓库根是 CJS(根 `package.json` 没有 `"type": "module"`);`services/backend/**` 和 `packages/contracts/**` 是 ESM(各自 `package.json` 里有 `"type": "module"`);`apps/desktop/src/sidecar/spawn.js` 必须是 **CJS**(Electron 主进程要 `require` 它);`tests/**` 属于根包,是 CJS。

推论:`tests/` 里测后端模块**必须**在 `before` 钩子里 `await import()`,不能用顶层 `require` 或静态 `import`。照抄 `tests/backend/state-machine.test.js` 的开头。

**H4 不准直接碰 `node:sqlite`。** 一律走 `services/backend/store/db.js` 的 `openDatabase()`。E3 已确认 Electron 42.4.0 / Node 24.16.0 无需 flag,但 G11 仍要求用 file-backed DB 验证 WAL;这个 seam 仍是唯一的逃生口,散落的 `import("node:sqlite")` 会让换驱动变成全仓库改动。

**H5 单一写者。** 一份数据只有一个进程能写:settings / secrets / SQLite → Backend;窗口几何 → Shell(`window-state.json`)。要用对方的数据走消息,不要直接读写对方的文件。

**H6 时间一律 `INTEGER` Unix 毫秒。** 不用 SQLite 日期字符串,不用秒。

**H7 端口和 token 只能从 `ready` 消息拿。** 不许硬编码端口,不许把 sessionToken 写进任何文件或日志。

**H8 每个新模块必须带测试,且不依赖 Electron、不依赖真实 SQLite 文件。** 纯函数直接测,要库就用 `:memory:`。跑法 `npm run test:backend`。做不到说明模块和运行时耦合太紧,先拆再写。

**H9 提交前自己跑三条门禁**,全绿才提交,PR 里贴输出:

```bash
npm run check:node
npm run test:backend
npm run check:api-contract
```

**H10 不要动别人的热点文件。** 见 §6。

**H11 IM Gateway 适配器冻结。** 在 T46 交付前,`examples/plugins/im-gateway/` 不新增适配器,仅接受缺陷修复。原因:新适配器会走即将删除的旧 IPC 链路,放大 M4/M5 切换面。

---

## 2. 编码约定

- **缩进**:`services/backend/**` 用 **tab**(与现有文件一致);`packages/contracts/**` 用 **2 空格**(与 `bridge.ts` 等现有文件一致);根目录脚本用 2 空格。不要混,不要顺手格式化整个文件。
- **命名**:文件 kebab-case;导出 camelCase;常量 SCREAMING_SNAKE_CASE;数值常量用下划线分组(`10_000`)。
- **单文件 ≤ 400 行**(05 篇 §4.2)。超了就拆,不要靠折行糊过去。
- **不许 `console.log`**:走注入的 `logger`。模块不自己造 logger,由调用方传进来 —— 现有文件都是这个形状,例如 `createShellClient({ send, exit, logger })`。
- **不许裸 `throw new Error`**(`spike/` 除外):一律 `ApiError`,见 §3。
- **事务里不许 await**:`db.transaction(fn)` 会**拒绝** async 回调(底层驱动同步,async 回调会在事务外提交)。异步准备做完再进事务。
- **注释写「为什么」**,不写「做什么」。两处必须同步的地方,两边都留一行 ⚠️ 注释互指 —— 照 `state-machine.js` 的 `ACTIVE_STATUSES` 和 `001_init.sql` 的 `idx_jobs_resource_active`。

---

## 3. 错误怎么抛

```js
import { ApiError } from "../http/middleware.js"

throw new ApiError(code, message, { status, details, retryable, cause })
```

13 个**通用码**有默认 HTTP 状态,不用给 `status`:`VALIDATION_FAILED` 400、`UNAUTHORIZED` 401、`PERMISSION_DENIED` 403、`NOT_FOUND` 404、`CONFLICT` 409、`PAYLOAD_TOO_LARGE` 413、`UNSUPPORTED_MEDIA_TYPE` 415、`LOCKED` 423、`RATE_LIMITED` 429、`INTERNAL` 500、`PROVIDER_ERROR` 502、`BACKEND_UNAVAILABLE` 503、`PROVIDER_TIMEOUT` 504。

8 个**业务码**不在默认表里,**必须显式给 `status`**,漏了会掉成 500:

| 业务码 | status |
| --- | --- |
| `PLUGIN_MANIFEST_INVALID` | 400 |
| `PLUGIN_ALREADY_RUNNING` | 409 |
| `PLUGIN_NATIVE_NOT_APPROVED` | 403 |
| `PET_PACK_INCOMPATIBLE` | 400 |
| `ACTION_FRAMES_MISSING` | 400 |
| `AI_KEY_NOT_CONFIGURED` | 400 |
| `JOB_NOT_CANCELABLE` | 423 |
| `MIGRATION_REQUIRED` | 503 |

其他约定:

- `retryable` 默认按 `RETRYABLE_ERROR_CODES` 推(`RATE_LIMITED`、`INTERNAL`、`PROVIDER_ERROR`、`BACKEND_UNAVAILABLE`、`PROVIDER_TIMEOUT`),其余 false。要覆盖就显式传。
- **没有 `METHOD_NOT_ALLOWED` 这个码。** 路径匹配但方法不对,router 返 404 `NOT_FOUND`。
- `details` 放定位信息(`jobId`、`allowed`、`currentVersion`),不放堆栈。
- 并发导致的状态冲突用 `CONFLICT`,不用 `VALIDATION_FAILED` —— 后者会让前端提示「输入有误」,而用户什么都没输错。

---

## 4. 测试怎么写

模板(照抄 `tests/backend/state-machine.test.js`):

```js
"use strict"
const assert = require("node:assert/strict")
const { before, describe, it } = require("node:test")

let mod
before(async () => {
	mod = await import("../../services/backend/<路径>.js")
})
```

- 文件名 `tests/backend/<模块名>.test.js`。
- **穷举优于抽样**:枚举能穷举就穷举。状态机测试跑了全部 36 个状态组合并断言「恰好 9 条合法」,这样任何人给状态机开后门都必须先改测试。
- **跨文件一致性写成断言,不要写成注释。** 状态机测试会读 `001_init.sql`、解析 `WHERE status IN (...)`,和 `ACTIVE_STATUSES` 对账 —— 这类漂移人眼看不住。
- `assert.throws` 用谓词形式检查 `code` / `status` / `retryable` / `details`:

```js
assert.throws(() => fn(), (error) => {
	assert.equal(error.code, "CONFLICT")
	assert.equal(error.status, 409)
	return true
})
```

- ⚠️ `node --test "tests/backend/*.test.js"` 在**零匹配时会报错**。不要提交「加了 script 但没有测试文件」的中间状态。

---

## 5. `check:api-contract` 到底检查什么

`scripts/check-api-contract.mjs` 用**字符串解析**对账,不 import 任何 TS。所以它对格式有硬要求 —— 改文档或契约时不要「顺手美化」。

对账六项(任一侧多写或漏写都红):SSE 事件名、事件 → topic 归属、topic 清单、Job kind、Job 状态、错误码。此外重算 03 篇 §3 通道表的逐行等式与合计 —— 01 篇曾出现「合计 153」而实际 154,人眼没看出来。

**格式硬要求:**

| 位置 | 要求 |
| --- | --- |
| 契约枚举 | `export const NAME = [` 单独成行,收尾必须是 `] as const` |
| `EVENT_TOPIC` | 每项写成 `"job.created": "jobs",`,**冒号后恰好一个空格** |
| 03 篇标题 | 前缀 `## 3. `、`### 2.3 `、`### 事件目录`、`### 6.3 `、`### 4.1 `–`### 4.10 ` 不能改 |
| topic 清单 | 必须在含「的全量可选值」的那一行,用反引号列出 |
| Job 状态 | 必须在同时含 `queued` 和 `interrupted` 的那一行 |
| §3 表 | 必须有「合计」行;单元格里的 `*` 会被剔除,所以加粗不影响 |
| §2.3 错误码 | 反引号包裹且匹配 `^[A-Z][A-Z0-9_]+$` 才会进对账 |

两项**尚未硬化**(脚本只打印 `todo`),M1 起要变成硬检查:后端实际注册的路由 vs 03 篇 §4 路由表(靠 `router.routes()` 对);`src/shared/ipc-channels.ts` 的通道盘点 vs §3 的 154。

---

## 6. 文件所有权与并行

多个 agent 同时开工时,冲突几乎只发生在少数几个文件上。

**热点文件 —— 需要串行,一次提交只碰一个:**

| 文件 | 谁会碰 | 约束 |
| --- | --- | --- |
| `services/backend/index.js` | 每张加路由的卡 | 只允许**追加**注册语句,不改中间件顺序 |
| `services/backend/http/middleware.js` | 极少 | 改它等于改全局,必须单独一个 PR |
| `packages/contracts/src/index.ts` | 每张加契约文件的卡 | 只追加一行 `export * from` |
| 根 `package.json` | 加 script / workspace 的卡 | 只追加,不重排 |
| `docs/refactor/03-api-contract.md` | 每张改契约的卡 | 和契约同 PR |

**独占目录 —— 可以放心并行:** `jobs/`、`store/repositories/`、`routes/` 下单个文件、`secrets/`、`mcp/`、`tests/backend/` 下单个文件。

领卡之前先看 09 篇「已经存在什么」,不要重写已有文件。

---

## 7. 分支与提交

- 基线分支 `main`。开发必须在独立分支/worktree 完成,不要直接提交到 `main`。
- 一张卡一个分支:`refactor/t07-jobs-queue`,从最新 `main` 切,做完发 PR,base 指向 `main`。
- 提交信息用 ASCII:`T07: add jobs/queue.js with resource lock`。
- **一次提交只做一张卡。** 顺手改的东西单独提。
- PR 描述必须写三件事:改了哪些文件、三条门禁的输出、**你发现但没做的东西**(同时追加到 09 篇 §4 缺口清单)。

---

## 8. 已知陷阱

完整缺口清单在 09 篇 §4,这里只列最容易踩的几条。

1. **`@openpet/contracts` 的入口还不存在。** `main` 指向 `./dist/index.js`,而 `dist/` 要 `npm run build:contracts` 才生成。TS 侧可以走 `@openpet/contracts/src/*` 直接用源码。
2. **`package-lock.json` 和 workspaces 还没同步。** 首次 `npm install` 会大面积改动 lockfile,这是正常的,不要 revert。
3. **ESM 入口在 `app.asar` 里可能解析不了(风险 R20)。** E6 已命中并采用 `asarUnpack` + unpacked resolver:`services/backend/**` 位于 `app.asar.unpacked`;后端 JS 可读,不受 asar 完整性保护。不要把 CJS 降级当作默认方案,除非该正式方案回归失败。
4. **`/health` 需要鉴权,返 401。** 早期草稿写过「免鉴权返 204」,以 03 篇为准。
5. **反向通道契约必须逐项对账。** 契约 `backendToShellSchema` 与后端 `BACKEND_TO_SHELL_TYPES` 当前均为 12 类消息，包含 `dialog.request` 与 settings apply/persist 类型；`SHELL_TO_BACKEND_TYPES` 当前为 8 类。新增类型必须先更新 `packages/contracts`，再同步后端与桌面校验，不要只改其中一份。
6. **`ready` 里的 `apiVersion` 是字符串 `"v1"`。** spike 的 `sidecar-http.js` 写的是数字 `1`,那只是探针,契约以 `"v1"` 为准。
7. **`date +%s%3N` 在 macOS(BSD date)不可用。** 要毫秒时间戳用 `Date.now()`。
8. **仓库文档混用全半角标点。** 正文括号大多是全角「()」,而逗号冒号是半角。逐字重发文档时照抄,不要规范化 —— 门禁按字符串匹配。

---

## 9. 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0 | 2026-08-15 | 首版:硬规则、错误约定、测试模板、门禁格式要求、所有权与提交协议、陷阱清单 |
| v1.0.1 | 2026-08-15 | 修正两处事实:`packages/contracts` 缩进是 2 空格而非 tab;缺 `dialog.request` 的白名单是 `BACKEND_TO_SHELL_TYPES` |
