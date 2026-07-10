const { OFFICIAL_FULL_PET_ACTION_IDS } = require('./full-pet-row-contract')

const FULL_PET_ACTION_SUPPORT = Object.freeze({
  REQUIRED_REAL: 'required-real',
  OPTIONAL_ATTEMPTED_REAL: 'optional-attempted-real',
  FALLBACK_ONLY: 'fallback-only'
})

const createActionPolicyEntry = (value) => Object.freeze(value)

const FULL_PET_ACTION_POLICY = Object.freeze([
  ...OFFICIAL_FULL_PET_ACTION_IDS.map((actionId, index) => (
    createActionPolicyEntry({
      actionId,
      support: FULL_PET_ACTION_SUPPORT.REQUIRED_REAL,
      attemptGeneratedPose: true,
      expansionRank: index + 1
    })
  ))
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
        fallback: Boolean(row?.fallback),
        quality: normalizeActionId(row?.quality)
      })).filter((row) => row.actionId)
    : []
)

const isOfficialRealRow = (row) => (
  row &&
  row.fallback !== true &&
  (row.quality === 'row-real' || row.quality === 'approved-mirror')
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
    normalizedRows.filter(isOfficialRealRow).map((row) => row.actionId)
  )
  const fallbackActionIds = createUniqueActionIdList(
    normalizedRows.filter((row) => row.fallback).map((row) => row.actionId)
  )
  const previewFallbackActionIds = fallbackActionIds.slice()
  const requiredOfficialActionIds = OFFICIAL_FULL_PET_ACTION_IDS.slice()
  const missingRequiredOfficialActionIds = requiredOfficialActionIds.filter((actionId) => !realActionIds.includes(actionId))
  return {
    baseIdentityCoverage: normalizedRows.some((row) => row.actionId === 'idle' && row.sourceRelativePath),
    requiredRealActionIds: REQUIRED_REAL_FULL_PET_ACTION_IDS.slice(),
    realActionIds,
    fallbackActionIds,
    missingRequiredActionIds: getMissingRequiredRealActionIds({
      requiredRealActionIds: REQUIRED_REAL_FULL_PET_ACTION_IDS,
      realActionIds
    }),
    requiredOfficialActionIds,
    previewFallbackActionIds,
    missingRequiredOfficialActionIds,
    rows: normalizedRows
  }
}

module.exports = {
  FALLBACK_ONLY_FULL_PET_ACTION_IDS,
  FULL_PET_ACTION_POLICY,
  FULL_PET_ACTION_SUPPORT,
  OFFICIAL_FULL_PET_ACTION_IDS,
  OPTIONAL_ATTEMPTED_REAL_FULL_PET_ACTION_IDS,
  REQUIRED_REAL_FULL_PET_ACTION_IDS,
  GENERATED_FULL_PET_ACTION_IDS,
  createBasicActionCoverage,
  getMissingRequiredRealActionIds
}
