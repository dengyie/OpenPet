# Phase 83: Plugin Creator-Tools Sprite Import

> Date: 2026-06-18
> Scope: add a host-mediated creator-tools bridge route for package-local action frame import and sprite/config regeneration.

## Goal

Phase 83 turns the Phase 82 read-only frame inspection capability into a complete but still bounded creator workflow.

Declaration-only creator-tools commands can now ask OpenPet to import a packaged action frame folder and regenerate action sprites/config through the host. The plugin never receives raw write access to `cat_anime/`, arbitrary output paths, Electron APIs, or unrestricted Node filesystem powers.

## Scope

In scope:

- normalize the `assets:generate` permission;
- expose `POST /creator/assets/import-frames` through the existing short-lived command bridge;
- require `assets:generate` separately from `assets:inspect`;
- resolve `relativePath` under the plugin package directory only;
- reject traversal, absolute paths, missing folders, non-folders, target-folder symlink escapes, and nested symlink assets before import;
- preflight imports with frame-count, frame-pixel, generated-sprite-pixel, and source-folder-byte limits;
- reuse `ActionImportService.importActionFrames()` for copied frames, generated sprites, and `animations.json` writes;
- return the updated action config and the imported action metadata;
- add shared TypeScript contracts for the request/response shape.

Out of scope:

- raw plugin filesystem writes;
- plugin-selected output paths;
- arbitrary user-folder imports;
- pet-pack manifest writes;
- AI image synthesis or generated frame creation;
- renderer UI changes;
- complete plugin sandboxing claims.

## Implementation

Updated runtime files:

- `src/main/plugins/manifest.js`
- `src/main/services/plugin-service.js`
- `src/shared/openpet-contracts.ts`

Updated tests:

- `tests/plugins/manifest.test.js`
- `tests/services/plugin-service.test.js`
- `tests/shared/openpet-contracts-type-fixture.ts`

Behavior:

1. `assets:generate` is accepted by manifest normalization.
2. Declaration-only command bridge routing now includes `/creator/assets/import-frames`.
3. The route requires `assets:generate`; `assets:inspect` alone receives `403`.
4. The source folder uses the existing package-local lexical plus realpath guard from Phase 82.
5. `PluginService` rejects symlinks anywhere under the inspected/imported source folder before image metadata reads or import writes.
6. `PluginService` preflights inspected frames before any write:
   - at most 240 frames;
   - at most 1,048,576 pixels per frame cell;
   - at most 48,000,000 generated sprite pixels;
   - at most 50 MiB source folder bytes.
7. Duplicate action ids are rejected during preflight and do not overwrite existing action folders.
8. Successful imports return `{ ok, actions, importedAction }`.

## Decision Record

### Decision 1: use `assets:generate` for a host import route

- Problem: creators need sprite generation, but a generic generator or raw output writer would expand the trust boundary too far.
- Choice: expose `/creator/assets/import-frames` behind `assets:generate`.
- Reason: the permission signals write/generation power, while the route keeps the host in charge of where frames, sprites, and config are written.
- Risk: authors who expect arbitrary sprite output need a future reviewed API instead.

### Decision 2: keep sources package-local

- Problem: arbitrary user-folder reads would make plugin review and permission prompts harder.
- Choice: import only frame folders inside the plugin package.
- Reason: packaged assets are reviewable, reproducible, and compatible with submission bundle review.
- Risk: user-selected external folder workflows remain future work.

### Decision 3: preflight resource limits before import

- Problem: Sharp sprite generation can allocate large buffers.
- Choice: enforce frame, pixel, and byte limits before calling the write path.
- Reason: third-party bridge calls need a tighter guard than first-party local UI imports.
- Risk: very large legitimate animation sets may need an explicitly reviewed limit increase later.

## Verification

Targeted local verification:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "creator asset import bridge"
node --test tests/plugins/manifest.test.js --test-name-pattern "asset generation permission"
npm run typecheck
```

Full local verification:

```bash
npm run check:syntax        # pass
npm test                    # 586/586 pass
npm run test:control-center # 10/10 pass
git diff --check            # pass
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

## Outcome

Third-party creator-tools authors now have a useful package-local action asset workflow:

- inspect packaged frames with `assets:inspect`;
- import packaged frames and regenerate action sprites/config with `assets:generate`.

OpenPet still does not grant raw filesystem writes, arbitrary folder access, plugin-selected output paths, pet-pack writes, or complete sandboxing guarantees.
