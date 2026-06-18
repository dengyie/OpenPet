const test = require('node:test')
const assert = require('node:assert/strict')

const {
  getFrameHitbox,
  getWindowHitbox,
  getViewportHitbox,
  isPointInHitbox
} = require('../../src/shared/pet-hitbox')

test('viewport hitbox covers the whole action area when the current frame trim is smaller', () => {
  const animation = {
    frameWidth: 20,
    frameHeight: 20,
    frames: [
      { trim: { x: 4, y: 6, width: 7, height: 8 } }
    ]
  }
  const layout = {
    viewport: { x: 4, y: 3, width: 9, height: 12, padding: 2 },
    dims: { width: 20, height: 20, fitScale: 1 },
    catLeft: 0,
    catBottom: 0
  }

  const frameHitbox = getFrameHitbox({ animation, layout, frameIndex: 0, windowHeight: 24, scale: 1 })
  const viewportHitbox = getViewportHitbox({ layout, windowHeight: 24, scale: 1 })

  assert.equal(isPointInHitbox({ x: 1, y: 10 }, frameHitbox), false)
  assert.equal(isPointInHitbox({ x: 1, y: 10 }, viewportHitbox), true)
})

test('frame hitbox preserves alpha trim precision for transparent passthrough', () => {
  const animation = {
    frameWidth: 20,
    frameHeight: 20,
    frames: [
      { trim: { x: 8, y: 3, width: 5, height: 12 } }
    ]
  }
  const layout = {
    viewport: { x: 4, y: 3, width: 9, height: 12, padding: 0 },
    dims: { width: 20, height: 20, fitScale: 1 },
    catLeft: 0,
    catBottom: 0
  }

  const frameHitbox = getFrameHitbox({ animation, layout, frameIndex: 0, windowHeight: 20, scale: 1 })

  assert.equal(isPointInHitbox({ x: 7, y: 4 }, frameHitbox), false)
  assert.equal(isPointInHitbox({ x: 9, y: 4 }, frameHitbox), true)
})

test('window hitbox covers every point that can be received by the pet renderer', () => {
  const hitbox = getWindowHitbox({ windowWidth: 120, windowHeight: 80 })

  assert.equal(isPointInHitbox({ x: 0, y: 0 }, hitbox), true)
  assert.equal(isPointInHitbox({ x: 119, y: 79 }, hitbox), true)
  assert.equal(isPointInHitbox({ x: 121, y: 40 }, hitbox), false)
})
