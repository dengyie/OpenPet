# Hatch Pet Scope Conformance Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the fixed Creator workflow, Provider-neutral prompt path, Creator run recovery, evidence surfaces, and current documentation conform to the approved human-review and quality-first generation contracts.

**Architecture:** Keep deterministic generation and QA inside Creator Studio, but stop automatic Host orchestration at `ready_for_review`. Add explicit human approval evidence, derive partial-package requirements from authoritative coverage, carry bounded appearance intent through the typed prompt compiler, and make run persistence atomic. Public evidence remains a projection of recorded facts and never fabricates transport or safety claims.

**Tech Stack:** Electron main process, Node.js CommonJS, React/TypeScript Control Center, Creator Studio plugin commands, JSON run artifacts.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/ff3f/OpenPet` on `codex/dev8`.
- Do not modify the protected main worktree or any other development/testing worktree.
- Do not run tests, builds, Provider calls, browser checks, image generation, or visual inspection on `codex/dev8`.
- Keep Hatch Pet execution fixed to `shadow`; do not implement Phase 2 or Phase 3.
- Every real image request still requires exactly one validated local reference, `/images/edits`, multipart `image`, and `n=1`.
- Do not weaken deterministic QA, output-count, approval, import, activation, or security boundaries.
- Update the existing isolated test handoff with exact production commits and required regression scenarios.
- Do not push, merge, rebase, or alter other branches.

---

### Task 1: Stop Automatic Approval, Import, And Activation

**Files:**
- Modify: `src/main/services/creator-workflow-service.js`
- Modify: `examples/plugins/creator-studio/commands/approve-run.js`
- Modify: `examples/plugins/creator-studio/service/studio-service.js`
- Modify: `examples/plugins/creator-studio/web/dashboard/index.html`
- Modify: `src/control-center/src/panes/CreatorPane.tsx`
- Test handoff: `docs/superpowers/plans/2026-07-15-provider-neutral-image-generation-test-handoff.md`

**Interfaces:**
- Consumes: Creator Studio run with `status='ready_for_review'`.
- Produces: explicit review-required workflow result and validated `humanApproval` metadata.

- [ ] **Step 1: Record the failing contract evidence**

The existing deterministic path is:

```text
ready_for_review -> approve-run -> import-approved-* -> activate=true
```

The expected path is:

```text
ready_for_review -> return review-required -> explicit human approve -> explicit import -> optional activation
```

- [ ] **Step 2: Stop the Host workflow at review**

Replace the automatic approval/import block with a result shaped like:

```js
return createWorkflowResult({
  state: 'review-required',
  code: 'human_review_required',
  message: `生成完成，请人工复查 run ${runId}`,
  run: createRunView({ state: 'review-required', mode, runId }),
  reference: creatorReferenceService.getReference(referenceTarget),
  diagnostics: getWorkflowDiagnostics()
})
```

- [ ] **Step 3: Require bounded human approval evidence**

Validate the command payload before status mutation:

```js
const approval = context.payload?.humanApproval
if (
  approval?.approved !== true ||
  !['control-center', 'creator-studio-dashboard'].includes(approval?.source) ||
  approval?.evidenceVersion !== 1 ||
  !Number.isFinite(Date.parse(String(approval?.approvedAt || '')))
) {
  const error = new Error('Creator Studio approval requires explicit human approval evidence')
  error.code = 'human_approval_required'
  throw error
}
```

Persist only `approved`, `source`, `approvedAt`, and `evidenceVersion`.

- [ ] **Step 4: Make dashboard approval explicit**

The dashboard approval request sends the fixed evidence object using the current timestamp. No model output or free-form text enters it.

- [ ] **Step 5: Remove copy promising automatic approval/import/activation**

Control Center states that generation stops for review and that import/activation are separate explicit actions.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/creator-workflow-service.js \
  examples/plugins/creator-studio/commands/approve-run.js \
  examples/plugins/creator-studio/service/studio-service.js \
  examples/plugins/creator-studio/web/dashboard/index.html \
  src/control-center/src/panes/CreatorPane.tsx
git commit -m "fix require human approval for creator imports"
```

---

### Task 2: Honor Quality-First Partial Packages

**Files:**
- Modify: `src/main/services/creator-workflow-service.js`
- Modify: `docs/pet-character-generation.md`
- Test handoff: `docs/superpowers/plans/2026-07-15-provider-neutral-image-generation-test-handoff.md`

**Interfaces:**
- Consumes: `basicActions.requiredActionIds`, `availableActionIds`, `omittedActionIds`, `realActionIds`.
- Produces: required-action failure list that defaults to `['idle']` for new partial evidence.

- [ ] **Step 1: Replace all-row requirement derivation**

Use:

```js
const requiredActionIds = createUniqueTextList(
  basicActions.requiredActionIds || basicActions.requiredOfficialActionIds || ['idle']
)
const availableActionIds = createUniqueTextList(
  basicActions.availableActionIds || basicActions.realActionIds
)
const missingRequiredActionIds = requiredActionIds.filter((id) => !availableActionIds.includes(id))
```

Do not synthesize `CODEX_ROWS` as the required list.

- [ ] **Step 2: Preserve optional omission evidence**

Return bounded `omittedActionIds` and `actionAvailability`. A missing optional action does not create `preview_ready`.

- [ ] **Step 3: Keep required failure explicit**

Missing `idle` or invalid required identity evidence remains preview/review blocked and cannot be approved or imported.

- [ ] **Step 4: Commit**

```bash
git add src/main/services/creator-workflow-service.js docs/pet-character-generation.md
git commit -m "fix honor partial pet action coverage"
```

---

### Task 3: Carry Bounded Appearance Intent Into Real Provider Prompts

**Files:**
- Modify: `examples/plugins/creator-studio/lib/provider-image-task.js`
- Modify: `examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js`
- Modify: `examples/plugins/creator-studio/lib/anchor-prompt-builder.js`
- Modify: `examples/plugins/creator-studio/lib/openpet-prompt-builder.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Test handoff: `docs/superpowers/plans/2026-07-15-provider-neutral-image-generation-test-handoff.md`

**Interfaces:**
- Produces: `ProviderImageTask.appearanceIntent: string[]`.
- Consumes: explicit fixed-workflow `stylePrompt`/`characterBrief` only.

- [ ] **Step 1: Add strict task field**

Allow `appearanceIntent` as an image-task key and normalize it with a maximum of six 240-character visual directives.

- [ ] **Step 2: Add prompt-control rejection**

Reject directives matching bounded prompt-control patterns such as:

```js
/\b(?:ignore|disregard|override|replace|reveal|repeat)\b.{0,80}\b(?:instruction|prompt|system|rule|requirement)\b/i
```

Do not remove ordinary visual words such as “replace the blue scarf with a red scarf” unless they attempt to control prompt execution.

- [ ] **Step 3: Compile appearance intent**

Insert:

```js
const createAppearanceIntentParagraph = (task) => task.appearanceIntent.length
  ? `Apply this requested visual treatment only where it does not conflict with the attached character identity: ${task.appearanceIntent.join('; ')}.`
  : ''
```

Fixed framing, transparency, layout, and exclusion clauses remain after the intent.

- [ ] **Step 4: Wire full-pet and character-anchor paths**

`buildOpenPetImagePrompt` derives appearance intent from the sanitized explicit character brief. `buildCharacterAnchorPrompt` accepts the same typed field. `generateAnchorReferences` passes `resolveAnchorCharacterBrief(run)` through that field.

- [ ] **Step 5: Remove obsolete compact Provider prompt dead code**

Delete `buildCompactProviderPrompt` and constants used only by it, while retaining the local dashboard prompt builder.

- [ ] **Step 6: Commit**

```bash
git add examples/plugins/creator-studio/lib/provider-image-task.js \
  examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js \
  examples/plugins/creator-studio/lib/anchor-prompt-builder.js \
  examples/plugins/creator-studio/lib/openpet-prompt-builder.js \
  examples/plugins/creator-studio/lib/host-model-bridge.js
git commit -m "fix preserve bounded creator appearance intent"
```

---

### Task 4: Close Prompt Path And URI Leakage

**Files:**
- Modify: `examples/plugins/creator-studio/lib/provider-image-task.js`
- Modify: `examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js`
- Test handoff: `docs/superpowers/plans/2026-07-15-provider-neutral-image-generation-test-handoff.md`

**Interfaces:**
- Consumes: every dynamic visual directive.
- Produces: sanitized visual text or fail-closed prompt contract error.

- [ ] **Step 1: Expand sanitizer patterns**

Cover:

```js
const FILE_URI_TEXT = /\bfile:\/{2,3}\S+/gi
const TRAVERSAL_TEXT = /(?:^|\s)(?:\.\.[/\\])+\S*/g
const WINDOWS_PATH_TEXT = /\b[A-Za-z]:[\\/]\S+/g
const UNC_PATH_TEXT = /\\\\[^\\/\s]+[\\/]\S+/g
const PROJECT_RELATIVE_PATH_TEXT = /\b(?:runs|inputs|outputs|assets|cat_anime)[/\\][^\s,，。)]+/gi
```

- [ ] **Step 2: Add final prompt assertions**

The compiler rejects any surviving file URI, traversal path, drive path, UNC path, or project-relative asset path.

- [ ] **Step 3: Commit**

Fold this into Task 3 when the same files are already modified; otherwise commit separately:

```bash
git add examples/plugins/creator-studio/lib/provider-image-task.js \
  examples/plugins/creator-studio/lib/provider-image-prompt-compiler.js
git commit -m "fix reject paths in provider image prompts"
```

---

### Task 5: Make Creator Run Persistence Atomic And Recoverable

**Files:**
- Modify: `examples/plugins/creator-studio/lib/run-store.js`
- Modify: `examples/plugins/creator-studio/lib/backend-runner.js` only if error propagation needs bounded recovery metadata
- Test handoff: `docs/superpowers/plans/2026-07-15-provider-neutral-image-generation-test-handoff.md`

**Interfaces:**
- Produces: `writeJsonAtomic(filePath, value)` and recoverable `readRun`/`listRuns` behavior.

- [ ] **Step 1: Add atomic JSON replacement**

```js
const writeJsonAtomic = (filePath, value) => {
  ensureDirectory(path.dirname(filePath))
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`)
    fs.renameSync(tempPath, filePath)
  } finally {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath) } catch (_) {}
  }
}
```

Use this helper for `run.json`, initial config/task JSON, and recovery state where appropriate. Append-only event logs remain append-only.

- [ ] **Step 2: Preserve last valid run state**

Before replacing an existing valid `run.json`, maintain one bounded `run.last-valid.json` backup using atomic replacement. Never back up an unreadable file over the last valid copy.

- [ ] **Step 3: Recover unreadable current state**

`readRun` tries current state first, then the last-valid backup. If backup recovery succeeds, return a failed run with `generation-command-state-recovered` evidence and preserve the corrupt file under a safe diagnostic name.

- [ ] **Step 4: Keep list visibility**

`listRuns` must not silently omit a run when a valid backup exists.

- [ ] **Step 5: Commit**

```bash
git add examples/plugins/creator-studio/lib/run-store.js examples/plugins/creator-studio/lib/backend-runner.js
git commit -m "fix atomically persist creator generation runs"
```

---

### Task 6: Align Public Evidence, UI, And Current Documentation

**Files:**
- Modify: `examples/plugins/creator-studio/service/studio-service.js`
- Modify: `examples/plugins/creator-studio/web/dashboard/index.html`
- Modify: `src/control-center/src/panes/CreatorPane.tsx`
- Modify: `docs/pet-character-generation.md`
- Modify: `docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase1-test-handoff.md`
- Modify: `docs/superpowers/plans/2026-07-15-provider-neutral-image-generation-test-handoff.md`

**Interfaces:**
- Consumes: recorded evidence only.
- Produces: truthful optional public evidence fields.

- [ ] **Step 1: Stop hardcoding successful compiler evidence**

Use actual values:

```js
referenceImageCount: Math.max(0, Number(promptCompiler.referenceImageCount) || 0),
requestedOutputCount: Math.max(0, Number(promptCompiler.requestedOutputCount) || 0),
promptSafety: createPublicText({ dataDir, value: promptCompiler.promptSafety || '' })
```

- [ ] **Step 2: Remove forbidden UI defaults**

Replace `text-to-image` and `/images/generations` fallback strings with `not recorded`.

- [ ] **Step 3: Update exact-one current truth**

Rewrite the single-reference section to require exactly one attachment, list stable error codes, and state that no real success path uses `/images/generations`.

- [ ] **Step 4: Record Phase 1 verification truth**

State that Phase 1 automated verification passed on the isolated branch while Provider-neutral final integrated verification remains pending.

- [ ] **Step 5: Update the independent test handoff**

Replace the obsolete fixed commit list with the final remediation base/head protocol and add every regression scenario from the design.

- [ ] **Step 6: Commit**

```bash
git add examples/plugins/creator-studio/service/studio-service.js \
  examples/plugins/creator-studio/web/dashboard/index.html \
  src/control-center/src/panes/CreatorPane.tsx \
  docs/pet-character-generation.md \
  docs/superpowers/plans/2026-07-15-hatch-pet-agent-phase1-test-handoff.md \
  docs/superpowers/plans/2026-07-15-provider-neutral-image-generation-test-handoff.md
git commit -m "docs align creator review and image contracts"
```

---

### Task 7: Development-Branch Static Review And Reviewer Handoff

**Files:**
- Review all files changed by Tasks 1-6.
- Update: `docs/superpowers/plans/2026-07-15-provider-neutral-image-generation-test-handoff.md`

- [ ] **Step 1: Inspect static call chains**

Confirm by source inspection:

- no automatic approval/import/activation call remains;
- no all-nine-actions required derivation remains;
- actual Provider prompts receive bounded appearance intent;
- all prompt paths use exact-one-reference and edit-only transport;
- run writes route through atomic persistence;
- UI evidence has no generations-path fallback.

- [ ] **Step 2: Run non-executing repository checks only**

Allowed:

```bash
git diff --check
git status --short --branch
git log -12 --oneline
```

Do not run Node, npm, Provider, browser, or image commands.

- [ ] **Step 3: Commit the final handoff if needed**

```bash
git add docs/superpowers/plans/2026-07-15-provider-neutral-image-generation-test-handoff.md
git commit -m "docs hand off creator scope remediation verification"
```

- [ ] **Step 4: Dispatch independent review**

Give a fresh reviewer the exact development commits, design/spec links, static findings to re-check, and the prohibition on modifying `codex/dev8`.

- [ ] **Step 5: Dispatch original independent test task after review approval**

The test task must cherry-pick or branch from the exact approved final development HEAD and run all required automated checks. Real image work remains one-shot-subagent-only after automated PASS.

