import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { ApiError } from "../http/middleware.js"

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations")

const MIGRATION_FILE_PATTERN = /^(\d+)_.*\.sql$/
const SCHEMA_MIGRATIONS_DDL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  checksum TEXT NOT NULL
);`

export function checksumOf(sql) {
	return createHash("sha256").update(sql, "utf8").digest("hex")
}

export function listMigrationFiles() {
	const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
		.map((entry) => {
			const match = entry.name.match(MIGRATION_FILE_PATTERN)
			if (!match) {
				throw new ApiError("INTERNAL", "迁移文件名不符合 <version>_<name>.sql", {
					details: { file: entry.name },
				})
			}

			const version = Number.parseInt(match[1], 10)
			const path = join(MIGRATIONS_DIR, entry.name)
			const sql = readFileSync(path, "utf8")
			return { version, file: entry.name, path, sql, checksum: checksumOf(sql) }
		})
		.sort((left, right) => left.version - right.version)

	for (let index = 1; index < migrations.length; index += 1) {
		if (migrations[index - 1].version === migrations[index].version) {
			throw new ApiError("INTERNAL", "迁移版本号重复", {
				details: {
					version: migrations[index].version,
					files: [migrations[index - 1].file, migrations[index].file],
				},
			})
		}
	}

	return migrations
}

export const CODE_SCHEMA_VERSION = listMigrationFiles().at(-1)?.version ?? 0

export function appliedVersions(db) {
	return db
		.prepare(
			"SELECT version, applied_at, checksum FROM schema_migrations ORDER BY version ASC",
		)
		.all()
}

function migrationError(message, details) {
	return new ApiError("INTERNAL", message, { details })
}

export function migrate({ db, logger } = {}) {
	db.exec(SCHEMA_MIGRATIONS_DDL)

	const migrations = listMigrationFiles()
	const existing = appliedVersions(db)
	const from = existing.at(-1)?.version ?? 0

	if (from > CODE_SCHEMA_VERSION) {
		throw new ApiError("MIGRATION_REQUIRED", "数据库 schema 版本高于当前代码支持版本", {
			status: 503,
			details: { databaseVersion: from, codeSchemaVersion: CODE_SCHEMA_VERSION },
		})
	}

	const migrationsByVersion = new Map(migrations.map((migration) => [migration.version, migration]))
	const appliedByVersion = new Map(existing.map((row) => [row.version, row]))

	for (const row of existing) {
		const migration = migrationsByVersion.get(row.version)
		if (!migration) {
			throw migrationError("已应用迁移文件不存在", { version: row.version })
		}
		if (row.checksum !== migration.checksum) {
			throw migrationError("已应用迁移的校验和不一致", {
				version: row.version,
				expected: row.checksum,
				actual: migration.checksum,
			})
		}
	}

	const applied = []
	for (const migration of migrations) {
		if (appliedByVersion.has(migration.version)) continue

		db.transaction((transaction) => {
			transaction.exec(migration.sql)
			transaction
				.prepare(
					"INSERT INTO schema_migrations (version, applied_at, checksum) VALUES (?, ?, ?)",
				)
				.run(migration.version, Date.now(), migration.checksum)
		})
		applied.push(migration.version)
		logger?.info?.("SQLite 迁移已应用", { version: migration.version, file: migration.file })
	}

	return { from, to: CODE_SCHEMA_VERSION, applied }
}
