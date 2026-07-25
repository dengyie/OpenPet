const fs = require('fs')
const path = require('path')
const { normalizeGenerationTask } = require('./generation-task')
const { FIXTURE_BACKEND, normalizeCreatorBackend } = require('./backend-mode')
const {
  FULL_PET_COMMAND_TIMEOUT_MS,
  GENERATION_COMMAND_TERMINATED_REASON,
  GENERATION_LEASE_HEARTBEAT_INTERVAL_MS,
  GENERATION_LEASE_STALE_AFTER_MS
} = require('./full-pet-workflow-contract')

const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const RUN_STATE_RECOVERED_REASON = 'generation-command-state-recovered'

const slugify = (value) => String(value || 'pet')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/-{2,}/g, '-')
  .replace(/^-|-$/g, '')
  || 'pet'

const ensureDirectory = (dirPath) => fs.mkdirSync(dirPath, { recursive: true })

const getRunsDir = (dataDir) => path.join(dataDir, 'runs')

const getRunDir = ({ dataDir, runId }) => {
  if (!SAFE_ID_PATTERN.test(runId || '')) throw new Error('Creator Studio runId is invalid')
  return path.join(getRunsDir(dataDir), runId)
}

const getRunPath = ({ dataDir, runId }) => path.join(getRunDir({ dataDir, runId }), 'run.json')

const getRunBackupPath = ({ dataDir, runId }) => path.join(getRunDir({ dataDir, runId }), 'run.last-valid.json')

const getRunLogPath = ({ dataDir, runId }) => path.join(getRunDir({ dataDir, runId }), 'logs', 'events.jsonl')

const assertExistingRunDirectory = ({ dataDir, runId }) => {
  const runsDir = getRunsDir(dataDir)
  const runDir = getRunDir({ dataDir, runId })
  if (!fs.existsSync(runDir)) throw new Error(`Creator Studio run not found: ${runId}`)
  const runStat = fs.lstatSync(runDir)
  if (runStat.isSymbolicLink() || !runStat.isDirectory()) {
    throw new Error(`Creator Studio run directory is invalid: ${runId}`)
  }
  const realRunsDir = fs.realpathSync.native(runsDir)
  const realRunDir = fs.realpathSync.native(runDir)
  const relative = path.relative(realRunsDir, realRunDir)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Creator Studio run directory escaped the data boundary: ${runId}`)
  }
  return runDir
}

const writeJsonAtomic = (filePath, value) => {
  ensureDirectory(path.dirname(filePath))
  const serialized = `${JSON.stringify(value, null, 2)}\n`
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  let fileDescriptor = null
  try {
    fileDescriptor = fs.openSync(tempPath, 'w')
    fs.writeFileSync(fileDescriptor, serialized, 'utf-8')
    fs.fsyncSync(fileDescriptor)
    fs.closeSync(fileDescriptor)
    fileDescriptor = null
    fs.renameSync(tempPath, filePath)
  } finally {
    if (fileDescriptor != null) {
      try { fs.closeSync(fileDescriptor) } catch (_) {}
    }
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
    } catch (_) {}
  }
}

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf-8'))

const isRunRecord = (value, runId) => Boolean(
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  String(value.runId || '') === String(runId || '')
)

const readValidRunFile = ({ filePath, runId }) => {
  if (!fs.existsSync(filePath)) return null
  try {
    const value = readJson(filePath)
    return isRunRecord(value, runId) ? value : null
  } catch (_) {
    return null
  }
}

const createCorruptRunPath = ({ dataDir, runId, timestamp }) => {
  const safeTimestamp = String(timestamp || new Date().toISOString()).replace(/[^0-9TZ]/g, '').slice(0, 20) || String(Date.now())
  const runDir = getRunDir({ dataDir, runId })
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt}`
    const candidate = path.join(runDir, `run.corrupt-${safeTimestamp}${suffix}.json`)
    if (!fs.existsSync(candidate)) return candidate
  }
  return path.join(runDir, `run.corrupt-${Date.now()}.json`)
}

const preserveCorruptRunFile = ({ dataDir, runId, timestamp }) => {
  const runPath = getRunPath({ dataDir, runId })
  if (!fs.existsSync(runPath)) return ''
  const corruptPath = createCorruptRunPath({ dataDir, runId, timestamp })
  fs.renameSync(runPath, corruptPath)
  return corruptPath
}

const createRecoveredRun = ({ runId, backupRun = null, recoveredAt, corruptRelativePath = '' }) => {
  const source = isRunRecord(backupRun, runId) ? backupRun : {}
  const { generationLease: _generationLease, ...runWithoutLease } = source
  return {
    ...runWithoutLease,
    runId,
    status: 'failed',
    taskStatus: String(source.taskStatus || 'not_started'),
    backend: String(source.backend || source.input?.backend || ''),
    createdAt: String(source.createdAt || recoveredAt),
    updatedAt: recoveredAt,
    currentStep: String(source.currentStep || 'recovery'),
    input: source.input && typeof source.input === 'object' && !Array.isArray(source.input)
      ? source.input
      : { petName: 'Recovered Creator Studio Run', prompt: '', backend: '' },
    backendStatus: {
      ...(source.backendStatus && typeof source.backendStatus === 'object' ? source.backendStatus : {}),
      backend: String(source.backendStatus?.backend || source.backend || source.input?.backend || ''),
      state: 'failed',
      message: RUN_STATE_RECOVERED_REASON,
      updatedAt: recoveredAt
    },
    artifacts: source.artifacts && typeof source.artifacts === 'object' && !Array.isArray(source.artifacts)
      ? source.artifacts
      : {},
    jobs: Array.isArray(source.jobs) ? source.jobs : [],
    reviewStatus: String(source.reviewStatus || 'pending'),
    importStatus: String(source.importStatus || 'not-imported'),
    recovery: {
      code: RUN_STATE_RECOVERED_REASON,
      recoveredAt,
      source: backupRun ? 'run.last-valid.json' : 'run-directory',
      ...(corruptRelativePath ? { corruptRelativePath } : {})
    },
    error: RUN_STATE_RECOVERED_REASON
  }
}

const createUniqueRunDirectory = ({ dataDir, baseRunId }) => {
  ensureDirectory(getRunsDir(dataDir))
  for (let attempt = 1; attempt <= 999; attempt += 1) {
    const runId = attempt === 1 ? baseRunId : `${baseRunId}-${String(attempt).padStart(3, '0')}`
    const runDir = getRunDir({ dataDir, runId })
    try {
      fs.mkdirSync(runDir)
      return { runId, runDir }
    } catch (error) {
      if (error?.code === 'EEXIST') continue
      throw error
    }
  }
  throw new Error('Creator Studio could not allocate a unique runId')
}

const createRun = ({ dataDir, input = {}, now = () => new Date().toISOString() }) => {
  if (!dataDir) throw new Error('Creator Studio dataDir is required')
  const timestamp = now()
  const petName = String(input.petName || 'Creator Studio Pet').trim() || 'Creator Studio Pet'
  const petId = slugify(input.petId || petName)
  const originalPrompt = input.originalPrompt == null ? '' : String(input.originalPrompt).trim()
  const generationTask = input.generationTask ? normalizeGenerationTask(input.generationTask) : null
  const backend = normalizeCreatorBackend(input.backend, FIXTURE_BACKEND)
  const baseRunId = `${timestamp.slice(0, 10)}-${petId}`.replace(/[^a-zA-Z0-9_-]/g, '-')
  const { runId, runDir } = createUniqueRunDirectory({ dataDir, baseRunId })
  ensureDirectory(path.join(runDir, 'inputs', 'references'))
  ensureDirectory(path.join(runDir, 'jobs', 'prompts'))
  ensureDirectory(path.join(runDir, 'decoded'))
  ensureDirectory(path.join(runDir, 'frames'))
  ensureDirectory(path.join(runDir, 'outputs'))
  ensureDirectory(path.join(runDir, 'qa'))
  ensureDirectory(path.join(runDir, 'logs'))
  const run = {
    runId,
    petId,
    status: 'draft',
    taskStatus: generationTask
      ? (generationTask.questions.length > 0 ? 'needs_input' : 'ready_for_confirmation')
      : 'not_started',
    backend,
    modelProvider: input.modelProvider || backend,
    createdAt: timestamp,
    updatedAt: timestamp,
    currentStep: 'draft',
    input: {
      petName,
      prompt: String(input.prompt || ''),
      backend,
      ...(originalPrompt ? { originalPrompt } : {})
    },
    ...(generationTask ? { generationTask } : {}),
    conversation: {
      originalPrompt,
      answers: []
    },
    backendStatus: {
      backend,
      state: 'idle',
      message: '',
      updatedAt: timestamp
    },
    artifacts: {},
    jobs: [],
    reviewStatus: 'pending',
    importStatus: 'not-imported',
    error: ''
  }
  writeJsonAtomic(getRunBackupPath({ dataDir, runId }), run)
  writeJsonAtomic(getRunPath({ dataDir, runId }), run)
  fs.writeFileSync(path.join(runDir, 'inputs', 'prompt.md'), `${run.input.prompt}\n`)
  writeJsonAtomic(path.join(runDir, 'inputs', 'config.json'), run.input)
  if (generationTask) writeJsonAtomic(path.join(runDir, 'inputs', 'generation-task.json'), generationTask)
  if (originalPrompt) fs.writeFileSync(path.join(runDir, 'inputs', 'original-prompt.txt'), `${originalPrompt}\n`)
  return run
}

const readRun = ({ dataDir, runId, now = () => new Date().toISOString() }) => {
  assertExistingRunDirectory({ dataDir, runId })
  const runPath = getRunPath({ dataDir, runId })
  const current = readValidRunFile({ filePath: runPath, runId })
  if (current) return current

  const recoveredAt = now()
  const backupPath = getRunBackupPath({ dataDir, runId })
  const backupRun = readValidRunFile({ filePath: backupPath, runId })
  const corruptPath = preserveCorruptRunFile({ dataDir, runId, timestamp: recoveredAt })
  const corruptRelativePath = corruptPath
    ? path.relative(getRunDir({ dataDir, runId }), corruptPath).replace(/\\/g, '/')
    : ''
  const recoveredRun = createRecoveredRun({
    runId,
    backupRun,
    recoveredAt,
    corruptRelativePath
  })
  writeJsonAtomic(runPath, recoveredRun)
  if (!backupRun) writeJsonAtomic(backupPath, recoveredRun)
  appendRunLog({
    dataDir,
    runId,
    level: 'error',
    event: 'run.state-recovered',
    message: RUN_STATE_RECOVERED_REASON,
    data: {
      source: backupRun ? 'run.last-valid.json' : 'run-directory',
      corruptRelativePath
    },
    now: () => recoveredAt
  })
  return recoveredRun
}

const toTimestampMs = (value) => {
  const timestamp = Date.parse(String(value || ''))
  return Number.isFinite(timestamp) ? timestamp : 0
}

const createGenerationLease = ({ commandId, startedAt, leaseId }) => ({
  commandId: String(commandId || 'run-step'),
  leaseId: String(leaseId || `${process.pid}-${startedAt}`),
  startedAt,
  heartbeatAt: startedAt
})

const createGenerationLeaseHeartbeat = ({ dataDir, runId, leaseId, now = () => new Date().toISOString() }) => {
  const interval = setInterval(() => {
    const current = readRun({ dataDir, runId })
    if (current.status !== 'generating' || current.generationLease?.leaseId !== leaseId) return
    writeRun({
      dataDir,
      run: {
        ...current,
        generationLease: {
          ...current.generationLease,
          heartbeatAt: now()
        }
      }
    })
  }, GENERATION_LEASE_HEARTBEAT_INTERVAL_MS)
  interval.unref?.()
  return () => clearInterval(interval)
}

const settleTerminatedGeneratingRun = ({ dataDir, run, recoveredAt, event }) => {
  const lease = run.generationLease
  const { generationLease: _generationLease, ...runWithoutLease } = run
  const recoveredRun = {
    ...runWithoutLease,
    status: 'failed',
    currentStep: 'generate',
    updatedAt: recoveredAt,
    backendStatus: {
      ...(run.backendStatus || {}),
      backend: run.backendStatus?.backend || run.backend || run.input?.backend || '',
      state: 'failed',
      message: GENERATION_COMMAND_TERMINATED_REASON,
      updatedAt: recoveredAt
    },
    error: GENERATION_COMMAND_TERMINATED_REASON
  }
  writeRun({ dataDir, run: recoveredRun })
  appendRunLog({
    dataDir,
    runId: run.runId,
    level: 'error',
    event,
    message: GENERATION_COMMAND_TERMINATED_REASON,
    data: { commandId: String(lease?.commandId || ''), leaseId: String(lease?.leaseId || '') },
    now: () => recoveredAt
  })
  return recoveredRun
}

const failGeneratingRunAfterCommandTermination = ({ dataDir, runId, now = () => new Date().toISOString() }) => {
  let run
  try {
    run = readRun({ dataDir, runId })
  } catch (_) {
    return null
  }
  if (run.status !== 'generating') return run
  return settleTerminatedGeneratingRun({
    dataDir,
    run,
    recoveredAt: now(),
    event: 'generate.command-terminated'
  })
}

const recoverStaleGeneratingRuns = ({ dataDir, now = () => new Date().toISOString() }) => {
  const recoveredRunIds = []
  const recoveredAt = now()
  const recoveredAtMs = toTimestampMs(recoveredAt)
  for (const run of listRuns({ dataDir })) {
    if (run.status !== 'generating') continue
    const lease = run.generationLease
    const referenceAt = lease?.heartbeatAt || run.updatedAt || run.createdAt
    const staleAfterMs = lease ? GENERATION_LEASE_STALE_AFTER_MS : FULL_PET_COMMAND_TIMEOUT_MS
    if (!recoveredAtMs || recoveredAtMs - toTimestampMs(referenceAt) < staleAfterMs) continue
    settleTerminatedGeneratingRun({
      dataDir,
      run,
      recoveredAt,
      event: 'generate.recovered-stale-command'
    })
    recoveredRunIds.push(run.runId)
  }
  return recoveredRunIds
}

const listRuns = ({ dataDir }) => {
  const runsDir = getRunsDir(dataDir)
  if (!dataDir || !fs.existsSync(runsDir)) return []
  return fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        return readRun({ dataDir, runId: entry.name })
      } catch (_) {
        return null
      }
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftTimestamp = String(left.updatedAt || left.createdAt || '')
      const rightTimestamp = String(right.updatedAt || right.createdAt || '')
      const timestampOrder = rightTimestamp.localeCompare(leftTimestamp)
      return timestampOrder || String(right.runId || '').localeCompare(String(left.runId || ''))
    })
}

const resolveRunId = ({ dataDir, runId, statuses = [], description = 'matching', filter = () => true }) => {
  const explicitRunId = String(runId || '').trim()
  if (explicitRunId) return explicitRunId
  const allowedStatuses = new Set(statuses.map((status) => String(status)))
  const run = listRuns({ dataDir }).find((candidate) => (
    (allowedStatuses.size === 0 || allowedStatuses.has(candidate.status)) && filter(candidate)
  ))
  if (!run?.runId) throw new Error(`No ${description} run found`)
  return run.runId
}

const appendRunLog = ({ dataDir, runId, level = 'info', event, message = '', data = {}, now = () => new Date().toISOString() }) => {
  const logPath = getRunLogPath({ dataDir, runId })
  ensureDirectory(path.dirname(logPath))
  const entry = {
    timestamp: now(),
    level: String(level || 'info'),
    event: String(event || 'event'),
    message: String(message || ''),
    data: data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  }
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`)
  return entry
}

const readRunLogs = ({ dataDir, runId }) => {
  const logPath = getRunLogPath({ dataDir, runId })
  if (!fs.existsSync(logPath)) return []
  const entries = []
  const malformedLines = []
  fs.readFileSync(logPath, 'utf-8')
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (!line.trim()) return
      try {
        entries.push(JSON.parse(line))
      } catch (_) {
        malformedLines.push(index + 1)
      }
    })
  if (malformedLines.length) {
    entries.push({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'run.log-corrupt-line',
      message: 'Creator Studio run journal contained malformed lines',
      data: {
        lineNumber: malformedLines[0],
        malformedLineCount: malformedLines.length
      }
    })
  }
  return entries
}

const writeRun = ({ dataDir, run }) => {
  if (!isRunRecord(run, run?.runId)) throw new Error('Creator Studio run is invalid')
  assertExistingRunDirectory({ dataDir, runId: run.runId })
  const runPath = getRunPath({ dataDir, runId: run.runId })
  const backupPath = getRunBackupPath({ dataDir, runId: run.runId })
  const current = readValidRunFile({ filePath: runPath, runId: run.runId })
  if (current) {
    writeJsonAtomic(backupPath, current)
  } else if (fs.existsSync(runPath)) {
    preserveCorruptRunFile({ dataDir, runId: run.runId, timestamp: new Date().toISOString() })
  }
  if (!fs.existsSync(backupPath)) {
    writeJsonAtomic(backupPath, run)
  }
  writeJsonAtomic(runPath, run)
  return run
}

const updateRunStatus = ({ dataDir, runId, status, patch = {}, now = () => new Date().toISOString() }) => {
  const current = readRun({ dataDir, runId })
  return writeRun({
    dataDir,
    run: {
      ...current,
      ...patch,
      status,
      updatedAt: now()
    }
  })
}

module.exports = {
  appendRunLog,
  createGenerationLease,
  createGenerationLeaseHeartbeat,
  createRun,
  failGeneratingRunAfterCommandTermination,
  GENERATION_COMMAND_TERMINATED_REASON,
  getRunDir,
  listRuns,
  readRunLogs,
  readRun,
  recoverStaleGeneratingRuns,
  resolveRunId,
  RUN_STATE_RECOVERED_REASON,
  updateRunStatus,
  writeJsonAtomic,
  writeRun
}
