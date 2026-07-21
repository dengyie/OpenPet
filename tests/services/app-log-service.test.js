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

test('app log service redacts sensitive ai log fields and truncates long strings', () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-app-logs-'))
  const service = createAppLogService({
    logDir,
    clock: () => new Date('2026-06-29T10:00:00.000Z'),
    idFactory: () => 'evt-2'
  })

  const longText = 'x'.repeat(540)
  const entry = service.record({
    scope: 'ai-talk',
    event: 'ai-talk.persona.profile.loaded',
    message: 'Loaded profile authorization: Bearer abcdefghijklmnop',
    details: {
      compiledSystemPrompt: '# hidden prompt',
      rawProviderReply: '{"secret":true}',
      apiKey: 'sk-test-123456789012',
      token: 'Bearer abcdefghijklmnop',
      prompt: 'draw a shy cat',
      originalPrompt: 'draw a shy cat spinning',
      motionPrompt: 'spin motion details',
      stylePrompt: 'soft watercolor',
      reply: 'Here is a private reply',
      referenceImagePath: '/Users/mango/private/reference.png',
      summary: longText,
      providerMessage: 'authorization: Bearer abcdefghijklmnop',
      safeCount: 3
    }
  })

  assert.equal(entry.message, '[redacted]')
  assert.equal(entry.details.compiledSystemPrompt, undefined)
  assert.equal(entry.details.rawProviderReply, undefined)
  assert.equal(entry.details.apiKey, undefined)
  assert.equal(entry.details.token, undefined)
  assert.equal(entry.details.prompt, undefined)
  assert.equal(entry.details.originalPrompt, undefined)
  assert.equal(entry.details.motionPrompt, undefined)
  assert.equal(entry.details.stylePrompt, undefined)
  assert.equal(entry.details.reply, undefined)
  assert.equal(entry.details.referenceImagePath, undefined)
  assert.equal(entry.details.safeCount, 3)
  assert.equal(entry.details.providerMessage, 'authorization=[redacted-secret]')
  assert.match(entry.details.summary, /^x{500}\.\.\.\[truncated\]$/)

  const raw = fs.readFileSync(service.logPath, 'utf-8')
  assert.equal(raw.includes('# hidden prompt'), false)
  assert.equal(raw.includes('sk-test-123456789012'), false)
  assert.equal(raw.includes('Bearer abcdefghijklmnop'), false)
  assert.equal(raw.includes('draw a shy cat'), false)
  assert.equal(raw.includes('/Users/mango/private/reference.png'), false)
  assert.equal(raw.includes('Here is a private reply'), false)
})

test('app log service sanitizes nested diagnostic details without dropping safe structure', () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-app-logs-'))
  const service = createAppLogService({
    logDir,
    clock: () => new Date('2026-07-04T10:00:00.000Z'),
    idFactory: () => 'evt-3'
  })

  const entry = service.record({
    scope: 'creator-workflow',
    event: 'creator.workflow.failed',
    message: 'Creator workflow failed',
    details: {
      requestId: 'creator-req-1',
      diagnostics: {
        attempt: 2,
        errorMessage: 'Prompt "spin quickly" failed at /Users/mango/private/reference.png via http://127.0.0.1:8787/run with sk-test-secret',
        nested: {
          safe: true,
          payload: 'Prompt "jump left" using token: Bearer qwertyuiopasdfgh at file:///Users/mango/private/workflow.json'
        }
      },
      history: [
        { stage: 'draft', ok: true },
        { stage: 'generate', reason: 'Prompt "spin quickly" failed at /Users/mango/private/reference.png' }
      ]
    }
  })

  assert.equal(entry.details.diagnostics.attempt, 2)
  assert.equal(entry.details.diagnostics.nested.safe, true)
  assert.match(entry.details.diagnostics.errorMessage, /\[redacted-prompt\]/)
  assert.match(entry.details.diagnostics.errorMessage, /\[redacted-path\]/)
  assert.match(entry.details.diagnostics.errorMessage, /\[redacted-local-url\]/)
  assert.match(entry.details.diagnostics.errorMessage, /\[redacted-secret\]/)
  assert.match(entry.details.diagnostics.nested.payload, /\[redacted-prompt\]/)
  assert.match(entry.details.diagnostics.nested.payload, /\[redacted-token\]=\[redacted-secret\]/)
  assert.match(entry.details.diagnostics.nested.payload, /\[redacted-local-url\]/)
  assert.match(entry.details.history[1].reason, /\[redacted-prompt\]/)
  assert.match(entry.details.history[1].reason, /\[redacted-path\]/)

  const raw = fs.readFileSync(service.logPath, 'utf-8')
  assert.equal(raw.includes('spin quickly'), false)
  assert.equal(raw.includes('/Users/mango/private/reference.png'), false)
  assert.equal(raw.includes('127.0.0.1:8787'), false)
  assert.equal(raw.includes('sk-test-secret'), false)
  assert.equal(raw.includes('jump left'), false)
  assert.equal(raw.includes('qwertyuiopasdfgh'), false)
  assert.equal(raw.includes('file:///Users/mango/private/workflow.json'), false)
})

test('app log service does not reread the full log for every append below the compaction limit', () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-app-logs-'))
  const service = createAppLogService({ logDir, maxEntries: 1000 })
  const originalReadFileSync = fs.readFileSync
  let logReadCount = 0
  fs.readFileSync = (...args) => {
    if (args[0] === service.logPath) logReadCount += 1
    return originalReadFileSync(...args)
  }
  try {
    for (let index = 0; index < 100; index += 1) {
      service.record({ event: 'stream.progress', details: { index } })
    }
  } finally {
    fs.readFileSync = originalReadFileSync
  }

  assert.equal(logReadCount <= 1, true)
  assert.equal(service.read().length, 100)
})

test('app log service retains critical workflow entries ahead of debug noise during compaction', () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-app-logs-'))
  const service = createAppLogService({ logDir, maxEntries: 5 })

  service.record({ level: 'error', scope: 'creator-workflow', event: 'creator.workflow.failed', details: { runId: 'run-critical' } })
  for (let index = 0; index < 12; index += 1) {
    service.record({ level: 'debug', scope: 'pet-renderer', event: 'pet.pointer.diagnostic', details: { index } })
  }

  const entries = service.read()
  assert.equal(entries.some((entry) => entry.event === 'creator.workflow.failed'), true)
  assert.equal(entries.length <= 5, true)
})

test('app log service keeps the previous JSONL intact when atomic compaction fails', () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-app-logs-'))
  const service = createAppLogService({ logDir, maxEntries: 3 })
  for (let index = 0; index < 3; index += 1) {
    service.record({ event: `before-${index}` })
  }

  const originalRenameSync = fs.renameSync
  fs.renameSync = (source, destination) => {
    if (destination === service.logPath) throw new Error('simulated atomic rename failure')
    return originalRenameSync(source, destination)
  }
  try {
    assert.throws(() => service.record({ event: 'compaction-trigger' }), /atomic rename failure/)
  } finally {
    fs.renameSync = originalRenameSync
  }

  const rawLines = fs.readFileSync(service.logPath, 'utf8').trim().split('\n')
  const parsed = rawLines.map((line) => JSON.parse(line))
  assert.equal(parsed.some((entry) => entry.event === 'before-0'), true)
  assert.equal(service.read().some((entry) => entry.event === 'before-1'), true)
})
