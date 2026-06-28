const crypto = require('crypto')
const http = require('http')

const PLUGIN_BRIDGE_HOST = '127.0.0.1'
const MAX_PLUGIN_BRIDGE_BODY_BYTES = 1024 * 1024

const createPluginBridgeKey = (pluginId, commandId, runId) => `${pluginId}:${commandId}:${runId}`

const createPluginBridgeToken = () => crypto.randomBytes(24).toString('base64url')

const createPluginBridgeRunId = () => crypto.randomBytes(12).toString('base64url')

const extractBearerToken = (header = '') => {
  const match = String(header).match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : ''
}

const safeTokenEquals = (candidate, expected) => {
  const candidateBuffer = Buffer.from(String(candidate || ''))
  const expectedBuffer = Buffer.from(String(expected || ''))
  return candidateBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(candidateBuffer, expectedBuffer)
}

const isJsonRequest = (request) => {
  const contentType = String(request.headers['content-type'] || '').toLowerCase()
  return contentType.startsWith('application/json')
}

const readJsonBody = (request, maxBodyBytes = MAX_PLUGIN_BRIDGE_BODY_BYTES) => new Promise((resolve, reject) => {
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
    if (body.length > maxBodyBytes) {
      request.destroy()
      reject(new Error('Request body is too large'))
    }
  })
  request.on('end', () => {
    if (!body) {
      resolve({})
      return
    }
    try {
      resolve(JSON.parse(body))
    } catch (_) {
      reject(new Error('Invalid JSON body'))
    }
  })
  request.on('error', reject)
})

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify(body))
}

const ROUTE_PATTERN = /^\/plugins\/bridge\/([^/]+)\/([^/]+)\/([^/]+)(\/context|\/pet\/say|\/pet\/action|\/pet\/event|\/creator\/actions|\/creator\/actions\/validate|\/creator\/actions\/apply|\/creator\/trigger-proposals\/submit|\/creator\/pack-manifest|\/creator\/pack-manifest\/validate|\/creator\/pack-manifest\/apply|\/creator\/assets\/inspect-frames|\/creator\/assets\/import-frames|\/creator\/assets\/pick-frames\/inspect|\/creator\/assets\/pick-frames\/import|\/creator\/pet-pack\/inspect-output|\/creator\/pet-pack\/import-output|\/creator\/model-settings|\/creator\/model-health-check|\/creator\/model-image-generate)$/

const READ_ONLY_ROUTES = new Map([
  ['/context', 'context'],
  ['/creator/actions', 'creatorActionsRead'],
  ['/creator/pack-manifest', 'creatorPackManifestRead'],
  ['/creator/model-settings', 'creatorModelSettingsRead']
])

const JSON_ROUTES = new Map([
  ['/pet/say', 'petSay'],
  ['/pet/action', 'petAction'],
  ['/pet/event', 'petEvent'],
  ['/creator/actions/validate', 'creatorActionsValidate'],
  ['/creator/actions/apply', 'creatorActionsApply'],
  ['/creator/trigger-proposals/submit', 'creatorTriggerProposalSubmit'],
  ['/creator/pack-manifest/validate', 'creatorPackManifestValidate'],
  ['/creator/pack-manifest/apply', 'creatorPackManifestApply'],
  ['/creator/assets/inspect-frames', 'creatorAssetsInspectFrames'],
  ['/creator/assets/import-frames', 'creatorAssetsImportFrames'],
  ['/creator/assets/pick-frames/inspect', 'creatorAssetsPickFramesInspect'],
  ['/creator/assets/pick-frames/import', 'creatorAssetsPickFramesImport'],
  ['/creator/pet-pack/inspect-output', 'creatorPetPackInspectOutput'],
  ['/creator/pet-pack/import-output', 'creatorPetPackImportOutput'],
  ['/creator/model-health-check', 'creatorModelHealthCheck'],
  ['/creator/model-image-generate', 'creatorModelImageGenerate']
])

const createPluginCommandBridgeServer = ({
  appendLog = () => {},
  commandBridgeRuntimes,
  createServer = http.createServer,
  host = PLUGIN_BRIDGE_HOST,
  maxBodyBytes = MAX_PLUGIN_BRIDGE_BODY_BYTES
} = {}) => {
  if (!commandBridgeRuntimes) throw new Error('commandBridgeRuntimes is required')

  let server = null
  let port = 0
  let startingPromise = null

  const handleRequest = async (request, response) => {
    try {
      const url = new URL(request.url, `http://${host}`)
      const match = url.pathname.match(ROUTE_PATTERN)
      if (!match) {
        sendJson(response, 404, { ok: false, error: 'Not found' })
        return
      }
      const [, pluginId, commandId, runId, route] = match
      const runtimeKey = createPluginBridgeKey(pluginId, commandId, runId)
      const runtime = commandBridgeRuntimes.get(runtimeKey)
      if (!runtime || runtime.status !== 'running') {
        sendJson(response, 401, { ok: false, error: 'Bridge token expired' })
        return
      }

      const token = extractBearerToken(request.headers.authorization)
      if (!safeTokenEquals(token, runtime.token)) {
        appendLog({ pluginId, commandId, level: 'error', message: 'Bridge request rejected: unauthorized token' })
        sendJson(response, 401, { ok: false, error: 'Unauthorized' })
        return
      }

      const readOnlyHandler = READ_ONLY_ROUTES.get(route)
      if (readOnlyHandler) {
        sendJson(response, 200, await runtime.handlers[readOnlyHandler]())
        return
      }

      if (!isJsonRequest(request)) {
        sendJson(response, 415, { ok: false, error: 'Content-Type must be application/json' })
        return
      }

      const jsonHandler = JSON_ROUTES.get(route)
      if (jsonHandler) {
        sendJson(response, 200, await runtime.handlers[jsonHandler](await readJsonBody(request, maxBodyBytes)))
        return
      }

      sendJson(response, 404, { ok: false, error: 'Not found' })
    } catch (error) {
      const statusCode = /does not have/.test(String(error.message || '')) ? 403 : 400
      sendJson(response, statusCode, { ok: false, error: error.message || 'Bridge request failed' })
    }
  }

  const ensureStarted = async () => {
    if (server?.listening) return port
    if (startingPromise) return startingPromise

    startingPromise = (async () => {
      if (server && !server.listening) {
        server.removeAllListeners()
        server.close?.()
        server = null
        port = 0
      }

      const nextServer = createServer(handleRequest)
      server = nextServer

      await new Promise((resolve, reject) => {
        const onError = (error) => {
          nextServer?.off?.('listening', onListening)
          if (server === nextServer) {
            server = null
            port = 0
          }
          reject(error)
        }
        const onListening = () => {
          nextServer?.off?.('error', onError)
          const address = nextServer.address()
          port = typeof address === 'object' && address ? Number(address.port) || 0 : 0
          nextServer?.unref?.()
          resolve()
        }
        nextServer.once('error', onError)
        nextServer.once('listening', onListening)
        nextServer.listen(0, host)
      })

      return port
    })()

    try {
      return await startingPromise
    } finally {
      startingPromise = null
    }
  }

  const createBridgeBaseUrl = ({ pluginId, commandId, runId }) => (
    `http://${host}:${port}/plugins/bridge/${pluginId}/${commandId}/${runId}`
  )

  const unrefWhenIdle = () => {
    if (server && commandBridgeRuntimes.size === 0) server.unref?.()
  }

  const close = () => {
    server?.close?.()
    server = null
    port = 0
    startingPromise = null
  }

  return {
    close,
    createBridgeBaseUrl,
    ensureStarted,
    unrefWhenIdle
  }
}

module.exports = {
  createPluginBridgeKey,
  createPluginBridgeRunId,
  createPluginBridgeToken,
  createPluginCommandBridgeServer,
  PLUGIN_BRIDGE_HOST
}
