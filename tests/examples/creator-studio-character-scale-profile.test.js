const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createCharacterScaleProfile,
  measureBodyMask
} = require('../../examples/plugins/creator-studio/lib/character-scale-profile')
const { getQualityFirstQualityProfile } = require('../../examples/plugins/creator-studio/lib/pet-generation-quality-profile')

const createRgba = (width, height, rects) => {
  const data = Buffer.alloc(width * height * 4)
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        const offset = ((y * width) + x) * 4
        data[offset] = rect.r || 200
        data[offset + 1] = rect.g || 50
        data[offset + 2] = rect.b || 50
        data[offset + 3] = 255
      }
    }
  }
  return data
}

test('body measurement preserves near identity satellites and reports detached contamination', () => {
  const metrics = measureBodyMask({
    data: createRgba(100, 100, [
      { x: 35, y: 25, width: 30, height: 60 },
      { x: 66, y: 35, width: 5, height: 12, r: 20, g: 80, b: 220 },
      { x: 4, y: 4, width: 4, height: 4, r: 20, g: 220, b: 80 }
    ]),
    width: 100,
    height: 100,
    characterClass: 'grounded-compact-character'
  })

  assert.equal(metrics.identityComponents.length, 2)
  assert.equal(metrics.unmatchedComponents.length, 1)
  assert.equal(metrics.unmatchedComponents[0].area, 16)
  assert.ok(metrics.compactBaselineY > 0.8)
  assert.ok(metrics.coreThicknessP75Ratio > 0)
})

test('character scale profile binds morphology, masks, and idle measurements', () => {
  const profile = createCharacterScaleProfile({
    canonicalMetrics: { subjectHeightRatio: 0.72, subjectWidthRatio: 0.48, alphaAreaRatio: 0.31, coreThicknessP75Ratio: 0.09, bodyMaskSha256: 'a'.repeat(64), coreDescriptorSha256: 'b'.repeat(64), satelliteDescriptorsSha256: 'c'.repeat(64) },
    idleMetrics: [{ subjectHeightRatio: 0.71, coreThicknessP75Ratio: 0.091 }, { subjectHeightRatio: 0.73, coreThicknessP75Ratio: 0.089 }],
    characterClass: 'grounded-compact-character',
    anchorPolicy: 'compact-contact-root-v1',
    canonicalMasterSha256: 'd'.repeat(64),
    idleCheckpointSha256: 'e'.repeat(64),
    processorVersion: 1
  })

  assert.equal(profile.componentPolicy, 'reference-guided-body-v1')
  assert.equal(profile.characterClass, 'grounded-compact-character')
  assert.equal(profile.measurementVersion, 1)
  assert.match(profile.hash, /^[a-f0-9]{64}$/)
  assert.equal(Object.isFrozen(profile), true)
  assert.equal(Object.isFrozen(profile.canonicalSatelliteDescriptors), true)
  assert.equal(Object.isFrozen(profile.runtimeCell), true)
})

test('quality-first profile exposes every morphology and package threshold group', () => {
  const profile = getQualityFirstQualityProfile()
  assert.ok(profile.identity)
  assert.ok(profile.groundedCompact)
  assert.ok(profile.groundedElongated)
  assert.ok(profile.floating)
  assert.ok(profile.airborne)
  assert.ok(profile.crossAction)
  assert.ok(profile.atlas)
  assert.ok(profile.visual)
  assert.equal(Object.isFrozen(profile.crossAction), true)
})

test('quality-first profile exposes a deterministic content hash for checkpoint binding', () => {
  const profile = getQualityFirstQualityProfile()
  assert.match(profile.hash, /^[a-f0-9]{64}$/)
  assert.equal(profile.hash, getQualityFirstQualityProfile().hash)
})

test('body measurement only keeps detached components that match canonical satellites', () => {
  const canonical = measureBodyMask({
    data: createRgba(100, 100, [
      { x: 35, y: 25, width: 30, height: 60 },
      { x: 73, y: 35, width: 5, height: 12, r: 20, g: 80, b: 220 }
    ]),
    width: 100,
    height: 100
  })
  const action = measureBodyMask({
    data: createRgba(100, 100, [
      { x: 35, y: 25, width: 30, height: 60 },
      { x: 73, y: 35, width: 5, height: 12, r: 20, g: 80, b: 220 },
      { x: 5, y: 5, width: 4, height: 4, r: 240, g: 240, b: 20 }
    ]),
    width: 100,
    height: 100,
    canonicalProfile: {
      canonicalCoreDescriptor: canonical.coreDescriptor,
      canonicalSatelliteDescriptors: canonical.identityComponents.slice(1)
    }
  })

  assert.equal(action.identityComponents.length, 2)
  assert.equal(action.unmatchedComponents.length, 1)
  assert.equal(action.unmatchedComponents[0].area, 16)

  const mismatchedSatellite = measureBodyMask({
    data: createRgba(100, 100, [
      { x: 35, y: 25, width: 30, height: 60 },
      { x: 73, y: 35, width: 5, height: 12, r: 240, g: 240, b: 20 }
    ]),
    width: 100,
    height: 100,
    canonicalProfile: {
      canonicalCoreDescriptor: canonical.coreDescriptor,
      canonicalSatelliteDescriptors: canonical.identityComponents.slice(1)
    }
  })
  assert.equal(mismatchedSatellite.identityComponents.length, 1)
  assert.equal(mismatchedSatellite.unmatchedComponents.length, 1)
})

test('body thickness uses an interior distance signal instead of bounding-box edge distance', () => {
  const metrics = measureBodyMask({
    data: createRgba(80, 80, [{ x: 20, y: 10, width: 40, height: 60 }]),
    width: 80,
    height: 80
  })

  assert.ok(metrics.coreThicknessP75Ratio > 0.12)
  assert.ok(metrics.coreThicknessP75Ratio < 0.3)
})

test('canonical matching selects the plausible core when an effect is the largest component', () => {
  const canonical = measureBodyMask({
    data: createRgba(100, 100, [{ x: 35, y: 20, width: 30, height: 60, r: 200, g: 40, b: 40 }]),
    width: 100,
    height: 100
  })
  const action = measureBodyMask({
    data: createRgba(100, 100, [
      { x: 35, y: 20, width: 30, height: 60, r: 200, g: 40, b: 40 },
      { x: 2, y: 2, width: 25, height: 80, r: 20, g: 220, b: 60 }
    ]),
    width: 100,
    height: 100,
    canonicalProfile: { canonicalCoreDescriptor: canonical.coreDescriptor, canonicalSatelliteDescriptors: [] }
  })

  assert.ok(action.coreDescriptor.meanColor.r > action.coreDescriptor.meanColor.g)
  assert.equal(action.unmatchedComponents.length, 1)
})

test('morphology measurements expose elongated contact and floating core anchors', () => {
  const elongated = measureBodyMask({
    data: createRgba(100, 100, [{ x: 10, y: 40, width: 80, height: 30 }]),
    width: 100,
    height: 100,
    characterClass: 'grounded-elongated-character'
  })
  const floating = measureBodyMask({
    data: createRgba(100, 100, [{ x: 30, y: 20, width: 40, height: 40 }]),
    width: 100,
    height: 100,
    characterClass: 'floating-character'
  })

  assert.ok(elongated.elongatedContactBandY > 0.6)
  assert.ok(elongated.elongatedRoot.x > 0.45 && elongated.elongatedRoot.x < 0.55)
  assert.ok(floating.floatingCore.x > 0.45 && floating.floatingCore.x < 0.55)
  assert.ok(floating.floatingCore.y > 0.35 && floating.floatingCore.y < 0.45)
})
