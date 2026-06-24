const { findSemanticAction } = require('./ai-action-orchestrator')

const MAX_BEHAVIOR_RULES = 50
const MAX_DECISIONS = 50
const MAX_RULE_TEXT_CHARS = 500
const MAX_REPLAY_REPLY_CHARS = 2000
const MAX_PROVIDER_REASON_CHARS = 240
const DISPLAY_MODES = new Set(['none', 'bubble', 'action', 'event'])
const DEFAULT_BEHAVIOR_CONFIG = {
  enabled: false,
  useTools: true,
  cooldownMs: 1500,
  rules: [],
  decisions: []
}

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const normalizeText = (value) => String(value || '').trim().toLowerCase()

const normalizeStringList = (value) => {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 20)
}

const normalizeActionId = (value) => String(value || '').trim()

const sanitizeDecisionText = (value, maxChars = MAX_PROVIDER_REASON_CHARS) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted-secret]')
  .slice(0, maxChars)

const normalizeDisplayMode = (value) => {
  const mode = String(value || '').trim()
  return DISPLAY_MODES.has(mode) ? mode : ''
}

const getProviderBehaviorFields = (behaviorIntent = {}) => {
  const providerReason = sanitizeDecisionText(behaviorIntent?.reason)
  const displayMode = normalizeDisplayMode(behaviorIntent?.displayMode)
  return {
    ...(providerReason ? { providerReason } : {}),
    ...(displayMode ? { displayMode } : {})
  }
}

const getDecisionProviderFields = (decision = {}) => ({
  ...(decision.providerReason ? { providerReason: sanitizeDecisionText(decision.providerReason) } : {}),
  ...(decision.displayMode ? { displayMode: normalizeDisplayMode(decision.displayMode) } : {})
})

const summarizeInput = ({ reply = '', behaviorIntent = null } = {}) => {
  const parts = [`reply:${String(reply || '').length} chars`]
  if (behaviorIntent?.intent) parts.push(`intent:${String(behaviorIntent.intent).slice(0, 80)}`)
  if (behaviorIntent?.actionId) parts.push(`actionId:${String(behaviorIntent.actionId).slice(0, 80)}`)
  if (behaviorIntent?.confidence != null) parts.push(`confidence:${Number(behaviorIntent.confidence) || 0}`)
  if (behaviorIntent?.displayMode) parts.push(`displayMode:${normalizeDisplayMode(behaviorIntent.displayMode) || 'unknown'}`)
  return parts.join(' · ')
}

const normalizeReplayBehaviorIntent = (behaviorIntent) => {
  if (!isPlainObject(behaviorIntent)) return null
  const providerFields = getProviderBehaviorFields(behaviorIntent)
  return {
    intent: String(behaviorIntent.intent || '').slice(0, 120),
    actionId: String(behaviorIntent.actionId || '').slice(0, 120),
    bubbleText: String(behaviorIntent.bubbleText || '').slice(0, MAX_RULE_TEXT_CHARS),
    confidence: Number(behaviorIntent.confidence || 0),
    ...(providerFields.providerReason ? { reason: providerFields.providerReason } : {}),
    ...(providerFields.displayMode ? { displayMode: providerFields.displayMode } : {})
  }
}

const normalizeReplayInput = (replay = {}) => ({
  reply: String(replay.reply || '').slice(0, MAX_REPLAY_REPLY_CHARS),
  behaviorIntent: normalizeReplayBehaviorIntent(replay.behaviorIntent)
})

const normalizeRule = (rule = {}, index = 0) => ({
  id: normalizeActionId(rule.id) || `rule-${index + 1}`,
  enabled: rule.enabled !== false,
  priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 0,
  when: isPlainObject(rule.when)
    ? {
        intent: normalizeText(rule.when.intent),
        minConfidence: Number.isFinite(Number(rule.when.minConfidence)) ? Number(rule.when.minConfidence) : 0,
        contains: normalizeStringList(rule.when.contains),
        actionKind: normalizeText(rule.when.actionKind)
      }
    : {},
  then: isPlainObject(rule.then)
    ? {
        type: ['say', 'playAction', 'setEvent'].includes(rule.then.type) ? rule.then.type : 'playAction',
        text: String(rule.then.text || '').slice(0, MAX_RULE_TEXT_CHARS),
        actionId: normalizeActionId(rule.then.actionId),
        event: normalizeActionId(rule.then.event),
        message: String(rule.then.message || '').slice(0, MAX_RULE_TEXT_CHARS)
      }
    : { type: 'playAction' }
})

const normalizeDecision = (decision = {}, index = 0) => ({
  id: Number.isFinite(Number(decision.id)) ? Number(decision.id) : index + 1,
  timestamp: decision.timestamp || new Date().toISOString(),
  matched: Boolean(decision.matched),
  type: String(decision.type || ''),
  ruleId: String(decision.ruleId || ''),
  reason: String(decision.reason || ''),
  actionId: String(decision.actionId || ''),
  label: String(decision.label || ''),
  kind: String(decision.kind || ''),
  event: String(decision.event || ''),
  intent: String(decision.intent || ''),
  inputSummary: String(decision.inputSummary || ''),
  cooldown: Boolean(decision.cooldown),
  fallback: Boolean(decision.fallback),
  blockedReason: String(decision.blockedReason || ''),
  ...getDecisionProviderFields(decision),
  replay: normalizeReplayInput(decision.replay)
})

const createStoredDecision = (payload, decision) => {
  const reason = String(decision.reason || '')
  return normalizeDecision({
    ...decision,
    inputSummary: summarizeInput(payload),
    cooldown: Boolean(decision.cooldown),
    fallback: reason.startsWith('fallback matched'),
    blockedReason: decision.matched ? '' : reason,
    replay: {
      reply: payload.reply || '',
      behaviorIntent: payload.behaviorIntent || null
    }
  })
}

const redactDecisionForExport = (decision) => {
  const { replay: _replay, ...safeDecision } = normalizeDecision(decision)
  return {
    ...safeDecision,
    replayRedacted: true
  }
}

const normalizeBehaviorConfig = (behavior = {}) => ({
  ...DEFAULT_BEHAVIOR_CONFIG,
  ...(isPlainObject(behavior) ? behavior : {}),
  enabled: Boolean(behavior?.enabled),
  useTools: behavior?.useTools !== false,
  cooldownMs: Math.max(0, Number(behavior?.cooldownMs ?? DEFAULT_BEHAVIOR_CONFIG.cooldownMs) || 0),
  rules: Array.isArray(behavior?.rules)
    ? behavior.rules.slice(0, MAX_BEHAVIOR_RULES).map(normalizeRule)
    : [],
  decisions: Array.isArray(behavior?.decisions)
    ? behavior.decisions.slice(0, MAX_DECISIONS).map(normalizeDecision)
    : []
})

const getActionMap = (actions = []) => new Map(
  (Array.isArray(actions) ? actions : [])
    .filter((action) => action?.id)
    .map((action) => [action.id, action])
)

const createNoMatch = (reason, extra = {}) => ({ matched: false, reason, ...extra })

const actionDecision = ({ ruleId = '', reason, action, then, reply, behaviorIntent }) => {
  const providerFields = getProviderBehaviorFields(behaviorIntent)
  if (then.type === 'say') {
    const text = then.text || behaviorIntent?.bubbleText || reply
    if (!text) return createNoMatch('say behavior has no text')
    return { matched: true, type: 'say', text, ruleId, reason, intent: behaviorIntent?.intent || '', ...providerFields }
  }
  if (then.type === 'setEvent') {
    const event = then.event || behaviorIntent?.intent
    if (!event) return createNoMatch('event behavior has no event')
    return { matched: true, type: 'setEvent', event, message: then.message || behaviorIntent?.bubbleText || reply, ruleId, reason, intent: behaviorIntent?.intent || '', ...providerFields }
  }
  if (!action) return createNoMatch('action behavior has no valid action')
  return {
    matched: true,
    type: 'playAction',
    actionId: action.id,
    label: action.label || action.id,
    kind: action.kind || 'custom',
    ruleId,
    reason,
    intent: behaviorIntent?.intent || '',
    ...providerFields
  }
}

const ruleMatches = (rule, { reply, behaviorIntent, actions }) => {
  if (!rule.enabled) return null
  const text = normalizeText(reply)
  const intent = normalizeText(behaviorIntent?.intent)
  const confidence = Number(behaviorIntent?.confidence || 0)
  if (rule.when.intent && (rule.when.intent !== intent || confidence < rule.when.minConfidence)) return null
  if (rule.when.contains?.length && !rule.when.contains.some((term) => text.includes(normalizeText(term)))) return null
  if (rule.when.actionKind) {
    const hasKind = actions.some((action) => normalizeText(action.kind) === rule.when.actionKind)
    if (!hasKind) return null
  }
  if (!rule.when.intent && !rule.when.contains?.length && !rule.when.actionKind) return null
  return { ruleId: rule.id, reason: `matched rule ${rule.id}` }
}

const createBehaviorOrchestratorService = ({ settingsService }) => {
  if (!settingsService) throw new Error('settingsService is required')

  const cooldowns = new Map()

  const getConfig = () => normalizeBehaviorConfig(settingsService.get().ai?.behavior)

  const saveConfig = (partialConfig = {}) => {
    const settings = settingsService.get()
    const currentAi = isPlainObject(settings.ai) ? settings.ai : {}
    const currentBehavior = normalizeBehaviorConfig(currentAi.behavior)
    const nextBehavior = normalizeBehaviorConfig({ ...currentBehavior, ...partialConfig })
    settingsService.save({
      ...settings,
      ai: {
        ...currentAi,
        behavior: nextBehavior
      }
    })
    return getConfig()
  }

  const appendDecision = (decision) => {
    const config = getConfig()
    const maxId = config.decisions.reduce((max, entry) => Math.max(max, entry.id), 0)
    saveConfig({
      decisions: [
        normalizeDecision({ ...decision, id: maxId + 1, timestamp: new Date().toISOString() }),
        ...config.decisions
      ].slice(0, MAX_DECISIONS)
    })
  }

  const checkCooldown = (decision, cooldownMs) => {
    if (!decision.matched || decision.type !== 'playAction' || !decision.actionId || cooldownMs <= 0) return null
    const now = Date.now()
    const nextAllowedAt = cooldowns.get(decision.actionId) || 0
    if (nextAllowedAt > now) {
      return createNoMatch('action is cooling down', {
        cooldown: true,
        actionId: decision.actionId,
        ...getDecisionProviderFields(decision)
      })
    }
    cooldowns.set(decision.actionId, now + cooldownMs)
    return null
  }

  const decide = ({ reply = '', behaviorIntent = null, actions = [], dryRun = false, behavior = null } = {}) => {
    const config = behavior ? normalizeBehaviorConfig(behavior) : getConfig()
    if (!config.enabled && !dryRun) return createNoMatch('behavior orchestration disabled')
    const actionMap = getActionMap(actions)
    const sortedRules = [...config.rules].sort((a, b) => b.priority - a.priority)

    for (const rule of sortedRules) {
      const match = ruleMatches(rule, { reply, behaviorIntent, actions })
      if (!match) continue
      const actionId = rule.then.actionId || behaviorIntent?.actionId || ''
      const decision = actionDecision({
        ...match,
        action: actionMap.get(actionId),
        then: rule.then,
        reply,
        behaviorIntent
      })
      if (decision.matched) return decision
    }

    if (behaviorIntent?.actionId) {
      const action = actionMap.get(behaviorIntent.actionId)
      if (action) {
        return actionDecision({
          reason: 'matched provider actionId',
          action,
          then: { type: 'playAction' },
          reply,
          behaviorIntent
        })
      }
      return createNoMatch('provider actionId is not available', {
        actionId: behaviorIntent.actionId,
        ...getProviderBehaviorFields(behaviorIntent)
      })
    }

    const fallback = findSemanticAction(reply, actions)
    if (fallback?.actionId && actionMap.has(fallback.actionId)) {
      return {
        matched: true,
        type: 'playAction',
        actionId: fallback.actionId,
        label: fallback.label,
        kind: fallback.kind,
        reason: `fallback matched ${fallback.matchedTerm}`,
        intent: behaviorIntent?.intent || '',
        ...getProviderBehaviorFields(behaviorIntent)
      }
    }

    return createNoMatch('no behavior rule matched', getProviderBehaviorFields(behaviorIntent))
  }

  const evaluate = (payload = {}) => {
    const config = getConfig()
    const decision = decide(payload)
    const cooldownDecision = checkCooldown(decision, config.cooldownMs)
    const finalDecision = cooldownDecision || decision
    appendDecision(createStoredDecision(payload, finalDecision))
    return finalDecision
  }

  const dryRun = (payload = {}) => decide({ ...payload, dryRun: true })
  const replayDecision = ({ decisionId, actions = [], behavior = null } = {}) => {
    const decision = getConfig().decisions.find((entry) => entry.id === Number(decisionId))
    if (!decision) throw new Error('Behavior decision not found')
    return {
      replayOf: decision.id,
      ...dryRun({
        reply: decision.replay?.reply || '',
        behaviorIntent: decision.replay?.behaviorIntent || null,
        actions,
        behavior
      })
    }
  }
  const clearDecisions = () => saveConfig({ decisions: [] }).decisions
  const exportDiagnostics = () => JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    decisions: getConfig().decisions.map(redactDecisionForExport)
  }, null, 2)

  return { getConfig, saveConfig, evaluate, dryRun, replayDecision, clearDecisions, exportDiagnostics }
}

module.exports = {
  DEFAULT_BEHAVIOR_CONFIG,
  createBehaviorOrchestratorService,
  normalizeBehaviorConfig
}
