const test = require('node:test')
const assert = require('node:assert/strict')

const {
  assertPlanFitsBudget,
  createBudgetLedger,
  createBudgetPublicView,
  reconcileAbandonedProviderReservations,
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

test('recordProviderCall settles a call that finished after the elapsed budget expired', () => {
  let nowMs = 1_000
  let ledger = createBudgetLedger({ limits, startedAtMs: nowMs, now: () => nowMs })
  const provider = reserveProviderCall(ledger, { timeoutMs: 480_000, now: () => nowMs })
  // 调用在预算窗口内发起，但完成时 elapsed 已超限：结算必须成功入账，
  // 否则预约悬挂、真实费用丢账。
  nowMs = 1_000 + limits.maxElapsedMs + 1
  ledger = recordProviderCall(provider.ledger, provider.reservationId, {
    ok: true,
    code: 'ok',
    estimatedCost: 0.42,
    now: () => nowMs
  })
  assert.equal(ledger.usage.providerCalls, 1)
  assert.equal(ledger.usage.estimatedCost, 0.42)
  assert.deepEqual(ledger.reservations, {})
  // 但新的准入必须被 elapsed 断言拦截。
  assert.throws(
    () => reserveProviderCall(ledger, { timeoutMs: 480_000, now: () => nowMs }),
    (error) => error?.code === 'hatch_pet_elapsed_budget_exhausted'
  )
})

test('cost overrun is recorded at settlement and enforced at the next reservation', () => {
  let nowMs = 1_000
  const cappedLimits = { ...limits, maxEstimatedCost: 1 }
  let ledger = createBudgetLedger({ limits: cappedLimits, startedAtMs: nowMs, now: () => nowMs })
  const provider = reserveProviderCall(ledger, { timeoutMs: 480_000, now: () => nowMs })
  // 实际费用超过上限：结算不抛错（钱已花出去），必须如实入账。
  ledger = recordProviderCall(provider.ledger, provider.reservationId, {
    ok: true,
    code: 'ok',
    estimatedCost: 1.5,
    now: () => nowMs
  })
  assert.equal(ledger.usage.estimatedCost, 1.5)
  assert.throws(
    () => reserveProviderCall(ledger, { timeoutMs: 480_000, now: () => nowMs }),
    (error) => error?.code === 'hatch_pet_cost_budget_exhausted'
  )
})

test('reservation ids stay unique after reconciling abandoned reservations', () => {
  const nowMs = 1_000
  let ledger = createBudgetLedger({ limits, startedAtMs: nowMs, now: () => nowMs })
  const first = reserveProviderCall(ledger, { timeoutMs: 480_000, now: () => nowMs })
  // 第一个预约被放弃（如插件崩溃），reconcile 将其计入消耗。
  ledger = reconcileAbandonedProviderReservations(first.ledger)
  assert.equal(ledger.usage.providerCalls, 1)
  const second = reserveProviderCall(ledger, { timeoutMs: 480_000, now: () => nowMs })
  assert.notEqual(second.reservationId, first.reservationId)
  const third = reserveProviderCall(second.ledger, { timeoutMs: 480_000, now: () => nowMs })
  assert.notEqual(third.reservationId, second.reservationId)
  assert.notEqual(third.reservationId, first.reservationId)
})

test('legacy ledgers without reservationSequence continue with non-colliding ids', () => {
  const nowMs = 1_000
  const base = createBudgetLedger({ limits, startedAtMs: nowMs, now: () => nowMs })
  // 模拟磁盘上的旧版账本：没有 reservationSequence 字段。
  const { reservationSequence, ...legacy } = base
  const legacyLedger = Object.freeze({
    ...legacy,
    usage: Object.freeze({ ...base.usage, providerCalls: 3 })
  })
  const next = reserveProviderCall(legacyLedger, { timeoutMs: 480_000, now: () => nowMs })
  assert.equal(next.reservationId, 'provider-4')
  assert.equal(next.ledger.reservationSequence, 4)
})
