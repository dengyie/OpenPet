const REQUIRED_REAL_FULL_PET_ACTION_IDS = Object.freeze(['idle', 'waving'])
const GENERATED_FULL_PET_ACTION_IDS = Object.freeze(
  REQUIRED_REAL_FULL_PET_ACTION_IDS.filter((actionId) => actionId !== 'idle')
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
  REQUIRED_REAL_FULL_PET_ACTION_IDS,
  GENERATED_FULL_PET_ACTION_IDS,
  createBasicActionCoverage,
  getMissingRequiredRealActionIds
}
