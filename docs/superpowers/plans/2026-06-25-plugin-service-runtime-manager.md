# Plugin Service Runtime Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract service runtime collection bookkeeping from `PluginService` while preserving service start, stop, health, and force-stop behavior.

**Architecture:** Add a focused CommonJS manager beside command/setup runtime managers. `PluginService` keeps service process spawning, stop implementation, health scheduling, force-stop timers, and child exit state transitions; the manager owns service runtime storage, active-run rejection, lazy stopped-runtime creation, and plugin/all stop dispatch.

**Tech Stack:** Electron main process services, CommonJS Node modules, Node native test runner, existing production-code-quality-review phase gate.

---

### Task 1: Service Runtime Manager

**Files:**
- Create: `src/main/services/plugin-service-runtime-manager.js`
- Create: `tests/services/plugin-service-runtime-manager.test.js`

- [ ] **Step 1: Write manager tests**

Cover service runtime keying, set/get/size, lazy `getOrCreateRuntime`, duplicate active service rejection for `running` and `stopping`, exact plugin-id stop dispatch, and stop-all dispatch with options.

Run: `node --test tests/services/plugin-service-runtime-manager.test.js`
Expected: fail before implementation because the module does not exist.

- [ ] **Step 2: Implement manager**

Create `createPluginServiceRuntimeManager({ stopRuntime })` with `getRuntime`, `setRuntime`, `getOrCreateRuntime`, `assertNotActive`, `stopPlugin`, `stopAll`, and `size`. Keep actual stop semantics outside the manager by calling the injected `stopRuntime(pluginId, serviceId, runtime, options)`.

Run: `node --test tests/services/plugin-service-runtime-manager.test.js`
Expected: pass.

### Task 2: PluginService Integration

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Test: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Replace local service runtime Map helpers**

Import and instantiate the service runtime manager after `stopPluginServiceRuntime` exists. Replace `serviceRuntimes.get(...)`, `getPluginServiceRuntime`, `setServiceRuntime`, `getOrCreateServiceRuntime`, service active guard, disable cleanup, and shutdown cleanup with manager calls.

- [ ] **Step 2: Preserve service behavior boundaries**

Do not move or rewrite `stopPluginServiceRuntime`, `clearServiceHealthSchedule`, `scheduleServiceHealthCheck`, force-stop timers, child stdout/stderr/error/exit handlers, or health result shaping.

Run: `node --test tests/services/plugin-service-runtime-manager.test.js tests/services/plugin-service.test.js --test-name-pattern "service|Plugin service"`
Expected: service-related regressions pass.

### Task 3: Verification And Review

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Create: `src/main/services/plugin-service-runtime-manager.js`
- Create: `tests/services/plugin-service-runtime-manager.test.js`

- [ ] **Step 1: Run focused tests**

Run: `node --test tests/services/plugin-service-runtime-manager.test.js tests/services/plugin-setup-runtime-manager.test.js tests/services/plugin-command-runtime-manager.test.js tests/services/plugin-command-bridge-service.test.js tests/services/plugin-service.test.js`
Expected: all tests pass.

- [ ] **Step 2: Run syntax/build gates**

Run: `npm run check:syntax`
Expected: Node syntax check, TypeScript no-emit, and Control Center build pass.

- [ ] **Step 3: Run whitespace gate**

Run: `git diff --check`
Expected: no output and exit code 0.

- [ ] **Step 4: Phase-gate review**

Use `production-code-quality-review` in phase-gate mode. Required pass state: no P0/P1 blockers; deeper service health/force-stop redesign remains backlog.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/plugin-service.js src/main/services/plugin-service-runtime-manager.js tests/services/plugin-service-runtime-manager.test.js docs/superpowers/plans/2026-06-25-plugin-service-runtime-manager.md
git commit -m "refactor(phase-4): extract plugin service runtime manager"
```

Self-review:
- Spec coverage: the plan covers service runtime storage, active guard, lazy stopped runtime creation, stop dispatch, PluginService integration, verification, and review.
- Placeholder scan: no placeholder tasks are present.
- Type consistency: `pluginId`, `serviceId`, `Plugin service`, `stopRuntime`, and runtime status names match current `PluginService` contracts.
