# Windows Smoke Archive Gate Phase 81 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make reviewed Windows smoke archive manifests part of the release-level archive and signed closure gate so Windows release claims depend on archived reviewed evidence, not only on a standalone report.

**Architecture:** Extend the existing release evidence archive validator and signed closure report instead of inventing a new Windows-specific workflow. Reuse the reviewed Windows smoke archive manifest that already exists, add it as a first-class release archive input, propagate the new archive section through shared contracts, and update tests/docs to keep release wording honest.

**Tech Stack:** Node CommonJS scripts, shared TypeScript contracts, Node native tests, Markdown phase/review docs.

---

## File Structure

- Modify: `scripts/create-release-evidence-archive-manifest.js`
  Purpose: accept and validate a reviewed Windows smoke archive manifest alongside the existing desktop picker archive manifest.
- Modify: `scripts/create-signed-release-closure-report.js`
  Purpose: block Windows readiness unless the reviewed Windows smoke archive manifest is present, matched, and release-ready.
- Modify: `src/shared/openpet-contracts.ts`
  Purpose: represent the new release-archive Windows archive section in shared contracts.
- Modify: `tests/release/release-evidence-archive-manifest.test.js`
  Purpose: prove release-level archive validation behavior for the new Windows archive gate.
- Modify: `tests/release/signed-release-closure-report.test.js`
  Purpose: prove closure-report wording blocks on the new Windows archive gate.
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
  Purpose: keep representative release manifest/closure payloads valid under `npm run typecheck`.
- Create: `docs/phases/phase-81-windows-smoke-archive-gate.md`
  Purpose: record the delivered Phase 81 scope, decisions, and evidence boundary.
- Create: `docs/reviews/phase-81-windows-smoke-archive-gate-review.md`
  Purpose: record the production code quality review result for this phase.
- Modify: `docs/desktop-release-design.md`
  Purpose: describe the new Windows archive gate in the release evidence model.
- Modify: `docs/release-checklist.md`
  Purpose: tell operators to include reviewed Windows smoke archive manifests in release-level archives.
- Modify: `docs/productization-v1.1-todo-design.md`
  Purpose: add Phase 81 scope/status and keep the productization record current.
- Modify: `docs/development-summary.md`
  Purpose: refresh current capability summary if Phase 81 changes live release evidence facts.
- Modify: `docs/project-status-review.md`
  Purpose: reflect the stronger Windows archive gate in the current status snapshot.
- Modify: `docs/HANDOFF.md`
  Purpose: update the next-step/release-boundary handoff text.
- Modify: `docs/project-context.json`
  Purpose: keep machine-readable current facts aligned.

## Task 1: Add release-level Windows archive manifest validation

**Files:**
- Modify: `tests/release/release-evidence-archive-manifest.test.js`
- Modify: `scripts/create-release-evidence-archive-manifest.js`

- [x] **Step 1: Write failing tests for Windows archive manifest inputs and mismatch detection**

Add tests to `tests/release/release-evidence-archive-manifest.test.js` covering:

```js
test('parseArgs accepts windows smoke archive manifest inputs', () => {
  const options = parseArgs([
    '--archive-dir', 'archive',
    '--windows-smoke-report', 'archive/windows.json',
    '--windows-smoke-archive-manifest', 'archive/windows-archive.json'
  ])

  assert.equal(options.windowsSmokeArchiveManifestPath, 'archive/windows-archive.json')
})

test('resolveArchivePaths defaults to the Windows smoke archive manifest path', () => {
  const paths = resolveArchivePaths({ archiveDir: 'archive' })

  assert.equal(paths.windowsSmokeArchiveManifestPath, path.resolve('archive/windows-smoke-archive-manifest.json'))
})

test('createReleaseEvidenceArchiveManifest requires a Windows smoke archive manifest', () => {
  const archiveDir = createArchive({ signed: true, status: 'pass', includeWindowsSmokeArchiveManifest: false })

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.releaseReady, false)
  assert.match(manifest.errors.join('\\n'), /missing windowsSmokeArchiveManifest/)
})

test('createReleaseEvidenceArchiveManifest rejects Windows archive manifests for a different Windows report', () => {
  const archiveDir = createArchive({ signed: true, status: 'pass', tamperWindowsArchiveReportPath: true })

  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })

  assert.equal(manifest.ok, false)
  assert.equal(manifest.releaseReady, false)
  assert.equal(manifest.archives.windowsSmoke.matchesReport, false)
  assert.match(manifest.errors.join('\\n'), /windowsSmokeArchiveManifest references a different Windows smoke report/)
})
```

- [x] **Step 2: Run the release archive tests to verify they fail**

Run:

```bash
node --test tests/release/release-evidence-archive-manifest.test.js
```

Expected:

- FAIL because `parseArgs` and `resolveArchivePaths` do not know `windowsSmokeArchiveManifestPath`;
- FAIL because the release manifest does not yet validate or expose a Windows archive section.

- [x] **Step 3: Implement Windows archive manifest validation in the release archive CLI**

Update `scripts/create-release-evidence-archive-manifest.js` to:

```js
const DEFAULT_WINDOWS_SMOKE_ARCHIVE_MANIFEST = 'windows-smoke-archive-manifest.json'
```

Add parsing/resolution support:

```js
} else if (arg === '--windows-smoke-archive-manifest') {
  options.windowsSmokeArchiveManifestPath = readValue(index, arg)
  index += 1
}
```

and:

```js
windowsSmokeArchiveManifestPath: windowsSmokeArchiveManifestPath
  ? path.resolve(windowsSmokeArchiveManifestPath)
  : insideArchive(DEFAULT_WINDOWS_SMOKE_ARCHIVE_MANIFEST),
```

Add a generalized linked-archive validator so both archive types reuse one path:

```js
const validateLinkedArchiveManifestFile = ({
  role,
  filePath,
  reportFile,
  reportRoleLabel,
  requireSigned,
  fsImpl = fs
}) => {
  // validate file exists, parse JSON, compare report path/hash,
  // expose ok/releaseReady/reportPath/reportSha256/summaryPath/matchesReport/errors/warnings
}
```

Wire it into `createReleaseEvidenceArchiveManifest`:

```js
const archives = {
  windowsSmoke: validateLinkedArchiveManifestFile({
    role: 'windowsSmokeArchiveManifest',
    filePath: paths.windowsSmokeArchiveManifestPath,
    reportFile: reports.windowsSmoke.file,
    reportRoleLabel: 'Windows smoke report',
    requireSigned,
    fsImpl
  }),
  desktopPicker: validateLinkedArchiveManifestFile({
    role: 'desktopPickerArchiveManifest',
    filePath: paths.desktopPickerArchiveManifestPath,
    reportFile: reports.desktopPicker.file,
    reportRoleLabel: 'desktop picker report',
    requireSigned,
    fsImpl
  })
}
```

Ensure `files` and `archives` include the new Windows archive section and that `archivesReady` now depends on both entries.

- [x] **Step 4: Run the release archive tests to verify they pass**

Run:

```bash
node --test tests/release/release-evidence-archive-manifest.test.js
```

Expected:

- PASS with coverage for the new Windows archive gate.

## Task 2: Propagate the Windows archive gate into signed closure reports

**Files:**
- Modify: `tests/release/signed-release-closure-report.test.js`
- Modify: `scripts/create-signed-release-closure-report.js`

- [x] **Step 1: Write failing closure tests for the Windows archive gate**

Add tests to `tests/release/signed-release-closure-report.test.js`:

```js
test('closure report requires the Windows smoke archive manifest evidence chain', () => {
  const archiveDir = createArchive({
    signed: true,
    status: 'pass',
    tamperWindowsArchiveReportPath: true
  })
  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })
  const report = createSignedReleaseClosureReport({ manifest, now: fixedNow })

  assert.equal(report.claims.windows.status, 'not-ready')
  assert.match(report.claims.windows.blockers.join('\\n'), /windowsSmokeArchiveManifest references a different Windows smoke report/)
  assert.equal(report.releaseReady, false)
})

test('closure report keeps official desktop not-ready when Windows archive evidence is missing', () => {
  const archiveDir = createArchive({
    signed: true,
    status: 'pass',
    includeWindowsSmokeArchiveManifest: false
  })
  const manifest = createReleaseEvidenceArchiveManifest({ archiveDir, requireSigned: true, now: fixedNow })
  const report = createSignedReleaseClosureReport({ manifest, now: fixedNow })

  assert.equal(report.claims.windows.status, 'not-ready')
  assert.match(report.claims.windows.blockers.join('\\n'), /Windows smoke archive evidence is missing/)
})
```

- [x] **Step 2: Run the closure tests to verify they fail**

Run:

```bash
node --test tests/release/signed-release-closure-report.test.js
```

Expected:

- FAIL because closure logic does not yet read `archives.windowsSmoke`.

- [x] **Step 3: Implement Windows archive blockers in the closure report**

Update `scripts/create-signed-release-closure-report.js` so the Windows claim includes:

```js
const windowsSmokeArchive = manifest.archives?.windowsSmoke
```

and:

```js
...archiveBlockers({
  label: 'Windows smoke archive evidence',
  section: windowsSmokeArchive
}),
```

Ensure the report treats the archive gate as required for:

- `claims.windows`;
- `claims.officialDesktopRelease`;
- `nextActions` wording when Windows archive evidence is missing or not ready.

- [x] **Step 4: Run the closure tests to verify they pass**

Run:

```bash
node --test tests/release/signed-release-closure-report.test.js
```

Expected:

- PASS with the new Windows archive blocker path covered.

## Task 3: Extend shared contracts and representative fixtures

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`

- [x] **Step 1: Write the failing type fixture update**

Update `tests/shared/openpet-contracts-type-fixture.ts` so `releaseArchiveManifestFixture` includes:

```ts
archives: {
  releaseReady: false,
  windowsSmoke: {
    file: {
      role: 'windowsSmokeArchiveManifest',
      path: '/tmp/openpet-release-evidence/windows-smoke-archive-manifest.json',
      exists: true,
      bytes: 1024,
      sha256: '3'.repeat(64)
    },
    path: '/tmp/openpet-release-evidence/windows-smoke-archive-manifest.json',
    archiveDir: '/tmp/openpet-release-evidence',
    outputPath: '/tmp/openpet-release-evidence/windows-smoke-archive-manifest.json',
    ok: true,
    releaseReady: false,
    reportPath: '/tmp/openpet-release-evidence/windows-smoke-report.json',
    reportSha256: releaseArchiveReportSectionFixture.file.sha256,
    summaryPath: '/tmp/openpet-release-evidence/windows-smoke-evidence-summary.md',
    matchesReport: true,
    errors: [],
    warnings: ['windowsSmokeArchiveManifest is archived but not release-ready']
  },
  desktopPicker: { ... }
}
```

- [x] **Step 2: Run typecheck to verify it fails before the contract change**

Run:

```bash
npm run typecheck
```

Expected:

- FAIL because `ReleaseEvidenceArchiveManifest['archives']` does not yet include `windowsSmoke` and may still require the old archive match field shape.

- [x] **Step 3: Update shared contracts minimally**

Update `src/shared/openpet-contracts.ts` so linked archive sections support both release-level archives:

```ts
export interface ReleaseEvidenceLinkedArchiveSection {
  file: ReleaseEvidenceArchiveFile
  path: string
  archiveDir: string
  outputPath: string
  ok: boolean
  releaseReady: boolean
  reportPath: string
  reportSha256: string
  summaryPath: string
  matchesReport: boolean
  errors: string[]
  warnings: string[]
}
```

and:

```ts
archives: {
  releaseReady: boolean
  windowsSmoke: ReleaseEvidenceLinkedArchiveSection
  desktopPicker: ReleaseEvidenceLinkedArchiveSection
}
```

Update fixtures accordingly.

- [x] **Step 4: Run typecheck to verify the shared contract passes**

Run:

```bash
npm run typecheck
```

Expected:

- PASS with the new release evidence archive shape covered by the fixture.

## Task 4: Record the phase and update live release docs

**Files:**
- Create: `docs/phases/phase-81-windows-smoke-archive-gate.md`
- Create: `docs/reviews/phase-81-windows-smoke-archive-gate-review.md`
- Modify: `docs/desktop-release-design.md`
- Modify: `docs/release-checklist.md`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/project-context.json`

- [x] **Step 1: Write the phase record**

Create `docs/phases/phase-81-windows-smoke-archive-gate.md` with:

- goal: reviewed Windows smoke archive manifests now participate in release-level evidence gating;
- scope: release archive manifest, signed closure report, contracts, tests, docs;
- decisions:
  - mirror desktop picker archive gating;
  - keep Phase 81 narrow to evidence linkage, not real Windows validation;
- verification commands used in this phase.

- [x] **Step 2: Update release docs and project status docs**

Update live docs so they say:

- reviewed Windows smoke archive manifests are now part of the release-level archive gate;
- Windows still remains not release-ready until real signed evidence is filled;
- release archives now require both:
  - `desktop-picker-archive-manifest.json`
  - `windows-smoke-archive-manifest.json`
  for full signed closure.

Also add Phase 81 to `docs/productization-v1.1-todo-design.md` with:

- goal;
- scope;
- acceptance;
- status once implemented.

- [x] **Step 3: Write the production review doc**

Create `docs/reviews/phase-81-windows-smoke-archive-gate-review.md` with:

- review setup;
- findings first;
- quality score;
- pass status;
- architecture/robustness/test assessment.

- [x] **Step 4: Run the full phase verification**

Run:

```bash
npm run check:syntax
npm test
npm run test:control-center
git diff --check
```

Expected:

- all commands pass;
- no diff whitespace errors remain.

## Task 5: Commit the phase atomically

**Files:**
- All changed Phase 81 files

- [x] **Step 1: Stage the Phase 81 files**

Run:

```bash
git add scripts/create-release-evidence-archive-manifest.js scripts/create-signed-release-closure-report.js src/shared/openpet-contracts.ts tests/release/release-evidence-archive-manifest.test.js tests/release/signed-release-closure-report.test.js tests/shared/openpet-contracts-type-fixture.ts docs/desktop-release-design.md docs/release-checklist.md docs/productization-v1.1-todo-design.md docs/development-summary.md docs/project-status-review.md docs/HANDOFF.md docs/project-context.json docs/phases/phase-81-windows-smoke-archive-gate.md docs/reviews/phase-81-windows-smoke-archive-gate-review.md docs/superpowers/specs/2026-06-18-windows-smoke-archive-gate-phase81-design.md docs/superpowers/plans/2026-06-18-windows-smoke-archive-gate-phase81.md
```

- [x] **Step 2: Commit with the phase message**

Run:

```bash
git commit -m "feat(阶段81): gate release closure on windows smoke archives"
```

- [x] **Step 3: Confirm the branch is clean**

Run:

```bash
git status --short --branch
```

Expected:

- only the current Phase 81 commit is present;
- working tree is clean.

## Self-Review

- [x] Phase 81 stays inside release evidence linkage scope and does not claim real Windows validation.
- [x] Release archive manifest now validates both desktop picker and Windows reviewed archive manifests.
- [x] Signed closure report blocks Windows readiness on missing or stale Windows archive evidence.
- [x] Shared contracts and fixtures reflect the new archive section.
- [x] Live docs stay conservative: Windows still not release-ready without real signed evidence.
