const normalizeImMessage = (message = {}, {
  adapterId = '',
  platform = 'telegram',
  now = () => new Date().toISOString()
} = {}) => ({
  platform: String(message.platform || platform || ''),
  adapterId: String(message.adapterId || adapterId || ''),
  chatType: String(message.chatType || ''),
  chatId: String(message.chatId || ''),
  userId: String(message.userId || ''),
  userName: String(message.userName || ''),
  messageId: String(message.messageId || ''),
  text: String(message.text || ''),
  isCommand: message.isCommand === true || String(message.text || '').trim().startsWith('/'),
  isMention: message.isMention === true,
  receivedAt: message.receivedAt || now(),
  raw: undefined
})

module.exports = {
  normalizeImMessage
}
