# 02 · 目标架构、进程职责与安全设计

> 🧩 本篇定义目标形态、进程职责边界、目录结构、启停时序、降级策略与安全模型。任何代码改动前应先对齐本篇。

## 1. 目标架构

不做「Web 后端」,做 **本地 sidecar 服务**。三个进程,三种职责,两种通信介质。

```text
┌────────────────────────────────────────────────────────┐
│ Shell — Electron 主进程(轻量)                            │
│ · 窗口 / 托盘 / 全局快捷键 / 单实例锁                    │
│ · PetService(宠物状态唯一源,保留)                        │
│ · 原生能力: dialog / system-cursor / screen              │
│ · sidecar 生命周期 + token 注入                          │
└────┬───────────────────────┬───────────────────────────┘
     │ contextBridge / IPC     │ fork 消息通道
     │ (窗口与原生能力)        │ (双向,不占端口)
     ▼                         ▼
┌────────────────┐        ┌───────────────────────┐
│ Frontend       │        │ Backend Sidecar        │
│ (渲染进程)     │        │ (独立 Node 进程)       │
│                │        │                        │
│ · 宠物渲染     │◄─ SSE ─│ · 插件管理/安装/运行   │
│ · 动作播放     │        │ · AI 对话 / Provider   │
│ · 拖拽/hitbox  │─ HTTP ►│ · 图像生成(Job)        │
│ · Control      │        │ · Creator Studio       │
│   Center UI    │        │ · 密钥存储 / Catalog   │
│ · 状态展示     │        │ · MCP / 对外 HTTP      │
└────────────────┘        └───────────────────────┘
                                      ▲
                                      │ loopback HTTP
                           外部 MCP 客户端 / 脚本
```

## 2. 三个进程的职责边界

### 2.1 Shell(Electron 主进程)

| 保留 | 理由 |
| --- | --- |
| 所有 `BrowserWindow` 管理 | 原生能力,无法迁移 |
| `PetService`(3.8 KB) | 高频同步读写,跨进程会引入动画抖动 |
| `pet-movement-policy.js`(7.4 KB) | 位置计算属于渲染循环 |
| `screen.js`、`window.js` | 屏幕/窗口几何 |
| `system-cursor-service.js`(15 KB) | 需要 native helper(`build/native/`) |
| `cursor-asset-service.js`(5.3 KB) | 与系统光标强耦合 |
| `dialog.showOpenDialog` 包装 | 原生弹框 |
| `single-instance.js`、`user-data-path.js`、`app-lifecycle-logger.js` | 应用级生命周期 |
| 宠物窗口子系:`pet-chat-window.js`、`pet-bubble-chat-window.js`、`pet-context-menu-*.js` | 均为窗口实现 |
| sidecar 启停、健康检查、崩溃重拉 | 父进程职责 |

> 💡 **为什么 PetService 不搬后端:** 它只有 3.8 KB,是纯状态机,且被宠物窗口、右键菜单、气泡聊天三处**同步**依赖。每次 `say` / `playAction` 如果多一跳网络,在 60 FPS 渲染循环下会直接表现为动作延迟与气泡错位。后端通过反向通道调用它即可。

### 2.2 Frontend(渲染进程)

| 保留 | 说明 |
| --- | --- |
| 宠物精灵图渲染与帧调度 | `renderer.js` 核心 |
| 动作列表与帧路径本地缓存 | 启动拉一次,SSE 增量更新 |
| 拖拽、hitbox、鼠标穿透、viewport | 本地交互 |
| Control Center 全部 UI | React |
| 服务状态 / 日志 / 任务进度展示 | 只读展示 |
| 表单校验(仅 UX 层) | 后端必须重复校验 |

**前端明确不再持有:** 插件安装逻辑、provider 调用、密钥、文件系统写入、子进程管理、任务编排。

### 2.3 Backend Sidecar

| 接管 | 源文件(待迁) |
| --- | --- |
| 插件发现/安装/校验/启停/日志 | `plugin-*.js` 共 18 个 |
| AI 对话与 Provider 调用 | `ai-service.js`、`ai-talk-service.js`、`ai-talk-store.js` |
| 图像/精灵图生成 | `image-generation-model-service.js`、`sprite-generator.js`、`hatch-pet-*` |
| Creator Studio 工作流 | `creator-*.js` 共 5 个 |
| 行为编排与触发规则 | `behavior-orchestrator-service.js`、`trigger-rule-runtime-service.js` |
| 宠物包与动作配置 | `pet-pack-service.js`、`action-service.js`、`action-import-service.js` |
| 密钥存储 | `secret-service.js` |
| Catalog | `catalog-service.js` |
| 对外 HTTP + MCP | `local-http-service.js`、`mcp-transport-service.js` |
| 日志与证据 | `app-log-service.js`、`plugin-log-store.js`、`pet-utterance-log-service.js` |
| **新增** Job 引擎 | 新建 |
| **新增** SQLite 存储层 | 新建 |

### 2.4 职责归属速查

| 能力 | Shell | Frontend | Backend |
| --- | --- | --- | --- |
| 窗口与托盘 | ✓ | | |
| 宠物状态(say/action/event) | ✓ 持有 | 读 | 调用 |
| 动画帧渲染 | | ✓ | |
| 动作配置读写 | | 读 | ✓ 写 |
| 插件安装与运行 | | | ✓ |
| 插件 dashboard 开窗 | ✓ 执行 | 触发 | 发起 |
| AI 调用与密钥 | | | ✓ |
| 文件选择弹框 | ✓ | 触发 | 消费路径 |
| 设置持久化 | 读 | 读 | ✓ 写 |
| 窗口位置持久化 | ✓ | | |
| MCP 对外服务 | | | ✓ |

## 3. 目录结构(monorepo)

```text
openpet/
├─ package.json                 # workspaces 根
├─ apps/
│  ├─ desktop/                  # Electron Shell
│  │  ├─ main.js
│  │  ├─ preload.js
│  │  ├─ control-center-preload.js   # 目标 < 5 KB
│  │  ├─ renderer.js
│  │  ├─ index.html
│  │  └─ src/
│  │     ├─ windows/           # window / screen / pet-chat / bubble / context-menu
│  │     ├─ pet/               # pet-service / movement-policy
│  │     ├─ native/            # system-cursor / cursor-asset
│  │     ├─ sidecar/           # 启停、健康检查、反向通道
│  │     └─ ipc/               # 仅保留 41 个窗口/原生通道
│  └─ control-center/           # React + Vite(原 src/control-center)
│     └─ src/
│        ├─ api/               # 仅 client,无 mock 业务逻辑
│        ├─ panes/             # 拆分后的面板
│        ├─ features/          # 按域组织的业务组件
│        └─ hooks/             # useJob / useSse(数据读取统一走 TanStack Query)
├─ services/
│  └─ backend/
│     ├─ index.js               # fork 入口
│     ├─ http/                  # server / middleware / router / errors
│     ├─ routes/                # 按域,对应原 register-*-ipc
│     ├─ domains/               # plugins / ai / creator / catalog / actions / pet-packs
│     ├─ jobs/                  # 队列、运行器、状态机
│     ├─ store/                 # sqlite 连接、migration、repository
│     ├─ secrets/               # secret-service
│     ├─ bridge/                # 反向通道客户端(向 Shell)
│     └─ mcp/                   # mcp-transport-service
├─ packages/
│  ├─ contracts/                # openpet-contracts + api-contracts + 生成的 client/mock
│  └─ shared/                   # cursor-library / pet-hitbox / cursor-style(单一 TS 源)
├─ cat_anime/                   # 不动(规则要求保持结构)
├─ assets/ catalog/ design-system/ native/ build/ examples/ scripts/ docs/ tests/
└─ playwright.config.js
```

> ⚠️ `package.json` 的 `build.files` 是白名单式,当前已覆盖 `apps/desktop/**`、`services/backend/**`、`packages/**`、`dist/control-center/**`。目录调整后仍必须同步更新,否则打包产物会静默缺少文件；这与 R20 的 `asarUnpack` 运行时修复是两件事。

## 4. 启动与关闭时序

### 4.1 启动

```text
1. Shell: 单实例锁检查
2. Shell: configureUserDataPath
3. Shell: 生成 sessionToken = randomBytes(32)   ← 仅驻内存
4. Shell: fork services/backend/index.js
         传入 { userDataPath, sessionToken, logLevel } via env + first message
5. Backend: 初始化 SQLite(WAL) → 跑 migration
6. Backend: 监听 127.0.0.1:0(随机端口)
7. Backend: 回报 { ready: true, port } → Shell
8. Shell: 创建宠物窗口(不等后端,保证宠物秒开)
9. Shell: 收到第 7 步 ready 后,才通过 preload 注入 { baseUrl, sessionToken }
         在此之前 getBackend() 返回 null —— 这是正常初始态,不是错误
10. Frontend: 首帧渲染可能早于第 9 步 → 请求进入排队(上限 50 条 / 10 秒)
11. Frontend: 收到 onBackendChanged → 冲刷队列 → GET /api/v1/health → 建 SSE 订阅
12. Backend: 恢复未完成 Job(running → 标记 interrupted,由用户重试)
13. Backend: 按设置启动已 enabled 的插件服务(仍不自动启动未授权项)
```

**关键约束一:第 8 步不等待后端。** 宠物窗口必须在 sidecar 未就绪时也能启动并进入待机动作,否则体验倒退。

**关键约束二:第 9 步必须等 `ready` 消息。** 端口由 `listen(0)` 分配,注入前根本不存在;而 Control Center 的渲染速度快于端口绑定,因此「前端已渲染、但后端 `ready` 还没回来」是**每次冷启动的必经状态**,不是异常。前端 api client 必须实现请求排队(见 [03 篇 §1.2](./03-api-contract.md) 与 [05 篇 §2.2](./05-frontend.md)),不得在 `getBackend()` 返 `null` 时抛错。

### 4.2 关闭

```text
1. Shell: before-quit → 发送 { type: 'shutdown', graceMs: 5000 }
2. Backend: 停接新请求,标记 running Job 为 interrupted 并落盘
3. Backend: 按 service-process-tree 逐层终止插件子进程
4. Backend: 关闭 SQLite(checkpoint) → process.exit(0)
5. Shell: 超过 graceMs 未退 → SIGTERM → 再 2s → SIGKILL
6. Shell: 销毁窗口 → 退出
```

### 4.3 崩溃重拉

| 条件 | 行为 |
| --- | --- |
| sidecar 非零退出 | 1s 后重启,指数退避(1s → 2s → 4s → 8s) |
| 5 分钟内连续 5 次失败 | 停止重试,进入降级模式,弹窗提示并提供「导出日志」 |
| 重启后 | 新端口 + 新 token,通过 IPC 推送给前端重建连接 |
| 重启前的 running Job | 启动时扫描并标记 `interrupted`,由用户选择重试 |

## 5. 降级模式规范

sidecar 不可用时,**宠物必须继续正常走动**。

| 能力 | 降级模式下 |
| --- | --- |
| 宠物渲染与待机动画 | ✅ 正常(帧资源已本地缓存) |
| 拖拽、右键菜单、退出 | ✅ 正常(纯 IPC) |
| 手动触发已知动作 | ✅ 正常(PetService 在 Shell) |
| AI 对话、生成、插件操作 | ❌ 禁用,按钮置灰 + 统一横幅提示 |
| Control Center 展示 | ⚠️ 只读,展示最后一次缓存快照 + 「数据可能过时」标记 |
| 设置修改 | ❌ 禁用(后端是唯一写者) |

**统一降级横幅文案:**「本地服务未运行,插件与 AI 功能暂不可用。宠物不受影响。」+ 「重试」/「导出诊断」两个动作。

## 6. 安全设计

### 6.1 两套独立的 token

这是本方案的安全核心,**必须区分**:

| | 会话 token(新增) | MCP token(现有) |
| --- | --- | --- |
| 用途 | Frontend → Backend | 外部客户端 → `/mcp`、`/api/pet/*` |
| 生命周期 | 每次启动重新生成 | 用户可见、手动轮换 |
| 存储 | 仅内存,不落盘 | `settings.json`(现状保留) |
| 传递 | fork 消息 + preload 一次注入 | 用户手动复制 |
| 可访问路径 | 全部 `/api/v1/*` | 仅 `/mcp` 与兼容的 `/api/pet/*` |
| 默认启用 | 是 | **否**(保持现有默认关闭策略) |

**这是两个监听器,不是一个。** `/api/v1/*`(会话 token、`listen(0)` 随机端口、仅回环、随应用启动)与 `/mcp` 及兼容的 `/api/pet/*`(MCP token、用户自选端口、默认关闭)由同一个 sidecar 进程内的**两个独立 HTTP server** 提供。sidecar 内嵌 MCP 后必须继承原有端口配置,对外行为零变化(见 [03 篇 §8](./03-api-contract.md))。

### 6.2 传输层硬约束

- 仅绑定 `127.0.0.1`(复用现有 `LOOPBACK_HOSTS` 校验,非回环直接 throw)。
- 端口 `0`(随机),不固定,降低被扫概率。
- 全部 `/api/v1/*` 强制鉴权,**包括 `/health`,不设免鉴权例外**。未鉴权一律返 `401` 且不带任何信息(与 §6.5 一致)。理由:前端拿到 `baseUrl` 的同时必然拿到 token(同一条 preload 注入),Shell 判活走 fork 通道而不走 HTTP,因此不存在需要免鉴权探活的合法调用方。
- 保留现有 `crypto.timingSafeEqual` 常量时间比较。
- 校验 `Origin` / `Host`:拒绝非 `127.0.0.1` 的 Host 头,防 DNS rebinding。
- 保留 1 MB body 上限(现有 `MAX_BODY_BYTES`),文件类走路径引用而非流上传。
- 不设 CORS 允许头(渲染进程同源不需要);若 dev 模式需要,仅允许 `http://127.0.0.1:5173`。

### 6.3 密钥边界

| 规则 | 实现 |
| --- | --- |
| 密钥只写不读 | 保持现有模式:无 `GET api-key` 类接口 |
| 响应仅返回存在性 | `{ configured: true, maskedTail: "…a1b2" }` |
| 存储位置 | `userData/backend/secrets/providers.enc`,**由 Shell 写入,sidecar 不落盘** |
| 日志脱敏 | 复用 `log-safety.js`,对所有出参过滤;需补 provider 密钥匹配模式 |
| 加解密执行方 | **Shell**。`safeStorage` 是 Electron API,在纯 Node sidecar 里不可用;启动时 Shell 解密后经 `init` 消息一次性注入。见 ADR-010 与 [04 篇 §4.1.1](./04-subsystems.md) |
| 后端内存副本 | 允许存在,但不得落盘、不得进入任何会被序列化的对象(防止误入 trace 或崩溃转储) |
| 加密不可用时 | 退回 `0600` 明文文件,并在 Control Center 顶部常驻告警条,不静默降级 |
| 错误体 | provider 错误必须重写,不透传原始请求头 |
| 插件可见性 | 插件永不直接拿密钥,仅能通过 `model:image-generate` 等桥权限间接调用 |

### 6.4 插件安全不降级

现有约束全部保留,且由后端统一执行:

- 插件命令/服务 spawn 时不经 shell 展开(`plugin-command-runner.js` 现有行为)。
- 不自动启动;本机二进制执行需 `setNativeExecutionApproved` 显式授权。
- 桥权限白名单(含 `trigger-proposals:write`、`model:image-generate`)在后端校验,不依赖前端。
- 插件网络访问仍走 `plugin-network-client.js` 与 `bounded-response-body.js` 限制。
- 本地 HTTP 与 MCP 保持默认关闭。

### 6.5 新增风险面与缓解

| 新增风险 | 缓解 |
| --- | --- |
| 本机其他进程探测后端端口 | 随机端口 + 全端点鉴权 + 未鉴权统一 `401` 不泄露信息 |
| 会话 token 泄露 | 仅内存、启动轮换、不入日志、不入 URL query |
| 恶意本地页面请求后端 | Host 头校验 + 不返回 CORS 头 + token 不可猜 |
| 后端代码明文可见 | E6 采用 `build.asarUnpack = ["build/native/**/*", "services/backend/**"]`;后端 JS 位于 `resources/app.asar.unpacked/services/backend/index.js`,不得把源码不可见当作安全边界 |
| sidecar 被替换(DLL/脚本劫持) | 依靠代码签名 + 安装目录写权限(与签名轨道共同推进);`app.asar.unpacked` 不受 asar 完整性保护 |
| 反向通道被滥用 | fork channel 不可从外部达到;消息类型白名单 + 负载 schema 校验 + `v: 1` 版本信封(ADR-011),版本不符即杀并重拉 |

## 7. 可观测性

| 项 | 方案 |
| --- | --- |
| 请求 ID | 每个请求生成 `requestId`,贯穿日志与错误体 |
| 访问日志 | 从 `settings.json` 移出,写 SQLite `http_access_logs` 表 |
| 结构化日志 | 后端统一 JSON 行日志 → `userData/logs/backend-*.log`,按天轮转 |
| 进程指标 | `/api/v1/service/status` 返回 sidecar 内存、运行时长、活跃 Job 数、子进程数 |
| 性能预算 | 统一响应体的 `meta.elapsedMs` 是 P95 断言的数据源;预算表见 [03 篇 §10](./03-api-contract.md),M2 起进 CI |
| 链路跟踪 | 复用现有 `ai-talk` trace 体系,新增 `requestId` 关联 |
| 诊断导出 | `POST /api/v1/service/diagnostics` 一键打包日志 + 配置快照(脱敏后,不含任何密钥) |

## 8. 打包与发布影响

| 项 | 影响 | 处理 |
| --- | --- | --- |
| `build.files` 白名单 | 已包含 `services/**/*` 与 `packages/**/*` | 后续目录调整须同步白名单并重新验证 `npm run pack` |
| asar | ESM sidecar 以 `app.asar` 路径 fork 会因 `cwd` 为 asar 内目录而 `spawn ENOTDIR` | `services/backend/**` 置于 `asarUnpack`;打包时入口为 `resources/app.asar.unpacked/services/backend/index.js`。实测:`isPackaged=true`,`appPath=resources/app.asar`,`resourcesPath=resources`,`__dirname=resources/app.asar.unpacked/services/backend`;已收到 ready 并 clean exit |
| SQLite | ADR-014 已定为 `node:sqlite`,不引 `better-sqlite3`,避开 native 重建与二次公证 | Electron 42.4.0 / Node 24.16.0 中模块无需 flag,部分索引与事务通过;`:memory:` 不能验证 WAL,须由 G11 以 file-backed DB 补验 |
| macOS 签名 | 现有已有「code has no resources」故障 | 不在本期解决;但新增目录不得引入新的未签名二进制 |
| 启动时间 | +fork 开销约 80–150 ms | 宠物窗口不等待后端,用户无感 |
| 安装包体积 | 不变(复用内置 Node) | — |
| 升级迁移 | 首次启动需跑 JSON → SQLite 迁移 | 带备份与回滚,详见 [04 篇](./04-subsystems.md) |

> 📌 **`node:sqlite` 的模块前提已由 E3 证实。** Electron 42.4.0 / Node 24.16.0 下无需 flag,模块、部分唯一索引与显式事务均通过;但 `:memory:` 探针返回 `journal_mode='memory'`,WAL 仍未验证,遗留缺口 G11 归 T35(卡面 [#41 §5](https://github.com/dengyie/OpenPet/issues/41),进度 [#41 §4](https://github.com/dengyie/OpenPet/issues/41))。实测见 [07 篇](./07-spike.md) §7 第 6 行。
