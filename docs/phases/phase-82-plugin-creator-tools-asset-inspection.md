# Phase 82: Plugin Creator-Tools Asset Inspection

> Date: 2026-06-18
> Scope: add a read-only creator-tools bridge route for package-local action frame folder inspection.

## Goal

Phase 80 gave declaration-only creator-tools commands a host-mediated way to read, validate, and apply bounded action configuration updates. Phase 82 adds the next narrow authoring slice: package-local frame inspection through the same short-lived bridge.

The new capability is intentionally read-only:

- `plugin.json` may declare `assets:inspect`;
- the bridge exposes `POST /creator/assets/inspect-frames`;
- the payload accepts `relativePath` and `actionId`;
- `relativePath` is resolved under the plugin package directory only;
- `ActionImportService.inspectActionFrames()` owns frame metadata validation.

## Scope

In scope:

- normalize `assets:inspect`;
- inject the existing action import service into `PluginService`;
- reject traversal, absolute paths, missing paths, non-folders, and symlink escapes before frame inspection;
- return the existing frame inspection report shape;
- add shared TypeScript contracts for the plugin bridge request and response;
- update live plugin and project docs.

Out of scope:

- sprite generation;
- copying frames into `cat_anime/`;
- pet-pack manifest writes;
- arbitrary folder inspection outside the plugin package;
- returning image bytes;
- background or service access to the command bridge.

## Implementation

Updated files:

- `main.js`
- `src/main/plugins/manifest.js`
- `src/main/services/plugin-service.js`
- `src/shared/openpet-contracts.ts`
- `tests/plugins/manifest.test.js`
- `tests/services/plugin-service.test.js`
- `tests/shared/openpet-contracts-type-fixture.ts`
- plugin and project documentation

Behavior:

1. `assets:inspect` is now a known manifest permission.
2. Declaration-only commands still receive bridge URL/token only during explicit command runs.
3. `POST /creator/assets/inspect-frames` requires `assets:inspect`.
4. `PluginService` resolves `relativePath` under `manifest.basePath`, checks lexical containment, then checks realpath containment.
5. The route calls `actionImportService.inspectActionFrames({ sourceDir, actionId })`.
6. The response is `{ ok: true, result }`, where `result` contains `actionId`, `folderName`, and `inspection`.

## Decision Record

### Decision 1: package-local inspection only

- Problem: creator-tools authors need asset feedback, but arbitrary folder access would blur the extension trust boundary.
- Choice: resolve inspected folders under the plugin package directory.
- Reason: packaged assets are reviewable and map to the existing plugin package model.

### Decision 2: reuse action import inspection

- Problem: the plugin bridge should not become an image parser.
- Choice: call `ActionImportService.inspectActionFrames()`.
- Reason: one service keeps frame sorting, alpha checks, dimensions, warnings, and duplicate-action validation consistent.

### Decision 3: no generation in this phase

- Problem: generation and writes need rollback and stronger product affordances.
- Choice: Phase 82 inspects only.
- Reason: it gives authors a real capability while preserving the no-raw-write creator-tools boundary.

## Verification

Targeted:

```bash
node --test tests/plugins/manifest.test.js --test-name-pattern "asset inspection permission"
node --test tests/services/plugin-service.test.js --test-name-pattern "creator asset inspection"
npm run typecheck
```

Full:

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

## Outcome

After Phase 82, creator-tools plugins can inspect their packaged action frame folders through a permissioned, short-lived host bridge. The route remains package-local and read-only; raw writes, sprite generation, arbitrary folder inspection, and broader pack-authoring APIs remain future work.
