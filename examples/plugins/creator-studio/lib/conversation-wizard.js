const { hashActionId, normalizeGenerationTask } = require('./generation-task')

const TRIGGER_OPTIONS = ['manual', 'click', 'random', 'state', 'event', 'unbound']

const firstMatch = (text, patterns) => {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

const inferMode = (prompt) => {
  if (/整套|完整|新宠物|做一只|生成一只|full[- ]?pet/i.test(prompt)) return 'full-pet'
  return 'single-action'
}

const shouldDraftGenerationTask = ({ prompt = '', mode = '', generationTask = null } = {}) => {
  if (generationTask) return true
  const normalizedMode = String(mode || '').trim()
  if (normalizedMode === 'legacy' || normalizedMode === 'full-pet') return false
  if (normalizedMode === 'single-action') return true
  const text = String(prompt || '').trim()
  if (!text) return false
  return /自定义|动作|加一个|新增|添加|点击|点按|菜单|手动|随机|定时|偶尔|鼠标|悬停|靠近|状态|情绪|事件|click|manual|random|timer|hover|state|event/i.test(text)
}

const inferActionName = (prompt) => {
  const quoted = firstMatch(prompt, [/“([^”]+)”/, /"([^"]+)"/, /'([^']+)'/])
  if (quoted) return quoted
  const custom = firstMatch(prompt, [/自定义动作[:：]\s*([^，。,.]+)/, /动作[:：]\s*([^，。,.]+)/])
  if (custom) return custom
  const addAction = firstMatch(prompt, [/(?:加一个|新增一个|添加一个)([^，。,.]+?)(?:的动作|动作)/])
  if (addAction) return addAction
  return '自定义动作'
}

const inferTriggerProposal = (prompt) => {
  if (/点击|点按|click/i.test(prompt)) {
    return { type: 'click', binding: 'clickAction', notes: 'User requested click trigger.' }
  }
  if (/菜单|手动|manual/i.test(prompt)) return { type: 'manual', notes: 'User requested manual menu trigger.' }
  if (/随机|定时|偶尔|random|timer/i.test(prompt)) return { type: 'random', notes: 'User requested random or timed trigger.' }
  if (/鼠标|悬停|靠近|状态|情绪|idle|hover|state/i.test(prompt)) return { type: 'state', notes: 'User described a state-based trigger.' }
  if (/事件|API|event/i.test(prompt)) return { type: 'event', notes: 'User requested event trigger.' }
  return { type: 'unbound' }
}

const shouldAskTriggerQuestion = (prompt, triggerProposal) => {
  if (triggerProposal.type !== 'unbound') return false
  return /自定义|动作|加一个|新增|添加/.test(prompt)
}

const inferLoop = (prompt, triggerProposal) => {
  if (/不循环|一次性|one[- ]?shot/i.test(prompt)) return false
  if (/循环|持续|loop/i.test(prompt)) return true
  return triggerProposal.type === 'manual' || triggerProposal.type === 'random' || triggerProposal.type === 'state'
}

const draftGenerationTask = ({ prompt = '', context = {} } = {}) => {
  const originalPrompt = String(prompt || '').trim()
  const mode = inferMode(originalPrompt)
  const styleSource = mode === 'single-action' ? 'currentPet' : 'textOnly'
  const triggerProposal = inferTriggerProposal(originalPrompt)
  const actionName = inferActionName(originalPrompt)
  const loop = inferLoop(originalPrompt, triggerProposal)
  const questions = []
  if (shouldAskTriggerQuestion(originalPrompt, triggerProposal)) {
    questions.push({
      id: 'trigger',
      question: 'How should this custom action be triggered?',
      options: TRIGGER_OPTIONS
    })
  }
  const generationTask = normalizeGenerationTask({
    mode,
    targetPet: mode === 'single-action' ? 'current' : 'new',
    styleSource,
    characterBrief: context.characterBrief || (styleSource === 'currentPet' ? 'Keep the current pet style, proportions, palette, and line work consistent.' : originalPrompt),
    actions: [{
      actionId: hashActionId(actionName),
      name: actionName,
      motionPrompt: originalPrompt || actionName,
      loop,
      frameCount: loop ? 12 : 16,
      triggerProposal
    }],
    questions
  })
  return {
    originalPrompt,
    generationTask
  }
}

module.exports = {
  draftGenerationTask,
  shouldDraftGenerationTask
}
