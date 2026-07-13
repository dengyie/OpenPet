const { OFFICIAL_FULL_PET_ACTION_IDS } = require('./full-pet-row-contract')

const FULL_PET_ACTION_SUPPORT = Object.freeze({
  REQUIRED_REAL: 'required-real',
  OPTIONAL_ATTEMPTED_REAL: 'optional-attempted-real',
  FALLBACK_ONLY: 'fallback-only'
})

const DIRECTIONAL_FULL_PET_ACTION_PAIRS = Object.freeze([
  Object.freeze({ sourceActionId: 'running-right', derivedActionId: 'running-left' })
])

const createActionPolicyEntry = (value) => Object.freeze(value)

const FULL_PET_ACTION_POLICY = Object.freeze([
  ...OFFICIAL_FULL_PET_ACTION_IDS.map((actionId, index) => (
    createActionPolicyEntry({
      actionId,
      support: actionId === 'idle'
        ? FULL_PET_ACTION_SUPPORT.REQUIRED_REAL
        : FULL_PET_ACTION_SUPPORT.OPTIONAL_ATTEMPTED_REAL,
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

const OPTIONAL_REAL_FULL_PET_ACTION_IDS = Object.freeze(
  OFFICIAL_FULL_PET_ACTION_IDS.filter((actionId) => actionId !== 'idle')
)

const FALLBACK_ONLY_FULL_PET_ACTION_IDS = Object.freeze(
  FULL_PET_ACTION_POLICY
    .filter((entry) => entry.support === FULL_PET_ACTION_SUPPORT.FALLBACK_ONLY)
    .map((entry) => entry.actionId)
)

const GENERATED_FULL_PET_ACTION_IDS = Object.freeze(
  FULL_PET_ACTION_POLICY
    .filter((entry) => entry.attemptGeneratedPose && entry.actionId !== 'running-left')
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
  const requiredRealActionIds = Array.isArray(basicActions?.requiredActionIds)
    ? createUniqueActionIdList(basicActions.requiredActionIds)
    : Array.isArray(basicActions?.requiredRealActionIds)
      ? createUniqueActionIdList(basicActions.requiredRealActionIds)
      : createUniqueActionIdList(defaultRequiredActionIds)
  if (requiredRealActionIds.length === 0) return []

  const realActionIds = new Set(createUniqueActionIdList(
    Array.isArray(basicActions?.availableActionIds)
      ? basicActions.availableActionIds
      : basicActions?.realActionIds
  ))
  const reportedMissingActionIds = createUniqueActionIdList(basicActions?.missingRequiredActionIds)
  const computedMissingActionIds = requiredRealActionIds.filter((actionId) => !realActionIds.has(actionId))
  return createUniqueActionIdList([...reportedMissingActionIds, ...computedMissingActionIds])
}

const createBasicActionCoverage = (rows, attempts = []) => {
  const normalizedRows = normalizeBasicActionRows(rows)
  const realActionIds = createUniqueActionIdList(
    normalizedRows.filter(isOfficialRealRow).map((row) => row.actionId)
  )
  const fallbackActionIds = createUniqueActionIdList(
    normalizedRows.filter((row) => row.fallback).map((row) => row.actionId)
  )
  const previewFallbackActionIds = fallbackActionIds.slice()
  const requiredOfficialActionIds = REQUIRED_REAL_FULL_PET_ACTION_IDS.slice()
  const missingRequiredOfficialActionIds = requiredOfficialActionIds.filter((actionId) => !realActionIds.includes(actionId))
  const attemptsByActionId = new Map(
    (Array.isArray(attempts) ? attempts : [])
      .map((attempt) => [normalizeActionId(attempt?.actionId), attempt])
      .filter(([actionId]) => actionId)
  )
  const rowsByActionId = new Map(normalizedRows.map((row) => [row.actionId, row]))
  const actionAvailability = Object.fromEntries(OFFICIAL_FULL_PET_ACTION_IDS.map((actionId) => {
    const row = rowsByActionId.get(actionId)
    if (isOfficialRealRow(row)) {
      return [actionId, { available: true, quality: row.quality }]
    }
    const directionalPair = DIRECTIONAL_FULL_PET_ACTION_PAIRS.find((pair) => pair.derivedActionId === actionId)
    const attempt = attemptsByActionId.get(actionId) || (
      directionalPair ? attemptsByActionId.get(directionalPair.sourceActionId) : null
    )
    const reason = String(
      attempt?.failureConditions?.[0] ||
      attempt?.quality?.failureConditions?.[0] ||
      attempt?.error ||
      'not-generated'
    ).slice(0, 160)
    return [actionId, { available: false, reason }]
  }))
  const availableActionIds = OFFICIAL_FULL_PET_ACTION_IDS.filter((actionId) => actionAvailability[actionId].available)
  const omittedActionIds = OFFICIAL_FULL_PET_ACTION_IDS.filter((actionId) => !actionAvailability[actionId].available)
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
    officialActionIds: OFFICIAL_FULL_PET_ACTION_IDS.slice(),
    availableActionIds,
    omittedActionIds,
    actionAvailability,
    rows: normalizedRows
  }
}

module.exports = {
  FALLBACK_ONLY_FULL_PET_ACTION_IDS,
  DIRECTIONAL_FULL_PET_ACTION_PAIRS,
  FULL_PET_ACTION_POLICY,
  FULL_PET_ACTION_SUPPORT,
  OFFICIAL_FULL_PET_ACTION_IDS,
  OPTIONAL_ATTEMPTED_REAL_FULL_PET_ACTION_IDS,
  OPTIONAL_REAL_FULL_PET_ACTION_IDS,
  REQUIRED_REAL_FULL_PET_ACTION_IDS,
  GENERATED_FULL_PET_ACTION_IDS,
  createBasicActionCoverage,
  getMissingRequiredRealActionIds
}
