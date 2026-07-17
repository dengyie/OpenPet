const SECTION_CATEGORY_ORDER = Object.freeze([
  ['DELIVERABLE', ['deliverable']],
  ['REFERENCE', ['reference']],
  ['CHANGE', ['change']],
  ['PRESERVE', ['preserve']],
  ['COMPOSITION', ['composition']],
  ['ACTION', ['action', 'frame-beat']],
  ['BACKGROUND', ['background']],
  ['CONSTRAINTS', ['exclusion']]
])

const renderGptImage2Prompt = ({ task, clauses }) => SECTION_CATEGORY_ORDER
  .map(([defaultTitle, categories]) => {
    const matching = clauses.filter((clause) => categories.includes(clause.category))
    if (!matching.length) return ''
    const title = defaultTitle === 'CHANGE' && task.stage === 'repair'
      ? 'CHANGE ONLY'
      : defaultTitle === 'PRESERVE' && task.stage === 'repair'
        ? 'KEEP UNCHANGED'
        : defaultTitle === 'ACTION'
          ? (task.taskType === 'action-frame-sheet' ? 'FRAME PLAN' : 'ACTION PLAN')
          : defaultTitle
    return [title, ...matching.map((clause) => clause.text)].join('\n')
  })
  .filter(Boolean)
  .join('\n\n')

module.exports = {
  renderGptImage2Prompt
}
