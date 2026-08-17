# spike/ — M0 第 0 步:六条地基假设的实测

对应开发文档「07 · M0 Spike 代码骨架与验证清单」。

**M0 已完成。** 六条 spike 的结果见 [docs/refactor/07-spike.md](../docs/refactor/07-spike.md) §7;本目录仅作历史与回归用。

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

1. `build.files` 已包含 `"apps/**/*"`、`"services/**/*"`、`"packages/**/*"`(commit `304a5a34`);R20 的正式修复是 `asarUnpack` + 从 `app.asar.unpacked` 解析 sidecar 入口。
2. `npm run pack`
3. 启动打出来的应用,确认 sidecar fork 成功并回报 ready
4. 记录 `isPackaged` / `getAppPath()` / `resourcesPath` / `__dirname` 四个实际值,写回
   02 篇 §8

**已采用方案**是把 `services/backend/**` 加进 `asarUnpack`,并从 `app.asar.unpacked` 解析 sidecar 入口。代价是后端代码以明文躺在安装目录里,已在 02 篇 §6.5 的风险面登记。

## 结果

唯一权威结果表在 [docs/refactor/07-spike.md](../docs/refactor/07-spike.md) §7。

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
