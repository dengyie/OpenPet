const { selectBestPassingCandidate } = require('./sprite-candidate-store')
const { normalizeCandidateDecision } = require('./candidate-decision')

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
const areSpriteCandidatesDuplicates = (left, right, thresholds = {}) => {
  const perceptual = hammingDistance(left?.descriptors?.perceptualHash, right?.descriptors?.perceptualHash)
  if (perceptual > (Number(thresholds.perceptualHashDistance) || 4)) return false
  const identity = vectorDistance(left?.descriptors?.identityDescriptor, right?.descriptors?.identityDescriptor)
  const alpha = vectorDistance(left?.descriptors?.alphaMaskDescriptor, right?.descriptors?.alphaMaskDescriptor)
  const meanColor = vectorDistance(left?.descriptors?.meanColorDescriptor, right?.descriptors?.meanColorDescriptor)
  return identity <= (Number(thresholds.identityDescriptorDistance) || 0.08) &&
    alpha <= (Number(thresholds.alphaMaskDistance) || 0.08) &&
    (!Number.isFinite(meanColor) || meanColor <= (Number(thresholds.meanColorDistance) || 0.08))
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
  existingCandidates = [],
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
    const dispatchIndex = Math.max(0, ...dispatches.map((entry) => Number(entry.dispatchIndex) || 0)) + 1
    const assignedCandidateId = `candidate-${dispatchIndex}`
    await reserveCreativeDispatch({ actionId, attemptKind, candidateId: assignedCandidateId, dispatchIndex })
    let generated
    try {
      generated = await generateCandidate({
        actionId,
        attemptKind,
        candidateId: assignedCandidateId,
        dispatchIndex,
        failureCodes: repairCodes.slice()
      })
    } catch (error) {
      const modelAttempts = Array.isArray(error?.modelAttempts) ? error.modelAttempts.slice(0, 16) : []
      const failureCode = String(error?.code || 'provider-generation-failed')
        .replace(/[^A-Za-z0-9:_-]/g, '_')
        .slice(0, 120)
      const failedCandidate = {
        candidateId: assignedCandidateId,
        actionId,
        attemptKind,
        dispatchIndex,
        provider: String(context.provider || ''),
        model: String(modelAttempts.at(-1)?.model || context.model || ''),
        requestId: String(modelAttempts.at(-1)?.requestId || ''),
        modelAttempts,
        technicalEligible: false,
        recommended: false,
        technicalFailureCodes: [failureCode],
        qualityWarningCodes: [],
        failureCodes: [failureCode]
      }
      dispatches.push(failedCandidate)
      allCandidates.push(failedCandidate)
      return failedCandidate
    }
    if (!generated) throw new Error(`Quality-first action ${actionId} returned an invalid candidate`)
    const requestedCandidateId = String(generated.candidateId || assignedCandidateId)
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
    const duplicateOf = distinctCandidates.find((existing) => areSpriteCandidatesDuplicates(existing, candidate, thresholds))
    if (duplicateOf) {
      candidate.duplicateOfCandidateId = duplicateOf.candidateId
      allCandidates.push(candidate)
      return candidate
    }
    distinctCandidates.push(candidate)
    allCandidates.push(candidate)
    return candidate
  }

  for (const [index, source] of (Array.isArray(existingCandidates) ? existingCandidates : []).entries()) {
    if (!source || typeof source !== 'object') continue
    const requestedCandidateId = String(source.candidateId || `candidate-${index + 1}`)
    const candidateId = dispatches.some((entry) => entry.candidateId === requestedCandidateId)
      ? `${requestedCandidateId}-${index + 1}`.slice(0, 128)
      : requestedCandidateId
    const candidate = {
      ...source,
      candidateId,
      actionId,
      attemptKind: ['initial', 'duplicate-replacement', 'repair'].includes(source.attemptKind) ? source.attemptKind : 'initial',
      dispatchIndex: Number.isInteger(source.dispatchIndex) ? source.dispatchIndex : index + 1
    }
    dispatches.push(candidate)
    allCandidates.push(candidate)
    if (!hasDescriptors(candidate)) continue
    const duplicateOf = distinctCandidates.find((existing) => areSpriteCandidatesDuplicates(existing, candidate, thresholds))
    if (duplicateOf) candidate.duplicateOfCandidateId = candidate.duplicateOfCandidateId || duplicateOf.candidateId
    else distinctCandidates.push(candidate)
  }

  const existingInitialCount = dispatches.filter((candidate) => candidate.attemptKind === 'initial').length
  for (let index = existingInitialCount; index < 2; index += 1) await dispatch('initial')
  if (distinctCandidates.length < 2 && !dispatches.some((candidate) => candidate.attemptKind === 'duplicate-replacement')) {
    await dispatch('duplicate-replacement')
  }

  const evaluatedCandidates = []
  const evaluateGeneratedCandidate = async (candidate) => {
    if (!hasDescriptors(candidate) || candidate.invalidCandidate) return null
    let withQa
    try {
      const processed = await processCandidate(candidate)
      withQa = normalizeCandidateDecision({
        candidate: { ...candidate, ...processed },
        technicalEligible: processed?.technicalEligible !== false,
        recommended: false,
        technicalFailureCodes: processed?.technicalEligible === false
          ? (processed.technicalFailureCodes || ['candidate-processing-incomplete'])
          : [],
        qualityWarningCodes: processed?.qa?.failures || []
      })
    } catch (error) {
      withQa = normalizeCandidateDecision({
        candidate: { ...candidate, qa: { ok: false, failures: ['candidate-processing-failed'], error: errorSummary(error) } },
        technicalEligible: false,
        recommended: false,
        technicalFailureCodes: ['candidate-processing-failed'],
        qualityWarningCodes: []
      })
    }
    if (withQa.qa?.ok === true) {
      try {
        Object.assign(withQa, await evaluateCandidate(withQa))
      } catch (error) {
        Object.assign(withQa, { gate: { ok: false, outcome: 'cannot-evaluate', failures: ['candidate-evaluation-failed'], error: errorSummary(error) } })
      }
    } else failureCodes.push(...(withQa.qa?.failures || []))
    failureCodes.push(...(withQa.gate?.failures || []))
    withQa = normalizeCandidateDecision({
      candidate: withQa,
      technicalEligible: withQa.technicalEligible === true,
      recommended: withQa.technicalEligible === true && withQa.qa?.ok === true && withQa.gate?.ok === true,
      technicalFailureCodes: withQa.technicalFailureCodes,
      qualityWarningCodes: [
        ...(withQa.qualityWarningCodes || []),
        ...(withQa.qa?.failures || []),
        ...(withQa.gate?.failures || [])
      ]
    })
    Object.assign(candidate, withQa)
    evaluatedCandidates.push(candidate)
    return candidate
  }
  for (const candidate of allCandidates) await evaluateGeneratedCandidate(candidate)
  for (const candidate of allCandidates) await persistCandidate(candidate)
  let selected = selectBestPassingCandidate({ candidates: evaluatedCandidates })
  if (!selected) {
    const repairCodes = unique(failureCodes)
    const archiveRelativePath = String(await archiveCandidateRevision({ actionId, reasonCodes: repairCodes }) || '').replace(/\\/g, '/')
    if (archiveRelativePath) {
      if (archiveRelativePath.startsWith('/') || /^[a-zA-Z]:\//.test(archiveRelativePath) || archiveRelativePath.split('/').includes('..')) {
        throw new Error('Quality-first candidate archive returned an unsafe relative path')
      }
      for (const candidate of allCandidates) {
        if (!candidate.candidateRecordRelativePath) continue
        candidate.candidateRecordRelativePath = `${archiveRelativePath}/${candidate.candidateId}/candidate.json`
      }
    }
    const repair = await dispatch('repair', repairCodes)
    await evaluateGeneratedCandidate(repair)
    await persistCandidate(repair)
    selected = selectBestPassingCandidate({ candidates: evaluatedCandidates })
  }
  const diversityStatus = distinctCandidates.length >= 2 ? 'sufficient' : 'degraded'
  const warningCodes = diversityStatus === 'degraded' ? ['action_candidate_diversity_insufficient'] : []
  const evidence = {
    diversityStatus,
    warningCodes,
    distinctCandidateCount: distinctCandidates.length,
    evaluatedCandidateCount: evaluatedCandidates.length
  }
  const result = selected
    ? { ok: true, actionId, disposition: 'accepted', selectedCandidateId: selected.candidateId, selectedCandidate: selected, candidates: allCandidates, ...evidence }
    : { ok: false, actionId, disposition: actionId === 'idle' ? 'blocked' : 'omitted', failureCode: 'action_quality_gate_failed', candidates: allCandidates, selectedCandidateId: '', ...evidence }
  return result
}

module.exports = {
  areSpriteCandidatesDuplicates,
  runQualityFirstAction
}
