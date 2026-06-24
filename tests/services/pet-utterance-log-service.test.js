const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createAiTalkStore } = require('../../src/main/services/ai-talk-store')
const { createPetUtteranceLogService } = require('../../src/main/services/pet-utterance-log-service')

const createStore = () => createAiTalkStore({
  storePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-pet-utterance-test-')), 'ai-talk-store.json'),
  now: () => '2026-06-24T00:00:00.000Z'
})

test('pet utterance log records sanitized entries by pet pack without raw text logs', () => {
  const logs = []
  const store = createStore()
  const service = createPetUtteranceLogService({
    aiTalkStore: store,
    appLogService: {
      record: (entry) => logs.push(entry)
    }
  })

  const entry = service.record({
    petPackId: 'mochi-cat',
    text: ` ${'purr '.repeat(260)} `,
    source: 'plugin:weather',
    ttlMs: 1800
  })

  assert.equal(entry.petPackId, 'mochi-cat')
  assert.ok(entry.text.length <= 1000)
  assert.ok(entry.text.length > 900)
  assert.equal(entry.source, 'plugin:weather')
  assert.equal(entry.ttlMs, 1800)
  assert.equal(service.listRecent({ petPackId: 'mochi-cat' }).length, 1)
  assert.equal(service.listRecent({ petPackId: 'sprout-cat' }).length, 0)
  assert.equal(JSON.stringify(logs).includes(entry.text), false)
  assert.deepEqual(logs.map((log) => log.event), ['pet-utterance.recorded'])
  assert.equal(logs[0].details.textChars, entry.text.length)
})

test('pet utterance log caps stored entries and recent context budget per pet pack', () => {
  const store = createStore()
  const service = createPetUtteranceLogService({ aiTalkStore: store })

  for (let index = 0; index < 105; index += 1) {
    service.record({
      petPackId: 'legacy-cat',
      text: `message-${index}-${'x'.repeat(50)}`,
      source: 'test'
    })
  }

  const stateEntries = store.getState().petUtterances['legacy-cat']
  assert.equal(stateEntries.length, 100)
  assert.equal(stateEntries[0].text.startsWith('message-5-'), true)

  const recent = service.listRecent({ petPackId: 'legacy-cat', limit: 6, maxChars: 160 })
  assert.ok(recent.length <= 3)
  assert.deepEqual(
    recent.map((entry) => entry.text.match(/^message-(\d+)-/)?.[1]),
    ['102', '103', '104'].slice(-recent.length)
  )
})
