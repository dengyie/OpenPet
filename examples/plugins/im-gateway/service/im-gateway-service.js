const http = require('node:http')
const { createBridgeClient } = require('./bridge-client')
const { readConfigFromEnv } = require('./config')
const { createDefaultAdapters } = require('./adapters/registry')
const { createImGateway } = require('./core/gateway')

const DEFAULT_PORT = 8796

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify(body))
}

const createImGatewayServer = ({
  config = readConfigFromEnv(),
  bridgeClient = createBridgeClient(),
  adapters = createDefaultAdapters({
    config,
    token: process.env.OPENPET_IM_TELEGRAM_BOT_TOKEN || ''
  }),
  createServer = http.createServer
} = {}) => {
  const gateway = createImGateway({ adapters, bridgeClient, config })
  let server = null

  const handleRequest = async (request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, gateway.getHealth())
      return
    }
    sendJson(response, 404, { ok: false, error: 'Not found' })
  }

  const start = async (port = DEFAULT_PORT) => {
    if (server) return server
    server = createServer((request, response) => {
      handleRequest(request, response).catch(() => {
        sendJson(response, 500, { ok: false, error: 'IM Gateway service failed' })
      })
    })
    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
    await gateway.start()
    return server
  }

  const close = async () => {
    await gateway.stop()
    if (!server) return
    const currentServer = server
    server = null
    await new Promise((resolve, reject) => currentServer.close((error) => error ? reject(error) : resolve()))
  }

  return {
    close,
    get gateway() {
      return gateway
    },
    get server() {
      return server
    },
    start
  }
}

if (require.main === module) {
  const service = createImGatewayServer()
  const shutdown = () => {
    service.close().finally(() => process.exit(0))
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  service.start(Number(process.env.PORT) || DEFAULT_PORT).catch((error) => {
    console.error(error?.message || 'Failed to start IM Gateway service')
    process.exit(1)
  })
}

module.exports = {
  DEFAULT_PORT,
  createImGatewayServer
}
