const test = require('node:test')
const assert = require('node:assert/strict')

const { createPetService } = require('../../src/main/services/pet-service')

test('pet service exposes a snapshot composed from settings and actions', () => {
  const service = createPetService({
    settingsService: {
      get: () => ({ scale: 1, walkSpeed: 2 })
    },
    actionService: {
      getConfig: () => ({
        defaultAction: 'idle',
        clickAction: 'eat',
        actions: [{ id: 'idle' }]
      })
    }
  })

  assert.deepEqual(service.getSnapshot(), {
    settings: { scale: 1, walkSpeed: 2 },
    actions: {
      defaultAction: 'idle',
      clickAction: 'eat',
      actions: [{ id: 'idle' }]
    }
  })
})

test('pet service delegates settings and action operations', () => {
  const calls = []
  const service = createPetService({
    settingsService: {
      get: () => ({ scale: 1 }),
      save: (settings) => {
        calls.push(['save', settings])
        return settings
      },
      preview: (settings) => {
        calls.push(['preview', settings])
        return settings
      }
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [] }),
      getAction: (id) => ({ id })
    }
  })

  assert.deepEqual(service.saveSettings({ scale: 1.2 }), { scale: 1.2 })
  assert.deepEqual(service.previewSettings({ scale: 1.4 }), { scale: 1.4 })
  assert.deepEqual(service.getAction('idle'), { id: 'idle' })
  assert.deepEqual(calls, [
    ['save', { scale: 1.2 }],
    ['preview', { scale: 1.4 }]
  ])
})

test('pet service emits say events through the runtime event bus', () => {
  const events = []
  const logs = []
  const service = createPetService({
    eventBus: {
      emit: (eventName, payload) => events.push([eventName, payload])
    },
    appLogService: {
      record: (entry) => logs.push(entry)
    },
    requestIdFactory: () => 'pet-test-1',
    settingsService: {
      get: () => ({ scale: 1 })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [] })
    }
  })

  assert.deepEqual(service.say({ text: 'hi', source: 'test', sourceSurface: 'unit-test' }), {
    text: 'hi',
    ttlMs: undefined,
    source: 'test',
    sourceSurface: 'unit-test',
    requestId: 'pet-test-1'
  })
  assert.deepEqual(events, [[
    'pet:say',
    { text: 'hi', ttlMs: undefined, source: 'test', sourceSurface: 'unit-test', requestId: 'pet-test-1' }
  ]])
  assert.deepEqual(logs, [{
    actor: 'system',
    scope: 'pet',
    level: 'info',
    event: 'pet.say.ingress',
    message: 'Pet say ingress received',
    details: {
      requestId: 'pet-test-1',
      source: 'test',
      sourceSurface: 'unit-test',
      textChars: 2,
      hasTtl: false,
      ttlMs: 0
    }
  }])
})

test('pet service emits action and event intents through the runtime event bus', () => {
  const events = []
  const service = createPetService({
    eventBus: {
      emit: (eventName, payload) => events.push([eventName, payload])
    },
    settingsService: {
      get: () => ({ scale: 1 })
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [{ id: 'idle' }] }),
      getAction: (id) => id === 'idle' ? { id: 'idle' } : null
    }
  })

  assert.deepEqual(service.playAction({ actionId: 'idle', source: 'test' }), {
    actionId: 'idle',
    source: 'test'
  })
  assert.deepEqual(service.setEvent({ type: 'status', message: 'working', ttlMs: 500, source: 'test' }), {
    type: 'status',
    message: 'working',
    ttlMs: 500,
    source: 'test'
  })
  assert.deepEqual(events, [
    ['pet:action', { actionId: 'idle', source: 'test' }],
    ['pet:event', { type: 'status', message: 'working', ttlMs: 500, source: 'test' }]
  ])
})
