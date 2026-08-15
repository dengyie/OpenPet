# 07 · M0 Spike 代码骨架与验证清单

> 🧪 **目的** 用半天时间,把六个「写文档时无法确定、写错了会返工一整个里程碑」的假设变成实测结论。**这是 M0 的第 0 步,在写任何产品代码之前完成。**

## 0. 放在哪、怎么跑

所有代码放在仓库根的 [`spike/`](../../spike/) 目录:**不进 `src/`、不进 `build.files` 白名单**,验完按 §9 处理(部分转正、部分删除)。

```text
spike/
├─ 01-fork-sidecar/
│  ├─ shell.js                 # Shell 侧:fork 子进程 + 消息通道
│  └─ sidecar.js               # sidecar 侧:回报环境信息 + v:1 信封
├─ 02-port-ready/
│  └─ sidecar-http.js          # listen(0) + ready 回传 + 计时
├─ 03-frontend-gate/
│  ├─ package.json             # 仅 {"type": "module"},见下方说明
│  ├─ transport.js             # 排队与冲刷的最小实现
│  └─ run.js                   # 人为延迟 3 秒启动后端
├─ 04-safe-storage/
│  └─ probe.js                 # 探测 sidecar 里能否拿到 safeStorage
├─ 05-pack-path/
│  └─ resolve-sidecar-path.js  # 打包后 asar 内路径解析
├─ 06-node-sqlite/
│  └─ probe-sqlite.js          # node:sqlite 建表与索引
└─ README.md                   # 六条实测结果(§7 的表格)
```

`03-frontend-gate/package.json` 是落地时补的:`transport.js` 用 ESM `export`,而仓库根是 CJS,不声明 `"type": "module"` 则 `run.js` 无法 import 它。

> ⚠️ **除第 5 条外,全部 spike 都必须在 sidecar 的真实环境里跑**,也就是 Electron 内置 Node(`ELECTRON_RUN_AS_NODE=1`),**不能用你系统装的 `node`**。这正是这六条存在的理由:系统 Node 22.12 跑得通,不代表 Electron 42 内置的 Node 跑得通。

建议执行顺序 **6 → 1 → 2 → 5 → 3 → 4**:第 6 条最可能红且一红就要换存储驱动;第 4 条结果与预期相反反而是好消息,放最后。

## 1. fork 出的 sidecar 是否可用(D1 / ADR-002)

**验什么**:`child_process.fork` 能否以 Electron 二进制的纯 Node 模式启动子进程,且 `process.send` 双向通道可用。这是整个架构的地基 —— 不成立则 [02 篇](./02-architecture.md) §4.1 的启动时序要整章重写。

```javascript
// spike/01-fork-sidecar/shell.js
// 运行:npx electron spike/01-fork-sidecar/shell.js
const path = require("node:path")
const { fork } = require("node:child_process")
const { app, safeStorage } = require("electron")

app.whenReady().then(() => {
  // 顺带把第 4 条的 Shell 侧结论一起取到
  console.log("[shell] isEncryptionAvailable =", safeStorage.isEncryptionAvailable())

  const t0 = Date.now()
  const child = fork(path.join(__dirname, "sidecar.js"), [], {
    // 关键 1:让 Electron 二进制以纯 Node 模式运行
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    // 关键 2:stdio 第四位必须是 "ipc",否则 child.send 不存在
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    // 关键 3:后续要传 Buffer/Date,需要结构化克隆
    serialization: "advanced",
  })

  child.stdout.on("data", (b) => console.log("[sidecar]", String(b).trim()))
  child.stderr.on("data", (b) => console.error("[sidecar:err]", String(b).trim()))

  child.on("message", (msg) => {
    console.log(`[shell] recv +${Date.now() - t0}ms`, msg)
    if (msg?.body?.type === "ready") {
      // 验 ADR-011 的 v:1 信封能双向走通
      child.send({ v: 1, id: "1", at: Date.now(), body: { type: "init" } })
    }
  })

  child.on("exit", (code, signal) => {
    console.log("[shell] exit", { code, signal })
    app.quit()
  })

  setTimeout(() => {
    console.error("FAIL: 10 秒内没收到 ready")
    process.exit(1)
  }, 10_000)
})
```

```javascript
// spike/01-fork-sidecar/sidecar.js
console.log("versions.node     =", process.versions.node)
console.log("versions.electron =", process.versions.electron)
console.log("execPath          =", process.execPath)
console.log("has process.send  =", typeof process.send === "function")

process.send?.({ v: 1, id: "s1", at: Date.now(), body: { type: "ready", pid: process.pid } })

process.on("message", (msg) => {
  console.log("[sidecar] recv", msg)
  if (msg?.v !== 1) process.exit(78) // 版本不兼容(ADR-011)
  process.exit(0)
})
```

| 判定 | 条件 |
| --- | --- |
| ✅ 绿 | 1 秒内收到 ready;`versions.node` 不低于 22.12;`versions.electron` 有值(证明跑的是内置 Node);双向消息都通 |
| 🟡 黄 | 通但慢于 1 秒,或 `serialization: "advanced"` 报错(降级为默认 json,则反向通道不能传 Buffer) |
| ❌ 红 | `child.send is not a function`,或拿不到 ready |

## 2. 端口分配与 ready 时序(R12 / 03 篇 §1.2)

**验什么**:`listen(0)` 拿到的端口能否在 300 ms 内回到 Shell。它直接吃掉 G8 的冷启动预算(低于 2 秒),也决定前端第一帧要不要排队。

```javascript
// spike/02-port-ready/sidecar-http.js
const http = require("node:http")
const crypto = require("node:crypto")

const t0 = Number(process.env.OPENPET_T0 || Date.now())
const token = crypto.randomBytes(32).toString("hex")
console.log(`[sidecar] 首行执行 +${Date.now() - t0}ms`)

const server = http.createServer((req, res) => {
  const expected = `Bearer ${token}`
  const got = req.headers.authorization || ""
  // 与 local-http-service.js 一致:常量时间比较
  const ok =
    got.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))
  res.writeHead(ok ? 200 : 401, { "content-type": "application/json" })
  res.end(JSON.stringify({ ok, meta: { elapsedMs: Date.now() - t0 } }))
})

// 0 = 内核分配空闲端口;只绑回环
server.listen(0, "127.0.0.1", () => {
  const { port } = server.address()
  console.log(`[sidecar] listen ok +${Date.now() - t0}ms port=${port}`)
  process.send?.({
    v: 1,
    id: "r1",
    at: Date.now(),
    body: { type: "ready", port, apiVersion: 1, pid: process.pid, sessionToken: token },
  })
})
```

要记录的是**三个时间点**,而不是一个总数:

1. Shell 调用 `fork` 的时刻
2. sidecar 首行 JS 执行(= 进程启动开销)
3. ready 送达 Shell(= 加上 HTTP 监听开销)

> 💡 把 `OPENPET_T0` 用 env 传进去,两个进程才能用同一个原点计时。否则你量到的是两台时钟的差值,得出的结论不可用。

## 3. 前端首帧的门禁与排队(F11)

**验什么**:`getBackend()` 返 `null` 时,前端并发发出的请求会不会报错。这是**每次冷启动都必经**的路径,不是边缘情况。

```javascript
// spike/03-frontend-gate/transport.js
const MAX_QUEUE = 50
const MAX_WAIT_MS = 10_000

export function createTransport(shell) {
  let backend = shell.getBackend() // 可能为 null
  let queue = []
  let firstQueuedAt = 0

  shell.onBackendChanged((next) => {
    backend = next
    const pending = queue
    queue = []
    for (const item of pending) item.run(backend).then(item.resolve, item.reject)
  })

  return function request(pathname, init) {
    if (backend) return send(backend, pathname, init)
    if (queue.length === 0) firstQueuedAt = Date.now()
    if (queue.length >= MAX_QUEUE || Date.now() - firstQueuedAt > MAX_WAIT_MS) {
      return Promise.reject(new Error("BACKEND_UNAVAILABLE"))
    }
    return new Promise((resolve, reject) => {
      queue.push({ resolve, reject, run: (b) => send(b, pathname, init) })
    })
  }
}

function send(backend, pathname, init = {}) {
  return fetch(`${backend.baseUrl}${pathname}`, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${backend.sessionToken}` },
  })
}
```

`run.js` 的断言(这一条建议直接写成 vitest,因为它要长期留着):

| 场景 | 断言 | 当前状态 |
| --- | --- | --- |
| 后端延迟 3 秒启动,期间并发 5 个 GET | 5 个全部拿到 200,无一抛错 | ✅ |
| 后端永不启动 | 10 秒后全部以 `BACKEND_UNAVAILABLE` 拒绝,且不泄漏未结算的 Promise | ❌ **已知红,见下** |
| 排队期间发出 60 个请求 | 前 50 入队,后 10 立即拒绝 | ✅ |
| 后端换端口(第二次 `onBackendChanged`) | 新请求打到新 baseUrl,旧 baseUrl 零请求 | ✅ |

> ❌ **第 2 条当前不成立,这是 spike 要暴露的缺口。** 上面那版 `transport.js` 只在**新请求进来时**才比对 `MAX_WAIT_MS`;后端永不就绪的情况下不会再有触发点,已经入队的 Promise 因此永远不结算 —— 「不泄漏未结算的 Promise」这句话是假的。修复归属 [05 篇](./05-frontend.md) §2.2 的 `apps/control-center/src/api/transport.ts`:需要在第一个请求入队时起一个定时器,到期把整个队列以 `BACKEND_UNAVAILABLE` 清算掉。这里故意保留原状,让 `run.js` 真的红一条。

## 4. sidecar 里拿不到 safeStorage(ADR-010)

**验什么**:ADR-010 之所以要用「Shell 解密后经 `init` 一次性注入」这种略绕的方案,前提就是 sidecar 拿不到 `safeStorage`。**这个前提必须被证明,而不是被假设。**

```javascript
// spike/04-safe-storage/probe.js —— 在 sidecar 环境里跑
let result
try {
  const electron = require("electron")
  result = {
    requireOk: true,
    typeofExport: typeof electron,
    hasSafeStorage: Boolean(electron?.safeStorage),
    isEncryptionAvailable: electron?.safeStorage?.isEncryptionAvailable?.() ?? null,
  }
} catch (err) {
  result = { requireOk: false, error: String(err?.message || err) }
}
console.log("SAFE_STORAGE_PROBE", JSON.stringify(result, null, 2))
```

> 💡 **这一条如果结果与预期相反(sidecar 真能拿到 `safeStorage`),是好消息**:ADR-010 可以简化掉 `init` 注入,让后端自己解密,Shell 侧不再持有明文密钥,安全性反而更好。所以这条不是「验证我对不对」,是「验证有没有更省的走法」。

同时要在 Shell 侧记录 `isEncryptionAvailable()` 在**你的目标平台上**的返回值(spike 1 的 `shell.js` 已顺带打印)。返回 false 就意味着 ADR-010 的第二分支(`0600` 明文加常驻告警条)会真实发生,需要在 M1 就把那条 UI 做出来。

## 5. 打包后 sidecar 的路径(ADR-004 / R10)

**验什么**:asar 内的脚本能否被 `fork`。开发态一定成功,打包后不一定 —— 这是 Electron 项目最经典的翻车点。

```javascript
// spike/05-pack-path/resolve-sidecar-path.js
const path = require("node:path")

function resolveSidecarEntry(app) {
  const rel = "services/backend/index.js"
  // 打包后 __dirname 位于 asar 内部,getAppPath() 指向 app.asar
  return path.join(app.getAppPath(), rel)
}

function dumpPaths(app) {
  console.log({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    dirname: __dirname,
    resolved: resolveSidecarEntry(app),
  })
}

module.exports = { resolveSidecarEntry, dumpPaths }
```

执行步骤(**必须真打包,不能只看开发态**):

1. 在 `package.json` 的 `build.files` 白名单里加 `"services/**/*"` 与 `"packages/**/*"`。**这一步漏了,sidecar 根本不在包里**,而白名单式配置不会给你任何警告。
2. `npm run pack`
3. 启动打出来的应用,确认 sidecar fork 成功并回报 ready
4. 记录上面四个路径的实际值,写进 [02 篇](./02-architecture.md) §8

> ⚠️ 失败的退路是把 `services/**` 加进 `asarUnpack`(你已经在给 `build/native/**/*` 用这招)。代价是后端代码以明文文件躺在安装目录里 —— 对本地宠物应用可以接受,但要在 02 篇 §6 的风险面里补一行。

## 6. node:sqlite 是否可用(ADR-014 / R18)

**验什么**:ADR-014 选 `node:sqlite` 是为了避开 native 重建与二次公证,但它是否在 Electron 内置 Node 里暴露、是否需要 `--experimental-sqlite`,只能实测。**这条不绿,M1 的存储层就要换驱动。**

```javascript
// spike/06-node-sqlite/probe-sqlite.js —— 必须在 sidecar 环境里跑
let sqlite
try {
  sqlite = require("node:sqlite")
} catch (err) {
  console.error("NODE_SQLITE_UNAVAILABLE", String(err?.message || err))
  process.exit(1)
}

const { DatabaseSync } = sqlite
const db = new DatabaseSync(":memory:")

// 1. WAL 是 ADR-006 的前提
console.log("journal_mode =", db.prepare("PRAGMA journal_mode = WAL").get())

// 2. 带 WHERE 的部分唯一索引是 04 篇 §2 单活任务约束的实现方式
db.exec(`
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    resource_key TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX idx_jobs_resource_active
    ON jobs(resource_key) WHERE status IN ('queued','running');
`)

const insert = db.prepare("INSERT INTO jobs VALUES (?, ?, ?, ?, ?)")
insert.run("j1", "image.generate", "queued", "pet:1", Date.now())

// 3. 部分索引真的生效了吗(应当抛约束冲突)
try {
  insert.run("j2", "image.generate", "queued", "pet:1", Date.now())
  console.error("FAIL: 部分唯一索引没有生效")
} catch (err) {
  console.log("OK: 单活约束生效 —", String(err?.message || err))
}

// 4. 显式事务是 04 篇 §3.5 的 JSON 迁移能否原子化的关键
db.exec("BEGIN")
db.prepare("UPDATE jobs SET status = ? WHERE id = ?").run("running", "j1")
db.exec("COMMIT")

console.log("NODE_SQLITE_OK", db.prepare("SELECT count(*) AS n FROM jobs").get())
```

| 要确认的能力 | 为什么它关键 |
| --- | --- |
| 模块存在且无需 flag | 需要 flag 则 spike 1 的 `fork` 要加 `execArgv: ["--experimental-sqlite"]`,而该参数在 `ELECTRON_RUN_AS_NODE` 下未必被透传 |
| WAL 模式可开 | ADR-006 的前提;不支持则并发读写模型作废 |
| 带 `WHERE` 的部分唯一索引 | 04 篇 §2 靠它保证同一资源只有一个活跃 Job,换成应用层加锁要多写一套并发控制 |
| 显式事务 | 04 篇 §3.5 的迁移必须原子,否则崩在中间会留下半套数据 |
| 是否打印 ExperimentalWarning | 生产版本不应在用户日志里刷实验性警告 |

## 7. 结果记录表(跑完填这张表)

| # | 假设 | 预期 | 实测 | 结论 | 关联 |
| --- | --- | --- | --- | --- | --- |
| 1 | `fork` 可启动内置 Node 且消息通道双向可用 | ready 低于 1 秒 | Electron 42.4.0 / Node 24.16.0; `process.send=true`; ready +145 ms; `init` 后 code 0 | ✅ D1 保持 `fork` | D1 / ADR-002 |
| 2 | `listen(0)` 的端口能快速回传 Shell | ready 低于 300 ms | 单跑:首行 +569 ms,listen +574 ms;完整共享 T0:首行 +779 ms,listen +783 ms,Shell 收到 ready +86 ms(从 fork) | ✅ ready 送达低于 300 ms;后端启动应在窗口创建前并行以控制共享 T0 开销 | R12 / G8 |
| 3 | 后端未就绪时前端请求可排队后冲刷 | 并发 5 个全部 200 | 3/4:延迟并发成功 3043 ms;第 2 条 11006 ms 后仍 leaked;上限 26 ms;换端口 4 ms | ✅ 第 2 条按预期红;T20 负责定时清扫 | F11 |
| 4 | sidecar 拿不到 `safeStorage` | require 失败或无该导出 | sidecar:`requireOk=true`,`typeofExport="string"`,`hasSafeStorage=false`;Shell:`isEncryptionAvailable=true` | ✅ ADR-010 保留:Shell 解密后经 `init` 注入 | ADR-010 |
| 5 | asar 内脚本可被 fork | 打包后 sidecar 正常启动 | 初始 app.asar 路径 fork 为 `spawn ENOTDIR`;改为 `asarUnpack` + unpacked resolver 后,已打包 Electron 收到 ready(`startupMs=5`)并 clean exit 0。`isPackaged=true`;`appPath=.../Resources/app.asar`;`resourcesPath=.../Resources`;sidecar `__dirname=.../Resources/app.asar.unpacked/services/backend` | ✅ R20 命中后已缓解;后端以 unpacked 明文文件运行 | ADR-004 / R10 |
| 6 | `node:sqlite` 可用且支持 WAL 与部分索引 | 四项能力全部通过 | 模块无需 flag;部分唯一索引与显式事务通过;`:memory:` probe 返回 `journal_mode='memory'`,未能证明 file-backed WAL | 🟡 驱动可用,但新增 G11:以 file-backed DB 验证 WAL 后才能关闭 ADR-014 的完整前提 | ADR-014 / R18 |

## 8. 不绿的时候改什么

| # | 失败后的动作 | 影响面 |
| --- | --- | --- |
| 1 | D1 改用 `utilityProcess`(Electron 原生 API),但它不支持 `serialization: "advanced"`,反向通道要改为只传可 JSON 化的数据 | 02 篇 §4.1 启动时序、§6.5 风险面重写;工期增加约 1 周 |
| 2 | 放宽 03 篇 §10 的冷启动预算,或把 sidecar 的 fork 提前到窗口创建之前并行做 | G8 的数字要改,或 02 篇 §4.1 的 13 步要重排 |
| 3 | 首屏改为只渲染骨架、不发请求,等 `onBackendChanged` 后再挂载数据组件 | 05 篇 §2.2 排队方案作废,改为门控渲染 |
| 4 | **这是好消息**:ADR-010 简化为后端自解密,删掉 `init` 注入与 Shell 侧明文持有 | 04 篇 §4.1.1 简化;安全性提升 |
| 5 | `services/**` 加进 `asarUnpack` | R10 降为低;02 篇 §6.5 补一行「后端代码明文可见」 |
| 6 | 切 `better-sqlite3`,`store/db.js` 换实现(仓库层零改动,这就是 ADR-014 要求封 driver 接口的原因) | ADR-014 改结论;R11 macOS 公证升为高;M1 工期增加约 0.5 周 |

## 9. spike 代码的去向

| 文件 | 去向 |
| --- | --- |
| `01/shell.js` | 转正为 `apps/desktop/src/sidecar/spawn.js` |
| `01/sidecar.js` 的信封校验 | 转正为 `services/backend/bridge/message-schema.js` |
| `02/sidecar-http.js` | 转正为 `services/backend/index.js` 的 bootstrap 段 |
| `03/transport.js` | 转正为 `apps/control-center/src/api/transport.ts` 的排队部分;`run.js` 变成 `test:degraded` 的第一个用例 |
| `04/probe.js` | 删除,结论写进 ADR-010 的「实测依据」 |
| `05/resolve-sidecar-path.js` | 转正为 `spawn.js` 的路径解析函数 |
| `06/probe-sqlite.js` | 转正为 `tests/backend/sqlite-driver.test.js`,长期守住驱动能力 |

> 📌 **六条全绿之前,不要开始 M0 的其余 11 个任务。** 这半天的成本,是用来避免在 M1 中途发现地基假设不成立 —— 那时候已经动了数据层和密钥,回滚代价是不可逆的。
