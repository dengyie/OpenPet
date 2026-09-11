-- T48 Creator Studio persistence.
-- 001_init.sql and 002_ai_talk.sql are immutable; Creator owns its schema here.

CREATE TABLE creator_flows (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'desktop',
  name TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  state_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner, name)
);
CREATE INDEX idx_creator_flows_owner_updated ON creator_flows(owner, updated_at DESC);

CREATE TABLE creator_references (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'desktop',
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  token_hash TEXT,
  file_name TEXT NOT NULL DEFAULT '',
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL DEFAULT '',
  relative_path TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner, target_type, target_id)
);
CREATE INDEX idx_creator_references_owner_updated ON creator_references(owner, updated_at DESC);

CREATE TABLE creator_runs (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'desktop',
  flow_id TEXT REFERENCES creator_flows(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unknown',
  state_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_creator_runs_owner_updated ON creator_runs(owner, updated_at DESC);

CREATE TABLE creator_artifacts (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'desktop',
  run_id TEXT NOT NULL REFERENCES creator_runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  UNIQUE(owner, run_id, relative_path)
);
CREATE INDEX idx_creator_artifacts_run ON creator_artifacts(owner, run_id, created_at DESC);
