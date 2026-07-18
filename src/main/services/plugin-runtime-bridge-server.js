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
  const chunks = []
  let bodyBytes = 0
  let settled = false
  const settle = (callback, value) => {
    if (settled) return false
    settled = true
    callback(value)
    return true
  }
  request.on('data', (chunk) => {
    if (settled) return
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bodyBytes += buffer.length
    if (bodyBytes > maxBodyBytes) {
      chunks.length = 0
      settle(reject, new Error('Request body is too large'))
      return
    }
    chunks.push(buffer)
  })
  request.on('end', () => {
    if (settled) return
    const body = Buffer.concat(chunks, bodyBytes).toString('utf8')
    if (!body) {
      settle(resolve, {})
      return
    }
    try {
      settle(resolve, JSON.parse(body))
    } catch (_) {
      settle(reject, new Error('Invalid JSON body'))
    }
  })
  request.on('error', (error) => settle(reject, error))
})

const sendJson = (response, statusCode, body) => {
  if (response.destroyed || response.writableEnded) return false
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify(body))
  return true
}

const createClientDisconnectedError = () => {
  const error = new Error('Plugin bridge client disconnected')
  error.name = 'AbortError'
  return error
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
        const controller = new AbortController()
        const abortHandler = () => {
          if (!controller.signal.aborted) controller.abort(createClientDisconnectedError())
        }
        const closeHandler = () => {
          if (!response.writableEnded) abortHandler()
        }
        request.once('aborted', abortHandler)
        response.once('close', closeHandler)
        request.socket?.once('close', closeHandler)
        try {
          const payload = await readJsonBody(request, maxBodyBytes)
          sendJson(response, 200, await runtime.handlers[jsonHandler](payload, { signal: controller.signal }))
        } finally {
          request.off('aborted', abortHandler)
          response.off('close', closeHandler)
          request.socket?.off('close', closeHandler)
        }
        return
      }

      sendJson(response, 404, { ok: false, error: 'Not found' })
    } catch (error) {
      const statusCode = /does not have/.test(String(error.message || '')) ? 403 : 400
      const errorCode = String(error?.code || '').trim()
      sendJson(response, statusCode, {
        ok: false,
        error: error.message || 'Bridge request failed',
        ...(/^[a-z0-9][a-z0-9_]{0,79}$/.test(errorCode) ? { errorCode } : {})
      })
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
      nextServer.requestTimeout = 0
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
