const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createHatchPetAgentStore, __testInternals } = require('../../src/main/services/hatch-pet-agent-store')

test('hatch-pet store confines artifacts and rejects unsafe run and prompt ids', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-hatch-store-'))
  const store = createHatchPetAgentStore({ dataDir, now: () => '2026-07-15T00:00:00.000Z' })
  assert.throws(() => store.initializeRun({ runId: '../escape' }), /runId is invalid/)
  assert.throws(() => store.initializeRun({ runId: '/tmp/escape' }), /runId is invalid/)
  store.initializeRun({ runId: 'run-1' })
  assert.throws(() => store.writePromptSnapshot({ runId: 'run-1', promptId: '../bad', snapshot: {} }), /promptId is invalid/)
  const prompt = store.writePromptSnapshot({ runId: 'run-1', promptId: 'prompt-1', snapshot: { ok: true } })
  assert.equal(prompt.relativePath, 'runs/run-1/agent/prompts/prompt-1.json')
  assert.equal(fs.existsSync(path.join(dataDir, prompt.relativePath)), true)
})

test('hatch-pet nested redaction drops arbitrary token keys and absolute or file URL paths while retaining safe metadata', () => {
  const sanitized = __testInternals.sanitizeAgentArtifact({
    schemaVersion: 1, provider: 'p', model: 'm', safePath: 'runs/run-1/agent/state.json',
    accessToken: 'secret', refresh_token: 'secret', monkeyTokenBucket: 'secret', authorization: 'Bearer secret',
    nested: { message: 'read /Users/mango/private/key.txt and file:///tmp/private.png', baseUrl: 'https://u:p@example.test/v1?token=secret#frag' }
  })
  assert.equal(JSON.stringify(sanitized).includes('secret'), false)
  assert.equal(JSON.stringify(sanitized).includes('/Users/'), false)
  assert.equal(JSON.stringify(sanitized).includes('file:///'), false)
  assert.equal(sanitized.safePath, 'runs/run-1/agent/state.json')
  assert.equal(sanitized.nested.baseUrl, 'https://example.test/v1')
  assert.equal(sanitized.schemaVersion, 1)
})

test('hatch-pet decision log is compact and invalid JSONL fails closed', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-hatch-jsonl-'))
  const store = createHatchPetAgentStore({ dataDir })
  store.initializeRun({ runId: 'run-1' })
  store.appendDecision({ runId: 'run-1', decision: { resultCode: 'ok' } })
  assert.equal(store.listDecisions('run-1').length, 1)
  fs.appendFileSync(path.join(dataDir, 'runs/run-1/agent/decisions.jsonl'), '{broken\n')
  assert.throws(() => store.listDecisions('run-1'), /decision log is invalid/)
})
