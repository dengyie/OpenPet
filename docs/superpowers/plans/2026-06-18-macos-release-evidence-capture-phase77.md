# macOS Release Evidence Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local macOS release evidence capture command that writes the evidence files consumed by the release archive manifest without overstating signed release readiness.

**Architecture:** Keep the feature in release tooling scripts. The new command runs or imports evidence for codesign, Gatekeeper, and notarization, writes the canonical archive filenames, and creates Markdown/JSON summaries that preserve pending/not-ready status unless every signed evidence signal passes.

**Tech Stack:** Node.js CommonJS scripts, Node native test runner, existing release evidence archive contracts.

---

### Task 1: Add macOS Evidence Capture Script

**Files:**
- Create: `scripts/create-macos-release-evidence.js`
- Test: `tests/release/create-macos-release-evidence.test.js`

- [ ] **Step 1: Write tests for argument parsing, imported evidence, command execution, and readiness gates**

Use Node native tests to verify:
- `parseArgs` accepts `--app`, `--output-dir`, `--notarization-source`, `--json`, and `--skip-spctl`;
- imported evidence writes `macos-codesign.txt`, `macos-notarization.txt`, `macos-gatekeeper.txt`, `macos-release-evidence-summary.md`, and `macos-release-evidence-summary.json`;
- unsigned evidence leaves `releaseReady: false`;
- signed-looking evidence marks `releaseReady: true`;
- fake `execFile` output is captured with command, exit code, stdout, and stderr.

- [ ] **Step 2: Implement the script**

Implement:
- `parseArgs(argv)`;
- `createMacosReleaseEvidence(options)`;
- `runEvidenceCommand({ command, args, execFile })`;
- `createEvidenceSummary({ files, statuses })`;
- Markdown and JSON writers.

The command must:
- default `outputDir` to `docs/release-evidence/macos-release-evidence/<session>`;
- write the canonical filenames expected by `create-release-evidence-archive-manifest`;
- preserve notarization as pending unless explicit source text is provided;
- not claim release readiness without passing codesign, notarization, and Gatekeeper statuses.

- [ ] **Step 3: Wire npm script**

Add:

```json
"create-macos-release-evidence": "node scripts/create-macos-release-evidence.js"
```

near the other release evidence commands in `package.json`.

### Task 2: Document Phase 77

**Files:**
- Create: `docs/phases/phase-77-macos-release-evidence-capture.md`
- Create: `docs/reviews/phase-77-macos-release-evidence-capture-review.md`
- Modify: `docs/desktop-release-design.md`
- Modify: `docs/release-checklist.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`
- Modify: `docs/HANDOFF.md`

- [ ] **Step 1: Add phase document**

Record goal, scope, out-of-scope signed readiness claims, decision record, implementation files, verification commands, and next risks.

- [ ] **Step 2: Add production review document**

Include severe issues, improvement suggestions, quality score, and pass status.

- [ ] **Step 3: Update live docs**

Add the new command to relevant command lists and explain that it captures macOS evidence but does not replace actual signing/notarization.

### Task 3: Verify And Commit

**Files:**
- All Phase 77 changes

- [ ] **Step 1: Run targeted tests**

```bash
node --test tests/release/create-macos-release-evidence.test.js
```

- [ ] **Step 2: Run full gates**

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
```

- [ ] **Step 3: Commit and push**

```bash
git add scripts/create-macos-release-evidence.js tests/release/create-macos-release-evidence.test.js package.json docs
git commit -m "feat(阶段77): add macOS release evidence capture"
git push -u origin codex/macos-release-evidence-capture-phase77
```

## Self-Review

- Spec coverage: Covers the P0 macOS signed evidence gap by adding local evidence capture and summary tooling. It does not claim signed readiness without evidence.
- Placeholder scan: No placeholders remain.
- Type consistency: Function names and file names match the planned implementation.
