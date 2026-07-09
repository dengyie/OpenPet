# Documentation Truth Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate OpenPet live docs into clear entry points, focused truth docs, and narrow drift checks that preserve evidence boundaries and generated-pet image fidelity truth.

**Architecture:** Use `docs/README.md` as the navigation hub, keep `docs/HANDOFF.md`, `docs/TODO.md`, and `docs/openpet-current-todo-architecture.md` in separate current-state roles, and leave historical phase/review/spec files as audit records unless they are active runbooks. Focused docs remain responsible for Agent Awareness, desktop release, plugin/community-source, release evidence, and Creator Studio image-quality boundaries.

**Tech Stack:** Markdown, Node.js native test runner, `scripts/check-docs-drift.js`, existing `tests/docs/*.test.js`, npm scripts `check:docs-drift` and `test:tools`.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/ef96/OpenPet` on `codex/dev7`; do not edit the protected main worktree at `/Users/mango/project/codex/OpenPet`.
- Do not stage `.playwright-mcp/`, build output, `node_modules/`, `dist/`, temporary OS files, or unrelated local artifacts.
- Do not add product code, UI behavior, real-provider evidence, packaged-app evidence, signing, notarization, Windows machine evidence, or marketing copy expansion in this milestone.
- Preserve the distinction between automated evidence, synthetic rehearsals, real smoke evidence, and manual-required acceptance.
- Preserve that generated pet images must stay highly consistent with the user's original pet image before any asset/product-quality claim.
- Treat provider smoke evidence as provider reachability and command/data-flow proof only, not final visual fidelity proof.
- Treat frame/atlas QA as structural import-readiness proof only, not human visual fidelity proof.
- Keep `docs/HANDOFF.md` compact and focused on maintainer continuation; keep `docs/TODO.md` as the active queue; keep `docs/openpet-current-todo-architecture.md` as the architecture-owned backlog explanation.
- Update historical `docs/phases/`, `docs/reviews/`, or old `docs/superpowers/` files only when a specific active runbook or misleading current claim needs alignment.

---

### Task 1: Entry Responsibility Cleanup

**Files:**
- Modify: `docs/README.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/TODO.md`
- Modify: `docs/openpet-current-todo-architecture.md`

**Interfaces:**
- Consumes: approved design at `docs/superpowers/specs/2026-07-07-documentation-truth-consolidation-design.md`
- Produces: a live-doc routing model where `README.md` is the hub, `HANDOFF.md` resumes maintainer work, `TODO.md` owns active queue items, and `openpet-current-todo-architecture.md` explains architectural placement.

- [ ] **Step 1: Inspect current role overlap**

Run:

```bash
rg -n "Agent Awareness|agent-awareness|release-ready|signed readiness|Creator Studio|provider smoke|original image|visual fidelity|manual|required|mock|synthetic" docs/README.md docs/HANDOFF.md docs/TODO.md docs/openpet-current-todo-architecture.md
```

Expected: command prints every current live-doc overlap that must be reconciled before editing.

- [ ] **Step 2: Update `docs/README.md` into a routing hub**

Replace duplicate Agent Awareness product rows with one program entry and one implementation reference. Preserve links to `docs/agent-awareness-development-design.md`, `examples/plugins/agent-awareness/README.md`, and the real Codex acceptance runbook.

The Product Areas table should include these responsibilities in this order:

```markdown
| Agent Awareness current program | [`agent-awareness-development-design.md`](./agent-awareness-development-design.md), [`../examples/plugins/agent-awareness/README.md`](../examples/plugins/agent-awareness/README.md), [`superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md`](./superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md) |
| Agent Awareness implementation history | [`agent-awareness-plugin-design.md`](./agent-awareness-plugin-design.md), [`superpowers/plans/2026-07-05-agent-awareness-phase2-claudepet-parity-foundation.md`](./superpowers/plans/2026-07-05-agent-awareness-phase2-claudepet-parity-foundation.md), [`superpowers/specs/2026-07-05-agent-awareness-claudepet-parity-design.md`](./superpowers/specs/2026-07-05-agent-awareness-claudepet-parity-design.md), [`phases/phase-107-agent-awareness-bundled-plugin.md`](./phases/phase-107-agent-awareness-bundled-plugin.md), [`reviews/phase-107-agent-awareness-bundled-plugin-review.md`](./reviews/phase-107-agent-awareness-bundled-plugin-review.md) |
```

Also add a current-source note after the Current Docs table:

```markdown
Use the live docs above for current truth. Phase, review, and old Superpowers plan/spec files are audit records unless this map explicitly lists them as active runbooks.
```

- [ ] **Step 3: Keep `docs/HANDOFF.md` compact**

Remove repeated design narrative if present and keep pointers to the focused docs. The handoff must continue to include:

```markdown
- `docs/release-evidence/README.md`
- `tests/scripts/mock-agent-awareness-flow.test.js`
- `tests/scripts/mock-plugin-community-source-flow.test.js`
- `tests/release/mock-packaged-provider-flow.test.js`
- `tests/release/mock-picker-runtime-flow.test.js`
- does not replace real Codex signal collection or human desktop acceptance
- not real signed or manually observed release evidence
```

- [ ] **Step 4: Keep `docs/TODO.md` as active queue only**

Ensure the active queue keeps release and ecosystem blockers explicit without adding design history. It must still include these real/manual-required gaps:

```markdown
fresh passing evidence
real signed Windows artifact plus observed smoke evidence
observed packaged-app behavior
actual external compatible package source
real configured packaged provider session
```

If generated-pet image fidelity is not present in an active or watch item, add a concise item that says production-quality pet generation still requires original-image fidelity review.

- [ ] **Step 5: Keep `docs/openpet-current-todo-architecture.md` as architecture explanation**

Add or tighten the Creator Studio/provider section so it states:

```markdown
Provider smoke and frame/atlas QA prove command/data flow and structural import readiness; production-quality pet generation still requires generated output to remain highly consistent with the user's original image, including recognizable identity, silhouette, palette, style, and important visual traits.
```

Do not reopen closed Creator Studio or AI Provider verification milestones in the recommended-next-milestone section.

- [ ] **Step 6: Run docs drift after entry cleanup**

Run:

```bash
npm run check:docs-drift
```

Expected: PASS. If it fails, adjust the live docs rather than weakening existing checks unless a check no longer matches the approved truth model.

- [ ] **Step 7: Commit entry cleanup if implemented separately**

Run:

```bash
git add docs/README.md docs/HANDOFF.md docs/TODO.md docs/openpet-current-todo-architecture.md
git commit -m "docs: clarify live documentation entry roles"
```

Expected: commit succeeds only if Task 1 is implemented as its own commit.

### Task 2: Focused Truth Alignment

**Files:**
- Modify: `docs/agent-awareness-development-design.md`
- Modify: `docs/desktop-release-design.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/release-evidence/README.md`
- Modify: `docs/superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md`

**Interfaces:**
- Consumes: entry-role docs from Task 1 and currently dirty Agent Awareness/release/runbook edits.
- Produces: focused docs that agree on current Agent Awareness, release, plugin/community-source, release-evidence, and generated-image-quality truth.

- [ ] **Step 1: Inspect focused truth wording**

Run:

```bash
rg -n "mock-agent-awareness-flow|manualAcceptanceTemplate|releaseReady|NotSubmitted|unsigned|community-source|plugin.json|provider smoke|Creator Studio|original image|visual fidelity|production-quality|atlas QA" docs/agent-awareness-development-design.md docs/desktop-release-design.md docs/plugin-development.md docs/release-evidence/README.md docs/superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md
```

Expected: command prints the exact current claims before edits.

- [ ] **Step 2: Integrate Agent Awareness mock-flow wording**

Keep `tests/scripts/mock-agent-awareness-flow.test.js` in `docs/agent-awareness-development-design.md` and the acceptance runbook. The surrounding prose must say:

```markdown
It proves tool wiring and redacted data flow only; it does not replace the real session smoke or the later human desktop review.
```

In the runbook, the preflight pass criteria must say:

```markdown
- mock smoke/archive/update 演练通过，并在不启动 OpenPet 的前提下覆盖数据流闭环
```

- [ ] **Step 3: Integrate current desktop release evidence truth**

Keep the `v1.0.1-rc.3` public asset check, authenticated macOS artifact import, parser-rerun, packaged-runtime pending report, and unsigned Windows prerelease facts in `docs/desktop-release-design.md`.

The platform table must say:

```markdown
| macOS | Public assets and imported workflow evidence both currently fail signed readiness | macOS-first release track; official release still requires passing signed/notarized artifacts |
```

The current gate status must explicitly say the latest public macOS ZIP and DMG assets fail local signature/Gatekeeper verification and therefore do not satisfy the signed-evidence gate.

- [ ] **Step 4: Preserve plugin/community-source ecosystem split**

Ensure `docs/plugin-development.md` keeps OpenPet package compatibility scoped to `plugin.json` packages and does not imply adjacent `openpets.plugin.json` or generic `package.json` ecosystems are native package inputs.

It must include the bridge command:

```bash
npm run create-plugin-community-source-bridge
```

It must keep a current distinction between local third-party package intake and external ecosystem discovery/invitation material.

- [ ] **Step 5: Add release-evidence image-quality boundary**

In `docs/release-evidence/README.md`, add a short Creator Studio/provider evidence note near provider smoke archives:

```markdown
Creator Studio provider smoke archives prove provider reachability, command/data flow, and generated asset pipeline wiring. They do not prove final pet visual identity or production asset quality; generated pets still require human review or a future explicit visual-fidelity gate against the user's original image.
```

Keep synthetic rehearsal wording that says mock flows do not replace real archived sessions, real compatible third-party packages, real signed artifacts, or real configured packaged provider sessions.

- [ ] **Step 6: Run focused-doc drift check**

Run:

```bash
npm run check:docs-drift
```

Expected: PASS.

- [ ] **Step 7: Commit focused alignment if implemented separately**

Run:

```bash
git add docs/agent-awareness-development-design.md docs/desktop-release-design.md docs/plugin-development.md docs/release-evidence/README.md docs/superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md
git commit -m "docs: align focused truth documents"
```

Expected: commit succeeds only if Task 2 is implemented as its own commit.

### Task 3: Drift Guard for Image Fidelity and Doc Roles

**Files:**
- Modify: `scripts/check-docs-drift.js`
- Test: `tests/docs/live-docs-project-context.test.js`
- Test: `tests/docs/live-docs-truth.test.js`

**Interfaces:**
- Consumes: updated live docs from Tasks 1 and 2.
- Produces: drift checks that protect generated-pet image fidelity boundaries and hub/source-of-truth routing.

- [ ] **Step 1: Inspect existing docs test coverage**

Run:

```bash
rg -n "checkDocsDrift|creator|fidelity|release-evidence|docs/README|HANDOFF|TODO" tests/docs scripts/check-docs-drift.js
```

Expected: command shows whether existing tests already cover image fidelity and doc routing.

- [ ] **Step 2: Add a narrow image-fidelity drift check**

In `scripts/check-docs-drift.js`, add a check after `docs-readme-links-release-evidence-index`:

```js
    {
      id: 'creator-studio-keeps-image-fidelity-boundary',
      description: 'Live docs should keep generated-pet image quality tied to original-image fidelity rather than provider smoke alone.',
      run: () =>
        /highly consistent with the user's original/i.test(combined) &&
        /recognizable identity[\s\S]*silhouette[\s\S]*palette[\s\S]*style[\s\S]*important visual traits/i.test(combined) &&
        /Provider smoke[\s\S]*command\/data flow[\s\S]*not final visual fidelity proof/i.test(combined) &&
        /Frame\/atlas QA[\s\S]*structural import-readiness[\s\S]*not human visual fidelity proof/i.test(combined),
      failure: 'Live docs no longer keep generated-pet image quality tied to original-image fidelity and manual/future visual acceptance.'
    },
```

If exact capitalization differs in the edited docs, preserve the same meaning and keep the regex case-insensitive.

- [ ] **Step 3: Add a docs README routing drift check**

In `scripts/check-docs-drift.js`, add a check near the existing README checks:

```js
    {
      id: 'docs-readme-keeps-current-truth-routing',
      description: 'docs/README.md should route current truth to live docs and demote historical phase/review/spec files to audit records.',
      run: () =>
        /Where should I read next\?|current source-of-truth routing|Use the live docs above for current truth/i.test(readme) &&
        /Phase, review, and old Superpowers plan\/spec files are audit records/i.test(readme),
      failure: 'docs/README.md no longer clearly routes current truth to live docs while demoting historical records.'
    },
```

- [ ] **Step 4: Run docs-specific tests**

Run:

```bash
node --test tests/docs/*.test.js
```

Expected: PASS.

- [ ] **Step 5: Run full docs drift command**

Run:

```bash
npm run check:docs-drift
```

Expected: PASS.

- [ ] **Step 6: Commit drift guards if implemented separately**

Run:

```bash
git add scripts/check-docs-drift.js tests/docs
git commit -m "test: guard documentation truth boundaries"
```

Expected: commit succeeds only if Task 3 is implemented as its own commit.

### Task 4: Verification, Review, and Final Commit

**Files:**
- Review: `docs/README.md`
- Review: `docs/HANDOFF.md`
- Review: `docs/TODO.md`
- Review: `docs/openpet-current-todo-architecture.md`
- Review: `docs/agent-awareness-development-design.md`
- Review: `docs/desktop-release-design.md`
- Review: `docs/plugin-development.md`
- Review: `docs/release-evidence/README.md`
- Review: `docs/superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md`
- Review: `scripts/check-docs-drift.js`
- Review: `tests/docs/*.test.js`

**Interfaces:**
- Consumes: all edited docs and drift guards.
- Produces: verified, reviewed, committed documentation consolidation milestone.

- [ ] **Step 1: Run required verification**

Run:

```bash
npm run check:docs-drift
npm run test:tools
```

Expected: both commands PASS. If `npm run test:tools` includes docs tests, no separate Node docs test is needed after it passes.

- [ ] **Step 2: Inspect final diff**

Run:

```bash
git diff -- docs/README.md docs/HANDOFF.md docs/TODO.md docs/openpet-current-todo-architecture.md docs/agent-awareness-development-design.md docs/desktop-release-design.md docs/plugin-development.md docs/release-evidence/README.md docs/superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md scripts/check-docs-drift.js tests/docs
```

Expected: diff shows only documentation truth consolidation and narrow drift checks.

- [ ] **Step 3: Production-style review**

Review the final diff for these outcomes:

```markdown
- P0/P1 blockers: none
- Synthetic evidence does not replace real/manual acceptance
- Release archived-but-not-ready evidence does not become release-ready language
- Provider/image-generation smoke does not become visual-fidelity proof
- Agent Awareness mock rehearsal remains preflight-only
- Historical docs are not promoted above live docs
```

- [ ] **Step 4: Commit remaining milestone changes**

Run:

```bash
git add docs/README.md docs/HANDOFF.md docs/TODO.md docs/openpet-current-todo-architecture.md docs/agent-awareness-development-design.md docs/desktop-release-design.md docs/plugin-development.md docs/release-evidence/README.md docs/superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md scripts/check-docs-drift.js tests/docs docs/superpowers/plans/2026-07-07-documentation-truth-consolidation.md
git commit -m "docs: consolidate documentation truth model"
```

Expected: commit succeeds and excludes `.playwright-mcp/`.

- [ ] **Step 5: Report completion**

Final report must include:

```markdown
- changed docs and drift checks
- verification commands and results
- review result with severity summary
- remaining manual-required acceptance gaps
- confirmation that `.playwright-mcp/` was not staged
```
