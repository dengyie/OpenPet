const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { toProjectLabel } = require('./codex')
const { readGitSummary } = require('../git-summary')
const { normalizeUsageSummary } = require('../usage-summary')

const DEFAULT_SCAN_INTERVAL_MS = 3000
const DEFAULT_MAX_FILES = 24
const DEFAULT_MAX_LINES = 256
const DEFAULT_MAX_DEPTH = 5
const DEFAULT_MAX_TAIL_BYTES = 256 * 1024

const CONTENT_BEARING_EVENT_TYPES = new Set([
  'agent_message',
  'thread_goal_updated',
  'user_message'
])

const CONTENT_BEARING_RESPONSE_TYPES = new Set([
  'tool_search_output',
  'message',
  'reasoning',
  'function_call_output',
  'custom_tool_call_output'
])

const METADATA_EVENT_TYPES = new Set([
  'token_count'
])

const CONTENT_BEARING_KEYS = new Set([
  'arguments',
  'content',
  'encrypted_content',
  'images',
  'input',
  'last_agent_message',
  'local_images',
  'memory_citation',
  'message',
  'output',
  'query',
  'result',
  'stderr',
  'stdout',
  'summary'
  ,
  'text'
])

const METADATA_ONLY_TOP_TYPES = new Set([
  'turn_context'
])

const KNOWN_TOP_TYPES = new Set([
  'compacted',
  'event_msg',
  'response_item',
  'session_meta',
  'turn_context'
])

const CONTENT_BEARING_TOP_TYPES = new Set([
  'compacted'
])

const resolveCodexHome = ({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex') } = {}) => codexHome

const listRolloutFiles = ({
  codexHome = resolveCodexHome(),
  maxFiles = DEFAULT_MAX_FILES,
  maxDepth = DEFAULT_MAX_DEPTH
} = {}) => {
  const roots = [
    path.join(codexHome, 'sessions'),
    path.join(codexHome, 'archived_sessions')
  ]
  const files = []
  const walk = (dirPath, depth) => {
    let entries = []
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch (_) {
      return
    }
    for (const entry of entries) {
      const target = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (depth < maxDepth) walk(target, depth + 1)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
      try {
        const stat = fs.statSync(target)
        files.push({ filePath: target, mtimeMs: stat.mtimeMs, size: stat.size })
      } catch (_) {}
    }
  }
  for (const root of roots) walk(root, 0)
  return files.sort((left, right) => right.mtimeMs - left.mtimeMs).slice(0, maxFiles)
}

const safeParse = (line) => {
  try {
    return JSON.parse(line)
  } catch (_) {
    return null
  }
}

const hashText = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex')

const toIso = (value, fallbackMs = Date.now()) => {
  const parsed = Date.parse(String(value || ''))
  return new Date(Number.isFinite(parsed) ? parsed : fallbackMs).toISOString()
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

const readTailLines = ({ filePath, maxLines = DEFAULT_MAX_LINES, maxTailBytes = DEFAULT_MAX_TAIL_BYTES }) => {
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

const getRecordKey = ({ filePath, line }) => `${filePath}:${hashText(line)}`

const classifyIgnoredRecord = ({ record }) => {
  const topType = typeof record?.type === 'string' ? record.type : ''
  const payload = record && typeof record.payload === 'object' && !Array.isArray(record.payload)
    ? record.payload
    : {}
  const payloadType = typeof payload.type === 'string' ? payload.type : ''
  const payloadKeys = Object.keys(payload)

  if (!topType || !KNOWN_TOP_TYPES.has(topType)) {
    return { bucket: 'unknown', reason: `${topType || 'unknown'}:${payloadType || 'unknown'}` }
  }
  if (CONTENT_BEARING_TOP_TYPES.has(topType)) {
    return { bucket: 'ignoredContent', reason: `${topType}:${payloadType || 'content'}` }
  }

  if (METADATA_ONLY_TOP_TYPES.has(topType)) {
    return { bucket: 'ignoredMetadata', reason: `${topType}:context` }
  }
  if (topType === 'event_msg' && METADATA_EVENT_TYPES.has(payloadType)) {
    return { bucket: 'ignoredMetadata', reason: `${topType}:${payloadType}` }
  }
  if (
    (topType === 'event_msg' && CONTENT_BEARING_EVENT_TYPES.has(payloadType)) ||
    (topType === 'response_item' && CONTENT_BEARING_RESPONSE_TYPES.has(payloadType)) ||
    payloadKeys.some((key) => CONTENT_BEARING_KEYS.has(key))
  ) {
    return { bucket: 'ignoredContent', reason: `${topType}:${payloadType || 'content'}` }
  }
  if (topType === 'session_meta') {
    return { bucket: 'ignoredMetadata', reason: `${topType}:metadata` }
  }
  if ((topType === 'event_msg' || topType === 'response_item') && !payloadType) {
    return { bucket: 'unknown', reason: `${topType}:unknown` }
  }
  return { bucket: 'unsupportedLifecycle', reason: `${topType}:${payloadType || 'unknown'}` }
}

const createEventFromRecord = ({
  filePath,
  record,
  sessionMeta = {},
  fallbackTimestamp,
  gitSummaryProvider = ({ cwd }) => readGitSummary({ cwd })
}) => {
  const payload = record?.payload || {}
  if (record?.type === 'session_meta') {
    return {
      sessionId: payload.id || filePath,
      type: 'session.discovered',
      status: 'idle',
      message: '',
      projectLabel: toProjectLabel(payload.cwd || ''),
      timestamp: toIso(payload.timestamp || record.timestamp, fallbackTimestamp)
    }
  }
  if (record?.type === 'turn_context') {
    const cwd = payload.cwd || sessionMeta.cwd || ''
    let git = null
    try {
      git = gitSummaryProvider({ cwd, record, sessionMeta })
    } catch (_) {
      git = null
    }
    if (!git) return null
    const projectLabel = git.repository || toProjectLabel(cwd || sessionMeta.cwd || '')
    return {
      sessionId: sessionMeta.id || filePath,
      type: 'project.git',
      status: 'working',
      message: 'Codex project git metadata updated.',
      projectLabel,
      git,
      summary: {
        title: git.branch && projectLabel ? `${projectLabel} on ${git.branch}` : projectLabel,
        currentStep: 'project.git',
        recentProgressHint: git.dirty ? `${git.dirtyCount || 0} changed files` : 'Working tree clean'
      },
      timestamp: toIso(record.timestamp, fallbackTimestamp)
    }
  }
  if (record?.type === 'event_msg') {
    if (payload.type === 'token_count') {
      const usage = normalizeUsageSummary(payload)
      if (!usage) return null
      return {
        sessionId: sessionMeta.id || filePath,
        type: 'turn.usage',
        status: 'working',
        message: 'Codex usage metadata updated.',
        projectLabel: toProjectLabel(sessionMeta.cwd || ''),
        usage,
        summary: {
          title: toProjectLabel(sessionMeta.cwd || ''),
          currentStep: 'turn.usage',
          recentProgressHint: usage.totalTokens != null ? `${usage.totalTokens} tokens observed` : 'Usage metadata updated'
        },
        timestamp: toIso(record.timestamp, fallbackTimestamp)
      }
    }
    if (payload.type === 'task_started') {
      return {
        sessionId: sessionMeta.id || filePath,
        type: 'turn.started',
        status: 'thinking',
        message: 'Codex started a turn.',
        projectLabel: toProjectLabel(sessionMeta.cwd || ''),
        timestamp: toIso(record.timestamp || payload.started_at, fallbackTimestamp)
      }
    }
    if (payload.type === 'task_complete') {
      return {
        sessionId: sessionMeta.id || filePath,
        type: 'turn.completed',
        status: 'completed',
        message: 'Codex completed a turn.',
        projectLabel: toProjectLabel(sessionMeta.cwd || ''),
        timestamp: toIso(record.timestamp || payload.completed_at, fallbackTimestamp)
      }
    }
    if (payload.type === 'permission_request') {
      return {
        sessionId: sessionMeta.id || filePath,
        type: 'approval.requested',
        status: 'waiting',
        message: 'Codex needs approval.',
        projectLabel: toProjectLabel(sessionMeta.cwd || ''),
        timestamp: toIso(record.timestamp, fallbackTimestamp)
      }
    }
    if (payload.type === 'turn_aborted') {
      return {
        sessionId: sessionMeta.id || filePath,
        type: 'turn.failed',
        status: 'failed',
        message: 'Codex stopped before completion.',
        projectLabel: toProjectLabel(sessionMeta.cwd || ''),
        timestamp: toIso(record.timestamp || payload.completed_at, fallbackTimestamp)
      }
    }
    if (payload.type === 'thread_rolled_back') {
      return {
        sessionId: sessionMeta.id || filePath,
        type: 'turn.rolled-back',
        status: 'working',
        message: 'Codex rolled back recent turns.',
        projectLabel: toProjectLabel(sessionMeta.cwd || ''),
        timestamp: toIso(record.timestamp, fallbackTimestamp)
      }
    }
    if (payload.type === 'context_compacted') {
      return {
        sessionId: sessionMeta.id || filePath,
        type: 'context.compacted',
        status: 'working',
        message: 'Codex compacted context to continue.',
        projectLabel: toProjectLabel(sessionMeta.cwd || ''),
        timestamp: toIso(record.timestamp, fallbackTimestamp)
      }
    }
    if (payload.type === 'patch_apply_end') {
      return {
        sessionId: sessionMeta.id || filePath,
        type: 'tool.completed',
        status: 'working',
        message: 'Codex applied a patch.',
        projectLabel: toProjectLabel(sessionMeta.cwd || ''),
        timestamp: toIso(record.timestamp, fallbackTimestamp)
      }
    }
    if (payload.type === 'mcp_tool_call_end') {
      return {
        sessionId: sessionMeta.id || filePath,
        type: 'tool.completed',
        status: 'working',
        message: 'Codex completed an MCP tool call.',
        projectLabel: toProjectLabel(sessionMeta.cwd || ''),
        timestamp: toIso(record.timestamp, fallbackTimestamp)
      }
    }
    if (payload.type === 'web_search_end') {
      return {
        sessionId: sessionMeta.id || filePath,
        type: 'tool.completed',
        status: 'working',
        message: 'Codex completed a web search.',
        projectLabel: toProjectLabel(sessionMeta.cwd || ''),
        timestamp: toIso(record.timestamp, fallbackTimestamp)
      }
    }
  }
  if (record?.type === 'response_item' && payload?.type === 'function_call') {
    return {
      sessionId: sessionMeta.id || filePath,
      type: 'tool.started',
      status: 'working',
      message: 'Codex started a tool call.',
      projectLabel: toProjectLabel(sessionMeta.cwd || ''),
      timestamp: toIso(record.timestamp, fallbackTimestamp),
      toolName: String(payload.name || '').trim()
    }
  }
  if (record?.type === 'response_item' && payload?.type === 'web_search_call') {
    return {
      sessionId: sessionMeta.id || filePath,
      type: 'tool.started',
      status: 'working',
      message: 'Codex started a web search.',
      projectLabel: toProjectLabel(sessionMeta.cwd || ''),
      timestamp: toIso(record.timestamp, fallbackTimestamp),
      toolName: 'web_search'
    }
  }
  return null
}

const readRolloutEvents = ({
  filePath,
  maxLines = DEFAULT_MAX_LINES,
  gitSummaryProvider
} = {}) => inspectRolloutFile({ filePath, maxLines, gitSummaryProvider }).events

const inspectRolloutFile = ({
  filePath,
  maxLines = DEFAULT_MAX_LINES,
  gitSummaryProvider
} = {}) => {
  const lines = readTailLines({ filePath, maxLines })
  const events = []
  const malformedRecordKeys = []
  const unknownRecordKeys = []
  const ignoredContentRecordKeys = []
  const ignoredMetadataRecordKeys = []
  const unsupportedLifecycleRecordKeys = []
  let sessionMeta = {}
  const fallbackTimestamp = Date.now()

  for (const line of lines) {
    const recordKey = getRecordKey({ filePath, line })
    const record = safeParse(line)
    if (!record) {
      malformedRecordKeys.push(recordKey)
      continue
    }
    if (record.type === 'session_meta') {
      sessionMeta = {
        id: record.payload?.id || filePath,
        cwd: record.payload?.cwd || ''
      }
    }
    const event = createEventFromRecord({ filePath, record, sessionMeta, fallbackTimestamp, gitSummaryProvider })
    if (event) {
      events.push({ event, recordKey })
      continue
    }
    const ignored = classifyIgnoredRecord({ record })
    if (ignored.bucket === 'ignoredContent') ignoredContentRecordKeys.push(recordKey)
    else if (ignored.bucket === 'ignoredMetadata') ignoredMetadataRecordKeys.push(recordKey)
    else if (ignored.bucket === 'unsupportedLifecycle') unsupportedLifecycleRecordKeys.push(recordKey)
    else unknownRecordKeys.push(recordKey)
  }

  return {
    events: events.map(({ event }) => event),
    eventRecordKeys: events.map(({ recordKey }) => recordKey),
    ignoredContentRecordKeys,
    ignoredMetadataRecordKeys,
    malformedRecordKeys,
    unknownRecordKeys,
    unsupportedLifecycleRecordKeys
  }
}

const createCodexRolloutPoller = ({
  codexHome = resolveCodexHome(),
  scanIntervalMs = DEFAULT_SCAN_INTERVAL_MS,
  maxFiles = DEFAULT_MAX_FILES,
  maxLines = DEFAULT_MAX_LINES,
  onEvent = async () => {},
  now = () => Date.now(),
  gitSummaryProvider,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) => {
  let timer = null
  let running = false
  let hasCompletedScan = false
  let lastScanAt = ''
  let lastError = ''
  let unknownRecordCount = 0
  let malformedRecordCount = 0
  let ignoredContentRecordCount = 0
  let ignoredMetadataRecordCount = 0
  let unsupportedLifecycleRecordCount = 0
  const seen = new Set()
  const seenMalformed = new Set()
  const seenIgnoredContent = new Set()
  const seenIgnoredMetadata = new Set()
  const seenUnknown = new Set()
  const seenUnsupportedLifecycle = new Set()

  const scanOnce = async () => {
    if (running) return { skipped: true, scanned: 0, emitted: 0 }
    running = true
    const initial = !hasCompletedScan
    lastScanAt = new Date(now()).toISOString()
    let scanned = 0
    let emitted = 0
    try {
      for (const file of listRolloutFiles({ codexHome, maxFiles })) {
        scanned += 1
        const inspection = inspectRolloutFile({ filePath: file.filePath, maxLines, gitSummaryProvider })
        for (const malformedKey of inspection.malformedRecordKeys) {
          if (seenMalformed.has(malformedKey)) continue
          seenMalformed.add(malformedKey)
          malformedRecordCount += 1
        }
        for (const ignoredContentKey of inspection.ignoredContentRecordKeys) {
          if (seenIgnoredContent.has(ignoredContentKey)) continue
          seenIgnoredContent.add(ignoredContentKey)
          ignoredContentRecordCount += 1
        }
        for (const ignoredMetadataKey of inspection.ignoredMetadataRecordKeys) {
          if (seenIgnoredMetadata.has(ignoredMetadataKey)) continue
          seenIgnoredMetadata.add(ignoredMetadataKey)
          ignoredMetadataRecordCount += 1
        }
        for (const unsupportedLifecycleKey of inspection.unsupportedLifecycleRecordKeys) {
          if (seenUnsupportedLifecycle.has(unsupportedLifecycleKey)) continue
          seenUnsupportedLifecycle.add(unsupportedLifecycleKey)
          unsupportedLifecycleRecordCount += 1
        }
        for (const unknownKey of inspection.unknownRecordKeys) {
          if (seenUnknown.has(unknownKey)) continue
          seenUnknown.add(unknownKey)
          unknownRecordCount += 1
        }
        for (const [index, event] of inspection.events.entries()) {
          const key = `${file.filePath}:${inspection.eventRecordKeys[index] || `${event.type}:${event.timestamp}`}`
          if (seen.has(key)) continue
          seen.add(key)
          emitted += 1
          await onEvent(event, { initial })
        }
      }
      lastError = ''
      return { skipped: false, scanned, emitted }
    } catch (error) {
      lastError = error?.message || 'Codex rollout scan failed'
      return { skipped: false, scanned, emitted, error: lastError }
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
      lastScanAt,
      lastError,
      seenCount: seen.size,
      ignoredContentRecordCount,
      ignoredMetadataRecordCount,
      unknownRecordCount,
      malformedRecordCount,
      unsupportedLifecycleRecordCount
    }),
    scanOnce,
    start,
    stop
  }
}

module.exports = {
  classifyIgnoredRecord,
  createCodexRolloutPoller,
  inspectRolloutFile,
  listRolloutFiles,
  readRolloutEvents,
  resolveCodexHome
}
