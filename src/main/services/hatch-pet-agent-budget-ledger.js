const DEFAULT_LIMITS = Object.freeze({
  maxProviderCalls: 72,
  maxPlannerCalls: 34,
  maxEvaluatorCalls: 68,
  maxElapsedMs: 43_200_000,
  maxEstimatedCost: null
})

const createBudgetError = (code, message) => {
  const error = new Error(String(message || code))
  error.code = code
  return error
}

const toBoundedInteger = (value, fallback, minimum = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.trunc(parsed))
    : fallback
}

const normalizeLimits = (value = {}) => ({
  maxProviderCalls: toBoundedInteger(value.maxProviderCalls, DEFAULT_LIMITS.maxProviderCalls, 1),
  maxPlannerCalls: toBoundedInteger(value.maxPlannerCalls, DEFAULT_LIMITS.maxPlannerCalls, 1),
  maxEvaluatorCalls: toBoundedInteger(value.maxEvaluatorCalls, DEFAULT_LIMITS.maxEvaluatorCalls, 1),
  maxElapsedMs: toBoundedInteger(value.maxElapsedMs, DEFAULT_LIMITS.maxElapsedMs, 1),
  maxEstimatedCost: value.maxEstimatedCost == null
    ? null
    : Math.max(0, Number(value.maxEstimatedCost) || 0)
})

const assertPlanFitsBudget = ({
  dispatchSlots,
  providerTimeoutMs,
  plannerCalls,
  evaluatorCalls,
  structuredTimeoutMs,
  processingReserveMs,
  elapsedLimitMs
} = {}) => {
  const normalizedDispatchSlots = toBoundedInteger(dispatchSlots, 0)
  const normalizedProviderTimeoutMs = toBoundedInteger(providerTimeoutMs, 0)
  const normalizedPlannerCalls = toBoundedInteger(plannerCalls, 0)
  const normalizedEvaluatorCalls = toBoundedInteger(evaluatorCalls, 0)
  const normalizedStructuredTimeoutMs = toBoundedInteger(structuredTimeoutMs, 0)
  const normalizedProcessingReserveMs = toBoundedInteger(processingReserveMs, 0)
  const normalizedElapsedLimitMs = toBoundedInteger(elapsedLimitMs, 0)
  const providerReserveMs = normalizedDispatchSlots * 2 * normalizedProviderTimeoutMs
  const structuredReserveMs = (
    normalizedPlannerCalls + normalizedEvaluatorCalls
  ) * normalizedStructuredTimeoutMs
  const requiredRunBudgetMs = providerReserveMs + structuredReserveMs + normalizedProcessingReserveMs
  if (
    normalizedDispatchSlots < 1 ||
    normalizedProviderTimeoutMs < 1 ||
    normalizedElapsedLimitMs < 1 ||
    requiredRunBudgetMs > normalizedElapsedLimitMs
  ) {
    throw createBudgetError(
      'generation_plan_budget_infeasible',
      `Generation plan requires ${requiredRunBudgetMs}ms but only ${normalizedElapsedLimitMs}ms is available`
    )
  }
  return Object.freeze({
    providerReserveMs,
    structuredReserveMs,
    processingReserveMs: normalizedProcessingReserveMs,
    requiredRunBudgetMs,
    elapsedLimitMs: normalizedElapsedLimitMs,
    varianceMs: normalizedElapsedLimitMs - requiredRunBudgetMs
  })
}

const createBudgetLedger = ({ limits = DEFAULT_LIMITS, startedAtMs, now = Date.now } = {}) => {
  const normalizedStartedAtMs = toBoundedInteger(startedAtMs, toBoundedInteger(now(), Date.now()))
  return Object.freeze({
    version: 1,
    startedAtMs: normalizedStartedAtMs,
    limits: Object.freeze(normalizeLimits(limits)),
    usage: Object.freeze({
      providerCalls: 0,
      plannerCalls: 0,
      evaluatorCalls: 0,
      estimatedCost: 0,
      costKnown: true
    }),
    reservations: Object.freeze({})
  })
}

const assertElapsedBudget = (ledger, now) => {
  const elapsedMs = Math.max(0, toBoundedInteger(now(), ledger.startedAtMs) - ledger.startedAtMs)
  if (elapsedMs >= ledger.limits.maxElapsedMs) {
    throw createBudgetError('hatch_pet_elapsed_budget_exhausted', 'Hatch-pet elapsed-time budget is exhausted')
  }
  return elapsedMs
}

const updateLedger = (ledger, changes) => Object.freeze({
  ...ledger,
  ...changes,
  limits: Object.freeze({ ...ledger.limits, ...(changes.limits || {}) }),
  usage: Object.freeze({ ...ledger.usage, ...(changes.usage || {}) }),
  reservations: changes.reservations
    ? Object.freeze({ ...changes.reservations })
    : ledger.reservations
})

const reserveProviderCall = (ledger, { timeoutMs, now = Date.now } = {}) => {
  assertElapsedBudget(ledger, now)
  const reservations = Object.values(ledger.reservations).filter((entry) => entry.type === 'provider')
  if (ledger.usage.providerCalls + reservations.length >= ledger.limits.maxProviderCalls) {
    throw createBudgetError('hatch_pet_provider_call_budget_exhausted', 'Hatch-pet Provider-call budget is exhausted')
  }
  const reservationId = `provider-${ledger.usage.providerCalls + reservations.length + 1}`
  return {
    reservationId,
    ledger: updateLedger(ledger, {
      reservations: {
        ...ledger.reservations,
        [reservationId]: Object.freeze({
          type: 'provider',
          timeoutMs: toBoundedInteger(timeoutMs, 0),
          reservedAtMs: toBoundedInteger(now(), ledger.startedAtMs)
        })
      }
    })
  }
}

const recordProviderCall = (ledger, reservationId, { ok = false, code = '', estimatedCost = null, now = Date.now } = {}) => {
  assertElapsedBudget(ledger, now)
  const reservation = ledger.reservations[reservationId]
  if (!reservation || reservation.type !== 'provider') {
    throw createBudgetError('hatch_pet_budget_reservation_invalid', 'Provider-call reservation is invalid')
  }
  const nextReservations = { ...ledger.reservations }
  delete nextReservations[reservationId]
  const numericCost = estimatedCost == null ? null : Number(estimatedCost)
  const costKnown = ledger.usage.costKnown && (estimatedCost == null || Number.isFinite(numericCost))
  const nextCost = Number.isFinite(numericCost)
    ? ledger.usage.estimatedCost + Math.max(0, numericCost)
    : ledger.usage.estimatedCost
  if (ledger.limits.maxEstimatedCost != null && nextCost > ledger.limits.maxEstimatedCost) {
    throw createBudgetError('hatch_pet_cost_budget_exhausted', 'Hatch-pet estimated-cost budget is exhausted')
  }
  return updateLedger(ledger, {
    usage: {
      ...ledger.usage,
      providerCalls: ledger.usage.providerCalls + 1,
      providerFailures: (ledger.usage.providerFailures || 0) + (ok ? 0 : 1),
      lastProviderCode: String(code || '').slice(0, 80),
      estimatedCost: nextCost,
      costKnown
    },
    reservations: nextReservations
  })
}

const reconcileAbandonedProviderReservations = (ledger, { preserveReservationIds = [] } = {}) => {
  const preserved = new Set(preserveReservationIds.map(String))
  const abandoned = Object.entries(ledger.reservations || {})
    .filter(([reservationId, reservation]) => reservation?.type === 'provider' && !preserved.has(reservationId))
  if (abandoned.length === 0) return ledger
  const nextReservations = { ...ledger.reservations }
  for (const [reservationId] of abandoned) delete nextReservations[reservationId]
  const providerCalls = Math.min(ledger.limits.maxProviderCalls, ledger.usage.providerCalls + abandoned.length)
  const reconciledCount = Math.max(0, providerCalls - ledger.usage.providerCalls)
  return updateLedger(ledger, {
    usage: {
      ...ledger.usage,
      providerCalls,
      providerFailures: (ledger.usage.providerFailures || 0) + reconciledCount,
      lastProviderCode: 'abandoned-provider-reservation',
      costKnown: false
    },
    reservations: nextReservations
  })
}

const reserveStructuredCall = (ledger, type, now) => {
  assertElapsedBudget(ledger, now)
  const usageKey = type === 'planner' ? 'plannerCalls' : 'evaluatorCalls'
  const limitKey = type === 'planner' ? 'maxPlannerCalls' : 'maxEvaluatorCalls'
  if (ledger.usage[usageKey] >= ledger.limits[limitKey]) {
    throw createBudgetError(
      type === 'planner' ? 'hatch_pet_planner_call_budget_exhausted' : 'hatch_pet_evaluator_call_budget_exhausted',
      `Hatch-pet ${type} call budget is exhausted`
    )
  }
  return updateLedger(ledger, {
    usage: { ...ledger.usage, [usageKey]: ledger.usage[usageKey] + 1 }
  })
}

const reservePlannerCall = (ledger, { now = Date.now } = {}) => reserveStructuredCall(ledger, 'planner', now)
const reserveEvaluatorCall = (ledger, { now = Date.now } = {}) => reserveStructuredCall(ledger, 'evaluator', now)

const createBudgetPublicView = (ledger, { now = Date.now } = {}) => {
  const elapsedMs = Math.max(0, toBoundedInteger(now(), ledger.startedAtMs) - ledger.startedAtMs)
  return Object.freeze({
    version: ledger.version,
    limits: Object.freeze({ ...ledger.limits }),
    usage: Object.freeze({ ...ledger.usage, elapsedMs }),
    remaining: Object.freeze({
      providerCalls: Math.max(0, ledger.limits.maxProviderCalls - ledger.usage.providerCalls),
      plannerCalls: Math.max(0, ledger.limits.maxPlannerCalls - ledger.usage.plannerCalls),
      evaluatorCalls: Math.max(0, ledger.limits.maxEvaluatorCalls - ledger.usage.evaluatorCalls),
      elapsedMs: Math.max(0, ledger.limits.maxElapsedMs - elapsedMs)
    })
  })
}

module.exports = {
  DEFAULT_LIMITS,
  assertPlanFitsBudget,
  createBudgetLedger,
  createBudgetPublicView,
  recordProviderCall,
  reconcileAbandonedProviderReservations,
  reserveEvaluatorCall,
  reservePlannerCall,
  reserveProviderCall
}
