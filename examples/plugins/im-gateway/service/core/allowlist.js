const toSet = (values = []) => new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))

const isGroupChatType = (chatType) => ['group', 'supergroup', 'channel'].includes(String(chatType || '').toLowerCase())

const isMessageAllowed = (message = {}, config = {}) => {
  const chatType = String(message.chatType || '').toLowerCase()
  const userId = String(message.userId || '').trim()
  const chatId = String(message.chatId || '').trim()
  const allowedUsers = toSet(config.allowedUsers)
  const allowedChats = toSet(config.allowedChats)

  if (chatType === 'private') {
    if (config.allowAllPrivateChats === true) return { allowed: true, reason: 'private-allow-all' }
    if (userId && allowedUsers.has(userId)) return { allowed: true, reason: 'private-user-allowed' }
    return { allowed: false, reason: 'private-user-not-allowed' }
  }

  if (isGroupChatType(chatType)) {
    const chatAllowed = config.allowAllGroupChats === true || (chatId && allowedChats.has(chatId))
    const userAllowed = userId && allowedUsers.has(userId)
    if (chatAllowed && userAllowed) return { allowed: true, reason: 'group-chat-and-user-allowed' }
    return {
      allowed: false,
      reason: !chatAllowed ? 'group-chat-not-allowed' : 'group-user-not-allowed'
    }
  }

  return { allowed: false, reason: 'unsupported-chat-type' }
}

module.exports = {
  isGroupChatType,
  isMessageAllowed
}
