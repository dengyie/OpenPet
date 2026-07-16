# Development Documentation Hardening Implementation Plan

> Status: Complete
> Completed: 2026-07-16
> Post-review correction: live documents keep independent ISO update dates;
> only canonical branch metadata is synchronized.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete OpenPet's repository-internal documentation work, align live project facts with the latest `main` baseline, close the finished production-review runbook, and make future documentation drift fail automatically.

**Architecture:** Keep the existing four-level documentation model: public entry, live maintainer truth, domain reference, and audit/evidence history. Add one task-oriented workflow guide and extend the existing documentation validator with structural, metadata, and completion-integrity checks; do not change Electron runtime code.

**Tech Stack:** Markdown, JSON, Node.js CommonJS, Node native test runner, existing `scripts/check-docs-drift.js` tooling.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/be97/OpenPet` on `codex/production-review-remediation-plan`.
- Do not switch, edit, clean, merge, or push the protected primary `main` worktree.
- Keep `docs/TODO.md` as the only active backlog.
- Keep signing, real-device, human-acceptance, real-provider, and third-party-source tasks open until genuine evidence exists.
- Do not modify Electron runtime, service, IPC, plugin, renderer, or Control Center implementation files.
- Use TDD: capture each documentation defect with a failing test before changing the corresponding document or validator behavior.
- Keep structural validator logic separate from content-truth checks and use actionable named failures.
- Canonical live-document branch metadata is `main`; temporary worktree branch names are not project facts.
- Validation grade for this change is Grade C, followed by the user-requested full regression matrix.

---

### Task 1: Restore The Canonical Development Workflow

**Files:**
- Create: `docs/development-workflow.md`
- Create: `tests/docs/live-docs-development-workflow.test.js`
- Modify: `docs/README.md`
- Modify: `docs/testing-strategy.md`

**Interfaces:**
- Consumes: current commands from `package.json`, architecture rules from `AGENTS.md`, routes from `docs/README.md`, and test ownership from `docs/testing-strategy.md`.
- Produces: one stable maintainer workflow entrypoint with Grade A/B/C validation guidance.

- [x] **Step 1: Add the failing workflow test**

Create `tests/docs/live-docs-development-workflow.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const workflowPath = path.join(repoRoot, 'docs/development-workflow.md')

test('development workflow provides the canonical maintainer path', () => {
  assert.equal(fs.existsSync(workflowPath), true, 'docs/development-workflow.md must exist')
  const workflow = fs.readFileSync(workflowPath, 'utf-8')

  assert.match(workflow, /isolated worktree/i)
  assert.match(workflow, /PetService.*single source of truth/is)
  assert.match(workflow, /Grade A[\s\S]*Grade B[\s\S]*Grade C/i)
  assert.match(workflow, /npm run check:docs-drift/)
  assert.match(workflow, /npm run test:core:all/)
  assert.match(workflow, /git diff --check/)
  assert.match(workflow, /external evidence|manual-required/i)
})
```

- [x] **Step 2: Verify the test fails**

Run:

```bash
node --test tests/docs/live-docs-development-workflow.test.js
```

Expected: FAIL with `docs/development-workflow.md must exist`.

- [x] **Step 3: Write the workflow guide**

Create `docs/development-workflow.md` with these exact sections:

```markdown
# OpenPet Development Workflow
## Prerequisites And Setup
## Protected Main And Worktree Isolation
## Architecture Entry Points
## Standard Change Workflow
## Validation Grades
### Grade A: Security, Persistence, Lifecycle, And Public Runtime
### Grade B: User-Facing Control Center And Runtime Integration
### Grade C: Tooling, Contracts, And Documentation
## Area-Specific Workflows
## Security And Data Handling
## Troubleshooting
## Merge Readiness And Handoff
## Canonical References
```

Document exact current commands from `package.json`; state that `PetService` owns pet state, Control Center owns user-facing configuration, credentials remain main-process-only, and synthetic evidence never replaces external/manual acceptance.

- [x] **Step 4: Align the documentation map and test guidance**

In `docs/README.md`, add the Level 0-3 ownership model to `Maintenance Rules` and state that `development-workflow.md` owns contributor procedure.

In `docs/testing-strategy.md`, add a `Validation Grades` section:

```text
Grade A -> focused tests + test:core:all + npm test + check:syntax + manual acceptance + diff check
Grade B -> focused tests + test:core + test:control-center + check:syntax + diff check
Grade C -> focused docs/tools tests + test:tools + check:docs-drift + diff check
```

- [x] **Step 5: Verify and commit**

```bash
node --test tests/docs/live-docs-development-workflow.test.js
npm run check:docs-drift
git add docs/development-workflow.md docs/README.md docs/testing-strategy.md tests/docs/live-docs-development-workflow.test.js
git commit -m "docs: add canonical development workflow"
```

Expected: tests and drift check pass before commit.

---

### Task 2: Stabilize Live Documentation Metadata

**Files:**
- Modify: `tests/docs/live-docs-project-context.test.js`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/TODO.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`

**Interfaces:**
- Consumes: canonical integration branch `main`, independently maintained
  ISO update dates, and existing Level 1 facts.
- Produces: consistent metadata independent of the editing Agent's temporary branch.

- [x] **Step 1: Change metadata tests to the stable contract**

Update `tests/docs/live-docs-project-context.test.js`:

```js
assert.match(context.updated, /^\d{4}-\d{2}-\d{2}$/)
assert.equal(context.branch, 'main')
```

Replace hard-coded `codex/dev7` header assertions with:

```js
for (const [name, content] of liveDocs) {
  assert.match(content, /Branch:\s*`main`/i, `${name} should identify canonical main`)
  assert.doesNotMatch(content, /Branch:\s*`(?:codex\/|dev\d*\b)/i)
}
```

- [x] **Step 2: Verify stale metadata fails**

```bash
node --test tests/docs/live-docs-project-context.test.js
```

Expected: FAIL because current docs still report `2026-07-07` and `codex/dev7`.

- [x] **Step 3: Update human and machine metadata**

Set these headers in `docs/HANDOFF.md`, `docs/development-summary.md`, and `docs/project-status-review.md`:

```markdown
> Last updated: 2026-07-16
> Branch: `main`
```

Set `docs/TODO.md` to `Last updated: 2026-07-16` without closing external/manual work.

Set in `docs/project-context.json`:

```json
{
  "updated": "2026-07-16",
  "branch": "main"
}
```

Add `npm run check:docs-drift` and `git diff --check` to `validation.commands` if absent. Preserve all release paths and blocker facts.

- [x] **Step 4: Verify and commit**

```bash
node --test tests/docs/live-docs-project-context.test.js
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json', 'utf8')); console.log('project-context ok')"
npm run check:docs-drift
git add docs/HANDOFF.md docs/TODO.md docs/development-summary.md docs/project-status-review.md docs/project-context.json tests/docs/live-docs-project-context.test.js
git commit -m "docs: stabilize live project metadata"
```

Expected: focused test and docs checks pass; JSON command prints `project-context ok`.

---

### Task 3: Close The Production Review Execution Record

**Files:**
- Create: `tests/docs/production-review-remediation-status.test.js`
- Modify: `docs/superpowers/plans/2026-07-12-production-review-remediation.md`

**Interfaces:**
- Consumes: ten landed workstream commits and the DNS lifecycle follow-up.
- Produces: a completed execution record with no open checkbox and a commit evidence ledger.

- [x] **Step 1: Verify commit reachability**

```bash
for commit in \
  6d818b37 57c65f4a eccea6c6 a2658943 066393ec \
  69d72c13 7b22aadd fc935ab2 871941d4 cb3992bb 0792de6c; do
  git merge-base --is-ancestor "$commit" HEAD || exit 1
done
```

Expected: exit code 0.

- [x] **Step 2: Add the failing completion test**

Create `tests/docs/production-review-remediation-status.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const plan = fs.readFileSync(
  path.resolve(__dirname, '../../docs/superpowers/plans/2026-07-12-production-review-remediation.md'),
  'utf-8'
)

test('production review remediation is a closed execution record', () => {
  assert.match(plan, /Status:\s*Complete/i)
  assert.doesNotMatch(plan, /^\s*- \[ \]/m)
  assert.match(plan, /## Completion Evidence/)

  for (const commit of [
    '6d818b37', '57c65f4a', 'eccea6c6', 'a2658943', '066393ec',
    '69d72c13', '7b22aadd', 'fc935ab2', '871941d4', 'cb3992bb', '0792de6c'
  ]) {
    assert.match(plan, new RegExp(`\\b${commit}\\b`), `missing completion evidence ${commit}`)
  }
})
```

- [x] **Step 3: Verify the stale runbook fails**

```bash
node --test tests/docs/production-review-remediation-status.test.js
```

Expected: FAIL because status, ledger, and closed checkboxes are absent.

- [x] **Step 4: Close Tasks 1-10 and add evidence**

Add below the title:

```markdown
> Status: Complete
> Completed: 2026-07-16
```

Change every Task 1-10 execution checkbox to `[x]`. Preserve acceptance criteria, prohibited shortcuts, regression matrix, and rollback guidance.

Add before `Integration Order`:

```markdown
## Completion Evidence

| Task | Evidence commit |
| --- | --- |
| 1. Secret storage | `6d818b37` |
| 2. Settings durability | `57c65f4a` |
| 3. AI Talk queue ordering | `eccea6c6` |
| 4. Streaming throughput | `a2658943` |
| 5. Cursor lifecycle | `066393ec` |
| 6. Plugin transactions | `69d72c13` |
| 7. DNS pinning | `7b22aadd`; lifecycle follow-up `0792de6c` |
| 8. Async draft protection | `fc935ab2` |
| 9. Agent Awareness idempotency | `871941d4` |
| 10. Dead IPC removal | `cb3992bb` |
```

- [x] **Step 5: Verify and commit**

```bash
node --test tests/docs/production-review-remediation-status.test.js
git add docs/superpowers/plans/2026-07-12-production-review-remediation.md tests/docs/production-review-remediation-status.test.js
git commit -m "docs: close production remediation runbook"
```

Expected: focused test passes.

---

### Task 4: Harden Documentation Drift Validation

**Files:**
- Modify: `scripts/check-docs-drift.js`
- Modify: `tests/scripts/check-docs-drift.test.js`

**Interfaces:**
- Consumes: Level 1 documents and the active remediation record.
- Produces: deterministic `checkDocsDrift({ docsRoot })` results for missing files, metadata drift, and reopened work.

- [x] **Step 1: Add failing validator tests**

Add to `tests/scripts/check-docs-drift.test.js`:

```js
test('checkDocsDrift requires the development workflow', () => {
  const docsRoot = createDocsFixture()
  fs.rmSync(path.join(docsRoot, 'development-workflow.md'))

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.deepEqual(result.errors, ['Missing live doc: development-workflow.md'])
})

test('checkDocsDrift rejects temporary live branch metadata', () => {
  const docsRoot = createDocsFixture()
  const handoffPath = path.join(docsRoot, 'HANDOFF.md')
  fs.writeFileSync(
    handoffPath,
    fs.readFileSync(handoffPath, 'utf-8').replace('Branch: `main`', 'Branch: `codex/dev7`')
  )

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /canonical main branch metadata/i)
})

test('checkDocsDrift rejects a reopened production remediation step', () => {
  const docsRoot = createDocsFixture()
  const planPath = path.join(
    docsRoot,
    'superpowers/plans/2026-07-12-production-review-remediation.md'
  )
  fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf-8').replace('- [x]', '- [ ]'))

  const result = checkDocsDrift({ docsRoot })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /production remediation.*complete/i)
})
```

- [x] **Step 2: Verify protections are missing**

```bash
node --test tests/scripts/check-docs-drift.test.js
```

Expected: FAIL because workflow/plan inventory and metadata/completion checks are absent.

- [x] **Step 3: Extend the inventory and inputs**

Add to `LIVE_DOC_FILES`:

```js
'development-workflow.md',
'superpowers/plans/2026-07-12-production-review-remediation.md',
```

Read both files in `createChecks()`; include the workflow in combined live text and keep the plan separate for completion validation.

- [x] **Step 4: Add non-overlapping checks**

Parse `project-context.json` once:

```js
const context = JSON.parse(projectContext)
```

Replace the narrow `no-codex-dev-branch-metadata` check with:

```js
{
  id: 'live-docs-use-canonical-main-metadata',
  description: 'Live docs should identify main as the canonical integration branch.',
  run: () =>
    context.branch === 'main' &&
    [handoff, developmentSummary, projectStatusReview].every((doc) =>
      /Branch:\s*`main`/i.test(doc)
    ),
  failure: 'Live docs no longer agree on canonical main branch metadata.'
}
```

Add:

```js
{
  id: 'production-remediation-remains-complete',
  description: 'The production remediation runbook should remain a closed execution record.',
  run: () =>
    /Status:\s*Complete/i.test(productionRemediation) &&
    !/^\s*- \[ \]/m.test(productionRemediation) &&
    /## Completion Evidence/.test(productionRemediation),
  failure: 'The production remediation execution record is no longer complete.'
}
```

- [x] **Step 5: Verify and commit**

```bash
node --test tests/scripts/check-docs-drift.test.js tests/docs/*.test.js
npm run check:docs-drift
git add scripts/check-docs-drift.js tests/scripts/check-docs-drift.test.js
git commit -m "test(docs): enforce live documentation integrity"
```

Expected: all focused tests and drift checks pass.

---

### Task 5: Run Full Regression And Final Documentation Audit

**Files:**
- Verify only; modify a touched documentation or test file only if a check exposes a real defect.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: clean, reviewable, fully verified branch state.

- [x] **Step 1: Confirm scope**

```bash
git diff --name-only main...HEAD
git status --short --branch
```

Expected: only documentation, `scripts/check-docs-drift.js`, and documentation test files are listed; worktree is clean after task commits.

- [x] **Step 2: Run docs and tooling verification**

```bash
npm run check:docs-drift
npm run test:tools
```

Expected: all checks and tests pass.

- [x] **Step 3: Run full Node and Control Center regression**

```bash
npm test
npm run test:control-center
```

Expected: all Node and Playwright tests pass.

- [x] **Step 4: Run syntax/build and whitespace verification**

```bash
npm run check:syntax
git diff --check main...HEAD
```

Expected: syntax, TypeScript, native helper, Control Center build, and diff checks pass.

- [x] **Step 5: Verify isolation**

```bash
git branch --show-current
git status --short --branch
git log --oneline --decorate -8
git -C /Users/mango/project/codex/OpenPet branch --show-current
git -C /Users/mango/project/codex/OpenPet status --short --branch
```

Expected: feature worktree remains clean on `codex/production-review-remediation-plan`; primary worktree remains on `main` and unmodified by this work.

- [x] **Step 6: Report completion**

Report commit hashes, changed files, documentation levels, validation grades, completion evidence, exact test results, intentionally open external tasks, and confirmation that no runtime source or protected primary worktree was modified.
