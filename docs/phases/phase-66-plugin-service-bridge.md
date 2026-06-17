# Phase 66: Plugin Service Bridge

> Date: 2026-06-17
> Branch: `codex/plugin-service-bridge-phase66`
> Status: implemented locally

## Goal

Let explicitly started declaration-only plugin service entries use the same narrow pet-aware bridge already available to declaration-only command runs.

## What Changed

- `PluginService` now uses a shared plugin entry bridge registry for both declaration-only commands and explicitly started services.
- Explicit service runs now receive:
  - `OPENPET_BRIDGE_URL`
  - `OPENPET_BRIDGE_TOKEN`
- The service bridge supports the same bounded routes as command runs:
  - `GET /context`
  - `POST /pet/say`
  - `POST /pet/action`
  - `POST /pet/event`
- Service bridge calls still route pet mutations through `PetService`, so pet state ownership stays centralized.
- Service bridge authorization now expires as soon as service stop is requested, then the bridge runtime is fully released on child exit, child error, spawn failure, or app shutdown cleanup.
- Shared bridge server startup is now concurrency-safe so concurrent entry starts reuse one loopback bridge server without hanging on parallel initialization.

## Boundaries Preserved

- This phase expands the existing bridge to explicit service runs only; it does not widen the route surface.
- Bridge access remains loopback-only, bearer-token gated, per-entry-run scoped, and permission-checked.
- `entries.setup` still do not receive bridge access.
- Services still do not auto-start.
- Health checks still do not run in the background.
- Command, setup, and service processes are still spawned without shell expansion.
- OpenPet still does not claim unrestricted Node, Electron, filesystem, or secret access for third-party processes.
- Hard descendant-process cleanup guarantees remain future runtime work.

## Tests

Targeted verification during implementation:

```bash
node --test tests/services/plugin-service.test.js --test-name-pattern "plugin service bridge|plugin service entries receive bridge env vars when started explicitly|plugin service bridge server is shared safely across concurrent service starts|declaration-only command bridge|plugin service rejects non-json declaration command payloads before spawning processes"
# pass
```

Full verification before commit:

```bash
npm run check:syntax
npm test
npm run test:control-center
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
```

## Acceptance

- Explicit service runs receive bridge env vars.
- Bridge-backed service mutations still flow through `PetService`.
- Invalid token, missing permission, and expired bridge requests are rejected for services.
- Service bridge access ends immediately on stop request and fully releases on exit/error/shutdown cleanup.
- Docs describe the bridge honestly as a narrow convenience surface for explicit command/service runs, not a general sandbox or privileged host SDK.
