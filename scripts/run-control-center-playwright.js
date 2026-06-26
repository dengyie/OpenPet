#!/usr/bin/env node

const net = require('node:net')
const { spawn } = require('node:child_process')

const DEFAULT_HOST = '127.0.0.1'
const findAvailablePort = async (host = DEFAULT_HOST) => new Promise((resolve, reject) => {
  const server = net.createServer()

  server.once('error', reject)
  server.once('listening', () => {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve(port)
    })
  })

  server.listen(0, host)
})

const main = async () => {
  const port = process.env.OPENPET_CONTROL_CENTER_PORT
    ? Number(process.env.OPENPET_CONTROL_CENTER_PORT)
    : await findAvailablePort()

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid OPENPET_CONTROL_CENTER_PORT: ${process.env.OPENPET_CONTROL_CENTER_PORT || ''}`)
  }

  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['playwright', 'test', ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        OPENPET_CONTROL_CENTER_PORT: String(port)
      }
    }
  )

  child.once('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
