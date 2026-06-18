# Plugin Setup and Command Process Tree Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend host-owned process-tree cleanup fallback from declared services to setup and declaration-only command stop paths without widening them to the full service lifecycle contract.

**Architecture:** Keep `PluginService` as the owner of setup and declaration-only command runtime state, logs, and exit-confirmed stop semantics. Reuse the existing `signalServiceProcessTree` helper by recording child PIDs on setup/command runtimes and inserting one process-tree fallback tier before direct child kill.

**Tech Stack:** Electron main process, CommonJS Node services, Node child-process lifecycle handling, Node native test runner, production-code-quality-review workflow.

---

## File Map

- Modify: `src/main/services/plugin-service.js`
  Purpose: record setup/command child PIDs and use the host-owned process-tree helper before direct child kill fallback.
- Modify: `tests/services/plugin-service.test.js`
  Purpose: cover setup/command cleanup tree fallback and fallback-to-child-kill semantics while preserving Phase 70 stop-intent truth.
- Create: `docs/phases/phase-73-plugin-setup-command-process-tree-hardening.md`
  Purpose: record delivered scope, behavior, validation, and remaining limits.
- Create: `docs/reviews/phase-73-plugin-setup-command-process-tree-hardening-review.md`
  Purpose: record production review findings and merge recommendation.
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/project-context.json`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-review-todo-design.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/plugin-ecosystem-rules.md`
  Purpose for all live docs: keep the extension cleanup boundary current and conservative.

## Task 1: Write failing tests for setup/command tree fallback

**Files:**
- Modify: `tests/services/plugin-service.test.js`

- [ ] **Step 1: Add declaration-only command cleanup fallback tests**

Add targeted tests that:

- prove disable cleanup uses `signalServiceProcessTree(pid, 'SIGTERM')` before child kill;
- prove app-shutdown cleanup uses the same order;
- prove child kill still runs when the tree helper throws.

- [ ] **Step 2: Add setup cleanup fallback tests**

Add targeted tests that:

- prove disable cleanup uses `signalServiceProcessTree(pid, 'SIGTERM')` before child kill;
- prove app-shutdown cleanup uses the same order;
- prove child kill still runs when the tree helper throws.

- [ ] **Step 3: Adjust existing stop tests to stub the helper where needed**

Keep existing setup/command stop tests deterministic by explicitly injecting `signalServiceProcessTree` when they assert direct child kill behavior.

- [ ] **Step 4: Run targeted tests and verify RED**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service uses tree cleanup for declaration command stop requests before child kill fallback|plugin service falls back to child kill when declaration command tree cleanup fails|plugin service uses tree cleanup for setup stop requests before child kill fallback|plugin service falls back to child kill when setup tree cleanup fails|plugin service stops running declaration commands when a plugin is disabled|plugin service stops running declaration commands during app shutdown cleanup|plugin service stops running setup when a plugin is disabled|plugin service stops running setup during app shutdown cleanup|plugin service marks setup cleanup failure as failed when child kill throws"
```

Expected before implementation:

- setup and declaration-only command cleanup never call the tree helper yet;
- the new assertions fail while existing service-path behavior still passes.

## Task 2: Implement tree fallback in `PluginService`

**Files:**
- Modify: `src/main/services/plugin-service.js`

- [ ] **Step 1: Add a focused runtime stop helper**

Introduce a small local helper that:

- reads `runtime.pid`,
- tries `signalServiceProcessTree(pid, signal)` when the pid is valid,
- falls back to `runtime.child.kill(signal)` when the helper returns false or throws.

- [ ] **Step 2: Record setup and declaration-only command child PIDs**

Persist `pid: Number(child.pid) || 0` on:

- declaration-only command runtimes created in `runCommandEntryProcess`;
- setup runtimes created in `runSetup`.

- [ ] **Step 3: Route setup/command stop through the helper**

Update:

- `runtime.stop(...)` for declaration-only command runtimes;
- `stopPluginSetupRuntime(...)`

to call the new helper instead of directly calling `child.kill(signal)`.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service uses tree cleanup for declaration command stop requests before child kill fallback|plugin service falls back to child kill when declaration command tree cleanup fails|plugin service uses tree cleanup for setup stop requests before child kill fallback|plugin service falls back to child kill when setup tree cleanup fails|plugin service stops running declaration commands when a plugin is disabled|plugin service stops running declaration commands during app shutdown cleanup|plugin service stops running setup when a plugin is disabled|plugin service stops running setup during app shutdown cleanup|plugin service marks setup cleanup failure as failed when child kill throws"
```

Expected: all targeted tests pass.

## Task 3: Record the phase and review

**Files:**
- All docs listed in the file map

- [ ] **Step 1: Update phase and live docs**

Write:

- `docs/phases/phase-73-plugin-setup-command-process-tree-hardening.md`
- live-doc updates that explain:
  - service cleanup is still the strongest path because it alone has process-group plus bounded force-stop;
  - setup and declaration-only commands now also try host-owned tree cleanup;
  - no runtime shape has universal process cleanup guarantees.

- [ ] **Step 2: Run production review context and write review note**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Then write:

- `docs/reviews/phase-73-plugin-setup-command-process-tree-hardening-review.md`

## Task 4: Full verification, commit, push

**Files:**
- All changed files

- [ ] **Step 1: Run complete verification**

Run:

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

- [ ] **Step 2: Commit and push**

Run:

```bash
git add src/main/services/plugin-service.js tests/services/plugin-service.test.js docs/phases/phase-73-plugin-setup-command-process-tree-hardening.md docs/reviews/phase-73-plugin-setup-command-process-tree-hardening-review.md docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/project-context.json docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md docs/plugin-development.md docs/plugin-ecosystem-rules.md docs/superpowers/specs/2026-06-17-plugin-setup-command-process-tree-hardening-phase73-design.md docs/superpowers/plans/2026-06-17-plugin-setup-command-process-tree-hardening-phase73.md
git commit -m "feat(阶段73): harden plugin setup and command cleanup"
git push -u origin codex/plugin-setup-command-process-tree-hardening-phase73
```
