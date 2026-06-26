# Plugin Service Architecture Checkpoint

> Last updated: 2026-06-26  
> Scope: `src/main/services/plugin-service.js` and the extracted plugin service controllers beside it.

## Purpose

This document records the current architecture boundary for `PluginService` after the 2026-06-26 controller extraction sequence. Its goal is to answer two questions:

1. Which responsibilities have already been split into dedicated modules?
2. Which responsibilities should remain in `PluginService` because they are orchestration, not domain-isolated logic?

This is a stop-splitting checkpoint. Further extraction should happen only when a remaining responsibility becomes independently risky, independently testable, or reused from outside `PluginService`.

## Current Shape

`PluginService` now acts as a composition root and runtime orchestrator for the plugin host. It is responsible for:

- assembling injected dependencies from Electron/main-process services
- wiring specialized controllers together
- exposing the public plugin host API used by IPC/control-center paths
- handling top-level command/setup/service/dashboard entry points
- owning final error logging boundaries for user-triggered operations

It is no longer the primary home for low-level policy, projection, creator bridge, or settings-write logic.

## Extracted Boundaries

The following boundaries are already split and should stay split:

| Boundary | File | Responsibility |
| --- | --- | --- |
| Resolution | `src/main/services/plugin-resolution-controller.js` | Resolve plugins and declared entries with enabled/allowed gating |
| Config/storage | `src/main/services/plugin-config-storage-controller.js` | Schema-backed config reads/writes and private storage persistence |
| Runtime SDK | `src/main/services/plugin-runtime-sdk-controller.js` | Build the restricted plugin SDK and command registration surface |
| Creator bridge handlers | `src/main/services/plugin-bridge-handlers-controller.js` | Host bridge routes for creator tools and pet bridge actions |
| Asset/path resolution | `src/main/services/plugin-asset-path-controller.js` | Package/data/picker path resolution and symlink containment |
| Listing/projection | `src/main/services/plugin-listing-controller.js` | Plugin list views, runtime projection, setup/service presentation |
| Policy/signature gating | `src/main/services/plugin-policy-controller.js` | Block status, allow checks, signature status presentation |
| Management operations | `src/main/services/plugin-management-controller.js` | Enable/disable, config save, service-health-policy save, storage clear |
| Dashboard open | `src/main/services/plugin-dashboard-open-controller.js` | Safe dashboard URL opening |
| Command run | `src/main/services/plugin-command-run-controller.js` | Official/local/declaration command execution routing |
| Setup process | `src/main/services/plugin-setup-process-controller.js` | Declared setup process execution |
| Command entry process | `src/main/services/plugin-command-entry-process-controller.js` | Declaration command process runs and bridge lifecycle |
| Service launch/health/lifecycle/stop/runtime | `plugin-service-*.js` controllers/managers | Long-running service process orchestration split by concern |

Runtime note:

- Declaration-only setup and command process controllers now wait for child `close` before resolving final success/failure so trailing stdout/stderr stays available for JSON result parsing, logging, and user-facing diagnostics.

## Remaining Responsibilities In `PluginService`

The remaining code in `src/main/services/plugin-service.js` is mostly appropriate orchestration:

### 1. Shared local helpers

These are still local because they are tightly scoped implementation details rather than stable boundaries:

- log store read/write helpers
- creator directory bootstrap
- service command parsing
- bounded stdout parsing
- storage key/value guard helpers
- service health view formatting
- service-process fallback kill helpers
- final orchestration around command/setup/service entry-point logging and user-facing error surfaces

These helpers are small, directly consumed by the composition root, and do not currently justify separate modules.

### 2. Dependency assembly

`PluginService` wires controllers together with concrete collaborators:

- settings-backed maps
- runtime managers
- process spawners
- `PetService`, `ActionService`, `PetPackService`, AI/image services
- external open/fetch/timer/process hooks

This assembly belongs in one place. Splitting it further would mostly move constructor plumbing into more files without reducing risk.

### 3. Public entry-point orchestration

The methods below remain appropriate at the service boundary:

- `runCommand`
- `runSetup`
- `openDashboard`
- `startService`
- `stopService`
- `checkServiceHealth`
- `stopAllServices`
- `getLogs` / `exportLogs` / `clearLogs`

Reason: these methods define the public host API and own the final user-visible error/logging contract. They coordinate multiple controllers at once, so moving them out would not create a cleaner domain boundary.

## Why Splitting Stops Here

The recent extractions removed the major high-risk clusters:

- policy decisions
- path safety
- creator bridge breadth
- list/config/storage projection
- settings mutation side effects

What remains is mostly cross-controller composition. Further splitting right now would likely produce:

- wrapper controllers with little standalone behavior
- more indirection around already-clear call paths
- duplicated constructor plumbing
- weaker locality when debugging runtime entry points

That is a maintainability loss, not a gain.

## Rules For Future Extraction

Open a new extraction milestone only if a remaining block meets at least one of these conditions:

1. It contains independent state transitions or validation rules that can be tested without the rest of `PluginService`.
2. It is reused by multiple entry points and changes together as a unit.
3. It owns a security boundary, filesystem boundary, or external process/network boundary that deserves isolated review.
4. The current inline code becomes large enough that review quality measurably drops.

Do not extract code only because:

- the file still looks long
- the logic is already thin orchestration
- the new file would mostly forward calls
- there is no new correctness or review benefit

## Review Conclusion

Current assessment:

- behavior layering is reasonable
- dependency direction is acceptable
- high-risk logic has been moved out of `PluginService`
- remaining `PluginService` responsibilities are primarily composition and entry-point coordination

Recommendation:

- stop mechanical controller extraction on this branch
- keep future work focused on real behavior changes or newly-emergent risk clusters
- use this document as the architecture gate before opening another `plugin-service` split milestone

## Verification Evidence

The extraction sequence was continuously validated against:

- `node --test tests/services/plugin-service.test.js`
- dedicated controller tests under `tests/services/plugin-*-controller.test.js`

The goal of this checkpoint is architectural clarity, not new runtime behavior.
