const crypto = require('crypto')

const MCP_PROTOCOL_VERSION = '2025-03-26'
const DEFAULT_MCP_SESSION_TTL_MS = 60 * 60 * 1000
const DEFAULT_MAX_MCP_SESSIONS = 16
const MCP_SERVER_NAME = 'openpet'

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const MCP_TOOLS = [
  {
    name: 'openpet.status',
    description: 'Get the current OpenPet snapshot.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'openpet.say',
    description: 'Show a speech bubble on the desktop pet.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        ttlMs: { type: 'number' }
      },
      required: ['text'],
      additionalProperties: false
    }
  },
  {
    name: 'openpet.play_action',
    description: 'Play a pet action by id.',
    inputSchema: {
      type: 'object',
      properties: {
        actionId: { type: 'string' }
      },
      required: ['actionId'],
      additionalProperties: false
    }
  },
  {
    name: 'openpet.set_event',
    description: 'Set a pet event with an optional message.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        message: { type: 'string' },
        ttlMs: { type: 'number' }
      },
      required: ['type'],
      additionalProperties: false
    }
  }
]

const LEGACY_TOOL_NAMES = {
  'ibot.status': 'openpet.status',
  'ibot.say': 'openpet.say',
  'ibot.play_action': 'openpet.play_action',
  'ibot.set_event': 'openpet.set_event'
}

const normalizeToolName = (name) => LEGACY_TOOL_NAMES[name] || name

const createJsonRpcResult = (id, result) => ({ jsonrpc: '2.0', id, result })

const createJsonRpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

const validateInputSchema = (schema, args = {}) => {
  if (!isPlainObject(args)) throw new Error('MCP tool arguments must be an object')
  const properties = schema.properties || {}
  for (const key of schema.required || []) {
    if (!Object.hasOwn(args, key)) throw new Error(`MCP tool argument is required: ${key}`)
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(args)) {
      if (!Object.hasOwn(properties, key)) throw new Error(`MCP tool argument is not allowed: ${key}`)
    }
  }
  for (const [key, field] of Object.entries(properties)) {
    if (!Object.hasOwn(args, key) || args[key] == null) continue
    if (field.type === 'string' && typeof args[key] !== 'string') throw new Error(`MCP tool argument ${key} must be a string`)
    if (field.type === 'string' && (schema.required || []).includes(key) && !args[key].trim()) throw new Error(`MCP tool argument ${key} must not be empty`)
    if (field.type === 'number' && (typeof args[key] !== 'number' || !Number.isFinite(args[key]))) throw new Error(`MCP tool argument ${key} must be a number`)
  }
}

const createMcpTransportService = ({
  petService,
  sessionTtlMs = DEFAULT_MCP_SESSION_TTL_MS,
  maxSessions = DEFAULT_MAX_MCP_SESSIONS,
  nowMs = () => Date.now()
}) => {
  if (!petService) throw new Error('petService is required')
  const sessions = new Map()
  const ttlMs = Math.max(1, Number(sessionTtlMs) || DEFAULT_MCP_SESSION_TTL_MS)
  const sessionLimit = Math.max(1, Number(maxSessions) || DEFAULT_MAX_MCP_SESSIONS)

  const pruneSessions = () => {
    const now = nowMs()
    for (const [sessionId, touchedAt] of sessions.entries()) {
      if (now - touchedAt > ttlMs) sessions.delete(sessionId)
    }
  }

  const createSession = () => {
    pruneSessions()
    const sessionId = crypto.randomBytes(18).toString('base64url')
    sessions.set(sessionId, nowMs())
    while (sessions.size > sessionLimit) {
      sessions.delete(sessions.keys().next().value)
    }
    return sessionId
  }

  const hasSessionId = (sessionId) => {
    pruneSessions()
    const touchedAt = sessions.get(String(sessionId || ''))
    if (!touchedAt) return false
    sessions.set(String(sessionId), nowMs())
    return true
  }

  const hasSession = (request) => hasSessionId(request.headers['mcp-session-id'])

  const getStatus = () => {
    pruneSessions()
    return { activeSessions: sessions.size, sessionTtlMs: ttlMs }
  }

  const revokeSessions = () => {
    sessions.clear()
    return getStatus()
  }

  const callTool = (name, args = {}) => {
    const normalizedName = normalizeToolName(name)
    const tool = MCP_TOOLS.find((candidate) => candidate.name === normalizedName)
    if (!tool) throw new Error(`Unknown MCP tool: ${name}`)
    validateInputSchema(tool.inputSchema, args)
    if (normalizedName === 'openpet.status') return petService.getSnapshot()
    if (normalizedName === 'openpet.say') return petService.say({ text: args.text, ttlMs: args.ttlMs, source: 'mcp', sourceSurface: 'mcp-tool' })
    if (normalizedName === 'openpet.play_action') return petService.playAction({ actionId: args.actionId, source: 'mcp' })
    if (normalizedName === 'openpet.set_event') return petService.setEvent({ ...args, source: 'mcp' })
    throw new Error(`Unknown MCP tool: ${name}`)
  }

  const handleJsonRpc = (request, body) => {
    const id = body?.id ?? null
    if (body?.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      return { statusCode: 200, body: createJsonRpcError(id, -32600, 'Invalid JSON-RPC request'), logPath: '/mcp' }
    }

    if (body.method === 'initialize') {
      const sessionId = createSession()
      return {
        statusCode: 200,
        headers: { 'Mcp-Session-Id': sessionId },
        logPath: '/mcp/initialize',
        body: createJsonRpcResult(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: MCP_SERVER_NAME, version: '1.0.0' }
        })
      }
    }

    if (!hasSession(request)) {
      return { statusCode: 401, body: { ok: false, error: 'MCP session is required' }, logPath: '/mcp/session-required' }
    }

    if (body.method === 'tools/list') {
      return { statusCode: 200, body: createJsonRpcResult(id, { tools: MCP_TOOLS }), logPath: '/mcp/tools/list' }
    }

    if (body.method === 'tools/call') {
      const name = body.params?.name
      const args = isPlainObject(body.params?.arguments) ? body.params.arguments : {}
      try {
        const result = callTool(name, args)
        return {
          statusCode: 200,
          logPath: `/mcp/tools/call/${name || 'unknown'}`,
          body: createJsonRpcResult(id, {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: result
          })
        }
      } catch (error) {
        return { statusCode: 200, body: createJsonRpcError(id, -32602, error.message), logPath: `/mcp/tools/call/${name || 'unknown'}` }
      }
    }

    return { statusCode: 200, body: createJsonRpcError(id, -32601, 'Method not found'), logPath: `/mcp/${body.method}` }
  }

  return { getStatus, revokeSessions, hasSession, handleJsonRpc, getTools: () => MCP_TOOLS }
}

module.exports = {
  DEFAULT_MCP_SESSION_TTL_MS,
  DEFAULT_MAX_MCP_SESSIONS,
  MCP_PROTOCOL_VERSION,
  MCP_TOOLS,
  createMcpTransportService,
  validateInputSchema
}
