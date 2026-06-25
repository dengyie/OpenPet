# Plugin Service Lifecycle Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract plugin service runtime initialization and child lifecycle handling from `PluginService` without changing behavior.

**Architecture:** Keep `PluginService` responsible for plugin lookup, declaration resolution, spawn invocation, and response shaping. Move runtime object creation plus child `stdout`/`stderr`/`error`/`exit` handling into a dedicated CommonJS controller injected with logging, health cleanup, stop cleanup, and runtime-view helpers.

**Tech Stack:** CommonJS Node services, Node native test runner, existing plugin service integration tests.

---

### Task 1: Lifecycle Controller

**Files:**
- Create: `src/main/services/plugin-service-lifecycle-controller.js`
- Create: `tests/services/plugin-service-lifecycle-controller.test.js`

- [ ] **Step 1: Write the failing test**

Cover runtime initialization from spawn inputs, stdout/stderr log forwarding, child error handling, requested stop exit handling, and unrequested exit handling.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/services/plugin-service-lifecycle-controller.test.js`
Expected: FAIL because the module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement `createPluginServiceLifecycleController(...)` with methods to build the runtime payload and attach child lifecycle handlers.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/services/plugin-service-lifecycle-controller.test.js`
Expected: PASS.

### Task 2: PluginService Integration

**Files:**
- Modify: `src/main/services/plugin-service.js`
- Modify: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Replace inline service child lifecycle logic**

Instantiate the lifecycle controller and delegate runtime construction and child handler attachment from `startService`.

- [ ] **Step 2: Run focused regressions**

Run: `node --test tests/services/plugin-service-lifecycle-controller.test.js tests/services/plugin-service.test.js`
Expected: PASS.

### Task 3: Verification And Review

**Files:**
- Read-only: `src/main/services/plugin-service-lifecycle-controller.js`
- Read-only: `src/main/services/plugin-service.js`
- Read-only: `tests/services/plugin-service*.test.js`

- [ ] **Step 1: Run gates**

Run: `npm run check:syntax`
Run: `git diff --check`

- [ ] **Step 2: Run phase-gate review**

Use `production-code-quality-review` in `phase-gate` mode for this milestone increment only.

- [ ] **Step 3: Commit and stop**

```bash
git add src/main/services/plugin-service.js src/main/services/plugin-service-lifecycle-controller.js tests/services/plugin-service-lifecycle-controller.test.js docs/superpowers/plans/2026-06-26-plugin-service-lifecycle-controller.md
git commit -m "refactor(phase-7): extract plugin service lifecycle controller"
```
