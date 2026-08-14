# `@openpet/backend`

OpenPet 的本地后端 sidecar。由 Shell(Electron 主进程)通过 `child_process.fork` 启动,只监听回环地址。

契约以 [`docs/refactor/03-api-contract.md`](../../docs/refactor/03-api-contract.md) 为准,架构以 [`docs/refactor/02-architecture.md`](../../docs/refactor/02-architecture.md) 为准。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `index.js` | 启动编排:等 `init`、绑端口、发 `ready`、优雅关闭 |
| `http/router.js` | ADR-013 的自写 router 与 middleware 链 |
| `http/middleware.js` | `ApiError`、三种响应信封、鉴权、body 上限、访问日志 |
| `bridge/message-schema.js` | `v: 1` 信封与两侧消息类型白名单 |
| `bridge/shell-client.js` | 反向通道客户端,按信封 id 关联请求与回复 |
| `store/db.js` | ADR-014 的 SQLite driver 接口与单写者保护 |

## 启动顺序(与 spike 1 有意不同)

07 篇 spike 1 的握手是「sidecar 先发 `ready`,Shell 再回 `init`」—— 那只是为了证明 `fork` 通道能双向跑。生产顺序反过来:

1. `index.js` **在任何 `await` 之前**挂上 `process.on("message")` 并把消息缓存进 inbox。ESM 的顶层 `await` 会推迟模块求值,不先挂监听有丢 `init` 的风险。
2. 等 Shell 的 `init`(含 ADR-010 解密后的密钥),10 秒未到则 `exit 65`。
3. 绑定 `127.0.0.1:0`,生成 `sessionToken`。
4. `listening` 后发 `ready { port, apiVersion, pid, sessionToken, startupMs }`。

好处是只有一个就绪点:拿到 `ready` 就意味着端口能连、密钥已在内存。若按 spike 的顺序,`ready` 之后还有一段「HTTP 已通但密钥未到」的窗口,每个依赖密钥的路由都得自己判一次。

## 独立运行

后端要求 IPC 通道,不能直接 `node index.js`。调试用一个七行的宿主:

```js
import { fork } from "node:child_process"
const child = fork("services/backend/index.js", [], { stdio: ["ignore", "inherit", "inherit", "ipc"], serialization: "advanced" })
child.on("message", (m) => console.log("<-", JSON.stringify(m)))
child.send({ v: 1, id: "host-1", at: Date.now(), body: { type: "init", secrets: {}, userDataDir: "/tmp/openpet-dev" } })
```

拿到 `ready` 里的 `port` 与 `sessionToken` 之后:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/api/v1/health
```

未带 token 会返回 `401 UNAUTHORIZED` —— 03 篇 §8 的「不设例外」包括 `/health`。

## 已知待验证风险

### ESM 与 asar(尚未登记进 06 篇风险表)

ADR-004 让 sidecar 作为同 asar 内的 Node 脚本运行,而本包是 ESM(`"type": "module"`)。Electron 对 asar 的补丁主要覆盖 `fs` 与 CJS `require`,**ESM loader 从 `app.asar` 内解析入口这条路径没有被 spike 5 覆盖**。

- 影响面:打包后 sidecar 起不来,开发态无法复现。
- 判定:跑 spike 5 时额外确认一次打包产物里 sidecar 能 `ready`,而不只是确认路径解析成功。
- 退路(两条,都不动业务代码):把 `services/backend/**` 加入 `build.asarUnpack`;或把本包降为 CJS。

### `ERROR_HTTP_STATUS` 目前有两份

`http/middleware.js` 里的 `GENERIC_ERROR_HTTP_STATUS` 与 `packages/contracts/src/envelope.ts` 里的同名常量重复。原因是本包还没接入根 `workspaces`(等 spike 5 绿),现在 import 不到 `@openpet/contracts`。

为了不让两份漂移,这里只定义 13 个通用错误码的状态映射;**8 个专用业务码不在这里出现**,抛出方必须显式传 `status`。接入 workspaces 后本文件改为 re-export,并给 `check:api-contract` 加一条对账。

### `dialog.result` 超时用 `PROVIDER_TIMEOUT`

03 篇定的是 504,而 504 对应的码叫 `PROVIDER_TIMEOUT`。Shell 弹窗不是 provider,语义别扭但不新增码 —— 错误码表是冻结的契约面,加一个 `SHELL_TIMEOUT` 要走 §10 的冻结点流程。先按 504 实现并在代码里标注。

## 还没有的东西

`routes/`、`domains/`、`jobs/`、`secrets/`、`mcp/` 以及 `store/migrations/` 都还是空的。按 06 篇的门禁,**六条 spike 全绿之前不开 M0 剩余任务**。当前只注册了 `GET /health` 一条路由。
