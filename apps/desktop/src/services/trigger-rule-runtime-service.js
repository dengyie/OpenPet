const MAX_DIAGNOSTIC_DECISIONS = 100
const DEFAULT_HEARTBEAT_INTERVAL_MS = 1000
const TRIGGER_SOURCE_PREFIX = 'trigger-rule:'

const clone = (value) => JSON.parse(JSON.stringify(value))

const getSafeRules = (actionService) => {
  const config = actionService?.getConfig?.() || {}
  const rawRules = Array.isArray(config.triggerRules) ? config.triggerRules : []
  // Flatten ruleSpec into top-level fields the runtime reads. The action-service
  // persists intervalMs inside ruleSpec.schedule.intervalMs and bindings inside
  // ruleSpec.state.predicate / ruleSpec.event.name, but this runtime reads
  // rule.intervalMs / rule.binding directly. Normalizing here at the boundary
  // keeps both sides honest without changing the persisted schema.
  const triggerRules = rawRules.map((rule) => {
    if (!rule || typeof rule !== 'object') return rule
    const spec = rule.ruleSpec && typeof rule.ruleSpec === 'object' ? rule.ruleSpec : {}
    const normalized = { ...rule }
    if (spec.schedule && typeof spec.schedule === 'object' && spec.schedule.intervalMs != null && rule.intervalMs == null) {
      normalized.intervalMs = spec.schedule.intervalMs
    }
    if (spec.state && typeof spec.state === 'object' && spec.state.predicate != null && rule.binding == null) {
      normalized.binding = spec.state.predicate
    }
    if (spec.event && typeof spec.event === 'object' && spec.event.name != null && rule.binding == null) {
      normalized.binding = spec.event.name
    }
    return normalized
  })
  return {
    actions: Array.isArray(config.actions) ? config.actions : [],
    defaultAction: typeof config.defaultAction === 'string' ? config.defaultAction : '',
    triggerRules
  }
}

const isTriggerOwnedSource = (source) => typeof source === 'string' && source.startsWith(TRIGGER_SOURCE_PREFIX)

const createTriggerRuleRuntimeService = ({
  actionService,
  petService,
  appLogService,
  now = () => Date.now(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) => {
  if (!actionService?.getConfig) throw new Error('actionService.getConfig is required')
  if (!petService?.playAction || !petService?.onAction || !petService?.onEvent) {
    throw new Error('petService playAction/onAction/onEvent are required')
  }

  let started = false
  let heartbeat = null
  let heartbeatIntervalMs = 0
  let unsubscribeAction = null
  let unsubscribeEvent = null
  let currentState = { actionId: getSafeRules(actionService).defaultAction || '' }
  let diagnostics = { currentState: clone(currentState), decisions: [] }
  const lastMatchedAtByRule = new Map()

  const record = (entry) => {
    diagnostics = {
      currentState: clone(currentState),
      decisions: [...diagnostics.decisions, entry].slice(-MAX_DIAGNOSTIC_DECISIONS)
    }
    try {
      appLogService?.record?.({
        scope: 'pet-runtime',
        level: entry.outcome === 'blocked' ? 'warn' : 'info',
        actor: 'system',
        event: 'trigger-rule.runtime.decision',
        message: `${entry.ruleId} ${entry.outcome}: ${entry.reason}`,
        details: entry
      })
    } catch (_error) {}
  }

  const getActionMap = () => {
    const config = getSafeRules(actionService)
    return new Map(config.actions.filter((action) => action?.id).map((action) => [action.id, action]))
  }

  const resolveHeartbeatInterval = () => {
    const { triggerRules } = getSafeRules(actionService)
    const enabledIntervals = triggerRules
      .filter((rule) => rule?.type === 'random' && rule.enabled !== false)
      .map((rule) => Number(rule.intervalMs || 0))
      .filter((intervalMs) => Number.isInteger(intervalMs) && intervalMs >= DEFAULT_HEARTBEAT_INTERVAL_MS)
    return enabledIntervals.length ? Math.min(...enabledIntervals) : 0
  }

  const syncHeartbeat = () => {
    if (!started) return
    const nextIntervalMs = resolveHeartbeatInterval()
    if (nextIntervalMs <= 0) {
      if (heartbeat) clearIntervalFn(heartbeat)
      heartbeat = null
      heartbeatIntervalMs = 0
      return
    }
    if (heartbeat && heartbeatIntervalMs === nextIntervalMs) return
    if (heartbeat) clearIntervalFn(heartbeat)
    heartbeatIntervalMs = nextIntervalMs
    heartbeat = setIntervalFn(() => evaluateRandomRules(), nextIntervalMs)
  }

  const buildTriggerSource = (ruleId) => `${TRIGGER_SOURCE_PREFIX}${ruleId}`

  const evaluateRules = ({
    rules,
    triggerType,
    source,
    predicate,
    getCooldownMs = () => 0
  }) => {
    const actions = getActionMap()
    const currentNow = Number(now())
    let winner = null

    for (const rule of rules) {
      const baseEntry = {
        ruleId: String(rule?.id || ''),
        triggerType,
        actionId: String(rule?.actionId || ''),
        binding: String(rule?.binding || ''),
        source
      }

      if (rule?.enabled === false) {
        record({ ...baseEntry, outcome: 'skipped', reason: 'rule disabled' })
        continue
      }
      if (!actions.has(rule?.actionId)) {
        record({ ...baseEntry, outcome: 'blocked', reason: 'action is unavailable' })
        continue
      }

      const match = predicate(rule)
      if (!match.ok) {
        record({ ...baseEntry, outcome: 'skipped', reason: match.reason })
        continue
      }

      if (winner) {
        record({ ...baseEntry, outcome: 'blocked', reason: 'higher-priority rule already matched' })
        continue
      }

      const cooldownMs = Math.max(0, Number(getCooldownMs(rule)) || 0)
      const lastMatchedAt = lastMatchedAtByRule.get(rule.id) || 0
      if (cooldownMs > 0 && currentNow - lastMatchedAt < cooldownMs) {
        record({ ...baseEntry, outcome: 'skipped', reason: 'cooldown active' })
        continue
      }

      petService.playAction({ actionId: rule.actionId, source: buildTriggerSource(rule.id) })
      lastMatchedAtByRule.set(rule.id, currentNow)
      winner = rule.id
      record({ ...baseEntry, outcome: 'matched', reason: 'rule matched' })
    }
  }

  const evaluateRandomRules = () => {
    if (!started) return
    syncHeartbeat()
    const { triggerRules } = getSafeRules(actionService)
    evaluateRules({
      rules: triggerRules.filter((rule) => rule?.type === 'random'),
      triggerType: 'random',
      source: 'scheduler',
      predicate: () => ({ ok: true, reason: 'rule matched' }),
      getCooldownMs: (rule) => rule.intervalMs
    })
  }

  const auditRandomRules = () => {
    const { triggerRules } = getSafeRules(actionService)
    const actions = getActionMap()
    for (const rule of triggerRules.filter((item) => item?.type === 'random')) {
      const baseEntry = {
        ruleId: String(rule?.id || ''),
        triggerType: 'random',
        actionId: String(rule?.actionId || ''),
        binding: String(rule?.binding || ''),
        source: 'scheduler'
      }
      if (rule?.enabled === false) {
        record({ ...baseEntry, outcome: 'skipped', reason: 'rule disabled' })
        continue
      }
      if (!actions.has(rule?.actionId)) {
        record({ ...baseEntry, outcome: 'blocked', reason: 'action is unavailable' })
      }
    }
  }

  const evaluateEventRules = (payload = {}) => {
    const { triggerRules } = getSafeRules(actionService)
    evaluateRules({
      rules: triggerRules.filter((rule) => rule?.type === 'event'),
      triggerType: 'event',
      source: String(payload.source || payload.type || 'event'),
      predicate: (rule) => rule.binding === String(payload.type || '')
        ? { ok: true, reason: 'rule matched' }
        : { ok: false, reason: 'binding mismatch' }
    })
  }

  const evaluateStateRules = () => {
    const { triggerRules } = getSafeRules(actionService)
    evaluateRules({
      rules: triggerRules.filter((rule) => rule?.type === 'state'),
      triggerType: 'state',
      source: currentState.actionId || 'state',
      predicate: (rule) => rule.binding === currentState.actionId
        ? { ok: true, reason: 'rule matched' }
        : { ok: false, reason: 'binding mismatch' }
    })
  }

  const refresh = () => {
    const { defaultAction } = getSafeRules(actionService)
    if (!currentState.actionId && defaultAction) currentState = { actionId: defaultAction }
    diagnostics = { ...diagnostics, currentState: clone(currentState) }
    syncHeartbeat()
    if (!heartbeat) auditRandomRules()
    return getDiagnostics()
  }

  const start = () => {
    if (started) return getDiagnostics()
    started = true
    refresh()
    unsubscribeAction = petService.onAction((payload = {}) => {
      if (isTriggerOwnedSource(payload.source)) return
      currentState = { actionId: String(payload.actionId || '') }
      diagnostics = { ...diagnostics, currentState: clone(currentState) }
      evaluateStateRules()
    })
    unsubscribeEvent = petService.onEvent((payload = {}) => {
      if (isTriggerOwnedSource(payload.source)) return
      evaluateEventRules(payload)
    })
    syncHeartbeat()
    return getDiagnostics()
  }

  const stop = () => {
    started = false
    if (heartbeat) clearIntervalFn(heartbeat)
    heartbeat = null
    heartbeatIntervalMs = 0
    unsubscribeAction?.()
    unsubscribeEvent?.()
    unsubscribeAction = null
    unsubscribeEvent = null
  }

  const getDiagnostics = () => ({
    currentState: clone(currentState),
    decisions: diagnostics.decisions.map((entry) => ({ ...entry }))
  })

  return {
    start,
    stop,
    refresh,
    getDiagnostics
  }
}

module.exports = { createTriggerRuleRuntimeService }
