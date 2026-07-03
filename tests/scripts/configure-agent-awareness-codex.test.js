const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const {
  OPENPET_HOOK_EVENTS,
  configureCodexAgentAwareness,
  createHookCommand,
  defaultDataDir,
  mergeOpenPetHooks,
  parseArgs,
  removeOpenPetHandlers,
  shellQuote
} = require('../../scripts/configure-agent-awareness-codex')

test('parseArgs accepts codex one-click configuration options', () => {
  const options = parseArgs([
    '--codex-home', '/tmp/codex-home',
    '--data-dir', '/tmp/openpet-data',
    '--port', '9876',
    '--dry-run',
    '--json'
  ])

  assert.equal(options.codexHome, '/tmp/codex-home')
  assert.equal(options.dataDir, '/tmp/openpet-data')
  assert.equal(options.port, 9876)
  assert.equal(options.dryRun, true)
  assert.equal(options.json, true)
})

test('parseArgs rejects unknown options and invalid ports', () => {
  assert.throws(() => parseArgs(['--port']), /--port requires a value/)
  assert.throws(() => parseArgs(['--port', 'nope']), /--port must be a positive number/)
  assert.throws(() => parseArgs(['--unknown']), /Unexpected argument/)
})

test('defaultDataDir prefers installed bundled plugin data directory when present', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-config-home-'))
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-config-project-'))
  const expected = path.join(homeDir, 'Library', 'Application Support', 'ibot', 'plugins', '.openpet', 'openpet.agent-awareness', 'data')

  assert.equal(
    defaultDataDir({ homeDir, projectRoot }),
    path.join(projectRoot, 'examples', 'plugins', '.openpet', 'openpet.agent-awareness', 'data')
  )

  fs.mkdirSync(path.join(homeDir, 'Library', 'Application Support', 'ibot', 'plugins', 'openpet.agent-awareness'), { recursive: true })
  assert.equal(defaultDataDir({ homeDir, projectRoot }), expected)
})

test('mergeOpenPetHooks preserves existing hooks and replaces previous OpenPet handlers', () => {
  const existing = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            { type: 'command', command: 'echo existing' },
            { type: 'command', command: '/usr/bin/env node "/old/openpet-agent-awareness.js"' }
          ]
        }
      ],
      Stop: [
        {
          hooks: [{ type: 'command', command: 'echo stop' }]
        }
      ]
    }
  }

  const merged = mergeOpenPetHooks({
    existingConfig: existing,
    dataDir: '/tmp/data',
    port: 8795,
    scriptPath: '/tmp/hooks/openpet-agent-awareness.js'
  })

  assert.equal(merged.hooks.PreToolUse[0].hooks.length, 1)
  assert.equal(merged.hooks.PreToolUse[0].hooks[0].command, 'echo existing')
  assert.equal(merged.hooks.Stop[0].hooks[0].command, 'echo stop')
  for (const eventName of OPENPET_HOOK_EVENTS) {
    assert.equal(Array.isArray(merged.hooks[eventName]), true)
    assert.equal(
      merged.hooks[eventName].some((group) => group.hooks.some((hook) => hook.command.includes('openpet-agent-awareness.js'))),
      true
    )
  }
})

test('removeOpenPetHandlers drops empty event groups after removing OpenPet hooks', () => {
  const result = removeOpenPetHandlers({
    hooks: {
      Stop: [
        {
          hooks: [{ type: 'command', command: '/usr/bin/env node "/tmp/openpet-agent-awareness.js"' }]
        }
      ]
    }
  })

  assert.deepEqual(result, { hooks: {} })
})

test('configureCodexAgentAwareness writes token, hook sender, hooks.json, and backups existing hooks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-config-'))
  const codexHome = path.join(root, 'codex-home')
  const dataDir = path.join(root, 'agent-data')
  fs.mkdirSync(codexHome, { recursive: true })
  fs.writeFileSync(path.join(codexHome, 'hooks.json'), JSON.stringify({
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'echo existing-stop' }] }]
    }
  }, null, 2))

  const result = configureCodexAgentAwareness({ codexHome, dataDir, port: 8796 })
  const hooksConfig = JSON.parse(fs.readFileSync(path.join(codexHome, 'hooks.json'), 'utf-8'))
  const script = fs.readFileSync(result.hookScriptPath, 'utf-8')

  assert.equal(fs.existsSync(result.tokenPath), true)
  assert.equal(fs.existsSync(result.instructionsPath), true)
  assert.equal(fs.existsSync(result.hookScriptPath), true)
  assert.equal(fs.existsSync(result.backupPath), true)
  assert.equal(script.includes(fs.readFileSync(result.tokenPath, 'utf-8').trim()), false)
  assert.equal(JSON.stringify(hooksConfig).includes(fs.readFileSync(result.tokenPath, 'utf-8').trim()), false)
  assert.equal(hooksConfig.hooks.Stop[0].hooks[0].command, 'echo existing-stop')
  assert.equal(result.serviceUrl, 'http://127.0.0.1:8796/api/events')
  assert.match(hooksConfig.hooks.SessionStart.at(-1).matcher, /startup/)
  assert.equal(hooksConfig.hooks.UserPromptSubmit.at(-1).matcher, undefined)
})

test('configureCodexAgentAwareness is idempotent after initial write', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-config-idempotent-'))
  const codexHome = path.join(root, 'codex-home')
  const dataDir = path.join(root, 'agent-data')

  const first = configureCodexAgentAwareness({ codexHome, dataDir })
  const second = configureCodexAgentAwareness({ codexHome, dataDir })

  assert.equal(first.hooksChanged, true)
  assert.equal(first.hookScriptChanged, true)
  assert.equal(second.hooksChanged, false)
  assert.equal(second.hookScriptChanged, false)
  assert.equal(second.backupPath, '')
})

test('configureCodexAgentAwareness dry-run reports paths without writing files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-config-dry-'))
  const codexHome = path.join(root, 'codex-home')
  const dataDir = path.join(root, 'agent-data')

  const result = configureCodexAgentAwareness({ codexHome, dataDir, dryRun: true })

  assert.equal(result.dryRun, true)
  assert.equal(fs.existsSync(codexHome), false)
  assert.equal(fs.existsSync(dataDir), false)
})

test('generated hook command quotes paths with spaces', () => {
  const command = createHookCommand({
    dataDir: "/tmp/path with spaces/$(echo unsafe)'/data",
    port: 8795,
    scriptPath: "/tmp/path with spaces/$(echo unsafe)'/openpet-agent-awareness.js"
  })

  assert.equal(command.includes('$(echo unsafe)"'), false)
  assert.equal(command.includes('OPENPET_AGENT_AWARENESS_DATA_DIR='), true)
  assert.equal(command.includes("'\\''"), true)
  assert.equal(command.includes("OPENPET_AGENT_AWARENESS_DATA_DIR='/tmp/path with spaces/"), true)
  assert.equal(command.includes("'/tmp/path with spaces/"), true)
})

test('shellQuote prevents command substitution and preserves quoted values', () => {
  const quoted = shellQuote("path with $(touch unsafe) and ' quote")
  assert.equal(quoted, "'path with $(touch unsafe) and '\\'' quote'")
})

test('generated hook sender posts sanitized bounded event fields', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-codex-hook-sender-'))
  const codexHome = path.join(root, 'codex-home')
  const dataDir = path.join(root, 'agent-data')
  const result = configureCodexAgentAwareness({ codexHome, dataDir })
  const token = fs.readFileSync(result.tokenPath, 'utf-8').trim()
  const received = []
  let resolveReceived
  const receivedPromise = new Promise((resolve) => { resolveReceived = resolve })
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      received.push({
        authorization: request.headers.authorization,
        body: JSON.parse(body)
      })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ok: true }))
      resolveReceived()
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const run = spawnSync(process.execPath, [result.hookScriptPath], {
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      session_id: 'session with spaces',
      cwd: '/tmp/OpenPet',
      tool_name: 'Bash',
      tool_input: { command: 'echo sk-test123' }
    }),
    encoding: 'utf-8',
    env: {
      ...process.env,
      OPENPET_AGENT_AWARENESS_DATA_DIR: dataDir,
      OPENPET_AGENT_AWARENESS_URL: `http://127.0.0.1:${address.port}/api/events`
    }
  })
  if (received.length === 0) await Promise.race([
    receivedPromise,
    new Promise((resolve) => setTimeout(resolve, 1500))
  ])
  await new Promise((resolve) => server.close(resolve))

  assert.equal(run.status, 0)
  assert.equal(received.length, 1)
  assert.equal(received[0].authorization, `Bearer ${token}`)
  assert.equal(received[0].body.type, 'PreToolUse')
  assert.equal(received[0].body.status, 'working')
  assert.equal(received[0].body.message, 'Codex is starting Bash.')
  assert.equal(Object.prototype.hasOwnProperty.call(received[0].body, 'tool_input'), false)
})
