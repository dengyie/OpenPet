const http = require('http')
const fs = require('fs')
const path = require('path')
const { listRuns, readRun, readRunLogs } = require('../lib/run-store')
const { runGenerationStep } = require('../lib/backend-runner')
const { answerTaskQuestion, confirmTaskRun, draftTaskRun } = require('../lib/task-workflow')

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
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

const createActionReview = (run) => {
  const actionFrames = run.artifacts?.actionFrames
  const action = Array.isArray(run.generationTask?.actions) ? run.generationTask.actions[0] : null
  if (!actionFrames) return null
  return {
    actionId: actionFrames.actionId,
    name: actionFrames.name || action?.name || actionFrames.actionId,
    frameCount: actionFrames.frameCount || action?.frameCount || 0,
    frameWidth: actionFrames.frameWidth || 0,
    frameHeight: actionFrames.frameHeight || 0,
    qa: actionFrames.qa || '',
    triggerProposal: actionFrames.triggerProposal || action?.triggerProposal || { type: 'unbound' },
    importStatus: run.importStatus || 'not-imported'
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
    sendJson(response, 200, { ok: true, runs: listRuns({ dataDir }) })
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
  createCreatorStudioServer,
  startCreatorStudioService
}
