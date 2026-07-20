const { selectBestPassingCandidate } = require('./sprite-candidate-store')

const unique = (values) => [...new Set(values.filter(Boolean).map((value) => String(value)))]
const hammingDistance = (left, right) => {
  const a = String(left || '').toLowerCase()
  const b = String(right || '').toLowerCase()
  if (!a || !b || a.length !== b.length || !/^[a-f0-9]+$/.test(a) || !/^[a-f0-9]+$/.test(b)) return Number.POSITIVE_INFINITY
  let count = 0
  for (let index = 0; index < a.length; index += 1) count += (parseInt(a[index], 16) ^ parseInt(b[index], 16)).toString(2).split('1').length - 1
  return count
}
const vectorDistance = (left, right) => {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) return Number.POSITIVE_INFINITY
  return Math.sqrt(left.reduce((sum, value, index) => sum + ((Number(value) - Number(right[index])) ** 2), 0) / left.length)
}
const isDuplicate = (left, right, thresholds = {}) => {
  const perceptual = hammingDistance(left?.descriptors?.perceptualHash, right?.descriptors?.perceptualHash)
  if (perceptual > (Number(thresholds.perceptualHashDistance) || 4)) return false
  const identity = vectorDistance(left?.descriptors?.identityDescriptor, right?.descriptors?.identityDescriptor)
  const alpha = vectorDistance(left?.descriptors?.alphaMaskDescriptor, right?.descriptors?.alphaMaskDescriptor)
  return identity <= (Number(thresholds.identityDescriptorDistance) || 0.08) && alpha <= (Number(thresholds.alphaMaskDistance) || 0.08)
}
const hasDescriptors = (candidate) => Boolean(
  candidate?.descriptors?.perceptualHash &&
  Array.isArray(candidate?.descriptors?.identityDescriptor) && candidate.descriptors.identityDescriptor.length &&
  Array.isArray(candidate?.descriptors?.alphaMaskDescriptor) && candidate.descriptors.alphaMaskDescriptor.length
)
const errorSummary = (error) => String(error?.message || error || 'candidate processing failed').replace(/\s+/g, ' ').slice(0, 240)

const runQualityFirstAction = async ({
  context = {},
  reserveCreativeDispatch,
  generateCandidate,
  processCandidate,
  evaluateCandidate,
  persistCandidate = () => {},
  archiveCandidateRevision = () => {}
} = {}) => {
  const actionId = String(context.actionId || '')
  if (!actionId) throw new Error('Quality-first action runner requires an actionId')
  if (typeof reserveCreativeDispatch !== 'function' || typeof generateCandidate !== 'function' || typeof processCandidate !== 'function' || typeof evaluateCandidate !== 'function') {
    throw new Error('Quality-first action runner requires generation, processing, evaluation, and reservation callbacks')
  }
  const thresholds = context.duplicateThresholds || {}
  const allCandidates = []
  const distinctCandidates = []
  const dispatches = []
  const failureCodes = []
  const dispatch = async (attemptKind, repairCodes = []) => {
    await reserveCreativeDispatch({ actionId, attemptKind })
    const generated = await generateCandidate({ actionId, attemptKind, failureCodes: repairCodes.slice() })
    if (!generated || !generated.candidateId) throw new Error(`Quality-first action ${actionId} returned an invalid candidate`)
    const dispatchIndex = dispatches.length + 1
    const requestedCandidateId = String(generated.candidateId)
    const candidateId = dispatches.some((entry) => entry.candidateId === requestedCandidateId)
      ? `${requestedCandidateId}-${dispatchIndex}`.slice(0, 128)
      : requestedCandidateId
    const candidate = { ...generated, candidateId, actionId, attemptKind, dispatchIndex }
    dispatches.push(candidate)
    if (!hasDescriptors(candidate)) {
      candidate.invalidCandidate = true
      candidate.failureCodes = ['candidate-descriptor-missing']
      allCandidates.push(candidate)
      return candidate
    }
    const duplicateOf = distinctCandidates.find((existing) => isDuplicate(existing, candidate, thresholds))
    if (duplicateOf) {
      candidate.duplicateOfCandidateId = duplicateOf.candidateId
      allCandidates.push(candidate)
      return candidate
    }
    distinctCandidates.push(candidate)
    allCandidates.push(candidate)
    return candidate
  }

  await dispatch('initial')
  await dispatch('initial')
  if (distinctCandidates.length < 2) await dispatch('duplicate-replacement')
  if (distinctCandidates.length < 2) {
    for (const candidate of allCandidates) await persistCandidate(candidate)
    return {
      ok: false,
      actionId,
      disposition: actionId === 'idle' ? 'blocked' : 'omitted',
      failureCode: 'action_candidate_diversity_insufficient',
      candidates: allCandidates,
      selectedCandidateId: ''
    }
  }

  const evaluatedCandidates = []
  for (const candidate of distinctCandidates) {
    let withQa
    try {
      const processed = await processCandidate(candidate)
      withQa = { ...candidate, ...processed }
    } catch (error) {
      withQa = { ...candidate, qa: { ok: false, failures: ['candidate-processing-failed'], error: errorSummary(error) } }
    }
    if (withQa.qa?.ok === true) {
      try {
        Object.assign(withQa, await evaluateCandidate(withQa))
      } catch (error) {
        Object.assign(withQa, { gate: { ok: false, outcome: 'cannot-evaluate', failures: ['candidate-evaluation-failed'], error: errorSummary(error) } })
      }
    } else failureCodes.push(...(withQa.qa?.failures || []))
    failureCodes.push(...(withQa.gate?.failures || []))
    Object.assign(candidate, withQa)
    evaluatedCandidates.push(candidate)
  }
  for (const candidate of allCandidates) await persistCandidate(candidate)
  let selected = selectBestPassingCandidate({ candidates: evaluatedCandidates })
  if (!selected) {
    const repairCodes = unique(failureCodes)
    await archiveCandidateRevision({ actionId, reasonCodes: repairCodes })
    const repair = await dispatch('repair', repairCodes)
    if (!repair.duplicateOfCandidateId && !repair.invalidCandidate) {
      try {
        const processed = await processCandidate(repair)
        Object.assign(repair, processed)
      } catch (error) {
        Object.assign(repair, { qa: { ok: false, failures: ['candidate-processing-failed'], error: errorSummary(error) } })
      }
      if (repair.qa?.ok === true) {
        try {
          Object.assign(repair, await evaluateCandidate(repair))
        } catch (error) {
          Object.assign(repair, { gate: { ok: false, outcome: 'cannot-evaluate', failures: ['candidate-evaluation-failed'], error: errorSummary(error) } })
        }
      }
      failureCodes.push(...(repair.qa?.failures || []), ...(repair.gate?.failures || []))
    }
    await persistCandidate(repair)
    selected = selectBestPassingCandidate({ candidates: [...evaluatedCandidates, repair] })
  }
  const result = selected
    ? { ok: true, actionId, disposition: 'accepted', selectedCandidateId: selected.candidateId, selectedCandidate: selected, candidates: allCandidates }
    : { ok: false, actionId, disposition: actionId === 'idle' ? 'blocked' : 'omitted', failureCode: 'action_quality_gate_failed', candidates: allCandidates, selectedCandidateId: '' }
  return result
}

module.exports = {
  runQualityFirstAction
}
