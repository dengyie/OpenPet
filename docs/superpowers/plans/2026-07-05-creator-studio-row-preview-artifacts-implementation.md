# Creator Studio Row Preview Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate deterministic contact sheet and GIF preview artifacts for official full-pet row packages.

**Architecture:** Add a focused preview artifact helper beside row extraction/QA. Integrate it only into `real-atlas-builder` when a complete official row package is supplied.

**Tech Stack:** Node.js, CommonJS, `sharp`, Node native test runner.

## Global Constraints

- Do not call image providers.
- Do not change official row acceptance rules.
- Do not make base-only preview output look official-quality.
- Keep all paths inside Creator Studio `dataDir`.
- Do not expose absolute filesystem paths in QA JSON.
- Use TDD.

---

## Task 1: Preview Artifact Helper

**Files:**
- Create: `examples/plugins/creator-studio/lib/full-pet-row-preview-artifacts.js`
- Create: `tests/examples/creator-studio-full-pet-row-preview-artifacts.test.js`

**Interfaces:**
- Produces: `createOfficialRowPreviewArtifacts({ dataDir, rowFramesByActionId, outputDir })`

- [ ] **Step 1: Write failing tests**

Test cases:

- writes `full-pet-contact-sheet.png` and one GIF per official row;
- returned metadata uses data-relative paths;
- rejects output directories outside `dataDir`;
- rejects source frame paths outside `dataDir`.

- [ ] **Step 2: Verify RED**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-preview-artifacts.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement helper**

Use `sharp` to compose the contact sheet and `sharp(frameInputs, { join: { animated: true } }).gif({ delay, loop: 0 })` to write GIF previews.

- [ ] **Step 4: Verify GREEN**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-preview-artifacts.test.js
```

Expected: PASS.

## Task 2: Atlas QA Integration

**Files:**
- Modify: `examples/plugins/creator-studio/lib/real-atlas-builder.js`
- Modify: `tests/examples/creator-studio-real-atlas-builder.test.js`

**Interfaces:**
- Consumes: `createOfficialRowPreviewArtifacts`
- Produces: `atlas-validation.json.visualReview`

- [ ] **Step 1: Write failing builder assertion**

Extend the official row package test to assert:

- `visualReview.contactSheet === 'runs/run-1/qa/full-pet-contact-sheet.png'`;
- one preview per official row;
- all preview paths are data-relative and point under `runs/run-1/qa/previews/`;
- contact sheet and GIF files exist and decode.

- [ ] **Step 2: Verify RED**

Run:

```sh
node --test tests/examples/creator-studio-real-atlas-builder.test.js
```

Expected: FAIL because `visualReview` is missing.

- [ ] **Step 3: Integrate helper**

Call `createOfficialRowPreviewArtifacts` after composing official rows and before writing `atlas-validation.json`.

- [ ] **Step 4: Verify focused GREEN**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-preview-artifacts.test.js \
  tests/examples/creator-studio-real-atlas-builder.test.js
```

Expected: PASS.

## Task 3: Verification And Commit

- [ ] Run targeted row pipeline tests:

```sh
node --test tests/examples/creator-studio-full-pet-row-preview-artifacts.test.js \
  tests/examples/creator-studio-full-pet-row-stable-slots.test.js \
  tests/examples/creator-studio-full-pet-row-extractor.test.js \
  tests/examples/creator-studio-full-pet-row-qa.test.js \
  tests/examples/creator-studio-real-atlas-builder.test.js
```

- [ ] Run syntax:

```sh
npm run check:syntax
```

- [ ] Commit:

```sh
git add docs/superpowers/specs/2026-07-05-creator-studio-row-preview-artifacts-design.md \
  docs/superpowers/plans/2026-07-05-creator-studio-row-preview-artifacts-implementation.md \
  examples/plugins/creator-studio/lib/full-pet-row-preview-artifacts.js \
  examples/plugins/creator-studio/lib/real-atlas-builder.js \
  tests/examples/creator-studio-full-pet-row-preview-artifacts.test.js \
  tests/examples/creator-studio-real-atlas-builder.test.js
git commit -m "feat(dev8): add official row preview artifacts"
```
