const test = require('node:test')
const assert = require('node:assert/strict')

const { createEventBus } = require('../../src/main/services/event-bus')
const { createSettingsService } = require('../../src/main/services/settings-service')

test('settings service saves settings and emits the persisted value', () => {
  const bus = createEventBus()
  const saved = []
  const events = []
  const sideEffects = []
  const service = createSettingsService({
    eventBus: bus,
    loadSettings: () => ({ scale: 1, walkSpeed: 2 }),
    saveSettings: (settings) => saved.push(settings),
    syncSideEffects: (settings) => sideEffects.push(settings)
  })

  bus.on('settings:changed', (settings) => events.push(settings))

  const next = service.save({ scale: 1.25, walkSpeed: 3 })

  assert.deepEqual(next, { scale: 1.25, walkSpeed: 3 })
  assert.deepEqual(saved, [{ scale: 1.25, walkSpeed: 3 }])
  assert.deepEqual(sideEffects, [{ scale: 1.25, walkSpeed: 3 }])
  assert.deepEqual(events, [{ scale: 1.25, walkSpeed: 3 }])
})

test('settings service previews partial settings without persisting', () => {
  const bus = createEventBus()
  const saved = []
  const previews = []
  const service = createSettingsService({
    eventBus: bus,
    loadSettings: () => ({ scale: 1, walkSpeed: 2 }),
    saveSettings: (settings) => saved.push(settings)
  })

  bus.on('settings:preview', (settings) => previews.push(settings))

  const next = service.preview({ scale: 1.5 })

  assert.deepEqual(next, { scale: 1.5, walkSpeed: 2 })
  assert.deepEqual(saved, [])
  assert.deepEqual(previews, [{ scale: 1.5, walkSpeed: 2 }])
})

test('settings service returns nested snapshots that cannot mutate stored settings', () => {
  const service = createSettingsService({
    loadSettings: () => ({
      scale: 1,
      plugins: {
        enabled: {
          weather: true
        }
      }
    }),
    saveSettings: () => {}
  })

  const snapshot = service.get()
  snapshot.plugins.enabled.weather = false
  snapshot.plugins.enabled.focus = true

  assert.deepEqual(service.get(), {
    scale: 1,
    plugins: {
      enabled: {
        weather: true
      }
    }
  })
})

test('settings service saves a nested copy instead of retaining caller objects', () => {
  const saved = []
  const input = {
    scale: 1.25,
    plugins: {
      enabled: {
        weather: true
      }
    }
  }
  const service = createSettingsService({
    loadSettings: () => ({ scale: 1 }),
    saveSettings: (settings) => saved.push(settings)
  })

  const next = service.save(input)
  input.plugins.enabled.weather = false
  next.plugins.enabled.focus = true

  assert.deepEqual(service.get(), {
    scale: 1.25,
    plugins: {
      enabled: {
        weather: true
      }
    }
  })
  assert.deepEqual(saved, [{
    scale: 1.25,
    plugins: {
      enabled: {
        weather: true
      }
    }
  }])
})

test('settings service emits nested settings snapshots that do not mutate stored settings', () => {
  const bus = createEventBus()
  const events = []
  const sideEffects = []
  const service = createSettingsService({
    eventBus: bus,
    loadSettings: () => ({ scale: 1 }),
    saveSettings: () => {},
    syncSideEffects: (settings) => sideEffects.push(settings)
  })

  bus.on('settings:changed', (settings) => events.push(settings))

  service.save({
    scale: 1.5,
    plugins: {
      enabled: {
        weather: true
      }
    }
  })
  events[0].plugins.enabled.weather = false
  sideEffects[0].plugins.enabled.focus = true

  assert.deepEqual(service.get(), {
    scale: 1.5,
    plugins: {
      enabled: {
        weather: true
      }
    }
  })
})

test('settings service preview returns and emits nested snapshots without mutating stored settings', () => {
  const bus = createEventBus()
  const previews = []
  const service = createSettingsService({
    eventBus: bus,
    loadSettings: () => ({
      scale: 1,
      plugins: {
        enabled: {
          weather: true
        }
      }
    }),
    saveSettings: () => {}
  })

  bus.on('settings:preview', (settings) => previews.push(settings))

  const preview = service.preview({
    plugins: {
      enabled: {
        focus: true
      }
    }
  })
  preview.plugins.enabled.focus = false
  previews[0].plugins.enabled.focus = false

  assert.deepEqual(service.get(), {
    scale: 1,
    plugins: {
      enabled: {
        weather: true
      }
    }
  })
  assert.deepEqual(service.preview({ scale: 2 }), {
    scale: 2,
    plugins: {
      enabled: {
        weather: true
      }
    }
  })
})
