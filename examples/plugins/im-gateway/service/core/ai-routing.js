const { isGroupChatType } = require('./allowlist')

const PRIVATE_INBOUND_LIMIT = 2000
const GROUP_INBOUND_LIMIT = 500
const PRIVATE_REPLY_LIMIT = 800
const GROUP_REPLY_LIMIT = 160

const normalizeWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim()

const stripDirectMention = (message = {}) => {
  const text = normalizeWhitespace(message.text)
  if (!text || message.isMention !== true) return text
  const mentionText = normalizeWhitespace(message.directMentionText)
  if (mentionText) return normalizeWhitespace(text.replace(mentionText, ' '))
  return normalizeWhitespace(text.replace(/@\S+/u, ' '))
}

const buildConversationKey = (message = {}) => [
  String(message.platform || 'telegram').trim() || 'telegram',
  isGroupChatType(message.chatType) ? 'group' : 'private',
  String(message.chatId || '').trim(),
  String(message.userId || '').trim()
].join(':')

const resolveAiRoute = (message = {}, config = {}) => {
  const chatType = String(message.chatType || '').toLowerCase()
  const privateText = normalizeWhitespace(message.text)
  const groupText = stripDirectMention(message)

  if (chatType === 'private') {
    if (config.privateTextMode === 'ai-chat' && privateText) {
      return {
        mode: 'ai-chat',
        messageText: privateText.slice(0, PRIVATE_INBOUND_LIMIT),
        conversationKey: buildConversationKey(message)
      }
    }
    if (config.privateTextMode === 'pet-say' && privateText) {
      return { mode: 'pet-say', messageText: privateText }
    }
    return { mode: 'ignore', reason: 'private-command-only' }
  }

  if (isGroupChatType(chatType)) {
    if (message.isMention === true && config.groupAiRepliesEnabled === true && groupText) {
      return {
        mode: 'ai-chat',
        messageText: groupText.slice(0, GROUP_INBOUND_LIMIT),
        conversationKey: buildConversationKey(message)
      }
    }
    if (message.isMention === true && config.groupChatPolicy === 'mention-or-command') {
      return { mode: 'pet-say', messageText: normalizeWhitespace(message.text) }
    }
  }

  return { mode: 'ignore', reason: 'not-eligible' }
}

const truncateAiReply = (reply, message = {}) => {
  const limit = isGroupChatType(message.chatType) ? GROUP_REPLY_LIMIT : PRIVATE_REPLY_LIMIT
  const text = normalizeWhitespace(reply)
  if (!text) return ''
  return text.length > limit ? text.slice(0, limit) : text
}

module.exports = {
  GROUP_INBOUND_LIMIT,
  GROUP_REPLY_LIMIT,
  PRIVATE_INBOUND_LIMIT,
  PRIVATE_REPLY_LIMIT,
  resolveAiRoute,
  truncateAiReply
}
