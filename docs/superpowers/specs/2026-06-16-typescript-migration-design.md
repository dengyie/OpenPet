# TypeScript Migration Design

**Goal:** Prepare OpenPet for incremental TypeScript migration without disrupting the Electron runtime, existing Node tests, or packaged app flow.

**Architecture:** Keep JavaScript and TypeScript side by side. Type the boundaries first: shared IPC contracts, settings shapes, pet pack manifest/runtime actions, catalog/plugin manifests, and Control Center API responses. Existing CommonJS main-process modules continue to run as JavaScript until each module has tests, type coverage, and packaging verification.

**Migration order:**

1. Add TypeScript tooling and a no-emit typecheck gate.
2. Move shared constants and contract types into `src/shared/`.
3. Convert Control Center API facade, hooks, panes, and components to TS/TSX.
4. Convert pet-pack, action, settings, catalog, and plugin services one module at a time.
5. Convert scripts/tests only after the runtime boundary types are stable.

**Rules:**

- Do not switch `"type": "module"` in `package.json`.
- Do not require TS runtime transpilation in Electron main during this phase.
- Keep generated build output out of git.
- Every migrated module must keep or add tests before changing behavior.
- Prefer exported data contract types over broad `any`.

