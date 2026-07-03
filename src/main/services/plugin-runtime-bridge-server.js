const crypto = require('crypto')
const http = require('http')

const PLUGIN_BRIDGE_HOST = '127.0.0.1'
const MAX_PLUGIN_BRIDGE_BODY_BYTES = 1024 * 1024

const createPluginBridgeKey = (pluginId, runtimeId, runId) => `${pluginId}:${runtimeId}:${runId}`

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

const createPluginRuntimeBridgeServer = ({
  appendLog = () => {},
  bridgeRuntimes,
  createServer = http.createServer,
  host = PLUGIN_BRIDGE_HOST,
  jsonRoutes,
  maxBodyBytes = MAX_PLUGIN_BRIDGE_BODY_BYTES,
  readOnlyRoutes,
  routePattern
} = {}) => {
  if (!bridgeRuntimes) throw new Error('bridgeRuntimes is required')
  if (!(readOnlyRoutes instanceof Map)) throw new Error('readOnlyRoutes is required')
  if (!(jsonRoutes instanceof Map)) throw new Error('jsonRoutes is required')
  if (!(routePattern instanceof RegExp)) throw new Error('routePattern is required')

  let server = null
  let port = 0
  let startingPromise = null

  const handleRequest = async (request, response) => {
    try {
      const url = new URL(request.url, `http://${host}`)
      const match = url.pathname.match(routePattern)
      if (!match) {
        sendJson(response, 404, { ok: false, error: 'Not found' })
        return
      }
      const [, pluginId, runtimeId, runId, route] = match
      const runtimeKey = createPluginBridgeKey(pluginId, runtimeId, runId)
      const runtime = bridgeRuntimes.get(runtimeKey)
      if (!runtime || runtime.status !== 'running') {
        sendJson(response, 401, { ok: false, error: 'Bridge token expired' })
        return
      }

      const token = extractBearerToken(request.headers.authorization)
      if (!safeTokenEquals(token, runtime.token)) {
        appendLog({
          pluginId,
          commandId: runtime.logCommandId || runtimeId,
          level: 'error',
          message: 'Bridge request rejected: unauthorized token'
        })
        sendJson(response, 401, { ok: false, error: 'Unauthorized' })
        return
      }

      const readOnlyHandler = readOnlyRoutes.get(route)
      if (readOnlyHandler) {
        sendJson(response, 200, await runtime.handlers[readOnlyHandler]())
        return
      }

      if (!isJsonRequest(request)) {
        sendJson(response, 415, { ok: false, error: 'Content-Type must be application/json' })
        return
      }

      const jsonHandler = jsonRoutes.get(route)
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

  const createBridgeBaseUrl = ({ pluginId, runtimeId, runId }) => (
    `http://${host}:${port}/plugins/bridge/${pluginId}/${runtimeId}/${runId}`
  )

  const unrefWhenIdle = () => {
    if (server && bridgeRuntimes.size === 0) server.unref?.()
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
  createPluginRuntimeBridgeServer,
  PLUGIN_BRIDGE_HOST
}
