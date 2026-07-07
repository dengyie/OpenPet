const fs = require('fs')
const http = require('http')
const path = require('path')
const { createBridgeClient } = require('./bridge-client')
const { normalizeCodexEvent, sanitizeText } = require('./adapters/codex')
const { isCodexHookPayload, normalizeCodexHookEvent } = require('./adapters/codex-hook')
const { createCodexRolloutPoller } = require('./adapters/codex-rollout-poller')
const { createAgentStateMapper } = require('./state-mapper')
const { createSessionStore } = require('./session-store')
const { TOKEN_FILE } = require('../commands/codex-hook-plan')
const { readHookMode } = require('../lib/hook-mode')

const DEFAULT_PORT = 8795

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify(body))
}

const sendEmpty = (response, statusCode = 204) => {
  response.writeHead(statusCode, { 'Cache-Control': 'no-store' })
  response.end()
}

const readJsonBody = (request, maxBytes = 64 * 1024) => new Promise((resolve, reject) => {
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
    if (Buffer.byteLength(body) > maxBytes) {
      reject(new Error('Request body is too large'))
      request.destroy()
    }
  })
  request.on('end', () => {
    if (!body.trim()) return resolve({})
    try {
      resolve(JSON.parse(body))
    } catch (_) {
      reject(new Error('Request body must be valid JSON'))
    }
  })
  request.on('error', reject)
})

const sendFile = (response, filePath, contentType) => {
  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  })
  response.end(fs.readFileSync(filePath))
}

const readOptionalIngestToken = (dataDir) => {
  const tokenPath = path.join(dataDir, TOKEN_FILE)
  try {
    const token = fs.readFileSync(tokenPath, 'utf-8').trim()
    return token || ''
  } catch (_) {
    return ''
  }
}

const isAuthorized = ({ request, token }) => {
  if (!token) return true
  const header = String(request.headers.authorization || '')
  return header === `Bearer ${token}`
}

const sanitizePollerStatus = (status = {}) => ({
  ...status,
  lastError: sanitizeText(status.lastError || '', 160)
})

const buildDiagnostics = ({ store, rolloutPoller }) => {
  const sessions = store.getStatus()
  const trackedSessions = store.listSessions()
  const usageTotalTokens = trackedSessions.reduce((sum, session) => {
    const totalTokens = Number(session?.usage?.totalTokens)
    return sum + (Number.isFinite(totalTokens) ? totalTokens : 0)
  }, 0)
  const codexPoller = sanitizePollerStatus(rolloutPoller?.getStatus?.() || { enabled: false })
  return {
    sessionCount: sessions.sessions || 0,
    activeSessionCount: trackedSessions.filter((session) => !['idle', 'completed', 'failed'].includes(String(session.status || '').toLowerCase())).length,
    totalEvents: sessions.totalEvents || 0,
    seenCount: codexPoller.seenCount || 0,
    ignoredContentRecordCount: codexPoller.ignoredContentRecordCount || 0,
    ignoredMetadataRecordCount: codexPoller.ignoredMetadataRecordCount || 0,
    unknownRecordCount: codexPoller.unknownRecordCount || 0,
    malformedRecordCount: codexPoller.malformedRecordCount || 0,
    unsupportedLifecycleRecordCount: codexPoller.unsupportedLifecycleRecordCount || 0,
    usageTotalTokens,
    lastEventAt: sessions.lastEventAt || '',
    lastScanAt: codexPoller.lastScanAt || '',
    lastError: codexPoller.lastError || ''
  }
}

const createAgentAwarenessServer = ({
  dataDir = process.env.OPENPET_DATA_DIR || path.join(process.cwd(), '.agent-awareness-data'),
  bridgeClient = createBridgeClient(),
  createRolloutPoller = (options) => createCodexRolloutPoller(options),
  now = () => new Date().toISOString()
} = {}) => {
  const dashboardDir = path.resolve(__dirname, '..', 'web', 'dashboard')
  const store = createSessionStore({ dataDir })
  const mapper = createAgentStateMapper()
  let server = null
  let rolloutPoller = null

  const normalizeIncomingEvent = (rawEvent) => (
    isCodexHookPayload(rawEvent)
      ? normalizeCodexHookEvent(rawEvent, { now })
      : normalizeCodexEvent(rawEvent, { now })
  )

  const handleEvent = async (rawEvent, { initial = false } = {}) => {
    const event = normalizeIncomingEvent(rawEvent)
    const previousSession = store.listSessions().find((session) => session.sessionId === event.sessionId) || null
    const session = store.upsertEvent(event)
    if (!initial) {
      const mapped = mapper.mapEvent({ event, previousSession })
      if (mapped.petEvent) await bridgeClient.event(mapped.petEvent)
      if (mapped.speech?.text) await bridgeClient.say(mapped.speech)
    }
    return { event, session }
  }

  const handleRequest = async (request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
    if (request.method === 'GET' && url.pathname === '/health') {
      const sessions = store.getStatus()
      const codexPoller = sanitizePollerStatus(rolloutPoller?.getStatus?.() || { enabled: false })
      sendJson(response, 200, {
        ok: true,
        service: 'agent-awareness',
        sessions,
        codexPoller,
        hookMode: readHookMode(dataDir),
        diagnostics: buildDiagnostics({ store, rolloutPoller })
      })
      return
    }
    if (request.method === 'GET' && url.pathname === '/api/sessions') {
      sendJson(response, 200, {
        ok: true,
        sessions: store.listSessions()
      })
      return
    }
    if (request.method === 'GET' && url.pathname === '/dashboard.js') {
      sendFile(response, path.join(dashboardDir, 'dashboard.js'), 'application/javascript; charset=utf-8')
      return
    }
    if (request.method === 'GET' && url.pathname === '/styles.css') {
      sendFile(response, path.join(dashboardDir, 'styles.css'), 'text/css; charset=utf-8')
      return
    }
    if (request.method === 'GET' && url.pathname === '/favicon.ico') {
      sendEmpty(response, 204)
      return
    }
    if (request.method === 'GET' && url.pathname === '/') {
      sendFile(response, path.join(dashboardDir, 'index.html'), 'text/html; charset=utf-8')
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/events') {
      try {
        const ingestToken = readOptionalIngestToken(dataDir)
        if (!isAuthorized({ request, token: ingestToken })) {
          sendJson(response, 401, { ok: false, error: 'Unauthorized' })
          return
        }
        const body = await readJsonBody(request)
        const result = await handleEvent(body)
        sendJson(response, 200, { ok: true, event: result.event, session: result.session })
      } catch (error) {
        sendJson(response, 400, { ok: false, error: error?.message || 'Event ingestion failed' })
      }
      return
    }
    sendJson(response, 404, { ok: false, error: 'Not found' })
  }

  const start = async (port = DEFAULT_PORT) => {
    if (server) return server
    rolloutPoller = createRolloutPoller({
      onEvent: (event, meta) => handleEvent(event, meta)
    })
    server = http.createServer((request, response) => {
      handleRequest(request, response).catch((error) => {
        sendJson(response, 500, { ok: false, error: error?.message || 'Agent Awareness service failed' })
      })
    })
    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
    rolloutPoller.start()
    return server
  }

  const close = async () => {
    rolloutPoller?.stop?.()
    rolloutPoller = null
    if (!server) return
    const currentServer = server
    server = null
    await new Promise((resolve, reject) => currentServer.close((error) => error ? reject(error) : resolve()))
  }

  return {
    close,
    get server() {
      return server
    },
    handleEvent,
    start,
    store
  }
}

if (require.main === module) {
  const service = createAgentAwarenessServer()
  service.start(Number(process.env.PORT) || DEFAULT_PORT).catch((error) => {
    console.error(error?.message || 'Failed to start Agent Awareness service')
    process.exit(1)
  })
}

module.exports = {
  DEFAULT_PORT,
  buildDiagnostics,
  createAgentAwarenessServer
}
