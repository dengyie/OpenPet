const { registerChatAiIpc } = require('./register-chat-ai-ipc')
const { registerChatBubbleIpc } = require('./register-chat-bubble-ipc')
const { registerChatWindowIpc } = require('./register-chat-window-ipc')

const registerChatIpc = (context) => {
  registerChatBubbleIpc(context)
  registerChatWindowIpc(context)
  registerChatAiIpc(context)
}

module.exports = {
  registerChatIpc
}
