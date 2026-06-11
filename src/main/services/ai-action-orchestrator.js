const KIND_TERMS = {
  greeting: ['hello', 'greeting', 'greet', 'wave', '你好', '您好', '问候', '打招呼', '挥手'],
  thinking: ['thinking', 'think', '思考', '想想', '想一想'],
  working: ['working', 'work', 'focus', '专注', '工作中', '开始工作'],
  waiting: ['waiting', 'wait', '等待', '稍等'],
  success: ['success', 'done', '完成', '成功', '搞定', '太棒'],
  failure: ['failure', 'fail', 'error', 'broken', '失败', '错误', '出错']
}

const normalizeText = (value) => String(value || '').trim().toLowerCase()

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const isAsciiTerm = (term) => /^[a-z0-9_-]+$/i.test(term)

const includesTerm = (text, term) => {
  if (!text || !term) return false
  if (!isAsciiTerm(term)) return text.includes(term)
  return new RegExp(`(^|[^a-z0-9_-])${escapeRegExp(term)}([^a-z0-9_-]|$)`, 'i').test(text)
}

const buildActionTerms = (action) => {
  if (action.kind === 'idle') return []
  const terms = []
  const addTerm = (value, score) => {
    const term = normalizeText(value)
    if (term.length >= 2 && !terms.some((candidate) => candidate.term === term)) {
      terms.push({ term, score })
    }
  }

  addTerm(action.id, 100)
  addTerm(action.label, 95)

  if (KIND_TERMS[action.kind]) {
    addTerm(action.kind, 60)
    for (const term of KIND_TERMS[action.kind] || []) addTerm(term, 55)
  }

  return terms
}

const findSemanticAction = (reply, actions = []) => {
  const text = normalizeText(reply)
  if (!text || !Array.isArray(actions)) return null

  let bestMatch = null
  actions.forEach((action, index) => {
    if (!action?.id) return
    for (const { term, score } of buildActionTerms(action)) {
      if (!includesTerm(text, term)) continue
      const candidate = {
        actionId: action.id,
        label: action.label || action.id,
        kind: action.kind || 'custom',
        matchedTerm: term,
        score,
        index
      }
      if (
        !bestMatch ||
        candidate.score > bestMatch.score ||
        (candidate.score === bestMatch.score && candidate.matchedTerm.length > bestMatch.matchedTerm.length) ||
        (candidate.score === bestMatch.score && candidate.matchedTerm.length === bestMatch.matchedTerm.length && candidate.index < bestMatch.index)
      ) {
        bestMatch = candidate
      }
    }
  })

  if (!bestMatch) return null
  const { score, index, ...action } = bestMatch
  return action
}

module.exports = { findSemanticAction }
