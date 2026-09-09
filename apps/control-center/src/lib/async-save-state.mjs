const equalValue = (left, right) => JSON.stringify(left) === JSON.stringify(right)

export const mergeSavedFields = ({ current, submitted, saved, fields = Object.keys(submitted || {}) }) => {
  const next = structuredClone(current)
  for (const field of fields) {
    if (!Object.hasOwn(saved || {}, field)) continue
    if (equalValue(current?.[field], submitted?.[field])) {
      next[field] = structuredClone(saved[field])
    }
  }
  return next
}

export const shouldApplySaveResponse = (responseRevision, appliedRevision) => (
  Number(responseRevision) >= Number(appliedRevision)
)
