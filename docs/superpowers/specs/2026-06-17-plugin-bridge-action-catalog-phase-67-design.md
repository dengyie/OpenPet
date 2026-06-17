# Plugin Bridge Action Catalog Phase 67 Design

> Date: 2026-06-17
> Phase target: Phase 67

## Goal

Phase 67 gives explicit declaration-only plugin commands and services a narrow read-only way to discover the current pet action catalog through the existing loopback bridge.

This is a capability-downshift phase for third-party authors: a weather companion, action recommender, personality injector, or action design assistant should be able to know what actions currently exist before it decides what to announce or play. The host should support that discovery without handing plugins direct write access to action config, sprite assets, or arbitrary filesystem state.

## Current State

OpenPet already has:

- declaration-only command execution with JSON stdin context;
- explicit declaration-only service start/stop controls;
- a loopback-only bridge with `OPENPET_BRIDGE_URL` and `OPENPET_BRIDGE_TOKEN`;
- bridge routes for:
  - `GET /context`
  - `POST /pet/say`
  - `POST /pet/action`
  - `POST /pet/event`
- `PetService` as the single source of truth for current settings plus action snapshot state;
- `ActionService` as the source of the current normalized action config.

The current gap is that third-party plugins can tell the pet to play a known action id, but they cannot safely discover which action ids are currently available. That makes bridge-driven plugins unnecessarily brittle and pushes authors toward guesses, hardcoded action ids, or broader access requests than they actually need.

## Scope

In scope:

- add a new read-only bridge route for action discovery;
- keep the route available to the same explicit command and service bridge runs already supported in Phases 64 and 66;
- return a bounded summary of the current action catalog;
- keep action discovery sourced from existing pet/action runtime state rather than inventing a second store;
- update docs and phase records so plugin authors know they can safely inspect current actions.

Out of scope:

- no bridge route for editing action config;
- no bridge route for importing action frames or generating sprites;
- no direct filesystem paths, writable asset directories, or `cat_anime/` mutation support;
- no renderer, Electron, secret, or arbitrary main-process access;
- no service auto-start, setup bridge access, or background polling changes;
- no broad plugin SDK redesign.

## Proposed Route

Add:

- `GET /pet/actions`

This route should return a stable JSON shape such as:

```json
{
  "ok": true,
  "actions": {
    "selectedPetId": "legacy-cat",
    "defaultAction": "idle",
    "clickAction": "wave",
    "currentActionId": "idle",
    "items": [
      {
        "id": "idle",
        "label": "Idle",
        "kind": "idle",
        "loop": true,
        "frameCount": 16,
        "frameMs": 95
      },
      {
        "id": "wave",
        "label": "Wave",
        "kind": "greeting",
        "loop": false,
        "frameCount": 8,
        "frameMs": 85
      }
    ]
  }
}
```

## Design

### Source of truth

The action catalog should be derived from the same state OpenPet already exposes through `PetService.getSnapshot()`.

That keeps Phase 67 aligned with existing architecture:

- `PetService` remains the single source of truth for pet-facing state;
- bridge handlers stay inside `PluginService`;
- bridge responses do not reach into config files or sprite folders directly.

### Returned fields

The response should include only the fields plugin authors need for safe action selection:

- `selectedPetId`
- `defaultAction`
- `clickAction`
- `currentActionId`
- `items[]` with:
  - `id`
  - `label`
  - `kind`
  - `loop`
  - `frameCount`
  - `frameMs`

The route should intentionally exclude:

- sprite file URLs;
- preview sprite URLs;
- root paths;
- atlas geometry;
- frame dimensions;
- any writable config or import locations.

Those details are useful for host UI and asset tooling, but they are not required for safe bridge-driven plugin behavior and would widen the route surface unnecessarily.

### Bridge placement

The new route should live alongside existing bridge handlers in `PluginService`, not as a new local HTTP service or plugin SDK surface.

That preserves current guarantees:

- loopback-only transport;
- token-based authorization;
- per-entry-run scoping;
- shared logging and runtime cleanup.

### Logging

The host should log action-catalog reads with the same `pluginId` plus entry id pattern already used for bridge activity.

Suggested message:

- `Bridge pet.actions requested`

This is enough for troubleshooting without leaking tokens or large payloads.

## Security Boundary

The action catalog route is intentionally read-only and bounded.

It remains:

- loopback-only;
- bearer-token gated;
- per-entry-run scoped;
- token-free in logs;
- sourced from existing host state only;
- narrower than exposing filesystem or action asset internals.

This phase improves third-party author ergonomics without claiming sandbox strength or turning the bridge into a general runtime API.

## Testing Strategy

Required coverage:

- explicit command bridge runs can call `GET /pet/actions`;
- explicit service bridge runs can call `GET /pet/actions`;
- the route returns the bounded action catalog shape;
- invalid token and expired bridge requests are rejected;
- existing `GET /context`, `POST /pet/say`, `POST /pet/action`, and `POST /pet/event` behavior remains unchanged.

Useful fixture expectations:

- `selectedPetId`, `defaultAction`, and `clickAction` reflect the current snapshot;
- `items[]` includes normalized action metadata like `id`, `label`, `kind`, `loop`, `frameCount`, and `frameMs`;
- excluded fields such as sprite URLs are not present in the bridge response.

## Documentation Impact

Update:

- `README.md`
- `README.zh-CN.md`
- `docs/plugin-development.md`
- `docs/plugin-ecosystem-rules.md`
- `docs/HANDOFF.md`
- `docs/development-summary.md`
- `docs/project-status-review.md`
- `docs/productization-v1.1-todo-design.md`
- `docs/project-context.json`
- new Phase 67 phase/review docs

Docs should frame this as a practical plugin-author capability: extensions can discover available actions before choosing one, which helps weather pets, action companions, and personality tools stay robust across different pet packs.

## Acceptance

Phase 67 is complete when:

- explicit bridge runs can read the current action catalog from `GET /pet/actions`;
- the response is bounded to safe action-summary fields;
- invalid token and expired bridge requests are rejected;
- docs describe the new read-only action-discovery capability without overclaiming broader plugin power.
