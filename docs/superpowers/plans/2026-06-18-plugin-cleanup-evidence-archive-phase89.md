# Plugin Cleanup Evidence Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a plugin cleanup evidence archive manifest generator that preserves report, collector, and collected evidence hashes without overstating cleanup readiness.

**Architecture:** Keep Phase 86 reports, Phase 87 validation-first updates, and Phase 88 collector output as the source of truth. Add a standalone Node script that validates the standard archive shape, hashes contents, rejects misleading collector shortcuts, and keeps `ok` archive validity separate from `cleanupReady` strict readiness.

**Tech Stack:** Node.js CommonJS scripts, Node native test runner, existing plugin cleanup evidence report validator, Markdown project documentation.

---

## File Map

- Create: `scripts/create-plugin-cleanup-evidence-archive-manifest.js`
  Purpose: parse CLI options, validate a cleanup evidence archive, hash report/collector/evidence files, and write `plugin-cleanup-evidence-archive-manifest.json`.
- Create: `tests/release/plugin-cleanup-evidence-archive-manifest.test.js`
  Purpose: prove CLI parsing, default path resolution, pending archive validity, readiness separation, missing-file failures, collector safety checks, symlink rejection, and manifest writing.
- Modify: `package.json`
  Purpose: expose `npm run create-plugin-cleanup-evidence-archive-manifest`.
- Create: `docs/superpowers/specs/2026-06-18-plugin-cleanup-evidence-archive-phase89-design.md`
  Purpose: record scope, decisions, and acceptance criteria.
- Create: `docs/phases/phase-89-plugin-cleanup-evidence-archive.md`
  Purpose: record delivered behavior, validation, and boundary wording.
- Create: `docs/reviews/phase-89-plugin-cleanup-evidence-archive-review.md`
  Purpose: record production-code-quality-review findings and quality gate.
- Modify: `README.md`, `README.zh-CN.md`, `docs/HANDOFF.md`, `docs/development-summary.md`, `docs/project-status-review.md`, `docs/project-context.json`, `docs/productization-v1.1-todo-design.md`, `docs/project-review-todo-design.md`
  Purpose: update the Phase 89 command, current facts, and Node test baseline.

## Execution Preconditions

- [x] **Step 1: Confirm branch and dirty state**

Run:

```bash
git status --short --branch
```

Expected:

- branch is `codex/plugin-cleanup-evidence-archive-phase89`;
- unrelated user changes are not mixed into the Phase 89 diff;
- if later-phase files exist, do not edit or revert them.

- [x] **Step 2: Review the prior cleanup evidence chain**

Run:

```bash
rg -n "create-plugin-cleanup-evidence|update-plugin-cleanup-evidence-report|create-plugin-cleanup-evidence-collector|validateReport|REQUIRED_CHECKS" scripts tests/release docs/phases/phase-8{6,7,8}-*.md
```

Expected:

- Phase 86 owns report creation and validation;
- Phase 87 owns safe report updates;
- Phase 88 owns helper generation;
- Phase 89 must not change runtime cleanup semantics or mark checks as passed.

## Task 1: Write Failing Archive Manifest Tests

**Files:**
- Create: `tests/release/plugin-cleanup-evidence-archive-manifest.test.js`

- [x] **Step 1: Add fixture helpers**

Add helpers that create a temporary archive with:

```js
const createArchive = ({ status = 'pending', collectorOverride = null } = {}) => {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-plugin-cleanup-archive-'))
  const evidenceDir = path.join(archiveDir, 'plugin-cleanup-evidence-collected')
  fs.mkdirSync(evidenceDir)

  const report = createReport({ status })
  const reportPath = path.join(archiveDir, 'plugin-cleanup-evidence-report.json')
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const collector = collectorOverride || createCollector({
    report,
    reportPath,
    generatedAt: fixedNow()
  })
  fs.writeFileSync(path.join(archiveDir, 'plugin-cleanup-evidence-collector.sh'), `${collector}\n`)

  fs.writeFileSync(path.join(evidenceDir, 'environment.txt'), 'CollectedAt: 2026-06-18T13:00:00Z\n')
  fs.writeFileSync(path.join(evidenceDir, 'report-structure-validation.txt'), 'Report structure is valid.\n')
  fs.writeFileSync(path.join(evidenceDir, 'cleanup-controlled-fixture-output.json'), JSON.stringify({ ok: true }, null, 2))
  fs.writeFileSync(path.join(evidenceDir, 'cleanup-controlled-fixture-stderr.txt'), '')
  fs.writeFileSync(path.join(evidenceDir, 'cleanup-controlled-fixture-status.txt'), 'Controlled fixture evidence created.\n')
  fs.writeFileSync(path.join(evidenceDir, 'manual-checks.md'), createManualChecklist())
  fs.writeFileSync(path.join(evidenceDir, 'update-report-commands.md'), createCommandNotes({ reportFileName: reportPath }))

  return { archiveDir, evidenceDir, reportPath }
}
```

- [x] **Step 2: Add tests for CLI path handling**

Add:

```js
test('parseArgs accepts plugin cleanup archive paths and json output', () => {
  const options = parseArgs([
    '--archive-dir', 'archive',
    '--report', 'archive/report.json',
    '--collector', 'archive/collector.sh',
    '--evidence-dir', 'archive/evidence',
    '--output', 'archive/manifest.json',
    '--json'
  ])

  assert.equal(options.archiveDir, 'archive')
  assert.equal(options.reportPath, 'archive/report.json')
  assert.equal(options.collectorPath, 'archive/collector.sh')
  assert.equal(options.evidenceDir, 'archive/evidence')
  assert.equal(options.outputPath, 'archive/manifest.json')
  assert.equal(options.json, true)
})
```

- [x] **Step 3: Add tests for archive validity versus readiness**

Add:

```js
test('createPluginCleanupEvidenceArchiveManifest records a complete pending archive without readiness claim', () => {
  const { archiveDir } = createArchive()

  const manifest = createPluginCleanupEvidenceArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, true)
  assert.equal(manifest.cleanupReady, false)
  assert.equal(manifest.evidence.requiredFilesPresent, true)
  assert.equal(manifest.report.structuralValidation.ok, true)
  assert.equal(manifest.report.readinessValidation.ok, false)
  assert.match(manifest.warnings.join('\n'), /does not prove plugin cleanup readiness/)
})
```

- [x] **Step 4: Add tests for failed archive validity**

Add:

```js
test('createPluginCleanupEvidenceArchiveManifest fails when required evidence files are missing', () => {
  const { archiveDir, evidenceDir } = createArchive()
  fs.unlinkSync(path.join(evidenceDir, 'manual-checks.md'))

  const manifest = createPluginCleanupEvidenceArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.cleanupReady, false)
  assert.match(manifest.errors.join('\n'), /missing evidence file: .*manual-checks\.md/)
})

test('createPluginCleanupEvidenceArchiveManifest rejects misleading collector pass shortcuts', () => {
  const { archiveDir } = createArchive({
    collectorOverride: [
      '#!/usr/bin/env bash',
      'npm run update-plugin-cleanup-evidence-report -- report.json --status pass'
    ].join('\n')
  })

  const manifest = createPluginCleanupEvidenceArchiveManifest({ archiveDir, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.match(manifest.errors.join('\n'), /collector must not include --status pass/)
  assert.match(manifest.errors.join('\n'), /collector must state that it does not prove cleanup readiness/)
})
```

- [x] **Step 5: Run tests and verify RED**

Run:

```bash
node --test tests/release/plugin-cleanup-evidence-archive-manifest.test.js
```

Expected before implementation:

- FAIL because `../../scripts/create-plugin-cleanup-evidence-archive-manifest` does not exist.

## Task 2: Implement Archive Manifest Generator

**Files:**
- Create: `scripts/create-plugin-cleanup-evidence-archive-manifest.js`

- [x] **Step 1: Add CLI defaults and argument parsing**

Implement:

```js
const DEFAULT_ARCHIVE_DIR = 'plugin-cleanup-evidence-archive'
const DEFAULT_REPORT_NAME = 'plugin-cleanup-evidence-report.json'
const DEFAULT_COLLECTOR_NAME = 'plugin-cleanup-evidence-collector.sh'
const DEFAULT_EVIDENCE_DIR_NAME = 'plugin-cleanup-evidence-collected'
const DEFAULT_MANIFEST_NAME = 'plugin-cleanup-evidence-archive-manifest.json'

const parseArgs = (argv) => {
  const options = {
    archiveDir: DEFAULT_ARCHIVE_DIR,
    reportPath: null,
    collectorPath: null,
    evidenceDir: null,
    outputPath: null,
    json: false,
    help: false
  }

  const readValue = (index, flag) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--archive-dir') {
      options.archiveDir = readValue(index, arg)
      index += 1
    } else if (arg === '--report') {
      options.reportPath = readValue(index, arg)
      index += 1
    } else if (arg === '--collector') {
      options.collectorPath = readValue(index, arg)
      index += 1
    } else if (arg === '--evidence-dir') {
      options.evidenceDir = readValue(index, arg)
      index += 1
    } else if (arg === '--output') {
      options.outputPath = readValue(index, arg)
      index += 1
    } else if (arg === '--json') options.json = true
    else throw new Error(`Unexpected argument: ${arg}`)
  }

  if (!options.archiveDir) throw new Error('--archive-dir requires a value')
  return options
}
```

- [x] **Step 2: Add path resolution, hashing, and file description helpers**

Implement:

```js
const resolveArchivePaths = ({ archiveDir = DEFAULT_ARCHIVE_DIR, reportPath = null, collectorPath = null, evidenceDir = null, outputPath = null } = {}) => {
  const absoluteArchiveDir = path.resolve(archiveDir)
  const insideArchive = (fileName) => path.join(absoluteArchiveDir, fileName)
  return {
    archiveDir: absoluteArchiveDir,
    reportPath: reportPath ? path.resolve(reportPath) : insideArchive(DEFAULT_REPORT_NAME),
    collectorPath: collectorPath ? path.resolve(collectorPath) : insideArchive(DEFAULT_COLLECTOR_NAME),
    evidenceDir: evidenceDir ? path.resolve(evidenceDir) : insideArchive(DEFAULT_EVIDENCE_DIR_NAME),
    outputPath: outputPath ? path.resolve(outputPath) : insideArchive(DEFAULT_MANIFEST_NAME)
  }
}

const sha256 = (content) => crypto.createHash('sha256').update(content).digest('hex')
```

- [x] **Step 3: Add evidence walking with symlink rejection**

Implement recursive walking so every regular evidence file gets `{ role, file, path, bytes, sha256 }`, directories are traversed, and symlinks add:

```js
errors.push(`evidence file must not be a symlink: ${relativePath}`)
```

- [x] **Step 4: Add collector and evidence validation**

Implement validation rules:

```js
if (!conservativeWording) errors.push('collector must state that it does not prove cleanup readiness')
if (!avoidsPassShortcut) errors.push('collector must not include --status pass')
if (validationText && !validationText.includes('Report structure is valid.')) {
  errors.push('report-structure-validation.txt must show pending report validation succeeded')
}
if (commandNotes && commandNotes.includes('--status pass')) {
  errors.push('update-report-commands.md must not include --status pass')
}
```

For every `REQUIRED_CHECKS` item, require the generated manual checklist to include the check id in backticks.

- [x] **Step 5: Build the manifest object**

Return a manifest shaped like:

```js
const manifest = {
  generatedAt: now().toISOString(),
  ok: false,
  cleanupReady: false,
  archive: { archiveDir: paths.archiveDir, outputPath: paths.outputPath },
  files: [reportFile, collector.file],
  collector: {
    path: paths.collectorPath,
    conservativeWording: collector.conservativeWording,
    avoidsPassShortcut: collector.avoidsPassShortcut
  },
  evidence: {
    evidenceDir: paths.evidenceDir,
    requiredFiles: evidenceValidation.requiredFiles,
    requiredFilesPresent: evidenceValidation.requiredFilesPresent,
    files: walkedEvidence.files
  },
  report: {
    path: paths.reportPath,
    schemaVersion: report?.schemaVersion || '',
    generatedAt: report?.generatedAt || '',
    source: report?.source || '',
    environment: report?.environment || {},
    scenario: report?.scenario || {},
    structuralValidation,
    readinessValidation
  },
  errors,
  warnings
}
manifest.ok = errors.length === 0
manifest.cleanupReady = Boolean(manifest.ok && readinessValidation.ok)
```

- [x] **Step 6: Run tests and verify GREEN**

Run:

```bash
node --test tests/release/plugin-cleanup-evidence-archive-manifest.test.js
```

Expected:

- PASS `11/11`.

## Task 3: Wire CLI and npm Script

**Files:**
- Modify: `package.json`
- Modify: `scripts/create-plugin-cleanup-evidence-archive-manifest.js`

- [x] **Step 1: Add the npm script**

In `package.json`, add:

```json
"create-plugin-cleanup-evidence-archive-manifest": "node scripts/create-plugin-cleanup-evidence-archive-manifest.js"
```

- [x] **Step 2: Add CLI write behavior**

Ensure `main()` writes the manifest and exits non-zero when `manifest.ok` is false:

```js
const outputPath = writeManifest({ manifest, outputPath: paths.outputPath })
console.log(`Plugin cleanup evidence archive manifest created: ${outputPath}`)
console.log(`Archive valid: ${manifest.ok ? 'yes' : 'no'}`)
console.log(`Plugin cleanup ready: ${manifest.cleanupReady ? 'yes' : 'no'}`)
if (!manifest.ok) process.exit(1)
```

- [x] **Step 3: Run command help**

Run:

```bash
npm run create-plugin-cleanup-evidence-archive-manifest -- --help
```

Expected:

- usage includes `--archive-dir`, `--report`, `--collector`, `--evidence-dir`, `--output`, and `--json`;
- command exits `0`.

## Task 4: Update Phase and Live Documentation

**Files:**
- Create: `docs/superpowers/specs/2026-06-18-plugin-cleanup-evidence-archive-phase89-design.md`
- Create: `docs/phases/phase-89-plugin-cleanup-evidence-archive.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-review-todo-design.md`

- [x] **Step 1: Record design decisions**

Document these decisions exactly:

- archive validity is not cleanup readiness;
- collectors with `--status pass` are invalid;
- recursive evidence hashing supports nested evidence while symlink rejection avoids path-escape ambiguity.

- [x] **Step 2: Update current facts and commands**

Update docs to include:

```bash
npm run create-plugin-cleanup-evidence-archive-manifest -- --archive-dir docs/release-evidence/plugin-cleanup-evidence/<session>
```

Update the Node test count after full verification. Expected for this phase:

```bash
npm test                     # 644/644 Node tests
```

- [x] **Step 3: Preserve support boundaries**

Every doc that mentions Phase 89 must keep this claim:

```text
Archive manifests preserve and validate evidence archives; they do not change runtime cleanup behavior and do not prove cleanup readiness unless the underlying structured report passes strict readiness validation.
```

## Task 5: Review, Verify, and Commit

**Files:**
- Create: `docs/reviews/phase-89-plugin-cleanup-evidence-archive-review.md`

- [x] **Step 1: Run production review context collection**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Expected:

- scope includes Phase 89 script, tests, package script, and docs;
- review mode is `deep`.

- [x] **Step 2: Run verification**

Run:

```bash
node --test tests/release/plugin-cleanup-evidence-archive-manifest.test.js
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected:

- targeted Phase 89 tests pass `11/11`;
- `npm test` passes `644/644`;
- Control Center Playwright baseline passes `10/10`;
- TypeScript, syntax, diff whitespace, and `project-context.json` parse checks pass.

- [x] **Step 3: Write the review document**

Record:

- severe issues: none open, or list exact blockers if found;
- quality score;
- pass status;
- all verification command results;
- future packaged cleanup evidence collection remains out of scope.

- [x] **Step 4: Commit atomically**

Run:

```bash
git add package.json scripts/create-plugin-cleanup-evidence-archive-manifest.js tests/release/plugin-cleanup-evidence-archive-manifest.test.js docs/phases/phase-89-plugin-cleanup-evidence-archive.md docs/reviews/phase-89-plugin-cleanup-evidence-archive-review.md docs/superpowers/specs/2026-06-18-plugin-cleanup-evidence-archive-phase89-design.md docs/superpowers/plans/2026-06-18-plugin-cleanup-evidence-archive-phase89.md docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/project-context.json docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md README.md README.zh-CN.md
git commit -m "feat(阶段89): add plugin cleanup evidence archive manifest"
```

## Self-Review Checklist

- [x] Spec coverage: all acceptance criteria map to tests, implementation, and docs.
- [x] Placeholder scan: no `TBD`, `TODO`, `implement later`, or unspecified validation steps remain.
- [x] Type consistency: exported names in tests match the script module exports.
- [x] Boundary wording: no doc claims universal process-tree cleanup guarantees.
- [x] Readiness separation: `ok` and `cleanupReady` are separate manifest fields.
