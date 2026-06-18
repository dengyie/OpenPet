const fs = require('fs')
const path = require('path')

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

const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf-8'))

const createRun = ({ dataDir, input = {}, now = () => new Date().toISOString() }) => {
  if (!dataDir) throw new Error('Creator Studio dataDir is required')
  const timestamp = now()
  const petName = String(input.petName || 'Creator Studio Pet').trim() || 'Creator Studio Pet'
  const petId = slugify(input.petId || petName)
  const runId = `${timestamp.slice(0, 10)}-${petId}`.replace(/[^a-zA-Z0-9_-]/g, '-')
  const runDir = getRunDir({ dataDir, runId })
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
    backend: input.backend || 'fixture',
    modelProvider: input.modelProvider || input.backend || 'fixture',
    createdAt: timestamp,
    updatedAt: timestamp,
    currentStep: 'draft',
    input: {
      petName,
      prompt: String(input.prompt || ''),
      backend: input.backend || 'fixture'
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
  return run
}

const readRun = ({ dataDir, runId }) => readJson(getRunPath({ dataDir, runId }))

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
  createRun,
  getRunDir,
  readRun,
  updateRunStatus,
  writeRun
}
