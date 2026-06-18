# Plugin Cleanup Evidence Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-command runner that creates a plugin cleanup evidence report, executes the collector, captures transcripts, and writes the archive manifest without claiming cleanup readiness.

**Architecture:** Compose existing Phase 86 report generation, Phase 88 collector generation, and Phase 89 archive manifest creation. Keep readiness decisions inside the structured report validator and expose runner success separately from `manifest.cleanupReady`.

**Tech Stack:** Node.js CommonJS scripts, Node native test runner, existing plugin cleanup evidence tooling.

---

## File Map

- Create: `scripts/run-plugin-cleanup-evidence-collector.js`
  Purpose: orchestrate report creation, collector generation/execution, transcript capture, and manifest writing.
- Create: `tests/release/plugin-cleanup-evidence-runner.test.js`
  Purpose: prove CLI parsing, default archive paths, collector env wiring, transcript capture, successful pending archives, failed collector preservation, and overwrite protection.
- Modify: `package.json`
  Purpose: expose `npm run run-plugin-cleanup-evidence-collector`.
- Create: `docs/release-evidence/plugin-cleanup-evidence/2026-06-18T14-30-00Z-darwin-arm64/`
  Purpose: archive one local Phase 90 runner rehearsal.
- Create: `docs/phases/phase-90-plugin-cleanup-evidence-runner.md`
  Purpose: record delivered behavior, validation, and limits.
- Create: `docs/reviews/phase-90-plugin-cleanup-evidence-runner-review.md`
  Purpose: record production code quality review.
- Modify: live docs/context
  Purpose: record Phase 90 facts, command list, and Node test baseline.

## Task 1: Write Failing Tests

**Files:**
- Create: `tests/release/plugin-cleanup-evidence-runner.test.js`

- [x] **Step 1: Add CLI and default path tests**

Test `parseArgs()` with:

```js
parseArgs([
  '--archive-dir', 'release/plugin-cleanup',
  '--plugin-id', 'openpet.cleanup-fixture',
  '--host-app', 'OpenPet packaged app',
  '--notes', 'packaged cleanup rehearsal',
  '--json'
])
```

Expected:

- all provided values are preserved;
- incomplete values and unknown flags throw;
- `defaultArchiveDir({ now, platform, arch })` returns `docs/release-evidence/plugin-cleanup-evidence/<session>-<platform>-<arch>`.

- [x] **Step 2: Add collector execution transcript test**

Test `runCollectorCommand()` with a fake `spawnSyncImpl` and assert:

```js
assert.equal(options.env.REPORT_PATH, reportPath)
assert.equal(options.env.EVIDENCE_DIR, evidenceDir)
assert.equal(fs.readFileSync(path.join(evidenceDir, 'collector-stdout.txt'), 'utf-8'), 'collector ok\n')
assert.equal(JSON.parse(fs.readFileSync(path.join(evidenceDir, 'collector-run.json'), 'utf-8')).command[0], 'bash')
```

- [x] **Step 3: Add successful pending archive test**

Use a fake collector process that writes the standard Phase 88 evidence files. Assert:

```js
assert.equal(result.ok, true)
assert.equal(result.collectorRun.ok, true)
assert.equal(result.manifest.ok, true)
assert.equal(result.manifest.cleanupReady, false)
assert.equal(result.manifest.evidence.files.some((file) => file.file === 'collector-run.json'), true)
```

- [x] **Step 4: Add failure preservation and overwrite tests**

Assert failed collectors preserve stderr and do not claim archive validity:

```js
assert.equal(result.ok, false)
assert.equal(result.manifest.ok, false)
assert.match(result.manifest.errors.join('\n'), /missing evidence file/)
assert.equal(fs.readFileSync(path.join(archiveDir, 'plugin-cleanup-evidence-collected', 'collector-stderr.txt'), 'utf-8'), 'collector failed\n')
```

Assert existing report/collector/evidence/manifest paths throw before writing.

- [x] **Step 5: Verify RED**

Run:

```bash
node --test tests/release/plugin-cleanup-evidence-runner.test.js
```

Expected before implementation:

- FAIL because `scripts/run-plugin-cleanup-evidence-collector.js` is missing.

## Task 2: Implement Runner

**Files:**
- Create: `scripts/run-plugin-cleanup-evidence-collector.js`

- [x] **Step 1: Add argument parsing and default session naming**

Implement:

```js
const defaultArchiveDir = ({ now = () => new Date(), platform = process.platform, arch = process.arch } = {}) =>
  path.join(DEFAULT_EVIDENCE_ROOT, `${sessionIdFromDate(now())}-${platform}-${arch}`)
```

Support `--archive-dir`, `--plugin-id`, `--host-app`, `--notes`, `--json`, and `--help`.

- [x] **Step 2: Add overwrite guard**

Implement:

```js
const assertRunOutputsDoNotExist = ({ paths, fsImpl = fs }) => {
  for (const outputPath of [paths.reportPath, paths.collectorPath, paths.evidenceDir, paths.outputPath]) {
    if (fsImpl.existsSync(outputPath)) {
      throw new Error(`Plugin cleanup evidence run output already exists: ${outputPath}`)
    }
  }
}
```

- [x] **Step 3: Add collector execution transcript capture**

Implement `runCollectorCommand()` so it:

- executes `bash <collectorPath>`;
- injects `REPORT_PATH` and `EVIDENCE_DIR`;
- writes `collector-stdout.txt`;
- writes `collector-stderr.txt`;
- writes `collector-run.json`;
- returns `{ ok, exitCode, signal, error, stdoutPath, stderrPath, runPath }`.

- [x] **Step 4: Compose report, collector, runner, and manifest**

Implement `createPluginCleanupEvidenceRun()` so it:

- creates the pending report via `createPluginCleanupEvidenceReport()`;
- writes the collector via `createCollector()` and `writeCollector()`;
- runs the collector through `runCollectorCommand()`;
- creates the archive manifest via `createPluginCleanupEvidenceArchiveManifest()`;
- writes the manifest via `writeManifest()`;
- returns `ok: collectorRun.ok && manifest.ok`.

- [x] **Step 5: Verify GREEN**

Run:

```bash
node --test tests/release/plugin-cleanup-evidence-runner.test.js
```

Expected:

- PASS `8/8`.

## Task 3: Wire npm Script And Archive Rehearsal

**Files:**
- Modify: `package.json`
- Create: `docs/release-evidence/plugin-cleanup-evidence/2026-06-18T14-30-00Z-darwin-arm64/`

- [x] **Step 1: Add npm script**

Add:

```json
"run-plugin-cleanup-evidence-collector": "node scripts/run-plugin-cleanup-evidence-collector.js"
```

- [x] **Step 2: Create local rehearsal archive**

Run:

```bash
npm run run-plugin-cleanup-evidence-collector -- --archive-dir docs/release-evidence/plugin-cleanup-evidence/2026-06-18T14-30-00Z-darwin-arm64 --host-app "OpenPet packaged cleanup evidence rehearsal" --notes "Phase 90 local execution rehearsal"
```

Expected:

- `plugin-cleanup-evidence-report.json` exists;
- `plugin-cleanup-evidence-collector.sh` exists;
- `plugin-cleanup-evidence-collected/collector-run.json` exists;
- `plugin-cleanup-evidence-archive-manifest.json` exists;
- manifest has `ok: true` and `cleanupReady: false`.

## Task 4: Documentation And Review

**Files:**
- Create: `docs/phases/phase-90-plugin-cleanup-evidence-runner.md`
- Create: `docs/reviews/phase-90-plugin-cleanup-evidence-runner-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-review-todo-design.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [x] **Step 1: Update docs with conservative wording**

Every doc update must preserve this statement:

```text
The runner creates and archives a pending cleanup evidence session; it does not mark cleanup checks as pass and does not prove cleanup readiness.
```

- [x] **Step 2: Run production review and verification**

Run:

```bash
node --test tests/release/plugin-cleanup-evidence-runner.test.js
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected:

- targeted Phase 90 tests pass `8/8`;
- full Node tests pass with the updated baseline;
- Control Center stays `10/10`;
- review records no blocking production issues.

## Self-Review Checklist

- [x] Spec coverage: tests and script cover all Phase 90 acceptance criteria.
- [x] Placeholder scan: no TODO/TBD/unspecified implementation steps.
- [x] Boundary wording: docs must not claim packaged cleanup readiness.
- [x] Type/name consistency: exported names match tests and script.
