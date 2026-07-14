const fs = require('fs')
const path = require('path')

const SAFE_RUN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/
const SAFE_ARTIFACT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/
const MAX_STRING_CHARS = 4000
const MAX_ARRAY_ITEMS = 100
const MAX_OBJECT_KEYS = 160
const MAX_DEPTH = 10

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const resolveInside = (dataDir, relativePath) => {
  const root = path.resolve(dataDir)
  const target = path.resolve(root, relativePath)
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error('Hatch-pet agent path escaped the Creator Studio data directory')
  }
  return target
}

const assertRunId = (runId) => {
  const normalized = String(runId || '').trim()
  if (!SAFE_RUN_ID_PATTERN.test(normalized)) throw new Error('Hatch-pet agent runId is invalid')
  return normalized
}

const assertArtifactId = (value, label) => {
  const normalized = String(value || '').trim()
  if (!SAFE_ARTIFACT_ID_PATTERN.test(normalized)) {
    throw new Error(`Hatch-pet agent ${label} is invalid`)
  }
  return normalized
}

const normalizeRelativePath = (value) => {
  const normalized = String(value || '').trim().replace(/\\/g, '/')
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split('/').includes('..')
  ) return ''
  return normalized.slice(0, 1000)
}

const shouldDropKey = (key) => (
  /^(authorization|headers?|rawProviderResponse|rawResponse|hiddenReasoning|reasoning)$/i.test(key) ||
  /(apiKey|secret|credential)/i.test(key) ||
  /^(reference|access|refresh|session)?Token$/i.test(key)
)

const sanitizeString = (value, key) => {
  const normalized = String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  if (/(paths?|dirs?)$/i.test(key)) return normalizeRelativePath(normalized)
  if (/baseUrl$/i.test(key)) {
    try {
      const parsed = new URL(normalized)
      parsed.username = ''
      parsed.password = ''
      parsed.search = ''
      parsed.hash = ''
      return parsed.toString().replace(/\/$/, '').slice(0, 2048)
    } catch (_) {
      return ''
    }
  }
  if (/summary$/i.test(key)) return normalized.slice(0, 1000)
  return normalized.slice(0, MAX_STRING_CHARS)
}

const sanitizeAgentArtifact = (value, key = '', depth = 0) => {
  if (depth > MAX_DEPTH) return null
  if (value == null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') return sanitizeString(value, key)
  if (Array.isArray(value)) {
    const limited = /reasonCodes$/i.test(key)
      ? value.slice(0, 12)
      : (/requestedChanges$/i.test(key) ? value.slice(0, 8) : value.slice(0, MAX_ARRAY_ITEMS))
    return limited.map((entry) => sanitizeAgentArtifact(entry, key, depth + 1))
  }
  if (!isPlainObject(value)) return null
  const output = {}
  for (const [childKey, childValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
    if (shouldDropKey(childKey)) continue
    const sanitized = sanitizeAgentArtifact(childValue, childKey, depth + 1)
    if (sanitized !== undefined) output[childKey] = sanitized
  }
  return output
}

const createHatchPetAgentStore = ({
  dataDir,
  fsImpl = fs,
  now = () => new Date().toISOString()
} = {}) => {
  if (!dataDir) throw new Error('Hatch-pet agent dataDir is required')

  const getRunRelativeDir = (runId) => path.join('runs', assertRunId(runId), 'agent')
  const getRunDir = (runId) => resolveInside(dataDir, getRunRelativeDir(runId))
  const getArtifactPath = (runId, fileName) => resolveInside(
    dataDir,
    path.join(getRunRelativeDir(runId), fileName)
  )

  const ensureDirectory = (dirPath) => fsImpl.mkdirSync(dirPath, { recursive: true })

  const writeJsonAtomic = (filePath, value) => {
    ensureDirectory(path.dirname(filePath))
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    try {
      fsImpl.writeFileSync(tempPath, `${JSON.stringify(sanitizeAgentArtifact(value), null, 2)}\n`)
      fsImpl.renameSync(tempPath, filePath)
    } finally {
      try {
        if (fsImpl.existsSync(tempPath)) fsImpl.unlinkSync(tempPath)
      } catch (_) {
        // Best-effort cleanup must not hide the original write error.
      }
    }
  }

  const readJson = (filePath) => {
    if (!fsImpl.existsSync(filePath)) return null
    return JSON.parse(fsImpl.readFileSync(filePath, 'utf-8'))
  }

  const writeIfMissing = (filePath, value) => {
    if (!fsImpl.existsSync(filePath)) writeJsonAtomic(filePath, value)
  }

  const initializeRun = ({ runId, configSnapshot = {}, state = {}, budgets = {} } = {}) => {
    const normalizedRunId = assertRunId(runId)
    const runDir = getRunDir(normalizedRunId)
    const promptsDir = getArtifactPath(normalizedRunId, 'prompts')
    ensureDirectory(runDir)
    ensureDirectory(promptsDir)
    writeIfMissing(getArtifactPath(normalizedRunId, 'config-snapshot.json'), {
      ...configSnapshot,
      version: 1,
      createdAt: now()
    })
    writeIfMissing(getArtifactPath(normalizedRunId, 'state.json'), {
      ...state,
      version: 1,
      updatedAt: now()
    })
    writeIfMissing(getArtifactPath(normalizedRunId, 'budgets.json'), {
      ...budgets,
      version: 1,
      updatedAt: now()
    })
    const decisionsPath = getArtifactPath(normalizedRunId, 'decisions.jsonl')
    if (!fsImpl.existsSync(decisionsPath)) fsImpl.writeFileSync(decisionsPath, '')
    return {
      runId: normalizedRunId,
      agentRelativeDir: getRunRelativeDir(normalizedRunId).replace(/\\/g, '/')
    }
  }

  const readState = (runId) => readJson(getArtifactPath(assertRunId(runId), 'state.json'))

  const writeState = ({ runId, state } = {}) => {
    const normalizedRunId = assertRunId(runId)
    writeJsonAtomic(getArtifactPath(normalizedRunId, 'state.json'), {
      ...(isPlainObject(state) ? state : {}),
      updatedAt: now()
    })
    return readState(normalizedRunId)
  }

  const readBudgets = (runId) => readJson(getArtifactPath(assertRunId(runId), 'budgets.json'))

  const writeBudgets = ({ runId, budgets } = {}) => {
    const normalizedRunId = assertRunId(runId)
    writeJsonAtomic(getArtifactPath(normalizedRunId, 'budgets.json'), {
      ...(isPlainObject(budgets) ? budgets : {}),
      updatedAt: now()
    })
    return readBudgets(normalizedRunId)
  }

  const appendDecision = ({ runId, decision } = {}) => {
    const normalizedRunId = assertRunId(runId)
    const decisionsPath = getArtifactPath(normalizedRunId, 'decisions.jsonl')
    ensureDirectory(path.dirname(decisionsPath))
    const entry = sanitizeAgentArtifact({
      ...(isPlainObject(decision) ? decision : {}),
      recordedAt: now()
    })
    fsImpl.appendFileSync(decisionsPath, `${JSON.stringify(entry)}\n`)
    return entry
  }

  const listDecisions = (runId) => {
    const decisionsPath = getArtifactPath(assertRunId(runId), 'decisions.jsonl')
    if (!fsImpl.existsSync(decisionsPath)) return []
    try {
      return fsImpl.readFileSync(decisionsPath, 'utf-8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    } catch (_) {
      throw new Error('Hatch-pet agent decision log is invalid')
    }
  }

  const writePromptSnapshot = ({ runId, promptId, snapshot } = {}) => {
    const normalizedRunId = assertRunId(runId)
    const normalizedPromptId = assertArtifactId(promptId, 'promptId')
    const relativePath = path.join(
      getRunRelativeDir(normalizedRunId),
      'prompts',
      `${normalizedPromptId}.json`
    ).replace(/\\/g, '/')
    writeJsonAtomic(resolveInside(dataDir, relativePath), {
      ...(isPlainObject(snapshot) ? snapshot : {}),
      version: 1,
      promptId: normalizedPromptId,
      createdAt: now()
    })
    return { promptId: normalizedPromptId, relativePath }
  }

  return {
    initializeRun,
    readState,
    writeState,
    readBudgets,
    writeBudgets,
    appendDecision,
    listDecisions,
    writePromptSnapshot
  }
}

module.exports = {
  __testInternals: {
    normalizeRelativePath,
    resolveInside,
    sanitizeAgentArtifact
  },
  createHatchPetAgentStore
}
