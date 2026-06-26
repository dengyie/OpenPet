const fs = require('fs')
const path = require('path')
const { normalizeGenerationTask } = require('./generation-task')
const { FIXTURE_BACKEND, normalizeCreatorBackend } = require('./backend-mode')

const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

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

const getRunLogPath = ({ dataDir, runId }) => path.join(getRunDir({ dataDir, runId }), 'logs', 'events.jsonl')

const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf-8'))

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
  writeJson(getRunPath({ dataDir, runId }), run)
  fs.writeFileSync(path.join(runDir, 'inputs', 'prompt.md'), `${run.input.prompt}\n`)
  writeJson(path.join(runDir, 'inputs', 'config.json'), run.input)
  if (generationTask) writeJson(path.join(runDir, 'inputs', 'generation-task.json'), generationTask)
  if (originalPrompt) fs.writeFileSync(path.join(runDir, 'inputs', 'original-prompt.txt'), `${originalPrompt}\n`)
  return run
}

const readRun = ({ dataDir, runId }) => readJson(getRunPath({ dataDir, runId }))

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
  return fs.readFileSync(logPath, 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

const writeRun = ({ dataDir, run }) => {
  writeJson(getRunPath({ dataDir, runId: run.runId }), run)
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
  createRun,
  getRunDir,
  listRuns,
  readRunLogs,
  readRun,
  resolveRunId,
  updateRunStatus,
  writeRun
}
