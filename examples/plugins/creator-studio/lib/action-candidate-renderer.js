const { supportsCanonicalRig } = require('./canonical-support-rig')
const RIG_REPAIR_CODES = new Set(['visual-score-style-below-minimum', 'visual-defect-style-drift', 'visual-score-crossFrame-below-minimum', 'visual-defect-cross-frame-inconsistent', 'body-scale-variance-high'])

const createActionCandidateRenderer = ({ action, characterClass, generateVideo, generateRig }) => async (request) => {
  const useRig = request.attemptKind === 'repair' && supportsCanonicalRig({ actionId: action.actionId, characterClass }) &&
    Array.isArray(request.failureCodes) && request.failureCodes.some(code => RIG_REPAIR_CODES.has(code))
  return useRig ? generateRig(request) : generateVideo(request)
}
module.exports = { createActionCandidateRenderer }
