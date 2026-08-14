# spike/ — M0 第 0 步:六条地基假设的实测

对应开发文档「07 · M0 Spike 代码骨架与验证清单」。

**六条全绿之前,不要开始 M0 的其余 11 个任务。** 这半天的成本,是用来避免在 M1 中途
发现地基假设不成立 —— 那时候已经动了数据层和密钥,回滚代价不可逆。

本目录不进 `src/`,也不进 `package.json` 的 `build.files` 白名单。验完按文末「去向」
处理:五个文件转正,一个删除。

## 必须用 Electron 内置的 Node

除第 5 条外,全部 spike 都要在 sidecar 的真实运行环境里跑,也就是
`ELECTRON_RUN_AS_NODE=1` 下的 Electron 二进制,**不能用系统装的 `node`**。系统
Node 22.12 跑得通,不代表 Electron 42 内置的 Node 跑得通 —— 这正是这六条存在的理由。

## 建议执行顺序:6 → 1 → 2 → 5 → 3 → 4

第 6 条最可能红,而且一红就要换存储驱动(影响 M1 整个存储层),所以先跑。第 4 条如果
结果和预期相反反而是好消息(ADR-010 可以简化),放最后。

## 跑法

| # | 命令 |
| --- | --- |
| 1 | `npx electron spike/01-fork-sidecar/shell.js` |
| 2 | `ELECTRON_RUN_AS_NODE=1 npx electron spike/02-port-ready/sidecar-http.js` |
| 3 | `ELECTRON_RUN_AS_NODE=1 npx electron spike/03-frontend-gate/run.js` |
| 4 | `ELECTRON_RUN_AS_NODE=1 npx electron spike/04-safe-storage/probe.js` |
| 5 | 见下方「第 5 条」 |
| 6 | `ELECTRON_RUN_AS_NODE=1 npx electron spike/06-node-sqlite/probe-sqlite.js` |

第 1 条会顺带打印 Shell 侧的 `safeStorage.isEncryptionAvailable()`,那是第 4 条需要的
另一半结论。

第 2 条独立跑只能量到 `listen(0)` 的耗时。要量完整的 ready 送达时间,把
`01-fork-sidecar/shell.js` 里 fork 的入口临时指向 `../02-port-ready/sidecar-http.js`,
并用 env 传入同一个 `OPENPET_T0` —— 两个进程必须共用一个计时原点,否则量到的是两台
时钟的差值,结论不可用。

### 第 5 条(必须真打包,不能只看开发态)

1. 先在 `package.json` 的 `build.files` 白名单里加 `"services/**/*"` 与
   `"packages/**/*"`。**漏了这一步 sidecar 根本不在包里,而白名单式配置不会给你
   任何警告。**
2. `npm run pack`
3. 启动打出来的应用,确认 sidecar fork 成功并回报 ready
4. 记录 `isPackaged` / `getAppPath()` / `resourcesPath` / `__dirname` 四个实际值,写回
   02 篇 §8

失败的退路是把 `services/**` 加进 `asarUnpack`(现在 `build/native/**/*` 已经在用这招)。
代价是后端代码以明文躺在安装目录里 —— 对本地宠物应用可以接受,但要在 02 篇 §6.5 的
风险面里补一行。

## 结果记录表(跑完填这张)

| # | 假设 | 预期 | 实测 | 结论 | 关联 |
| --- | --- | --- | --- | --- | --- |
| 1 | `fork` 可启动内置 Node 且消息通道双向可用 | ready 低于 1 秒 | 待填 | 待填 | D1 / ADR-002 |
| 2 | `listen(0)` 的端口能快速回传 Shell | ready 低于 300 ms | 待填 | 待填 | R12 / G8 |
| 3 | 后端未就绪时前端请求可排队后冲刷 | 并发 5 个全部 200 | 待填 | 待填 | F11 |
| 4 | sidecar 拿不到 `safeStorage` | require 失败或无该导出 | 待填 | 待填 | ADR-010 |
| 5 | asar 内脚本可被 fork | 打包后 sidecar 正常启动 | 待填 | 待填 | ADR-004 / R10 |
| 6 | `node:sqlite` 可用且支持 WAL 与部分索引 | 四项能力全部通过 | 待填 | 待填 | ADR-014 / R18 |

## 与 07 篇的两处偏差(需要同步回文档)

- `03-frontend-gate/` 下多了一个 `package.json`(内容只有 `{"type": "module"}`)。
  07 篇 §3 的 `transport.js` 用的是 ESM `export`,而仓库根是 CJS,不加这个文件
  `run.js` 无法 import 它。
- `03-frontend-gate/run.js` 的第 2 个用例(后端永不启动)**预期会红**。07 篇 §3 的
  `transport.js` 只在「新请求进来」时才判 `MAX_WAIT_MS`,已经入队的 Promise 在后端
  永不就绪的情况下不会被清算 —— 断言表里那句「不泄漏未结算的 Promise」现在是不成立的。
  这正是 spike 要暴露的缺口,修复归属 `apps/control-center/src/api/transport.ts`
  (05 篇 §2.2),需要加一个定时清扫。

## 去向

| 文件 | 去向 |
| --- | --- |
| `01/shell.js` | 转正为 `apps/desktop/src/sidecar/spawn.js` |
| `01/sidecar.js` 的信封校验 | 转正为 `services/backend/bridge/message-schema.js` |
| `02/sidecar-http.js` | 转正为 `services/backend/index.js` 的 bootstrap 段 |
| `03/transport.js` | 转正为 `apps/control-center/src/api/transport.ts` 的排队部分;`run.js` 变成 `test:degraded` 的第一个用例 |
| `04/probe.js` | 删除,结论写进 ADR-010 的「实测依据」 |
| `05/resolve-sidecar-path.js` | 转正为 `spawn.js` 的路径解析函数 |
| `06/probe-sqlite.js` | 转正为 `tests/backend/sqlite-driver.test.js`,长期守住驱动能力 |
