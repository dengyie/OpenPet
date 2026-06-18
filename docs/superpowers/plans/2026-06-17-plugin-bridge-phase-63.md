# Plugin Bridge Phase 63 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first short-lived plugin bridge for declaration-only command entries so local extensions can call `pet.say`, `pet.action`, `pet.event`, and read basic pet context during explicit command runs.

**Architecture:** Keep all bridge lifecycle in `PluginService`, because it already owns declaration-only command execution, plugin policy checks, and plugin logs. Reuse the existing loopback/token JSON HTTP pattern from `local-http-service.js`, but scope access to one active command run with one short-lived token and route all mutations through `PetService`.

**Tech Stack:** Electron main process, Node child-process command execution, Node `http` server/helper patterns, Node native test runner, shared TypeScript contracts, existing plugin log surfaces.

---

## File Map

- Modify: `src/main/services/plugin-service.js`
  Purpose: create and tear down per-command bridge runtimes, inject bridge env vars, serve bridge routes, compute bounded bridge context, and log bridge activity.
- Modify: `tests/services/plugin-service.test.js`
  Purpose: add TDD coverage for bridge env injection, authorization, permissions, expiry, context, and bridge-backed pet mutations.
- Optional modify: `tests/services/local-http-service.test.js`
  Purpose: only if the bridge route helper is extracted into a shared HTTP helper that needs direct tests.
- Modify: `src/shared/openpet-contracts.ts`
  Purpose: document any new command result fields or visible runtime contract changes if bridge-backed results are surfaced.
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
  Purpose: keep the type fixture aligned if `PluginCommandRunResultViewState` changes.
- Optional modify: `src/control-center/src/api/control-center-api.ts`
  Purpose: update demo payloads only if command result examples or visible copy needs bridge-specific fields.
- Create: `docs/phases/phase-63-plugin-bridge.md`
  Purpose: record the delivered runtime slice, boundaries, tests, and next steps.
- Create: `docs/reviews/phase-63-plugin-bridge-review.md`
  Purpose: record the production-code-quality-review findings and their resolution.
- Modify: `docs/HANDOFF.md`
  Purpose: refresh the current runtime boundary and next-step guidance.
- Modify: `docs/development-summary.md`
  Purpose: refresh the short engineering summary with the new bridge slice.
- Modify: `docs/project-status-review.md`
  Purpose: reflect the bridge capability in the current project snapshot.
- Modify: `docs/productization-v1.1-todo-design.md`
  Purpose: move the “bridge flows remain future work” wording to the narrower remaining future work after Phase 63.
- Modify: `docs/plugin-development.md`
  Purpose: document bridge env vars, routes, permission mapping, and honesty boundaries for extension authors.
- Modify: `docs/plugin-ecosystem-rules.md`
  Purpose: describe the new bridge runtime surface and what is still not promised.
- Modify: `README.md`
  Purpose: update the public current-state extension boundary summary.
- Modify: `README.zh-CN.md`
  Purpose: keep the Chinese public current-state summary aligned.

### Task 1: Add failing bridge tests for declaration-only command runs

**Files:**
- Modify: `tests/services/plugin-service.test.js`
- Modify: `src/main/services/plugin-service.js`

- [ ] **Step 1: Add bridge test helpers for declaration-only command processes**

```js
const createFakeServiceProcess = ({ pid = 4321 } = {}) => {
  const child = new EventEmitter()
  child.pid = pid
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killCalls = []
  child.kill = (signal) => {
    child.killCalls.push(signal || 'SIGTERM')
    child.emit('exit', 0, signal || 'SIGTERM')
    return true
  }
  return child
}

const createBridgeAwarePetService = () => {
  const calls = []
  return {
    calls,
    getSnapshot: () => ({
      settings: {
        name: 'Bridge Pet',
        ai: {
          behavior: {
            enabled: true
          }
        },
        petPacks: {
          activePackId: 'legacy-cat'
        }
      },
      actions: {
        defaultAction: 'idle',
        clickAction: 'wave',
        actions: [{ id: 'idle', label: 'Idle' }, { id: 'wave', label: 'Wave' }]
      }
    }),
    say: (payload) => {
      calls.push(['say', payload])
      return payload
    },
    playAction: (payload) => {
      calls.push(['action', payload])
      return payload
    },
    setEvent: (payload) => {
      calls.push(['event', payload])
      return payload
    }
  }
}
```

- [ ] **Step 2: Add a failing test that declaration-only commands receive bridge env vars**

```js
test('declaration-only command entries receive short-lived bridge env vars', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        enabled: { 'weather-declaration': true }
      }
    }),
    petService: createBridgeAwarePetService(),
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.match(spawned[0].options.env.OPENPET_BRIDGE_URL, /^http:\/\/127\\.0\\.0\\.1:\\d+\\/plugins\\/bridge\\//)
  assert.match(spawned[0].options.env.OPENPET_BRIDGE_TOKEN, /^[A-Za-z0-9_-]{20,}$/)
})
```

- [ ] **Step 3: Add a failing test for bridge-backed `pet.say`, `pet.action`, and `pet.event`**

```js
test('declaration-only command bridge forwards pet mutations through PetService', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const petService = createBridgeAwarePetService()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        enabled: { 'weather-declaration': true }
      }
    }),
    petService,
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN

  const sayResult = await fetch(`${baseUrl}/pet/say`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ text: 'Bridge says hi', ttlMs: 1500 })
  }).then((response) => response.json())

  const actionResult = await fetch(`${baseUrl}/pet/action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ actionId: 'wave' })
  }).then((response) => response.json())

  const eventResult = await fetch(`${baseUrl}/pet/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ type: 'weather', message: 'Rain soon', ttlMs: 3000 })
  }).then((response) => response.json())

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.equal(sayResult.ok, true)
  assert.equal(actionResult.ok, true)
  assert.equal(eventResult.ok, true)
  assert.deepEqual(petService.calls, [
    ['say', { text: 'Bridge says hi', ttlMs: 1500, source: 'plugin:weather-declaration:bridge' }],
    ['action', { actionId: 'wave', source: 'plugin:weather-declaration:bridge' }],
    ['event', { type: 'weather', message: 'Rain soon', ttlMs: 3000, source: 'plugin:weather-declaration:bridge' }]
  ])
})
```

- [ ] **Step 4: Add failing tests for permission rejection, token mismatch, and bridge expiry**

```js
test('declaration-only command bridge rejects missing permissions, invalid token, and expired runs', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const root = createDeclarationOnlyPluginDir()
  const pluginPath = path.join(root, 'weather-declaration', 'plugin.json')
  fs.writeFileSync(pluginPath, JSON.stringify({
    id: 'weather-declaration',
    name: 'Weather Declaration',
    version: '1.0.0',
    permissions: ['pet:say'],
    entries: {
      commands: [{ id: 'announce', title: 'Announce Weather', command: 'node ./commands/announce.js', cwd: '.' }]
    }
  }))
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        enabled: { 'weather-declaration': true }
      }
    }),
    petService: createBridgeAwarePetService(),
    pluginDirs: [root],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN

  const wrongToken = await fetch(`${baseUrl}/pet/say`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer wrong-token'
    },
    body: JSON.stringify({ text: 'nope' })
  })

  const missingPermission = await fetch(`${baseUrl}/pet/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ type: 'weather', message: 'nope' })
  })

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  const expired = await fetch(`${baseUrl}/pet/say`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ text: 'too late' })
  })

  assert.equal(wrongToken.status, 401)
  assert.equal(missingPermission.status, 403)
  assert.equal(expired.status, 401)
})
```

- [ ] **Step 5: Add a failing test for `GET /context` returning bounded basic personality context**

```js
test('declaration-only command bridge exposes bounded read-only context', async () => {
  const spawned = []
  const child = createFakeServiceProcess()
  const petService = createBridgeAwarePetService()
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        enabled: { 'weather-declaration': true }
      }
    }),
    petService,
    pluginDirs: [createDeclarationOnlyPluginDir()],
    spawnCommandProcess: (file, args, options) => {
      spawned.push({ file, args, options })
      return child
    }
  })

  const commandRun = service.runCommand('weather-declaration', 'announce')
  const baseUrl = spawned[0].options.env.OPENPET_BRIDGE_URL
  const token = spawned[0].options.env.OPENPET_BRIDGE_TOKEN
  const contextResponse = await fetch(`${baseUrl}/context`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }).then((response) => response.json())

  child.stdout.write('{"ok":true}\n')
  child.emit('exit', 0, null)
  await commandRun

  assert.deepEqual(contextResponse, {
    ok: true,
    context: {
      petName: 'Bridge Pet',
      selectedPetId: 'legacy-cat',
      currentActionId: 'idle',
      personality: {
        tone: 'friendly',
        tags: ['companion', 'playful']
      }
    }
  })
})
```

- [ ] **Step 6: Run the targeted plugin-service tests to verify the new cases fail first**

Run: `node --test tests/services/plugin-service.test.js`
Expected: FAIL with missing bridge env vars, missing bridge routes, or unauthorized bridge requests because the bridge runtime is not implemented yet.

### Task 2: Implement the bridge runtime inside `PluginService`

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Modify: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Add bridge runtime state and HTTP helpers near the top-level command/runtime utilities**

```js
const http = require('http')
const crypto = require('crypto')

const PLUGIN_BRIDGE_HOST = '127.0.0.1'
const ACTIVE_BRIDGE_STATUSES = new Set(['running'])

const createBridgeRunKey = (pluginId, commandId, runId) => `${pluginId}:${commandId}:${runId}`

const createBridgeToken = () => crypto.randomBytes(24).toString('base64url')

const extractBearerToken = (header = '') => {
  const match = String(header).match(/^Bearer\\s+(.+)$/i)
  return match ? match[1] : ''
}

const safeTokenEquals = (candidate, expected) => {
  const candidateBuffer = Buffer.from(String(candidate || ''))
  const expectedBuffer = Buffer.from(String(expected || ''))
  return candidateBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(candidateBuffer, expectedBuffer)
}
```

- [ ] **Step 2: Add a small JSON request/response helper for plugin bridge routes**

```js
const isJsonRequest = (request) => {
  const contentType = String(request.headers['content-type'] || '').toLowerCase()
  return contentType.startsWith('application/json')
}

const readJsonBody = (request) => new Promise((resolve, reject) => {
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
    if (body.length > 1024 * 1024) {
      request.destroy()
      reject(new Error('Request body is too large'))
    }
  })
  request.on('end', () => {
    if (!body) return resolve({})
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
```

- [ ] **Step 3: Add bridge context shaping and route dispatch helpers**

```js
const createPluginBridgeContext = (petService) => {
  const snapshot = petService.getSnapshot?.() || {}
  const settings = snapshot.settings || {}
  const actions = snapshot.actions || {}
  return {
    petName: settings.name || 'OpenPet',
    selectedPetId: settings.petPacks?.activePackId || 'legacy-cat',
    currentActionId: actions.defaultAction || '',
    personality: {
      tone: 'friendly',
      tags: ['companion', 'playful']
    }
  }
}

const createBridgeRouteHandlers = ({ plugin, petService, appendLog }) => ({
  context: async () => {
    appendLog({ pluginId: plugin.manifest.id, commandId: 'bridge', level: 'info', message: 'Bridge context requested' })
    return { ok: true, context: createPluginBridgeContext(petService) }
  },
  petSay: async (payload) => {
    assertPermission(plugin.manifest, 'pet:say')
    appendLog({ pluginId: plugin.manifest.id, commandId: 'bridge', level: 'info', message: 'Bridge pet.say invoked' })
    return { ok: true, result: petService.say({ text: payload.text, ttlMs: payload.ttlMs, source: `plugin:${plugin.manifest.id}:bridge` }) }
  },
  petAction: async (payload) => {
    assertPermission(plugin.manifest, 'pet:action')
    appendLog({ pluginId: plugin.manifest.id, commandId: 'bridge', level: 'info', message: `Bridge pet.action invoked: ${payload.actionId}`.slice(0, 200) })
    return { ok: true, result: petService.playAction({ actionId: payload.actionId, source: `plugin:${plugin.manifest.id}:bridge` }) }
  },
  petEvent: async (payload) => {
    assertPermission(plugin.manifest, 'pet:event')
    appendLog({ pluginId: plugin.manifest.id, commandId: 'bridge', level: 'info', message: `Bridge pet.event invoked: ${payload.type}`.slice(0, 200) })
    return { ok: true, result: petService.setEvent({ type: payload.type, message: payload.message, ttlMs: payload.ttlMs, source: `plugin:${plugin.manifest.id}:bridge` }) }
  }
})
```

- [ ] **Step 4: Start one shared loopback bridge server inside `createPluginService()` and register active command runs**

```js
const bridgeRuntimes = new Map()
let bridgeServer = null
let bridgePort = 0

const ensureBridgeServer = async () => {
  if (bridgeServer?.listening) return bridgePort
  bridgeServer = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${PLUGIN_BRIDGE_HOST}`)
    const match = url.pathname.match(/^\\/plugins\\/bridge\\/([^/]+)\\/([^/]+)\\/([^/]+)(\\/context|\\/pet\\/say|\\/pet\\/action|\\/pet\\/event)$/)
    if (!match) {
      sendJson(response, 404, { ok: false, error: 'Not found' })
      return
    }
    const [, pluginId, commandId, runId, route] = match
    const runtime = bridgeRuntimes.get(createBridgeRunKey(pluginId, commandId, runId))
    if (!runtime || runtime.status !== 'running') {
      sendJson(response, 401, { ok: false, error: 'Bridge token expired' })
      return
    }
    if (!safeTokenEquals(extractBearerToken(request.headers.authorization), runtime.token)) {
      appendLog({ pluginId, commandId, level: 'error', message: 'Bridge request rejected: token expired' })
      sendJson(response, 401, { ok: false, error: 'Unauthorized' })
      return
    }
    try {
      if (route === '/context') {
        sendJson(response, 200, await runtime.handlers.context())
        return
      }
      if (!isJsonRequest(request)) {
        sendJson(response, 415, { ok: false, error: 'Content-Type must be application/json' })
        return
      }
      const body = await readJsonBody(request)
      if (route === '/pet/say') return sendJson(response, 200, await runtime.handlers.petSay(body))
      if (route === '/pet/action') return sendJson(response, 200, await runtime.handlers.petAction(body))
      if (route === '/pet/event') return sendJson(response, 200, await runtime.handlers.petEvent(body))
      sendJson(response, 404, { ok: false, error: 'Not found' })
    } catch (error) {
      const statusCode = /does not have/.test(error.message || '') ? 403 : 400
      appendLog({ pluginId, commandId, level: 'error', message: `Bridge request rejected: ${error.message}`.slice(0, 240) })
      sendJson(response, statusCode, { ok: false, error: error.message || 'Bridge request failed' })
    }
  })
  await new Promise((resolve, reject) => {
    bridgeServer.once('error', reject)
    bridgeServer.listen(0, PLUGIN_BRIDGE_HOST, () => {
      bridgePort = bridgeServer.address().port
      resolve()
    })
  })
  return bridgePort
}
```

- [ ] **Step 5: Inject bridge env vars from `runCommandEntryProcess()` and clean them up on every exit path**

```js
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const port = await ensureBridgeServer()
const token = createBridgeToken()
const runtimeKey = createBridgeRunKey(pluginId, commandId, runId)
bridgeRuntimes.set(runtimeKey, {
  plugin,
  commandId,
  runId,
  token,
  status: 'running',
  handlers: createBridgeRouteHandlers({ plugin, petService, appendLog })
})

const bridgeBaseUrl = `http://${PLUGIN_BRIDGE_HOST}:${port}/plugins/bridge/${pluginId}/${commandId}/${runId}`
const child = spawnCommandProcess(file, args, {
  cwd,
  detached: false,
  env: {
    ...createServiceProcessEnv(),
    OPENPET_BRIDGE_URL: bridgeBaseUrl,
    OPENPET_BRIDGE_TOKEN: token
  },
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true
})

const finalizeBridgeRuntime = () => {
  const bridgeRuntime = bridgeRuntimes.get(runtimeKey)
  if (bridgeRuntime) {
    bridgeRuntime.status = 'stopped'
    bridgeRuntimes.delete(runtimeKey)
  }
}
```

- [ ] **Step 6: Ensure plugin disable / command stop / app shutdown also clear bridge state**

```js
runtime.stop = () => {
  settle(() => {
    finalizeBridgeRuntime()
    safeKillChild()
    reject(new Error('Command stopped'))
  })
}

child.on?.('error', (error) => {
  settle(() => {
    finalizeBridgeRuntime()
    reject(error)
  })
})

child.on?.('exit', (code, signal) => {
  settle(() => {
    finalizeBridgeRuntime()
    // existing exit handling stays here
  })
})
```

- [ ] **Step 7: Run the targeted bridge tests and make them pass**

Run: `node --test tests/services/plugin-service.test.js`
Expected: PASS with the new bridge tests and the existing plugin service suite.

### Task 3: Tighten contracts and fixtures only if bridge-visible results need it

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
- Optional modify: `src/control-center/src/api/control-center-api.ts`

- [ ] **Step 1: Decide whether the existing command result shape is sufficient**

```ts
export interface PluginCommandRunResultViewState extends OkResponse {
  pluginId?: string
  commandId?: string
  exitCode?: number | null
  stdout?: string
  stderr?: string
  result?: JsonValue
}
```

If the bridge only affects runtime env vars and plugin logs, keep this interface unchanged and skip the rest of this task.

- [ ] **Step 2: If a bridge-visible field is needed, add it minimally and update the fixture**

```ts
export interface PluginCommandRunResultViewState extends OkResponse {
  pluginId?: string
  commandId?: string
  exitCode?: number | null
  stdout?: string
  stderr?: string
  result?: JsonValue
  bridgeUsed?: boolean
}
```

```ts
const pluginCommandResult = {
  ok: true,
  pluginId: 'weather-declaration',
  commandId: 'announce',
  exitCode: 0,
  result: { ok: true, petSay: 'rain soon' },
  bridgeUsed: true
} satisfies PluginCommandRunResultViewState
```

- [ ] **Step 3: Run typecheck if any contract or demo API file changed**

Run: `npm run typecheck`
Expected: PASS

### Task 4: Document the Phase 63 runtime slice

**Files:**
- Create: `docs/phases/phase-63-plugin-bridge.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/plugin-ecosystem-rules.md`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Write the phase record with delivered capability and explicit boundaries**

```md
# Phase 63: Plugin Bridge

> Date: 2026-06-17
> Branch: `codex/plugin-bridge-phase63`
> Status: completed locally

## Goal

Let declaration-only local extension commands call short-lived bridge routes for `pet.say`, `pet.action`, `pet.event`, and read-only basic personality context during explicit command runs.

## Boundaries Preserved

- No install-time or enable-time execution.
- No renderer or Electron API exposure.
- No API key exposure.
- No action-config editing or sprite-generation bridge yet.
- No hard sandbox claim.
```

- [ ] **Step 2: Update author docs with the concrete bridge env vars and endpoints**

```md
Current declaration-only command entries may receive:

- `OPENPET_BRIDGE_URL`
- `OPENPET_BRIDGE_TOKEN`

Current bridge routes:

- `POST /pet/say`
- `POST /pet/action`
- `POST /pet/event`
- `GET /context`

The bridge is available only during an explicit command run for an enabled, policy-allowed local extension. It is not a general host console and does not expose secrets or renderer APIs.
```

- [ ] **Step 3: Update summary/status docs and README wording**

```md
Extensions now have nine runtime-backed slices of the target model: explicit setup execution, JavaScript compatibility commands, declaration-only command process execution, entry visibility, dashboard opening, service start/stop, manual service health checks, best-effort service cleanup, and a short-lived command bridge for pet say/action/event plus read-only basic pet context.
```

- [ ] **Step 4: Run a docs diff scan for unsupported claims**

Run: `rg -n "sandbox|full control|arbitrary shell|action-config editing|sprite generation|bridge token injection remains future work" README.md README.zh-CN.md docs`
Expected: only truthful current-state wording remains after the updates.

### Task 5: Run production review, fix findings, and verify the phase end-to-end

**Files:**
- Modify: code/docs files touched by review findings
- Create: `docs/reviews/phase-63-plugin-bridge-review.md`

- [ ] **Step 1: Collect review context using the production review helper**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Expected: structured review context that identifies working-tree scope, risk flags, and suggested references.

- [ ] **Step 2: Read the mandatory review references before judging the change**

Run:

```bash
sed -n '1,240p' /Users/mango/.agents/skills/production-code-quality-review/references/review-framework.md
sed -n '1,220p' /Users/mango/.agents/skills/production-code-quality-review/references/output-contract.md
sed -n '1,220p' /Users/mango/.agents/skills/production-code-quality-review/references/false-positive-control.md
```

Expected: review criteria are loaded before writing findings.

- [ ] **Step 3: Produce and address the production-code-quality-review findings**

```md
# Phase 63 Plugin Bridge Review

- Scope: declaration-only command bridge runtime, tests, and docs
- Findings:
  - [P?] ...
- Fixes applied:
  - ...
- Residual risks:
  - ...
```

- [ ] **Step 4: Run the complete verification set**

Run:

```bash
node --test tests/services/plugin-service.test.js
npm run typecheck
npm run check:syntax
npm test
npm run test:control-center
git diff --check
```

Expected:

- targeted plugin-service suite passes;
- typecheck passes if contracts changed;
- syntax/build checks pass;
- full Node suite passes;
- Control Center Playwright suite passes;
- `git diff --check` prints no whitespace/path issues.

- [ ] **Step 5: Update machine-readable and human phase summaries if verification counts changed**

```bash
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected: `project-context ok`

- [ ] **Step 6: Commit and push the completed phase**

```bash
git add src/main/services/plugin-service.js tests/services/plugin-service.test.js src/shared/openpet-contracts.ts tests/shared/openpet-contracts-type-fixture.ts docs/phases/phase-63-plugin-bridge.md docs/reviews/phase-63-plugin-bridge-review.md docs/plugin-development.md docs/plugin-ecosystem-rules.md docs/productization-v1.1-todo-design.md docs/development-summary.md docs/project-status-review.md docs/HANDOFF.md README.md README.zh-CN.md
git commit -m "feat: add plugin command bridge"
git push -u origin codex/plugin-bridge-phase63
```

Expected: branch is published with the code, tests, review record, and updated docs.

## Self-Review

- Spec coverage: this plan covers the approved Phase 63 bridge scope only: `pet.say`, `pet.action`, `pet.event`, and read-only basic personality context during explicit declaration-only command runs.
- Placeholder scan: no `TODO`, `TBD`, or “similar to previous task” placeholders remain in the executable steps.
- Type consistency: bridge route names, permission names, result fields, and file paths match the current codebase vocabulary from `plugin-service.js`, `local-http-service.js`, and `openpet-contracts.ts`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-17-plugin-bridge-phase-63.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
