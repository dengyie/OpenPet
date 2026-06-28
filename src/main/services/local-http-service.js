const crypto = require('crypto')
const http = require('http')
const { createMcpTransportService, MCP_PROTOCOL_VERSION } = require('./mcp-transport-service')

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const MAX_BODY_BYTES = 1024 * 1024
const DEFAULT_MAX_ACCESS_LOGS = 200
const createLocalHttpToken = () => crypto.randomBytes(24).toString('base64url')

const extractBearerToken = (header = '') => {
  const match = String(header).match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : ''
}

const getRequestToken = (request) => {
  return extractBearerToken(request.headers.authorization)
    || String(request.headers['x-openpet-token'] || '')
    || String(request.headers['x-ibot-token'] || '')
}

const safeTokenEquals = (candidate, expected) => {
  const candidateBuffer = Buffer.from(String(candidate || ''))
  const expectedBuffer = Buffer.from(String(expected || ''))
  return candidateBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(candidateBuffer, expectedBuffer)
}

const isJsonRequest = (request) => {
  const contentType = String(request.headers['content-type'] || '').toLowerCase()
  return contentType.startsWith('application/json')
}

const readJsonBody = (request) => new Promise((resolve, reject) => {
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
    if (body.length > MAX_BODY_BYTES) {
      request.destroy()
      reject(new Error('Request body is too large'))
    }
  })
  request.on('end', () => {
    if (!body) {
      resolve({})
      return
    }
    try {
      resolve(JSON.parse(body))
    } catch (_) {
      reject(new Error('Invalid JSON body'))
    }
  })
  request.on('error', reject)
})

const sendJson = (response, statusCode, body, headers = {}) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  })
  response.end(JSON.stringify(body))
}

const escapeCsvValue = (value) => {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const normalizeAccessLog = (log) => {
  if (!isPlainObject(log)) return null
  const timestamp = typeof log.timestamp === 'string' ? log.timestamp : ''
  const method = typeof log.method === 'string' ? log.method : ''
  const path = typeof log.path === 'string' ? log.path : ''
  const statusCode = Number(log.statusCode)
  if (!timestamp || !method || !path || !Number.isInteger(statusCode)) return null
  return {
    id: typeof log.id === 'string' ? log.id : `${timestamp}-${method}-${path}-${statusCode}`,
    timestamp,
    method,
    path,
    statusCode,
    authorized: Boolean(log.authorized),
    remoteAddress: typeof log.remoteAddress === 'string' ? log.remoteAddress : '',
    error: typeof log.error === 'string' ? log.error : ''
  }
}

const filterAccessLogs = (logs, filters = {}) => {
  const query = String(filters.query || '').trim().toLowerCase()
  const status = String(filters.status || '').trim()
  return logs.filter((log) => {
    if (status && String(log.statusCode) !== status) return false
    if (!query) return true
    return [log.method, log.path, log.statusCode, log.remoteAddress, log.error]
      .some((value) => String(value || '').toLowerCase().includes(query))
  })
}

const exportAccessLogs = (logs, format = 'json') => {
  if (format === 'csv') {
    const header = ['timestamp', 'method', 'path', 'statusCode', 'authorized', 'remoteAddress', 'error']
    const rows = logs.map((log) => header.map((key) => escapeCsvValue(log[key])).join(','))
    return [header.join(','), ...rows].join('\n')
  }
  return JSON.stringify(logs, null, 2)
}

const getState = (server, config) => {
  const address = server?.address()
  return {
    enabled: Boolean(server?.listening),
    host: config.host,
    port: typeof address === 'object' && address ? address.port : config.port
  }
}

const isAuthorized = (request, config) => {
  return Boolean(config.token) && safeTokenEquals(getRequestToken(request), config.token)
}

const getRequestPath = (request, host) => {
  try {
    return new URL(request.url, `http://${host}`).pathname
  } catch (_) {
    return String(request.url || '')
  }
}

const closeServer = (server) => new Promise((resolve, reject) => {
  server.close((error) => {
    if (error) reject(error)
    else resolve()
  })
})

const sendEventStream = (response, statusCode, body, headers = {}) => {
  response.writeHead(statusCode, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'close',
    ...headers
  })
  response.end(`event: endpoint\ndata: ${JSON.stringify(body)}\n\n`)
}

const createLocalHttpService = ({ petService, settingsService, maxAccessLogs = DEFAULT_MAX_ACCESS_LOGS, now = () => new Date(), nowMs = () => Date.now(), mcpSessionTtlMs }) => {
  if (!petService) throw new Error('petService is required')

  let active = null
  let config = { enabled: false, host: '127.0.0.1', port: 0, token: '' }
  let memoryLogs = []
  const accessLogLimit = Math.max(0, Number(maxAccessLogs) || 0)

  const readLogs = () => {
    const rawLogs = (settingsService?.get?.() || {}).localHttp?.logs || memoryLogs
    const logs = (Array.isArray(rawLogs) ? rawLogs : []).map(normalizeAccessLog).filter(Boolean)
    return accessLogLimit > 0 ? logs.slice(-accessLogLimit) : []
  }

  const saveLogs = (logs) => {
    const nextLogs = accessLogLimit > 0 ? logs.slice(-accessLogLimit) : []
    if (!settingsService) {
      memoryLogs = nextLogs
      return nextLogs
    }
    const settings = settingsService.get()
    settingsService.save({
      ...settings,
      localHttp: {
        ...(settings.localHttp || {}),
        logs: nextLogs
      }
    })
    return nextLogs
  }

  const recordAccess = (request, runtime, statusCode, { path, authorized, error } = {}) => {
    try {
      saveLogs([
        ...readLogs(),
        {
          id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
          timestamp: now().toISOString(),
          method: request.method,
          path: path || getRequestPath(request, runtime.config.host),
          statusCode,
          authorized: Boolean(authorized),
          remoteAddress: request.socket?.remoteAddress || '',
          error: error ? String(error).slice(0, 240) : ''
        }
      ])
    } catch (_) {
      // Access logging must never break the local API response path.
    }
  }

  const respond = (request, response, runtime, statusCode, body, options = {}) => {
    recordAccess(request, runtime, statusCode, options)
    sendJson(response, statusCode, body, options.headers)
  }

  const createRequestHandler = (runtime) => async (request, response) => {
    const requestConfig = runtime.config
    const authorized = isAuthorized(request, requestConfig)
    let path = getRequestPath(request, requestConfig.host)
    try {
      const url = new URL(request.url, `http://${requestConfig.host}`)
      path = url.pathname

      if (request.method === 'GET' && url.pathname === '/api/status') {
        const body = {
          ok: true,
          service: getState(runtime.server, requestConfig)
        }
        if (authorized) body.snapshot = petService.getSnapshot()
        respond(request, response, runtime, 200, body, { path, authorized })
        return
      }

      if (request.method === 'POST' && url.pathname === '/mcp') {
        if (!authorized) {
          respond(request, response, runtime, 401, { ok: false, error: 'Unauthorized' }, { path, authorized })
          return
        }
        if (!isJsonRequest(request)) {
          respond(request, response, runtime, 415, { ok: false, error: 'Content-Type must be application/json' }, { path, authorized })
          return
        }
        const body = await readJsonBody(request)
        const result = runtime.mcp.handleJsonRpc(request, body)
        respond(request, response, runtime, result.statusCode, result.body, { path: result.logPath || path, authorized, headers: result.headers })
        return
      }

      if (request.method === 'GET' && url.pathname === '/mcp') {
        if (!authorized) {
          respond(request, response, runtime, 401, { ok: false, error: 'Unauthorized' }, { path, authorized })
          return
        }
        if (!runtime.mcp.hasSession(request)) {
          respond(request, response, runtime, 401, { ok: false, error: 'MCP session is required' }, { path: '/mcp/session-required', authorized })
          return
        }
        recordAccess(request, runtime, 200, { path: '/mcp/stream', authorized })
        sendEventStream(response, 200, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          endpoint: '/mcp'
        })
        return
      }

      const isPetMutation = request.method === 'POST' && [
        '/api/pet/say',
        '/api/pet/action',
        '/api/pet/event'
      ].includes(url.pathname)

      if (isPetMutation && !authorized) {
        respond(request, response, runtime, 401, { ok: false, error: 'Unauthorized' }, { path, authorized })
        return
      }

      if (isPetMutation && !isJsonRequest(request)) {
        respond(request, response, runtime, 415, { ok: false, error: 'Content-Type must be application/json' }, { path, authorized })
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/pet/say') {
        const body = await readJsonBody(request)
        const result = petService.say({ text: body.text, ttlMs: body.ttlMs, source: 'http', sourceSurface: 'local-http' })
        respond(request, response, runtime, 200, { ok: true, result }, { path, authorized })
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/pet/action') {
        const body = await readJsonBody(request)
        const result = petService.playAction({ actionId: body.actionId, source: 'http' })
        respond(request, response, runtime, 200, { ok: true, result }, { path, authorized })
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/pet/event') {
        const body = await readJsonBody(request)
        const result = petService.setEvent({ ...body, source: 'http' })
        respond(request, response, runtime, 200, { ok: true, result }, { path, authorized })
        return
      }

      respond(request, response, runtime, 404, { ok: false, error: 'Not found' }, { path, authorized })
    } catch (error) {
      respond(request, response, runtime, 400, { ok: false, error: error.message || 'Bad request' }, { path, authorized, error: error.message })
    }
  }

  const stop = async () => {
    if (!active) {
      config = { ...config, enabled: false }
      return getState(null, config)
    }
    const currentRuntime = active
    active = null
    await closeServer(currentRuntime.server)
    config = { ...currentRuntime.config, enabled: false }
    return getState(null, config)
  }

  const start = async (nextConfig = {}) => {
    const host = nextConfig.host || '127.0.0.1'
    if (!LOOPBACK_HOSTS.has(host)) {
      throw new Error('Local HTTP service must bind to a loopback host')
    }
    if (!nextConfig.token) {
      throw new Error('Local HTTP service token is required')
    }
    const port = Number(nextConfig.port || 0)
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error('Local HTTP service port must be between 0 and 65535')
    }

    if (active && active.config.host === host && active.config.port === port) {
      if (active.config.token !== nextConfig.token) active.mcp.revokeSessions()
      active.config = {
        ...active.config,
        token: nextConfig.token
      }
      config = active.config
      return getState(active.server, active.config)
    }

    const runtime = {
      server: null,
      mcp: createMcpTransportService({ petService, nowMs, sessionTtlMs: mcpSessionTtlMs }),
      config: {
        enabled: true,
        host,
        port,
        token: nextConfig.token
      }
    }
    runtime.server = http.createServer(createRequestHandler(runtime))

    await new Promise((resolve, reject) => {
      runtime.server.once('error', reject)
      runtime.server.listen(port, host, resolve)
    })

    const previousRuntime = active
    active = runtime
    config = runtime.config
    if (previousRuntime) await closeServer(previousRuntime.server)

    return getState(runtime.server, config)
  }

  const getStatus = () => {
    const state = !active ? getState(null, config) : getState(active.server, active.config)
    return { ...state, mcp: active?.mcp.getStatus() || { activeSessions: 0, sessionTtlMs: mcpSessionTtlMs || 0 } }
  }

  const revokeMcpSessions = () => active?.mcp.revokeSessions() || { activeSessions: 0, sessionTtlMs: mcpSessionTtlMs || 0 }

  const getLogs = (filters = {}) => filterAccessLogs(readLogs(), filters)

  const clearLogs = () => saveLogs([])

  const exportLogs = (filters = {}) => exportAccessLogs(getLogs(filters), filters.format)

  return { start, stop, getStatus, revokeMcpSessions, getLogs, clearLogs, exportLogs }
}

module.exports = {
  DEFAULT_MAX_ACCESS_LOGS,
  LOOPBACK_HOSTS,
  MCP_PROTOCOL_VERSION,
  createLocalHttpService,
  createLocalHttpToken
}
