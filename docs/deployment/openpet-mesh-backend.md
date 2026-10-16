# OpenPet Mesh Backend

> **速读 / 当前边界**：OpenPet 的 Backend host 运行在广州 CVM `gz-cvm`，只监听 `127.0.0.1:48330`；桌面端通过 EasyTier 上的 `ssh gz-cvm` 建立 `-L` API 与 `-R` Shell bridge。公网安全组、DNS 和公网端口均不需要变更。

## 拓扑与端口

| 组件 | 位置 | 监听 | 说明 |
| --- | --- | --- | --- |
| Backend host | 广州 CVM | `127.0.0.1:48330` | systemd `openpet-backend-host.service` |
| Backend child | 广州 CVM | `127.0.0.1:48332` | 每个桌面 session 启动，host 代理 API |
| Shell reverse bridge | CVM `127.0.0.1:48331` | SSH `-R` | 映射到桌面端随机 loopback 端口 |
| mesh | EasyTier | `10.144.144.8` | `ssh gz-cvm` 的目标，不走公网 |

## 密钥与会话

- Provider/API keys 仍由桌面端 Shell `SecretService` 持久化。
- 启动 remote session 时，keys 只经 loopback API + SSH 隧道注入 Backend child 内存。
- CVM host 不把 keys 写入配置、日志、SQLite 或 systemd 环境；关闭 session 后 child 内存被释放。
- 远端 HTTP API 使用短期 session token；Shell reverse bridge 使用独立的 64 位随机 token。

## 部署与回滚

1. 在隔离 worktree 生成审阅后的 tar（不含 `.git`、`node_modules`、`release`、临时证据）。
2. 通过 `scp`/`ssh gz-cvm` 上传归档与 `scripts/install-openpet-backend-host.sh`。
3. 以 root 执行安装脚本；它会先把既存 `/opt/openpet`、`/var/lib/openpet`、unit 文件复制到 `/var/backups/openpet/<UTC>/`。
4. 脚本在 `/opt/openpet/node` 安装 Node 24，在 `/opt/openpet/app` 安装 production dependencies，并启用 systemd unit。
5. 记录归档 Git revision 和 `sha256sum`。回滚时停止服务，恢复对应快照，执行 `systemctl daemon-reload && systemctl restart openpet-backend-host`。

### 2026-10-11 部署记录

- Service：`openpet-backend-host.service` 为 `active`，以 `openpet` 用户运行；`/var/lib/openpet` 权限为 `0700`。
- Node：`v24.11.1`，安装于 `/opt/openpet/node`。
- 当前 host 源文件 SHA-256：`3af6d6e1fa4b322d9758304f57050fe008e4e7ff7959aed764ef9a43e1deb21e`。
- 安装归档 SHA-256：`97991ab8505820e6f3e9ea0dd61a928b916cec544860cb7c2bb373644ec3ef1d`。
- 最近安装快照：`/var/backups/openpet/20261010T212121Z`。
- 运行记录（不含 token/key）：[`remote-backend/2026-10-11-mesh-smoke.md`](../release-evidence/remote-backend/2026-10-11-mesh-smoke.md)。
- Unit 不启用 `MemoryDenyWriteExecute=true`：Node/V8 JIT 在该限制下会 `SIGTRAP`，服务无法启动；其余文件系统、账户和 capability 限制仍保留。

### 2026-10-17 离线网页登录修复部署

- Revision：`e09b4257`；GitHub CI [38947695151](https://github.com/dengyie/OpenPet/actions/runs/38947695151) 全绿。
- 安装归档 SHA-256：`0677ce698858beb7cb105c0b8fcbf1cd079265f24d3d883ca0c34c9b7910a5e1`。
- CVM 安装快照：`/var/backups/openpet/20261016T182529Z-2783749`。
- 部署后 `openpet-backend-host.service` active，host health 为 `{"ok":true,"status":"idle","apiVersion":"v1"}`；网页首页 200，错误密码 401，正确密码登录 200，idle session 下业务请求 503。Nginx 监听仍为 `10.144.144.8:80/443` 与 `127.0.0.1:80`。

## 只读检查

```bash
ssh gz-cvm 'systemctl is-active openpet-backend-host && ss -ltnp | grep -E "127.0.0.1:(48330|48331|48332)"'
ssh gz-cvm 'curl --fail http://127.0.0.1:48330/__openpet/health'
```

`/__openpet/health` 只证明 host 存活；业务 `/api/v1/health` 必须在 authenticated session 建立后，通过 SSH `-L` 检查。缺少 token 的业务请求应返回 `401`。

### 网页控制台的 session 状态

网页密码配置与桌面 Backend session 是两个独立条件。即使桌面 Shell 尚未连接，已配置密码仍可登录 `https://openpet.mangoqwq.com`，以便查看离线状态；业务 API 需要活动 Backend session，否则 Web token 请求返回 `503 Backend session is offline`。活动 session 由桌面端建立，并将 Provider keys 临时注入 Backend 内存。未带 token 仍返回 `401`，不在网页白名单内的 Web token 路由仍返回 `403`。网页图片生成走 Backend 的 `POST /api/v1/ai/images/web-generate`，参考图只进入 Job 临时目录，生成结果固定保存到 Backend 数据目录的 `creator-web/` 下，并通过 `GET /api/v1/ai/images/preview` 受控预览。完整 Creator 流程由 Backend 上的官方插件生成身份候选、等待人工确认、生成和 QA 动作、提供重试及恢复证据；活动 session 仍需要桌面端在线，桌面 Shell 负责本机宠物库导入与激活。

### 2026-10-17 网页离线登录修复

- 根因：`POST /__openpet/web/login` 在校验密码前要求活动桌面 session，导致密码已配置但 host 为 `idle` 时错误返回 `503 web control is not configured or Backend session is offline`。
- 修复：登录只依赖网页密码配置；Host proxy 对已认证 Web token 明确返回 `503 Backend session is offline`，未认证请求仍为 `401`，并保持白名单路由检查。
- 回归：`host-web-control` 与 Web API 离线状态测试通过；Backend **428/428**、`check:syntax`、Control Center/Web Control production build 通过。未启动 Electron 或桌面 UI。

### 2026-10-17 Backend 图片生成链路

- 网页新增独立的 `POST /api/v1/ai/images/web-generate` Job 入口，避免改变桌面 Control Center 使用的通用 `/ai/images/generate` 契约。
- Backend 固定网页输出目录为 `creator-web/runs/<jobId>/`；浏览器只能提交提示词与 PNG/JPEG/WebP 参考图，不能提交文件系统路径、输出目录、Provider 配置或未知字段。参考图在 Job 临时目录内校验和使用，Job 清理后不保留上传临时副本。
- `GET /api/v1/ai/images/preview` 只允许读取 `creator-web/` 下的图片，做真实路径 containment 和 4 MiB 预览上限；完整 Creator 流程可使用带 SHA-256 的 Backend 图片产物引用，Backend 校验路径、图片签名与哈希后再复制进 Creator run。
- Fresh verification：定向 Backend/Host/Web/Creator 检查 **77/77**，`npm run test:backend` **438/438**，`npm run build:web-control`、`npm run check:node`、`npm run typecheck`、`npm run check:api-contract`、`npm run check:docs-drift`、`git diff --check` 通过；未启动 Electron 或桌面 UI。

### 2026-10-17 网页 Creator 全流程

- 网页提交 `backend: "web"` 后，Backend 直接调用已启用且获 native approval 的官方 `openpet.creator-studio` 命令，执行质量优先全宠物流程；参考图先进入 Backend 插件数据目录的 incoming 暂存区，再由 `create-run` 校验 hash 并归档到该 run，清除临时副本。
- Backend run 固定要求先人工确认身份候选，再生成 idle 与完整动作集、执行动作 QA，并提供身份/动作候选确认、重试与 recovery bundle 校验；网页从 Backend diagnostics 展示进度和候选。
- 图片与 Creator 的生成命令由 Backend Job runner 和官方插件执行；活动 Backend session 由桌面端启动并提供 Provider keys。网页可先生成图片并预览，再选择“以这张图继续完整宠物流程”；Backend 会校验生成产物的相对路径和 SHA-256，再将其归档为 Creator run 参考图。也可直接将上传图提交到完整 Creator 流程。
- Web Creator 提交始终使用 Backend 的完整质量优先流程，即使桌面 session 在线也不会切回旧的桌面 Creator 生成入口。身份/动作选择、重试与 recovery 校验对 Backend-owned run 直接调用 Backend 命令或受限本地验证。
- Backend run 状态单独保存在 Backend 数据库中，网页刷新后仍从 `backendLastRun` 恢复；Shell 自己的本地 Creator run 状态不会覆盖该 owner 标记。
- 桌面包继续自签名，不做付费签名；此项仅记录项目发行边界，不要求签名配置。
- Fresh verification：Backend/Host/Web/Creator 定向检查 **77/77**、Backend 全套 **438/438**、API 契约硬对账 **10/10**、`npm run check:node`、`npm run typecheck`、`npm run build:web-control`、`npm run check:docs-drift` 与 `git diff --check` 通过。恢复校验路径先以新增回归确认失败，再完成修复。全量浏览器测试仍受本机缺少 Playwright Chromium 影响；没有启动 Electron 或调用真实 Provider。

## 当前未覆盖

- 不在工作机启动 Electron；不做 macOS/Windows 签名验收，桌面包继续使用自签名开发流程。
- 不做计费模型生成 smoke；只验证 health、provider metadata 或本地 bridge 协议。
- 需要本机文件选择器的 Pet Pack/Actions 导入仍由 Shell 处理，远端 Job 只接收已授权的 bridge 请求。网页图片与完整 Creator 生成、候选审核、动作 QA、重试和恢复由 Backend 处理；宠物导入和激活仍由 Shell 处理。
- 远端 Backend 的 HTTP/MCP 服务仍绑定在 CVM loopback；桌面 SSH connector 转发 Backend host/API `48330` 与 Shell reverse bridge `48331`。第三方本机 MCP 客户端若要直连远端 MCP 端口，需要单独配置受控 SSH `-L` 转发；Control Center 的 Pet/Actions 文件选择仍由本机 Shell 完成。
