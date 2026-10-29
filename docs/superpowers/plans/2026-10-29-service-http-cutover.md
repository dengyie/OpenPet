# Service HTTP Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the Control Center Service pane from the legacy preload IPC boundary to the existing authenticated Backend HTTP service routes while preserving demo-mode behavior and native service ownership.

**Architecture:** Add a small Service HTTP facade beside the existing feature facades. It uses `backendClient` for `/service/status`, `/service/logs`, `/service/config`, `/service/token/rotate`, and `/service/token/revoke-sessions`; the Service pane selects the demo API only in Vite development without the injected Backend bridge. The preload and main IPC handler for MCP session revocation are retired only after source reachability tests prove the pane no longer calls them; the other service IPCs remain until their own callers migrate.

**Tech Stack:** React + TypeScript, existing `ApiClient`/`backendClient`, Node native test runner, shared OpenPet contract types, Markdown migration ledger.

## Global Constraints

- Keep `PetService` as the single source of truth for pet state and action/event flows.
- Keep API keys and provider credentials out of renderer and ordinary plugin contexts.
- Do not modify `cat_anime/` material structure.
- Do not add new compatibility wrappers after HTTP cutover.
- Preserve all existing uncommitted changes in this worktree.
- Do not run Electron or real-device acceptance; verify with source and Node regression tests only.

---

### Task 1: Define Service HTTP facade and failing coverage

**Files:**
- Create: `apps/control-center/src/features/service/api.ts`
- Create: `tests/control-center/service-cutover.test.js`
- Modify: `apps/control-center/src/hooks/useServicePane.ts`

**Interfaces:**
- Consumes: `backendClient`, `controlCenterAPI`, `ServiceStatusViewState`, `PaginatedLogsViewState<ServiceLogEntry>`, and `ServiceLogPageRequest`.
- Produces: `createServiceHttpApi(client)`, `serviceHttpApi`, and a development-only demo selection matching existing feature facades.

- [x] **Step 1: Write the failing source and behavior tests**

```js
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const root = path.resolve(__dirname, '../..')
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8')

test('Service pane uses the HTTP facade for all migrated service operations', () => {
  const source = read('apps/control-center/src/hooks/useServicePane.ts')
  assert.match(source, /features\/service\/api/)
  assert.doesNotMatch(source, /controlCenterAPI as api/)
})

test('Service HTTP facade targets the registered Backend routes', () => {
  const source = read('apps/control-center/src/features/service/api.ts')
  for (const route of ['/service/status', '/service/logs', '/service/config', '/service/token/rotate', '/service/token/revoke-sessions']) {
    assert.match(source, new RegExp(route.replaceAll('/', '\\/')))
  }
})
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/control-center/service-cutover.test.js`

Expected: FAIL because the facade file and Service pane import do not exist.

- [x] **Step 3: Implement the minimal facade**

Create `apps/control-center/src/features/service/api.ts` with strict response schemas and the same demo/runtime gate used by other features:

```ts
import * as v from '../../../../desktop/src/shared/browser-validation.ts'
import { backendClient } from '../../api/backend-client.ts'
import { controlCenterAPI } from '../../api/control-center-api.ts'
import type { ApiClient } from '../../api/client.ts'
import type { ControlCenterApi, PaginatedLogsViewState, ServiceLogEntry, ServiceLogPageRequest, ServiceStatusViewState } from '@openpet/shared/src/openpet-contracts.ts'

const object = v.record(v.string(), v.unknown())
const status = v.custom<ServiceStatusViewState>((value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value))
const logs = v.custom<PaginatedLogsViewState<ServiceLogEntry>>((value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as any).entries))
const empty = v.object({})
const useDemoApi = () => import.meta.env?.DEV === true && !Boolean((globalThis as { openpetBackend?: unknown }).openpetBackend)

export function createServiceHttpApi(client: ApiClient = backendClient) {
  const send = <T>(method: string, path: string, responseSchema: v.GenericSchema<unknown, T>, body?: unknown) => body === undefined
    ? client.request({ method, path, responseSchema, retry: method === 'GET' })
    : client.request({ method, path, requestSchema: object, body, responseSchema, retry: false })
  return {
    getStatus: () => send('GET', '/service/status', status),
    getLogs: (filters: ServiceLogPageRequest = {}) => {
      const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)]))
      return send('GET', `/service/logs${params.size ? `?${params}` : ''}`, logs)
    },
    saveConfig: (config: Partial<ServiceStatusViewState['config']>) => send('PUT', '/service/config', status, config),
    rotateToken: () => send('POST', '/service/token/rotate', status, {}),
    revokeMcpSessions: () => send('POST', '/service/token/revoke-sessions', status, {}),
    clearLogs: () => send('DELETE', '/service/logs', status),
    exportLogs: (filters: ServiceLogPageRequest = {}) => {
      const params = new URLSearchParams({ operation: 'export', ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)])) })
      return send('GET', `/service/logs?${params}`, v.string())
    },
  }
}

const http = createServiceHttpApi()
export const serviceHttpApi = {
  getStatus: () => useDemoApi() ? controlCenterAPI.getServiceStatus() : http.getStatus(),
  getLogs: (filters?: ServiceLogPageRequest) => useDemoApi() ? controlCenterAPI.getServiceLogs(filters) : http.getLogs(filters),
  saveConfig: (config: Partial<ServiceStatusViewState['config']>) => useDemoApi() ? controlCenterAPI.saveServiceConfig(config) : http.saveConfig(config),
  rotateToken: () => useDemoApi() ? controlCenterAPI.rotateServiceToken() : http.rotateToken(),
  revokeMcpSessions: () => useDemoApi() ? controlCenterAPI.revokeMcpSessions() : http.revokeMcpSessions(),
  clearLogs: () => useDemoApi() ? controlCenterAPI.clearServiceLogs() : http.clearLogs(),
  exportLogs: (filters?: ServiceLogPageRequest) => useDemoApi() ? controlCenterAPI.exportServiceLogs(filters) : http.exportLogs(filters),
}
```

Update `useServicePane.ts` to import `serviceHttpApi` and replace the seven service calls without changing UI state or copy.

- [x] **Step 4: Run focused tests and type/build checks**

Run: `node --test tests/control-center/service-cutover.test.js && npm run check:syntax`

Expected: PASS; the Control Center production build remains successful.

---

### Task 2: Retire the now-unreachable MCP revoke IPC boundary

**Files:**
- Modify: `apps/desktop/control-center-preload.js`
- Modify: `apps/desktop/src/shared/ipc-channels.js`
- Modify: `apps/desktop/src/shared/ipc-channels.ts`
- Modify: `apps/desktop/src/ipc/register-service-ipc.js`
- Modify: `tests/control-center/service-cutover.test.js`
- Modify: `tests/main/ipc-registration-groups.test.js`
- Modify: `tests/main/ipc-plugin-install.test.js`
- Modify: `docs/refactor/15-channel-retirement.md`

**Interfaces:**
- Consumes: Task 1's `serviceHttpApi` and source reachability proof.
- Produces: no `SERVICE_REVOKE_MCP_SESSIONS` constant, preload exposure, or main registration; the HTTP route remains the sole business boundary.

- [x] **Step 1: Extend the failing reachability test**

```js
test('MCP revoke service operation has no legacy preload or registrar reachability', () => {
  const preload = read('apps/desktop/control-center-preload.js')
  const channels = read('apps/desktop/src/shared/ipc-channels.ts')
  const registrar = read('apps/desktop/src/ipc/register-service-ipc.js')
  const pane = read('apps/control-center/src/hooks/useServicePane.ts')
  assert.doesNotMatch(preload, /SERVICE_REVOKE_MCP_SESSIONS|revokeMcpSessions.*ipcRenderer/)
  assert.doesNotMatch(channels, /SERVICE_REVOKE_MCP_SESSIONS/)
  assert.doesNotMatch(registrar, /SERVICE_REVOKE_MCP_SESSIONS/)
  assert.match(pane, /serviceHttpApi\.revokeMcpSessions/)
})
```

- [x] **Step 2: Run it to verify the old boundary is detected**

Run: `node --test tests/control-center/service-cutover.test.js`

Expected: FAIL because the old constant/exposure/registration still exist.

- [x] **Step 3: Remove the dead IPC registration and exposure**

Delete only the `SERVICE_REVOKE_MCP_SESSIONS` property from both shared IPC constant files and preload, delete the `revokeMcpSessions` handler block from `register-service-ipc.js`, and remove only the corresponding IPC assertions/fixtures from main tests. Keep the Backend route and demo API method because they are still used by the HTTP facade's development adapter.

- [x] **Step 4: Mark the ledger row retired**

Change the `service:revoke-mcp-sessions` row to `retired` only after the removal commit exists; record that commit's short SHA in `Retired by`, and state that the Backend route is the production caller.

- [x] **Step 5: Run focused migration checks**

Run: `npm run build:contracts && node --test tests/control-center/service-cutover.test.js tests/main/ipc-registration-groups.test.js tests/main/ipc-plugin-install.test.js && npm run check:channel-retirement`

Expected: PASS with `dead=0` and the retired row excluded from current counts.

---

### Task 3: Reconcile live docs and run all code-only gates

**Files:**
- Modify: `docs/TODO.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/project-context.json`
- Modify: `tests/docs/live-docs-development-plan.test.js`

**Interfaces:**
- Consumes: Task 1/2 test and check output.
- Produces: current migration counts and evidence that Service is HTTP-owned while native service implementation remains Shell-owned.

- [x] **Step 1: Update active documentation**

Record the exact Service facade paths, retired IPC channel, and focused test file. Keep all unrelated historical counts unchanged.

- [x] **Step 2: Run repository code-only verification**

Run: `npm run test:backend && npm run test:tools && npm run check:syntax && npm run check:api-contract && npm run check:channel-retirement && npm run check:docs-drift && git diff --check`

Expected: every command exits zero; browser/Electron launch checks remain explicitly outside this run.

- [x] **Step 3: Review the final diff**

Run: `git diff --stat && git diff --check && git status --short`

Expected: only Service cutover code, tests, ledger/docs, and pre-existing uncommitted documentation changes are present.
