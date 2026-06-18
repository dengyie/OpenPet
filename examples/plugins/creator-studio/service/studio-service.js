const http = require('http')
const fs = require('fs')
const path = require('path')

const port = Number(process.env.OPENPET_CREATOR_STUDIO_PORT || 8794)
const dashboardPath = path.join(__dirname, '..', 'web', 'dashboard', 'index.html')

const listRuns = () => {
  const runsDir = path.join(process.env.OPENPET_DATA_DIR || '', 'runs')
  if (!runsDir || !fs.existsSync(runsDir)) return []
  return fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const runPath = path.join(runsDir, entry.name, 'run.json')
      if (!fs.existsSync(runPath)) return null
      try {
        return JSON.parse(fs.readFileSync(runPath, 'utf-8'))
      } catch (_) {
        return null
      }
    })
    .filter(Boolean)
}

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    sendJson(response, 200, { ok: true, service: 'creator-studio' })
    return
  }
  if (request.url === '/api/runs') {
    sendJson(response, 200, { ok: true, runs: listRuns() })
    return
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(fs.readFileSync(dashboardPath, 'utf-8'))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Creator Studio dashboard listening on http://127.0.0.1:${port}`)
})

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
