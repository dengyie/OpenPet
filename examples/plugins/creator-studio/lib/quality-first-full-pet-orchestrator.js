const crypto = require('node:crypto')

const ACTION_ORDER = Object.freeze(['idle', 'running-right', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'])
const normalizeId = (value) => String(value || '').trim()
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const unique = (values = []) => [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(normalizeId))]

const assertCanonicalPool = (pool) => {
  const candidates = Array.isArray(pool?.candidates) ? pool.candidates : []
  const eligible = candidates.filter((candidate) => candidate?.eligible === true)
  const distinctHashes = new Set(eligible.map((candidate) => String(candidate.sha256 || candidate.candidateId || '')))
  if (eligible.length < 3 || distinctHashes.size < 3 || Number(pool?.dispatchCount || 0) > 4) {
    const error = new Error('canonical_candidate_diversity_insufficient')
    error.code = 'canonical_candidate_diversity_insufficient'
    throw error
  }
  return candidates.map((candidate) => ({
    candidateId: normalizeId(candidate.candidateId),
    eligible: candidate.eligible === true,
    sha256: String(candidate.sha256 || ''),
    score: Number(candidate.score) || 0,
    failureCodes: unique(candidate.failureCodes),
    ...(candidate.relativePath ? { relativePath: String(candidate.relativePath).replace(/\\/g, '/') } : {}),
    ...(candidate.promptRelativePath ? { promptRelativePath: String(candidate.promptRelativePath).replace(/\\/g, '/') } : {}),
    ...(candidate.model ? { model: String(candidate.model).slice(0, 160) } : {}),
    ...(candidate.candidateRecordRelativePath ? { candidateRecordRelativePath: String(candidate.candidateRecordRelativePath).replace(/\\/g, '/') } : {}),
    ...(candidate.canonicalMetrics ? { canonicalMetrics: candidate.canonicalMetrics } : {}),
    ...(candidate.descriptors ? { descriptors: candidate.descriptors } : {}),
    ...(candidate.evaluation ? { evaluation: candidate.evaluation } : {}),
    ...(candidate.gate ? { gate: candidate.gate } : {}),
    ...(candidate.evaluationEvidenceRelativePath ? { evaluationEvidenceRelativePath: String(candidate.evaluationEvidenceRelativePath).replace(/\\/g, '/') } : {})
  }))
}

const publicActionResult = (result) => ({
  ok: result?.ok === true,
  actionId: normalizeId(result?.actionId),
  disposition: String(result?.disposition || ''),
  selectedCandidateId: normalizeId(result?.selectedCandidateId),
  failureCode: String(result?.failureCode || ''),
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
  now = () => new Date().toISOString()
} = {}) => {
  if (typeof generateCanonicalCandidatePool !== 'function' || typeof runQualityFirstAction !== 'function' || typeof createCharacterScaleProfile !== 'function') {
    throw new Error('Quality-first full-pet orchestrator requires canonical, action, and scale-profile callbacks')
  }

  const start = async ({ run, plan, sourceReference } = {}) => {
    const pool = await generateCanonicalCandidatePool({ run, plan, sourceReference })
    const candidates = assertCanonicalPool(pool)
    const startedAt = now()
    return {
      ...run,
      status: 'awaiting_identity_review',
      currentStep: 'identity-review',
      updatedAt: startedAt,
      reviewStatus: 'identity-pending',
      qualityFirst: {
        version: 1,
        phase: 'awaiting_identity_review',
        planHash: String(plan?.hash || hash(plan || {})),
        canonicalCandidates: candidates,
        acceptedCanonical: null,
        actionResults: {},
        nextAction: 'accept-canonical-identity'
      }
    }
  }

  const acceptCanonicalIdentity = async ({ run, candidateId, sha256, plan, actions = [], persistRunState = async () => {} } = {}) => {
    const state = run?.qualityFirst
    if (!state || state.phase !== 'awaiting_identity_review') throw new Error('Canonical identity review is not pending')
    const candidate = state.canonicalCandidates.find((entry) => entry.candidateId === normalizeId(candidateId))
    if (!candidate || candidate.eligible !== true || candidate.sha256 !== String(sha256 || '')) throw new Error('Canonical identity candidate is not eligible or hash does not match')
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
        acceptedCanonical: candidate,
        nextAction: 'generate-idle'
      }
    }
    await persistRunState(acceptedRun)
    const idle = await runQualityFirstAction({ actionId: 'idle', plan, canonical: candidate })
    await persistActionResult({ actionId: 'idle', result: idle, canonical: candidate, profile: null })
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
    const profile = await createCharacterScaleProfile({ canonical: candidate, idle })
    await persistScaleProfile({ profile, canonical: candidate, idle })
    await persistActionResult({ actionId: 'idle', result: idle, canonical: candidate, profile })
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
      const result = await runQualityFirstAction({ actionId, plan, canonical: candidate, profile })
      await persistActionResult({ actionId, result, canonical: candidate, profile })
      actionResults[actionId] = publicActionResult(result)
      if (actionId === 'running-right' && result?.ok && typeof mirrorRunningLeft === 'function') {
        const mirrored = await mirrorRunningLeft({ source: result, profile, canonical: candidate })
        await persistActionResult({ actionId: 'running-left', result: mirrored, canonical: candidate, profile })
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
    const packageResult = await finalizePackage({ run: durableRun, canonical: candidate, profile, actionResults })
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

  return { start, acceptCanonicalIdentity }
}

module.exports = {
  ACTION_ORDER,
  createQualityFirstFullPetOrchestrator
}
