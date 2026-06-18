# Community Intake To Submission Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a maintainer-safe bridge from a compatible Phase 100 community-source intake archive into the Phase 99 community-source submission evidence command.

**Architecture:** Keep Phase 100 intake and Phase 99 submission evidence as separate source-of-truth artifacts, then add a small CLI that reads a completed intake summary and reuses the existing Phase 99 command only when the intake status is `ready-for-community-evidence`. The bridge must reject incompatible Phase 102-style candidate archives so maintainers cannot accidentally turn adjacent ecosystem evidence into a submission-evidence claim.

**Tech Stack:** Node CommonJS scripts, existing plugin evidence CLIs, Node native test runner, markdown/json release evidence docs, production-code-quality-review checkpoint.

---

## File Map

- Create: `scripts/create-plugin-community-source-evidence-from-intake.js`
  Purpose: parse a Phase 100 intake summary, enforce compatibility readiness, and call `createPluginCommunitySourceSubmissionEvidence()` with preserved archive/source metadata plus maintainer review inputs.
- Modify: `package.json`
  Purpose: add `create-plugin-community-source-evidence-from-intake` npm script.
- Create: `tests/scripts/create-plugin-community-source-evidence-from-intake.test.js`
  Purpose: cover argument parsing, ready-intake bridging, incompatible-intake rejection, and stale/invalid intake metadata rejection.
- Create: `docs/phases/phase-103-plugin-community-intake-submission-bridge.md`
  Purpose: record scope, decisions, implementation, validation, and remaining limits.
- Create: `docs/reviews/phase-103-plugin-community-intake-submission-bridge-review.md`
  Purpose: record production checkpoint review, quality score, pass status, and follow-ups.
- Modify: `docs/HANDOFF.md`
  Purpose: add the new bridge command to current handoff commands and next-step guidance.
- Modify: `docs/development-summary.md`
  Purpose: add Phase 103 completion summary and update next-step wording.
- Modify: `docs/project-status-review.md`
  Purpose: make current status mention the bridge while keeping compatible live third-party evidence as a remaining gap.
- Modify: `docs/project-context.json`
  Purpose: update machine-readable facts for the plugin evidence chain.
- Modify: `docs/productization-v1.1-todo-design.md`
  Purpose: add Phase 103 to priority order and execution sequence.
- Modify: `docs/project-review-todo-design.md`
  Purpose: add Phase 103 to the consolidated review/TODO table.

## Task 1: Write failing bridge tests

**Files:**
- Create: `tests/scripts/create-plugin-community-source-evidence-from-intake.test.js`

- [ ] **Step 1: Add test helpers**

Create helper functions that:

```js
const createReadyIntakeSummary = ({ rootDir, archiveUrl = 'https://example.test/community-plugin/archive.zip' } = {}) => {
  const outputDir = path.join(rootDir, 'intake')
  fs.mkdirSync(outputDir, { recursive: true })
  const summary = {
    generatedAt: '2026-06-18T23:40:00.000Z',
    outputDir,
    communitySource: {
      kind: 'community-source',
      url: 'https://example.test/community/submission/42',
      submitter: 'Example Community Author'
    },
    archive: {
      kind: 'https-archive',
      archiveUrl,
      finalUrl: archiveUrl,
      archiveSha256: 'a'.repeat(64),
      archiveByteSize: 1234,
      pluginPath: 'plugin',
      archivePluginPath: 'community-plugin-main/plugin',
      extractedFileHashes: {
        'plugin.json': 'b'.repeat(64)
      }
    },
    plugin: {
      id: 'openpet.example.weather-status',
      name: 'Weather Status',
      version: '1.0.0',
      permissions: [],
      networkAllowlist: []
    },
    compatibility: {
      ok: true,
      reasonCode: 'openpet-plugin-package',
      summary: 'Candidate archive contains a valid OpenPet plugin package rooted by plugin.json.'
    },
    status: 'ready-for-community-evidence',
    notes: 'Candidate source inspected.',
    files: {}
  }
  const summaryPath = path.join(outputDir, 'plugin-community-source-intake-report-summary.json')
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
  return { summary, summaryPath }
}
```

Also add an incompatible helper by changing `status` to `incompatible-package-model`, `compatibility.ok` to `false`, `compatibility.reasonCode` to `plugin-json-missing`, and `plugin` to `null`.

- [ ] **Step 2: Cover CLI parsing**

Add:

```js
test('parseArgs accepts intake bridge options', () => {
  const options = parseArgs([
    '--intake-summary', 'docs/release-evidence/plugin-community-source-intake-report/session/plugin-community-source-intake-report-summary.json',
    '--source-relation', 'independent-third-party',
    '--independence-notes', 'Repository is maintained outside OpenPet.',
    '--output-dir', 'docs/release-evidence/plugin-community-source-submission-evidence/session',
    '--reviewer', 'OpenPet Maintainer',
    '--decision', 'approved',
    '--notes', 'Community source reviewed.',
    '--json'
  ])

  assert.equal(options.intakeSummary, 'docs/release-evidence/plugin-community-source-intake-report/session/plugin-community-source-intake-report-summary.json')
  assert.equal(options.sourceRelation, 'independent-third-party')
  assert.equal(options.independenceNotes, 'Repository is maintained outside OpenPet.')
  assert.equal(options.outputDir, 'docs/release-evidence/plugin-community-source-submission-evidence/session')
  assert.equal(options.reviewer, 'OpenPet Maintainer')
  assert.equal(options.decision, 'approved')
  assert.equal(options.notes, 'Community source reviewed.')
  assert.equal(options.json, true)
})
```

- [ ] **Step 3: Cover ready intake bridging**

Add:

```js
test('createPluginCommunitySourceEvidenceFromIntake routes ready intake into submission evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-intake-bridge-ready-'))
  const { summary: intake, summaryPath } = createReadyIntakeSummary({ rootDir: root })
  const outputDir = path.join(root, 'submission')
  const calls = []

  const result = await createPluginCommunitySourceEvidenceFromIntake({
    intakeSummary: summaryPath,
    sourceRelation: 'independent-third-party',
    independenceNotes: 'Repository is maintained outside OpenPet.',
    outputDir,
    reviewer: 'OpenPet Maintainer',
    decision: 'approved',
    notes: 'Community source reviewed.',
    createSubmissionEvidence: async (options) => {
      calls.push(options)
      return {
        outputDir,
        communityEvidenceReady: true,
        files: {
          summary: path.join(outputDir, 'plugin-community-source-submission-evidence-summary.json')
        }
      }
    }
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].archiveUrl, intake.archive.archiveUrl)
  assert.equal(calls[0].pluginPath, intake.archive.pluginPath)
  assert.equal(calls[0].communitySourceUrl, intake.communitySource.url)
  assert.equal(calls[0].submitter, intake.communitySource.submitter)
  assert.equal(calls[0].sourceRelation, 'independent-third-party')
  assert.equal(result.bridge.intakeSummary, summaryPath)
  assert.equal(result.bridge.intakeStatus, 'ready-for-community-evidence')
  assert.equal(result.submission.communityEvidenceReady, true)
})
```

- [ ] **Step 4: Cover incompatible intake rejection**

Add:

```js
test('createPluginCommunitySourceEvidenceFromIntake rejects incompatible intake summaries', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-intake-bridge-incompatible-'))
  const { summaryPath } = createIncompatibleIntakeSummary({ rootDir: root })

  await assert.rejects(
    () => createPluginCommunitySourceEvidenceFromIntake({
      intakeSummary: summaryPath,
      sourceRelation: 'independent-third-party',
      independenceNotes: 'Repository is maintained outside OpenPet.'
    }),
    /Intake summary is not ready for community evidence/
  )
})
```

- [ ] **Step 5: Cover stale or incomplete intake metadata rejection**

Add:

```js
test('createPluginCommunitySourceEvidenceFromIntake rejects ready status without compatible metadata', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-intake-bridge-stale-'))
  const { summary, summaryPath } = createReadyIntakeSummary({ rootDir: root })
  summary.compatibility.ok = false
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)

  await assert.rejects(
    () => createPluginCommunitySourceEvidenceFromIntake({
      intakeSummary: summaryPath,
      sourceRelation: 'independent-third-party',
      independenceNotes: 'Repository is maintained outside OpenPet.'
    }),
    /Intake summary compatibility metadata is inconsistent/
  )
})
```

- [ ] **Step 6: Run tests to verify RED**

Run:

```bash
node --test tests/scripts/create-plugin-community-source-evidence-from-intake.test.js
```

Expected:

- FAIL with `Cannot find module '../../scripts/create-plugin-community-source-evidence-from-intake'`.

## Task 2: Implement the intake bridge CLI

**Files:**
- Create: `scripts/create-plugin-community-source-evidence-from-intake.js`
- Modify: `package.json`

- [ ] **Step 1: Add the npm script**

In `package.json`, add:

```json
"create-plugin-community-source-evidence-from-intake": "node scripts/create-plugin-community-source-evidence-from-intake.js"
```

Place it near the existing community-source scripts.

- [ ] **Step 2: Implement parsing and intake loading**

Create `scripts/create-plugin-community-source-evidence-from-intake.js` with CommonJS exports:

```js
const fs = require('fs')
const path = require('path')

const {
  VALID_SOURCE_RELATIONS,
  createPluginCommunitySourceSubmissionEvidence
} = require('./create-plugin-community-source-submission-evidence')

const usage = () => [
  'Usage: node scripts/create-plugin-community-source-evidence-from-intake.js --intake-summary <summary.json> --source-relation <relation> --independence-notes <text> [options]',
  '',
  'Options:',
  '  --intake-summary <summary.json>      Phase 100 intake summary JSON to promote',
  '  --source-relation <relation>         independent-third-party, external-community, or unknown',
  '  --independence-notes <text>          Maintainer notes about source independence and provenance limits',
  '  --output-dir <dir>                   Directory for Phase 99 evidence artifacts',
  '  --reviewer <name>                    Maintainer or reviewer name',
  '  --decision <approved|changes-requested>',
  '  --notes <text>                       Review notes recorded by the maintainer',
  '  --json                               Print the machine-readable bridge summary',
  '  --help',
  '',
  'Promotes only ready Phase 100 community-source intake summaries into the',
  'Phase 99 submission evidence flow. Incompatible intake archives are rejected.'
].join('\n')

const readValue = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const parseArgs = (argv) => {
  const options = {
    intakeSummary: '',
    sourceRelation: 'unknown',
    independenceNotes: '',
    outputDir: '',
    reviewer: 'OpenPet Maintainer',
    decision: 'approved',
    notes: 'Community source intake reviewed and routed into submission evidence.',
    json: false,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--intake-summary') {
      options.intakeSummary = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--source-relation') {
      options.sourceRelation = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--independence-notes') {
      options.independenceNotes = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--reviewer') {
      options.reviewer = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--decision') {
      options.decision = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--notes') {
      options.notes = readValue(argv, index, arg)
      index += 1
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (options.sourceRelation && !VALID_SOURCE_RELATIONS.has(options.sourceRelation)) {
    throw new Error(`Unknown source relation: ${options.sourceRelation}`)
  }
  return options
}
```

- [ ] **Step 3: Implement readiness validation and delegation**

Add:

```js
const hasText = (value) => typeof value === 'string' && value.trim().length > 0

const readJson = (filePath, fsImpl = fs) => {
  try {
    return JSON.parse(fsImpl.readFileSync(filePath, 'utf-8'))
  } catch (error) {
    throw new Error(`Unable to read intake summary JSON: ${error.message}`)
  }
}

const assertReadyIntake = (summary) => {
  if (!summary || typeof summary !== 'object') throw new Error('Intake summary must be an object')
  if (summary.status !== 'ready-for-community-evidence') {
    throw new Error(`Intake summary is not ready for community evidence: ${summary.status || 'unknown'}`)
  }
  if (!summary.compatibility || summary.compatibility.ok !== true || summary.compatibility.reasonCode !== 'openpet-plugin-package') {
    throw new Error('Intake summary compatibility metadata is inconsistent with ready status')
  }
  if (!summary.plugin || !hasText(summary.plugin.id)) {
    throw new Error('Intake summary is missing compatible plugin metadata')
  }
  if (!summary.archive || !hasText(summary.archive.archiveUrl) || !hasText(summary.archive.pluginPath)) {
    throw new Error('Intake summary is missing archive URL or plugin path')
  }
  if (!summary.communitySource || !hasText(summary.communitySource.url) || !hasText(summary.communitySource.submitter)) {
    throw new Error('Intake summary is missing community source metadata')
  }
}

const createPluginCommunitySourceEvidenceFromIntake = async ({
  intakeSummary,
  sourceRelation = 'unknown',
  independenceNotes,
  outputDir = '',
  reviewer = 'OpenPet Maintainer',
  decision = 'approved',
  notes = 'Community source intake reviewed and routed into submission evidence.',
  fsImpl = fs,
  createSubmissionEvidence = createPluginCommunitySourceSubmissionEvidence
} = {}) => {
  if (!hasText(intakeSummary)) throw new Error('Intake summary is required')
  if (!hasText(independenceNotes)) throw new Error('Independence notes are required')
  if (!VALID_SOURCE_RELATIONS.has(sourceRelation)) throw new Error(`Unknown source relation: ${sourceRelation}`)

  const absoluteIntakeSummary = path.resolve(intakeSummary)
  const intake = readJson(absoluteIntakeSummary, fsImpl)
  assertReadyIntake(intake)

  const submission = await createSubmissionEvidence({
    archiveUrl: intake.archive.archiveUrl,
    pluginPath: intake.archive.pluginPath,
    communitySourceUrl: intake.communitySource.url,
    submitter: intake.communitySource.submitter,
    sourceRelation,
    independenceNotes,
    outputDir,
    reviewer,
    decision,
    notes
  })

  return {
    generatedAt: new Date().toISOString(),
    bridge: {
      intakeSummary: absoluteIntakeSummary,
      intakeOutputDir: intake.outputDir || '',
      intakeStatus: intake.status,
      intakeReasonCode: intake.compatibility.reasonCode,
      sourcePlugin: intake.plugin,
      sourceArchive: intake.archive,
      communitySource: intake.communitySource,
      boundaries: [
        'Only ready Phase 100 intake summaries can enter this bridge.',
        'The bridge preserves intake provenance but does not prove signing trust, catalog publication, runtime safety, or release readiness.',
        'Incompatible intake summaries remain intake evidence and must not be routed into Phase 99.'
      ]
    },
    submission
  }
}
```

- [ ] **Step 4: Add CLI main and exports**

Add:

```js
const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const result = await createPluginCommunitySourceEvidenceFromIntake(options)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    console.log(`Plugin community-source evidence created from intake: ${result.submission.outputDir}`)
    console.log(`Intake summary: ${result.bridge.intakeSummary}`)
    console.log(`Submission summary: ${result.submission.files.summary}`)
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error)
    process.exit(1)
  })
}

module.exports = {
  createPluginCommunitySourceEvidenceFromIntake,
  parseArgs
}
```

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run:

```bash
node --test tests/scripts/create-plugin-community-source-evidence-from-intake.test.js
```

Expected:

- PASS.

## Task 3: Record docs and review

**Files:**
- Create: `docs/phases/phase-103-plugin-community-intake-submission-bridge.md`
- Create: `docs/reviews/phase-103-plugin-community-intake-submission-bridge-review.md`
- Modify: live docs listed in the file map

- [ ] **Step 1: Write the phase document**

Capture:

```md
- Phase 103 adds `create-plugin-community-source-evidence-from-intake`.
- The bridge only promotes intake summaries whose status is `ready-for-community-evidence`.
- Phase 102's `incompatible-package-model` archive is intentionally rejected by the new bridge.
- This improves maintainer workflow for compatible third-party packages without fabricating a live compatible third-party source.
```

- [ ] **Step 2: Write production review**

Record checkpoint review with:

```md
Quality score: 92
Review result: 通过
Findings: No blocking issues found.
```

Mention that the main correctness risk is over-promoting incompatible intake archives, and tests cover rejection.

- [ ] **Step 3: Update live docs**

Update handoff and status docs so they say:

```md
compatible Phase 100 intake summaries can now be routed into Phase 99 through the bridge command, while incompatible adjacent ecosystem archives remain intake evidence only.
```

Do not claim:

- a compatible live independent third-party source exists;
- catalog publication is ready;
- runtime safety is proven;
- signing or release readiness changed.

## Task 4: Verify and commit

**Files:**
- All changed Phase 103 files

- [ ] **Step 1: Run verification**

Run:

```bash
node --test tests/scripts/create-plugin-community-source-evidence-from-intake.test.js
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected:

- targeted tests pass;
- all repository gates pass;
- JSON parses;
- no whitespace errors.

- [ ] **Step 2: Commit atomically**

Run:

```bash
git add scripts/create-plugin-community-source-evidence-from-intake.js tests/scripts/create-plugin-community-source-evidence-from-intake.test.js package.json docs/phases/phase-103-plugin-community-intake-submission-bridge.md docs/reviews/phase-103-plugin-community-intake-submission-bridge-review.md docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/project-context.json docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md docs/superpowers/plans/2026-06-18-community-intake-to-submission-bridge-phase103.md
git commit -m "feat(阶段103): bridge community intake to submission evidence"
```

## Self-Review Checklist

- [ ] The bridge accepts only `ready-for-community-evidence` intake summaries.
- [ ] Incompatible Phase 102-style intake summaries are rejected before calling Phase 99 tooling.
- [ ] The bridge delegates to existing Phase 99 evidence generation instead of duplicating the submission flow.
- [ ] Docs stay conservative and do not claim a compatible live third-party source exists.
- [ ] Tests cover parse, ready bridge, incompatible rejection, and inconsistent metadata rejection.

Plan complete and saved to `docs/superpowers/plans/2026-06-18-community-intake-to-submission-bridge-phase103.md`.
