'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const repoRoot = path.resolve(__dirname, '../..')
const fixtureFiles = [
	'docs/refactor/03-api-contract.md',
	'packages/contracts/src/envelope.ts',
	'packages/contracts/src/events.ts',
	'packages/contracts/src/jobs.ts',
	'scripts/check-api-contract.mjs'
]

const createFixture = (t) => {
	const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-api-contract-'))
	t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

	for (const relativePath of fixtureFiles) {
		const targetPath = path.join(fixtureRoot, relativePath)
		fs.mkdirSync(path.dirname(targetPath), { recursive: true })
		fs.copyFileSync(path.join(repoRoot, relativePath), targetPath)
	}

	return fixtureRoot
}

test('CLI reads Job statuses from section 6.2 instead of the jobs-recovered SSE row', (t) => {
	const fixtureRoot = createFixture(t)
	const doc = fs.readFileSync(path.join(fixtureRoot, 'docs/refactor/03-api-contract.md'), 'utf8')
	const recoveredRow = doc.split('\n').find((line) => line.includes('system.jobs-recovered'))

	assert.match(recoveredRow, /requeued/)
	assert.doesNotMatch(recoveredRow, /`queued`/)
	assert.ok(doc.indexOf('system.jobs-recovered') < doc.indexOf('### 6.2 Job 对象'))

	const result = spawnSync(process.execPath, [path.join(fixtureRoot, 'scripts/check-api-contract.mjs')], {
		cwd: fixtureRoot,
		encoding: 'utf8'
	})

	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
	assert.match(result.stdout, /ok\s+Job 状态 一致\(6 项\)/)
})
