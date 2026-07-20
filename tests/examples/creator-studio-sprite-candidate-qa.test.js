const test = require('node:test')
const assert = require('node:assert/strict')

const { analyzeSpriteCandidate } = require('../../examples/plugins/creator-studio/lib/sprite-candidate-qa')

test('candidate qa rejects raw contamination, clamp, and scale drift', () => {
  const result = analyzeSpriteCandidate({
    actionId: 'idle',
    rawMetrics: {
      frames: [
        { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.72, anchorY: 0.9 },
        { empty: false, edgeTouch: true, pasteClamped: true, unmatchedComponentCount: 1, subjectHeightRatio: 0.9, anchorY: 0.75 }
      ]
    },
    profile: { canonicalStandingHeightRatio: 0.72, maxBodyScaleCv: 0.08, maxAnchorYStd: 0.05, maxCrossActionScaleDrift: 0.08 }
  })

  assert.equal(result.ok, false)
  assert.ok(result.failures.includes('cell-edge-contact'))
  assert.ok(result.failures.includes('paste-clamped'))
  assert.ok(result.failures.includes('detached-effect-contamination'))
  assert.ok(result.failures.includes('body-scale-profile-drift'))
  assert.ok(result.failures.includes('anchor-baseline-drift'))
})

test('candidate qa accepts bounded raw metrics', () => {
  const result = analyzeSpriteCandidate({
    actionId: 'idle',
    rawMetrics: { frames: [
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.71, anchorY: 0.9 },
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.73, anchorY: 0.91 }
    ] },
    profile: { canonicalStandingHeightRatio: 0.72, maxBodyScaleCv: 0.08, maxAnchorYStd: 0.05, maxCrossActionScaleDrift: 0.08 }
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.failures, [])
})

test('candidate qa rejects a jumping row without a readable raw trajectory', () => {
  const result = analyzeSpriteCandidate({
    actionId: 'jumping',
    rawMetrics: {
      frames: [
        { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.7, anchorY: 0.8 },
        { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.7, anchorY: 0.82 }
      ],
      rawTrajectory: { minY: 0.79, maxY: 0.81 }
    },
    profile: { canonicalStandingHeightRatio: 0.7, maxBodyScaleCv: 0.08, maxAnchorYStd: 0.05, maxCrossActionScaleDrift: 0.08 },
    actionPolicy: { minJumpExcursionRatio: 0.1 }
  })

  assert.equal(result.ok, false)
  assert.ok(result.failures.includes('jumping-trajectory-missing'))
})
