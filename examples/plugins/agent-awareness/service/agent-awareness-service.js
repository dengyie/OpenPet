const crypto = require('crypto')
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
const DEFAULT_DEDUPE_MAX_ENTRIES = 256
const DEFAULT_DEDUPE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEDUPE_FILE = 'event-dedupe.json'

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

const cloneJson = (value) => JSON.parse(JSON.stringify(value))

const toTimeMs = (value) => {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const hashEventId = (parts) => crypto
  .createHash('sha256')
  .update(`openpet-agent-event\0${JSON.stringify(parts)}`)
  .digest('hex')

const deriveEventId = (rawEvent = {}, event = {}) => {
  const explicitId = sanitizeText(rawEvent.eventId || rawEvent.event_id || rawEvent.id || '', 160)
  if (explicitId) return hashEventId(['explicit', explicitId])
  return hashEventId([
    'derived',
    sanitizeText(rawEvent.source || rawEvent.lastSource || event.lastSource || event.adapter || '', 32),
    sanitizeText(
      rawEvent.sessionId || rawEvent.session_id || rawEvent.conversationId || rawEvent.filePath || event.sessionId || '',
      160
    ),
    sanitizeText(rawEvent.turnId || rawEvent.turn_id || rawEvent.runId || rawEvent.run_id || '', 160),
    sanitizeText(rawEvent.toolUseId || rawEvent.tool_use_id || rawEvent.callId || rawEvent.call_id || '', 160),
    sanitizeText(rawEvent.type || rawEvent.event || rawEvent.name || rawEvent.hook_event_name || event.type || '', 64),
    sanitizeText(rawEvent.timestamp || '', 40)
  ])
}

const createEventDedupeStore = ({
  dataDir,
  now,
  maxEntries = DEFAULT_DEDUPE_MAX_ENTRIES,
  ttlMs = DEFAULT_DEDUPE_TTL_MS
}) => {
  const filePath = path.join(dataDir, DEDUPE_FILE)
  const boundedMaxEntries = Math.max(1, Math.floor(Number(maxEntries) || DEFAULT_DEDUPE_MAX_ENTRIES))
  const boundedTtlMs = Math.max(1, Math.floor(Number(ttlMs) || DEFAULT_DEDUPE_TTL_MS))
  let entries = []

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    entries = Array.isArray(parsed?.entries)
      ? parsed.entries.filter((entry) => (
          entry && typeof entry.id === 'string' && entry.result && typeof entry.result === 'object'
        ))
      : []
  } catch (error) {
    if (error?.code !== 'ENOENT') entries = []
  }

  const prune = () => {
    const currentTime = toTimeMs(now()) || Date.now()
    entries = entries
      .filter((entry) => {
        const committedAt = toTimeMs(entry.committedAt)
        return committedAt > 0 && currentTime - committedAt <= boundedTtlMs
      })
      .sort((left, right) => toTimeMs(left.committedAt) - toTimeMs(right.committedAt))
      .slice(-boundedMaxEntries)
  }

  const persist = () => {
    fs.mkdirSync(dataDir, { recursive: true })
    const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify({ version: 1, entries }, null, 2))
      fs.renameSync(temporaryPath, filePath)
    } finally {
      try {
        fs.rmSync(temporaryPath, { force: true })
      } catch (_) {}
    }
  }

  prune()

  return {
    get: (id) => {
      const previousLength = entries.length
      prune()
      if (entries.length !== previousLength) persist()
      const entry = entries.find((candidate) => candidate.id === id)
      return entry ? cloneJson(entry.result) : null
    },
    set: (id, result) => {
      entries = entries.filter((entry) => entry.id !== id)
      entries.push({ id, committedAt: now(), result: cloneJson(result) })
      prune()
      persist()
      return cloneJson(result)
    }
  }
}

const toFiniteNumber = (value) => {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const roundSix = (value) => Math.round(value * 1_000_000) / 1_000_000

const ATTENTION_STATUS = {
  waiting: { score: 60, reason: 'Waiting for user input' },
  blocked: { score: 55, reason: 'Blocked and needs review' },
  failed: { score: 50, reason: 'Failed and needs review' },
  working: { score: 30, reason: 'Working now' },
  thinking: { score: 20, reason: 'Thinking through next step' }
}

const toTimestampMs = (value) => {
  const numeric = Date.parse(String(value || ''))
  return Number.isFinite(numeric) ? numeric : 0
}

const buildUsageDiagnostics = (sessions = []) => {
  const totals = {
    usageTotalTokens: 0,
    usageInputTokens: 0,
    usageOutputTokens: 0,
    usageCachedInputTokens: 0,
    usageEstimatedCostUsd: null,
    usageCurrency: '',
    usagePeakContextUsedPercent: null
  }
  const currencies = new Set()
  for (const session of sessions) {
    const usage = session?.usage && typeof session.usage === 'object' ? session.usage : null
    if (!usage) continue
    const totalTokens = toFiniteNumber(usage.totalTokens)
    const inputTokens = toFiniteNumber(usage.inputTokens)
    const outputTokens = toFiniteNumber(usage.outputTokens)
    const cachedInputTokens = toFiniteNumber(usage.cachedInputTokens)
    const estimatedCostUsd = toFiniteNumber(usage.estimatedCostUsd)
    const contextUsedPercent = toFiniteNumber(usage.contextUsedPercent)
    if (totalTokens != null) totals.usageTotalTokens += Math.round(totalTokens)
    if (inputTokens != null) totals.usageInputTokens += Math.round(inputTokens)
    if (outputTokens != null) totals.usageOutputTokens += Math.round(outputTokens)
    if (cachedInputTokens != null) totals.usageCachedInputTokens += Math.round(cachedInputTokens)
    if (estimatedCostUsd != null) totals.usageEstimatedCostUsd = roundSix((totals.usageEstimatedCostUsd || 0) + estimatedCostUsd)
    if (contextUsedPercent != null) {
      totals.usagePeakContextUsedPercent = totals.usagePeakContextUsedPercent == null
        ? contextUsedPercent
        : Math.max(totals.usagePeakContextUsedPercent, contextUsedPercent)
    }
    if (usage.currency) currencies.add(sanitizeText(usage.currency, 8).toUpperCase())
  }
  totals.usageCurrency = currencies.size === 1 ? [...currencies][0] : currencies.size > 1 ? 'MIXED' : ''
  return totals
}

const buildAttentionSession = (sessions = []) => {
  const candidates = sessions
    .map((session) => {
      const status = sanitizeText(session?.status || '', 32).toLowerCase()
      const meta = ATTENTION_STATUS[status]
      return {
        sessionId: sanitizeText(session?.sessionId || '', 64),
        project: sanitizeText(session?.project || '', 96),
        status,
        reason: meta?.reason || '',
        score: meta?.score || 0,
        timestampMs: toTimestampMs(session?.timestamp)
      }
    })
    .filter((session) => session.sessionId && session.score > 0)
    .sort((left, right) => (
      right.score - left.score ||
      right.timestampMs - left.timestampMs ||
      left.sessionId.localeCompare(right.sessionId)
    ))
  const attention = candidates[0]
  if (!attention) return null
  return {
    sessionId: attention.sessionId,
    project: attention.project,
    status: attention.status,
    reason: attention.reason
  }
}

const buildDiagnostics = ({ store, rolloutPoller }) => {
  const status = store.getStatus()
  const dashboardState = typeof store.getDashboardState === 'function'
    ? store.getDashboardState()
    : {
        liveSessions: store.listSessions(),
        sessionSummaries: [],
        dailyUsageRollups: []
      }
  const trackedSessions = Array.isArray(dashboardState.liveSessions) ? dashboardState.liveSessions : []
  const sessionSummaries = Array.isArray(dashboardState.sessionSummaries) ? dashboardState.sessionSummaries : []
  const usageDiagnostics = buildUsageDiagnostics(trackedSessions)
  const codexPoller = sanitizePollerStatus(rolloutPoller?.getStatus?.() || { enabled: false })
  const retainedProjects = new Set(sessionSummaries.map((item) => sanitizeText(item?.project || '', 96)).filter(Boolean))
  const liveSessionCount = status.sessions || trackedSessions.length
  const retainedSessionCount = status.retainedSessionSummaryCount || sessionSummaries.length || liveSessionCount
  return {
    sessionCount: retainedSessionCount,
    liveSessionCount,
    activeSessionCount: trackedSessions.filter((session) => !['idle', 'completed', 'failed'].includes(String(session.status || '').toLowerCase())).length,
    totalEvents: status.totalEvents || 0,
    seenCount: codexPoller.seenCount || 0,
    ignoredContentRecordCount: codexPoller.ignoredContentRecordCount || 0,
    ignoredMetadataRecordCount: codexPoller.ignoredMetadataRecordCount || 0,
    unknownRecordCount: codexPoller.unknownRecordCount || 0,
    malformedRecordCount: codexPoller.malformedRecordCount || 0,
    unsupportedLifecycleRecordCount: codexPoller.unsupportedLifecycleRecordCount || 0,
    storeSchemaVersion: status.storeSchemaVersion || 0,
    retentionDays: status.retentionDays || 0,
    historyWindowStart: status.historyWindowStart || '',
    historyWindowEnd: status.historyWindowEnd || '',
    retainedSessionSummaryCount: retainedSessionCount,
    retainedProjectCount: retainedProjects.size,
    storeError: sanitizeText(status.storeError || '', 160),
    attentionSession: buildAttentionSession(trackedSessions),
    ...usageDiagnostics,
    lastEventAt: status.lastEventAt || '',
    lastScanAt: codexPoller.lastScanAt || '',
    lastError: codexPoller.lastError || ''
  }
}

const createAgentAwarenessServer = ({
  dataDir = process.env.OPENPET_DATA_DIR || path.join(process.cwd(), '.agent-awareness-data'),
  bridgeClient = createBridgeClient(),
  createRolloutPoller = (options) => createCodexRolloutPoller(options),
  now = () => new Date().toISOString(),
  dedupeMaxEntries = DEFAULT_DEDUPE_MAX_ENTRIES,
  dedupeTtlMs = DEFAULT_DEDUPE_TTL_MS
} = {}) => {
  const dashboardDir = path.resolve(__dirname, '..', 'web', 'dashboard')
  const store = createSessionStore({ dataDir })
  const dedupeStore = createEventDedupeStore({
    dataDir,
    now,
    maxEntries: dedupeMaxEntries,
    ttlMs: dedupeTtlMs
  })
  const mapper = createAgentStateMapper()
  const activeIngestions = new Map()
  let server = null
  let rolloutPoller = null

  const normalizeIncomingEvent = (rawEvent) => (
    isCodexHookPayload(rawEvent)
      ? normalizeCodexHookEvent(rawEvent, { now })
      : normalizeCodexEvent(rawEvent, { now })
  )

  const ingestEvent = async ({ event, eventId, initial }) => {
    event.eventId = eventId
    const previousSession = store.listSessions().find((session) => session.sessionId === event.sessionId) || null
    const session = store.upsertEvent(event)
    let notification = { status: 'skipped', retry: 'not-needed' }
    if (!initial) {
      const mapped = mapper.mapEvent({ event, previousSession })
      try {
        if (mapped.petEvent) await bridgeClient.event(mapped.petEvent)
        if (mapped.speech?.text) await bridgeClient.say(mapped.speech)
        notification = { status: 'delivered', retry: 'not-needed' }
      } catch (_) {
        notification = { status: 'failed', retry: 'not-automatic' }
      }
    }
    return dedupeStore.set(eventId, { event, session, notification })
  }

  const handleEvent = async (rawEvent, { initial = false } = {}) => {
    const normalized = normalizeIncomingEvent(rawEvent)
    const eventId = deriveEventId(rawEvent, normalized)
    const committed = dedupeStore.get(eventId)
    if (committed) return committed
    if (activeIngestions.has(eventId)) return cloneJson(await activeIngestions.get(eventId))
    const ingestion = ingestEvent({ event: normalized, eventId, initial })
    activeIngestions.set(eventId, ingestion)
    try {
      return cloneJson(await ingestion)
    } finally {
      if (activeIngestions.get(eventId) === ingestion) activeIngestions.delete(eventId)
    }
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
      const dashboardState = typeof store.getDashboardState === 'function'
        ? store.getDashboardState()
        : {
            liveSessions: store.listSessions(),
            sessionSummaries: [],
            dailyUsageRollups: []
          }
      sendJson(response, 200, {
        ok: true,
        liveSessions: dashboardState.liveSessions,
        sessionSummaries: dashboardState.sessionSummaries,
        dailyUsageRollups: dashboardState.dailyUsageRollups,
        sessions: dashboardState.liveSessions
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
        sendJson(response, 200, { ok: true, event: result.event, session: result.session, notification: result.notification })
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
