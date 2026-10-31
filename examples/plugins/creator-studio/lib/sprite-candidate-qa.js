const average = (values) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0

const median = (values) => {
  if (!values.length) return 0
  const sorted = values.slice().sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const standardDeviation = (values) => {
  if (!values.length) return 0
  const mean = average(values)
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)))
}

const unique = (values) => [...new Set(values)]

const analyzeSpriteCandidate = ({ actionId, rawMetrics = {}, profile = {}, actionPolicy = {} } = {}) => {
  profile = profile && typeof profile === 'object' ? profile : {}
  const frames = Array.isArray(rawMetrics.frames) ? rawMetrics.frames : []
  const failures = []
  if (!frames.length || frames.some((frame) => frame.empty)) failures.push('empty-used-cell')
  if (frames.some((frame) => frame.edgeTouch)) failures.push('cell-edge-contact')
  if (frames.some((frame) => frame.pasteClamped)) failures.push('paste-clamped')
  if (frames.some((frame) => Number(frame.unmatchedComponentCount) > 0)) failures.push('detached-effect-contamination')
  // Scale QA uses the final runtime cell when the processor supplied it. The
  // provider may legitimately frame different poses at different raw scales;
  // the processed output is the asset that ships and is normalized by the
  // sheet-level runtime scale. Fall back to raw cells for older metadata.
  const outputHeights = frames.map((frame) => Number(frame.outputSubjectHeightRatio)).filter(Number.isFinite)
  const heights = outputHeights.length === frames.length
    ? outputHeights
    : frames.map((frame) => Number(frame.subjectHeightRatio)).filter(Number.isFinite)
  const anchors = frames.map((frame) => {
    const processedRatio = Number(frame.outputAnchorYRatio)
    if (Number.isFinite(processedRatio)) return processedRatio
    const processedAnchor = Number(frame.outputAnchorY)
    if (Number.isFinite(processedAnchor)) {
      const cellHeight = Number(profile.runtimeCell?.height) || 128
      return processedAnchor > 1 ? processedAnchor / cellHeight : processedAnchor
    }
    return Number(frame.anchorY)
  }).filter(Number.isFinite)
  const meanHeight = average(heights)
  const bodyScaleCv = meanHeight > 0 ? standardDeviation(heights) / meanHeight : 0
  const anchorYStd = standardDeviation(anchors)
  const runtimeCellHeight = Number(profile.runtimeCell?.height)
  const runtimeStandingHeight = Number(profile.runtimeStandingHeightPx)
  const normalizedOutputBaseline = runtimeCellHeight > 0 && runtimeStandingHeight > 0
    ? runtimeStandingHeight / runtimeCellHeight
    : 0
  const canonicalHeight = outputHeights.length === frames.length
    ? normalizedOutputBaseline || meanHeight || 1
    : Number(profile.canonicalStandingHeightRatio) || meanHeight || 1
  // Per-frame pose height changes are covered by bodyScaleCv. Cross-action
  // drift compares the action's representative standing-equivalent height.
  const representativeHeight = median(heights)
  const crossActionScaleDrift = representativeHeight > 0
    ? Math.abs(representativeHeight - canonicalHeight) / canonicalHeight
    : 0
  if (bodyScaleCv > (Number(profile.maxBodyScaleCv) || 0.08)) failures.push('body-scale-variance-high')
  if (crossActionScaleDrift > (Number(profile.maxCrossActionScaleDrift) || 0.08)) failures.push('body-scale-profile-drift')
  if (actionPolicy.anchorPolicy !== 'action-relative-root-v1' && anchorYStd > (Number(profile.maxAnchorYStd) || 0.05)) {
    failures.push('anchor-baseline-drift')
  }
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
