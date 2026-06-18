# Plugin Setup and Command Cleanup Parity Design

> Date: 2026-06-17
> Phase target: Phase 70

## Goal

Phase 70 closes the remaining service-lifecycle parity gap by making explicit plugin `entries.setup` and declaration-only `entries.commands` cleanup behave as honestly as the service path.

The intent is narrow:

- keep setup and command execution user-triggered only;
- keep their current spawn boundaries and UI flows;
- make disable and app-shutdown cleanup use the same stop path;
- preserve the existing direct-child best-effort contract;
- tighten logs and runtime transitions so they match what the host actually knows.

## Current State

OpenPet already has:

- explicit setup execution for enabled, policy-allowed local plugins;
- explicit declaration-only command execution for enabled, policy-allowed local plugins;
- direct-child cleanup when plugins are disabled or when the app shuts down;
- `stopped` / `failed` style runtime state surfaces for setup and command runs;
- Control Center surfaces that already render these runtimes.

However, the current cleanup semantics are not yet parallel to the service path:

- setup cleanup marks the runtime failed immediately after sending `SIGTERM`;
- declaration-only command cleanup does the same;
- logs read like the work is already gone rather than in a shutdown window;
- there is no structured stop-intent versus stop-confirmation boundary for these runtimes.

## Scope

In scope:

- tighten setup cleanup semantics;
- tighten declaration-only command cleanup semantics;
- keep cleanup user-triggered and service-layer owned;
- keep direct-child best effort as the limit;
- update docs and tests to reflect the narrower truth.

Out of scope:

- no service force-stop changes;
- no bridge changes;
- no setup installation-time execution;
- no background automation;
- no health polling changes;
- no descendant-process guarantee claims;
- no OS-specific process-tree daemon.

## Design

Phase 70 should keep the existing execution model intact and adjust only the stop/cleanup contract:

- a cleanup request should move the runtime into a visible shutdown state;
- the runtime should remain there until the child exit callback confirms completion;
- a later child exit should decide the terminal state;
- cleanup failures before signal delivery should still move to `failed`.

The phase should reuse the same service-layer ownership model already used for services, but only for setup and declaration-only commands.

## Acceptance

- Setup cleanup no longer claims terminal failure before exit confirmation.
- Declaration-only command cleanup no longer claims terminal failure before exit confirmation.
- Disable and app-shutdown cleanup share the same cleanup-state boundary.
- Tests cover setup and command stop intent, exit confirmation, and cleanup failure paths.
- Docs describe the new truth without implying hard process-tree guarantees.
