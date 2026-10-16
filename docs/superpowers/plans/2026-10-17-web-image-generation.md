# Web Image Generation Implementation Plan

> **For agentic workers:** Execute this plan inline with review checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Backend-owned image generation lane and connect it to the web Creator workbench so reference-image generation, the complete quality-first pet workflow, task progress, review, recovery evidence, and result preview are handled by Backend Jobs before the desktop import step.

**Architecture:** Reuse the existing `image.generate` Job and Provider adapter, but let the Backend create a fixed, user-data-relative output directory for web image-preview requests. Browser references are accepted only as bounded base64 image data, materialized inside the Job temporary directory, and removed with the Job workspace. A read-only preview endpoint exposes only generated files under `creator-web/`. Full web Creator requests use the bundled official plugin in the Backend runtime, where the reference is retained in the run, identity review blocks action work until human approval, and action QA/retry/recovery remain Backend-owned. The active Backend session still supplies Provider secrets; Shell is required for local pet import and activation.

**Tech Stack:** Node.js native HTTP, existing Backend Job queue, existing OpenAI-compatible image model service, React/Vite web control.

## Global Constraints

- Keep Provider keys out of renderer state, ordinary plugin payloads, logs, and API responses.
- Never accept a browser supplied filesystem path or output directory.
- Keep output and preview paths contained below the configured Backend `userDataDir/creator-web` directory.
- Do not modify `cat_anime/` or add adapters under `examples/plugins/im-gateway/`.
- Do not launch Electron or perform workstation UI acceptance; use Node tests and production builds only.

---

### Task 1: Harden the Backend image request boundary

**Files:**
- Modify: `services/backend/domains/ai/image-generation.js`
- Modify: `services/backend/routes/ai.js`
- Modify: `services/backend/host.js`
- Test: `tests/backend/t46-image-jobs.test.js`
- Test: `tests/backend/host-web-control.test.js`

**Interfaces:**
- `createAiService().createWebImageInput(input, jobId)` returns a private Job input with a fixed `output.dataDir` and `output.dataRelativeDir` under `creator-web/runs/<jobId>`.
- `createAiService().previewGeneratedImage(relativePath)` returns `{ relativePath, mimeType, previewDataUrl }` only for files under `creator-web/`.
- `POST /api/v1/ai/images/web-generate` keeps its redacted persisted Job input and uses the Backend fixed output when the runtime service is available.
- `GET /api/v1/ai/images/preview?relativePath=...` serves a bounded data URL for generated image files.

- [x] Add strict web input normalization, one-use temporary reference materialization, image signature checks, and cleanup through the existing Job temp directory.
- [x] Add contained preview reads with extension based MIME types and a bounded response size.
- [x] Add the two routes to the host Web token allowlist without widening plugin or settings access.
- [x] Add regressions for fixed output paths, unsupported reference bytes, path traversal, and Web token route authorization.
- [x] Run the focused Backend image and host suites.

### Task 2: Connect image generation to the web control workbench

**Files:**
- Modify: `apps/web-control/src/api.mjs`
- Modify: `apps/web-control/src/main.tsx`
- Modify: `apps/web-control/src/styles.css`
- Test: `tests/web-control/api.test.js`

**Interfaces:**
- `createWebApi().generateImage({ prompt, referenceImage })` submits a redacted Backend image Job.
- `createWebApi().imagePreview(relativePath)` reads the generated preview endpoint.
- The workbench shows Backend image and Creator Job progress, image preview, identity/action candidate review, and recovery status. Provider calls require an active Backend session; local pet import and activation retain their Shell requirement.

- [x] Add the API helpers and in-memory image result state.
- [x] Add a bounded image reference picker and an image generation action to the existing create panel; allow a hash-bound generated image artifact to continue into the full Creator run.
- [x] Poll image Jobs with the same cancellation-safe lifecycle used by Creator Jobs, then load the preview from the returned relative output path.
- [x] Update copy so the user can distinguish Backend image generation from optional Shell import.
- [x] Add API contract coverage and build the web bundle.

### Task 3: Update operational boundary documentation

**Files:**
- Modify: `docs/superpowers/plans/2026-10-16-openpet-mesh-web-control.md`
- Modify: `docs/deployment/openpet-mesh-backend.md`

- [x] Record that Backend image generation is available through the web route, stores generated files under `creator-web/`, and can hand a verified artifact into the full Creator run.
- [x] Record that only desktop import and activation require an online Shell bridge.
- [x] Record the focused verification commands and their fresh results.

## Verification

- `node --test tests/backend/t46-image-jobs.test.js tests/backend/host-web-control.test.js tests/web-control/api.test.js`
- `npm run build:web-control`
- `npm run check:node`
- `git diff --check`

## Review Boundary

Backend owns web image generation, full Creator orchestration, candidate review, QA, retries, and recovery verification during an active Backend session. Desktop pet-pack activation stays in Shell, and Provider credentials remain session-scoped rather than adding a new CVM credential store.
