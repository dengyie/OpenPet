const crypto = require('node:crypto')
const {
  createCandidateSelection,
  normalizeStoredCandidateDecision
} = require('./candidate-decision')

const ACTION_ORDER = Object.freeze(['idle', 'running-right', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'])
const normalizeId = (value) => String(value || '').trim()
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const unique = (values = []) => [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(normalizeId))]

const normalizeSafeRelativePath = (value) => {
  const normalized = String(value || '').trim().replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(normalized)) return ''
  if (normalized.split('/').some((segment) => segment === '..')) return ''
  return normalized
}

const publicCanonicalCandidate = (candidate = {}) => {
  const relativePath = normalizeSafeRelativePath(candidate.relativePath)
  const promptRelativePath = normalizeSafeRelativePath(candidate.promptRelativePath)
  const candidateRecordRelativePath = normalizeSafeRelativePath(candidate.candidateRecordRelativePath)
  const evaluationEvidenceRelativePath = normalizeSafeRelativePath(candidate.evaluationEvidenceRelativePath)
  const normalized = normalizeStoredCandidateDecision(candidate)
  return {
    candidateId: normalizeId(candidate.candidateId),
    eligible: normalized.recommended,
    sha256: String(candidate.sha256 || '').slice(0, 128),
    score: Number(candidate.score) || 0,
    disposition: String(candidate.disposition || ''),
    technicalEligible: normalized.technicalEligible,
    recommended: normalized.recommended,
    technicalFailureCodes: normalized.technicalFailureCodes,
    qualityWarningCodes: normalized.qualityWarningCodes,
    failureCodes: unique(candidate.failureCodes).slice(0, 32),
    ...(candidate.attemptKind ? { attemptKind: String(candidate.attemptKind).slice(0, 80) } : {}),
    ...(candidate.diversityProfileId ? { diversityProfileId: String(candidate.diversityProfileId).slice(0, 120) } : {}),
    ...(candidate.duplicateOfCandidateId ? { duplicateOfCandidateId: normalizeId(candidate.duplicateOfCandidateId).slice(0, 128) } : {}),
    ...(candidate.duplicateOfSha256 ? { duplicateOfSha256: String(candidate.duplicateOfSha256).slice(0, 128) } : {}),
    ...(relativePath ? { relativePath } : {}),
    ...(promptRelativePath ? { promptRelativePath } : {}),
    ...(candidate.model ? { model: String(candidate.model).slice(0, 160) } : {}),
    ...(candidateRecordRelativePath ? { candidateRecordRelativePath } : {}),
    ...(candidate.canonicalMetrics ? { canonicalMetrics: candidate.canonicalMetrics } : {}),
    ...(candidate.descriptors ? { descriptors: candidate.descriptors } : {}),
    ...(candidate.evaluation ? { evaluation: candidate.evaluation } : {}),
    ...(candidate.gate ? { gate: candidate.gate } : {}),
    ...(candidate.selection ? { selection: candidate.selection } : {}),
    ...(evaluationEvidenceRelativePath ? { evaluationEvidenceRelativePath } : {})
  }
}

const assertCanonicalPool = (pool) => {
  const candidates = Array.isArray(pool?.candidates) ? pool.candidates : []
  const publicCandidates = candidates.map(publicCanonicalCandidate)
  const technicalCandidates = publicCandidates.filter((candidate) => candidate.technicalEligible === true && candidate.sha256)
  const passingCandidates = technicalCandidates.filter((candidate) => candidate.recommended === true)
  if (technicalCandidates.length === 0 || Number(pool?.dispatchCount || 0) > 4) {
    const error = new Error('canonical_identity_candidates_unusable')
    error.code = 'canonical_identity_candidates_unusable'
    error.canonicalPool = {
      dispatchCount: Math.max(0, Math.min(4, Number(pool?.dispatchCount) || candidates.length)),
      passingCandidateCount: 0,
      candidates: publicCandidates.map((candidate) => ({
        ...candidate,
        disposition: candidate.technicalEligible ? 'selectable-with-warning' : 'unusable'
      }))
    }
    throw error
  }
  const ranked = [...passingCandidates].sort((left, right) => {
    const scoreDifference = (Number(right.score) || 0) - (Number(left.score) || 0)
    if (scoreDifference) return scoreDifference
    const identityDifference = (Number(right.evaluation?.scores?.identity) || 0) - (Number(left.evaluation?.scores?.identity) || 0)
    if (identityDifference) return identityDifference
    return left.candidateId.localeCompare(right.candidateId)
  })
  const selectedCandidateId = ranked[0]?.candidateId || ''
  const normalizedCandidates = publicCandidates.map((candidate) => ({
    ...candidate,
    disposition: candidate.technicalEligible !== true
      ? 'unusable'
      : selectedCandidateId && candidate.candidateId === selectedCandidateId
        ? 'selected-anchor'
        : candidate.recommended === true
          ? (candidate.duplicateOfCandidateId ? 'duplicate-alternate' : 'alternate')
          : 'selectable-with-warning'
  }))
  const selectedCanonical = normalizedCandidates.find((candidate) => candidate.candidateId === selectedCandidateId) || null
  if (selectedCanonical) {
    selectedCanonical.selection = createCandidateSelection({
      candidate: selectedCanonical,
      expectedHash: selectedCanonical.sha256,
      authority: 'automatic'
    })
  }
  return {
    candidates: normalizedCandidates,
    selectedCanonical,
    passingCandidateCount: passingCandidates.length
  }
}

const publicActionResult = (result) => ({
  ok: result?.ok === true,
  actionId: normalizeId(result?.actionId),
  disposition: String(result?.disposition || ''),
  selectedCandidateId: normalizeId(result?.selectedCandidateId),
  failureCode: String(result?.failureCode || ''),
  diversityStatus: result?.diversityStatus === 'degraded' ? 'degraded' : 'sufficient',
  warningCodes: unique(result?.warningCodes).slice(0, 16),
  distinctCandidateCount: Math.max(0, Number(result?.distinctCandidateCount) || 0),
  evaluatedCandidateCount: Math.max(0, Number(result?.evaluatedCandidateCount) || 0),
  candidates: Array.isArray(result?.candidates) ? result.candidates.map((candidate) => ({
    candidateId: normalizeId(candidate?.candidateId),
    attemptKind: String(candidate?.attemptKind || ''),
    ok: candidate?.qa?.ok === true && candidate?.gate?.ok === true,
    failureCodes: unique([...(candidate?.qa?.failures || []), ...(candidate?.gate?.failures || []), ...(candidate?.failureCodes || [])]),
    score: Number(candidate?.evaluation?.scores?.overall) || 0,
    candidateRecordRelativePath: String(candidate?.candidateRecordRelativePath || '').replace(/\\/g, '/')
  })) : []
})

const createQualityFirstFullPetOrchestrator = ({
  generateCanonicalCandidatePool,
  runQualityFirstAction,
  createCharacterScaleProfile,
  mirrorRunningLeft,
  persistActionResult = async () => {},
  persistScaleProfile = async () => {},
  finalizePackage = async () => null,
  createRecoveryBundle = async () => null,
  recordEvent = () => {},
  now = () => new Date().toISOString()
} = {}) => {
  if (typeof generateCanonicalCandidatePool !== 'function' || typeof runQualityFirstAction !== 'function' || typeof createCharacterScaleProfile !== 'function') {
    throw new Error('Quality-first full-pet orchestrator requires canonical, action, and scale-profile callbacks')
  }

  const start = async ({
    run,
    plan,
    sourceReference,
    actions = [],
    requireIdentityReviewBeforeActions = false,
    persistRunState = async () => {}
  } = {}) => {
    recordEvent({ scope: 'identity', status: 'started', runId: normalizeId(run?.runId) })
    let pool
    try {
      pool = await generateCanonicalCandidatePool({ run, plan, sourceReference })
    } catch (error) {
      recordEvent({ scope: 'identity', status: 'failed', runId: normalizeId(run?.runId), failureCode: String(error?.code || 'identity_generation_error'), message: String(error?.message || error).slice(0, 240) })
      throw error
    }
    const selection = assertCanonicalPool(pool)
    const candidates = selection.candidates
    recordEvent({ scope: 'identity', status: 'completed', runId: normalizeId(run?.runId), candidateCount: candidates.length })
    const startedAt = now()
    const identityReviewRequired = requireIdentityReviewBeforeActions || !selection.selectedCanonical
    const selectedRun = {
      ...run,
      status: identityReviewRequired ? 'awaiting_identity_review' : 'generating',
      currentStep: identityReviewRequired ? 'identity-review' : 'idle',
      updatedAt: startedAt,
      reviewStatus: identityReviewRequired ? 'identity-pending' : 'pending',
      qualityFirst: {
        version: 1,
        phase: identityReviewRequired ? 'awaiting_identity_review' : 'canonical-selected',
        planHash: String(plan?.hash || hash(plan || {})),
        canonicalCandidates: candidates,
        selectedCanonical: selection.selectedCanonical,
        acceptedCanonical: identityReviewRequired ? null : selection.selectedCanonical,
        actionResults: {},
        passingCandidateCount: selection.passingCandidateCount,
        requireIdentityReviewBeforeActions: identityReviewRequired,
        nextAction: identityReviewRequired ? 'accept-canonical-identity' : 'generate-idle'
      }
    }
    if (identityReviewRequired) return selectedRun
    return continueWithCanonicalIdentity({
      run: selectedRun,
      candidate: selection.selectedCanonical,
      plan,
      actions,
      persistRunState
    })
  }

  const continueWithCanonicalIdentity = async ({ run, candidate, plan, actions = [], persistRunState = async () => {} } = {}) => {
    const state = run?.qualityFirst || {}
    const canonicalCandidates = Array.isArray(state.canonicalCandidates)
      ? state.canonicalCandidates.map((entry) => ({
          ...entry,
          ...(entry.candidateId === candidate.candidateId ? candidate : {}),
          disposition: entry.candidateId === candidate.candidateId
            ? 'selected-anchor'
            : entry.recommended === true || entry.eligible === true
              ? (entry.duplicateOfCandidateId ? 'duplicate-alternate' : 'alternate')
              : entry.technicalEligible === true
                ? 'selectable-with-warning'
                : 'unusable'
        }))
      : []
    const selectedCandidate = canonicalCandidates.find((entry) => entry.candidateId === candidate.candidateId) || candidate
    const acceptedAt = now()
    const acceptedRun = {
      ...run,
      status: 'generating',
      currentStep: 'idle',
      updatedAt: acceptedAt,
      reviewStatus: 'pending',
      qualityFirst: {
        ...state,
        phase: 'generating-idle',
        canonicalCandidates,
        selectedCanonical: selectedCandidate,
        acceptedCanonical: selectedCandidate,
        nextAction: 'generate-idle'
      }
    }
    await persistRunState(acceptedRun)
    const runActionWithEvents = async ({ actionId, profile = null }) => {
      recordEvent({ scope: 'action', status: 'started', runId: normalizeId(run?.runId), actionId })
      try {
        const result = await runQualityFirstAction({ actionId, plan, canonical: selectedCandidate, profile })
        recordEvent({
          scope: 'action',
          status: result?.ok === true ? 'completed' : 'failed',
          runId: normalizeId(run?.runId),
          actionId,
          candidateCount: Array.isArray(result?.candidates) ? result.candidates.length : 0,
          diversityStatus: result?.diversityStatus === 'degraded' ? 'degraded' : 'sufficient',
          warningCodes: unique(result?.warningCodes).slice(0, 16),
          distinctCandidateCount: Math.max(0, Number(result?.distinctCandidateCount) || 0),
          evaluatedCandidateCount: Math.max(0, Number(result?.evaluatedCandidateCount) || 0),
          ...(result?.ok === true ? {} : { failureCode: String(result?.failureCode || 'action_quality_gate_failed'), message: String(result?.failureCode || 'action quality gate failed') })
        })
        return result
      } catch (error) {
        recordEvent({ scope: 'action', status: 'failed', runId: normalizeId(run?.runId), actionId, failureCode: String(error?.code || 'action_generation_error'), message: String(error?.message || error).slice(0, 240) })
        throw error
      }
    }
    const idle = await runActionWithEvents({ actionId: 'idle' })
    await persistActionResult({ actionId: 'idle', result: idle, canonical: selectedCandidate, profile: null })
    const actionResults = { idle: publicActionResult(idle) }
    let durableRun = {
      ...acceptedRun,
      qualityFirst: { ...acceptedRun.qualityFirst, actionResults }
    }
    await persistRunState(durableRun)
    if (!idle?.ok) {
      const recovery = await createRecoveryBundle({ run: durableRun, actionResults, reason: 'idle_generation_failed' })
      durableRun = {
        ...durableRun,
        status: 'recovery-required',
        currentStep: 'recovery',
        updatedAt: now(),
        reviewStatus: 'recovery-required',
        qualityFirst: { ...durableRun.qualityFirst, phase: 'recovery-required', actionResults, nextAction: 'export-recovery-bundle', recovery }
      }
      await persistRunState(durableRun)
      return durableRun
    }
    const profile = await createCharacterScaleProfile({ canonical: selectedCandidate, idle })
    await persistScaleProfile({ profile, canonical: selectedCandidate, idle })
    await persistActionResult({ actionId: 'idle', result: idle, canonical: selectedCandidate, profile })
    actionResults.idle = { ...publicActionResult(idle), scaleProfileHash: profile.hash }
    const requestedActions = unique(actions.length ? actions : ACTION_ORDER)
    const orderedActions = ACTION_ORDER.filter((actionId) => requestedActions.includes(actionId) && actionId !== 'idle')
    durableRun = {
      ...durableRun,
      currentStep: orderedActions[0] || 'final-package',
      qualityFirst: {
        ...durableRun.qualityFirst,
        phase: 'generating-actions',
        actionResults,
        scaleProfileHash: profile.hash,
        nextAction: orderedActions[0] || 'finalize-package'
      }
    }
    await persistRunState(durableRun)
    for (const [actionIndex, actionId] of orderedActions.entries()) {
      if (actionId === 'running-left') continue
      durableRun = {
        ...durableRun,
        currentStep: actionId,
        updatedAt: now(),
        qualityFirst: { ...durableRun.qualityFirst, actionResults, nextAction: actionId }
      }
      await persistRunState(durableRun)
      const result = await runActionWithEvents({ actionId, profile })
      await persistActionResult({ actionId, result, canonical: selectedCandidate, profile })
      actionResults[actionId] = publicActionResult(result)
      if (actionId === 'running-right' && result?.ok && typeof mirrorRunningLeft === 'function') {
        const mirrored = await mirrorRunningLeft({ source: result, profile, canonical: selectedCandidate })
        await persistActionResult({ actionId: 'running-left', result: mirrored, canonical: selectedCandidate, profile })
        actionResults['running-left'] = publicActionResult(mirrored)
      }
      const nextAction = orderedActions.slice(actionIndex + 1).find((entry) => entry !== 'running-left') || 'finalize-package'
      durableRun = {
        ...durableRun,
        currentStep: nextAction === 'finalize-package' ? 'final-package' : nextAction,
        updatedAt: now(),
        qualityFirst: { ...durableRun.qualityFirst, actionResults, nextAction }
      }
      await persistRunState(durableRun)
    }
    const failedOptional = Object.entries(actionResults)
      .filter(([actionId, result]) => actionId !== 'idle' && result?.ok !== true)
      .map(([actionId]) => actionId)
    const packageResult = await finalizePackage({ run: durableRun, canonical: selectedCandidate, profile, actionResults })
    if (!packageResult || typeof packageResult !== 'object' || !packageResult.artifacts || typeof packageResult.artifacts !== 'object') {
      const error = new Error('Quality-first final package artifacts are missing')
      error.code = 'quality_first_final_package_missing'
      throw error
    }
    const { artifacts: packageArtifacts, ...publicPackageResult } = packageResult && typeof packageResult === 'object'
      ? packageResult
      : {}
    return {
      ...durableRun,
      ...(packageArtifacts && typeof packageArtifacts === 'object'
        ? { artifacts: { ...(durableRun.artifacts || {}), ...packageArtifacts } }
        : {}),
      status: 'ready_for_review',
      currentStep: 'review',
      updatedAt: now(),
      reviewStatus: 'pending',
      qualityFirst: {
        ...durableRun.qualityFirst,
        phase: 'ready_for_review',
        actionResults,
        scaleProfileHash: profile.hash,
        omittedActionIds: failedOptional,
        ...(packageResult ? { package: publicPackageResult } : {}),
        nextAction: 'human-review'
      }
    }
  }

  const acceptCanonicalIdentity = async ({
    run,
    candidateId,
    sha256,
    qualityOverride = false,
    acknowledgedWarningCodes = [],
    plan,
    actions = [],
    persistRunState = async () => {}
  } = {}) => {
    const state = run?.qualityFirst
    if (!state || state.phase !== 'awaiting_identity_review') throw new Error('Canonical identity review is not pending')
    const candidate = state.canonicalCandidates.find((entry) => entry.candidateId === normalizeId(candidateId))
    if (!candidate) throw new Error('Canonical identity candidate is not eligible or hash does not match')
    const normalizedCandidate = publicCanonicalCandidate(candidate)
    let selection
    try {
      selection = createCandidateSelection({
        candidate: normalizedCandidate,
        expectedHash: sha256,
        authority: 'human-override',
        qualityOverride,
        acknowledgedWarningCodes,
        now
      })
    } catch (error) {
      error.message = `Canonical identity candidate is not eligible or hash does not match: ${error.message}`
      throw error
    }
    return continueWithCanonicalIdentity({
      run,
      candidate: { ...normalizedCandidate, selection },
      plan,
      actions,
      persistRunState
    })
  }

  return { start, acceptCanonicalIdentity, continueWithCanonicalIdentity }
}

module.exports = {
  ACTION_ORDER,
  createQualityFirstFullPetOrchestrator
}
