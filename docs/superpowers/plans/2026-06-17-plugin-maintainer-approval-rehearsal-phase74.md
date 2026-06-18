# Plugin Maintainer Approval Rehearsal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structured maintainer approval rehearsal record on top of the existing plugin submission bundle workflow.

**Architecture:** Keep the existing submission bundle as the authoritative author-to-reviewer handoff artifact, then layer a separate approval generator and validator beside it. Approval stays human-authored but tool-structured so OpenPet gains auditability without overstating trust or publication state.

**Tech Stack:** CommonJS Node CLI scripts, Node native test runner, existing plugin submission bundle tooling, Markdown/JSON artifact generation, production-code-quality-review workflow.

---

## File Map

- Create: `scripts/create-plugin-maintainer-approval.js`
  Purpose: generate Markdown and JSON maintainer approval artifacts from an existing submission bundle plus explicit reviewer metadata.
- Create: `scripts/validate-plugin-maintainer-approval.js`
  Purpose: validate maintainer approval artifacts against the submission bundle and optional `--require-approved` policy.
- Modify: `scripts/create-plugin-author-rehearsal.js`
  Purpose: expose the maintainer-approval next step in generated author rehearsal guidance without collapsing roles.
- Modify: `package.json`
  Purpose: expose npm scripts for approval generation and validation.
- Create: `tests/scripts/create-plugin-maintainer-approval.test.js`
  Purpose: TDD coverage for approval generation, required fields, and output structure.
- Create: `tests/scripts/validate-plugin-maintainer-approval.test.js`
  Purpose: TDD coverage for valid approval, malformed approval, mismatched source metadata, and `--require-approved`.
- Modify: `tests/scripts/create-plugin-author-rehearsal.test.js`
  Purpose: verify generated author rehearsal outputs reference the new maintainer approval step correctly.
- Create: `docs/phases/phase-74-plugin-maintainer-approval-rehearsal.md`
  Purpose: record delivered scope, verification, and remaining governance limits.
- Create: `docs/reviews/phase-74-plugin-maintainer-approval-rehearsal-review.md`
  Purpose: record production review findings and outcome.
- Modify: `docs/plugin-submission-workflow-playbook.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/plugin-ecosystem-rules.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-review-todo-design.md`
  Purpose for all live docs: describe the new maintainer approval rehearsal truth conservatively.
- Modify under: `docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/submission-bundle/`
  Purpose: archive one maintainer approval example against the existing author rehearsal bundle.

### Task 1: Write failing tests for maintainer approval generation and validation

**Files:**
- Create: `tests/scripts/create-plugin-maintainer-approval.test.js`
- Create: `tests/scripts/validate-plugin-maintainer-approval.test.js`
- Modify: `tests/scripts/create-plugin-author-rehearsal.test.js`

- [ ] **Step 1: Add a failing generation test for an approved bundle**

Create:

```js
test('createPluginMaintainerApproval writes markdown and json approval artifacts for an approved bundle', () => {
  const bundleDir = createBundle()
  const approval = createPluginMaintainerApproval({
    bundleDir,
    reviewer: 'OpenPet Maintainer',
    decision: 'approved',
    notes: 'Manifest, permissions, package hash, and submission artifacts reviewed.',
    now: () => new Date('2026-06-17T00:00:00.000Z')
  })

  assert.equal(approval.approvalReady, true)
  assert.equal(approval.plugin.id, 'openpet.example.focus-timer')
  assert.equal(fs.existsSync(approval.files.markdown), true)
  assert.equal(fs.existsSync(approval.files.json), true)
})
```

- [ ] **Step 2: Add a failing generation test for `changes-requested`**

```js
test('createPluginMaintainerApproval records changes-requested without claiming approvalReady', () => {
  const bundleDir = createBundle()
  const approval = createPluginMaintainerApproval({
    bundleDir,
    reviewer: 'OpenPet Maintainer',
    decision: 'changes-requested',
    notes: 'Need clearer justification for network hosts.'
  })

  assert.equal(approval.approvalReady, false)
  assert.equal(approval.decision, 'changes-requested')
})
```

- [ ] **Step 3: Add failing validator tests**

Create:

```js
test('validateMaintainerApproval accepts a matching approved approval record', () => {
  const bundleDir = createApprovedApprovalBundle()
  const result = validateMaintainerApproval(loadApprovalBundle({ bundleDir }), { requireApproved: true })

  assert.equal(result.ok, true)
  assert.equal(result.summary.approved, true)
})
```

```js
test('validateMaintainerApproval rejects mismatched package hash', () => {
  const bundle = loadApprovalBundle({ bundleDir: createApprovedApprovalBundle() })
  bundle.approval.package.sha256 = 'a'.repeat(64)
  const result = validateMaintainerApproval(bundle)

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /package sha256 does not match submission bundle/)
})
```

```js
test('validateMaintainerApproval rejects require-approved when decision is changes-requested', () => {
  const bundleDir = createChangesRequestedApprovalBundle()
  const result = validateMaintainerApproval(loadApprovalBundle({ bundleDir }), { requireApproved: true })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /approval is not marked approved/)
})
```

- [ ] **Step 4: Extend author rehearsal expectations with a failing next-step assertion**

Update `tests/scripts/create-plugin-author-rehearsal.test.js` to require:

```js
assert.match(readme, /create-plugin-maintainer-approval/)
assert.match(checklist, /Maintainer approval record is archived separately/)
```

- [ ] **Step 5: Run targeted tests and verify RED**

Run:

```bash
node --test tests/scripts/create-plugin-maintainer-approval.test.js tests/scripts/validate-plugin-maintainer-approval.test.js tests/scripts/create-plugin-author-rehearsal.test.js
```

Expected before implementation:

- FAIL because the new approval scripts and exports do not exist yet;
- FAIL because author rehearsal output does not mention the maintainer approval step yet.

### Task 2: Implement maintainer approval generation and validation

**Files:**
- Create: `scripts/create-plugin-maintainer-approval.js`
- Create: `scripts/validate-plugin-maintainer-approval.js`
- Modify: `package.json`

- [ ] **Step 1: Implement the approval generator CLI**

Create a new script with:

```js
const VALID_DECISIONS = new Set(['approved', 'changes-requested'])
```

Required inputs:

- `bundleDir`
- `reviewer`
- `decision`
- `notes`

Core behavior:

- load the submission bundle through the existing bundle loader and validator;
- reject invalid bundles before generating approval artifacts;
- copy plugin id, name, version, and package sha256 into the approval record;
- compute:

```js
const approvalReady = submissionValidation.ok
  && submissionValidation.summary.readyForHumanReview
  && decision === 'approved'
```

- write:
  - `plugin-maintainer-approval.md`
  - `plugin-maintainer-approval.json`

- [ ] **Step 2: Implement the approval validator CLI**

Validate:

```js
const REQUIRED_FILES = {
  markdown: 'plugin-maintainer-approval.md',
  json: 'plugin-maintainer-approval.json',
  submissionSummary: 'plugin-submission-summary.json'
}
```

Checks must include:

- approval JSON parses successfully;
- reviewer, decision, notes, source bundle directory, plugin id, plugin version, and package sha256 are present;
- decision is one of `approved` or `changes-requested`;
- approval plugin/package fields match the source submission bundle;
- `approvalReady` is false for non-approved decisions;
- `--require-approved` fails unless the source bundle was ready for human review and the approval decision is `approved`.

- [ ] **Step 3: Add npm scripts**

Update `package.json` with:

```json
"create-plugin-maintainer-approval": "node scripts/create-plugin-maintainer-approval.js",
"validate-plugin-maintainer-approval": "node scripts/validate-plugin-maintainer-approval.js"
```

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run:

```bash
node --test tests/scripts/create-plugin-maintainer-approval.test.js tests/scripts/validate-plugin-maintainer-approval.test.js
```

Expected:

- PASS for approved and changes-requested generation;
- PASS for mismatch and `--require-approved` validation failures.

### Task 3: Integrate approval into rehearsal guidance and archive one example

**Files:**
- Modify: `scripts/create-plugin-author-rehearsal.js`
- Modify: `tests/scripts/create-plugin-author-rehearsal.test.js`
- Modify under: `docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/submission-bundle/`

- [ ] **Step 1: Extend generated author rehearsal guidance**

Add next-step commands like:

```js
`npm run create-plugin-maintainer-approval -- ${shellQuote(bundleDir)} --reviewer 'OpenPet Maintainer' --decision approved --notes 'Manifest, permissions, package hash, and submission artifacts reviewed.'`,
`npm run validate-plugin-maintainer-approval -- ${shellQuote(bundleDir)} --require-approved`
```

Checklist wording must stay explicit that approval is a separate human maintainer step.

- [ ] **Step 2: Generate one archived approval example**

Run the new generator against:

```bash
docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/submission-bundle
```

to create:

- `plugin-maintainer-approval.md`
- `plugin-maintainer-approval.json`

- [ ] **Step 3: Re-run targeted rehearsal tests**

Run:

```bash
node --test tests/scripts/create-plugin-author-rehearsal.test.js tests/scripts/create-plugin-maintainer-approval.test.js tests/scripts/validate-plugin-maintainer-approval.test.js tests/scripts/create-plugin-submission-bundle.test.js tests/scripts/validate-plugin-submission-bundle.test.js
```

Expected:

- PASS with updated author guidance;
- PASS with valid archived approval artifacts.

### Task 4: Record Phase 74, review it, and verify the full slice

**Files:**
- Create: `docs/phases/phase-74-plugin-maintainer-approval-rehearsal.md`
- Create: `docs/reviews/phase-74-plugin-maintainer-approval-rehearsal-review.md`
- Modify all listed live docs

- [ ] **Step 1: Run production review context**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

- [ ] **Step 2: Write the phase record and review**

Phase doc must record:

- the new approval record and validator;
- the separation between validation readiness and maintainer approval;
- the archived approval rehearsal example.

Review doc must include:

- serious findings if any;
- quality score;
- pass status;
- remaining governance limits.

- [ ] **Step 3: Update live docs conservatively**

Refresh docs so they describe:

```md
OpenPet now supports a structured maintainer approval rehearsal record for third-party extension submission bundles, while approval remains a human review decision and not signing trust, catalog publication, runtime safety, or release readiness proof.
```

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected:

- all Node tests pass;
- Control Center regression remains green;
- approval tooling stays local, review-oriented, and documentation-honest.

- [ ] **Step 5: Commit the phase atomically**

Run:

```bash
git add scripts/create-plugin-maintainer-approval.js scripts/validate-plugin-maintainer-approval.js scripts/create-plugin-author-rehearsal.js package.json tests/scripts/create-plugin-maintainer-approval.test.js tests/scripts/validate-plugin-maintainer-approval.test.js tests/scripts/create-plugin-author-rehearsal.test.js docs/phases/phase-74-plugin-maintainer-approval-rehearsal.md docs/reviews/phase-74-plugin-maintainer-approval-rehearsal-review.md docs/plugin-submission-workflow-playbook.md docs/plugin-development.md docs/plugin-ecosystem-rules.md docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/project-context.json docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/submission-bundle/plugin-maintainer-approval.md docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/submission-bundle/plugin-maintainer-approval.json docs/superpowers/specs/2026-06-17-plugin-maintainer-approval-rehearsal-phase74-design.md docs/superpowers/plans/2026-06-17-plugin-maintainer-approval-rehearsal-phase74.md
git commit -m "feat(阶段74): add plugin maintainer approval rehearsal"
```
