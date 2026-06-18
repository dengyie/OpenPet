const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createAppLogService } = require('../../src/main/services/app-log-service')

test('app log service records local jsonl events without leaking absolute file selections', () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-app-logs-'))
  const service = createAppLogService({
    logDir,
    clock: () => new Date('2026-06-19T10:00:00.000Z'),
    idFactory: () => 'evt-1'
  })

  const entry = service.record({
    scope: 'settings',
    level: 'info',
    actor: 'user',
    event: 'settings.cursor.import.completed',
    message: 'Cursor image selected',
    details: {
      fileName: 'cursor.png',
      selectedPath: '/Users/mango/Desktop/private-cursor.png'
    }
  })

  assert.equal(entry.id, 'evt-1')
  assert.equal(entry.timestamp, '2026-06-19T10:00:00.000Z')
  assert.equal(entry.details.fileName, 'cursor.png')
  assert.equal(entry.details.selectedPath, undefined)

  const raw = fs.readFileSync(service.logPath, 'utf-8').trim()
  assert.equal(raw.includes('/Users/mango/Desktop/private-cursor.png'), false)
  assert.deepEqual(JSON.parse(raw), entry)
  assert.deepEqual(service.read({ limit: 1 }), [entry])
})
