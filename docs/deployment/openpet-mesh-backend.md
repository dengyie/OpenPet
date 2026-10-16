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

## 只读检查

```bash
ssh gz-cvm 'systemctl is-active openpet-backend-host && ss -ltnp | grep -E "127.0.0.1:(48330|48331|48332)"'
ssh gz-cvm 'curl --fail http://127.0.0.1:48330/__openpet/health'
```

`/__openpet/health` 只证明 host 存活；业务 `/api/v1/health` 必须在 authenticated session 建立后，通过 SSH `-L` 检查。缺少 token 的业务请求应返回 `401`。

### 网页控制台的 session 状态

网页密码配置与桌面 Backend session 是两个独立条件。即使桌面 Shell 尚未连接，已配置密码仍可登录 `https://openpet.mangoqwq.com`，以便查看控制台的离线状态；此时 Web token 调用允许的业务路由返回 `503 Backend session is offline`，而不是伪装成未配置或未认证。未带 token 仍返回 `401`，不在网页白名单内的 Web token 路由仍返回 `403`。上传、生成、恢复和导入按钮会在桌面 Shell 离线时禁用。

### 2026-10-17 网页离线登录修复

- 根因：`POST /__openpet/web/login` 在校验密码前要求活动桌面 session，导致密码已配置但 host 为 `idle` 时错误返回 `503 web control is not configured or Backend session is offline`。
- 修复：登录只依赖网页密码配置；Host proxy 对已认证 Web token 明确返回 `503 Backend session is offline`，未认证请求仍为 `401`，并保持白名单路由检查。
- 回归：`host-web-control` 与 Web API 离线状态测试通过；Backend **428/428**、`check:syntax`、Control Center/Web Control production build 通过。未启动 Electron 或桌面 UI。

## 当前未覆盖

- 不在工作机启动 Electron；不做 macOS/Windows 签名验收，桌面包继续使用自签名开发流程。
- 不做计费模型生成 smoke；只验证 health、provider metadata 或本地 bridge 协议。
- 需要本机文件选择器的 Pet Pack/Actions 导入仍由 Shell 处理，远端 Job 只接收已授权的 bridge 请求。
- 远端 Backend 的 HTTP/MCP 服务仍绑定在 CVM loopback；桌面 SSH connector 转发 Backend host/API `48330` 与 Shell reverse bridge `48331`。第三方本机 MCP 客户端若要直连远端 MCP 端口，需要单独配置受控 SSH `-L` 转发；Control Center 的 Pet/Actions 文件选择仍由本机 Shell 完成。
