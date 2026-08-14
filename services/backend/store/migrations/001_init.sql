-- 001_init —— 初始 schema。
-- 来源:docs/refactor/04-subsystems.md §3.4,逐表照抄,不要在这里"顺手优化"。
--
-- 约定:
-- 1. 迁移文件一旦提交就是不可变的。改 schema 要新增 002_xxx.sql,绝不回头改这个文件
--    —— schema_migrations 记的是 checksum,改动会让已升级的库直接报校验失败。
-- 2. 时间列统一是 INTEGER(Unix 毫秒),不用 SQLite 的日期字符串,避免时区解析歧义。
-- 3. schema_migrations 用 IF NOT EXISTS:迁移执行器需要先读它才知道该跑哪些文件,
--    所以执行器会先建表,这里再声明一次是为了让本文件单独执行也能跑通。

-- ---------- 对话 ----------

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

-- ---------- Job ----------

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

-- resourceKey 互斥锁的强约束(04 篇 §2.3)。
-- ⚠️ 这里的 WHERE 必须与 jobs/state-machine.js 的 ACTIVE_STATUSES 严格一致。
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

-- ---------- 日志 ----------

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

-- ---------- 追踪 ----------

CREATE TABLE traces (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  job_id TEXT,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  at INTEGER NOT NULL
);

-- ---------- 迁移台账 ----------

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  checksum TEXT NOT NULL
);
