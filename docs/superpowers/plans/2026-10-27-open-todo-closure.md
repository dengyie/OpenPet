# Open TODO Closure Plan

> **For agentic workers:** Execute this plan task-by-task in this session. Each task ends with fresh verification evidence. External platform and third-party dependencies must remain explicitly pending until observed.

**Goal:** Close every currently actionable OpenPet TODO in code, CI, verification, and project records, while accurately retaining items that require unavailable external accounts or target hardware.

**Architecture:** Finish and verify the active Creator visual-evaluation fix first, then audit release signing/release evidence, provider smoke, packaged acceptance, migration retirement, and documentation as separate workstreams. Keep target-host operations and provider credentials out of the renderer, repository, logs, and evidence; do not claim external acceptance without real observations.

**Tech Stack:** Node.js native test runner, Electron Builder, GitHub Actions, TypeScript/Zod contracts, SSH/EasyTier remote Backend, Markdown release evidence.

## Global Constraints

- Work only on the current feature branch until rebasing onto latest `main`; the primary worktree is protected.
- Preserve the six existing uncommitted Creator Studio files and their tests.
- Do not purchase paid signing/notarization; use self-managed signatures and state OS trust limitations.
- Do not launch Electron or perform UI acceptance on the user's work machine.
- Run real Provider smoke only against the authorized Guangzhou VPS/EasyTier service; never expose credentials in output, files, logs, or evidence.
- Do not remove files without listing and getting confirmation for each path.
- Keep `npm start` functional and do not modify `cat_anime/`.

---

### Task 1: Close Creator visual-evaluation root causes

**Files:**
- Modify: `examples/plugins/creator-studio/lib/character-scale-profile.js`
- Modify: `examples/plugins/creator-studio/lib/sprite-candidate-qa.js`
- Modify: `examples/plugins/creator-studio/lib/sprite-frame-processor.js`
- Test: `tests/examples/creator-studio-character-scale-profile.test.js`
- Test: `tests/examples/creator-studio-sprite-candidate-qa.test.js`
- Test: `tests/examples/creator-studio-sprite-frame-processor.test.js`

- [ ] Review the six-file diff and confirm canonical-vs-grid normalization and action-relative jumping anchor handling are independently tested.
- [ ] Run the three targeted tests, Creator Studio non-browser test group, and syntax check.
- [ ] Rebase the feature branch onto latest `origin/main`, resolve only relevant conflicts, and rerun the same verification.
- [ ] Commit the fix on the feature branch and push it.

### Task 2: Reconcile the self-managed signing path

**Files:**
- Inspect and modify only the necessary files under `.github/workflows/`, `scripts/`, `package.json`, `electron-builder.yml` or the actual builder config, and `docs/`.
- Test: existing release-signing, release-evidence, and workflow tests under `tests/release/` and `tests/scripts/`.

- [ ] Trace macOS and Windows release jobs and identify every paid-signing/notarization requirement and every self-signature integrity check.
- [ ] Make CI release jobs build unsigned/self-managed artifacts without requiring paid secrets; keep signature integrity distinct from OS trust.
- [ ] Replace legacy readiness gates only where tests prove the new policy, and preserve historical reports as historical evidence.
- [ ] Add regressions for missing paid secrets, self-managed identity present/absent, and explicit OS-trust warnings.
- [ ] Run affected release tests and workflow/config validation available in the repository.

### Task 3: Validate target-platform packaged acceptance

**Files:**
- Modify only release smoke scripts/report templates/runbooks if code defects are found.
- Evidence: `docs/release-evidence/` versioned platform-specific run directories.

- [ ] Regenerate and run the latest macOS packaged runtime and picker flows using an isolated profile, without launching the user's normal app profile.
- [ ] Produce Windows CI artifacts and a complete operator packet; run real Windows smoke only on an available Windows runner/device.
- [ ] Validate upgrade and signature-integrity evidence separately from Gatekeeper, SmartScreen, notarization, or publisher reputation.
- [ ] Leave any unavailable target-platform observation as pending with its exact blocker.

### Task 4: Re-run configured Provider and Creator flow

**Files:**
- Inspect `scripts/run-creator-studio-provider-smoke.js`, Creator Studio runtime/evaluation path, and relevant tests; modify only reproduced defects.
- Evidence: new sanitized, versioned Creator/Provider smoke archive.

- [ ] Confirm local source revision and Guangzhou Backend deployed revision before smoke.
- [ ] Run the real Creator/Provider flow against the authorized remote Backend, including generation and final package evaluation.
- [ ] Verify scale-profile and anchor diagnostics, non-zero evaluation inputs, and non-zero final evaluation; retain legitimate provider timeout/quality failures.
- [ ] If a defect appears, add a failing regression first, fix the root cause, and repeat smoke until it passes or a real external dependency failure is recorded.

### Task 5: Finish migration retirement proof

**Files:**
- Inspect `src/main/`, `apps/desktop/`, `services/backend/`, `packages/contracts/`, `scripts/check-channel-retirement.mjs`, and migration tests.

- [ ] Enumerate compatibility IPC channels that are still reachable and map each to its Backend/Sidecar replacement or documented Shell-native owner.
- [ ] Remove only channels proven dead or fully replaced; add route/bridge parity and no-registration regressions.
- [ ] Run contract build, API reconciliation, channel-retirement checks, Backend tests, and affected Shell/Sidecar tests.

### Task 6: Close local product acceptance and external dependency items

**Files:**
- Inspect Agent Awareness manual evidence tooling, plugin community intake tooling, Telegram smoke tooling, and current reports.

- [ ] Re-run Agent Awareness acceptance from the existing sanitized archive and record the dashboard/speech observations that can be verified without launching Electron on the work machine.
- [ ] Re-run current plugin community discovery; use an actual compatible external package only if one is available, and otherwise preserve the evidence-backed `compatible-source-not-found` status.
- [ ] Do not take Telegram polling ownership while the existing bot deployment holds the token; keep the real account smoke pending until a separate token or coordinated window is available.

### Task 7: Update active project records and publish

**Files:**
- Modify: `docs/TODO.md`, `docs/HANDOFF.md`, `docs/development-summary.md`, relevant release-evidence indexes.

- [ ] Replace stale dates and test counts with evidence produced by Tasks 1–6; remove completed items from the active queue and retain genuine external blockers.
- [ ] Run `npm run check:docs-drift`, relevant tests, `git diff --check`, and inspect the final diff.
- [ ] Rebase on latest `origin/main`, merge/push the completed code to GitHub `main`, and wait for CI.
- [ ] Deploy only if Task 4 changes the Guangzhou Backend runtime; verify deployed revision and health after deployment.

## Acceptance Matrix

- Creator regression tests show no systematic scale-profile or jumping-baseline false positives.
- Creator/Provider smoke produces a complete non-zero final evaluation or records an attributable real external failure.
- Release workflows require no paid signing secrets and make no OS-trust claims.
- Migration gates prove zero dead IPC registrations and document all intentionally retained native boundaries.
- Active TODO reflects fresh evidence and labels unavailable platform/account observations pending.
