# Pet Character Generation Documentation Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the `codex/dev8` Pet character-generation documentation into one English authority that accurately defines the single-reference-image, quality-first, Codex Pet generation pipeline.

**Architecture:** Create `docs/pet-character-generation.md` as the sole current specification for character and action generation. Reduce supporting live docs to links and short claim-boundary summaries, retain release evidence unchanged, and delete superseded dev8-only plans/specifications after their valid requirements are transferred.

**Tech Stack:** Markdown, JSON, Node native test runner, existing documentation drift checker.

## Global Constraints

- The user supplies exactly one source image for a normal generation run.
- Every image-provider request may contain at most one image attachment.
- OpenPet may compose local intermediate reference boards, but must send only one composite image per provider request.
- `running-right` is generated once; `running-left` is a QA-gated framewise horizontal mirror and does not receive a separate provider request.
- The official atlas is `1536x1872`, `8x9`, with `192x208` cells and transparent unused cells.
- Base-image transforms cannot be claimed as real action generation.
- Deterministic QA is required but human visual review remains required for production art approval.
- Existing files under `docs/release-evidence/` are immutable evidence and must not be deleted or rewritten.
- The work is documentation-only; do not change runtime behavior or provider code.

---

## File Map

| File | Responsibility after this plan |
| --- | --- |
| `docs/pet-character-generation.md` | Sole current dev8 character/action generation authority |
| `examples/plugins/creator-studio/README.md` | Plugin operation and command guide with a link to the authority |
| `docs/README.md` | Canonical documentation index entry |
| `docs/HANDOFF.md` | Short current-state pointer and honest quality boundary |
| `docs/development-summary.md` | Short engineering snapshot pointer and implementation boundary |
| `docs/project-status-review.md` | Short product/release claim boundary with the feature link |
| `docs/openpet-current-todo-architecture.md` | Current TODO/architecture pointer without duplicated generation protocol |
| `docs/project-context.json` | Machine-readable current fact and validation link update |
| `tests/docs/live-docs-creator-studio.test.js` | Regression coverage for canonical document content and supporting links |
| `tests/docs/live-docs-project-context.test.js` | Regression coverage for the canonical path in machine-readable facts |
| `docs/superpowers/specs/2026-07-12-pet-character-generation-documentation-consolidation-design.md` | Approved design record; retain as historical process evidence |
| `docs/superpowers/plans/2026-07-12-pet-character-generation-documentation-consolidation.md` | This implementation plan |

The following dev8-only documents are superseded after Task 2 and are removed in Task 4:

```text
docs/one-click-action-generation-complete-chain.md
docs/superpowers/plans/2026-07-05-creator-studio-official-row-pipeline-implementation.md
docs/superpowers/plans/2026-07-05-creator-studio-post-merge-follow-up.md
docs/superpowers/plans/2026-07-05-creator-studio-row-extractor-boundary-chain.md
docs/superpowers/plans/2026-07-05-creator-studio-row-preview-artifacts-implementation.md
docs/superpowers/plans/2026-07-05-creator-studio-stable-slots-implementation.md
docs/superpowers/plans/2026-07-06-creator-studio-action-quality-repair.md
docs/superpowers/plans/2026-07-08-creator-studio-anchor-reference-generation.md
docs/superpowers/plans/2026-07-09-keyframe-conditioned-row.md
docs/superpowers/plans/2026-07-10-creator-action-quality-hardening.md
docs/superpowers/specs/2026-07-05-creator-studio-official-row-pipeline-design.md
docs/superpowers/specs/2026-07-05-creator-studio-row-preview-artifacts-design.md
docs/superpowers/specs/2026-07-05-creator-studio-stable-slots-design.md
docs/superpowers/specs/2026-07-07-creator-studio-anchor-reference-generation-design.md
docs/superpowers/specs/2026-07-09-creator-studio-keyframe-conditioned-row-design.md
docs/superpowers/specs/2026-07-10-creator-action-quality-hardening-design.md
```

`docs/jishuwendang.md` remains a general Chinese architecture reference; only its duplicated Creator Studio generation subsection is reduced to an English authority link.

### Task 1: Lock Canonical-Document Regression Expectations

**Files:**
- Modify: `tests/docs/live-docs-creator-studio.test.js`
- Modify: `tests/docs/live-docs-project-context.test.js`

**Interfaces:**
- Consumes: filesystem paths and text helpers already present in both test files.
- Produces: assertions that the canonical document exists, contains the single-image and mirrored-direction contract, and is linked by current live docs.

- [ ] **Step 1: Replace old one-click document reads with the canonical path**

Change every test-local `readText('docs/one-click-action-generation-complete-chain.md')` to `readText('docs/pet-character-generation.md')` and update assertion labels to `pet-character-generation.md`.

- [ ] **Step 2: Add the canonical contract test**

Add this test to `tests/docs/live-docs-creator-studio.test.js`:

```js
test('canonical pet generation docs enforce one reference image and mirrored directional rows', () => {
  const canonical = readText('docs/pet-character-generation.md')
  assert.match(canonical, /exactly one source image/i)
  assert.match(canonical, /at most one image attachment/i)
  assert.match(canonical, /compose.*composite reference board/i)
  assert.match(canonical, /running-right.*running-left.*framewise.*mirror/is)
  assert.match(canonical, /does not spend a separate provider request on `?running-left`?/i)
  assert.match(canonical, /1536x1872/i)
  assert.match(canonical, /192x208/i)
  assert.match(canonical, /human.*visual.*review/i)
})
```

- [ ] **Step 3: Add supporting-link assertions**

Read `docs/README.md`, `docs/HANDOFF.md`, `docs/development-summary.md`, `docs/project-status-review.md`, `docs/openpet-current-todo-architecture.md`, and `examples/plugins/creator-studio/README.md`; assert each contains `docs/pet-character-generation.md` or the equivalent relative link. Assert that `docs/README.md` no longer presents the deleted one-click document as a current Creator Studio authority.

- [ ] **Step 4: Update machine-readable context assertions**

In `tests/docs/live-docs-project-context.test.js`, assert that `context.currentFacts.join('\n')` contains `docs/pet-character-generation.md`, `running-left`, `approved-mirror`, and `one image attachment`.

- [ ] **Step 5: Run the focused tests and verify the expected failure**

Run:

```bash
node --test tests/docs/live-docs-creator-studio.test.js tests/docs/live-docs-project-context.test.js
```

Expected: FAIL because the canonical document and new links do not exist yet. Do not weaken the assertions to make the current stale docs pass.

- [ ] **Step 6: Commit the regression expectations**

```bash
git add tests/docs/live-docs-creator-studio.test.js tests/docs/live-docs-project-context.test.js
git commit -m "test(dev8): define canonical pet generation docs"
```

### Task 2: Write the Canonical Pet Generation Document

**Files:**
- Create: `docs/pet-character-generation.md`

**Interfaces:**
- Consumes: approved design in `docs/superpowers/specs/2026-07-12-pet-character-generation-documentation-consolidation-design.md`; implementation names in Creator Studio code.
- Produces: one current English reference for users and developers working on character and action generation.

- [ ] **Step 1: Add the document header and current-truth boundary**

State that the document is the `codex/dev8` feature authority, distinguish implemented behavior from known gaps, and link to the relevant source files:

```text
src/main/services/creator-reference-service.js
src/main/services/creator-workflow-service.js
src/main/services/image-generation-model-service.js
examples/plugins/creator-studio/lib/host-model-bridge.js
examples/plugins/creator-studio/lib/anchor-reference-board.js
examples/plugins/creator-studio/lib/action-frame-builder.js
examples/plugins/creator-studio/lib/full-pet-row-contract.js
examples/plugins/creator-studio/lib/full-pet-row-extractor.js
examples/plugins/creator-studio/lib/full-pet-row-qa.js
examples/plugins/creator-studio/lib/real-atlas-builder.js
```

- [ ] **Step 2: Document the user flow and one-image provider protocol**

Describe one clean reference image as the only normal user input. Explicitly state that local composite boards are allowed as intermediate artifacts, while each provider request carries exactly one image. Include rejection of collages/multi-view sources and host-owned credentials.

- [ ] **Step 3: Document the Codex Pet output contract**

Include the `1536x1872` atlas, `8x9` grid, `192x208` cell size, transparent background, all nine rows, exact frame counts, and semantic meaning. Define `running-right` as the generated source row and `running-left` as its framewise mirror.

- [ ] **Step 4: Document the quality-first pipeline**

Describe source validation, identity anchor, local reference-board composition, action semantics, provider-generated complete sheets/rows, extraction, stable-slot correction, QA, contact sheets/GIFs, human review, atlas composition, and import. State that base transforms and independent per-frame generation cannot satisfy production action quality.

- [ ] **Step 5: Document directional-pair optimization**

Include the exact pipeline:

```text
provider running-right sheet
  -> running-right QA and approval
  -> framewise horizontal mirror
  -> running-left direction/stability QA
  -> paired atlas rows with identical timing
```

State that this is eight provider action jobs for nine official rows in the normal full-pet flow and explain the asymmetric-accessory blocking rule.

- [ ] **Step 6: Document QA, human review, failure recovery, tests, and evidence**

Separate technical, identity, motion, semantic, directional-pair, and atlas QA from mandatory visual inspection. Add failure ownership and repair scope. Link existing Creator Studio provider and workflow smoke evidence while explicitly saying smoke proves the technical path, not production art quality.

- [ ] **Step 7: Run Markdown hygiene checks**

Run:

```bash
git diff --check
rg -n "TBD|TODO|implement later|fill in details" docs/pet-character-generation.md
```

Expected: no whitespace errors and no placeholder matches.

- [ ] **Step 8: Commit the canonical document**

```bash
git add docs/pet-character-generation.md
git commit -m "docs(dev8): add canonical pet character generation guide"
```

### Task 3: Reduce Supporting Live Documentation To Pointers

**Files:**
- Modify: `examples/plugins/creator-studio/README.md`
- Modify: `docs/README.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/openpet-current-todo-architecture.md`
- Modify: `docs/project-context.json`
- Modify: `docs/jishuwendang.md`

**Interfaces:**
- Consumes: `docs/pet-character-generation.md` from Task 2.
- Produces: one-link navigation and concise claim boundaries without protocol duplication.

- [ ] **Step 1: Replace Creator Studio README generation policy with a concise pointer**

Keep commands, fixture/provider operation, bridge ownership, and import behavior. Replace duplicated row-policy paragraphs with a short paragraph linking to `../../docs/pet-character-generation.md`; retain the explicit statement that preview fallback and smoke success are not official-quality art.

- [ ] **Step 2: Add the Creator Studio character-generation entry to `docs/README.md`**

Add one Product Areas row named `Pet character and action generation` pointing to `pet-character-generation.md`. Remove the old dev8 one-click document from the current Creator Studio row. Leave historical `superpowers/` indexing intact as archive policy, but do not list the deleted files as current authorities.

- [ ] **Step 3: Reduce current summaries to one factual paragraph and link**

In `HANDOFF.md`, `development-summary.md`, `project-status-review.md`, and `openpet-current-todo-architecture.md`, retain only: one clean front-facing image, host-owned Provider generation, technical atlas/QA/import status, official-quality row-generation limitation, `running-left` mirror rule, and the canonical link. Remove repeated prompt/row/QA protocol details.

- [ ] **Step 4: Update `project-context.json` without changing unrelated facts**

Add a single current fact containing the canonical path, the single-image provider rule, and the `running-right`/`running-left` mirror boundary. Update only the Creator Studio generation fact; preserve existing release evidence, branch-neutral machine facts, and validation commands.

- [ ] **Step 5: Reduce the Chinese technical document's duplicated generation subsection**

Keep its general architecture and command sections. Replace the detailed Creator Studio generation bullets with a Chinese note that the current English authority is `docs/pet-character-generation.md`; do not translate or duplicate the full protocol there.

- [ ] **Step 6: Run focused documentation tests**

Run:

```bash
node --test tests/docs/live-docs-creator-studio.test.js tests/docs/live-docs-project-context.test.js
```

Expected: PASS after the canonical document and all supporting links are present.

- [ ] **Step 7: Commit supporting-document updates**

```bash
git add examples/plugins/creator-studio/README.md docs/README.md docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/openpet-current-todo-architecture.md docs/project-context.json docs/jishuwendang.md
git commit -m "docs(dev8): point live docs to pet generation authority"
```

### Task 4: Remove Superseded Dev8 Design And Plan Files

**Files:**
- Delete: the 15 files listed in the File Map under “superseded dev8-only documents”.
- Delete: `docs/one-click-action-generation-complete-chain.md`.
- Modify: any remaining current-doc references found by `rg`.

**Interfaces:**
- Consumes: canonical content and updated tests from Tasks 2–3.
- Produces: no current document references a deleted dev8 authority; Git history retains the deleted content.

- [ ] **Step 1: Search all non-archive references before deletion**

Run:

```bash
rg -n "one-click-action-generation-complete-chain|2026-07-05-creator-studio|2026-07-06-creator-studio|2026-07-08-creator-studio|2026-07-09-keyframe-conditioned-row|2026-07-10-creator-action-quality-hardening" --glob '*.md' --glob '*.json' --glob '*.js' .
```

Classify matches as historical plan text, tests, current docs, or release evidence. Only current docs and tests may be rewritten; historical phase/review records and the approved consolidation design may retain historical references.

- [ ] **Step 2: Delete the superseded current-scope files**

Use `apply_patch` delete patches for the exact list in the File Map. Do not delete `docs/release-evidence/`, phase records, review records, or the approved consolidation design/implementation plan.

- [ ] **Step 3: Remove stale current references**

Update any remaining current navigation or test path to `docs/pet-character-generation.md`. Leave references inside deleted historical plans unavailable because those files are being removed; leave references in phase/review history only when they describe historical work.

- [ ] **Step 4: Verify no deleted authority is indexed as current**

Run:

```bash
rg -n "one-click-action-generation-complete-chain|creator-studio-official-row-pipeline-design|creator-studio-anchor-reference-generation-design|creator-action-quality-hardening-design" docs examples tests
```

Expected: no matches in current docs, tests, or examples; any allowed historical match must be reviewed explicitly before committing.

- [ ] **Step 5: Commit the cleanup**

```bash
git add -u docs examples tests
git commit -m "docs(dev8): remove superseded pet generation plans"
```

### Task 5: Run Full Documentation Verification And Review

**Files:**
- Verify: all files changed in Tasks 1–4.

**Interfaces:**
- Consumes: the consolidated authority and reduced live-doc surface.
- Produces: verified documentation-only branch state with no unrelated changes.

- [ ] **Step 1: Run documentation regression tests**

```bash
node --test tests/docs/live-docs-creator-studio.test.js tests/docs/live-docs-project-context.test.js
```

Expected: PASS.

- [ ] **Step 2: Run the repository drift checker**

```bash
npm run check:docs-drift
```

Expected: exit 0 with every check PASS.

- [ ] **Step 3: Validate Markdown and JSON syntax**

```bash
git diff --check
node -e "JSON.parse(require('fs').readFileSync('docs/project-context.json', 'utf8')); console.log('project-context.json OK')"
```

Expected: no output from `git diff --check` and `project-context.json OK`.

- [ ] **Step 4: Run the broader test and syntax baselines**

```bash
npm run check:syntax
npm run test:core
```

Expected: both commands exit 0. No provider call or Electron launch is required because runtime behavior is unchanged.

- [ ] **Step 5: Inspect final scope and status**

```bash
git diff --stat refs/heads/main...HEAD
git status --short --branch
```

Expected: only pet-generation documentation and its documentation tests/spec/plan are changed relative to the pre-task branch state; the worktree is clean after commits.

- [ ] **Step 6: Commit any verification-only correction separately**

If a verification correction is needed, make the smallest documentation-only patch, rerun the failing command, and commit it as:

```bash
git add <corrected-files>
git commit -m "docs(dev8): correct pet generation documentation verification"
```

## Self-Review Checklist

- [ ] Every requirement in `docs/superpowers/specs/2026-07-12-pet-character-generation-documentation-consolidation-design.md` maps to a task above.
- [ ] No task contains `TBD`, `TODO`, `implement later`, or unspecified edge-case instructions.
- [ ] No current document claims independent `running-left` generation or more than one provider image attachment.
- [ ] No test reads a file deleted in Task 4.
- [ ] Release evidence and unrelated architecture documentation remain untouched except for explicitly scoped links/summaries.
- [ ] The canonical document distinguishes technical smoke success from visual art approval.
