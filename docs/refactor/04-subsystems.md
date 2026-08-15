# 04 · 关键子系统改造

> ⚙️ 本篇处理四个不能简单平移、必须重设计的子系统:插件运行时、Job 引擎、存储与并发、Provider 与密钥。这四块占总工作量约 55%。

## 1. 插件运行时改造

### 1.1 现状的依赖环

```text
插件子进程
   │ HTTP → plugin-runtime-bridge-server.js (主进程内)
   ▼
 桥权限校验(trigger-proposals:write / model:image-generate / …)
   │
   ├─→ PetService.say() / playAction()   ← 在主进程
   ├─→ imageGenerationService            ← 将迁后端
   └─→ actionService.submitProposal()    ← 将迁后端
```

分离后这三条分支落在两个不同进程,桥必须能同时触及两边。

### 1.2 目标拓扑

桥服务器**整体搬到后端**,需要主进程能力时走反向通道:

```text
插件子进程
   │ HTTP (loopback, 独立端口)
   ▼
 plugin-runtime-bridge-server(后端内)
   │ 权限校验(不变)
   ├─→ 后端本地服务        ───→ 直接调用
   └─→ 需要宠物/窗口能力    ───→ fork 反向通道 → Shell
```

**桥权限映射表**:

| 权限 | 分离后执行位置 | 是否走反向通道 |
| --- | --- | --- |
| `pet:say` | Shell PetService | ✅ |
| `pet:play-action` | Shell PetService | ✅ |
| `pet:event` | Shell PetService | ✅ |
| `trigger-proposals:write` | Backend actionService | ❌ |
| `model:image-generate` | Backend → Job | ❌ |
| `settings:read` | Backend | ❌ |
| `logs:write` | Backend | ❌ |
| `network:fetch` | Backend pluginNetworkClient | ❌ |

### 1.3 两个无法迁移的能力

#### `PLUGINS_OPEN_DASHBOARD`

需要 `new BrowserWindow()`。方案:

1. 前端点击 → `POST /api/v1/plugins/{id}/dashboard` 拿 dashboard 元信息(URL、尺寸、权限)
2. 后端校验插件状态与权限后,发 `{ type: "window.openPluginDashboard", pluginId, url }`
3. Shell 创建窗口(沙箱参数由 Shell 硬编码,**不信任后端传入的 webPreferences**)
4. Shell 回报窗口 ID,后端记录到插件运行状态

> 🔒 安全红线:反向通道只能传 `pluginId` 与相对 URL。窗口的 `webPreferences`、`sandbox`、`nodeIntegration` 必须由 Shell 硬编码,防止后端(或冒充后端的插件)提权。

#### `PLUGINS_INSPECT_PACKAGE` —— 两段式文件选择

这个模式要在全项目统一(插件安装、宠物包导入、帧导入、光标导入都适用):

```text
前端                    Shell                      Backend
  │  IPC: dialog.pick      │                            │
  │────────────────►│ showOpenDialog()           │
  │◄───── paths[] ───────│                            │
  │                        │                            │
  │  POST /plugins/inspect { path }                     │
  │──────────────────────────────────────►│ 读取与校验
  │◄───────── manifest / 错误 ──────────────────│
```

**路径安全规则**(后端必须执行):

- 只接受绕对路径,先 `fs.realpath` 解符号链接
- 拒给 `userData` 与应用目录内部的系统路径写入
- 校验文件后缀与魔术字(zip 头)
- 单次文件大小上限(建议 200 MB)
- 解压时防 zip slip(复用 `zip-archive-utils.js` 现有校验)

### 1.4 插件子进程生命周期

| 项 | 现状 | 分离后 |
| --- | --- | --- |
| 父进程 | Electron 主进程 | **Backend sidecar** |
| 孤儿进程风险 | 主进程崩溃后可能残留 | sidecar 崩溃后同样残留,**需新增回收机制** |
| 回收方案 | — | 启动时读 `userData/backend/pids.json`,校验进程名后杀残留 |
| 终止顺序 | `service-process-tree.js` | 不变,搬入后端 |
| 资源隔离 | 无 | 建议新增子进程内存/CPU 软限与超限告警 |

> ⚠️ **孤儿进程是新增风险。** 分离前,Electron 主进程退出会连带子进程(用户可见应用已关)。分离后如果 sidecar 被 SIGKILL,插件子进程可能掉到 init 下后台存活。**必须在 M3 完成 pid 台账 + 启动清理。**

## 2. Job 引擎

### 2.1 为何必须新建

17 类长任务(见 [03 篇 §6.3](./03-api-contract.md) 的 `kind` 枚举)当前都是 `ipcMain.handle` 的 await。图像生成 265 秒、超时阀值 420 秒,同步 HTTP 无法覆盖。

### 2.2 状态机

```text
queued       ──(出队执行)──►   running
queued       ──(用户取消)──►   canceled
running      ──(完成)──────►   succeeded
running      ──(异常)──────►   failed
running      ──(用户取消)──►   canceled
running      ──(进程重启)──►   interrupted

failed / canceled / interrupted  ──(retry)──►  queued
succeeded 为终态,不可再转
```

| 状态 | 含义 | 可取消 | 可重试 |
| --- | --- | --- | --- |
| `queued` | 已入队未开始 | ✅ | — |
| `running` | 执行中 | ✅(取决于 kind) | — |
| `succeeded` | 成功 | ❌ | ❌ |
| `failed` | 失败 | ❌ | ✅ |
| `canceled` | 用户取消 | ❌ | ✅ |
| `interrupted` | 进程重启导致中断 | ❌ | ✅ |

### 2.3 并发与队列

| kind 分类 | 并发度 | 理由 |
| --- | --- | --- |
| 图像/精灵图生成 | **1** | 显存/API 配额敏感,串行更可控 |
| Creator 工作流 | 1 | 内部已包含多步并发 |
| 插件安装 | 2 | I/O 为主 |
| 插件命令 | 4 | 短任务 |
| 宠物包/帧导入 | 2 | 磁盘 I/O |
| 其他 | 4 | — |

**互斥锁**:同一 `resourceKey`(如 `pet-pack:{id}`、`plugin:{id}`)同时只允许一个 Job,冲突时返 `423 LOCKED` 并带上占用的 `jobId`。数据库侧的强约束是 §3.4 的 `idx_jobs_resource_active` 部分唯一索引。

### 2.4 进度上报规范

```ts
type JobProgress = {
  phase: string       // 如 "prompting" | "rendering" | "post-processing"
  percent: number     // 0–100,单调递增,不得回退
  message?: string    // 中文可读,如 "第 3/5 帧"
  etaMs?: number
}
```

**节流**:同一 Job 最快 500 ms 上报一次;`percent` 变化 < 1 且 `phase` 未变则丢弃。

**无进度场景**:provider 不提供进度时,`percent` 保持 `-1`,前端渲染不确定进度条 + 已耗时计时。

### 2.5 取消与超时

| 场景 | 实现 |
| --- | --- |
| 取消 queued | 直接出队,置 `canceled` |
| 取消 running(provider 请求) | `AbortController.abort()`,清理临时文件 |
| 取消 running(子进程) | SIGTERM → 2s → SIGKILL,走 `service-process-tree` |
| 不可取消阶段 | 如正在写入最终文件,返 `423 JOB_NOT_CANCELABLE` |
| 超时 | 每 kind 独立阀值;图像生成沿用现有 420s |
| 重试 | 默认 `maxAttempts: 1`(即不重试);provider/网络类 kind 取 `maxAttempts: 2`,自动重试 1 次 —— [03 篇 §6.2](./03-api-contract.md) 里 `image.generate` 示例的 `maxAttempts: 2` 就是后者 |

### 2.6 重启恢复

启动时扫描 `jobs` 表:

1. `running` → `interrupted`,写入 `error.code = "BACKEND_RESTARTED"`
2. `queued` → 保持,重新入队
3. 清理临时目录 `userData/backend/tmp/job-*`
4. 发 SSE `system.jobs-recovered` 告知前端刷新

> ✅ **已补登(v1.3)。** 第 4 步的 `system.jobs-recovered` 与背压段的 `system.events-dropped` 已补进 [03 篇 §5](./03-api-contract.md) 的事件目录(`system` topic 现列四个事件),并已纳入 `check:api-contract` 的 `EVENT_NAMES` 对账范围。实现时事件名一律从 `packages/contracts` 取,不要在后端重写字面量。

## 3. 存储与并发

### 3.1 现状问题

`settings-service.js` 只有 1.6 KB,模式是全量 `get()` → 展开合并 → `save()`。单进程下能跑,两个进程同时写就会丢数据。更糟的是 `local-http-service.js` 把访问日志也写进 `settings.localHttp.logs`,等于每条请求触发一次全量设置写盘。

### 3.2 单写者原则

| 数据 | 唯一写者 | 其他方访问方式 |
| --- | --- | --- |
| `settings.json`(业务配置) | **Backend** | Shell/Frontend 走 HTTP 读 + SSE 监听 |
| 窗口几何、宠物位置 | **Shell** | 独立文件 `window-state.json` |
| 密钥 | **Backend** | 不可读 |
| 日志、Job、对话 | **Backend** | HTTP 读 |
| 帧缓存索引 | **Backend** | 前端内存缓存 |

> 💡 **把窗口几何从 `settings.json` 拆出去。** 它是 Shell 高频写入的(拖拽、缩放),与业务配置放一起会制造不必要的跳进程写竞争。拆开后两边各自单写者,零冲突。

### 3.3 userData 目录布局

```text
userData/
├─ settings.json              # Backend 单写,业务配置(去掉 logs 字段)
├─ window-state.json          # Shell 单写(新增)
├─ backend/
│  ├─ openpet.db              # SQLite(WAL)
│  ├─ openpet.db-wal
│  ├─ secrets/                # 密钥,0600 权限
│  ├─ pids.json               # 子进程台账(新增)
│  └─ tmp/job-<id>/           # Job 临时目录
├─ logs/
│  ├─ backend-2026-08-09.log
│  └─ shell-2026-08-09.log
├─ plugins/                   # 不变
├─ pet-packs/                 # 不变
└─ cursors/                   # 不变
```

### 3.4 SQLite schema

驱动按 ADR-014:优先 **Node 22 内置 `node:sqlite`**,但一律经 `services/backend/store/db.js` 的 driver 接口(`exec` / `prepare` / `transaction`)访问 —— 不得在仓库里直引 `node:sqlite`。这层间接层就是为了在 spike 第 6 条不通时能整体切到 `better-sqlite3`(风险 R18)。连接参数:`journal_mode = WAL`、`busy_timeout = 5000`。

```sql
-- 对话
CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  persona_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_conv_updated ON ai_conversations(updated_at DESC);

CREATE TABLE ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_msg_conv ON ai_messages(conversation_id, created_at);

CREATE TABLE ai_memories (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);

-- Job
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  resource_key TEXT,
  input_json TEXT NOT NULL,
  result_json TEXT,
  error_json TEXT,
  progress_json TEXT,
  attempt INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
CREATE INDEX idx_jobs_status ON jobs(status, created_at DESC);
CREATE UNIQUE INDEX idx_jobs_resource_active
  ON jobs(resource_key) WHERE status IN ('queued','running');

CREATE TABLE job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  phase TEXT,
  percent REAL,
  message TEXT
);
CREATE INDEX idx_job_events_job ON job_events(job_id, at);

-- 日志
CREATE TABLE plugin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX idx_plugin_logs ON plugin_logs(plugin_id, at DESC);

CREATE TABLE http_access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  elapsed_ms INTEGER,
  authorized INTEGER NOT NULL,
  client TEXT,
  request_id TEXT
);
CREATE INDEX idx_http_logs_at ON http_access_logs(at DESC);

-- 追踪
CREATE TABLE traces (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  job_id TEXT,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  at INTEGER NOT NULL
);

-- 迁移台账
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  checksum TEXT NOT NULL
);
```

**保留期策略**:`http_access_logs` 保 7 天或 1 万条(完全取代现有 `DEFAULT_MAX_ACCESS_LOGS = 200`);`job_events` 随 Job 删除级联;`plugin_logs` 每插件保 5000 条。每小时跑一次清理任务。

**版本降级保护(必须实现)**:`schema_migrations` 只记录已应用的版本,**并不能防止旧版本代码打开新库**。启动时必须比较库内最高 `version` 与当前代码支持的最高版本:

- 两者相等 → 正常启动
- 库版本低于代码版本 → 跑增量迁移
- **库版本高于代码版本 → 立即停止,返 `MIGRATION_REQUIRED` 并进降级模式**,绥不尝试读写

第三条是用户回滚安装包时的必然路径(见 [06 篇](./06-roadmap.md) R16)。不做这个判断,旧版本会用旧 schema 读新库,产生难以恢复的脏数据。

### 3.5 JSON → SQLite 迁移

```text
首次启动新版:
1. 检测 schema_migrations 为空
2. 备份:userData/backup-<timestamp>/ 拷入 settings.json + ai-talk-store 数据
3. 跑 migration 001..N,单事务
4. 导入现有对话(ai-talk-store.js 56 KB 的现有格式)
5. 验证:记录数对账 → 写入 migration 完成标记
6. 失败:回滚事务 → 删除 db 文件 → 保留备份 → 降级模式 + 弹窗
```

**回滚路径**:旧版 JSON 文件在迁移成功后**不删除**,保留一个大版本。用户回滚安装包时能直接用。

> 🚨 **「不删除旧 JSON」不等于「可回滚」。** 如果 M2/M4 已经发版,用户在新版本里产生的对话与设置只写进了 SQLite;此时回退到旧安装包,旧版本读到的是那份停在迁移时刻的 JSON,**中间产生的新数据全部消失**。因此双写必须持续到下一个大版本:入 SQLite 的同时继续追加写旧 JSON(仅对话与设置两类关键数据),而不是只在开发期双写一个迭代。见 [06 篇](./06-roadmap.md) R16。

### 3.6 乐观锁(设置写入)

```text
PATCH /api/v1/settings
{ "ifVersion": 42, "patch": { "ai.persona.tone": "cheerful" } }

→ 200 { "version": 43, "changedPaths": ["ai.persona.tone"] }
→ 409 { "code": "CONFLICT", "details": { "currentVersion": 43 } }
```

前端收到 `409` 后:重拉最新值 → 如无字段冲突自动重试一次 → 否则提示用户。

## 4. Provider 与密钥服务

### 4.1 密钥存储

| 项 | 方案 |
| --- | --- |
| 位置 | `userData/backend/secrets/providers.enc` |
| 权限 | `0600`(启动时校验并修正) |
| 加密 | `safeStorage`,**由 Shell 执行加解密**(sidecar 里无此 API);不可用时降级为 `0600` 明文文件并显式告警 |
| 读取 | 仅后端进程内存,不出进程 |
| 接口 | 只写 + 存在性查询,永不提供读取 |

#### 4.1.1 密钥流转(ADR-010 已定案)

`safeStorage` 是 Electron API,在纯 Node sidecar 里**不可用**。原先的 D3 列了两个选项:(a)每次读密钥都经反向通道向 Shell 代理;(b)后端自管密钥文件。**两者都被否决** —— (a) 会给每个 AI 请求多加一跳,(b) 会丢掉系统钥匙串保护。

最终方案是**启动时一次性注入**:

```text
sidecar 启动
  1. Shell 读 secrets/providers.enc
  2. Shell safeStorage.decrypt() → 明文(仅存在 Shell 内存)
  3. Shell 通过 init 消息把明文交给 sidecar(fork 通道,本机其他进程不可达)
  4. sidecar 只持内存副本;Shell 立即清空自己的明文引用

用户录入新密钥
  1. PUT /ai/providers/{id}/key → sidecar 收到明文
  2. sidecar 更新内存副本,并把明文经反向通道回传 Shell
  3. Shell safeStorage.encrypt() 后落盘 providers.enc
  4. 落盘成功才返 200
```

**硬性约束**:

- sidecar **永不落盘密钥**,`providers.enc` 只有 Shell 会写。
- 密钥永不进日志(`log-safety.js` 需补 provider key 匹配模式)、永不进 `POST /service/diagnostics` 的配置快照、永不出现在任何响应体(只返 `{ configured, maskedTail }`)。
- 内存副本不得放进任何会被序列化的对象,避免误入 trace 或崩溃转储。
- `safeStorage.isEncryptionAvailable()` 为 false 时退回 `0600` 明文文件,并在 Control Center 顶部常驻告警条,**不静默降级**。

> 🔒 这个方案的代价是:**密钥在 sidecar 内存中以明文存在**。这是可接受的 —— sidecar 与 Shell 同属一个应用、同一用户权限,能读 sidecar 内存的攻击者同样能读 Shell 内存。真正的边界是「不进渲染进程、不落盘未加密、不进日志」,这三条本方案都满足。

### 4.2 Provider 调用规范

| 项 | 规则 |
| --- | --- |
| 超时 | 对话 60s;图像 420s(沿用现有);连接测试 15s |
| 重试 | 仅 429/5xx,指数退避,最多 2 次 |
| 响应体上限 | 复用 `bounded-response-body.js` |
| 错误重写 | 不透传上游原始错误,映射为 `PROVIDER_ERROR` / `PROVIDER_TIMEOUT` |
| 预算 | 复用 `hatch-pet-agent-budget-ledger.js`,扩展为全局账本 |
| 模型目录 | 复用 `provider-model-catalog.js` + `provider-owner-policy.js` |
| 并发 | 每 provider 独立信号量,默认 2 |

## 5. 日志与追踪

| 项 | 方案 |
| --- | --- |
| 格式 | JSON 行:`{ ts, level, scope, msg, requestId?, jobId?, pluginId? }` |
| 脱敏 | 所有写入过 `log-safety.js`(现有 2.2 KB,直接复用);需补 provider 密钥匹配模式 |
| 双轨 | 文件(排查) + SQLite(UI 展示与分页) |
| 轮转 | 每天一个文件,保 14 天 |
| 追踪关联 | `requestId` → `jobId` → provider trace 三级可下钻 |
| 导出 | `POST /service/diagnostics` 打包:近 3 天日志 + 配置快照(脱敏,不含任何密钥) + Job 摘要 + 系统信息 |

## 6. 本篇产出清单

完成本篇后应存在以下新增文件:

```text
services/backend/jobs/
  ├─ queue.js            # 内存队列 + 并发控制
  ├─ runner.js           # 执行器注册表(kind → handler)
  ├─ state-machine.js    # 状态转换校验
  ├─ progress.js         # 节流上报
  └─ recovery.js         # 启动恢复
services/backend/store/
  ├─ db.js               # driver 接口 + node:sqlite 连接与 WAL 配置
  ├─ migrations/001_init.sql …
  ├─ repositories/       # jobs / conversations / logs / traces
  └─ migrate-from-json.js
services/backend/bridge/
  ├─ shell-client.js     # 反向通道客户端
  └─ message-schema.js   # 白名单 + 校验
apps/desktop/src/sidecar/
  ├─ spawn.js            # fork / 健康检查 / 重拉
  ├─ message-handler.js  # 反向通道服务端
  └─ orphan-cleanup.js   # pid 台账清理
```

> 🤖 **这份清单已经拆成可执行的任务卡。** 上面每个文件都对应 [10 篇](./10-tasks-m1.md)、[11 篇](./11-tasks-m1-http.md) 里的一张卡(T01–T13),卡上写了精确的导出签名与验收断言。**实现时以任务卡为准**,本篇提供的是设计意图与理由 —— 两者冲突时先改文档再写代码,不要自行取舍。
