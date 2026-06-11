const crypto = require('crypto')
const http = require('http')

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const MAX_BODY_BYTES = 1024 * 1024

const createLocalHttpToken = () => crypto.randomBytes(24).toString('base64url')

const extractBearerToken = (header = '') => {
  const match = String(header).match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : ''
}

const getRequestToken = (request) => {
  return extractBearerToken(request.headers.authorization)
    || String(request.headers['x-ibot-token'] || '')
}

const isJsonRequest = (request) => {
  const contentType = String(request.headers['content-type'] || '').toLowerCase()
  return contentType.startsWith('application/json')
}

const readJsonBody = (request) => new Promise((resolve, reject) => {
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
    if (body.length > MAX_BODY_BYTES) {
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

const getState = (server, config) => {
  const address = server?.address()
  return {
    enabled: Boolean(server?.listening),
    host: config.host,
    port: typeof address === 'object' && address ? address.port : config.port
  }
}

const isAuthorized = (request, config) => {
  return Boolean(config.token) && getRequestToken(request) === config.token
}

const closeServer = (server) => new Promise((resolve, reject) => {
  server.close((error) => {
    if (error) reject(error)
    else resolve()
  })
})

const createLocalHttpService = ({ petService }) => {
  if (!petService) throw new Error('petService is required')

  let active = null
  let config = { enabled: false, host: '127.0.0.1', port: 0, token: '' }

  const createRequestHandler = (runtime) => async (request, response) => {
    const requestConfig = runtime.config
    try {
      const url = new URL(request.url, `http://${requestConfig.host}`)

      if (request.method === 'GET' && url.pathname === '/api/status') {
        const body = {
          ok: true,
          service: getState(runtime.server, requestConfig)
        }
        if (isAuthorized(request, requestConfig)) body.snapshot = petService.getSnapshot()
        sendJson(response, 200, body)
        return
      }

      const isPetMutation = request.method === 'POST' && [
        '/api/pet/say',
        '/api/pet/action',
        '/api/pet/event'
      ].includes(url.pathname)

      if (isPetMutation && !isAuthorized(request, requestConfig)) {
        sendJson(response, 401, { ok: false, error: 'Unauthorized' })
        return
      }

      if (isPetMutation && !isJsonRequest(request)) {
        sendJson(response, 415, { ok: false, error: 'Content-Type must be application/json' })
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/pet/say') {
        const body = await readJsonBody(request)
        const result = petService.say({ text: body.text, ttlMs: body.ttlMs, source: 'http' })
        sendJson(response, 200, { ok: true, result })
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/pet/action') {
        const body = await readJsonBody(request)
        const result = petService.playAction({ actionId: body.actionId, source: 'http' })
        sendJson(response, 200, { ok: true, result })
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/pet/event') {
        const body = await readJsonBody(request)
        const result = petService.setEvent({ ...body, source: 'http' })
        sendJson(response, 200, { ok: true, result })
        return
      }

      sendJson(response, 404, { ok: false, error: 'Not found' })
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message || 'Bad request' })
    }
  }

  const stop = async () => {
    if (!active) {
      config = { ...config, enabled: false }
      return getState(null, config)
    }
    const currentRuntime = active
    active = null
    await closeServer(currentRuntime.server)
    config = { ...currentRuntime.config, enabled: false }
    return getState(null, config)
  }

  const start = async (nextConfig = {}) => {
    const host = nextConfig.host || '127.0.0.1'
    if (!LOOPBACK_HOSTS.has(host)) {
      throw new Error('Local HTTP service must bind to a loopback host')
    }
    if (!nextConfig.token) {
      throw new Error('Local HTTP service token is required')
    }
    const port = Number(nextConfig.port || 0)
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error('Local HTTP service port must be between 0 and 65535')
    }

    if (active && active.config.host === host && active.config.port === port) {
      active.config = {
        ...active.config,
        token: nextConfig.token
      }
      config = active.config
      return getState(active.server, active.config)
    }

    const runtime = {
      server: null,
      config: {
        enabled: true,
        host,
        port,
        token: nextConfig.token
      }
    }
    runtime.server = http.createServer(createRequestHandler(runtime))

    await new Promise((resolve, reject) => {
      runtime.server.once('error', reject)
      runtime.server.listen(port, host, resolve)
    })

    const previousRuntime = active
    active = runtime
    config = runtime.config
    if (previousRuntime) await closeServer(previousRuntime.server)

    return getState(runtime.server, config)
  }

  const getStatus = () => {
    if (!active) return getState(null, config)
    return getState(active.server, active.config)
  }

  return { start, stop, getStatus }
}

module.exports = { LOOPBACK_HOSTS, createLocalHttpService, createLocalHttpToken }
