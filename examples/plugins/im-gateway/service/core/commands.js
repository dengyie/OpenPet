const normalizeCommandToken = (value = '') => {
  const token = String(value || '').trim()
  const [withoutMention] = token.split('@')
  return withoutMention.toLowerCase()
}

const isOpenPetAlias = (token, aliases = []) => {
  const normalizedToken = normalizeCommandToken(token)
  return aliases.map(normalizeCommandToken).includes(normalizedToken)
}

const SIMPLE_COMMANDS = new Set(['status', 'whoami', 'chatid'])

const parseOpenPetCommand = (text = '', config = {}) => {
  const trimmed = String(text || '').trim()
  if (!trimmed) return { matched: false }
  const parts = trimmed.split(/\s+/)
  if (!isOpenPetAlias(parts[0], config.commandAliases || [])) return { matched: false }

  const name = String(parts[1] || 'status').toLowerCase()
  const args = parts.slice(2)
  if (name === 'say') {
    return { matched: true, name, args, text: args.join(' ') }
  }
  if (name === 'action') {
    return { matched: true, name, args, actionId: args[0] || '' }
  }
  if (name === 'event') {
    return { matched: true, name, args, type: args[0] || '', message: args.slice(1).join(' ') }
  }
  if (SIMPLE_COMMANDS.has(name)) {
    return { matched: true, name, args }
  }
  return { matched: true, name, args }
}

module.exports = {
  isOpenPetAlias,
  parseOpenPetCommand
}
