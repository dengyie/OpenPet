const http = require('http')
const fs = require('fs')
const path = require('path')
const { listRuns, readRun, readRunLogs } = require('../lib/run-store')
const { runGenerationStep } = require('../lib/backend-runner')
const { answerTaskQuestion, confirmTaskRun, draftTaskRun } = require('../lib/task-workflow')

const SAFE_FRAME_FILE_PATTERN = /^\d{4}\.png$/

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

const sendPng = (response, filePath) => {
  response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
  fs.createReadStream(filePath).pipe(response)
}

const sendHtml = (response, dashboardPath) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(fs.readFileSync(dashboardPath, 'utf-8'))
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
    if (!body.trim()) {
      resolve({})
      return
    }
    try {
      resolve(JSON.parse(body))
    } catch (_) {
      reject(new Error('Request body must be valid JSON'))
    }
  })
  request.on('error', reject)
})

const sendError = (response, error) => {
  const statusCode = /valid JSON|too large|invalid|remaining questions|not pending|required/i.test(error.message || '')
    ? 400
    : 500
  sendJson(response, statusCode, { ok: false, error: error.message || 'Creator Studio service failed' })
}

const assertPathInsideDataDir = ({ dataDir, targetPath, label }) => {
  const root = path.resolve(String(dataDir || ''))
  const target = path.resolve(String(targetPath || ''))
  const relative = path.relative(root, target)
  if (!root || !relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the Creator Studio data directory`)
  }
  const realRoot = fs.realpathSync.native(root)
  const realTarget = fs.realpathSync.native(fs.existsSync(target) ? target : path.dirname(target))
  const realRelative = path.relative(realRoot, realTarget)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`${label} must stay inside the Creator Studio data directory`)
  }
  return target
}

const getActionFramePath = ({ dataDir, run, actionId, fileName }) => {
  const actionFrames = run.artifacts?.actionFrames
  if (!actionFrames || actionFrames.actionId !== actionId) throw new Error('Action frame preview is not available')
  if (!SAFE_FRAME_FILE_PATTERN.test(fileName || '')) throw new Error('Action frame file name is invalid')
  const framesDir = assertPathInsideDataDir({
    dataDir,
    targetPath: actionFrames.framesDir,
    label: 'Action frames directory'
  })
  const framePath = assertPathInsideDataDir({
    dataDir,
    targetPath: path.join(framesDir, fileName),
    label: 'Action frame preview'
  })
  if (!fs.existsSync(framePath)) throw new Error('Action frame preview is missing')
  return framePath
}

const createActionReview = (run) => {
  const actionFrames = run.artifacts?.actionFrames
  const action = Array.isArray(run.generationTask?.actions) ? run.generationTask.actions[0] : null
  if (!actionFrames) return null
  const actionId = actionFrames.actionId
  const frameCount = actionFrames.frameCount || action?.frameCount || 0
  const previewFrames = Array.from({ length: Math.min(32, Math.max(0, Number(frameCount) || 0)) }, (_entry, index) => {
    const fileName = `${String(index + 1).padStart(4, '0')}.png`
    return {
      fileName,
      width: actionFrames.frameWidth || 0,
      height: actionFrames.frameHeight || 0,
      url: `/api/runs/${encodeURIComponent(run.runId)}/action-frames/${encodeURIComponent(actionId)}/${fileName}`
    }
  })
  return {
    actionId,
    name: actionFrames.name || action?.name || actionFrames.actionId,
    frameCount,
    frameWidth: actionFrames.frameWidth || 0,
    frameHeight: actionFrames.frameHeight || 0,
    qa: actionFrames.qa || '',
    previewFrames,
    triggerProposal: actionFrames.triggerProposal || action?.triggerProposal || { type: 'unbound' },
    importStatus: run.importStatus || 'not-imported'
  }
}

const createRunSummary = (run) => {
  const action = Array.isArray(run.generationTask?.actions) ? run.generationTask.actions[0] : null
  const prompt = String(run.input?.originalPrompt || run.input?.prompt || '')
  return {
    runId: run.runId,
    petName: run.input?.petName || run.petId || 'Creator Studio Pet',
    status: run.status || 'draft',
    taskStatus: run.taskStatus || 'not_started',
    currentStep: run.currentStep || 'draft',
    backend: run.backend || run.input?.backend || 'fixture',
    updatedAt: run.updatedAt || run.createdAt || '',
    mode: run.generationTask?.mode || '',
    actionName: action?.name || '',
    triggerType: action?.triggerProposal?.type || '',
    promptSnippet: prompt.length > 96 ? `${prompt.slice(0, 93)}...` : prompt,
    hasActionReview: Boolean(run.artifacts?.actionFrames)
  }
}

const handlePost = async ({ request, response, dataDir, url }) => {
  try {
    const body = await readJsonBody(request)
    if (url.pathname === '/api/tasks/draft') {
      sendJson(response, 200, { ok: true, ...draftTaskRun({ dataDir, payload: body }) })
      return true
    }

    const answerMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/questions\/([^/]+)\/answer$/)
    if (answerMatch) {
      sendJson(response, 200, {
        ok: true,
        ...answerTaskQuestion({
          dataDir,
          runId: decodeURIComponent(answerMatch[1]),
          questionId: decodeURIComponent(answerMatch[2]),
          answer: body.answer
        })
      })
      return true
    }

    const confirmMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/confirm$/)
    if (confirmMatch) {
      sendJson(response, 200, {
        ok: true,
        ...confirmTaskRun({
          dataDir,
          runId: decodeURIComponent(confirmMatch[1])
        })
      })
      return true
    }

    const generateMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/generate-action$/)
    if (generateMatch) {
      const output = await runGenerationStep({
        dataDir,
        runId: decodeURIComponent(generateMatch[1])
      })
      sendJson(response, 200, {
        ok: true,
        run: output.run,
        actionReview: createActionReview(output.run),
        outputDir: output.outputDir || ''
      })
      return true
    }

    return false
  } catch (error) {
    sendError(response, error)
    return true
  }
}

const createCreatorStudioServer = ({ dataDir, dashboardPath }) => http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  if (url.pathname === '/health') {
    sendJson(response, 200, { ok: true, service: 'creator-studio' })
    return
  }
  if (request.method === 'POST') {
    if (await handlePost({ request, response, dataDir, url })) return
  }
  if (url.pathname === '/api/runs') {
    const runSummaries = listRuns({ dataDir }).map(createRunSummary)
    sendJson(response, 200, { ok: true, runs: runSummaries, runSummaries })
    return
  }

  const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)(\/logs)?$/)
  if (runMatch) {
    const runId = decodeURIComponent(runMatch[1])
    try {
      if (runMatch[2] === '/logs') {
        sendJson(response, 200, { ok: true, runId, logs: readRunLogs({ dataDir, runId }) })
        return
      }
      const run = readRun({ dataDir, runId })
      sendJson(response, 200, { ok: true, run, actionReview: createActionReview(run) })
      return
    } catch (error) {
      sendJson(response, 404, { ok: false, error: error.message || 'Run not found' })
      return
    }
  }

  const actionFrameMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/action-frames\/([^/]+)\/([^/]+)$/)
  if (actionFrameMatch) {
    try {
      const run = readRun({ dataDir, runId: decodeURIComponent(actionFrameMatch[1]) })
      const framePath = getActionFramePath({
        dataDir,
        run,
        actionId: decodeURIComponent(actionFrameMatch[2]),
        fileName: decodeURIComponent(actionFrameMatch[3])
      })
      sendPng(response, framePath)
      return
    } catch (error) {
      sendJson(response, 404, { ok: false, error: error.message || 'Action frame preview not found' })
      return
    }
  }

  sendHtml(response, dashboardPath)
})

const startCreatorStudioService = () => {
  const port = Number(process.env.OPENPET_CREATOR_STUDIO_PORT || 8794)
  const dashboardPath = path.join(__dirname, '..', 'web', 'dashboard', 'index.html')
  const server = createCreatorStudioServer({
    dataDir: process.env.OPENPET_DATA_DIR || '',
    dashboardPath
  })
  server.listen(port, '127.0.0.1', () => {
    console.log(`Creator Studio dashboard listening on http://127.0.0.1:${port}`)
  })
  const shutdown = () => server.close(() => process.exit(0))
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  return server
}

if (require.main === module) {
  startCreatorStudioService()
}

module.exports = {
  createRunSummary,
  createCreatorStudioServer,
  startCreatorStudioService
}
