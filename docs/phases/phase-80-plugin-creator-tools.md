# Phase 80: Plugin Creator-Tools Action Bridge

> Date: 2026-06-18
> Scope: add a host-mediated creator-tools path for reading, validating, and applying bounded action configuration mutations from declaration-only extension commands.

## Goal

Phase 64 gave declaration-only command entries a short-lived local bridge for `pet.say`, `pet.action`, `pet.event`, and bounded context reads. Phase 80 extends that bridge so creator-tools extensions can safely inspect and update pet action configuration without raw filesystem writes.

The new capability is intentionally narrow:

- manifest `profile` is now normalized as `runtime`, `creator-tools`, or `hybrid`;
- creator-tools extensions can declare `actions:read` and `actions:write`;
- declaration-only command runs now receive host-owned `OPENPET_DATA_DIR`, `OPENPET_CACHE_DIR`, and `OPENPET_LOG_DIR`;
- the bridge now supports host-mediated action reads, validation, and apply flows.

## Scope

In scope:

- normalize and expose manifest `profile`;
- accept `actions:read` and `actions:write` permissions;
- surface profile and permissions in install review and runtime listing;
- expose `GET /creator/actions`;
- expose `POST /creator/actions/validate`;
- expose `POST /creator/actions/apply`;
- validate bounded action mutation payloads in the action service boundary;
- apply bounded action-config mutations through host-managed persistence for either the legacy config file or the active installed pack manifest.

Out of scope:

- raw filesystem write access for extensions;
- direct plugin writes into `cat_anime/` frame folders;
- sprite generation from the creator bridge;
- arbitrary pet pack manifest writes beyond the active installed pack action fields;
- widening the bridge into a general host RPC system.

## Implementation

Updated files:

- `src/main/plugins/manifest.js`
- `src/main/services/action-service.js`
- `src/main/services/plugin-install-service.js`
- `src/main/services/plugin-service.js`
- `src/shared/openpet-contracts.ts`
- targeted tests under `tests/plugins/`, `tests/services/`
- extension ecosystem live docs

Behavior:

1. `plugin.json` may now declare `profile: "runtime" | "creator-tools" | "hybrid"`.
2. Omitted `profile` defaults to `runtime`.
3. Review/install surfaces now carry `profile` and creator-tools permissions.
4. Declaration-only command runs receive:
   - `OPENPET_DATA_DIR`
   - `OPENPET_CACHE_DIR`
   - `OPENPET_LOG_DIR`
   - existing `OPENPET_BRIDGE_URL`
   - existing `OPENPET_BRIDGE_TOKEN`
5. The bridge now accepts:
   - `GET /creator/actions`
   - `POST /creator/actions/validate`
   - `POST /creator/actions/apply`
6. `ActionService` now owns creator mutation validation and bounded apply for legacy action configuration plus active installed pack action fields when pet-pack persistence is available.

## Decision Record

### Decision 1: keep creator mutation in `ActionService`

- Problem: adding creator-tools support inside `PluginService` would blur runtime bridge code with action-config ownership.
- Choice: let `PluginService` enforce permissions and route bridge requests, but keep validation/apply logic in `ActionService`.
- Reason: the write path stays testable, bounded, and aligned with existing action config behavior.

### Decision 2: bridge-backed writes, not direct paths

- Problem: creator-tools plugins need useful authoring power, but direct writes would bypass reviewable host boundaries.
- Choice: expose host-managed action reads, validation, and apply operations through the short-lived bridge.
- Reason: the mutation surface stays explicit and permission-gated, while plugins can still build useful editors and inspectors.

### Decision 3: current apply stays inside existing host-owned persistence paths

- Problem: creator-tools writes need a real persistence path, but Phase 80 must not open raw or general-purpose pack authoring writes.
- Choice: Phase 80 applies bounded creator mutation only through existing host-owned persistence paths: legacy `cat_anime/animations.json` or the active installed pack manifest action fields.
- Reason: it ships a real creator-tools slice now while keeping the write boundary narrow and reviewable instead of introducing a broader pack-authoring API.

## Verification

Targeted:

```bash
node --test tests/plugins/manifest.test.js tests/services/plugin-install-service.test.js tests/services/action-service.test.js tests/services/plugin-service.test.js
```

Full:

```bash
npm run check:syntax
npm test
npm run test:control-center
npm run typecheck
git diff --check
```

## Outcome

After Phase 80, OpenPet has its first real creator-tools host path: local declaration-only extension commands can inspect current action state, validate bounded mutations, and apply bounded action metadata updates through a permissioned host bridge. The platform still does not grant raw write access or general asset generation from extension code.
