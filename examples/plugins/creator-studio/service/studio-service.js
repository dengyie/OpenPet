const http = require('http')
const fs = require('fs')
const path = require('path')
const { listRuns, readRun, readRunLogs } = require('../lib/run-store')

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

const sendHtml = (response, dashboardPath) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(fs.readFileSync(dashboardPath, 'utf-8'))
}

const createCreatorStudioServer = ({ dataDir, dashboardPath }) => http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  if (url.pathname === '/health') {
    sendJson(response, 200, { ok: true, service: 'creator-studio' })
    return
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
      sendJson(response, 200, { ok: true, run: readRun({ dataDir, runId }) })
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
