# Quality-First Sprite Generation Independent Test Handoff

> Date: 2026-07-20  
> Development branch: `codex/dev8`  
> Status: implemented; independent Provider and visual verification required  
> Production-art-ready claim: prohibited until this handoff passes

## 1. Scope delivered for independent verification

The full-pet production route now uses only `quality-first-v1`:

```text
one validated source reference
  -> strict complete official-action plan
  -> three distinct canonical candidates
  -> code-owned canonical comparison gates
  -> exact hash-bound human identity acceptance
  -> idle-first two-candidate action generation
  -> immutable scale profile
  -> remaining action candidate comparison and bounded repair
  -> deterministic running-left mirror
  -> real atlas and preview artifacts
  -> final-package evaluator board and code-owned gate
  -> explicit human approval
  -> import and optional activation
```

Development commits in the chain include:

- `7294ec35` - quality-first orchestration, candidate/evaluator evidence, recovery and Create review UX;
- `749a0f9e` - production cutover, quality-first retry routes and legacy full-pet fail-closed behavior;
- `bf92a6fe` - approval/import artifact bridge, final package gate, Provider budget accounting, paid-asset archive fixes, complete planner action contract and dead legacy repair removal.

The independent test branch must start from the final `codex/dev8` HEAD after the documentation commit, not from one of these intermediate commits.

Fresh development-only verification before handoff:

- Tasks 1-9 focused Node suites: 141/141 passed;
- Creator model bridge budget-accounting focus: 1/1 passed;
- `npx tsc --noEmit`: exit 0;
- `git diff --check`: exit 0.

These results do not replace the repository-wide or real-image checks below.

## 2. Repository verification

Run fresh and record exact exit codes and counts:

```bash
npm run check:syntax
npm run test:core
npm run test:control-center
npm run test:core:all
```

Also rerun the focused quality-first suites listed in the implementation plan. Any baseline failure is a release blocker unless it is independently proven unrelated and assigned with exact failing evidence.

## 3. Real Provider request contract

Use a non-secret evidence capture. For every canonical and action request verify:

- endpoint is `/images/edits`;
- multipart field is `image`, never `image[]`;
- exactly one validated local reference is attached;
- `n=1` is requested;
- actual output count is exactly one;
- prompt is Provider-neutral and contains no OpenPet/project vocabulary, internal IDs, paths, secrets, or planner prose;
- canonical requests use the source reference;
- action requests use the single generated action reference board;
- same-model 524/transport retry happens at most once and stays within the operation deadline;
- every actual HTTP attempt increments `runs/<runId>/budgets/ledger.json`, including failed attempts.

Do not commit API keys, bearer headers, query credentials, raw Provider responses, absolute user paths, or unredacted logs.

## 4. Canonical identity review

Verify with a real run:

- three eligible canonical candidates are visually distinct, source-faithful, complete, and small-scale readable;
- duplicate outputs remain visible as paid evidence but do not count toward the pool;
- no action request occurs before identity acceptance;
- acceptance rejects a stale candidate ID, wrong hash, ineligible candidate, or different run;
- identity retry archives all existing paid candidates and returns to `awaiting_identity_review`;
- Create shows the candidates, eligibility, scores, failure reasons, prompt evidence, retained assets and next action without absolute paths.

Human identity selection is required. An automated evaluator pass is not human approval.

## 5. Action and package visual inspection

Use a fresh visual-review agent for each image-review batch. Do not load generated images into the development task.

Inspect every available action's raw sheet, processed sheet, individual frames, contact sheet and GIF for:

- source identity, face, eyes, markings, palette, proportions, silhouette and rendering-medium consistency;
- readable action semantics at runtime size;
- frame order and loop closure;
- stable scale, root anchor, baseline and cross-action continuity;
- no cropped body, edge touch, extra/missing limbs, detached contamination, text, labels, borders, floor, shadow or scene background;
- `running-left` is a correct framewise mirror of `running-right` and has no independent Provider request;
- optional failures remain transparent/omitted rather than copied from idle.

Inspect the final 1536x1872 atlas and its 2048x1536 final-package evaluator board. Confirm the source, canonical, action contact sheet and atlas regions are correct and that a failing code-owned package gate prevents approval artifacts from being published.

## 6. Recovery, repair and paid assets

Exercise:

- duplicate replacement and the single reason-directed repair limit;
- one optional action failure while later actions continue;
- idle failure producing `recovery-required` and no runnable import;
- recovery bundle export with only relative paths and verified hashes;
- action retry preserving the accepted canonical and scale profile;
- `running-right` retry invalidating/rebuilding `running-left`;
- action retry archive retaining raw candidates, candidate JSON, processed frames, prompts, references, evaluator evidence and packaged frames;
- archived candidate links point to `candidate-archives/...`, while the new repair candidate points to the current candidate directory;
- failed and rejected paid outputs remain visible in the Create asset review bench.

## 7. Approval, import and activation

After a visually acceptable full-pet run reaches `ready_for_review`, verify:

1. `run.artifacts` contains outputDir, petJson, spritesheet, bundle, atlas QA, source QA and canonical generated-image provenance;
2. source-QA relative path/hash matches the accepted canonical output;
3. atlas-QA hash matches the current spritesheet;
4. real idle coverage is present;
5. `approve-run` succeeds only after explicit human approval;
6. `import-approved-pet` passes pack inspection and imports the generated pack;
7. optional activation changes the active pack only after import;
8. stale or mismatched QA, missing manifest, missing spritesheet, failed final-package gate and missing idle all fail closed.

Partial import must be tested separately: it is legal only when accepted idle exists, must label omitted/failed actions, and must not invent placeholder action art.

## 8. Required report

Return a committed report on the independent test branch containing:

- branch, start commit, test commit and clean status;
- command outputs and exact pass/fail counts;
- sanitized Provider request evidence and budget-ledger deltas;
- per-candidate and per-action visual verdicts;
- contact-sheet/GIF/atlas findings;
- identity/action retry, recovery, approval/import/activation outcomes;
- every blocker with triggering condition, actual impact and exact evidence path.

Until all repository, Provider, visual and workflow checks pass, report **implemented but independently unverified** and do not record Provider approval or `production-art-ready`.
