# Plugin Creator-Tools Phase 80 Design

**Goal:** Give third-party extensions a host-mediated creator-tools path for reading and updating pet action configuration, so authors can build action editors, config manipulators, and asset-prep helpers without raw filesystem writes.

**Architecture:** Keep the existing plugin core, isolated process runner, and review pipeline. Add a narrow creator-tools API layer in the main process for action metadata reads, action list proposals, default/click action updates, and action validation. Treat this as host-mediated state mutation, not general file access, and preserve the current runtime bridge and service lifecycle boundaries unchanged.

**Tech Stack:** Electron main process, CommonJS services, Node native test runner, shared TypeScript contracts, Control Center review surfaces.

---

## Problem

OpenPet's current extension story already supports runtime plugins, explicit services, dashboards, and a short-lived command bridge. That covers live behavior and speech, but it still leaves a major gap for creator-tools authors: they can inspect and run extensions, but they cannot yet safely edit action configuration, generate structured action proposals, or validate pet action changes through a supported host API.

The existing docs already describe this as a first-class ecosystem need. The missing piece is a conservative host-mediated capability slice that helps authors build pet-action editors, frame inspectors, and sprite-pack authoring helpers without giving them arbitrary writes to project files or `cat_anime/`.

## Scope

In scope:

- add a `creator-tools` phase to the plugin ecosystem model;
- support manifest `profile` values of `runtime`, `creator-tools`, and `hybrid`;
- expose host-mediated action configuration APIs for local extensions;
- allow creator-tools plugins to read action lists and propose or apply bounded action metadata updates;
- allow creator-tools plugins to update `defaultAction` and `clickAction` through the host;
- validate action ids, labels, sprite paths, frame metadata, and completeness before saving;
- surface the new profile and capability wording in docs and review surfaces;
- cover the new behavior with focused tests.

Out of scope:

- general-purpose filesystem write access;
- direct modification of `cat_anime/` by plugins;
- unrestricted sprite generation or arbitrary image synthesis APIs;
- full personality-engine writes;
- remote marketplace/backend work;
- changing the current short-lived bridge, runtime service lifecycle, or sandbox model.

## Decisions

### Decision 1: host-mediated action mutation only

The creator-tools layer will not expose raw file writes or unrestricted config access. All action edits flow through a typed main-process API so OpenPet can validate, log, and roll back the mutation shape.

### Decision 2: profile declaration is explicit but lightweight

The manifest will accept `profile` values for `runtime`, `creator-tools`, and `hybrid`. The initial phase will use that field for review and presentation, without introducing a second packaging format or a separate plugin type.

### Decision 3: asset generation stays indirect for now

This phase will prepare the authoring path for action editors, frame inspectors, and metadata generators, but it will not yet grant direct unrestricted sprite generation or general image-write primitives. That keeps the first creator-tools slice reviewable and narrow.

## Expected Result

After this phase, third-party authors can build useful creator-tools plugins such as:

- a pet action editor that updates default/click actions;
- a frame-folder inspector that validates action completeness;
- an action metadata generator that proposes safe action entries;
- a sprite-pack normalizer that prepares action configuration for import.

Those plugins will still operate under the existing review and permission model, but they will have a meaningful supported path instead of needing to hack around host limits.

## Current State

OpenPet already has adjacent capabilities we should reuse instead of bypassing:

- `PetService` remains the single source of truth for runtime pet state.
- `ActionService` already exposes the current action configuration used by the renderer.
- `action-import-service` and `sprite-generator` already own frame inspection, sprite generation, and config updates for first-party UI flows.
- `PluginService.runCommand()` already supports explicit local `entries.commands` processes with stdin JSON context, cwd guards, no shell expansion, timeout handling, and a short-lived bridge for live pet actions.
- Manifest normalization already supports `entries.*`, assets, data-location declarations, and explicit service/dashboard/command review surfaces.

What is missing is a creator-tools API family that lets a declaration-only extension ask the host to read and update action configuration in a narrow, reviewable way.

## Design Overview

Phase 80 adds the first creator-tools host API family under the declaration-only command model.

When a local enabled extension with the appropriate creator-tools permissions runs an explicit command, OpenPet should allow that command to:

1. discover its host-provided creator directories;
2. read the current action configuration and available action metadata;
3. validate a proposed action mutation payload;
4. apply a bounded action mutation through the host;
5. receive a normalized mutation result.

This keeps the write path:

- typed;
- narrow;
- synchronous with existing action services;
- testable through service-layer tests;
- and explicit in the extension manifest and review surfaces.

## Manifest Model

### `profile`

`plugin.json` gains an optional `profile` field:

- `runtime`
- `creator-tools`
- `hybrid`

Default behavior when omitted:

- keep current compatibility semantics;
- treat the plugin as `runtime` for display purposes unless it later adopts creator-tools permissions.

The field is advisory for this phase, but it must be structurally normalized and visible in plugin review data.

### New permissions

This phase introduces the first creator-tools-facing product permissions:

- `actions:read`
- `actions:write`

For Phase 80, only `actions:read` and `actions:write` must be runtime-backed. Broader permissions such as `assets:inspect`, `assets:generate`, `pet-pack:read`, and `pet-pack:write` remain future-facing and must not be normalized as supported runtime powers in this phase.

## Host-Provided Command Environment

Declaration-only command runs should continue receiving:

- stdin JSON context;
- `OPENPET_BRIDGE_URL`;
- `OPENPET_BRIDGE_TOKEN`.

Phase 80 adds host-managed creator directories to the command environment:

- `OPENPET_DATA_DIR`
- `OPENPET_CACHE_DIR`
- `OPENPET_LOG_DIR`

These are recommendation paths owned by the host for the extension, not proof of broad filesystem entitlement.

`OPENPET_RESULT_PATH` remains out of scope for this phase unless it is implemented end-to-end and covered by tests. If not implemented, docs must continue treating it as future-facing rather than current fact.

## Creator-Tools API Surface

Phase 80 should expose creator-tools operations through the same short-lived command bridge model rather than through direct file access.

### `GET /creator/actions`

Returns a bounded read model:

- current `defaultAction`
- current `clickAction`
- normalized actions array with ids, labels, kind, sprite, frame metadata, loop, atlas info, and preview-safe sprite references when already available through existing host services

Permission required:

- `actions:read`

### `POST /creator/actions/validate`

Accepts a proposed mutation payload and returns validation output without saving.

The first-phase payload should support:

- replacing `defaultAction`
- replacing `clickAction`
- upserting one or more action metadata entries

Validation must reject:

- unsafe ids;
- duplicate ids;
- invalid default/click action references;
- unsafe sprite paths;
- invalid frame counts, dimensions, and durations;
- malformed atlas metadata.

Permission required:

- `actions:write`

### `POST /creator/actions/apply`

Accepts the same normalized mutation payload, applies it through host services, persists the updated configuration, and returns the refreshed action view state.

The write path must:

- reuse existing action/config normalization logic where practical;
- avoid bypassing current action-service assumptions;
- not expose arbitrary file write paths;
- keep mutation scope limited to the action configuration surface.

Permission required:

- `actions:write`

## Mutation Model

The first mutation model should stay deliberately small.

Supported operations:

- set `defaultAction`
- set `clickAction`
- upsert action metadata for existing or newly proposed action ids

Action metadata fields in scope:

- `id`
- `label`
- `kind`
- `sprite`
- `frameCount`
- `frameMs`
- `frameWidth`
- `frameHeight`
- `frameRow`
- `frameColumn`
- `loop`
- `atlas`
- `frameDurations`

Out of scope for this phase:

- importing frame folders directly from the plugin bridge;
- generating sprite images on the host;
- deleting action frame directories;
- editing bundled pack assets;
- writing arbitrary JSON blobs into unrelated config files.

## Service Ownership

The mutation logic should live in the existing action/config service boundary, not inside plugin manifest handling.

Recommended layering:

- `PluginService` owns permission checks, command bridge routing, and command-run scoping.
- `ActionService` or a focused helper it delegates to owns reading, validating, and applying action-config mutations.
- Shared contracts define the mutation request/response shapes consumed by tests and future UI surfaces.

This avoids turning `PluginService` into the authoring engine while still keeping extension access scoped and reviewable.

## Docs And Review Impact

This phase must update current docs to say:

- creator-tools is now a real host-backed path, not only a future concept;
- Phase 80 currently supports action configuration reads and bounded writes only;
- sprite generation, deeper asset generation, and broad pet-pack writes remain future phases;
- extensions still must not edit `cat_anime/` directly unless the user is intentionally working on core app assets.

Plugin review/install surfaces should show:

- normalized `profile`;
- creator-tools permissions in the same permission list model as existing runtime powers.

## Testing

Required coverage:

- manifest normalization accepts and validates `profile`;
- manifest normalization accepts new creator-tools permissions only when explicitly supported;
- declaration-only command env includes `OPENPET_DATA_DIR`, `OPENPET_CACHE_DIR`, and `OPENPET_LOG_DIR`;
- bridge rejects creator-tools routes without the right permissions;
- `GET /creator/actions` returns the expected normalized action view shape;
- validate route rejects malformed or unsafe proposals;
- apply route persists bounded updates and refreshes action view state;
- existing command bridge and runtime plugin behavior do not regress.

Full verification remains:

```bash
npm test
npm run test:control-center
npm run typecheck
npm run check:syntax
git diff --check
```

## Acceptance

Phase 80 is complete when:

- creator-tools profile vocabulary exists in normalized plugin manifests and current docs;
- creator-tools command runs receive host-managed data/cache/log directory env vars;
- local enabled extensions can read current action configuration through a host-backed creator-tools route;
- local enabled extensions with `actions:write` can validate and apply bounded action configuration updates through the host;
- all writes remain host-mediated and no raw arbitrary file write capability is introduced;
- targeted tests and full project verification pass;
- production review records no unresolved blocking issues.

## Risks

### Risk: `PluginService` becomes too broad

Mitigation:

Keep bridge routing and permission enforcement in `PluginService`, but keep action mutation semantics in action/config services.

### Risk: creator-tools writes accidentally expose broader filesystem mutation

Mitigation:

Confine Phase 80 to action configuration only. Do not expose raw paths or arbitrary write targets.

### Risk: docs overclaim deeper creator-tool power than the runtime actually ships

Mitigation:

Explicitly state that Phase 80 delivers action-config creator tooling only, while sprite generation, richer asset APIs, and pet-pack writes remain future work.

## Outcome

Phase 80 should make the ecosystem materially more welcoming for serious third-party creators without collapsing the safety story. It gives plugin authors a real first creator-tools slice that matches the documented product direction, while keeping the boundary narrow enough for production review and regression testing.
