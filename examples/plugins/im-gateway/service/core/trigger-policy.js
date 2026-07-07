const { isGroupChatType } = require('./allowlist')

const shouldTriggerSay = (message = {}, command = { matched: false }, config = {}) => {
  if (command.matched) return { triggered: false, reason: 'command' }
  const text = String(message.text || '').trim()
  if (!text) return { triggered: false, reason: 'empty-text' }
  const chatType = String(message.chatType || '').toLowerCase()
  if (chatType === 'private') {
    return config.privateChatPolicy === 'any-text'
      ? { triggered: true, reason: 'private-any-text' }
      : { triggered: false, reason: 'private-command-only' }
  }
  if (isGroupChatType(chatType)) {
    return config.groupChatPolicy === 'mention-or-command' && message.isMention === true
      ? { triggered: true, reason: 'group-mention' }
      : { triggered: false, reason: 'group-command-only' }
  }
  return { triggered: false, reason: 'unsupported-chat-type' }
}

module.exports = {
  shouldTriggerSay
}
