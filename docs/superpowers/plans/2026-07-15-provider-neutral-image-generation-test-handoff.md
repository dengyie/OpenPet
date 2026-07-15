# Provider-Neutral Image Generation Independent Test Handoff

## Result Gate

This handoff independently verifies the Provider-neutral reference-conditioned image-generation implementation.

Automated verification is PASS only when all focused suites and every required repository command are green on the isolated test branch. Real Provider/image/visual work remains a later gate and cannot repair or excuse automated failures.

This handoff never authorizes Provider approval, import, activation, fabricated human labels, or a `production-art-ready` claim.

## Isolation

- Test worktree: `/Users/mango/.codex/worktrees/34f5/OpenPet`
- Test branch: `codex/dev8-hatch-pet-phase1-test`
- Existing Phase 1 test HEAD before this handoff: `662d7c9e3b0abbbff661c35cfd6be06e258a1e9e`
- Development branch: `codex/dev8`; read-only from the testing task.
- Review-blocker branch: `codex/dev8-review-blockers`; do not modify, switch, merge, or inspect beyond information explicitly supplied by the source task.
- Do not modify the protected main worktree or any other worktree/branch.
- Do not push, merge, rebase, reset, or clean.

Before any changes, report:

```bash
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
git rev-parse HEAD
git log -8 --oneline
git worktree list --porcelain
```

Continue only when the test branch is correct and the worktree is clean.

## Development Commits

Cherry-pick these production commits in order:

1. `6bd905dc` — typed Provider image tasks;
2. `6258cbb0` — Provider-neutral prompt compiler;
3. `f9cf758f` — prompt-path migration and exact canvas propagation;
4. `64581baf` — exact-one-reference host gates and edit-only transport;
5. `f725bada` — removal of zero-reference generation paths;
6. `136a483d` — safe prompt/conditioning provenance and bridge error codes.

The source task will separately provide the documentation/handoff commit created after this file. Cherry-pick only the exact commits named by the source task. Do not merge `codex/dev8`.

If any cherry-pick conflicts, stop and report the exact files and conflict markers. Do not resolve by discarding existing Phase 1 tests.

## Test-Only Change Rule

After cherry-picking production commits:

- add or update tests, fixtures, and the independent report only on the test branch;
- do not change production behavior to make tests pass;
- if production behavior is defective, preserve exact failing evidence and report it to `codex/dev8`;
- stale expectations introduced by the new approved contract may be updated only when production behavior matches the design.

## Required Automated Coverage

### 1. Typed image task contract

Create focused Node tests for `provider-image-task.js` covering:

- accepted task types: `character-image`, `action-keyframe`, `action-frame-sheet`;
- accepted stages and strict rejection of unknown fields;
- exact width/height bounds and reduced aspect ratios;
- square, landscape, and portrait canvas selection from grid geometry;
- `columns * rows >= frameCount` and fixed reading order;
- one full-body subject, 60–90% occupancy, 5–20% padding, and lower-center root;
- visual directive length/count bounds;
- token, URL, absolute path, product, transport, run/action ID, checkpoint, multipart, and reference-role removal;
- exact internal-role mapping:
  - `full-pet-action-identity-board` -> visible identity comparison;
  - composite/source board -> main and supporting identity views;
  - keyframe/peak board -> identity plus ordered pose examples;
  - unknown role -> single character;
- returned task contains no internal reference-role value.

### 2. Prompt compiler snapshots

Add exact or bounded snapshot tests for:

- character identity image;
- running start keyframe;
- running peak keyframe;
- idle keyframe;
- six-frame 3x2 action sheet;
- repair with registered requested changes;
- identity-comparison reference;
- identity-and-motion reference.

Every compiled prompt must prove:

- first instruction states exactly one output, pixel dimensions, and actual aspect ratio;
- the attached reference is described in visible natural language;
- one full body, target occupancy, lower-center placement, and safe padding are explicit;
- transparent background and no-crop rules are explicit;
- action sheets state exact frame count, columns, rows, reading order, invisible cells, stable root/scale, and unused-cell behavior;
- fixed requirements appear after bounded requested changes;
- the prompt remains complete without repository documentation.

Reject compiled prompts containing any of:

```text
OpenPet
Provider
backend
runId / run id
actionId / action id
Reference role
checkpoint
multipart
absolute host path
```

Also assert the user-supplied example no longer appears in any prompt snapshot:

```text
Create exactly one provider-generated OpenPet action keyframe image.
Reference role: full-pet-action-identity-board.
```

### 3. Anchor/open prompt compatibility

Update existing prompt-builder tests to expect:

- compatibility wrapper version `5`;
- prompt compiler version `1`;
- `prompt`/`providerPrompt` supplied by the compiler;
- 1024x1024 keyframes and character images;
- 1536x1024 for a 3x2 or 4x2 action sheet;
- project-specific local dashboard sections may still exist, but none are concatenated into `providerPrompt`;
- candidate variants recompile bounded requested changes and never append raw candidate guidance.

### 4. Creator bridge exact-one gate

Test `creator.model-image-generate` with reference counts zero, one, and two.

For zero and two:

- error codes are `reference_image_required` and `reference_image_count_invalid`;
- rejection occurs before `resolvePluginDataPath`, image-service call, output-directory work, or fetch;
- no secret or host path enters the error.

For one:

- path is resolved inside the plugin data directory;
- unsafe relative paths, invalid objects, and missing paths fail with `reference_image_invalid`.

### 5. Image-service exact-one gate

Extend `image-generation-model-service` tests to cover:

- zero and two references reject before ID allocation, output directory creation, queue acquisition, request log, secret read, or fetch;
- missing `dataDir`, missing reference, directory reference, symlink reference, and realpath escape reject with `reference_image_unusable`;
- valid regular file inside `dataDir` succeeds to the scripted fetch;
- only `/images/edits` is requested;
- multipart contains exactly one `name="image"` part and no `image[]`;
- multipart contains `n=1`;
- JSON `/images/generations` request construction is absent;
- request/conditioning evidence includes `referenceImageCount=1`, `multipartImageField=image`, `requestedOutputCount=1`, exact dimensions, aspect ratio, task type, stage, and compiler version;
- multi-output response remains fail-closed.

### 6. Host fallback, retry, and repair

Cover:

- `generateWithModelFallback` rejects zero/two references before model selection;
- same-model retry retains the identical one-entry reference descriptor and prompt compiler summary;
- fallback model retains the same reference, prompt, dimensions, and prompt compiler summary;
- character anchor, action anchor, start keyframe, peak keyframe, final action sheet, action repair, and identity repair each pass exactly one reference;
- local board composition may consume multiple local sources but each subsequent image request attaches only the one composed PNG;
- failed start-keyframe evidence retains the validated original reference rather than `[]`;
- missing reference throws `reference_image_required` rather than returning `null`, `skipped`, or starting base generation.

### 7. Workflow and task contracts

Verify:

- `textOnly` is rejected as a generation task style source;
- full-pet defaults to `referenceImage`;
- new-character generation requires an explicit reference token;
- existing-action generation requires explicit or previously bound reference;
- reference/prompt contract error codes cross the HTTP bridge and remain the final workflow result code;
- contract failures consume zero Provider-call budget;
- public diagnostics contain count/field/output metadata but no reference file names, relative paths, absolute paths, bytes, or raw multipart.

### 8. Safe public provenance

Cover Creator Studio detail, recovery, prompt provenance, and Creator Workflow diagnostics:

- prompt compiler version/task/stage/width/height/aspect ratio;
- `referenceImageCount=1`;
- `requestedOutputCount=1`;
- `multipartImageField=image`;
- `promptSafety=provider-neutral`;
- no reference file names/paths;
- no secrets, authorization content, raw image bytes, raw model response, or hidden reasoning.

## Required Automated Commands

Run focused suites first. Include at least:

```bash
node --test \
  tests/examples/creator-studio-anchor-prompt-builder.test.js \
  tests/examples/creator-studio-host-model-bridge.test.js \
  tests/examples/creator-studio-plugin.test.js \
  tests/services/image-generation-model-service.test.js \
  tests/services/plugin-service.test.js \
  tests/services/creator-workflow-service.test.js
```

Add new focused test files to that command when created.

Then run independently and record exact exit status/counts:

```bash
npm run check:syntax
npm run test:core
npm run test:core:all
npm run test:control-center
```

Do not infer one command from another. Record each result.

## Automated PASS Gate

PASS requires:

- all focused tests green;
- `check:syntax` exit 0;
- `test:core` exit 0;
- `test:core:all` exit 0;
- independent `test:control-center` exit 0;
- no newly discovered production defect;
- clean test worktree after the report/test commit.

If automated verification fails, do not start real Provider/image work.

## Later Real Provider And Visual Gate

Only after automated PASS, use the approved one-shot image-task policy:

- every real image-generation operation uses a fresh subagent/task with no inherited conversation image context;
- `fork_turns="none"` for every image generation or image-quality task;
- never reuse an image subagent for a retry or follow-up;
- every issue receives a new subagent/task;
- the controller reads structured text reports only and does not inspect image bytes;
- every report must show `referenceCounts` containing only `1`, endpoints containing only `/images/edits`, requested output counts containing only `1`, and multipart field `image`;
- visual evaluation uses another fresh one-shot subagent and records artifact paths, blocking findings, and human-review requirement.

Real failure remains valid evidence. Do not lower QA thresholds, fabricate approval, import output, activate a pet, or claim production readiness.

## Final Report

Update or add a dated independent report containing:

- PASS/FAIL;
- worktree, branch, starting and final SHAs;
- cherry-picked production commits and patch equivalence when applicable;
- test-only commit;
- focused and repository command results;
- exact reference/prompt/transport evidence;
- unresolved production defects;
- known non-blocking Minors;
- confirmation of no push/merge/rebase/reset and clean status;
- explicit statement that automated PASS is not Provider approval, visual acceptance, import/activation evidence, or a `production-art-ready` claim.
