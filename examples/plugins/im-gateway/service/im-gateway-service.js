const http = require('node:http')
const { createBridgeClient } = require('./bridge-client')
const { readConfigFromEnv } = require('./config')
const { createDefaultAdapters } = require('./adapters/registry')
const { createQqHttpClient } = require('./adapters/qq-official')
const { createWecomHttpClient } = require('./adapters/wecom')
const { createImGateway } = require('./core/gateway')
const { createRuntimeLogEvent } = require('./runtime-log')

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
  logEvent = createRuntimeLogEvent(),
  fetchImpl = globalThis.fetch,
  httpClient,
  qqHttpClient,
  wecomHttpClient,
  websocketFactory,
  adapters = createDefaultAdapters({
    config,
    token: process.env.OPENPET_IM_TELEGRAM_BOT_TOKEN || '',
    secrets: {
      appId: process.env.OPENPET_IM_QQ_APP_ID || '',
      clientSecret: process.env.OPENPET_IM_QQ_CLIENT_SECRET || ''
    },
    wecomSecrets: {
      corpId: process.env.OPENPET_IM_WECOM_CORP_ID || config.wecomCorpId || '',
      corpSecret: process.env.OPENPET_IM_WECOM_CORP_SECRET || '',
      token: process.env.OPENPET_IM_WECOM_TOKEN || '',
      encodingAesKey: process.env.OPENPET_IM_WECOM_ENCODING_AES_KEY || ''
    },
    qqHttpClient: qqHttpClient || httpClient || createQqHttpClient({ fetchImpl }),
    wecomHttpClient: wecomHttpClient || httpClient || createWecomHttpClient({ fetchImpl }),
    websocketFactory,
    logEvent
  }),
  createServer = http.createServer
} = {}) => {
  const gateway = createImGateway({ adapters, bridgeClient, config, logEvent })
  let server = null

  const handleRequest = async (request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, gateway.getHealth())
      return
    }
    const wecom = adapters.find((adapter) => adapter.id === 'wecom')
    const callbackPath = config.wecomCallbackPath || '/wecom/callback'
    if (wecom && url.pathname === callbackPath && request.method === 'GET') {
      const encrypted = String(url.searchParams.get('echostr') || '')
      const valid = wecom.verifyCallback?.({ timestamp: url.searchParams.get('timestamp'), nonce: url.searchParams.get('nonce'), encrypt: encrypted, signature: url.searchParams.get('msg_signature') || url.searchParams.get('signature') })
      let body = encrypted
      let statusCode = valid ? 200 : 403
      if (valid && encrypted) {
        try {
          body = wecom.decryptEcho?.(encrypted) || encrypted
        } catch (_) {
          statusCode = 400
          body = 'invalid-encrypted-callback'
        }
      }
      response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end(body)
      return
    }
    if (wecom && url.pathname === callbackPath && request.method === 'POST') {
      const chunks = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size > 1024 * 1024) { sendJson(response, 413, { ok: false, error: 'payload-too-large' }); return }
        chunks.push(chunk)
      }
      const result = await wecom.handleUpdate?.({
        body: Buffer.concat(chunks).toString('utf8'),
        timestamp: url.searchParams.get('timestamp'),
        nonce: url.searchParams.get('nonce'),
        signature: url.searchParams.get('msg_signature') || url.searchParams.get('signature')
      })
      const accepted = result?.ok === true
      if (accepted) {
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end('success')
      } else {
        sendJson(response, 403, result || { ok: false, error: 'callback-failed' })
      }
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
