# 10 · M1 任务卡:存储层与 Job 引擎

> v1.1 · 2026-08-16 · 基线分支 `main`

**前置**:[08 篇 执行手册](./08-agent-guide.md)、[09 篇 仓库现状](./09-repo-state.md)。
**本篇范围**:T01–T08。HTTP 路由、SSE、Shell 侧在下一篇。

每张卡一个分支、一个 PR。卡里没写的不要发明;发现漏了先改本文件,和代码同 PR。

**依赖图**:T01 → T02 → T06 → T07;T04 依赖 T01,T08 依赖 T02,T05 可独立并行。跨篇主链:T01 + T02 + T08 → T09 → T10 / T11 / T14 /(T15–T19);T12 → T13。

---

## T01 · 迁移运行器

**建** `services/backend/store/migrate.js` · **依赖** 无 · **阻塞** T02 T04

导出:`MIGRATIONS_DIR`、`CODE_SCHEMA_VERSION`、`listMigrationFiles()`、`checksumOf(sql)`、`appliedVersions(db)`、`migrate({ db, logger })` → `{ from, to, applied }`。

**必须:**

- 开头先执行一次 `CREATE TABLE IF NOT EXISTS schema_migrations`,DDL **逐字复制** `001_init.sql` 末尾那段。因为要先读台账才知道该跑哪些文件,而台账本身也在迁移里。
- 台账只有三列:`version INTEGER PRIMARY KEY`、`applied_at INTEGER NOT NULL`、`checksum TEXT NOT NULL`。**没有 `name` 列** —— 版本号从文件名前缀取(`001_init.sql` → `1`),文件名本身不入库。不要给台账加列。
- `checksumOf` = sha256 hex。比对**已应用**的文件:不一致抛 `INTERNAL` —— 这意味着有人改了不可变文件(08 篇 H2),属于开发期错误,不是用户环境问题。
- `max(已应用版本) > CODE_SCHEMA_VERSION` → 抛 `MIGRATION_REQUIRED` 并**显式带 `status: 503`**,调用方据此进降级模式(04 篇 §3.4)。这是防「用旧版本开新库」把数据写坏。
- 每个文件在**一个事务**里完成 `exec(sql)` + 写台账。事务回调不能是 async(08 篇 §2)。
- 文件按版本号升序执行。

**验收** `tests/backend/migrate.test.js`(`:memory:`):跑两次,第二次 `applied` 为空(幂等);001 应用后 9 张表均存在;篡改台账里的 checksum → `INTERNAL`;手插 `version = 99` → `MIGRATION_REQUIRED` 且 `status === 503`。

**不要**:不用 `PRAGMA user_version`(台账表才是真相);不改 `001_init.sql`;不在这里做 JSON 迁入(那是后续卡)。

---

## T02 · Job 仓储

**建** `services/backend/store/repositories/jobs.js` · **依赖** T01 · **阻塞** T06 T07 T08

导出:`createJobsRepository({ db, now })` → `{ insert, byId, list, transition, setProgress, finish, appendEvent, listEvents, activeByResourceKey, countByStatus }`。

**列名照 `001_init.sql`,一个字都不要改:**

- `jobs`:`id`、`kind`、`status`、`resource_key`、`input_json`、`result_json`、`error_json`、`progress_json`、`attempt`、`max_attempts`、`created_at`、`started_at`、`finished_at`
- `job_events`:`id`(自增)、`job_id`、`at`、`phase`、`percent`、`message`

**必须:**

- `insert` 写入前用 `maxAttemptsFor(kind)` 填 `max_attempts`,`attempt` 从 1 起。
- `resource_key` 冲突靠**数据库的部分唯一索引**,不靠先查后写。捕获 `SQLITE_CONSTRAINT`,转成 `LOCKED`(显式 `status: 423`),`details` 里带上 `activeByResourceKey()` 查到的占用 `jobId`。先查后写在并发下有窗口期,这就是索引存在的理由。
- `transition(id, to)` 先调 `assertTransition(from, to, { jobId })`,再用 **CAS UPDATE**:`WHERE id = ? AND status = ?`。`changes === 0` 说明被其它人改过 → 抛 `CONFLICT`。只靠读出来判断再写回去是丢更新。
- 进 `running` 时写 `started_at`,进终态时写 `finished_at`;时间均 `Date.now()` 毫秒。
- `error_json` 的形状与 HTTP 错误体一致:`{ code, message, details, retryable }`。

**验收** `tests/backend/jobs-repository.test.js`(`:memory:` + T01 建表):同一 `resource_key` 插第二条 active 必报 `LOCKED`/423 且 `details.jobId` 正确;先转终态再用旧 `status` 做 CAS → `CONFLICT`;终态后同 `resource_key` 可以再插(验证部分索引的 WHERE 真的生效)。

**不要**:不在仓储里做进度节流(T05);不在仓储里发 SSE(事件由上层发);不自己定义状态字符串,全部从 `state-machine.js` 取。

---

## T03 · 设置域(乐观锁)

**建** `services/backend/domains/settings.js` · **依赖** 无 · **可并行**

导出:`createSettingsStore({ file, logger })` → `{ read, patch, version, invalidate }`、`SETTINGS_CACHE_TTL_MS = 5_000`。

**必须:**

- 存储是 `userData/backend/settings.json`,**不进 SQLite** —— `001_init.sql` 没有 settings 表,这是有意的(设置要能被人看、能被备份)。
- `patch({ ifVersion, patch })` → `{ version, changedPaths }`。`ifVersion` 不匹配 → `CONFLICT`,`details.currentVersion` 必须带上,前端靠它重拉重试。
- 写盘是**原子**的:写临时文件 + `rename`。直接覆盖一旦在中途崩溃会得到一个截断的 JSON,而设置文件坏了等于应用启不来。
- `changedPaths` 是点路径数组(例 `["ai.provider", "pet.scale"]`),直接喂给 `settings.changed` 事件的 `paths`。
- 读走 TTL 缓存 —— G8 预算要求 `GET /settings` P95 < 30 ms,每次读盘达不到。

**验收** `tests/backend/settings.test.js`(临时目录):`ifVersion` 陈旧 → `CONFLICT` 且 `details.currentVersion` 正确;连续两次 patch 版本号递增;`changedPaths` 只包含真正变了的路径(写入相同值不算变更)。

**不要**:不让 Shell 或前端写这个文件(08 篇 H5);不把窗口几何存进来(那在 `window-state.json`,属 Shell)。

---

## T04 · 日志仓储与保留

**建** `services/backend/store/repositories/logs.js` · **依赖** T01 · **可并行**

导出:`createLogsRepository({ db, now })` → `{ appendHttp, listHttp, appendPlugin, listPlugin, cleanup }`、`HTTP_LOG_RETENTION_MS`、`HTTP_LOG_MAX_ROWS = 10_000`、`PLUGIN_LOG_MAX_PER_PLUGIN = 5_000`。

列名照 001:`http_access_logs`(`at`、`method`、`path`、`status`、`elapsed_ms`、`authorized`、`client`、`request_id`)、`plugin_logs`(`plugin_id`、`level`、`message`、`at`)。

**必须:**

- `authorized` 是 `INTEGER`(0/1),不是布尔 —— SQLite 没有 bool 类型。
- `cleanup()` 幂等:HTTP 日志按 7 天**或** 1 万行(两条都要),插件日志每插件保留 5000 条。由 `index.js` 的每小时定时器驱动(后续卡挂),本卡只要求函数可独立调用。
- `now` 注入 —— 保留策略要可测,不能直接读 `Date.now()`。

**验收** `tests/backend/logs-repository.test.js`:造 1 万零 1 行后 cleanup 剩 1 万;造一条 8 天前的被删;两个插件各 6000 条 → 各剩 5000(不会互相影响);cleanup 跑两次结果相同。

---

## T05 · 进度节流

**建** `services/backend/jobs/progress.js` · **依赖** 无 · **可并行**

导出:`createProgressThrottle({ onEmit, now })` → `{ report, flush, reset }`、`THROTTLE_MS = 500`、`MIN_PERCENT_DELTA = 1`、`NO_PROGRESS_PERCENT = -1`。

帧形状(04 篇 §2.4):`{ phase, percent, message?, etaMs? }`。

**必须:**

- 500 ms 节流。
- `percent` **单调递增**:回退的帧直接丢弃(provider 回报不单调是常事,但前端进度条倒退看起来像 bug)。
- `phase` 未变且 `percent` 增量 < 1 → 丢弃;`phase` 变了 → **立即发**,不等节流窗口。
- 无法估算进度的任务用 `percent = -1`,不要编一个假百分比。
- 进终态前必须 `flush()`,否则最后一帧可能死在节流窗口里,前端停在 97%。

**验收** `tests/backend/progress.test.js`(注入假 `now`,纯同步):窗口内多次 report 只发一次;phase 变化绕过节流;回退帧被丢;`flush` 后末帧必发。

---

## T06 · 队列与并发

**建** `services/backend/jobs/queue.js` · **依赖** T02 · **阻塞** T07

导出:`createQueue({ repo, logger, now })` → `{ enqueue, next, release, cancel, stats }`、`CONCURRENCY_BY_GROUP`、`groupOf(kind)`。

**并发上限(04 篇 §2.1),按组而非按 kind:**

| 组 | 上限 | 包含 |
| --- | --- | --- |
| `image` | 1 | `image.generate`、`sprite.generate`、`sprite.evaluate` |
| `creator` | 1 | `creator.character`、`creator.workflow`、`creator.export`、`hatch.run` |
| `plugin-install` | 2 | `plugin.install`、`plugin.install.github`、`plugin.sync-bundled`、`catalog.install` |
| `plugin-command` | 4 | `plugin.command` |
| `pack` | 2 | `pet-pack.import`、`pet-pack.export`、`actions.import-frames` |
| `other` | 4 | 其余 |

**必须:**

- 每组一个信号量。分组要覆盖全部 17 个 kind,测试里穷举断言。
- `resource_key` 冲突**不入队**,直接把 T02 抛的 `LOCKED`/423 往上传。
- 排队超时由**定时器**驱动,不能只在“有新任务入队”时检查 —— 空闲队列里的超时任务否则永远不会过期。spike-03 case 2 当前为红就是这个形状的前端版(05 篇 §2.2 + F14)。
- 取消队中任务 = 直接出队并转 `canceled`;取消 running 不在本卡(T07)。

**验收** `tests/backend/queue.test.js`:17 个 kind 全能分组且组名在表内;`image` 组同时只能跑 1 个;释放后下一个才能跑;排队超时靠假 `now` 推进能触发。

---

## T07 · 执行器与取消

**建** `services/backend/jobs/runner.js` · **依赖** T02 T05 T06

导出:`createRunner({ repo, queue, progress, handlers, logger })` → `{ run, cancel, shutdown }`、`SIGKILL_DELAY_MS = 2_000`。

**必须:**

- 写最终产物之前,**必须先把 phase 置为 `finalizing`**。`UNCANCELABLE_PHASES` 靠这个约定生效 —— 不置的话「正在落盘时不可取消」形同虚设,会得到写了一半的文件。
- 取消 provider 调用用 `AbortController.abort()`;取消子进程用 SIGTERM → 2 s → SIGKILL,整棵进程树一起杀(参考现有 `src/main/services/service-process-tree.js`)。
- 重试只靠 `canRetry`/`maxAttemptsFor`,指数退避,**只对 429 与 5xx 重试**;`attempt` 递增写回仓储。
- 每次状态变化都走 `repo.transition`(内部会 `assertTransition`),不要直接 UPDATE。
- `shutdown` 要能在 `SHUTDOWN_GRACE_MS`(5 s)内收尾:停发新任务,已 running 的给它转 `interrupted`。

**验收** `tests/backend/runner.test.js`(handlers 全部伪造,不碰真子进程):`finalizing` 期间 `cancel` 报 `JOB_NOT_CANCELABLE`/423;失败后按 `max_attempts` 重试次数正确;`creator.export`(maxAttempts 1)失败后不重试;非 429/5xx 错误不重试。

**不要**:不在 runner 里写业务(交给 `handlers`);不直接发 SSE(交给上层)。

---

## T08 · 启动恢复

**建** `services/backend/jobs/recovery.js` · **依赖** T02

导出:`recoverJobs({ repo, tmpDir, emit, logger })` → `{ interrupted, requeued, tmpRemoved }`。

**必须(04 篇 §2.6):**

- 所有 `running` → `interrupted`,`error_json` 用 `interruptionError()`(code 固定 `BACKEND_RESTARTED`)。后端重启后还挂着 running 的任务已经没人推进了,不处理就永久卡死。
- 所有 `queued` 重新入队(`interrupted` → `queued` 和 `queued` 保持都是合法边)。
- 清理 `tmp/job-*` 目录。
- 发 `system.jobs-recovered`。这个事件已在 03 篇 §5 登记,属 `system` topic。
- **幂等**:跑两次结果一致(第二次 `interrupted` 计数为 0)。启动失败重拉时会真的跑两次。

**验收** `tests/backend/recovery.test.js`:预埋 2 个 running + 1 个 queued → 计数正确且 `error_json.code === "BACKEND_RESTARTED"`;再跑一次 `interrupted === 0`;终态任务不被动。

---

## 9. 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0 | 2026-08-15 | 首版:T01–T08(迁移运行器、Job 仓储、设置域、日志仓储、进度节流、队列、执行器、启动恢复) |
