# GitHub CI Reliability Remediation Implementation Plan

> Status: Complete
> Completed: 2026-07-30

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the Ubuntu GitHub CI job terminate predictably and pass its browser, cross-platform smoke, syntax/build, and dependency-security gates.

**Architecture:** Keep CI policy in `.github/workflows/ci.yml`, put reusable test-only cleanup primitives in `tests/helpers/`, inject platform and architecture at the packaged-runtime orchestration boundary, and resolve audit findings through supported dependency versions rather than suppressions. Each defect gets a replayable regression before its root-cause fix.

**Tech Stack:** GitHub Actions, Node.js 24, Node native test runner, Playwright Chromium, Electron, Sharp, npm audit.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/be97/OpenPet` on `codex/production-review-remediation-plan`.
- Do not modify, switch, merge, clean, or push the protected primary `main` worktree.
- Preserve all current application behavior and release-evidence claim boundaries.
- Do not use `continue-on-error`, audit exceptions, ignored advisories, or skipped browser tests to manufacture a green CI result.
- Browser/server cleanup must run after setup failures as well as assertion failures.
- The packaged-runtime CLI keeps real-host defaults while tests may inject `platform` and `arch`.
- Production dependencies must have zero known vulnerabilities; the complete
  development tree must have zero critical vulnerabilities and keep remaining
  upstream-only high findings visible in CI logs.

---

### Task 1: Bound And Provision The CI Job

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `tests/scripts/ci-workflow.test.js`

**Interfaces:**
- Consumes: the existing single `verify` job and Node 24 setup.
- Produces: one cancelable, time-bounded job with an installed Playwright Chromium binary before `npm test`.

- [x] **Step 1: Write the failing workflow contract test**

Create `tests/scripts/ci-workflow.test.js` with assertions equivalent to:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/ci.yml'), 'utf-8')

test('CI cancels superseded runs and has a bounded verify job', () => {
  assert.match(workflow, /^concurrency:\n(?:  .+\n)+  cancel-in-progress: true$/m)
  assert.match(workflow, /^  verify:\n    timeout-minutes: 30$/m)
})

test('CI installs Chromium before running Node tests', () => {
  const installIndex = workflow.indexOf('npx playwright install --with-deps chromium')
  const testIndex = workflow.indexOf('run: npm test')
  assert.ok(installIndex >= 0)
  assert.ok(installIndex < testIndex)
})
```

- [x] **Step 2: Run the workflow test and verify RED**

Run: `node --test tests/scripts/ci-workflow.test.js`

Expected: failure because the workflow has no concurrency policy, timeout, or browser installation step.

- [x] **Step 3: Implement bounded CI orchestration**

Add this top-level policy after `on`:

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

Add `timeout-minutes: 30` to `jobs.verify`, and add this step after `npm ci`:

```yaml
- name: Install Playwright Chromium
  run: npx playwright install --with-deps chromium
```

- [x] **Step 4: Run the workflow test and verify GREEN**

Run: `node --test tests/scripts/ci-workflow.test.js`

Expected: all workflow contract tests pass.

- [x] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml tests/scripts/ci-workflow.test.js
git commit -m "fix(ci): bound runs and install chromium"
```

### Task 2: Guarantee Browser Test Resource Cleanup

**Files:**
- Create: `tests/helpers/test-resource-cleanup.js`
- Create: `tests/scripts/test-resource-cleanup.test.js`
- Modify: `tests/examples/agent-awareness-dashboard-browser.test.js`
- Modify: `tests/examples/creator-studio-dashboard-browser.test.js`

**Interfaces:**
- Produces: `trackServerCleanup(t, server)` and `trackBrowserCleanup(t, browser)`.
- Cleanup functions are idempotent so existing local `finally` blocks and test hooks can coexist.

- [x] **Step 1: Write failing cleanup helper tests**

Cover both resources with parent/subtest assertions so cleanup is observed after
the subtest hook lifecycle:

```js
test('tracked resources close after a setup failure', async (t) => {
  const server = http.createServer((_request, response) => response.end('ok'))
  let browserConnected = true
  let browserCloseCount = 0
  const browser = {
    isConnected: () => browserConnected,
    close: async () => {
      browserCloseCount += 1
      browserConnected = false
    }
  }

  await t.test('register resources before later setup throws', async (t) => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    trackServerCleanup(t, server)
    trackBrowserCleanup(t, browser)
    throw new Error('simulated page setup failure')
  }).then(
    () => assert.fail('subtest should fail'),
    () => {}
  )

  assert.equal(server.listening, false)
  assert.equal(browserConnected, false)
  assert.equal(browserCloseCount, 1)
})
```

The parent test must assert the resources are closed after each subtest's `t.after` hooks run.

- [x] **Step 2: Run the helper tests and verify RED**

Run: `node --test tests/scripts/test-resource-cleanup.test.js`

Expected: failure because `tests/helpers/test-resource-cleanup.js` does not exist.

- [x] **Step 3: Implement idempotent cleanup registration**

Implement:

```js
const closeServerIfListening = async (server) => {
  if (!server?.listening) return
  server.closeAllConnections?.()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

const closeBrowserIfConnected = async (browser) => {
  if (!browser) return
  if (typeof browser.isConnected === 'function' && !browser.isConnected()) return
  await browser.close()
}

const trackServerCleanup = (t, server) => t.after(() => closeServerIfListening(server))
const trackBrowserCleanup = (t, browser) => t.after(() => closeBrowserIfConnected(browser))
```

- [x] **Step 4: Register cleanup immediately after each resource is acquired**

In the Agent Awareness browser test, register service cleanup before `chromium.launch()` and browser cleanup immediately after launch.

In Creator Studio tests:

- make `openDashboardServer(dataDir, t)` register the server after `listen`;
- make `openDashboardPage(server, t)` register the browser immediately after launch;
- route the two direct browser-launch tests through these helpers;
- register bridge servers and environment restoration with `t.after` before browser launch.

- [x] **Step 5: Run cleanup and browser regressions**

Run:

```bash
node --test tests/scripts/test-resource-cleanup.test.js
node --test tests/examples/agent-awareness-dashboard-browser.test.js
node --test tests/examples/creator-studio-dashboard-browser.test.js
```

Expected: cleanup helper tests and all browser tests pass; a future launch failure cannot retain an HTTP listener.

- [x] **Step 6: Commit**

```bash
git add tests/helpers/test-resource-cleanup.js tests/scripts/test-resource-cleanup.test.js tests/examples/agent-awareness-dashboard-browser.test.js tests/examples/creator-studio-dashboard-browser.test.js
git commit -m "fix(tests): close browser servers on setup failure"
```

### Task 3: Make Packaged Runtime Smoke Platform-Deterministic

**Files:**
- Modify: `scripts/run-packaged-runtime-smoke.js`
- Modify: `tests/release/packaged-runtime-smoke-capture.test.js`

**Interfaces:**
- `runPackagedRuntimeSmoke(options)` gains optional `platform = process.platform` and `arch = process.arch` inputs.
- CLI behavior remains unchanged because omitted options retain real-host defaults.

- [x] **Step 1: Add a Linux-host regression**

Temporarily override the configurable `process.platform` descriptor to `linux`, invoke `runPackagedRuntimeSmoke` with `platform: 'darwin'` and `arch: 'arm64'`, and restore the descriptor in `finally`.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/release/packaged-runtime-smoke-capture.test.js`

Expected: `Packaged runtime smoke reports only support darwin and win32` because the orchestration function ignores injected platform data.

- [x] **Step 3: Inject platform and architecture at the orchestration boundary**

Change the signature and internal calls:

```js
const runPackagedRuntimeSmoke = async ({
  appPath = '',
  releaseDir = DEFAULT_RELEASE_DIR,
  outputDir = DEFAULT_OUTPUT_DIR,
  reportOutput = '',
  desktopPickerSmokeReport = '',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  allowPendingPicker = false,
  allowAnyPlatform = false,
  spawnImpl = spawn,
  fsImpl = fs,
  now = () => new Date(),
  platform = process.platform,
  arch = process.arch
} = {}) => {
  const baseReport = createPackagedRuntimeSmokeReport({ releaseDir, platform, arch, allowAnyPlatform })
  const session = createRuntimeSmokeSession({ appPath: resolvedAppPath, outputDir, platform, arch, now })
  const executable = platform === 'darwin' ? resolveMacExecutable(resolvedAppPath) : resolvedAppPath
}
```

Update the existing run test to pass `platform: 'darwin'` and `arch: 'arm64'` explicitly.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/release/packaged-runtime-smoke-capture.test.js`

Expected: all packaged-runtime capture tests pass on any host.

- [x] **Step 5: Commit**

```bash
git add scripts/run-packaged-runtime-smoke.js tests/release/packaged-runtime-smoke-capture.test.js
git commit -m "fix(smoke): inject packaged runtime platform"
```

### Task 4: Upgrade Production Dependencies And Enforce A Tiered Audit Gate

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Upgrade direct `sharp` to `^0.35.3`.
- Refresh compatible transitive packages selected by npm for `tar`, `undici`, `postcss`, `js-yaml`, `fast-uri`, and `brace-expansion`.
- Block high-or-greater production findings and critical full-tree findings.

- [x] **Step 1: Capture the failing audit**

Run: `npm audit --json`

Expected baseline: 1 critical and 6 high vulnerabilities.

- [x] **Step 2: Upgrade Sharp and compatible transitive dependencies**

Set `sharp` to `^0.35.3`, install the updated lockfile, then run `npm audit fix` without `--force` for compatible transitive updates.

Do not use npm's suggested forced downgrade to electron-builder 25.1.8 or force
the incompatible `brace-expansion` 5.x API into consumers pinned to 1.x/2.x.
Configure CI to run both:

```bash
npm audit --omit=dev --audit-level=high
npm audit --include=dev --audit-level=critical
```

- [x] **Step 3: Verify dependency and image compatibility**

Run:

```bash
npm audit --omit=dev --audit-level=high
npm audit --include=dev --audit-level=critical
node --test tests/services/sprite-generator.test.js tests/services/cursor-asset-service.test.js
node --test tests/examples/creator-studio-action-frame-builder.test.js tests/examples/creator-studio-real-atlas-builder.test.js
```

Expected: production audit reports zero vulnerabilities, the complete tree has
zero critical vulnerabilities, and representative Sharp-heavy suites pass.

- [x] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix(deps): clear production audit findings"
```

### Task 5: Run The CI-Equivalent Regression Matrix

**Files:**
- Modify: this plan only to mark completed steps and record exact results.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: a clean, reviewable branch ready for a separate push or merge decision.

- [x] **Step 1: Recreate CI installation state**

Run `npm ci`, followed by `npx playwright install chromium` locally. The workflow itself uses `--with-deps` on Ubuntu.

- [x] **Step 2: Run CI gates**

```bash
npm test
npm run build:control-center
npm audit --omit=dev --audit-level=high
npm audit --include=dev --audit-level=critical
npm run generate-sprites
npm run check:syntax
```

- [x] **Step 3: Run project merge gates**

```bash
npm run check:docs-drift
npm run test:control-center
git diff --check main...HEAD
```

- [x] **Step 4: Verify isolation and commit the evidence record**

Confirm the feature worktree is clean, `main` remains unchanged and clean, and the feature merge-base is `main@54bc2e14`. Update this plan with exact counts and commit the evidence record.

## Completion Evidence

- Rebase: feature branch merge-base is `54bc2e146a1212dbd4d01fa6bf493449bef4e06e`.
- CI workflow contract: 3 passed, 0 failed.
- Cleanup regression plus browser suites: 29 passed, 0 failed.
- Packaged-runtime Linux simulation: 9 passed, 0 failed.
- Sharp representative suites: 63 passed, 0 failed.
- `npm ci`: 323 packages installed from the committed lockfile.
- `npm test`: 2551 passed, 0 failed, 1 expected macOS helper skip.
- `npm run test:control-center`: 75 passed, 0 failed.
- `npm run build:control-center`: passed.
- `npm run generate-sprites`: passed without tracked output drift.
- `npm run check:syntax`: passed, including typecheck, native helper builds,
  and the Control Center production build.
- `npm run check:docs-drift`: passed.
- Node.js 24.18 focused CI compatibility matrix: 79 passed, 0 failed.
- Production dependency audit: 0 vulnerabilities.
- Full dependency tree: 0 critical vulnerabilities; 16 high findings remain
  visible from electron-builder's development-only legacy glob/minimatch chain.
  npm's only automated suggestion is an unsafe electron-builder downgrade, so
  CI blocks critical development findings while continuing to report these
  upstream-only high findings.

## Implementation Commits

- `70d3e39e` — bound CI runs and install Chromium.
- `c04301b9` — guarantee browser/server cleanup after setup failures.
- `41d6b981` — inject packaged-runtime platform and architecture.
- `7c613145` — upgrade Sharp and enforce the tiered audit gate.
