# Plugin Service Periodic Health Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a host-managed periodic health policy for running plugin service entries so loopback health checks can repeat on a bounded interval without widening plugin authority.

**Architecture:** Keep `PluginService` as the single owner of service runtime state, health state, and timer lifecycle. Persist periodic health policy in host settings, expose it through shared contracts and Control Center, and reuse the existing manual health-check path for automatic checks instead of building a second checker.

**Tech Stack:** Electron main process, CommonJS Node services, Node native test runner, React + TypeScript Control Center, shared TypeScript contracts.

---

## File Map

- Modify: `src/main/services/plugin-service.js`
  Purpose: persist/sanitize per-service health policy, schedule auto-check timers, reuse health checks, and clear timers on lifecycle changes.
- Modify: `tests/services/plugin-service.test.js`
  Purpose: add TDD coverage for policy persistence, scheduling, timer cleanup, interval rescheduling, and non-overlap.
- Modify: `src/shared/openpet-contracts.ts`
  Purpose: add typed health-policy view contracts and save-request shape if needed.
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
  Purpose: keep representative fixtures aligned with the new contract.
- Modify: `src/control-center/src/api/control-center-api.ts`
  Purpose: expose a typed API method and demo-state behavior for service health policy saves.
- Modify: `src/control-center/src/hooks/usePluginsPane.ts`
  Purpose: add UI actions for saving periodic health policy and refreshing plugin state/log state.
- Modify: `src/control-center/src/panes/PluginsPane.tsx`
  Purpose: render periodic health policy controls for service entries with health URLs.
- Modify: `tests/control-center/control-center-smoke.spec.js`
  Purpose: cover the new periodic health policy UI flow through the demo API.
- Modify: `src/main/ipc.js`
  Purpose: wire the new plugin service health-policy save handler.
- Modify: `src/shared/ipc-channels.js`
  Purpose: add the new IPC channel constant.
- Create: `docs/phases/phase-71-plugin-service-periodic-health-policy.md`
  Purpose: record scope, implementation, verification, and remaining limits.
- Create: `docs/reviews/phase-71-plugin-service-periodic-health-policy-review.md`
  Purpose: record production review findings, score, and pass/fail result.
- Modify: `docs/HANDOFF.md`
  Purpose: refresh the current plugin service health boundary.
- Modify: `docs/development-summary.md`
  Purpose: refresh the short engineering summary with periodic health policy facts.
- Modify: `docs/project-status-review.md`
  Purpose: reflect the new plugin service health boundary in the current snapshot.
- Modify: `docs/project-context.json`
  Purpose: update machine-readable current facts and validation counts if they change.
- Modify: `docs/productization-v1.1-todo-design.md`
  Purpose: add Phase 71 goal, scope, acceptance, and status.
- Modify: `docs/project-review-todo-design.md`
  Purpose: add Phase 71 to the consolidated review TODO design.
- Modify: `docs/plugin-development.md`
  Purpose: describe the new host-managed periodic health policy honestly.
- Modify: `docs/plugin-ecosystem-rules.md`
  Purpose: keep ecosystem rules aligned with the new periodic health policy boundary.

## Task 1: Write failing service policy tests

**Files:**
- Modify: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Add a persistence test for service health policy in plugin listings**

```js
test('plugin service exposes persisted periodic health policy on service entries', () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        enabled: { 'weather-declaration': true },
        serviceHealthPolicies: {
          'weather-declaration': {
            companion: { enabled: true, intervalMs: 30000 }
          }
        }
      }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    })]
  })

  const policy = service.listPlugins()[0].entries.services[0].healthPolicy
  assert.deepEqual(policy, { enabled: true, intervalMs: 30000 })
})
```

- [ ] **Step 2: Add an auto-check scheduling test for running services**

```js
test('plugin service schedules periodic health checks for running services when policy is enabled', async () => {
  const timers = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        enabled: { 'weather-declaration': true },
        serviceHealthPolicies: {
          'weather-declaration': {
            companion: { enabled: true, intervalMs: 15000 }
          }
        }
      }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    })],
    fetchImpl: async () => ({ ok: true, status: 204 }),
    spawnServiceProcess: () => createRunningServiceProcess(),
    setServiceHealthTimer: (callback, delay) => {
      timers.push({ callback, delay })
      return { unref() {} }
    },
    clearServiceHealthTimer: () => {}
  })

  service.startService('weather-declaration', 'companion')

  assert.equal(timers.length, 1)
  assert.equal(timers[0].delay, 15000)

  await timers[0].callback()

  assert.equal(service.listPlugins()[0].entries.services[0].runtime.health.status, 'healthy')
})
```

- [ ] **Step 3: Add a timer cleanup test for stop/disable**

```js
test('plugin service clears periodic health timers when a running service stops', () => {
  const cleared = []
  const timerRef = { unref() {} }
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: {
        enabled: { 'weather-declaration': true },
        serviceHealthPolicies: {
          'weather-declaration': {
            companion: { enabled: true, intervalMs: 15000 }
          }
        }
      }
    }),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createDeclarationOnlyPluginDir({
      serviceHealth: { type: 'http', url: 'http://127.0.0.1:8787/health' }
    })],
    spawnServiceProcess: () => createSlowStoppingServiceProcess({ pid: 4321 }),
    setServiceHealthTimer: () => timerRef,
    clearServiceHealthTimer: (timer) => {
      cleared.push(timer)
    }
  })

  service.startService('weather-declaration', 'companion')
  service.stopService('weather-declaration', 'companion')

  assert.deepEqual(cleared, [timerRef])
})
```

- [ ] **Step 4: Run targeted tests and verify RED**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service exposes persisted periodic health policy on service entries|plugin service schedules periodic health checks for running services when policy is enabled|plugin service clears periodic health timers when a running service stops"
```

Expected before implementation:

- FAIL because service entries do not yet expose `healthPolicy`, timer helpers are absent, and running services do not schedule periodic checks.

## Task 2: Implement host-managed service health policy in PluginService

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`

- [ ] **Step 1: Add policy normalization helpers and injectable timer hooks**

Add factory parameters for timer injection:

```js
setServiceHealthTimer = setTimeout,
clearServiceHealthTimer = clearTimeout,
```

Add a normalized policy helper and settings reader:

```js
const MIN_PLUGIN_SERVICE_HEALTH_INTERVAL_MS = 15000
const DEFAULT_PLUGIN_SERVICE_HEALTH_INTERVAL_MS = 30000
const MAX_PLUGIN_SERVICE_HEALTH_INTERVAL_MS = 300000
```

Policy normalization should:

- default missing policy to `{ enabled: false, intervalMs: 30000 }`;
- clamp interval to the supported bounds;
- ignore malformed stored values.

- [ ] **Step 2: Expose `healthPolicy` on service entries**

Extend service entry view creation so `listPlugins()` returns:

```js
healthPolicy: getPluginServiceHealthPolicy(pluginId, serviceId)
```

Add shared contract:

```ts
export interface PluginServiceHealthPolicyViewState {
  enabled: boolean
  intervalMs: number
}
```

Attach it to `PluginServiceEntryViewState`.

- [ ] **Step 3: Add a save method for per-service health policy**

Implement:

```js
const saveServiceHealthPolicy = (pluginId, serviceId, policy = {}) => { ... }
```

Rules:

- plugin and service must exist;
- service must declare a valid health URL;
- save under `settings.plugins.serviceHealthPolicies[pluginId][serviceId]`;
- disabling clears active scheduling and keeps policy persisted as disabled;
- enabling while runtime is `running` immediately reschedules the next check.

- [ ] **Step 4: Add scheduling helpers**

Add helpers that:

- clear existing timer;
- schedule only when runtime is `running`, health exists, and policy is enabled;
- skip overlap when `runtime.health.status === 'checking'`;
- reschedule after an automatic check completes.

Reuse the existing health-check path rather than duplicating fetch logic.

- [ ] **Step 5: Tie timers into lifecycle boundaries**

Update service lifecycle so:

- `startService()` schedules the next check if policy is enabled;
- `stopService()`, disable cleanup, shutdown cleanup, and exit handling clear timers;
- service restarts do not leak old timers.

- [ ] **Step 6: Run targeted tests and verify GREEN**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service exposes persisted periodic health policy on service entries|plugin service schedules periodic health checks for running services when policy is enabled|plugin service clears periodic health timers when a running service stops|plugin service checks configured service health endpoints|plugin service stops running services when a plugin is disabled"
```

Expected:

- PASS with policy persistence, scheduled auto-checks, and timer cleanup in place.

## Task 3: Wire IPC and Control Center configuration

**Files:**
- Modify: `src/shared/ipc-channels.js`
- Modify: `src/main/ipc.js`
- Modify: `src/control-center/src/api/control-center-api.ts`
- Modify: `src/control-center/src/hooks/usePluginsPane.ts`
- Modify: `src/control-center/src/panes/PluginsPane.tsx`
- Modify: `tests/control-center/control-center-smoke.spec.js`

- [ ] **Step 1: Add a save-policy IPC command**

Create a new channel and IPC handler for:

```ts
plugins:save-service-health-policy
```

The handler should delegate to `pluginService.saveServiceHealthPolicy(...)`.

- [ ] **Step 2: Add API facade and demo-state support**

Add a typed API method:

```ts
savePluginServiceHealthPolicy(pluginId: string, serviceId: string, policy: PluginServiceHealthPolicyViewState): Promise<PluginViewState>
```

Demo mode should update in-memory plugin state so UI tests can cover the flow.

- [ ] **Step 3: Render periodic health controls in Plugins pane**

Add for services with `health.url`:

- a checkbox/toggle for periodic health checks;
- a bounded interval select;
- save behavior through the new API.

Keep it disabled when plugin is disabled or blocked.

- [ ] **Step 4: Add a Control Center smoke test**

Add a Playwright test that toggles periodic health checks, changes interval, saves, and verifies the UI reflects the updated policy in the demo API session.

- [ ] **Step 5: Run focused UI verification**

Run:

```bash
npm run test:control-center -- --grep "periodic health|Plugins"
```

Expected:

- PASS with the new service health policy controls.

## Task 4: Documentation, production review, and final verification

**Files:**
- Create: `docs/phases/phase-71-plugin-service-periodic-health-policy.md`
- Create: `docs/reviews/phase-71-plugin-service-periodic-health-policy-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-review-todo-design.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/plugin-ecosystem-rules.md`

- [ ] **Step 1: Record the phase scope**

The phase doc must state:

- periodic health policy is host-owned and Control Center-managed;
- periodic checks run only for active running services;
- health URLs remain loopback-only;
- no service auto-start, retries, notifications, or manifest-owned background scheduling were added.

- [ ] **Step 2: Run production review**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Inspect the full Phase 71 diff and write the review result with:

- findings;
- improvement suggestions;
- quality score;
- pass state.

Fix any P1/P2 issues before final verification.

- [ ] **Step 3: Run complete verification**

Run:

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

- [ ] **Step 4: Commit**

Run:

```bash
git add src/main/services/plugin-service.js tests/services/plugin-service.test.js src/shared/openpet-contracts.ts tests/shared/openpet-contracts-type-fixture.ts src/shared/ipc-channels.js src/main/ipc.js src/control-center/src/api/control-center-api.ts src/control-center/src/hooks/usePluginsPane.ts src/control-center/src/panes/PluginsPane.tsx tests/control-center/control-center-smoke.spec.js docs/phases/phase-71-plugin-service-periodic-health-policy.md docs/reviews/phase-71-plugin-service-periodic-health-policy-review.md docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/project-context.json docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md docs/plugin-development.md docs/plugin-ecosystem-rules.md docs/superpowers/specs/2026-06-17-plugin-service-periodic-health-policy-phase71-design.md docs/superpowers/plans/2026-06-17-plugin-service-periodic-health-policy-phase71.md
git commit -m "feat(阶段71): add plugin service periodic health policy"
```

## Self-Review

- Spec coverage: policy persistence, scheduling, UI controls, runtime cleanup, and docs are all represented.
- Placeholder scan: no TBD markers or vague “handle appropriately” steps remain.
- Type consistency: `healthPolicy`, `intervalMs`, and service policy save surfaces use one naming scheme across service, IPC, contracts, and UI.
- Scope check: this is a single bounded host-managed health-policy slice, not a general scheduler or notification system.
