const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  LOCAL_PLUGIN_COMMAND_TIMEOUT_MS,
  runLocalPluginCommand
} = require('../../src/main/services/local-plugin-runner-client')

const TEST_TIMEOUT_MS = 8000

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-runner-client-'))
const cleanupDir = (dir) => {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (_) {}
}

const writePlugin = (dir, source) => {
  const mainPath = path.join(dir, 'plugin.js')
  fs.writeFileSync(mainPath, source, 'utf8')
  return mainPath
}

const createSdk = (overrides = {}) => ({
  storage: {
    get: async (_key, fallbackValue) => fallbackValue ?? null,
    set: async () => {},
    remove: async () => {},
    clear: async () => {}
  },
  pet: {
    say: async () => {},
    playAction: async () => {},
    setEvent: async () => {}
  },
  ai: {
    chat: async () => ({ text: '' })
  },
  network: {
    fetch: async () => ({ ok: false, status: 0, body: '' })
  },
  ...overrides
})

test('runLocalPluginCommand returns a JSON-safe result from a local plugin', { timeout: TEST_TIMEOUT_MS }, async () => {
  const dir = createTempDir()
  try {
    const mainPath = writePlugin(dir, `
      export default function activate(ctx) {
        ctx.commands.register({
          id: 'echo',
          handler: async (payload) => ({
            hello: payload.name,
            flag: true,
            count: 2
          })
        })
      }
    `)
    const result = await runLocalPluginCommand({
      plugin: { mainPath },
      sdk: createSdk(),
      commandId: 'echo',
      payload: { name: 'openpet' },
      config: { theme: 'dark' }
    })
    assert.deepEqual(result, { hello: 'openpet', flag: true, count: 2 })
  } finally {
    cleanupDir(dir)
  }
})

test('runLocalPluginCommand rejects a non-JSON inbound payload before the plugin runs', { timeout: TEST_TIMEOUT_MS }, async () => {
  const dir = createTempDir()
  try {
    const mainPath = writePlugin(dir, `
      export default function activate(ctx) {
        ctx.commands.register({
          id: 'never',
          handler: () => ({ ran: true })
        })
      }
    `)
    await assert.rejects(
      runLocalPluginCommand({
        plugin: { mainPath },
        sdk: createSdk(),
        commandId: 'never',
        // 函数不可 JSON 化——客户端必须在 ready 处理里拒绝，而不是裸抛。
        payload: { leak: () => 'host' },
        config: {}
      }),
      /must be JSON serializable/
    )
  } finally {
    cleanupDir(dir)
  }
})

test('runLocalPluginCommand surfaces a non-JSON host SDK result as an SDK failure', { timeout: TEST_TIMEOUT_MS }, async () => {
  const dir = createTempDir()
  try {
    const mainPath = writePlugin(dir, `
      export default function activate(ctx) {
        ctx.commands.register({
          id: 'read',
          handler: async () => {
            try {
              await ctx.storage.get('key', null)
              return { escaped: true }
            } catch (error) {
              return { escaped: false, message: String(error && error.message || error) }
            }
          }
        })
      }
    `)
    const result = await runLocalPluginCommand({
      plugin: { mainPath },
      sdk: createSdk({
        storage: {
          // 返回函数会让 cloneJsonValue 抛错；客户端应回 ok:false 而不是让
          // then 回调里的裸抛变成 unhandledRejection。
          get: async () => ({ leak: () => 'host' }),
          set: async () => {},
          remove: async () => {},
          clear: async () => {}
        }
      }),
      commandId: 'read',
      payload: {},
      config: {}
    })
    assert.equal(result.escaped, false)
    assert.match(result.message, /must be JSON serializable|SDK|Plugin/)
  } finally {
    cleanupDir(dir)
  }
})

test('runLocalPluginCommand rejects a non-JSON plugin result at the host boundary', { timeout: TEST_TIMEOUT_MS }, async () => {
  const dir = createTempDir()
  try {
    const mainPath = writePlugin(dir, `
      export default function activate(ctx) {
        ctx.commands.register({
          id: 'bad',
          // Infinity 过不了 cloneJsonValue；runner 会先拒绝，客户端也会兜底拒绝。
          handler: () => ({ value: 1 / 0 })
        })
      }
    `)
    await assert.rejects(
      runLocalPluginCommand({
        plugin: { mainPath },
        sdk: createSdk(),
        commandId: 'bad',
        payload: {},
        config: {}
      }),
      /must be JSON serializable/
    )
  } finally {
    cleanupDir(dir)
  }
})

test('runLocalPluginCommand times out a hung plugin command', { timeout: TEST_TIMEOUT_MS }, async () => {
  const dir = createTempDir()
  try {
    const mainPath = writePlugin(dir, `
      export default function activate(ctx) {
        ctx.commands.register({
          id: 'hang',
          handler: () => new Promise(() => {})
        })
      }
    `)
    const started = Date.now()
    await assert.rejects(
      runLocalPluginCommand({
        plugin: { mainPath },
        sdk: createSdk(),
        commandId: 'hang',
        payload: {},
        config: {},
        timeoutMs: 400
      }),
      /timed out after 400ms/
    )
    assert.ok(Date.now() - started < 3000, 'timeout should not wait for the full default')
  } finally {
    cleanupDir(dir)
  }
})

test('LOCAL_PLUGIN_COMMAND_TIMEOUT_MS stays a finite positive default', () => {
  assert.equal(typeof LOCAL_PLUGIN_COMMAND_TIMEOUT_MS, 'number')
  assert.ok(LOCAL_PLUGIN_COMMAND_TIMEOUT_MS > 0)
  assert.ok(Number.isFinite(LOCAL_PLUGIN_COMMAND_TIMEOUT_MS))
})
