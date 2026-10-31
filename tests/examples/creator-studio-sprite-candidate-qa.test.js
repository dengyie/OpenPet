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

test('candidate qa uses the processed output anchor when raw provider cell placement drifts', () => {
  const result = analyzeSpriteCandidate({
    actionId: 'idle',
    rawMetrics: { frames: [
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.72, anchorY: 0.62, outputAnchorY: 0.9 },
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.72, anchorY: 0.98, outputAnchorY: 0.9 }
    ] },
    profile: { canonicalStandingHeightRatio: 0.72, maxBodyScaleCv: 0.08, maxAnchorYStd: 0.05, maxCrossActionScaleDrift: 0.08 }
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.failures, [])
  assert.equal(result.metrics.anchorYStd, 0)
})

test('candidate qa compares normalized runtime cells with the accepted idle output baseline', () => {
  const result = analyzeSpriteCandidate({
    actionId: 'running',
    rawMetrics: { frames: [
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.675, outputSubjectHeightRatio: 0.71875, anchorY: 0.9, outputAnchorY: 115.5, outputAnchorYRatio: 0.90234375 },
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.679, outputSubjectHeightRatio: 0.71875, anchorY: 0.9, outputAnchorY: 115.5, outputAnchorYRatio: 0.90234375 }
    ] },
    profile: {
      canonicalStandingHeightRatio: 0.677,
      runtimeStandingHeightPx: 92,
      runtimeCell: { width: 128, height: 128 },
      maxBodyScaleCv: 0.08,
      maxAnchorYStd: 0.05,
      maxCrossActionScaleDrift: 0.08
    }
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.failures, [])
  assert.ok(result.metrics.crossActionScaleDrift < 0.001)
  assert.equal(result.metrics.anchorYStd, 0)
})

test('candidate qa does not reject pose-dependent raw height when runtime output is normalized', () => {
  const result = analyzeSpriteCandidate({
    actionId: 'running-right',
    rawMetrics: { frames: [
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.42, outputSubjectHeightRatio: 0.71875, outputAnchorYRatio: 0.9 },
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.48, outputSubjectHeightRatio: 0.71875, outputAnchorYRatio: 0.9 }
    ] },
    profile: {
      canonicalStandingHeightRatio: 0.64,
      runtimeStandingHeightPx: 92,
      runtimeCell: { width: 128, height: 128 },
      maxBodyScaleCv: 0.08,
      maxAnchorYStd: 0.05,
      maxCrossActionScaleDrift: 0.08
    },
    actionPolicy: { anchorPolicy: 'compact-contact-root-v1' }
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.failures, [])
  assert.equal(result.metrics.crossActionScaleDrift, 0)
})

test('candidate qa compares representative runtime height across actions while bounding pose variation separately', () => {
  const result = analyzeSpriteCandidate({
    actionId: 'running-right',
    rawMetrics: { frames: [
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.412, outputSubjectHeightRatio: 0.71875, outputAnchorYRatio: 0.8984 },
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.381, outputSubjectHeightRatio: 0.66406, outputAnchorYRatio: 0.8984 },
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.412, outputSubjectHeightRatio: 0.71875, outputAnchorYRatio: 0.8984 },
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.451, outputSubjectHeightRatio: 0.78906, outputAnchorYRatio: 0.8984 },
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.416, outputSubjectHeightRatio: 0.72656, outputAnchorYRatio: 0.8984 },
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.395, outputSubjectHeightRatio: 0.6875, outputAnchorYRatio: 0.8984 },
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.404, outputSubjectHeightRatio: 0.703125, outputAnchorYRatio: 0.8984 },
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.443, outputSubjectHeightRatio: 0.7734375, outputAnchorYRatio: 0.8984 }
    ] },
    profile: {
      runtimeStandingHeightPx: 92,
      runtimeCell: { width: 128, height: 128 },
      maxBodyScaleCv: 0.08,
      maxAnchorYStd: 0.05,
      maxCrossActionScaleDrift: 0.08
    },
    actionPolicy: { anchorPolicy: 'compact-contact-root-v1' }
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.failures, [])
  assert.ok(result.metrics.bodyScaleCv < 0.08)
  assert.equal(result.metrics.crossActionScaleDrift, 0)
})

test('candidate qa treats pixel output anchors as pixels when checking normalized baseline drift', () => {
  const result = analyzeSpriteCandidate({
    actionId: 'jumping',
    rawMetrics: { frames: [
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.675, outputSubjectHeightRatio: 0.71875, anchorY: 0.63, outputAnchorY: 64 },
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.675, outputSubjectHeightRatio: 0.71875, anchorY: 0.49, outputAnchorY: 64.5 }
    ], rawTrajectory: { minY: 0.49, maxY: 0.63 } },
    profile: { runtimeStandingHeightPx: 92, runtimeCell: { width: 128, height: 128 }, maxBodyScaleCv: 0.08, maxAnchorYStd: 0.05, maxCrossActionScaleDrift: 0.08 },
    actionPolicy: { minJumpExcursionRatio: 0.08 }
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.failures, [])
  assert.ok(result.metrics.anchorYStd < 0.005)
})

test('candidate qa accepts null profile while the idle scale profile is being established', () => {
  const result = analyzeSpriteCandidate({
    actionId: 'idle',
    rawMetrics: { frames: [
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.71, anchorY: 0.9 },
      { empty: false, edgeTouch: false, pasteClamped: false, unmatchedComponentCount: 0, subjectHeightRatio: 0.73, anchorY: 0.91 }
    ] },
    profile: null
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
