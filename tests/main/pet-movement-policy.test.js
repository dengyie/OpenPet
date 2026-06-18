const test = require('node:test')
const assert = require('node:assert/strict')

const { createPetMovementPolicy } = require('../../src/main/pet-movement-policy')

const createFakeScreen = ({ workArea = { x: 0, y: 0, width: 1440, height: 900, id: 1 } } = {}) => {
  const normalizedDisplay = {
    id: workArea.id ?? 1,
    workArea: {
      x: workArea.x,
      y: workArea.y,
      width: workArea.width,
      height: workArea.height
    }
  }

  return {
    getDisplayMatching: () => normalizedDisplay,
    getDisplayNearestPoint: () => normalizedDisplay,
    getPrimaryDisplay: () => normalizedDisplay
  }
}

const createPetBehaviorSettings = (overrides = {}) => ({
  grounded: false,
  home: {
    enabled: false,
    radius: 'medium',
    anchor: null
  },
  ...overrides,
  home: {
    enabled: false,
    radius: 'medium',
    anchor: null,
    ...(overrides.home || {})
  }
})

test('grounded policy clamps the pet landing point to the display ground line', () => {
  const policy = createPetMovementPolicy({
    screen: createFakeScreen({
      workArea: { x: 0, y: 0, width: 1440, height: 900, id: 1 }
    })
  })

  const result = policy.clampDragPosition({
    windowBounds: { x: 100, y: 100, width: 300, height: 300 },
    requestedTopLeft: { x: 240, y: 120 },
    settings: createPetBehaviorSettings({ grounded: true })
  })

  assert.equal(result.y, 900 - 300 - policy.getGroundInset())
  assert.equal(result.landingY, 900 - policy.getGroundInset())
})

test('home policy clamps horizontal landing positions to the configured radius', () => {
  const policy = createPetMovementPolicy({
    screen: createFakeScreen({
      workArea: { x: 0, y: 0, width: 1440, height: 900, id: 1 }
    })
  })

  const result = policy.clampMoveBy({
    windowBounds: { x: 900, y: 560, width: 300, height: 300 },
    delta: { x: 80, y: 0 },
    settings: createPetBehaviorSettings({
      grounded: true,
      home: {
        enabled: true,
        radius: 'small',
        anchor: { displayId: '1', x: 1000, y: 860 }
      }
    })
  })

  assert.equal(result.hitX, true)
  assert.equal(result.landingX <= policy.getAllowedRange('small', 1000).max, true)
})

test('drag end returns a persisted home anchor when home is enabled', () => {
  const policy = createPetMovementPolicy({
    screen: createFakeScreen({
      workArea: { x: 0, y: 0, width: 1440, height: 900, id: 1 }
    })
  })

  const result = policy.createHomeAnchorFromWindow({
    windowBounds: { x: 880, y: 560, width: 300, height: 300 }
  })

  assert.deepEqual(result, { displayId: '1', x: 1030, y: 860 })
})

test('display recovery clamps stale home anchors back into the current work area', () => {
  const policy = createPetMovementPolicy({
    screen: createFakeScreen({
      workArea: { x: 0, y: 0, width: 1280, height: 800, id: 1 }
    })
  })

  const next = policy.normalizeAnchorForDisplay({
    anchor: { displayId: '1', x: 2000, y: 1200 },
    display: { id: 1, workArea: { x: 0, y: 0, width: 1280, height: 800 } }
  })

  assert.equal(next.x <= 1130, true)
  assert.equal(next.y, 760)
})
