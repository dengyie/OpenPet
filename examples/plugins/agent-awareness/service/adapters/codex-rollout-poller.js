const fs = require('fs')
const os = require('os')
const path = require('path')

const DEFAULT_SCAN_INTERVAL_MS = 3000
const DEFAULT_MAX_FILES = 12
const DEFAULT_MAX_LINES_PER_FILE = 400
const DEFAULT_MAX_SCAN_DEPTH = 5
const DEFAULT_MAX_TAIL_BYTES = 256 * 1024

const resolveCodexHome = ({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex') } = {}) => codexHome

const listRolloutFiles = ({
  codexHome = resolveCodexHome(),
  maxFiles = DEFAULT_MAX_FILES,
  maxDepth = DEFAULT_MAX_SCAN_DEPTH
} = {}) => {
  const dirs = [
    path.join(codexHome, 'sessions'),
    path.join(codexHome, 'archived_sessions')
  ]
  const files = []
  const visitDir = (dir, depth) => {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (_) {
      return
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < maxDepth) visitDir(entryPath, depth + 1)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
      try {
        const stat = fs.statSync(entryPath)
        files.push({ filePath: entryPath, mtimeMs: stat.mtimeMs, size: stat.size })
      } catch (_) {}
    }
  }
  for (const dir of dirs) visitDir(dir, 0)
  return files
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, Math.max(1, Number(maxFiles) || DEFAULT_MAX_FILES))
}

const safeJsonParse = (line) => {
  try {
    return JSON.parse(line)
  } catch (_) {
    return null
  }
}

const parseTimestamp = (value, fallbackMs = Date.now()) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : fallbackMs
}

const isoFromValue = (value, fallbackMs = Date.now()) => new Date(parseTimestamp(value, fallbackMs)).toISOString()

const sessionIdFromFile = (filePath) => {
  const basename = path.basename(filePath, '.jsonl')
  const match = basename.match(/(019[a-z0-9-]{28,})$/i)
  return match ? match[1] : basename
}

const eventFromRolloutRecord = ({ filePath, record, sessionMeta = {}, fallbackTimestamp }) => {
  const payload = record?.payload || {}
  if (record?.type === 'session_meta') {
    return {
      adapter: 'codex',
      sessionId: payload.id || sessionIdFromFile(filePath),
      type: 'session.started',
      status: 'working',
      message: 'Codex session detected.',
      cwd: payload.cwd || '',
      timestamp: isoFromValue(payload.timestamp || record.timestamp, fallbackTimestamp)
    }
  }
  if (record?.type !== 'event_msg') return null

  const eventType = payload.type
  if (eventType === 'task_started') {
    return {
      adapter: 'codex',
      sessionId: sessionMeta.id || sessionIdFromFile(filePath),
      type: 'turn.started',
      status: 'thinking',
      message: 'Codex started a turn.',
      cwd: sessionMeta.cwd || '',
      timestamp: isoFromValue(record.timestamp || payload.started_at, fallbackTimestamp)
    }
  }
  if (eventType === 'task_complete') {
    return {
      adapter: 'codex',
      sessionId: sessionMeta.id || sessionIdFromFile(filePath),
      type: 'turn.completed',
      status: 'completed',
      message: 'Codex completed a turn.',
      cwd: sessionMeta.cwd || '',
      timestamp: isoFromValue(record.timestamp || payload.completed_at, fallbackTimestamp)
    }
  }
  if (eventType === 'turn_aborted') {
    return {
      adapter: 'codex',
      sessionId: sessionMeta.id || sessionIdFromFile(filePath),
      type: 'failed',
      status: 'failed',
      message: 'Codex turn stopped before completion.',
      cwd: sessionMeta.cwd || '',
      timestamp: isoFromValue(record.timestamp || payload.completed_at, fallbackTimestamp)
    }
  }
  if (eventType === 'permission_request') {
    return {
      adapter: 'codex',
      sessionId: sessionMeta.id || sessionIdFromFile(filePath),
      type: 'approval.requested',
      status: 'waiting',
      message: 'Codex is waiting for approval.',
      cwd: sessionMeta.cwd || '',
      timestamp: isoFromValue(record.timestamp, fallbackTimestamp)
    }
  }
  return null
}

const readFirstLine = (fd, fileSize, maxBytes = 64 * 1024) => {
  const chunks = []
  let offset = 0
  while (offset < fileSize && offset < maxBytes) {
    const chunkSize = Math.min(8192, fileSize - offset, maxBytes - offset)
    const buffer = Buffer.alloc(chunkSize)
    const bytesRead = fs.readSync(fd, buffer, 0, chunkSize, offset)
    if (!bytesRead) break
    chunks.push(buffer.subarray(0, bytesRead))
    const combined = Buffer.concat(chunks)
    const newlineIndex = combined.indexOf(0x0a)
    if (newlineIndex >= 0) return combined.subarray(0, newlineIndex).toString('utf-8').replace(/\r$/, '')
    offset += bytesRead
  }
  return Buffer.concat(chunks).toString('utf-8').split(/\r?\n/, 1)[0] || ''
}

const readRolloutLines = ({ filePath, maxLines, maxTailBytes = DEFAULT_MAX_TAIL_BYTES }) => {
  let fd = null
  try {
    fd = fs.openSync(filePath, 'r')
    const stat = fs.fstatSync(fd)
    if (!stat.size) return []
    const tailBytes = Math.min(stat.size, Math.max(8192, Number(maxTailBytes) || DEFAULT_MAX_TAIL_BYTES))
    const tailBuffer = Buffer.alloc(tailBytes)
    fs.readSync(fd, tailBuffer, 0, tailBytes, stat.size - tailBytes)
    const allTailLines = tailBuffer.toString('utf-8').split(/\r?\n/).filter(Boolean)
    const tailLines = allTailLines.slice(-Math.max(1, maxLines))
    const firstLine = tailBytes === stat.size
      ? allTailLines[0]
      : readFirstLine(fd, stat.size)
    return [...new Set([firstLine, ...tailLines].filter(Boolean))]
  } catch (_) {
    return []
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch (_) {}
    }
  }
}

const readRolloutEvents = ({
  filePath,
  maxLines = DEFAULT_MAX_LINES_PER_FILE
}) => {
  const lines = readRolloutLines({ filePath, maxLines })
  const events = []
  let sessionMeta = {}
  const fallbackTimestamp = Date.now()
  for (const line of lines) {
    const record = safeJsonParse(line)
    if (!record) continue
    if (record.type === 'session_meta') {
      sessionMeta = {
        id: record.payload?.id || sessionIdFromFile(filePath),
        cwd: record.payload?.cwd || '',
        timestamp: record.payload?.timestamp || record.timestamp
      }
    }
    const event = eventFromRolloutRecord({ filePath, record, sessionMeta, fallbackTimestamp })
    if (event) events.push(event)
  }
  return events
}

const createCodexRolloutPoller = ({
  codexHome = resolveCodexHome(),
  scanIntervalMs = DEFAULT_SCAN_INTERVAL_MS,
  maxFiles = DEFAULT_MAX_FILES,
  maxLinesPerFile = DEFAULT_MAX_LINES_PER_FILE,
  onEvent = async () => {},
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  now = () => Date.now()
} = {}) => {
  const seen = new Set()
  let timer = null
  let running = false
  let lastScanAt = ''
  let lastError = ''
  let hasCompletedScan = false

  const scanOnce = async () => {
    if (running) return { scanned: 0, emitted: 0, skipped: true }
    running = true
    lastScanAt = new Date(now()).toISOString()
    let scanned = 0
    let emitted = 0
    try {
      const initial = !hasCompletedScan
      for (const file of listRolloutFiles({ codexHome, maxFiles })) {
        scanned += 1
        const events = readRolloutEvents({ filePath: file.filePath, maxLines: maxLinesPerFile })
        for (const event of events) {
          const key = `${file.filePath}:${event.type}:${event.timestamp}`
          if (seen.has(key)) continue
          seen.add(key)
          emitted += 1
          await onEvent(event, { initial })
        }
      }
      lastError = ''
      return { scanned, emitted, skipped: false }
    } catch (error) {
      lastError = error.message || 'Codex rollout poll failed'
      return { scanned, emitted, skipped: false, error: lastError }
    } finally {
      hasCompletedScan = true
      running = false
    }
  }

  const start = () => {
    if (timer) return
    timer = setIntervalFn(() => { scanOnce().catch(() => {}) }, Math.max(1000, Number(scanIntervalMs) || DEFAULT_SCAN_INTERVAL_MS))
    timer.unref?.()
    scanOnce().catch(() => {})
  }

  const stop = () => {
    if (!timer) return
    clearIntervalFn(timer)
    timer = null
  }

  return {
    getStatus: () => ({
      enabled: true,
      codexHome,
      lastScanAt,
      lastError,
      seenCount: seen.size
    }),
    scanOnce,
    start,
    stop
  }
}

module.exports = {
  createCodexRolloutPoller,
  eventFromRolloutRecord,
  listRolloutFiles,
  readRolloutEvents,
  readRolloutLines,
  resolveCodexHome
}
