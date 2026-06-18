# Phase 85: Plugin Creator-Tools User-Approved Picker Imports

> Date: 2026-06-18
> Scope: add host-mediated native folder picker routes for creator-tools frame inspection and import.

## Goal

Phase 85 closes the next asset-authoring gap after package-local imports. Declaration-only creator-tools commands can now ask OpenPet to open a native directory picker and, only after the user approves a folder, inspect or import external action frames through the host.

## Scope

In scope:

- `POST /creator/assets/pick-frames/inspect`
- `POST /creator/assets/pick-frames/import`
- existing `assets:inspect` and `assets:generate` permissions
- host-owned native directory picker
- no raw selected path in bridge responses
- existing symlink, frame, pixel, and byte import guards

Out of scope:

- arbitrary plugin filesystem access
- plugin-selected output paths
- persistent folder grants
- built-in pack writes
- arbitrary pet-pack writes
- multi-folder batch imports

## Implementation

Updated runtime files:

- `main.js`
- `src/main/services/plugin-service.js`
- `src/shared/openpet-contracts.ts`

Updated tests:

- `tests/services/plugin-service.test.js`
- `tests/shared/openpet-contracts-type-fixture.ts`

Behavior:

1. `PluginService` accepts an injected `selectCreatorAssetFrameFolder` host function.
2. Electron wires that function to `dialog.showOpenDialog({ properties: ['openDirectory'] })`.
3. Picker inspect requires `assets:inspect`.
4. Picker import requires `assets:generate`.
5. Canceled picker flows return `{ ok: true, canceled: true }` without inspecting or importing.
6. Approved folders are checked by the host, rejected when missing, not directories, or containing symlinks, and never returned to the command bridge response.
7. Import reuses `ActionImportService` plus the Phase 83 import limits before regenerating sprites/action config.

## Decision Record

### Decision 1: separate picker routes from package-local routes

- Problem: Phase 82/83 routes use plugin package-relative paths, while this workflow depends on explicit user picker consent.
- Choice: add `/creator/assets/pick-frames/inspect` and `/creator/assets/pick-frames/import`.
- Reason: route names make the consent boundary visible to plugin authors and reviewers.

### Decision 2: do not return the selected path

- Problem: external folder paths can reveal private local filesystem information and could be reused as implicit grants.
- Choice: return inspection/import results only.
- Reason: the plugin gets the outcome it needs without receiving raw filesystem authority or path data.

### Decision 3: reuse existing asset import limits

- Problem: user-picked folders have the same resource and symlink risks as package-local folders.
- Choice: route both through the same symlink and size guard helpers before import.
- Reason: one policy keeps behavior predictable and avoids a weaker second path.

## Verification

Targeted verification during implementation:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "picker"
```

Result:

- `tests/services/plugin-service.test.js`: 126/126 pass for the picker-pattern run.

Full local verification:

```bash
npm run check:syntax        # pass
npm run typecheck           # pass
npm test                    # 602/602 pass
npm run test:control-center # 10/10 pass
git diff --check            # pass
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# project-context ok
```

## Outcome

Creator-tools commands can now support a more realistic asset workflow: ask the user to choose a frame folder, inspect it, and import it into OpenPet without granting arbitrary path reads, plugin-selected writes, or broad pet-pack mutation powers.
