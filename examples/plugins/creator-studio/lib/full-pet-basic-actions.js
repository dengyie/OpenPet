const FULL_PET_ACTION_SUPPORT = Object.freeze({
  REQUIRED_REAL: 'required-real',
  OPTIONAL_ATTEMPTED_REAL: 'optional-attempted-real',
  FALLBACK_ONLY: 'fallback-only'
})

const createActionPolicyEntry = (value) => Object.freeze(value)

const FULL_PET_ACTION_POLICY = Object.freeze([
  createActionPolicyEntry({ actionId: 'idle', support: FULL_PET_ACTION_SUPPORT.REQUIRED_REAL, attemptGeneratedPose: false, expansionRank: 0 }),
  createActionPolicyEntry({ actionId: 'waving', support: FULL_PET_ACTION_SUPPORT.REQUIRED_REAL, attemptGeneratedPose: true, expansionRank: 0 }),
  createActionPolicyEntry({ actionId: 'waiting', support: FULL_PET_ACTION_SUPPORT.OPTIONAL_ATTEMPTED_REAL, attemptGeneratedPose: false, expansionRank: 1 }),
  createActionPolicyEntry({ actionId: 'running-right', support: FULL_PET_ACTION_SUPPORT.OPTIONAL_ATTEMPTED_REAL, attemptGeneratedPose: false, expansionRank: 2 }),
  createActionPolicyEntry({ actionId: 'running-left', support: FULL_PET_ACTION_SUPPORT.OPTIONAL_ATTEMPTED_REAL, attemptGeneratedPose: false, expansionRank: 3 }),
  createActionPolicyEntry({ actionId: 'jumping', support: FULL_PET_ACTION_SUPPORT.FALLBACK_ONLY, attemptGeneratedPose: false, expansionRank: null }),
  createActionPolicyEntry({ actionId: 'failed', support: FULL_PET_ACTION_SUPPORT.FALLBACK_ONLY, attemptGeneratedPose: false, expansionRank: null }),
  createActionPolicyEntry({ actionId: 'running', support: FULL_PET_ACTION_SUPPORT.FALLBACK_ONLY, attemptGeneratedPose: false, expansionRank: null }),
  createActionPolicyEntry({ actionId: 'review', support: FULL_PET_ACTION_SUPPORT.FALLBACK_ONLY, attemptGeneratedPose: false, expansionRank: null })
])

const REQUIRED_REAL_FULL_PET_ACTION_IDS = Object.freeze(
  FULL_PET_ACTION_POLICY
    .filter((entry) => entry.support === FULL_PET_ACTION_SUPPORT.REQUIRED_REAL)
    .map((entry) => entry.actionId)
)

const OPTIONAL_ATTEMPTED_REAL_FULL_PET_ACTION_IDS = Object.freeze(
  FULL_PET_ACTION_POLICY
    .filter((entry) => entry.support === FULL_PET_ACTION_SUPPORT.OPTIONAL_ATTEMPTED_REAL)
    .sort((left, right) => left.expansionRank - right.expansionRank)
    .map((entry) => entry.actionId)
)

const FALLBACK_ONLY_FULL_PET_ACTION_IDS = Object.freeze(
  FULL_PET_ACTION_POLICY
    .filter((entry) => entry.support === FULL_PET_ACTION_SUPPORT.FALLBACK_ONLY)
    .map((entry) => entry.actionId)
)

const GENERATED_FULL_PET_ACTION_IDS = Object.freeze(
  FULL_PET_ACTION_POLICY
    .filter((entry) => entry.attemptGeneratedPose)
    .map((entry) => entry.actionId)
)

const normalizeActionId = (value) => String(value || '').trim()

const createUniqueActionIdList = (values) => {
  const seen = new Set()
  const actionIds = []
  for (const value of Array.isArray(values) ? values : []) {
    const actionId = normalizeActionId(value)
    if (!actionId || seen.has(actionId)) continue
    seen.add(actionId)
    actionIds.push(actionId)
  }
  return actionIds
}

const normalizeBasicActionRows = (rows) => (
  Array.isArray(rows)
    ? rows.map((row) => ({
        actionId: normalizeActionId(row?.actionId),
        sourceActionId: normalizeActionId(row?.sourceActionId),
        sourceRelativePath: normalizeActionId(row?.sourceRelativePath),
        fallback: Boolean(row?.fallback)
      })).filter((row) => row.actionId)
    : []
)

const getMissingRequiredRealActionIds = (basicActions, { defaultRequiredActionIds = [] } = {}) => {
  const requiredRealActionIds = Array.isArray(basicActions?.requiredRealActionIds)
    ? createUniqueActionIdList(basicActions.requiredRealActionIds)
    : createUniqueActionIdList(defaultRequiredActionIds)
  if (requiredRealActionIds.length === 0) return []

  const realActionIds = new Set(createUniqueActionIdList(basicActions?.realActionIds))
  const reportedMissingActionIds = createUniqueActionIdList(basicActions?.missingRequiredActionIds)
  const computedMissingActionIds = requiredRealActionIds.filter((actionId) => !realActionIds.has(actionId))
  return createUniqueActionIdList([...reportedMissingActionIds, ...computedMissingActionIds])
}

const createBasicActionCoverage = (rows) => {
  const normalizedRows = normalizeBasicActionRows(rows)
  const realActionIds = createUniqueActionIdList(
    normalizedRows.filter((row) => !row.fallback).map((row) => row.actionId)
  )
  const fallbackActionIds = createUniqueActionIdList(
    normalizedRows.filter((row) => row.fallback).map((row) => row.actionId)
  )
  return {
    requiredRealActionIds: REQUIRED_REAL_FULL_PET_ACTION_IDS.slice(),
    realActionIds,
    fallbackActionIds,
    missingRequiredActionIds: getMissingRequiredRealActionIds({
      requiredRealActionIds: REQUIRED_REAL_FULL_PET_ACTION_IDS,
      realActionIds
    }),
    rows: normalizedRows
  }
}

module.exports = {
  FALLBACK_ONLY_FULL_PET_ACTION_IDS,
  FULL_PET_ACTION_POLICY,
  FULL_PET_ACTION_SUPPORT,
  OPTIONAL_ATTEMPTED_REAL_FULL_PET_ACTION_IDS,
  REQUIRED_REAL_FULL_PET_ACTION_IDS,
  GENERATED_FULL_PET_ACTION_IDS,
  createBasicActionCoverage,
  getMissingRequiredRealActionIds
}
