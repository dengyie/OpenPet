const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { normalizeCodexEvent } = require('./adapters/codex')
const { createCodexRolloutPoller } = require('./adapters/codex-rollout-poller')
const { createServiceBridgeClient } = require('./bridge-client')
const { createSessionStore } = require('./session-store')
const { createAgentStateMapper } = require('./state-mapper')

const DEFAULT_PORT = 8795
const MAX_BODY_BYTES = 64 * 1024
const INGEST_TOKEN_FILE = 'ingest-token.txt'

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

const sendText = (response, statusCode, text, contentType) => {
  response.writeHead(statusCode, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
  response.end(text)
}

const readJsonBody = (request, maxBytes = MAX_BODY_BYTES) => new Promise((resolve, reject) => {
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
    if (Buffer.byteLength(body) > maxBytes) {
      reject(new Error('Request body is too large'))
      request.destroy()
    }
  })
  request.on('end', () => {
    try {
      resolve(body.trim() ? JSON.parse(body) : {})
    } catch (_) {
      reject(new Error('Request body must be valid JSON'))
    }
  })
  request.on('error', reject)
})

const getDashboardAsset = (dashboardDir, requestPath) => {
  const assetName = requestPath === '/' ? 'index.html' : requestPath.replace(/^\//, '')
  if (!['index.html', 'dashboard.js', 'styles.css'].includes(assetName)) return null
  return path.join(dashboardDir, assetName)
}

const extractBearerToken = (header = '') => {
  const match = String(header || '').match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : ''
}

const readIngestToken = (dataDir) => {
  const tokenPath = path.join(dataDir || '', INGEST_TOKEN_FILE)
  try {
    return fs.readFileSync(tokenPath, 'utf-8').trim()
  } catch (_) {
    return ''
  }
}

const assertIngestAuthorized = ({ request, dataDir }) => {
  const expected = readIngestToken(dataDir)
  if (!expected) throw new Error('Agent Awareness ingest token is not configured. Run Prepare Codex Hook Instructions first.')
  const actual = extractBearerToken(request.headers.authorization)
  const actualBuffer = Buffer.from(String(actual || ''))
  const expectedBuffer = Buffer.from(String(expected || ''))
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('Unauthorized agent event')
  }
}

const createAgentAwarenessServer = ({
  dataDir = process.env.OPENPET_DATA_DIR,
  dashboardDir = path.join(__dirname, '..', 'web', 'dashboard'),
  bridgeClient = createServiceBridgeClient(),
  store = createSessionStore({ dataDir }),
  mapper = createAgentStateMapper(),
  rolloutPoller = null,
  autoStartRolloutPoller = process.env.OPENPET_AGENT_AWARENESS_CODEX_POLL !== '0',
  createRolloutPoller = createCodexRolloutPoller,
  createServer = http.createServer,
  now = () => new Date().toISOString()
} = {}) => {
  const handleEvent = async (payload, { notifyPet = true } = {}) => {
    const event = normalizeCodexEvent(payload, { now })
    const previousSession = store.listSessions().find((session) => session.sessionId === event.sessionId)
    const update = mapper.mapEvent({ event, previousSession })
    const session = store.upsertEvent(event)
    if (notifyPet) {
      await bridgeClient.event(update.petEvent)
      if (update.speech) await bridgeClient.say(update.speech)
    }
    return { event, session }
  }

  const poller = rolloutPoller || (autoStartRolloutPoller
    ? createRolloutPoller({
        onEvent: (event, metadata = {}) => handleEvent(event, { notifyPet: !metadata.initial })
      })
    : null)

  const handleRequest = async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1')
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, {
          ok: true,
          service: 'agent-awareness',
          codexPoller: poller?.getStatus?.() || { enabled: false }
        })
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/sessions') {
        sendJson(response, 200, { ok: true, sessions: store.listSessions() })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/events') {
        assertIngestAuthorized({ request, dataDir })
        const result = await handleEvent(await readJsonBody(request))
        sendJson(response, 200, { ok: true, session: result.session, event: result.event })
        return
      }
      if (request.method === 'GET') {
        const assetPath = getDashboardAsset(dashboardDir, url.pathname)
        if (assetPath && fs.existsSync(assetPath)) {
          const ext = path.extname(assetPath)
          const type = ext === '.js' ? 'application/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8'
          sendText(response, 200, fs.readFileSync(assetPath, 'utf-8'), type)
          return
        }
      }
      sendJson(response, 404, { ok: false, error: 'Not found' })
    } catch (error) {
      const statusCode = /Unauthorized|token is not configured/i.test(error.message || '')
        ? 401
        : (/too large|valid JSON/i.test(error.message || '') ? 400 : 500)
      sendJson(response, statusCode, {
        ok: false,
        error: error.message || 'Agent Awareness service failed'
      })
    }
  }

  const server = createServer(handleRequest)
  return {
    handleEvent,
    poller,
    server,
    start: (port = DEFAULT_PORT, host = '127.0.0.1') => new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => {
        server.off?.('error', reject)
        poller?.start?.()
        resolve(server.address())
      })
    }),
    close: () => {
      poller?.stop?.()
      return new Promise((resolve) => server.close(() => resolve()))
    }
  }
}

const parsePort = (argv = process.argv) => {
  const index = argv.indexOf('--port')
  const raw = index >= 0 ? argv[index + 1] : process.env.OPENPET_AGENT_AWARENESS_PORT
  const value = Number(raw || DEFAULT_PORT)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_PORT
}

if (require.main === module) {
  const service = createAgentAwarenessServer()
  service.start(parsePort()).catch((error) => {
    process.stderr.write(`${error.message || 'Agent Awareness service failed'}\n`)
    process.exitCode = 1
  })
}

module.exports = { createAgentAwarenessServer, parsePort }
