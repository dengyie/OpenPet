const test = require('node:test')
const assert = require('node:assert/strict')

const {
  assertPlanFitsBudget,
  createBudgetLedger,
  createBudgetPublicView,
  recordProviderCall,
  reserveEvaluatorCall,
  reservePlannerCall,
  reserveProviderCall
} = require('../../src/main/services/hatch-pet-agent-budget-ledger')

const limits = Object.freeze({
  maxProviderCalls: 72,
  maxPlannerCalls: 34,
  maxEvaluatorCalls: 68,
  maxElapsedMs: 43_200_000,
  maxEstimatedCost: null
})

test('quality-first worst-case plan fits the twelve-hour elapsed budget', () => {
  const evidence = assertPlanFitsBudget({
    dispatchSlots: 36,
    providerTimeoutMs: 480_000,
    plannerCalls: 34,
    evaluatorCalls: 68,
    structuredTimeoutMs: 60_000,
    processingReserveMs: 1_800_000,
    elapsedLimitMs: 43_200_000
  })

  assert.deepEqual(evidence, {
    providerReserveMs: 34_560_000,
    structuredReserveMs: 6_120_000,
    processingReserveMs: 1_800_000,
    requiredRunBudgetMs: 42_480_000,
    elapsedLimitMs: 43_200_000,
    varianceMs: 720_000
  })
})

test('quality-first plan rejects a Provider timeout that cannot fit', () => {
  assert.throws(() => assertPlanFitsBudget({
    dispatchSlots: 36,
    providerTimeoutMs: 900_000,
    plannerCalls: 34,
    evaluatorCalls: 68,
    structuredTimeoutMs: 60_000,
    processingReserveMs: 1_800_000,
    elapsedLimitMs: 43_200_000
  }), (error) => error?.code === 'generation_plan_budget_infeasible')
})

test('budget ledger reserves and records bounded calls without exposing reservation internals', () => {
  let nowMs = 1_000
  let ledger = createBudgetLedger({ limits, startedAtMs: nowMs, now: () => nowMs })
  const provider = reserveProviderCall(ledger, { timeoutMs: 480_000, now: () => nowMs })
  ledger = recordProviderCall(provider.ledger, provider.reservationId, { ok: false, code: 'http-524', now: () => nowMs })
  ledger = reservePlannerCall(ledger, { now: () => nowMs })
  ledger = reserveEvaluatorCall(ledger, { now: () => nowMs })

  const view = createBudgetPublicView(ledger, { now: () => nowMs })
  assert.equal(view.usage.providerCalls, 1)
  assert.equal(view.usage.plannerCalls, 1)
  assert.equal(view.usage.evaluatorCalls, 1)
  assert.equal(view.remaining.providerCalls, 71)
  assert.equal('reservations' in view, false)
})
