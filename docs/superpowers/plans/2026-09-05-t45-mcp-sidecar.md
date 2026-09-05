# T45 MCP Sidecar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing MCP and `/api/pet/*` implementation into the backend sidecar without changing its external byte-level behavior.

**Architecture:** Keep `/api/v1/*` on the always-on, random-port, session-token listener. Put MCP and legacy pet endpoints on a second loopback-only listener owned by the same sidecar process; it retains the user-facing token and configured port and remains disabled until explicitly enabled.

**Tech Stack:** Node.js `node:http`, CommonJS compatibility modules, ESM backend orchestration, Node native test runner.

## Global Constraints

- Base the work on `main@1433b299864da99aa51c7c0bde1bd533b0f034fd`.
- Do not modify `docs/refactor/**`, `services/backend/store/migrations/001_init.sql`, or T46+ domains.
- Do not perform real publishing, signing, account smoke tests, or packaged manual evidence.
- Preserve loopback-only binding, default-off behavior, token authentication, port validation, MCP sessions, access logs, and response bytes.

---

### Task 1: Establish failing sidecar ownership evidence

**Files:**
- Test: `tests/backend/mcp-sidecar.test.js`

**Interfaces:**
- Consumes: `createLocalHttpService({ petService })`.
- Produces: regression coverage for default-off state, two-listener isolation, token separation, session revocation, and legacy response bytes.

- [x] **Step 1: Write the failing test**

  Import `services/backend/mcp/local-http-service.cjs`, assert the default status, then exercise the legacy endpoint and real sidecar process.

- [x] **Step 2: Run the test to verify it fails**

  Run: `node --test tests/backend/mcp-sidecar.test.js`

  Expected: fail with `ERR_MODULE_NOT_FOUND` for the new sidecar module.

### Task 2: Move the runtime and preserve old imports

**Files:**
- Create: `services/backend/mcp/local-http-service.cjs`
- Create: `services/backend/mcp/mcp-transport-service.cjs`
- Modify: `services/backend/domains/local-http.js`
- Modify: `src/main/services/local-http-service.js`
- Modify: `src/main/services/mcp-transport-service.js`

**Interfaces:**
- Consumes: existing `createLocalHttpService` and `createMcpTransportService` contracts.
- Produces: sidecar-owned implementations plus compatibility exports for current callers.

- [x] **Step 1: Move the existing implementations unchanged into `services/backend/mcp/`.**
- [x] **Step 2: Point the backend domain at the sidecar modules.**
- [x] **Step 3: Replace the old main-process files with compatibility exports.**
- [x] **Step 4: Run focused legacy and backend tests.**

  Run: `node --test tests/backend/mcp-sidecar.test.js tests/backend/routes-service.test.js tests/services/local-http-service.test.js tests/services/mcp-transport-service.test.js`

  Expected: all tests pass.

### Task 3: Close the second listener with the sidecar

**Files:**
- Modify: `services/backend/index.js`

**Interfaces:**
- Consumes: `runtime.service.stop()`.
- Produces: shutdown that closes both HTTP listeners before process exit.

- [x] **Step 1: Remove legacy-token authentication from the `/api/v1` router.**
- [x] **Step 2: Await the MCP listener stop during sidecar shutdown.**
- [ ] **Step 3: Run fresh project gates and review every changed file.**
- [ ] **Step 4: Commit with `Refs #41`.**
