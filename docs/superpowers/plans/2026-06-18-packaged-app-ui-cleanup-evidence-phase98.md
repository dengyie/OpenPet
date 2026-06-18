# Packaged App UI Cleanup Evidence Automation Phase 98 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a packaged-app cleanup evidence runner that drives real plugin setup, declaration-command, and service cleanup flows through a launched OpenPet app session, then updates the structured cleanup evidence report from captured runtime transcripts without auto-claiming broader cleanup guarantees.

**Architecture:** Reuse the existing cleanup evidence chain instead of inventing a parallel format. A new packaged-app runner should compose the Phase 86 report shape, Phase 87 updater semantics, Phase 88 collector/archive wording, and the current Electron plugin lifecycle/runtime logs. The packaged-app runner owns orchestration and transcript capture; the existing cleanup report validator still owns readiness, and the archive manifest still owns hash/integrity checks.

**Tech Stack:** Node.js CommonJS scripts, Electron packaged app runtime, existing packaged runtime smoke launch pattern, existing plugin cleanup evidence scripts, Node native test runner.

---

## File Map

- Create: `scripts/run-packaged-plugin-cleanup-evidence.js`
  Purpose: launch a packaged OpenPet app, drive plugin install/enable/setup/command/service flows, stop the running paths, capture runtime transcripts, update the cleanup report, and write a packaged evidence archive.
- Create: `scripts/update-packaged-plugin-cleanup-evidence-report.js`
  Purpose: translate packaged-app runtime artifacts into Phase 86/87 cleanup report check updates without duplicating validation rules.
- Create: `tests/release/packaged-plugin-cleanup-evidence-runner.test.js`
  Purpose: prove CLI parsing, output-path guards, packaged-app evidence orchestration, transcript capture, check mapping, and conservative readiness boundaries.
- Create: `tests/release/packaged-plugin-cleanup-evidence-report-update.test.js`
  Purpose: prove packaged runtime artifacts map to the right cleanup checks, preserve pending states when evidence is incomplete, and reject misleading pass shortcuts.
- Create: `tests/fixtures/plugins/cleanup-evidence-fixture/`
  Purpose: provide a deterministic local plugin with one setup entry, one declaration command entry, and one service entry that can be driven and stopped during packaged cleanup evidence runs.
- Modify: `package.json`
  Purpose: expose the new packaged cleanup runner and packaged cleanup report updater commands.
- Modify: `src/shared/openpet-contracts.ts`
  Purpose: add shared contracts for the packaged plugin cleanup runtime artifact and packaged cleanup runner result so future archive/report consumers type-check the new JSON boundary.
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
  Purpose: add representative fixtures for the packaged cleanup runtime artifact and runner summary.
- Create: `docs/phases/phase-98-packaged-app-ui-cleanup-evidence.md`
  Purpose: record delivered scope, decisions, evidence boundaries, and verification.
- Create: `docs/reviews/phase-98-packaged-app-ui-cleanup-evidence-review.md`
  Purpose: record the deep production review, score, pass status, and remaining limits.
- Modify: `docs/productization-v1.1-todo-design.md`
  Purpose: mark packaged app UI cleanup evidence as the next completed plugin ecosystem slice once implemented.
- Modify: `docs/project-review-todo-design.md`
  Purpose: tighten the remaining plugin-author/runtime evidence gap wording after this automation exists.
- Modify: `docs/development-summary.md`
  Purpose: add Phase 98 status and move the cleanup evidence gap to the next honest remaining limit.
- Modify: `docs/project-status-review.md`
  Purpose: reflect the new packaged cleanup evidence capability in the extension/runtime evidence summary.
- Modify: `docs/HANDOFF.md`
  Purpose: teach the next engineer the new packaged cleanup commands, archive boundary, and remaining limits.
- Modify: `docs/project-context.json`
  Purpose: persist the machine-readable phase status and capability summary for Phase 98.

## Task 1: Report Mapper RED

**Files:**
- Create: `tests/release/packaged-plugin-cleanup-evidence-report-update.test.js`
- Create: `scripts/update-packaged-plugin-cleanup-evidence-report.js`

- [ ] **Step 1: Add a fixture-shaped packaged runtime artifact test**

Add a test that feeds a synthetic packaged runtime artifact into the future mapper:

```js
const runtimeArtifact = {
  schemaVersion: 1,
  generatedAt: '2026-06-18T18:00:00.000Z',
  pluginId: 'openpet.cleanup-evidence-fixture',
  hostApp: 'OpenPet.app',
  setup: {
    requested: true,
    stopRequested: true,
    exitConfirmed: true,
    treeCleanupAttempted: true,
    transcriptPath: '/tmp/setup.txt'
  },
  command: {
    requested: true,
    stopRequested: true,
    exitConfirmed: true,
    treeCleanupAttempted: true,
    transcriptPath: '/tmp/command.txt'
  },
  service: {
    requested: true,
    stopRequested: true,
    exitConfirmed: true,
    processGroupCleanupAttempted: true,
    treeCleanupAttempted: true,
    forceStopAttempted: true,
    transcriptPath: '/tmp/service.txt'
  }
}
```

Assert the mapped report updates:

```js
assert.equal(findCheck(updated, 'setup-exit-confirmed-stop').status, 'pass')
assert.equal(findCheck(updated, 'setup-tree-fallback-cleanup').status, 'pass')
assert.equal(findCheck(updated, 'command-exit-confirmed-stop').status, 'pass')
assert.equal(findCheck(updated, 'command-tree-fallback-cleanup').status, 'pass')
assert.equal(findCheck(updated, 'service-exit-confirmed-stop').status, 'pass')
assert.equal(findCheck(updated, 'service-process-group-cleanup').status, 'pass')
assert.equal(findCheck(updated, 'service-tree-fallback-cleanup').status, 'pass')
assert.equal(findCheck(updated, 'service-force-stop').status, 'pass')
```

- [ ] **Step 2: Add an incomplete-evidence test**

Add a test where setup/command/service transcripts exist but fallback or force-stop flags are missing:

```js
assert.equal(findCheck(updated, 'service-force-stop').status, 'pending')
assert.match(findCheck(updated, 'service-force-stop').notes, /not observed in this packaged run/i)
assert.equal(findCheck(updated, 'setup-tree-fallback-cleanup').status, 'pending')
```

This locks the conservative rule: the mapper may only mark a check `pass` when the runtime artifact proves that specific behavior.

- [ ] **Step 3: Add a misleading-pass guard test**

Add a test that proves the mapper refuses runtime artifacts that try to pre-claim global cleanup readiness:

```js
assert.throws(
  () => mapPackagedCleanupEvidence({ runtimeArtifact: { cleanupReady: true } }),
  /must not claim cleanupReady/i
)
```

- [ ] **Step 4: Verify RED**

Run:

```bash
node --test tests/release/packaged-plugin-cleanup-evidence-report-update.test.js
```

Expected before implementation:

- FAIL because `scripts/update-packaged-plugin-cleanup-evidence-report.js` does not exist.

## Task 2: Runner RED

**Files:**
- Create: `tests/release/packaged-plugin-cleanup-evidence-runner.test.js`
- Create: `tests/fixtures/plugins/cleanup-evidence-fixture/`

- [ ] **Step 1: Add CLI and path-shape tests**

Add runner tests for:

```js
const options = parseArgs([
  '--app', '/Applications/OpenPet.app',
  '--plugin-source', 'tests/fixtures/plugins/cleanup-evidence-fixture',
  '--archive-dir', 'docs/release-evidence/plugin-cleanup-evidence/packaged-session',
  '--json'
])

assert.equal(options.appPath, '/Applications/OpenPet.app')
assert.equal(options.pluginSource, 'tests/fixtures/plugins/cleanup-evidence-fixture')
assert.equal(options.archiveDir, 'docs/release-evidence/plugin-cleanup-evidence/packaged-session')
assert.equal(options.json, true)
```

Also assert missing `--plugin-source` or unknown flags throw.

- [ ] **Step 2: Add orchestration transcript test**

Model the future runner around a fake packaged app adapter and assert it persists:

```js
assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-plugin-cleanup-runtime.json')), true)
assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-plugin-cleanup-stdout.txt')), true)
assert.equal(fs.existsSync(path.join(archiveDir, 'packaged-plugin-cleanup-stderr.txt')), true)
assert.equal(fs.existsSync(path.join(archiveDir, 'plugin-cleanup-evidence-report.json')), true)
assert.equal(fs.existsSync(path.join(archiveDir, 'plugin-cleanup-evidence-archive-manifest.json')), true)
```

- [ ] **Step 3: Add report-update integration test**

Add a test proving the runner feeds the packaged runtime artifact into the new mapper and returns:

```js
assert.equal(result.ok, true)
assert.equal(result.reportValidation.ok, true)
assert.equal(result.manifest.ok, true)
assert.equal(result.manifest.cleanupReady, false)
assert.equal(result.updatedReport.checks.some((check) => check.status === 'pass'), true)
```

The important boundary is `manifest.cleanupReady === false` unless every required packaged check is proven in that session.

- [ ] **Step 4: Add failure-preservation tests**

Add tests for:

- packaged app launch timeout;
- plugin install failure;
- setup/command/service orchestration failure;
- missing transcript files;
- existing archive output collision.

Assert failures are preserved diagnostically:

```js
assert.equal(result.ok, false)
assert.equal(result.manifest.ok, false)
assert.match(result.errors.join('\n'), /timed out|failed/i)
```

- [ ] **Step 5: Verify RED**

Run:

```bash
node --test tests/release/packaged-plugin-cleanup-evidence-runner.test.js
```

Expected before implementation:

- FAIL because `scripts/run-packaged-plugin-cleanup-evidence.js` does not exist.

## Task 3: Implement Packaged Cleanup Report Mapper

**Files:**
- Create: `scripts/update-packaged-plugin-cleanup-evidence-report.js`
- Test: `tests/release/packaged-plugin-cleanup-evidence-report-update.test.js`

- [ ] **Step 1: Add runtime artifact validation**

Implement a strict loader:

```js
const validateRuntimeArtifact = (artifact) => {
  if (!artifact || typeof artifact !== 'object') throw new Error('Packaged cleanup runtime artifact must be an object')
  if (artifact.cleanupReady === true) throw new Error('Packaged cleanup runtime artifact must not claim cleanupReady')
  if (!artifact.pluginId) throw new Error('pluginId is required')
  if (!artifact.hostApp) throw new Error('hostApp is required')
}
```

- [ ] **Step 2: Add check-mapping helpers**

Implement helpers like:

```js
const markPassIf = (report, checkId, condition, evidence, passNotes, pendingNotes) => {
  return updateCheck(report, checkId, condition
    ? { status: 'pass', evidence, notes: passNotes }
    : { status: 'pending', notes: pendingNotes })
}
```

Map:

- `setup.exitConfirmed` -> `setup-exit-confirmed-stop`
- `setup.treeCleanupAttempted` -> `setup-tree-fallback-cleanup`
- `command.exitConfirmed` -> `command-exit-confirmed-stop`
- `command.treeCleanupAttempted` -> `command-tree-fallback-cleanup`
- `service.exitConfirmed` -> `service-exit-confirmed-stop`
- `service.processGroupCleanupAttempted` -> `service-process-group-cleanup`
- `service.treeCleanupAttempted` -> `service-tree-fallback-cleanup`
- `service.forceStopAttempted` -> `service-force-stop`

- [ ] **Step 3: Reuse existing Phase 87 validation path**

After mapping, validate through the existing report validator:

```js
const validation = validateReport(updated, { allowPending: true })
if (!validation.ok) throw new Error(`Mapped packaged cleanup report is invalid: ${validation.errors.join('; ')}`)
```

Do not add a second readiness policy.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/release/packaged-plugin-cleanup-evidence-report-update.test.js
```

Expected:

- PASS.

## Task 4: Implement Packaged Cleanup Runner

**Files:**
- Create: `scripts/run-packaged-plugin-cleanup-evidence.js`
- Create: `tests/fixtures/plugins/cleanup-evidence-fixture/`
- Test: `tests/release/packaged-plugin-cleanup-evidence-runner.test.js`

- [ ] **Step 1: Add a deterministic cleanup-evidence fixture plugin**

Create a local plugin fixture with:

- one setup entry that stays alive until stopped;
- one declaration command that stays alive until stopped;
- one service entry that stays alive until stopped;
- minimal manifest permissions for the covered flows;
- runtime log lines that make stop/exit timing observable.

Keep it local-only and conservative:

```json
{
  "id": "openpet.cleanup-evidence-fixture",
  "name": "Cleanup Evidence Fixture",
  "version": "1.0.0",
  "entries": {
    "setup": [{ "id": "prepare", "title": "Prepare Fixture", "command": "node ./bin/setup.js", "cwd": "." }],
    "commands": [{ "id": "announce", "title": "Announce", "command": "node ./bin/command.js", "cwd": "." }],
    "services": [{ "id": "companion", "title": "Companion", "command": "node ./bin/service.js", "cwd": "." }]
  }
}
```

- [ ] **Step 2: Add packaged-app orchestration adapter**

Implement a small adapter in the runner that:

1. creates a pending cleanup report in the target archive dir;
2. installs the fixture plugin through the same install service path used by local plugins;
3. enables the plugin;
4. runs setup;
5. runs the declaration command;
6. starts the service;
7. triggers stop / disable / shutdown cleanup paths in a controlled order;
8. captures resulting plugin runtime state and logs.

The runner should persist a packaged runtime artifact like:

```js
{
  schemaVersion: 1,
  generatedAt,
  pluginId,
  hostApp,
  setup: { requested, stopRequested, exitConfirmed, treeCleanupAttempted, transcriptPath },
  command: { requested, stopRequested, exitConfirmed, treeCleanupAttempted, transcriptPath },
  service: { requested, stopRequested, exitConfirmed, processGroupCleanupAttempted, treeCleanupAttempted, forceStopAttempted, transcriptPath },
  logPath,
  screenshotPaths: []
}
```

- [ ] **Step 3: Reuse archive and validation modules**

The runner must:

- write `plugin-cleanup-evidence-report.json`;
- write `packaged-plugin-cleanup-runtime.json`;
- write stdout/stderr transcripts for the packaged orchestration;
- feed the runtime artifact into `update-packaged-plugin-cleanup-evidence-report.js`;
- call `createPluginCleanupEvidenceArchiveManifest()`;
- return success only when the runtime artifact, updated report, and archive manifest all validate structurally.

The runner must not:

- set all checks to pass automatically when evidence is missing;
- set a top-level `cleanupReady: true`;
- change plugin runtime behavior itself.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/release/packaged-plugin-cleanup-evidence-runner.test.js
```

Expected:

- PASS.

## Task 5: Add Shared Contracts

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`

- [ ] **Step 1: Add packaged cleanup runtime contracts**

Add shared types for:

- packaged cleanup runtime step evidence;
- packaged cleanup runtime artifact;
- packaged cleanup runner summary/result.

Suggested names:

```ts
export interface PackagedPluginCleanupRuntimeStepEvidence { ... }
export interface PackagedPluginCleanupRuntimeArtifact { ... }
export interface PackagedPluginCleanupEvidenceRunResult { ... }
```

- [ ] **Step 2: Add representative fixtures**

Add fixtures that mirror the runtime artifact written by the runner and the result object returned by the runner:

```ts
const packagedPluginCleanupRuntimeArtifactFixture = { ... } satisfies PackagedPluginCleanupRuntimeArtifact
const packagedPluginCleanupEvidenceRunResultFixture = { ... } satisfies PackagedPluginCleanupEvidenceRunResult
```

- [ ] **Step 3: Verify type boundary GREEN**

Run:

```bash
npm run typecheck
```

Expected:

- PASS.

## Task 6: Wire npm Scripts And Archive One Real Session

**Files:**
- Modify: `package.json`
- Create: `docs/release-evidence/plugin-cleanup-evidence/<phase98-session>/`

- [ ] **Step 1: Add npm scripts**

Add:

```json
"run-packaged-plugin-cleanup-evidence": "node scripts/run-packaged-plugin-cleanup-evidence.js",
"update-packaged-plugin-cleanup-evidence-report": "node scripts/update-packaged-plugin-cleanup-evidence-report.js"
```

- [ ] **Step 2: Run one packaged cleanup archive session**

Run a real packaged evidence command against the built app:

```bash
npm run pack
npm run run-packaged-plugin-cleanup-evidence -- --app release/mac/OpenPet.app --plugin-source tests/fixtures/plugins/cleanup-evidence-fixture --archive-dir docs/release-evidence/plugin-cleanup-evidence/<phase98-session>
```

Expected archive outputs:

- `plugin-cleanup-evidence-report.json`
- `packaged-plugin-cleanup-runtime.json`
- `packaged-plugin-cleanup-stdout.txt`
- `packaged-plugin-cleanup-stderr.txt`
- `plugin-cleanup-evidence-archive-manifest.json`

And expected boundaries:

- archive validity may be `ok: true`;
- cleanup readiness is only `true` if every required packaged cleanup check is genuinely proven;
- if any required packaged behavior was not observed, the report must stay pending or blocked instead of guessing.

## Task 7: Documentation And Review

**Files:**
- Create: `docs/phases/phase-98-packaged-app-ui-cleanup-evidence.md`
- Create: `docs/reviews/phase-98-packaged-app-ui-cleanup-evidence-review.md`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-review-todo-design.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/project-context.json`

- [ ] **Step 1: Update live docs with conservative packaged cleanup wording**

Every touched doc must preserve this idea:

```text
Packaged app cleanup evidence now exercises real setup, declaration-command, and service stop flows through a launched OpenPet app session, but it still records only the observed packaged run and does not claim universal cleanup guarantees for arbitrary descendant trees or third-party plugin behavior.
```

- [ ] **Step 2: Run deep production review**

Use the current-diff deep review workflow and record:

- severe issues;
- improvement recommendations;
- quality score;
- pass status.

- [ ] **Step 3: Run full verification**

Run:

```bash
node --test tests/release/packaged-plugin-cleanup-evidence-report-update.test.js tests/release/packaged-plugin-cleanup-evidence-runner.test.js
npm run typecheck
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected:

- new targeted packaged cleanup evidence suites pass;
- full Node suite passes;
- Playwright stays green;
- typecheck stays green;
- docs context JSON remains valid.

- [ ] **Step 4: Commit atomically**

Commit:

```bash
git add scripts/run-packaged-plugin-cleanup-evidence.js scripts/update-packaged-plugin-cleanup-evidence-report.js tests/release/packaged-plugin-cleanup-evidence-runner.test.js tests/release/packaged-plugin-cleanup-evidence-report-update.test.js tests/fixtures/plugins/cleanup-evidence-fixture package.json src/shared/openpet-contracts.ts tests/shared/openpet-contracts-type-fixture.ts docs/phases/phase-98-packaged-app-ui-cleanup-evidence.md docs/reviews/phase-98-packaged-app-ui-cleanup-evidence-review.md docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md docs/development-summary.md docs/project-status-review.md docs/HANDOFF.md docs/project-context.json docs/release-evidence/plugin-cleanup-evidence/<phase98-session>
git commit -m "feat(阶段98): add packaged app UI cleanup evidence"
```

## Self-Review Checklist

- [ ] Scope check: this phase automates packaged cleanup evidence only; it does not expand plugin permissions, release claims, or sandbox guarantees.
- [ ] Placeholder scan: no TBD/TODO/“implement later” text remains in the plan.
- [ ] Boundary wording: docs and scripts never confuse packaged evidence automation with universal cleanup proof.
- [ ] File accuracy: every referenced script/test/doc path exists now or is explicitly created by this phase.
