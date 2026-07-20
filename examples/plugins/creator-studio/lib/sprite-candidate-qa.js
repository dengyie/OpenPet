const average = (values) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0

const standardDeviation = (values) => {
  if (!values.length) return 0
  const mean = average(values)
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)))
}

const unique = (values) => [...new Set(values)]

const analyzeSpriteCandidate = ({ actionId, rawMetrics = {}, profile = {}, actionPolicy = {} } = {}) => {
  const frames = Array.isArray(rawMetrics.frames) ? rawMetrics.frames : []
  const failures = []
  if (!frames.length || frames.some((frame) => frame.empty)) failures.push('empty-used-cell')
  if (frames.some((frame) => frame.edgeTouch)) failures.push('cell-edge-contact')
  if (frames.some((frame) => frame.pasteClamped)) failures.push('paste-clamped')
  if (frames.some((frame) => Number(frame.unmatchedComponentCount) > 0)) failures.push('detached-effect-contamination')
  const heights = frames.map((frame) => Number(frame.subjectHeightRatio)).filter(Number.isFinite)
  const anchors = frames.map((frame) => Number(frame.anchorY)).filter(Number.isFinite)
  const meanHeight = average(heights)
  const bodyScaleCv = meanHeight > 0 ? standardDeviation(heights) / meanHeight : 0
  const anchorYStd = standardDeviation(anchors)
  const canonicalHeight = Number(profile.canonicalStandingHeightRatio) || meanHeight || 1
  const crossActionScaleDrift = heights.length
    ? Math.max(...heights.map((height) => Math.abs(height - canonicalHeight) / canonicalHeight))
    : 0
  if (bodyScaleCv > (Number(profile.maxBodyScaleCv) || 0.08)) failures.push('body-scale-variance-high')
  if (crossActionScaleDrift > (Number(profile.maxCrossActionScaleDrift) || 0.08)) failures.push('body-scale-profile-drift')
  if (anchorYStd > (Number(profile.maxAnchorYStd) || 0.05)) failures.push('anchor-baseline-drift')
  const trajectory = rawMetrics.rawTrajectory
  const jumpExcursion = trajectory
    ? Math.max(0, Number(trajectory.maxY) - Number(trajectory.minY))
    : 0
  if (String(actionId) === 'jumping' && jumpExcursion < (Number(actionPolicy.minJumpExcursionRatio) || 0.08)) {
    failures.push('jumping-trajectory-missing')
  }
  const normalizedFailures = unique(failures)
  return Object.freeze({
    version: 1,
    actionId: String(actionId || ''),
    ok: normalizedFailures.length === 0,
    failures: normalizedFailures,
    metrics: Object.freeze({ bodyScaleCv, anchorYStd, crossActionScaleDrift, jumpExcursion, frameCount: frames.length })
  })
}

module.exports = {
  analyzeSpriteCandidate
}
