# Phase 64: Plugin Command Bridge

> Date: 2026-06-17
> Branch: `codex/plugin-bridge-phase64`
> Status: implemented locally

## Goal

Add the first short-lived command bridge for declaration-only local plugin commands so they can read a small pet context and explicitly call pet mutations during a user-triggered command run.

## What Changed

- `PluginService` now starts a loopback-only bridge for each explicit declaration-only command run.
- Declaration-only command processes now receive:
  - `OPENPET_BRIDGE_URL`
  - `OPENPET_BRIDGE_TOKEN`
- The bridge currently supports:
  - `GET /context`
  - `POST /pet/say`
  - `POST /pet/action`
  - `POST /pet/event`
- Bridge requests are token-gated, tied to a single active command run, and routed back through `PetService`.
- Bridge calls are reflected in plugin logs with bounded messages.
- Bridge access expires as soon as the command run ends or is stopped.

## Boundaries Preserved

- Bridge access exists only for explicit declaration-only command runs.
- Setup, service, install, update, enable, and background health paths do not receive bridge access.
- The bridge does not expose renderer objects, Electron APIs, arbitrary file APIs, or secrets.
- Commands still run without shell expansion and still receive stdin JSON context.
- OpenPet still does not claim a complete sandbox for arbitrary local processes.

## Tests

```bash
node --test tests/services/plugin-service.test.js
# 84/84 pass
```

Full verification before commit:

```bash
npm run typecheck
npm test
npm run test:control-center
npm run check:syntax
git diff --check
```

## Acceptance

- Declaration-only command runs receive bridge URL and token env vars.
- Bridge-backed `pet.say`, `pet.action`, and `pet.event` mutate through `PetService`.
- Invalid token, missing permission, and expired bridge runs are rejected.
- `GET /context` returns bounded read-only pet context.
- Docs describe the bridge honestly as a short-lived command capability, not a general sandbox or background automation surface.
