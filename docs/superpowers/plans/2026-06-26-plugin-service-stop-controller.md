# Plugin Service Stop Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract plugin service stop / force-stop orchestration into a focused controller without changing runtime behavior.

**Architecture:** Keep `PluginService` as the composition root, but move the stop-path mechanics into a dedicated controller that owns signal dispatch, grace-period escalation, timer cleanup, and stop logging. Preserve the existing service runtime manager as the owner of iteration and runtime lookup so the extraction stays bounded and behavior-preserving.

**Tech Stack:** CommonJS Node modules, Node test runner, existing plugin service test harness.

---

### Task 1: Add the stop controller

**Files:**
- Create: `src/main/services/plugin-service-stop-controller.js`
- Modify: `src/main/services/plugin-service.js:1-1045`

- [ ] **Step 1: Write the failing test**

Create a focused controller test file that asserts `SIGTERM` is sent first, `SIGKILL` follows after the grace period when the runtime still reports `stopping`, and successful exit before the grace period prevents escalation.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/services/plugin-service-stop-controller.test.js`
Expected: FAIL because the controller module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement `createPluginServiceStopController({ appendLog, killServiceProcess, signalServiceProcessTree, setServiceStopTimer, clearServiceStopTimer, clearServiceHealthSchedule })` with `stopRuntime`, `stopServiceProcess`, `forceStopServiceProcess`, and timer cleanup helpers.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/services/plugin-service-stop-controller.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/plugin-service-stop-controller.js src/main/services/plugin-service.js tests/services/plugin-service-stop-controller.test.js
git commit -m "refactor(phase-5): extract plugin service stop controller"
```

### Task 2: Wire the controller into PluginService

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Modify: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Update the integration test coverage**

Extend the existing plugin service stop-path tests so they still validate service shutdown, force-stop escalation, disable cleanup, and stop-all cleanup through the public service API.

- [ ] **Step 2: Replace inline stop-path logic**

Instantiate the new controller inside `createPluginService` and delegate stop/force-stop/timer cleanup from `stopPluginServiceRuntime`.

- [ ] **Step 3: Run the service regression tests**

Run: `node --test tests/services/plugin-service.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/services/plugin-service.js tests/services/plugin-service.test.js
git commit -m "refactor(phase-5): wire plugin service stop controller"
```

### Task 3: Phase gate verification

**Files:**
- Read-only: `src/main/services/plugin-service-stop-controller.js`
- Read-only: `src/main/services/plugin-service.js`
- Read-only: `tests/services/plugin-service*.test.js`

- [ ] **Step 1: Run syntax and diff checks**

Run: `npm run check:syntax`
Run: `git diff --check`

- [ ] **Step 2: Run phase-gate review**

Use `production-code-quality-review` in `phase-gate` mode on the stop-controller increment.

- [ ] **Step 3: Stop after milestone acceptance**

If the controller passes and only backlog items remain, stop the milestone and summarize.
