const fs = require('fs')
const path = require('path')
const { runCommand } = require('./command-io')

const DEFAULT_PORT = 8795
const HEALTH_TIMEOUT_MS = 1000

const getServicePort = (context = {}) => {
  const value = Number(context.port || process.env.OPENPET_AGENT_AWARENESS_PORT || DEFAULT_PORT)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_PORT
}

const fileHasText = (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf-8').trim().length > 0
  } catch (_) {
    return false
  }
}

const checkServiceHealth = async (port) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      method: 'GET',
      signal: controller.signal
    })
    if (!response.ok) return false
    const body = await response.json().catch(() => ({}))
    return body?.ok === true
  } catch (_) {
    return false
  } finally {
    clearTimeout(timer)
  }
}

runCommand(async (context) => {
  const dataDir = process.env.OPENPET_DATA_DIR || context.paths?.dataDir || ''
  const port = getServicePort(context)
  const tokenPath = dataDir ? path.join(dataDir, 'ingest-token.txt') : ''
  const serviceHealthy = await checkServiceHealth(port)
  const checks = [
    {
      id: 'data-dir',
      ok: Boolean(dataDir) && fs.existsSync(dataDir),
      message: dataDir ? 'Plugin data directory is available.' : 'OPENPET_DATA_DIR is not available.'
    },
    {
      id: 'manual-hook-plan',
      ok: Boolean(dataDir) && fs.existsSync(path.join(dataDir, 'codex-hooks.manual.md')),
      message: 'Manual Codex hook setup instructions exist.'
    },
    {
      id: 'ingest-token',
      ok: Boolean(tokenPath) && fileHasText(tokenPath),
      message: 'Local ingest token exists for Codex hook events.'
    },
    {
      id: 'service-bridge',
      ok: Boolean(process.env.OPENPET_BRIDGE_URL && process.env.OPENPET_BRIDGE_TOKEN),
      message: 'Command bridge is available for this doctor command.'
    },
    {
      id: 'service-health',
      ok: serviceHealthy,
      message: serviceHealthy
        ? `Agent Awareness service is reachable on 127.0.0.1:${port}.`
        : `Agent Awareness service is not reachable on 127.0.0.1:${port}. Start the plugin service from OpenPet Control Center.`
    }
  ]
  return {
    healthy: checks.every((check) => check.ok),
    checks
  }
})
