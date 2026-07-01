const fs = require('fs')
const vm = require('vm')

const LOCAL_PLUGIN_SCRIPT_TIMEOUT_MS = 1000

let nextRequestId = 1
// id -> { callId }. Maps a host transport request back to the sandbox-realm
// pending Promise it should settle. The runner forks one process per command,
// so a single active context is sufficient.
const pendingRequests = new Map()
// The sandbox context for the in-flight command. sdk-result messages settle
// the matching Promise by invoking __openpetSettle *inside* this context, so
// no host object is ever exposed to plugin code.
let activeContext = null

const sendMessage = (message) => {
  if (typeof process.send === 'function') process.send(message)
}

const toCommonJsPluginSource = (source) => {
  return source
    .replace(/^\s*export\s+default\s+function\s+([a-zA-Z_$][\w$]*)?\s*\(/m, 'module.exports = function $1(')
    .replace(/^\s*export\s+default\s+/m, 'module.exports = ')
}

const cloneJsonValue = (value, fieldName = 'value', { allowUndefined = false } = {}) => {
  if (value === undefined && allowUndefined) return undefined
  const seen = new Set()

  const assertJsonValue = (candidate, path) => {
    if (candidate === null) return
    const type = typeof candidate
    if (type === 'string' || type === 'boolean') return
    if (type === 'number') {
      if (!Number.isFinite(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${path}`)
      return
    }
    if (Array.isArray(candidate)) {
      if (seen.has(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${path}`)
      seen.add(candidate)
      candidate.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`))
      seen.delete(candidate)
      return
    }
    if (type === 'object') {
      if (Object.prototype.toString.call(candidate) !== '[object Object]') {
        throw new Error(`Plugin ${fieldName} must be JSON serializable at ${path}`)
      }
      if (seen.has(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${path}`)
      seen.add(candidate)
      for (const [key, item] of Object.entries(candidate)) {
        assertJsonValue(item, `${path}.${key}`)
      }
      seen.delete(candidate)
      return
    }
    throw new Error(`Plugin ${fieldName} must be JSON serializable at ${path}`)
  }

  assertJsonValue(value, fieldName)
  return JSON.parse(JSON.stringify(value))
}

// SECURITY: never hand any host-realm object (including a host Promise) to the
// sandbox. A host Promise leaks `.constructor.constructor` === host Function,
// which a malicious plugin uses to escape via `Function('return process')()`.
// The bridge therefore only moves JSON-serializable values across the boundary:
// the sandbox calls `__openpetDispatch(callId, operation, payloadJson)` (a plain
// function returning nothing), and the host later resolves the matching sandbox
// Promise by invoking `__openpetSettle(callId, ok, resultJson)` inside the
// sandbox realm. No host reference is ever readable from plugin code.
const dispatchSdkCall = (callId, operation, payloadJson) => {
  const id = nextRequestId
  nextRequestId += 1
  let payload = {}
  try {
    payload = payloadJson === undefined ? {} : JSON.parse(payloadJson)
  } catch (_) {
    payload = {}
  }
  pendingRequests.set(id, { callId })
  sendMessage({
    type: 'sdk-call',
    id,
    operation,
    payload: cloneJsonValue(payload, 'sdk payload', { allowUndefined: true })
  })
}

const createContext = (mainPath) => {
  const context = vm.createContext(Object.create(null), {
    name: `openpet-local-plugin:${mainPath}`,
    codeGeneration: { strings: false, wasm: false }
  })

  // Bootstrap creates:
  //  - globalThis.Promise  (sandbox-realm Promise — .constructor.constructor
  //    gives the *sandbox* Function which can only access sandbox globals)
  //  - __openpetSdkCalls   (Map<number, {resolve,reject}> — settles in-sandbox)
  //  - __openpetNextCallId (counter)
  //  - __openpetDispatch   (the ONLY function we expose from host — returns
  //    nothing, moves no host objects across the boundary)
  //  - __openpetSettle     (resolves/rejects sandbox-realm pending Promises)
  new vm.Script(`
    globalThis.module = { exports: {} };
    globalThis.exports = globalThis.module.exports;
    globalThis.console = Object.freeze({
      log: () => {},
      warn: () => {},
      error: () => {}
    });
  `, { filename: `${mainPath}:bootstrap` }).runInContext(context, { timeout: LOCAL_PLUGIN_SCRIPT_TIMEOUT_MS })

  return context
}

const loadPlugin = (context, mainPath) => {
  const source = toCommonJsPluginSource(fs.readFileSync(mainPath, 'utf-8'))
  const script = new vm.Script(source, { filename: mainPath })
  script.runInContext(context, { timeout: LOCAL_PLUGIN_SCRIPT_TIMEOUT_MS })
}

const runPluginCommand = async ({ mainPath, commandId, payload = {}, config = {} }) => {
  const context = createContext(mainPath)
  activeContext = context
  loadPlugin(context, mainPath)

  // Inject the SDK settle plumbing inside the sandbox realm. __openpetSettle and
  // its pending-call Map live on the sandbox globalThis so the host can resolve
  // them later (via settleSandboxPromise) without ever exposing a host object.
  // NOTE: __openpetCallSdk is intentionally defined *inside* compileFunction
  // (not here), because it must close over the __openpetDispatch parameter —
  // a host function that must never be reachable as a sandbox global (its
  // .constructor would be the host Function constructor = escape vector).
  const bridgeScript = new vm.Script(`
    globalThis.__openpetSdkCalls = new Map();
    globalThis.__openpetNextCallId = 1;
    globalThis.__openpetSettle = function (callId, ok, resultJson) {
      var entry = globalThis.__openpetSdkCalls.get(callId);
      if (!entry) return;
      globalThis.__openpetSdkCalls.delete(callId);
      if (ok) {
        var value;
        try { value = resultJson === undefined ? undefined : JSON.parse(resultJson); } catch (_) { value = undefined; }
        entry.resolve(value);
      } else {
        entry.reject(new Error(typeof resultJson === 'string' ? resultJson : 'Plugin SDK call failed'));
      }
    };
  `, { filename: `${mainPath}:bridge-bootstrap` })
  bridgeScript.runInContext(context, { timeout: LOCAL_PLUGIN_SCRIPT_TIMEOUT_MS })

  const execute = vm.compileFunction(`
    const __openpetPayload = JSON.parse(payloadJson);
    const __openpetConfig = JSON.parse(configJson);
    const __openpetClone = (value) => value == null || typeof value !== 'object'
      ? value
      : JSON.parse(JSON.stringify(value));
    const __openpetRegisteredCommands = Object.create(null);

    // __openpetCallSdk closes over __openpetDispatch (a host function) but is
    // itself a *sandbox-realm* function and is NOT exposed on globalThis, so
    // plugin code cannot read __openpetDispatch.constructor. It returns a
    // sandbox-realm Promise settled later by globalThis.__openpetSettle.
    const __openpetCallSdk = (operation, payloadJson) => {
      const callId = globalThis.__openpetNextCallId++;
      const p = new Promise((resolve, reject) => {
        globalThis.__openpetSdkCalls.set(callId, { resolve, reject });
      });
      __openpetDispatch(callId, operation, payloadJson);
      return p;
    };

    // SDK proxy — every method returns a *sandbox-realm* Promise from __openpetCallSdk.
    // No host object ever reaches plugin code.
    const __openpetSdkWrapper = (operation, payloadArg) => {
      return __openpetCallSdk(operation, JSON.stringify(payloadArg));
    };
    const __openpetCtx = Object.freeze({
      config: Object.freeze({
        get: (key) => key ? __openpetClone(__openpetConfig[key]) : __openpetClone(__openpetConfig)
      }),
      storage: Object.freeze({
        get: (key, fallbackValue) => {
          const payload = {};
          if (key !== undefined) payload.key = key;
          if (fallbackValue !== undefined) payload.fallbackValue = fallbackValue;
          return __openpetSdkWrapper('storage:get', payload);
        },
        set: (key, value) => __openpetSdkWrapper('storage:set', { key, value }),
        remove: (key) => __openpetSdkWrapper('storage:remove', { key }),
        clear: () => __openpetSdkWrapper('storage:clear', {})
      }),
      pet: Object.freeze({
        say: (payload) => __openpetSdkWrapper('pet:say', { payload }),
        playAction: (payload) => __openpetSdkWrapper('pet:playAction', { payload }),
        setEvent: (payload) => __openpetSdkWrapper('pet:setEvent', { payload })
      }),
      ai: Object.freeze({
        chat: (payload) => __openpetSdkWrapper('ai:chat', { payload })
      }),
      network: Object.freeze({
        fetch: (url, options) => {
          const payload = { url };
          if (options !== undefined) payload.options = options;
          return __openpetSdkWrapper('network:fetch', payload);
        }
      }),
      commands: Object.freeze({
        register: (command) => {
          if (!command || !command.id) throw new Error('Plugin command id is required');
          if (typeof command.handler !== 'function') throw new Error('Plugin command handler is required: ' + command.id);
          __openpetRegisteredCommands[command.id] = command.handler;
          return command.id;
        }
      })
    });

    return (async () => {
      const __openpetExported = module.exports && module.exports.default ? module.exports.default : module.exports;
      const __openpetActivate = typeof __openpetExported === 'function' ? __openpetExported : __openpetExported && __openpetExported.activate;
      if (typeof __openpetActivate !== 'function') throw new Error('Plugin main must export an activate function');
      const __openpetReturned = await Promise.resolve(__openpetActivate(__openpetCtx) || {});
      const __openpetCommands = Object.assign(Object.create(null), __openpetReturned, __openpetRegisteredCommands);
      const __openpetHandler = __openpetCommands[commandId];
      if (typeof __openpetHandler !== 'function') throw new Error('Plugin command handler is not a function');
      return await Promise.resolve(__openpetHandler(__openpetPayload));
    })();
  `, ['__openpetDispatch', 'commandId', 'payloadJson', 'configJson'], {
    parsingContext: context,
    filename: `${mainPath}:activate`
  })

  const result = await execute(
    dispatchSdkCall,
    commandId,
    JSON.stringify(cloneJsonValue(payload, 'payload')),
    JSON.stringify(cloneJsonValue(config, 'config'))
  )
  activeContext = null
  return cloneJsonValue(result, 'result', { allowUndefined: true })
}

// Settle the sandbox-realm Promise for a pending SDK call. The host serializes
// the result/error to JSON first, then runs __openpetSettle inside the sandbox
// context with only string/primitive arguments — so no host object (not even a
// host Error) crosses into plugin code.
const settleSandboxPromise = (callId, ok, resultJson) => {
  if (!activeContext) return
  // Write the JSON string into a sandbox global, then __openpetSettle reads it.
  // This avoids any quoting/escaping issues from embedding JSON in JS source.
  activeContext.__openpetSettlePayload = resultJson
  try {
    new vm.Script(
      `__openpetSettle(${callId}, ${ok ? 'true' : 'false'}, __openpetSettlePayload);`,
      { filename: 'openpet:settle' }
    ).runInContext(activeContext, { timeout: LOCAL_PLUGIN_SCRIPT_TIMEOUT_MS })
  } catch (_) {
    // If the sandbox rejected a malformed settle, there is nothing to do; the
    // pending Promise will simply never resolve and the command times out.
  } finally {
    try { delete activeContext.__openpetSettlePayload } catch (_) {}
  }
}

process.on('message', async (message) => {
  if (!message || typeof message !== 'object') return

  if (message.type === 'sdk-result') {
    const request = pendingRequests.get(message.id)
    if (!request) return
    pendingRequests.delete(message.id)
    if (message.ok) {
      // Serialize the result to JSON *in the host realm* before entering the
      // sandbox; only the string travels across.
      const resultJson = JSON.stringify(message.result === undefined ? null : message.result)
      settleSandboxPromise(request.callId, true, resultJson)
    } else {
      settleSandboxPromise(request.callId, false, String(message.error || 'Plugin SDK call failed'))
    }
    return
  }

  if (message.type !== 'run') return

  try {
    const result = await runPluginCommand(message)
    sendMessage({ type: 'result', ok: true, result })
  } catch (error) {
    sendMessage({ type: 'result', ok: false, error: error.message || 'Plugin command failed' })
  }
})

sendMessage({ type: 'ready' })
