const { renderGptImage2Prompt } = require('./gpt-image-2-prompt-renderer')

const renderGenericImagePrompt = ({ task, clauses }) => renderGptImage2Prompt({ task, clauses })

module.exports = {
  renderGenericImagePrompt
}
