'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const repoRoot = path.resolve(__dirname, '../..')
const scriptPath = path.join(repoRoot, 'scripts/check-channel-retirement.mjs')

const createFixture = (t, { rows, channelCount = rows.length, registrationChannels = rows.map((row) => row.channel) }) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-channel-retirement-'))
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))
  fs.mkdirSync(path.join(fixtureRoot, 'docs/refactor'), { recursive: true })
  fs.mkdirSync(path.join(fixtureRoot, 'src/shared'), { recursive: true })
  fs.mkdirSync(path.join(fixtureRoot, 'src/main/ipc'), { recursive: true })

  const sourceRows = Array.from({ length: channelCount }, (_, index) => {
    const channel = rows[index]?.channel || `fixture:channel-${index + 1}`
    return `  CHANNEL_${index + 1}: '${channel}',`
  })
  fs.writeFileSync(path.join(fixtureRoot, 'src/shared/ipc-channels.ts'), `export const IPC = Object.freeze({\n${sourceRows.join('\n')}\n})\n`)
  fs.writeFileSync(path.join(fixtureRoot, 'src/main/ipc/register-fixture.js'), registrationChannels
    .map((channel) => `ipcMainService.handle(IPC.${rows.find((row) => row.channel === channel)?.key || 'CHANNEL_1'}, () => {})`)
    .join('\n'))

  const table = [
    '| IPC channel | Status | HTTP route / blocker | Source | Reason | Retired by |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| \`${row.channel}\` | \`${row.status}\` | ${row.route || '—'} | \`src/main/ipc/register-fixture.js\` | ${row.reason || 'fixture'} | ${row.retiredBy || '—'} |`)
  ].join('\n')
  fs.writeFileSync(path.join(fixtureRoot, 'docs/refactor/15-channel-retirement.md'), `# Fixture\n\n${table}\n`)
  return fixtureRoot
}

const run = (fixtureRoot) => spawnSync(process.execPath, [
  scriptPath,
  '--root', fixtureRoot
], { cwd: fixtureRoot, encoding: 'utf8' })

const row = (index, status = 'cutover:pet') => ({
  key: `CHANNEL_${index}`,
  channel: `fixture:channel-${index}`,
  status,
  route: status.startsWith('cutover:') ? '`/fixture`' : 'IPC-only',
  reason: 'fixture'
})

test('CLI accepts a complete unique ledger matching the IPC source', (t) => {
  const fixtureRoot = createFixture(t, { rows: [row(1, 'keep'), row(2)] })
  const result = run(fixtureRoot)
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /ok.*2/) 
})

test('CLI rejects ledger count or channel mismatch', (t) => {
  const fixtureRoot = createFixture(t, { rows: [row(1, 'keep')] , channelCount: 2 })
  const result = run(fixtureRoot)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /count|missing|mismatch/i)
})

test('CLI rejects duplicate ledger channels', (t) => {
  const duplicate = row(1, 'keep')
  const fixtureRoot = createFixture(t, { rows: [duplicate, { ...duplicate, key: 'CHANNEL_2' }], channelCount: 2 })
  const result = run(fixtureRoot)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /duplicate/i)
})

test('CLI rejects a TypeScript/JavaScript IPC mirror mismatch', (t) => {
  const fixtureRoot = createFixture(t, { rows: [row(1, 'keep'), row(2)] })
  fs.writeFileSync(path.join(fixtureRoot, 'src/shared/ipc-channels.js'), "module.exports = { IPC: { CHANNEL_1: 'fixture:wrong-value', CHANNEL_2: 'fixture:channel-2' } }\n")
  const result = run(fixtureRoot)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /source mismatch|mismatched/i)
})

test('CLI rejects more than 41 keep rows', (t) => {
  const rows = Array.from({ length: 42 }, (_, index) => row(index + 1, 'keep'))
  const result = run(createFixture(t, { rows }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /keep.*41/i)
})

test('CLI rejects an IPC inventory over the 158 channel ceiling', (t) => {
  const rows = Array.from({ length: 159 }, (_, index) => row(index + 1))
  const result = run(createFixture(t, { rows, channelCount: 159 }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /158|maximum|limit/i)
})

test('CLI rejects a ledger with no cutover rows', (t) => {
  const fixtureRoot = createFixture(t, { rows: [row(1, 'keep'), row(2, 'blocked:T41')] })
  const result = run(fixtureRoot)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /cutover/i)
})

test('CLI accepts retired historical rows that are absent from the current IPC source', (t) => {
  const historical = { ...row(2, 'retired'), retiredBy: 'abcdef1234567', route: 'historical', reason: 'removed in T41' }
  const fixtureRoot = createFixture(t, {
    rows: [row(1), historical],
    channelCount: 1,
    registrationChannels: ['fixture:channel-1']
  })
  const result = run(fixtureRoot)
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /current=1.*historical=1/)
})

test('CLI rejects unknown production IPC references', (t) => {
  const fixtureRoot = createFixture(t, { rows: [row(1, 'keep'), row(2)] })
  fs.appendFileSync(path.join(fixtureRoot, 'src/main/ipc/register-fixture.js'), '\nipcMainService.handle(IPC.UNKNOWN_CHANNEL, () => {})\n')
  const result = run(fixtureRoot)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /unknown.*channel/i)
})
