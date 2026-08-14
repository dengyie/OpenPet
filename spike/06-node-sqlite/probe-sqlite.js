// spike/06-node-sqlite/probe-sqlite.js —— 必须在 sidecar 环境里跑
let sqlite
try {
  sqlite = require("node:sqlite")
} catch (err) {
  console.error("NODE_SQLITE_UNAVAILABLE", String(err?.message || err))
  process.exit(1)
}

const { DatabaseSync } = sqlite
const db = new DatabaseSync(":memory:")

// 1. WAL 是 ADR-006 的前提
console.log("journal_mode =", db.prepare("PRAGMA journal_mode = WAL").get())

// 2. 带 WHERE 的部分唯一索引是 04 篇 §2 单活任务约束的实现方式
db.exec(`
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    resource_key TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX idx_jobs_resource_active
    ON jobs(resource_key) WHERE status IN ('queued','running');
`)

const insert = db.prepare("INSERT INTO jobs VALUES (?, ?, ?, ?, ?)")
insert.run("j1", "image.generate", "queued", "pet:1", Date.now())

// 3. 部分索引真的生效了吗(应当抛约束冲突)
try {
  insert.run("j2", "image.generate", "queued", "pet:1", Date.now())
  console.error("FAIL: 部分唯一索引没有生效")
} catch (err) {
  console.log("OK: 单活约束生效 —", String(err?.message || err))
}

// 4. 显式事务是 04 篇 §3.5 的 JSON 迁移能否原子化的关键
db.exec("BEGIN")
db.prepare("UPDATE jobs SET status = ? WHERE id = ?").run("running", "j1")
db.exec("COMMIT")

console.log("NODE_SQLITE_OK", db.prepare("SELECT count(*) AS n FROM jobs").get())
