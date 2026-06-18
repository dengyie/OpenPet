const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createActivityLogService } = require('../../src/main/services/activity-log-service')

const makeLogDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-activity-log-'))

const readJsonLines = (filePath) => fs.readFileSync(filePath, 'utf-8').trim().split('\n').map((line) => JSON.parse(line))

test('activity log writes structured JSONL entries with sequential ids', () => {
  const logDir = makeLogDir()
  const service = createActivityLogService({
    logDir,
    clock: () => new Date('2026-06-19T01:30:00.000Z')
  })

  const first = service.record({ category: 'app', action: 'ready', message: 'App ready' })
  const second = service.record({ category: 'window', action: 'pet.created', details: { windowId: 1 } })

  const entries = readJsonLines(path.join(logDir, 'activity.log'))

  assert.equal(first.id, 1)
  assert.equal(second.id, 2)
  assert.deepEqual(entries.map((entry) => entry.id), [1, 2])
  assert.equal(entries[0].timestamp, '2026-06-19T01:30:00.000Z')
  assert.equal(entries[0].level, 'info')
  assert.equal(entries[0].category, 'app')
  assert.equal(entries[0].action, 'ready')
  assert.equal(entries[1].details.windowId, 1)
})

test('activity log redacts sensitive detail fields before writing', () => {
  const logDir = makeLogDir()
  const service = createActivityLogService({ logDir })

  service.record({
    category: 'ipc',
    action: 'settings.save',
    details: {
      token: 'local-token',
      hasToken: true,
      apiKey: 'sk-secret',
      apiKeyRef: 'ai.default',
      headers: {
        Authorization: 'Bearer secret',
        Cookie: 'session=secret'
      },
      nested: {
        password: 'hidden',
        value: 'safe'
      }
    }
  })

  const [entry] = readJsonLines(path.join(logDir, 'activity.log'))
  const text = JSON.stringify(entry)

  assert.equal(text.includes('local-token'), false)
  assert.equal(text.includes('sk-secret'), false)
  assert.equal(text.includes('Bearer secret'), false)
  assert.equal(text.includes('session=secret'), false)
  assert.equal(text.includes('hidden'), false)
  assert.equal(entry.details.token, '[redacted]')
  assert.equal(entry.details.hasToken, true)
  assert.equal(entry.details.apiKey, '[redacted]')
  assert.equal(entry.details.apiKeyRef, 'ai.default')
  assert.equal(entry.details.headers.Authorization, '[redacted]')
  assert.equal(entry.details.headers.Cookie, '[redacted]')
  assert.equal(entry.details.nested.password, '[redacted]')
  assert.equal(entry.details.nested.value, 'safe')
})

test('activity log mirrors warn and error entries to the error log', () => {
  const logDir = makeLogDir()
  const service = createActivityLogService({ logDir })

  service.record({ level: 'info', category: 'app', action: 'ready' })
  service.record({ level: 'warn', category: 'window', action: 'pet.hidden' })
  service.record({ level: 'error', category: 'app', action: 'uncaught-exception' })

  const activityEntries = readJsonLines(path.join(logDir, 'activity.log'))
  const errorEntries = readJsonLines(path.join(logDir, 'activity-error.log'))

  assert.deepEqual(activityEntries.map((entry) => entry.level), ['info', 'warn', 'error'])
  assert.deepEqual(errorEntries.map((entry) => entry.level), ['warn', 'error'])
})

test('activity log can mirror concise entries to the console', () => {
  const logDir = makeLogDir()
  const lines = []
  const service = createActivityLogService({
    logDir,
    mirrorToConsole: true,
    consoleService: {
      log: (line) => lines.push(line),
      warn: (line) => lines.push(line),
      error: (line) => lines.push(line)
    },
    clock: () => new Date('2026-06-19T01:30:00.000Z')
  })

  service.record({ level: 'warn', category: 'window', action: 'pet.close-prevented', message: 'Pet close prevented' })

  assert.equal(lines.length, 1)
  assert.match(lines[0], /\[OpenPet\]\[activity\] 2026-06-19T01:30:00.000Z warn window pet.close-prevented - Pet close prevented/)
})
