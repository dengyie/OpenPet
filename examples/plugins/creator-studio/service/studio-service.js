const http = require('http')
const fs = require('fs')
const path = require('path')
const { appendRunLog, listRuns, readRun, readRunLogs, updateRunStatus } = require('../lib/run-store')
const { runGenerationStep } = require('../lib/backend-runner')
const { repairActionFrameFromGeneratedImage } = require('../lib/action-frame-builder')
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

const toDataRelativePath = ({ dataDir, targetPath }) => {
  if (!dataDir || !targetPath) return ''
  const root = path.resolve(String(dataDir))
  const rawTarget = String(targetPath)
  const target = path.isAbsolute(rawTarget) ? path.resolve(rawTarget) : path.resolve(root, rawTarget)
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return ''
  return relative.split(path.sep).join('/')
}

const toPublicLogString = ({ dataDir, value }) => {
  const text = String(value || '')
  if (!dataDir || !text) return text
  if (path.isAbsolute(text)) {
    const relative = toDataRelativePath({ dataDir, targetPath: text })
    if (relative) return relative
  }
  const normalizedRoot = path.resolve(String(dataDir)).split(path.sep).join('/')
  const normalizedText = text.replace(/\\/g, '/')
  return normalizedText.includes(normalizedRoot)
    ? normalizedText.split(normalizedRoot).join('OPENPET_DATA_DIR')
    : text
}

const createPublicLogValue = ({ dataDir, value }) => {
  if (typeof value === 'string') return toPublicLogString({ dataDir, value })
  if (Array.isArray(value)) return value.map((entry) => createPublicLogValue({ dataDir, value: entry }))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      createPublicLogValue({ dataDir, value: entry })
    ]))
  }
  return value
}

const createPublicLogEntry = ({ dataDir, entry }) => createPublicLogValue({ dataDir, value: entry })

const createPublicArtifacts = ({ dataDir, artifacts = {} }) => {
  const publicArtifacts = {}
  if (artifacts.outputDir) publicArtifacts.outputDir = toDataRelativePath({ dataDir, targetPath: artifacts.outputDir })
  if (artifacts.petJson) publicArtifacts.petJson = toDataRelativePath({ dataDir, targetPath: artifacts.petJson })
  if (artifacts.spritesheet) publicArtifacts.spritesheet = toDataRelativePath({ dataDir, targetPath: artifacts.spritesheet })
  if (artifacts.bundle) publicArtifacts.bundle = toDataRelativePath({ dataDir, targetPath: artifacts.bundle })
  if (artifacts.qa) publicArtifacts.qa = toDataRelativePath({ dataDir, targetPath: artifacts.qa })
  if (artifacts.sourceImageQa) {
    publicArtifacts.sourceImageQa = toDataRelativePath({ dataDir, targetPath: artifacts.sourceImageQa })
  }
  if (artifacts.actionTaskQa) {
    publicArtifacts.actionTaskQa = toDataRelativePath({ dataDir, targetPath: artifacts.actionTaskQa })
  }
  if (artifacts.actionFrames) {
    publicArtifacts.actionFrames = {
      actionId: artifacts.actionFrames.actionId,
      name: artifacts.actionFrames.name,
      qa: toDataRelativePath({ dataDir, targetPath: artifacts.actionFrames.qa }),
      frameCount: artifacts.actionFrames.frameCount,
      frameWidth: artifacts.actionFrames.frameWidth,
      frameHeight: artifacts.actionFrames.frameHeight,
      triggerProposal: artifacts.actionFrames.triggerProposal || { type: 'unbound' }
    }
  }
  return publicArtifacts
}

const createPublicRun = ({ dataDir, run }) => ({
  ...run,
  artifacts: createPublicArtifacts({ dataDir, artifacts: run.artifacts || {} })
})

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

const createActionReview = ({ dataDir, run }) => {
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
    qa: toDataRelativePath({ dataDir, targetPath: actionFrames.qa }),
    previewFrames,
    triggerProposal: actionFrames.triggerProposal || action?.triggerProposal || { type: 'unbound' },
    importStatus: run.importStatus || 'not-imported'
  }
}

const handlePost = async ({ request, response, dataDir, url }) => {
  try {
    const body = await readJsonBody(request)
    if (url.pathname === '/api/tasks/draft') {
      const output = draftTaskRun({ dataDir, payload: body })
      sendJson(response, 200, {
        ok: true,
        ...output,
        run: createPublicRun({ dataDir, run: output.run })
      })
      return true
    }

    const answerMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/questions\/([^/]+)\/answer$/)
    if (answerMatch) {
      const output = answerTaskQuestion({
        dataDir,
        runId: decodeURIComponent(answerMatch[1]),
        questionId: decodeURIComponent(answerMatch[2]),
        answer: body.answer
      })
      sendJson(response, 200, {
        ok: true,
        ...output,
        run: createPublicRun({ dataDir, run: output.run })
      })
      return true
    }

    const confirmMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/confirm$/)
    if (confirmMatch) {
      const output = confirmTaskRun({
        dataDir,
        runId: decodeURIComponent(confirmMatch[1])
      })
      sendJson(response, 200, {
        ok: true,
        ...output,
        run: createPublicRun({ dataDir, run: output.run })
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
        run: createPublicRun({ dataDir, run: output.run }),
        actionReview: createActionReview({ dataDir, run: output.run }),
        outputDir: toDataRelativePath({ dataDir, targetPath: output.outputDir })
      })
      return true
    }

    const repairFrameMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/action-frames\/([^/]+)\/([^/]+)\/repair$/)
    if (repairFrameMatch) {
      const runId = decodeURIComponent(repairFrameMatch[1])
      const actionId = decodeURIComponent(repairFrameMatch[2])
      const fileName = decodeURIComponent(repairFrameMatch[3])
      const run = readRun({ dataDir, runId })
      const actionFrames = run.artifacts?.actionFrames
      const action = Array.isArray(run.generationTask?.actions)
        ? run.generationTask.actions.find((candidate) => candidate.actionId === actionId)
        : null
      if (run.status !== 'ready_for_review') {
        throw new Error(`Action frame repair requires a reviewable run: ${run.status}`)
      }
      if (!actionFrames || actionFrames.actionId !== actionId || !action) {
        throw new Error('Action frame repair is not available')
      }
      if (!run.artifacts?.generatedImage) {
        throw new Error('Action frame repair requires generated image provenance')
      }
      const repair = await repairActionFrameFromGeneratedImage({
        dataDir,
        generationResult: run.artifacts.generatedImage,
        action,
        outputFramesDir: actionFrames.framesDir,
        qaDir: actionFrames.qa ? path.dirname(actionFrames.qa) : path.join(dataDir, 'runs', runId, 'qa'),
        fileName
      })
      const nextRun = updateRunStatus({
        dataDir,
        runId,
        status: run.status,
        patch: {
          currentStep: 'review'
        }
      })
      appendRunLog({
        dataDir,
        runId,
        level: 'info',
        event: 'action-frame.repaired',
        message: `Repaired action frame ${fileName}`,
        data: {
          actionId,
          fileName
        }
      })
      sendJson(response, 200, {
        ok: true,
        run: createPublicRun({ dataDir, run: nextRun }),
        actionReview: createActionReview({ dataDir, run: nextRun }),
        repair: {
          actionId: repair.actionId,
          fileName: repair.fileName,
          frameIndex: repair.frameIndex,
          qa: toDataRelativePath({ dataDir, targetPath: repair.qaPath })
        }
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
    sendJson(response, 200, { ok: true, runs: listRuns({ dataDir }).map((run) => createPublicRun({ dataDir, run })) })
    return
  }

  const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)(\/logs)?$/)
  if (runMatch) {
    const runId = decodeURIComponent(runMatch[1])
    try {
      if (runMatch[2] === '/logs') {
        sendJson(response, 200, {
          ok: true,
          runId,
          logs: readRunLogs({ dataDir, runId }).map((entry) => createPublicLogEntry({ dataDir, entry }))
        })
        return
      }
      const run = readRun({ dataDir, runId })
      sendJson(response, 200, {
        ok: true,
        run: createPublicRun({ dataDir, run }),
        actionReview: createActionReview({ dataDir, run })
      })
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
  createCreatorStudioServer,
  startCreatorStudioService
}
