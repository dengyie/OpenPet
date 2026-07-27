const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { fork } = require('child_process')

const LOCAL_PLUGIN_RUNNER_PATH = path.resolve(__dirname, '../../src/main/plugins/local-plugin-runner.js')
const TEST_TIMEOUT_MS = 8000

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-runner-test-'))
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

const createRunnerEnv = () => {
  const env = {}
  if (process.env.PATH) env.PATH = process.env.PATH
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot
  if (process.env.WINDIR) env.WINDIR = process.env.WINDIR
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
  return env
}

const createRunnerOptions = (pluginMainPath) => {
  const runnerPath = fs.realpathSync(LOCAL_PLUGIN_RUNNER_PATH)
  const pluginPath = fs.realpathSync(pluginMainPath)
  return {
    execPath: process.execPath,
    execArgv: [
      '--permission',
      `--allow-fs-read=${runnerPath}`,
      `--allow-fs-read=${pluginPath}`
    ],
    env: createRunnerEnv(),
    serialization: 'json',
    silent: true
  }
}

// The plugin path must be the *resolved* path everywhere: --allow-fs-read is
// matched against real paths, so granting /private/var/... while asking the
// runner to read /var/... (the macOS symlink) is denied. The production client
// resolves once and reuses that value; mirror it here.
const runPlugin = ({ mainPath: rawMainPath, commandId, payload = {}, config = {}, sdk = {}, timeoutMs = 5000 }) => new Promise((resolve, reject) => {
  const mainPath = fs.realpathSync(rawMainPath)
  const child = fork(LOCAL_PLUGIN_RUNNER_PATH, [], createRunnerOptions(mainPath))
  let settled = false
  const sdkCalls = []

  const finish = (error, result, captured) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    child.removeAllListeners()
    if (!child.killed) child.kill()
    if (error) reject(Object.assign(error, { sdkCalls: captured || sdkCalls }))
    else resolve({ result, sdkCalls: captured || sdkCalls })
  }

  const timer = setTimeout(() => {
    finish(new Error(`Plugin command timed out after ${timeoutMs}ms`), null, sdkCalls)
  }, timeoutMs)

  child.on('message', (message) => {
    if (!message || typeof message !== 'object') return
    if (message.type === 'ready') {
      child.send({ type: 'run', mainPath, commandId, payload, config })
      return
    }
    if (message.type === 'sdk-call') {
      sdkCalls.push({ operation: message.operation, payload: message.payload })
      const handler = sdk[message.operation]
      if (handler) {
        Promise.resolve(handler(message.payload))
          .then((result) => {
            if (child.connected) child.send({ type: 'sdk-result', id: message.id, ok: true, result })
          })
          .catch((error) => {
            if (child.connected) child.send({ type: 'sdk-result', id: message.id, ok: false, error: error.message })
          })
      } else {
        if (child.connected) child.send({ type: 'sdk-result', id: message.id, ok: false, error: 'SDK operation not mocked' })
      }
      return
    }
    if (message.type === 'result') {
      if (message.ok) finish(null, message.result, sdkCalls)
      else finish(new Error(message.error || 'Plugin command failed'), null, sdkCalls)
    }
  })

  child.on('error', (error) => finish(error, null, sdkCalls))
  child.on('exit', (code, signal) => {
    if (settled) return
    const detail = signal ? `signal ${signal}` : `exit code ${code}`
    finish(new Error(`Plugin runner exited: ${detail}`), null, sdkCalls)
  })
})

test('sandbox blocks process require', { timeout: TEST_TIMEOUT_MS }, async () => {
  const dir = createTempDir()
  try {
    const mainPath = writePlugin(dir, `
      export default function activate(ctx) {
        ctx.commands.register({
          id: 'escape',
          handler: () => {
            try {
              const proc = require('process')
              return { escaped: true, pid: proc.pid }
            } catch (error) {
              return { escaped: false, error: error.message }
            }
          }
        })
      }
    `)
    const { result } = await runPlugin({ mainPath, commandId: 'escape' })
    assert.equal(result.escaped, false, 'require(process) should throw in the sandbox')
    assert.match(result.error, /require is not defined|Cannot find module 'process'/)
  } finally {
    cleanupDir(dir)
  }
})

// 关键安全属性：插件代码可触达的每个对象都必须来自 sandbox realm。
// 一旦有 host realm 对象泄漏进来（最典型的是 host Promise），插件就能拿到
// `obj.constructor.constructor` === host Function，然后 `Function('return process')()`
// 直接逃逸——host Function 不受本 context 的 codeGeneration 限制。
//
// 这里用「能不能构造函数」来区分两个 realm：sandbox context 建立时
// codeGeneration.strings 为 false，所以 sandbox realm 的 Function 构造一定抛
// EvalError；而 host realm 的 Function 会正常返回可执行函数。因此断言
// 「抛出且拿不到 process」既证明了 codegen 被封，也证明了对象是 sandbox realm 的。
const REALM_PROBE = `
  const probeRealm = (label, value) => {
    let ctor
    try {
      ctor = value.constructor.constructor
    } catch (error) {
      return { label, reachedConstructor: false }
    }
    try {
      const escaped = ctor('return typeof process === "undefined" ? null : process.pid')()
      return { label, reachedConstructor: true, hostRealm: true, pid: escaped }
    } catch (error) {
      return { label, reachedConstructor: true, hostRealm: false, error: error.name }
    }
  }
`

test('no host-realm object is reachable from plugin code', { timeout: TEST_TIMEOUT_MS }, async () => {
  const dir = createTempDir()
  try {
    const mainPath = writePlugin(dir, `
      export default function activate(ctx) {
        ctx.commands.register({
          id: 'probe',
          handler: async () => {
            ${REALM_PROBE}
            const probes = []
            probes.push(probeRealm('ctx', ctx))
            probes.push(probeRealm('ctx.storage', ctx.storage))
            probes.push(probeRealm('ctx.storage.get', ctx.storage.get))
            probes.push(probeRealm('ctx.network.fetch', ctx.network.fetch))
            // SDK 调用返回的 Promise 是最危险的一处：它必须是 sandbox realm 的。
            const pending = ctx.storage.get('probe-key', 1)
            probes.push(probeRealm('sdk promise', pending))
            const settled = await pending
            probes.push(probeRealm('sdk resolved value box', { settled }))
            // SDK 失败时 reject 的 Error 也不能是 host Error。
            let rejection = null
            try {
              await ctx.network.fetch('https://blocked.example/')
            } catch (error) {
              rejection = probeRealm('sdk rejection error', error)
            }
            probes.push(rejection)
            return probes
          }
        })
      }
    `)
    const { result } = await runPlugin({
      mainPath,
      commandId: 'probe',
      sdk: {
        'storage:get': () => Promise.resolve(7),
        'network:fetch': () => Promise.reject(new Error('network denied'))
      }
    })

    assert.equal(result.length, 7)
    const hostRealmLeaks = result.filter((probe) => probe.hostRealm === true)
    assert.deepEqual(
      hostRealmLeaks,
      [],
      `host-realm objects reachable from plugin code: ${JSON.stringify(hostRealmLeaks)}`
    )
    // 每个探针都真的走到了 constructor.constructor，否则上面的断言会因为
    // 探针根本没执行而空过。
    for (const probe of result) {
      assert.equal(probe.reachedConstructor, true, `probe did not run: ${probe.label}`)
      assert.equal(probe.hostRealm, false, `sandbox realm expected: ${probe.label}`)
      assert.equal(probe.error, 'EvalError', `expected codegen block: ${probe.label}`)
    }
  } finally {
    cleanupDir(dir)
  }
})

test('sandbox blocks eval and new Function', { timeout: TEST_TIMEOUT_MS }, async () => {
  const dir = createTempDir()
  try {
    const mainPath = writePlugin(dir, `
      export default function activate(ctx) {
        ctx.commands.register({
          id: 'escape',
          handler: () => {
            const results = []
            try {
              eval('1+1')
              results.push({ method: 'eval', blocked: false })
            } catch (error) {
              results.push({ method: 'eval', blocked: true, error: error.message })
            }
            try {
              new Function('return 1+1')()
              results.push({ method: 'new Function', blocked: false })
            } catch (error) {
              results.push({ method: 'new Function', blocked: true, error: error.message })
            }
            return results
          }
        })
      }
    `)
    const { result } = await runPlugin({ mainPath, commandId: 'escape' })
    assert.ok(result.every((r) => r.blocked), 'eval and new Function should be blocked')
  } finally {
    cleanupDir(dir)
  }
})

test('sandbox enforces timeout', { timeout: TEST_TIMEOUT_MS }, async () => {
  const dir = createTempDir()
  try {
    const mainPath = writePlugin(dir, `
      export default function activate(ctx) {
        ctx.commands.register({
          id: 'loop',
          handler: () => {
            while (true) {}
          }
        })
      }
    `)
    await assert.rejects(
      () => runPlugin({ mainPath, commandId: 'loop', timeoutMs: 2000 }),
      /timed out/
    )
  } finally {
    cleanupDir(dir)
  }
})

test('sandbox only exposes whitelisted SDK methods', { timeout: TEST_TIMEOUT_MS }, async () => {
  const dir = createTempDir()
  try {
    const mainPath = writePlugin(dir, `
      export default function activate(ctx) {
        ctx.commands.register({
          id: 'introspect',
          handler: () => {
            const available = []
            const methods = ['storage', 'pet', 'ai', 'network', 'config', 'commands']
            for (const name of methods) {
              if (ctx[name]) available.push(name)
            }
            // 直接读 globalThis 上的属性名。不要写 global[name]——sandbox 里
            // 没有 global，那样每次都会抛进 catch，探针永远返回空数组（假通过）。
            const forbidden = []
            const dangerZone = [
              'require', 'process', 'fs', 'child_process', 'global',
              '__dirname', '__filename', 'Buffer', 'setTimeout', 'fetch',
              // 宿主注入的桥函数一旦挂到 globalThis 就等于把 host Function 交出去。
              '__openpetDispatch'
            ]
            for (const name of dangerZone) {
              if (typeof globalThis[name] !== 'undefined') forbidden.push(name)
            }
            return { available, forbidden }
          }
        })
      }
    `)
    const { result } = await runPlugin({ mainPath, commandId: 'introspect' })
    assert.deepEqual(result.available.sort(), ['ai', 'commands', 'config', 'network', 'pet', 'storage'])
    assert.deepEqual(result.forbidden, [], 'sandbox should not expose Node.js globals')
  } finally {
    cleanupDir(dir)
  }
})

// 入向边界：宿主返回给 SDK 调用的值，如果不是 JSON 值，绝不能以对象形式
// 抵达插件代码。任何 host-realm 的函数/对象一旦可达，插件就能通过
// .constructor.constructor 拿到 host Function 并逃逸出沙箱。
test('non-JSON host values reach plugin code as null, never as host objects', { timeout: TEST_TIMEOUT_MS }, async () => {
  const dir = createTempDir()
  try {
    const mainPath = writePlugin(dir, `
      export default function activate(ctx) {
        ctx.commands.register({
          id: 'inbound',
          handler: async () => {
            const fromFunction = await ctx.storage.get('smuggle-function', null)
            const fromUndefined = await ctx.storage.get('smuggle-undefined', null)
            const fromSymbol = await ctx.storage.get('smuggle-symbol', null)
            const fromHostError = await ctx.storage.get('smuggle-error', null)

            // 只回报可 JSON 化的描述，避免把探测到的东西又送回宿主。
            // 判定 realm 的关键：沙箱内的对象原型必须是沙箱自己的
            // Object.prototype。host-realm 对象的原型来自另一个 realm，
            // 这个恒等比较就会是 false —— 那才是可以 .constructor.constructor
            // 拿到 host Function 的逃逸入口。
            const describe = (value) => ({
              isNull: value === null,
              type: typeof value,
              isSandboxRealm: value === null
                || typeof value !== 'object'
                || Object.getPrototypeOf(value) === Object.prototype,
              ownKeys: value !== null && typeof value === 'object' ? Object.keys(value) : []
            })
            return {
              fromFunction: describe(fromFunction),
              fromUndefined: describe(fromUndefined),
              fromSymbol: describe(fromSymbol),
              fromHostError: describe(fromHostError)
            }
          }
        })
      }
    `)
    const { result } = await runPlugin({
      mainPath,
      commandId: 'inbound',
      sdk: {
        'storage:get': ({ key }) => {
          if (key === 'smuggle-function') return Promise.resolve(() => 'escaped')
          if (key === 'smuggle-undefined') return Promise.resolve(undefined)
          if (key === 'smuggle-symbol') return Promise.resolve(Symbol('smuggled'))
          if (key === 'smuggle-error') return Promise.resolve(new Error('host error'))
          return Promise.resolve(null)
        }
      }
    })

    // 函数 / undefined / symbol 都不可 JSON 化，宿主侧 JSON.stringify 后
    // 变成 undefined，runner 再统一落成 null。
    for (const key of ['fromFunction', 'fromUndefined', 'fromSymbol']) {
      assert.equal(result[key].isNull, true, `${key} must arrive as null`)
      assert.equal(result[key].isSandboxRealm, true, `${key} must not be a host-realm object`)
    }

    // Error 实例的字段不可枚举，JSON.stringify 得到 {}，所以抵达插件侧是一个
    // 空对象而不是 null。安全性由 realm 归属保证：它由沙箱内的 JSON.parse
    // 构造，原型是沙箱自己的 Object.prototype，拿不到 host Function。
    assert.equal(result.fromHostError.isNull, false, 'a host Error serializes to {}, not null')
    assert.deepEqual(result.fromHostError.ownKeys, [], 'host Error must not leak enumerable fields')
    assert.equal(result.fromHostError.isSandboxRealm, true, 'fromHostError must be a sandbox-realm object')
  } finally {
    cleanupDir(dir)
  }
})

// 出向边界：插件返回的非 JSON 值必须让整条命令失败（cloneJsonValue 抛错），
// 而不是被悄悄丢弃 —— 静默丢弃会让插件作者以为数据传过去了。
test('non-JSON plugin results are rejected at the boundary with the offending path', { timeout: TEST_TIMEOUT_MS }, async () => {
  const cases = [
    { name: 'function', body: 'return { ok: 1, smuggled: () => "host code" }', path: 'result.smuggled' },
    { name: 'non-finite number', body: 'return { ok: 1, smuggled: 0 / 0 }', path: 'result.smuggled' },
    { name: 'circular object', body: 'const a = { ok: 1 }; a.smuggled = a; return a', path: 'result.smuggled' }
  ]

  for (const testCase of cases) {
    const dir = createTempDir()
    try {
      const mainPath = writePlugin(dir, `
        export default function activate(ctx) {
          ctx.commands.register({
            id: 'outbound',
            handler: () => { ${testCase.body} }
          })
        }
      `)
      await assert.rejects(
        runPlugin({ mainPath, commandId: 'outbound' }),
        (error) => {
          assert.match(
            error.message,
            /Plugin result must be JSON serializable at /,
            `${testCase.name}: expected a serialization rejection, got: ${error.message}`
          )
          assert.ok(
            error.message.includes(testCase.path),
            `${testCase.name}: rejection should name the offending path ${testCase.path}, got: ${error.message}`
          )
          return true
        }
      )
    } finally {
      cleanupDir(dir)
    }
  }
})

test('plugin can call multiple SDK methods and receive results', { timeout: TEST_TIMEOUT_MS }, async () => {
  const dir = createTempDir()
  try {
    const mainPath = writePlugin(dir, `
      export default function activate(ctx) {
        ctx.commands.register({
          id: 'multi',
          handler: async (payload) => {
            const stored = await ctx.storage.get('counter', 0)
            await ctx.storage.set('counter', stored + 1)
            await ctx.pet.say({ message: 'Hello from plugin' })
            return { previous: stored, message: payload.message }
          }
        })
      }
    `)
    let storage = { counter: 5 }
    const { result, sdkCalls } = await runPlugin({
      mainPath,
      commandId: 'multi',
      payload: { message: 'test' },
      sdk: {
        'storage:get': ({ key, fallbackValue }) => Promise.resolve(storage[key] ?? fallbackValue),
        'storage:set': ({ key, value }) => {
          storage[key] = value
          return Promise.resolve()
        },
        'pet:say': () => Promise.resolve()
      }
    })
    assert.equal(result.previous, 5)
    assert.equal(result.message, 'test')
    assert.equal(storage.counter, 6)
    assert.equal(sdkCalls.length, 3)
    assert.equal(sdkCalls[0].operation, 'storage:get')
    assert.equal(sdkCalls[1].operation, 'storage:set')
    assert.equal(sdkCalls[2].operation, 'pet:say')
  } finally {
    cleanupDir(dir)
  }
})
