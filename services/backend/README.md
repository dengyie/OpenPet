# `@openpet/backend`

OpenPet 的后端 sidecar。桌面 Shell 通过 `child_process.fork` 启动；广州 host 也会以远端会话方式 fork 它，子进程和 host 都只监听回环地址。

## Mesh Web Control

`services/backend/host.js` 可托管 `dist/web-control` 静态前端，并用内存中的网页登录令牌代理 `/api/v1/*`。网页登录令牌不会写入磁盘，Backend session 结束后全部失效。Host 本身仍必须绑定 `127.0.0.1:48330`；由广州 CVM 上仅绑定 EasyTier 地址的 Nginx 负责 HTTPS 入口。

Web 控制台在广州的 resident 模式下可以直接编排 Backend AI、图片和 Creator 任务。Provider keys 由 host 从 `/etc/openpet/provider-keys.json` 注入并以 0600 权限原子持久化；参考图上传、桌面 PetService、最终 pet-pack import/activate 等桌面专属能力仍需要在线 OpenPet Shell。桌面 Shell 离线时这些能力会返回明确的 `BACKEND_UNAVAILABLE`，Backend 本身继续保持可用。

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
2. 等 Host/Shell 的 `init`(resident 模式从受保护文件读取的密钥或桌面 Shell 注入的密钥),10 秒未到则 `exit 65`。
3. 绑定 `127.0.0.1:0`,生成 `sessionToken`。
4. `listening` 后发 `ready { port, apiVersion, pid, sessionToken, startupMs }`。

好处是只有一个就绪点:拿到 `ready` 就意味着端口能连、密钥已在内存。若按 spike 的顺序,`ready` 之后还有一段「HTTP 已通但密钥未到」的窗口,每个依赖密钥的路由都得自己判一次。

## 独立运行

后端要求 IPC 通道,不能直接 `node index.js`。调试用一个七行的宿主:

```js
import { fork } from "node:child_process"
const child = fork("services/backend/index.js", [], { stdio: ["ignore", "inherit", "inherit", "ipc"], serialization: "advanced" })
child.on("message", (m) => console.log("<-", JSON.stringify(m)))
child.send({ v: 1, id: "host-1", at: Date.now(), body: {
  type: "init",
  userDataDir: "/tmp/openpet-dev",
  providerKeys: {},
  legacyToken: null,
  localHttpConfig: { enabled: false, host: "127.0.0.1", port: 0 },
} })
```

拿到 `ready` 里的 `port` 与 `sessionToken` 之后:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/api/v1/health
```

未带 token 会返回 `401 UNAUTHORIZED` —— 03 篇 §8 的「不设例外」包括 `/health`。

## 已知边界与待验证风险

### ESM 与 asar(已登记并已缓解)

ADR-004 让 sidecar 作为同 asar 内的 Node 脚本运行,而本包是 ESM(`"type": "module"`)。历史 spike 曾命中 `spawn ENOTDIR`;当前打包配置已将 `services/backend/**` 加入 `asarUnpack`,并由 Shell resolver 从 unpacked 路径启动。打包或 Electron 版本变化时仍需重跑 packaged sidecar ready smoke。

- 影响面:若 `asarUnpack`、resolver 或构建白名单回退,打包后 sidecar 可能起不来。
- 判定:跑 packaged runtime smoke,确认产物中的 sidecar 能 `ready` 且 clean exit,而不只是确认路径解析成功。
- 退路:保留当前 unpacked resolver；只有正式回归失败时才评估把本包降为 CJS。

### `ERROR_HTTP_STATUS` 目前有两份

`http/middleware.js` 里的 `GENERIC_ERROR_HTTP_STATUS` 与 `packages/contracts/src/envelope.ts` 里的同名常量仍各有一份。workspace 已接入；后续应以契约包为源并补门禁对账，当前不要再复制第三处。

为了不让两份漂移,这里只定义 13 个通用错误码的状态映射;**8 个专用业务码不在这里出现**,抛出方必须显式传 `status`。接入 workspaces 后本文件改为 re-export,并给 `check:api-contract` 加一条对账。

### `dialog.result` 超时用 `PROVIDER_TIMEOUT`

03 篇定的是 504,而 504 对应的码叫 `PROVIDER_TIMEOUT`。Shell 弹窗不是 provider,语义别扭但不新增码 —— 错误码表是冻结的契约面,加一个 `SHELL_TIMEOUT` 要走 §10 的冻结点流程。先按 504 实现并在代码里标注。

## 还没有的东西

`routes/`、`domains/`、`jobs/` 与 `store/migrations/` 已承载当前 sidecar 实现；当前 route registry 注册 104 条实际 method/path，并完成 SQLite 迁移、Job 恢复/调度与 settings/About/AI Talk 等已交付域。完整接口与目标/blocked 缺口以 `docs/refactor/03-api-contract.md`、`docs/refactor/09-repo-state.md` 和 `npm run check:api-contract` 为准。不要根据本 README 发明未注册的空壳实现。
