# 14 · 交接单:必须在真机上跑的事(E1–E10)

> v1.1 · 2026-08-16 · 基线分支 `main` · E1–E10 结果已回填

**读者**:有本机桌面环境、能跑 Electron 与 `npm` 的人或 agent(下称**执行方**)。如果你不写业务代码,只读这一篇 + [07 篇](./07-spike.md) 就够了。

---

## 0. 这一篇为什么存在

这套文档由一个**不能执行代码**的 agent 写成。边界很清楚:

| 能做 | 做不到 |
| --- | --- |
| 读仓库任意文件、逐字核对 | 跑 `node` / `npm` / `npx electron` |
| 写文档、开任务卡、提交到分支 | 看到真实报错与真实耗时 |
| 推演接口形状、算清算术、抓文档矛盾 | 打包、装包、点开应用 |
| 让门禁脚本**存在** | 让门禁脚本**跑绿** |

于是全套文档按一条原则写:**凡是「必须看到真实输出才能确定」的事,文档里不假装已知。**

具体做法是把运行时依赖统统藏在 seam 后面 —— `store/db.js`(数据库驱动)、`api/transport.ts`(传输)、`spawn.js`(进程),业务逻辑写成纯函数,配裸 `node --test` 能跑的单测。`jobs/state-machine.js` 与它的 9 条边断言就是样板:**六条 spike 全红,它照样跑绿。**

代价是:有 10 件事只能在真机上闭环。它们全在这里,一件不藏。

> 📌 **E 卡的产出是证据,不是功能。** 跑完要留下的是「实测值 + 结论 + 结论写回了哪一篇」,而不是一个能用的特性。

---

## 1. 怎么用这一篇

- **编号即执行顺序**:E1 → E10 顺着跑。顺序是算过的,别跳(理由写在每张卡的「前置」里)。E1–E2 是环境就绪;E3–E8 是 [07 篇](./07-spike.md) 的六条 spike(建议顺序 6→1→2→5→3→4 已经折进编号);E9 是门禁;E10 是收尾。
- 每张卡七段:**目标 / 前置 / 命令 / 期望输出 / 判定 / 不绿怎么办 / 结论写回**。
- **命令以这一篇为准。** 09 篇 §5 与 `spike/README.md` 的命令表是早期版本,已知有漏 `ELECTRON_RUN_AS_NODE=1` 的行,见 §5。
- 与 T 卡(10–13 篇)的关系:**E3–E8 不绿会推翻设计,T 卡跟着改**;但 T01–T13 不等 E 卡 —— 它们被刻意设计成不依赖运行时结论,见 08 篇 H4/H8。

🚨 **E3、E5、E7、E8 四条命令必须带 `ELECTRON_RUN_AS_NODE=1`**,也就是在 Electron 内置的 Node 里跑;**E4 不带**(`shell.js` 本身就是 Electron 主进程,由它给子进程设这个变量)。

系统装的 `node` 22.12 跑得通,不代表 Electron 42 内置的 Node 跑得通 —— **这正是这六条存在的全部理由。用错解释器,六条全部白跑。**

---

## 2. 执行卡

### E1 · 首次 `npm install` 与 lockfile(关闭 G5)

**目标** 让 workspaces 真的装起来,并把 lockfile 的变化变成一次可审的提交。

**前置** 无。这是第一张卡 —— 后面每条命令都要 `node_modules`。

```bash
git checkout main
npm install
git diff --stat package-lock.json
npm ls --workspaces --depth=0
```

**期望输出**

- `package-lock.json` 被大改:新增 `zod` 及其依赖,并出现两条 workspace 链接。
- `node_modules/` 下出现指向 `packages/contracts` 与 `services/backend` 的符号链接(名字看各自 `package.json` 的 `name`)。
- `npm ls --workspaces --depth=0` 能列出这两个 workspace。

**判定** ✅ 无 `ENOWORKSPACES` 之类报错且两个 workspace 都在。

**不绿怎么办**

- 报 workspace 找不到:检查根 `package.json` 的 `workspaces` 是 `["apps/*", "services/*", "packages/*"]`。**`apps/desktop` 没有 `package.json` 是正常的** —— npm 按 `<pattern>/package.json` 匹配,匹不到就跳过,所以实际只解析出 `services/backend` 与 `packages/contracts` 两个。
- lockfile 冲突不要手改,删掉重装(`rm package-lock.json && npm install`),但**必须在 PR 里说明是重建而不是增量**。

**结论写回** lockfile 单独一个 commit(`chore: sync package-lock with workspaces`);[09 篇](./09-repo-state.md) §4 把 **缺口 G5 标 ✅**。

> lockfile 大改是**预期**,不是事故。它现在 182,911 字节,是 workspaces 之前的产物。

### E2 · 首次 `npm run build:contracts`(关闭 G1)

**目标** `@openpet/contracts` 的 `main` / `types` 指向 `dist/`,而 `dist/` 从来没被生成过。

**前置** E1。

```bash
npm run build:contracts
ls packages/contracts/dist
```

**期望输出** `dist/index.js` 与 `dist/index.d.ts` 存在(以及各源文件对应产物),命令退出码 0。

**判定** ✅ 两个文件都在。❌ 退出码非 0,或 `dist` 结构与 `package.json` 的 `main` 不一致。

**不绿怎么办**

- TS 报错八成来自 zod 的大版本:先 `npm ls zod` 确认装的是 `^4`。**不要改契约来迁就编译器。**
- `dist` 结构与 `main` 不一致时,**改 `main` 不要改目录结构**,并在 PR 里说明。

**结论写回** 09 篇 §4 仅记录 E2 的构建证据;**缺口 G1 仍保持 ⏳**,因为 `dist/` 未入库且尚未进入打包/CI 门禁。若改了 `package.json`,同步 09 篇 §2.10。

> 这张卡不阻塞门禁:`check:api-contract` 读的是 `packages/contracts/src/*.ts`,不是 `dist`。TS 侧在 `dist` 生成前也可以走 `@openpet/contracts/src/*`。它阻塞的是**任何 import 这个包的 T 卡**。

### E3 · spike 6 —— `node:sqlite` 是否可用(ADR-014 / R18)

**目标** 证实存储层地基。**这条不绿,M1 的存储层要换驱动**,所以第一个跑。

**前置** E1。

```bash
ELECTRON_RUN_AS_NODE=1 npx electron spike/06-node-sqlite/probe-sqlite.js
```

**期望输出** 四段,缺一段都算没验完:

1. `journal_mode = { journal_mode: 'wal' }` —— 不是 `delete`
2. `OK: 单活约束生效 — ...`(第二次 INSERT 抛约束冲突)
3. `NODE_SQLITE_OK { n: 1 }`
4. **有没有 `ExperimentalWarning`** —— 有就记下来,生产日志不该刷它

**判定** ✅ 四段齐全且不需要任何 `--experimental-*` flag。🟡 需要 flag。❌ 打印 `NODE_SQLITE_UNAVAILABLE`。

**不绿怎么办**

- **需要 flag** → E4 的 `fork` 要加 `execArgv: ["--experimental-sqlite"]`,而**该参数在 `ELECTRON_RUN_AS_NODE` 下未必被透传**,必须连带验一次,不能想当然。
- **模块不存在** → 按 07 篇 §8 第 6 行切 `better-sqlite3`,**只改 `store/db.js` 一个文件**(这就是 ADR-014 要求封 driver 接口的原因,仓库层零改动),同时把 R11(macOS 公证)升为高、M1 工期 +0.5 周。

**结论写回** 07 篇 §7 第 **6** 行。

> 💡 顺手在探针里加一行 `db.prepare("SELECT sqlite_version()").get()` 很值:部分唯一索引要 SQLite 3.8+,把实际版本记进结论,以后就不用猜。

### E4 · spike 1 —— fork 出的 sidecar(D1 / ADR-002)

**目标** 整个架构的地基:`child_process.fork` 能否以 Electron 二进制的纯 Node 模式启动子进程,且 `process.send` 双向可用。

**前置** E1。**这条不带 `ELECTRON_RUN_AS_NODE`。**

```bash
npx electron spike/01-fork-sidecar/shell.js
```

**期望输出**

- `[shell] isEncryptionAvailable = true|false` ← **这是 E8 的另一半结论,先记下来**
- `versions.node = 22.x`、`versions.electron = 42.x` —— **`electron` 有值才证明跑的是内置 Node**
- `has process.send = true`
- `[shell] recv +Nms { v: 1, ... body: { type: 'ready', ... } }`,N 低于 1000
- 子进程收到 `init` 后 `exit { code: 0, signal: null }`

**判定** 用 07 篇 §1 的三档表。**`FAIL: 10 秒内没收到 ready` 是硬红。**

**不绿怎么办** 07 篇 §8 第 1 行:D1 改用 `utilityProcess`,但它不支持 `serialization: "advanced"`,反向通道要退化成只传可 JSON 化的数据 —— 02 篇 §4.1 启动时序与 §6.5 风险面重写,工期 +1 周。

**结论写回** 07 篇 §7 第 **1** 行,外加第 **4** 行的 Shell 侧那一半。

> ⚠️ 如果 `isEncryptionAvailable()` 返回 **false**,ADR-010 的第二分支(`0600` 明文文件 + 常驻告警条)就会真实发生,**M1 就得把那条 UI 做出来**。这不是小事,请在 09 篇 §4 新开一条缺口登记它。

### E5 · spike 2 —— 端口与 ready 时序(R12 / G8 冷启动预算)

**目标** `listen(0)` 拿到的端口能否在 300 ms 内回到 Shell。它直接吃掉「冷启动低于 2 秒」的预算,也决定前端首帧要不要排队。

**前置** E4 绿。

```bash
# 第 1 步 单跑:只能量到 listen(0) 的耗时
OPENPET_T0=$(node -e "console.log(Date.now())") ELECTRON_RUN_AS_NODE=1 npx electron spike/02-port-ready/sidecar-http.js

# 第 2 步 完整链路:把 01-fork-sidecar/shell.js 里 fork 的入口临时指向
#        ../02-port-ready/sidecar-http.js,并把同一个 OPENPET_T0 通过 env 传进去,
#        然后跑 E4 的命令
```

⚠️ **单跑量不到第 3 个时间点**:`sidecar-http.js` 用的是 `process.send?.(...)`,没有父进程 IPC 通道时它是 `undefined`,那一行静默跳过 —— 你会以为「没回报 ready」,其实是没人接。

⚠️ **`date +%s%3N` 在 macOS(BSD date)上不工作**,所以上面用 `node -e`。两个进程必须共用一个计时原点,否则你量到的是两台时钟的差值,**结论不可用**。

**期望输出** 三个时间点:fork 时刻、`[sidecar] 首行执行 +Nms`(= 进程启动开销)、`[sidecar] listen ok +Nms port=xxxxx`(= 加上 HTTP 监听开销),完整链路里再加 ready 送达 Shell 的 `+Nms`。

**判定** ✅ ready 送达低于 300 ms。🟡 300–800 ms:能用,但要把 fork 提到窗口创建之前并行做,02 篇 §4.1 的 13 步要重排。❌ 高于 800 ms:改 03 篇 §10 的冷启动预算数字,别硬撑。

**不绿怎么办** 07 篇 §8 第 2 行。

**结论写回** 07 篇 §7 第 **2** 行 —— **三个时间点都写进去,不要只写总数**。以后优化冷启动要知道时间花在哪一段。

### E6 · spike 5 —— 打包后的 sidecar(ADR-004 / R10 / **R20**)

**目标** asar 内的脚本能否被 fork **并真的发出 `ready`**。开发态一定成功,打包后不一定 —— Electron 项目最经典的翻车点。

**前置** E4 绿。否则你分不清是打包问题还是进程模型问题。

🚨 **判定标准已收紧**:不是「路径能解析出来」,而是**打包后的 sidecar 真的发出了 `ready`**。理由见 R20 —— ADR-004 让 sidecar 以 Node 脚本形式跑在 `app.asar` **内部**,但 `services/backend` 是 ESM,而 Electron 的 asar 补丁覆盖的是 `fs` 与 CJS `require`;**ESM 加载器解析 asar 内的入口不在覆盖范围里**。`path.join` 出来的路径永远是对的,`import` 才是会炸的那一步 —— 所以只验路径等于没验。

```bash
npm run pack
# 然后启动打出来的应用,看 sidecar 有没有回报 ready
```

✅ **E6 已采用 `asarUnpack` + unpacked resolver**，不再把 `build.files` 当作 R20 兜底；直接从 `npm run pack` 开始验证打包后的 sidecar `ready`。

**期望输出** 四个路径的实际值(`isPackaged` / `getAppPath()` / `resourcesPath` / `__dirname`),外加 sidecar 的 ready。

**判定** ✅ 装出来的应用里 sidecar 发出 ready。❌ `ERR_MODULE_NOT_FOUND` 或类似 —— **这就是 R20 命中**。

**不绿怎么办** 按代价从低到高:

1. 把 `services/backend/**` 加进 `package.json` 的 `build.asarUnpack`(`build/native/**/*` 已经在用这招)。代价:后端代码以明文躺在安装目录里 —— 对本地宠物应用可以接受,但要在 02 篇 §6.5 的风险面补一行。
2. 把 `services/backend` 降级为 CJS(删掉它 `package.json` 里的 `"type": "module"` 并改写 import)。代价大得多,**不要先试这个**。

⚠️ **打包本身可能先撞另一个问题**:`docs/project-context.json` 里记着 `releaseReady: false` 和一条 macOS 签名错误(「code has no resources but signature indicates they must be present」)。**那是既有问题,不是这次重构引入的。** 撞上了先分清是签名还是 sidecar,不要混成一条结论。

**结论写回** 07 篇 §7 第 **5** 行;四个路径值写进 02 篇 §8;R20 的结论写进 06 篇 §9 的 R20 行;09 篇 §4 的 **G4** 相应更新。

### E7 · spike 3 —— 前端首帧的闸门(F11,**已知会红一条**)

**目标** 后端未就绪时,前端并发发出的请求会不会报错。这是**每次冷启动都必经**的路径,不是边缘情况。

**前置** E1。

```bash
ELECTRON_RUN_AS_NODE=1 npx electron spike/03-frontend-gate/run.js
```

⚠️ 必须带 `ELECTRON_RUN_AS_NODE=1`:`run.js` 是 ESM + 顶层 await,靠 `03-frontend-gate/package.json` 里的 `{"type": "module"}` 生效。**09 篇 §5 那行命令漏了这个变量,以本篇为准。**

**期望输出** 跑约 16 秒 —— **其中第 2 条要等满 11 秒,那不是卡住**:

```plain text
=== spike 03 结果 ===
OK  延迟启动期间的并发请求全部成功 (3xxxms)
FAIL 后端永不启动时排队请求被清算 (11xxxms) — 排队的 Promise 在 10000 ms 后仍未结算(泄漏)
OK  排队上限 50 生效 (xxms)
OK  换端口后旧 baseUrl 零请求 (xxms)

3/4 通过
提示:第 2 条预期会红 —— ...
```

**判定**

- ✅ **正好 3/4,且红的是第 2 条** —— 这是**正确结果**,退出码 1 是预期的。
- ❌ 红的不止第 2 条,或红的是别的条 —— 那才是真问题。

**这条红为什么是对的** `spike/03-frontend-gate/transport.js` 只在**新请求进来时**才比对 `MAX_WAIT_MS`;后端永不就绪时不再有触发点,已入队的 Promise 因此永不结算 —— 断言表里「不泄漏未结算的 Promise」那句话现在是假的。**故意留红,好让这个缺口有人接。**

**不绿怎么办**(指第 2 条之外的红)07 篇 §8 第 3 行:首屏改为只渲染骨架、不发请求,等 `onBackendChanged` 后再挂载数据组件 —— 05 篇 §2.2 的排队方案作废,改成门控渲染。

**结论写回** 07 篇 §7 第 **3** 行,写「3/4,第 2 条按预期红」。修复归属 05 篇 §2.2 的 `apps/control-center/src/api/transport.ts`(第一个请求入队时就起定时器,到期把整个队列以 `BACKEND_UNAVAILABLE` 清算)—— 那是 **T20**(12 篇)的活,**去确认那张卡里写了定时清扫,没写就补上再动手**。

### E8 · spike 4 —— sidecar 里拿不到 safeStorage(ADR-010)

**目标** ADR-010 用「Shell 解密后经 `init` 一次性注入」这种略绕的方案,**前提就是 sidecar 拿不到 `safeStorage`**。这个前提必须被证明,不能被假设。

**前置** E4(它已经打印了 Shell 侧的另一半结论)。

```bash
ELECTRON_RUN_AS_NODE=1 npx electron spike/04-safe-storage/probe.js
```

🚨 **这一条漏 `ELECTRON_RUN_AS_NODE=1` 比其他几条更要命。** 不带它,你跑的是 **Electron 主进程**,`require("electron")` 当然拿得到 `safeStorage` —— 你会得到一个**完全相反的结论**,然后据此把 ADR-010 的 `init` 注入删掉,把明文密钥的持有方搞错。**09 篇 §5 那行命令漏了这个变量,以本篇为准。**

**期望输出** `SAFE_STORAGE_PROBE` 后跟一个 JSON:`requireOk` / `typeofExport` / `hasSafeStorage` / `isEncryptionAvailable`,或 `requireOk: false` + `error`。

**判定**

- ✅ **符合预期**:`requireOk: false`,或 `hasSafeStorage: false` —— ADR-010 按原样保留,收工。
- 🎉 **与预期相反反而是好消息**:sidecar 真能拿到 `safeStorage` → ADR-010 可以简化成**后端自解密**,删掉 `init` 注入,Shell 侧不再持有明文密钥,**安全性反而更好**。这条不是「验我对不对」,是「验有没有更省的走法」。

**走 🎉 这条要改什么** ADR-010 本身、04 篇 §4.1.1、09 篇 §2.10 里「`init` 是唯一允许携带 `providerKeys` 的地方」那句、以及 `packages/contracts/src/bridge.ts` 里 `shellToBackendSchema` 的 `init.providerKeys?` 字段。**改动不小,但方向是变简单。**

**结论写回** 07 篇 §7 第 **4** 行,**两半都填**:sidecar 侧的探针结果 + E4 记下的 Shell 侧 `isEncryptionAvailable`。然后按 07 篇 §9 **删除** `spike/04-safe-storage/probe.js`,结论写进 ADR-010 的「实测依据」。

### E9 · 三条门禁跑绿并贴回 PR

**目标** 门禁脚本我只能让它**存在**,不能让它**跑绿**。第一次真实执行在这里。

**前置** E1。(`check:api-contract` 读 `src/*.ts`,不依赖 E2。)

```bash
npm run check:node          # 语法
npm run test:backend        # 单测:state-machine 的 9 条合法边
npm run check:api-contract  # 契约与 03 篇对账
```

**期望输出** 三条退出码 0。`check:api-contract` 会打印六项对账 + 03 篇 §3 的算术重算,末尾固定一句「改契约与改文档必须同时进行 —— 见 docs/refactor/03-api-contract.md §9。」

它还会打印 **2 条 `todo`**(路由表对账、通道盘点)—— 那是 **G9,不算红**,M1 起硬化。

**判定** ✅ 三条全 0。❌ 任何一条非 0。

**不绿怎么办**

- `check:api-contract` 报某个名字对不上 → **先判断是文档错还是代码错**。08 篇 §5 写了它逐项对账什么、七条格式硬要求是什么(比如 `export const NAME = [` 必须独占一行、`EVENT_TOPIC` 的条目必须写成 `"job.created": "jobs",`)。**不要靠改脚本让它闭嘴。**
- `test:backend` 红 → 单测就是规范,红了说明 `state-machine.js` 被改过。
- `check:node` 红 → 看是不是新加的 ESM 文件被当 CJS 解析(根是 CJS,ESM workspace 要自己声明 `"type": "module"`)。

**结论写回** 三段输出贴到 [PR #6](https://github.com/dengyie/OpenPet/pull/6) 评论(模板见 §3)。顺手把 09 篇 §4 的 **G10** 一起改掉:`tests/backend/state-machine.test.js` 有一处 `it()` 标题写成「6 个状态、7 类以外共 17 个 kind」,应为「6 个状态,17 个 kind」—— 纯文案,一行。

### E10 · 结论回填与 spike 代码处置(关闭 G6)

**目标** 让下一个 agent **不必重跑**就能信任这些结论。

**前置** E3–E8 全部跑过。**不要求全绿,要求全部有结论。**

**动作**

1. 填满 07 篇 §7 的 6 行(实测、结论两列)。
2. 09 篇 §5 保持「已完成结果索引」,§4 的缺口 G6 保持 ✅;不要恢复成待执行语气。
3. 有结论推翻 ADR 的:改 02 篇 §8 的 ADR 表与 06 篇 §10 的决策表,**同一个 PR**。
4. 按 07 篇 §9 处置 spike 代码:五个转正、`04/probe.js` 删除。⚠️ **`01/shell.js` 与 `05/resolve-sidecar-path.js` 的转正目标 `apps/desktop/src/sidecar/spawn.js` 已经存在** —— 那是**核对差异**,不是覆盖它。
5. `spike/README.md` 的结果表改成一行指针指向 07 篇 §7(理由见 §5)。

**结论写回** 这张卡本身就是写回。做完在 PR #6 里回一条「M0 地基已闭环」。

---

## 3. 回写协议

**唯一权威结果表 = [07 篇](./07-spike.md) §7。**

现在仓库里有**两张一模一样的空表**(07 篇 §7 和 `spike/README.md`),这是隐患:`spike/` 目录验完要部分删除,结果必须活在 docs 里。

| 写什么 | 写到哪 | 什么时候 |
| --- | --- | --- |
| 实测值 + 结论 | **07 篇 §7(权威)** | 每跑完一条就填,不要攒 |
| 一行状态汇总 | 09 篇 §5,以及 §4 对应的 G 编号 | 同一个 PR |
| 被推翻的决策 | 02 篇 §8 / 06 篇 §10 | 同一个 PR |
| 门禁输出 | PR #6 评论 | E9 跑完 |
| 新发现的缺口 | 09 篇 §4,给一个新 G 编号 | 发现即写 |

PR 评论模板:

```plain text
## M0 真机验证结果(E1–E10)

环境:<OS 版本> / Electron 42.4.0 / 内置 Node <填>

E1 npm install     ✅ lockfile 已同步(commit <sha>)
E2 build:contracts ✅ dist 已产出
E3 spike 6 sqlite  ✅ WAL + 部分唯一索引 + 显式事务全通,无需 flag
E4 spike 1 fork    ✅ ready +<N>ms,electron=42.x,isEncryptionAvailable=<t/f>
E5 spike 2 port    ✅ ready 送达 +<N>ms(首行 +<N>ms / listen +<N>ms)
E6 spike 5 pack    <✅/❌> R20 是否命中:<结论>
E7 spike 3 gate    ✅ 3/4,第 2 条按预期红
E8 spike 4 secret  ✅ sidecar 拿不到 safeStorage,ADR-010 保留
E9 门禁            ✅ 三条全绿(2 条 todo = G9,不算红)

推翻的决策:<无 / ADR-0xx → ...>
新发现的缺口:<无 / G11: ...>
```

> **不要只把结论写在 PR 评论里。** 评论会被翻页、会被 force push 埋掉,文档不会。评论是给人看的摘要,文档才是下一个 agent 的输入。

---

## 4. 不绿会推翻什么

六条 spike 的失败动作与影响面一览在 [07 篇](./07-spike.md) §8,这里不重复。只补两条 07 篇 §8 写作时还不存在的信息:

- **E6 多了一个失败模式**:07 篇 §8 第 5 行只写了「路径解析失败 → `asarUnpack`」,没有 R20 的 **ESM 加载器**这一层。E6 的判定与退路以本篇为准。
- **E1 的「失败」不是失败**:lockfile 大改是预期(G5),不要试图把 diff 改小。

---

## 5. 这一篇顺手记下的文档债

E1–E10 已完成。下面逐行保留原债务位置,写清已完成结果与仍未关闭的后续项;权威实测值仍只在 [07 篇](./07-spike.md) §7。

| # | 位置 | 问题 | 危险度 |
| --- | --- | --- | --- |
| 1 | 09 篇 §5 中 spike 3、spike 4 的命令 | **已完成**:两条命令已补 `ELECTRON_RUN_AS_NODE=1`;E3–E8 结果落在 07 篇 §7 | 已关闭 |
| 2 | 07 篇 §5 步骤 1 与 `spike/README.md`「第 5 条」步骤 1 | **已完成**:`build.files` 已含 `apps/**/*`、`services/**/*`、`packages/**/*`;E6 正式方案为 `asarUnpack` + unpacked resolver | 已关闭 |
| 3 | `spike/README.md` 的结果记录表 | **已完成**:重复表已改为指向 07 篇 §7 的单一结果源 | 已关闭 |
| 4 | `spike/README.md`「与 07 篇的两处偏差(需要同步回文档)」 | **已完成**:偏差已同步进 07 篇 §0 与 §3,旧说明已移除 | 已关闭 |
| 5 | 缺口 G1:`build:contracts` 未进入构建/CI | **仍未关闭**:由 T34 补显式打包与构建门禁 | [#45](https://github.com/dengyie/OpenPet/issues/45) |
| 6 | 缺口 G11:file-backed WAL 未验证 | **仍未关闭**:由 T35 复验并补 `tests/backend/sqlite-driver.test.js` | [#46](https://github.com/dengyie/OpenPet/issues/46) |
| 7 | `check:api-contract`、`check:docs-drift`、`build:contracts` 未显式进入 CI | **仍未关闭**:由 T36 增加显式 CI 门禁 | [#47](https://github.com/dengyie/OpenPet/issues/47) |

> 这是 G3 那条教训的复现:**同一个事实在仓库里出现第二次,就开始漂。** 命令表、结果表都应该只有一份。

---

## 6. 仍然由文档侧负责的部分(不在这份交接单里)

以下不需要真机,是纯文档工作,**不交出去**:

| 待办 | 计划落点 |
| --- | --- |
| M4 任务卡(AI 37 通道 + Creator 13 通道、`demo-control-center-api.ts` 删除、Pane 拆分、C1–C10 验收) | `15-tasks-m4.md` |
| M5 任务卡(清理、`check:preload-size` 从宽阈值收紧到 5 KB、ADR-009 兼容层退场) | `16-tasks-m5.md` |
| 门禁硬化两张卡(G3 状态映射去重、G9 路由表与通道盘点对账) | 计划 T34–T35 |
| 两张纯单测卡(`message-schema.test.js`:信封往返 + 6 种失败原因 + 版本不匹配;`middleware.test.js`:`ApiError` 状态映射 / 常量时间比较 / 1 MB 中途截断 / 环形缓冲) | 计划 T36–T37 |
| §5 登记的四条文档债 | 下次动那几个文件时 |

**G2**(`BACKEND_TO_SHELL_TYPES` 8 项、契约 9 项,少 `dialog.request`)已经有主:**T12**,见 11 篇。T18/T19 强依赖它。

---

## 7. 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0 | 2026-08-15 | 首版:E1–E10 十张真机执行卡、回写协议(07 篇 §7 为唯一权威结果表)、四条文档债登记、文档侧待办归属 |
| v1.1 | 2026-08-16 | 回填 E1–E10 结果;基线改为 `main`;E6 采用 `asarUnpack`;§5 改为当前结果与剩余 G1/G11/E7 文档债 |
