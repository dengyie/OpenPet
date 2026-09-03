# T41 Settings Cutover Implementation Plan

> **For agentic workers:** execute this plan task-by-task with red/green checkpoints.

**Goal:** Move Control Center settings reads/writes to the authenticated backend HTTP API while preserving Shell host effects and retiring only the two business settings IPC channels.

**Architecture:** The frontend maps the backend `{version, values}` envelope into its existing view model and submits canonical point-path patches under optimistic locking. Backend `settings.changed` bridge notifications invalidate the frontend and cause the Shell to fetch a trusted snapshot, apply host side effects, update PetService, and broadcast only to the pet renderer. Sidecar lifecycle continues to expose the backend through the existing bridge.

**Tech Stack:** Electron IPC/preload, React + TypeScript, native HTTP sidecar, Zod contracts, Node native test runner.

## Global Constraints

- Do not modify `docs/refactor/**` or frozen `001_init.sql`.
- Retire only `SETTINGS_GET` and `SETTINGS_SAVE`; retain native cursor/preview/open/close and pet-renderer `SETTINGS_CHANGED`.
- Do not expose provider/API key plaintext to renderer or ordinary plugins.
- Use existing sidecar lifecycle and `useSse(['settings'])`; do not add `BACKEND_GET` or `BACKEND_CHANGED` IPC.
- Keep source files at or below 400 lines and use `apply_patch` for edits.

### Task 1: Add failing regression tests

Cover legacy envelope normalization, HTTP view mapping and canonical diff, 409 reload/replay, bridge host effects, sidecar-ready bootstrap, SSE invalidation, pet renderer sync, secret projection, and removal of the two IPC channels.

### Task 2: Implement frontend settings HTTP adapter

Add pure mapping/diff/retry helpers and connect `usePetSettingsPane` to `backendClient`/`useSse`, preserving import/preview native calls.

### Task 3: Add settings bridge contract and backend notification

Extend the shared contract and backend schema with `settings.changed`; emit it after a successful settings PATCH with paths and version.

### Task 4: Implement Shell trusted snapshot application and lifecycle bootstrap

On a validated bridge notification, GET settings through the current sidecar connection, apply cursor/home/asset/PetService effects, and broadcast only pet renderer settings. Make preload backend exposure become available through lifecycle before and after window creation without business settings IPC bootstrap.

### Task 5: Retire channels, normalize migration, ledger, and verify

Remove settings get/save registrations and preload methods, normalize legacy plain-object migration input, update the ledger with the commit SHA, run all required checks, review, and commit.
