# T14 JSON to SQLite Migration Implementation Plan

> **For agentic workers:** Execute this plan task-by-task in the isolated `codex/t14-json-migration` worktree.

**Goal:** Import legacy settings and AI conversation JSON into SQLite with a durable backup, atomic rollback, idempotent startup behavior, and one-release dual writes.

**Architecture:** The migration runs after schema migrations and before repositories are created. It reads the legacy files directly, copies them to a real `backup-<timestamp>` directory, writes only conversations/messages/settings inside one SQLite transaction, and removes a newly-created database on failure so the next launch can retry. A small dual-writer keeps legacy JSON updated while the SQLite cutover is staged.

**Tech Stack:** Node.js ESM, `node:fs`, the existing SQLite driver interface, Node native test runner.

## Global Constraints

- Never delete legacy JSON files; retain them for one major release.
- Do not import secrets.
- Do not create a conversations repository for this migration.
- `schema_migrations` being empty is the only first-import signal.
- A failed import must preserve the backup and allow a retry.

### Task 1: Migration module and tests

**Files:**
- Create: `services/backend/store/migrate-from-json.js`
- Create: `tests/backend/migrate-from-json.test.js`

**Interfaces:**
- `needsJsonImport(db): boolean`
- `migrateFromJson({ db, userDataDir, now, logger, onProgress }): Promise<{ imported, backupDir, skipped }>`
- `createDualWriter({ userDataDir, logger }): { writeConversation, writeSettings, disable, stats }`

- [ ] Write tests for first import, exact counts, idempotence, rollback, and real backup contents.
- [ ] Implement backup, transaction, count verification, and retry-safe failure handling.
- [ ] Implement dual writes without touching secrets or deleting old files.
- [ ] Run `node --test tests/backend/migrate-from-json.test.js`.

### Task 2: Startup integration

**Files:**
- Modify: `services/backend/routes/health.js`
- Test: `tests/backend/health-routes.test.js`

- [ ] Invoke migration after `deps.migrate` and before repositories/recovery are created.
- [ ] Pass migration progress and logger dependencies through the existing runtime initializer.
- [ ] Preserve degraded startup semantics when migration fails.
- [ ] Run backend tests and syntax checks.

### Task 3: Review and integration gate

- [ ] Review the diff for rollback, path, and secret-handling risks.
- [ ] Rebase `codex/t14-json-migration` onto the latest `main`.
- [ ] Run `npm run build:contracts`, `npm run test:backend`, `npm run check:node`, and `git diff --check`.
- [ ] Merge serially into `main` only after all commands pass.
