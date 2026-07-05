# Creator Studio Row Extractor Boundary Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the official row extractor filesystem boundary and add one offline manifest-to-extraction-to-atlas regression so the row package path is safer and closer to the real chain without spending provider quota.

**Architecture:** Keep provider generation out of scope. Add optional `dataDir` containment checks inside the extractor for strip reads and frame writes, then add a test that creates row job manifest output paths, extracts synthetic strips for every official row, and feeds extracted frames into the existing official atlas builder.

**Tech Stack:** Node.js CommonJS, `sharp`, Node native test runner, existing Creator Studio example plugin helpers.

## Global Constraints

- Stay in `/Users/mango/.codex/worktrees/3c34/OpenPet` on `codex/dev8`.
- Do not touch `/Users/mango/project/codex/OpenPet`.
- Do not call image providers or spend image generation quota.
- Preserve the existing base-preview fallback path.
- Use TDD: write failing tests before production code changes.
- Keep official real coverage limited to `row-real` and approved `running-left` `approved-mirror`.

---

### Task 1: Extractor DataDir Boundary

**Files:**
- Modify: `examples/plugins/creator-studio/lib/full-pet-row-extractor.js`
- Test: `tests/examples/creator-studio-full-pet-row-extractor.test.js`

**Interfaces:**
- Consumes: `extractRowStripFrames({ stripPath, actionId, outputDir, dataDir? })`
- Consumes: `mirrorRowFrames({ frames, actionId, outputDir, dataDir? })`
- Produces: same return shapes as existing extractor functions, with optional filesystem containment enforcement.

- [ ] **Step 1: Write failing containment tests**

Add tests that:
- pass an outside `stripPath` with a valid `dataDir` and expect `/Official row strip path escaped/`;
- pass an outside `outputDir` with a valid `dataDir` and expect `/Official row frame output path escaped/`;
- pass an outside mirror source frame with a valid `dataDir` and expect `/Official row frame path escaped/`.

- [ ] **Step 2: Run tests to verify RED**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-extractor.test.js
```

Expected: FAIL because extractor currently accepts those outside paths.

- [ ] **Step 3: Implement minimal containment**

Add `resolveInsideDataDir({ dataDir, filePath, message })` to `full-pet-row-extractor.js`. If `dataDir` is absent, keep current behavior. If present, resolve the path, check path-relative containment, check symlink-realpath containment for existing inputs, and ensure output directories resolve inside `dataDir`.

- [ ] **Step 4: Run extractor tests to verify GREEN**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-extractor.test.js
```

Expected: PASS.

---

### Task 2: Offline Manifest To Atlas Chain

**Files:**
- Test: `tests/examples/creator-studio-real-atlas-builder.test.js`

**Interfaces:**
- Consumes: `createFullPetRowJobManifest(...)`
- Consumes: `extractRowStripFrames(...)`
- Consumes: `buildRealAtlasFromGeneratedImage(..., officialRows)`
- Produces: test coverage proving manifest output paths can drive extraction and official atlas composition offline.

- [ ] **Step 1: Write failing chain test if behavior is missing**

Add a test that creates a full-pet row job manifest, writes synthetic row strips at each job `outputRelativePath`, extracts every row using `extractRowStripFrames` with `dataDir`, and passes the extracted frames to `buildRealAtlasFromGeneratedImage` as `officialRows`.

- [ ] **Step 2: Run atlas builder tests**

Run:

```sh
node --test tests/examples/creator-studio-real-atlas-builder.test.js
```

Expected: PASS if the existing builder already supports the chain once extractor boundary support exists; otherwise FAIL and fix only the missing adapter glue.

- [ ] **Step 3: Run focused verification**

Run:

```sh
node --test tests/examples/creator-studio-full-pet-row-extractor.test.js tests/examples/creator-studio-real-atlas-builder.test.js
npm run check:syntax
```

Expected: PASS.

- [ ] **Step 4: Commit**

```sh
git add docs/superpowers/plans/2026-07-05-creator-studio-row-extractor-boundary-chain.md \
  examples/plugins/creator-studio/lib/full-pet-row-extractor.js \
  tests/examples/creator-studio-full-pet-row-extractor.test.js \
  tests/examples/creator-studio-real-atlas-builder.test.js
git commit -m "test(dev8): harden official row extractor chain"
```
