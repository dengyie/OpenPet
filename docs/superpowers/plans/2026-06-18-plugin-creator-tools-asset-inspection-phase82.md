# Plugin Creator-Tools Asset Inspection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only creator-tools asset inspection bridge route for package-local action frame folders.

**Architecture:** Keep `PluginService` responsible for permission checks, short-lived bridge routing, and plugin package path confinement. Reuse `actionImportService.inspectActionFrames()` for image/frame validation so the plugin bridge does not gain direct image-processing ownership.

**Tech Stack:** Electron main process, CommonJS services, Node native test runner, shared TypeScript contracts, production-code-quality-review workflow.

---

## File Map

- Modify: `src/main/plugins/manifest.js`
  Purpose: allow the new `assets:inspect` permission.
- Modify: `tests/plugins/manifest.test.js`
  Purpose: prove `assets:inspect` is a supported permission.
- Modify: `src/main/services/plugin-service.js`
  Purpose: add safe plugin-local asset path resolution and bridge routing for `POST /creator/assets/inspect-frames`.
- Modify: `tests/services/plugin-service.test.js`
  Purpose: cover successful inspection, missing permission, path traversal, and symlink escape behavior.
- Modify: `main.js`
  Purpose: inject the existing action import service into `PluginService`.
- Modify: `src/shared/openpet-contracts.ts`
  Purpose: add plugin-facing request/response contracts for asset frame inspection.
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
  Purpose: keep the TypeScript contract fixture aligned.
- Create: `docs/phases/phase-82-plugin-creator-tools-asset-inspection.md`
  Purpose: record the delivered phase boundary and validation.
- Create: `docs/reviews/phase-82-plugin-creator-tools-asset-inspection-review.md`
  Purpose: record production review results.
- Modify: `docs/plugin-development.md`, `docs/plugin-ecosystem-rules.md`, `docs/productization-v1.1-todo-design.md`, `docs/development-summary.md`, `docs/project-status-review.md`, `docs/HANDOFF.md`, `docs/project-context.json`
  Purpose: keep live developer and project-state docs synchronized.

## Task 1: Permission RED/GREEN

- [ ] **Step 1: Add a failing manifest test**

Add to `tests/plugins/manifest.test.js`:

```js
test('normalizes creator-tools asset inspection permission', () => {
  const manifest = normalizePluginManifest({
    id: 'asset-inspector',
    name: 'Asset Inspector',
    version: '1.0.0',
    profile: 'creator-tools',
    permissions: ['assets:inspect']
  })

  assert.equal(manifest.profile, 'creator-tools')
  assert.deepEqual(manifest.permissions, ['assets:inspect'])
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/plugins/manifest.test.js --test-name-pattern "asset inspection permission"
```

Expected: FAIL with `Unknown plugin permission: assets:inspect`.

- [ ] **Step 3: Implement permission allowlist**

Add `'assets:inspect'` to `KNOWN_PLUGIN_PERMISSIONS` in `src/main/plugins/manifest.js`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/plugins/manifest.test.js --test-name-pattern "asset inspection permission"
```

Expected: PASS.

## Task 2: Bridge RED/GREEN

- [ ] **Step 1: Add failing bridge tests**

Add tests to `tests/services/plugin-service.test.js` that:

- create package-local PNG frames under `weather-declaration/assets/actions/wave`;
- run a declaration-only creator-tools command with `permissions: ['assets:inspect']`;
- call `POST /creator/assets/inspect-frames`;
- assert `200` and `result.inspection.valid === true`;
- assert a plugin without `assets:inspect` gets `403`;
- assert `../outside` and a symlink escaping the plugin directory return `400`.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "creator asset inspection"
```

Expected: FAIL because the route and permission do not exist yet.

- [ ] **Step 3: Implement bridge routing**

In `src/main/services/plugin-service.js`:

- accept `actionImportService` in `createPluginService()`;
- add `resolvePluginAssetPath(manifest, relativePath)` with lexical and realpath containment checks;
- add `creatorAssetInspectFrames(payload)` to bridge handlers;
- require `assets:inspect`;
- route `POST /creator/assets/inspect-frames` after JSON body parsing;
- return `{ ok: true, result }`.

- [ ] **Step 4: Wire app service injection**

In `main.js`, pass `actionImportService` into `createPluginService()`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "creator asset inspection"
```

Expected: PASS.

## Task 3: Shared Contracts

- [ ] **Step 1: Add type fixture usage**

Add a `CreatorAssetsInspectFramesRequest` and `CreatorAssetsInspectFramesResponse` fixture in `tests/shared/openpet-contracts-type-fixture.ts`.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run typecheck
```

Expected: FAIL because the types are not exported.

- [ ] **Step 3: Add contract types**

Add to `src/shared/openpet-contracts.ts`:

```ts
export interface CreatorAssetsInspectFramesRequest {
  relativePath: string
  actionId: string
}

export interface CreatorAssetsInspectFramesResponse {
  ok: boolean
  result: CompletedActionFrameInspectionResult
}
```

Also include `'assets:inspect'` in the `PluginPermission` union if present.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm run typecheck
```

Expected: PASS.

## Task 4: Docs, Review, Verification, Commit

- [ ] **Step 1: Write phase and review docs**

Create phase and review docs that state:

- `assets:inspect` is read-only;
- inspection is package-local;
- symlink escapes are blocked;
- sprite generation and raw writes remain out of scope.

- [ ] **Step 2: Refresh live docs**

Update current docs to say creator-tools now supports action config APIs plus package-local frame inspection. Do not claim sprite generation, pet-pack writes, arbitrary folder access, or sandbox completeness.

- [ ] **Step 3: Run production review**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Then perform a `deep` review of the Phase 82 diff and record severity, recommendations, score, pass state, fixes, and residual risks in the review doc.

- [ ] **Step 4: Run complete verification**

Run:

```bash
node --test tests/plugins/manifest.test.js
node --test tests/services/plugin-service.test.js --test-name-pattern "creator asset inspection|creator-tools|declaration-only creator action bridge"
npm run typecheck
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

Expected: all pass.

- [ ] **Step 5: Commit atomically**

Run:

```bash
git add main.js src/main/plugins/manifest.js tests/plugins/manifest.test.js src/main/services/plugin-service.js tests/services/plugin-service.test.js src/shared/openpet-contracts.ts tests/shared/openpet-contracts-type-fixture.ts docs/plugin-development.md docs/plugin-ecosystem-rules.md docs/phases/phase-82-plugin-creator-tools-asset-inspection.md docs/reviews/phase-82-plugin-creator-tools-asset-inspection-review.md docs/productization-v1.1-todo-design.md docs/development-summary.md docs/project-status-review.md docs/HANDOFF.md docs/project-context.json docs/superpowers/specs/2026-06-18-plugin-creator-tools-asset-inspection-phase82-design.md docs/superpowers/plans/2026-06-18-plugin-creator-tools-asset-inspection-phase82.md
git commit -m "feat(阶段82): add creator asset inspection bridge"
```

## Self-Review Checklist

- [ ] The route is permission-gated by `assets:inspect`.
- [ ] The route accepts only package-local relative paths.
- [ ] Symlink escapes are rejected before frame inspection.
- [ ] `PluginService` does not perform image parsing itself.
- [ ] No raw filesystem write, sprite generation, pet-pack write, or personality mutation API is added.
- [ ] Docs describe this as a narrow read-only bridge capability.
