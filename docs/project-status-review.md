# OpenPet Project Status Review

> Date: 2026-06-17
> Branch: `codex/extension-service-lifecycle`
> Release track: `v1.0.1-rc.2`

This document is the current status snapshot. Detailed implementation history belongs in `docs/phases/`; detailed review findings belong in `docs/reviews/`.

## Executive Summary

OpenPet has reached the intended desktop platform shape: Electron pet runtime, React Control Center, pet packs, AI behavior, local extension documentation with `entries.commands` compatibility runtime support, explicit dashboard opening, explicit service start/stop controls, local HTTP/MCP, release evidence tooling, and a TypeScript boundary baseline.

The project is strongest on macOS. Windows build and evidence tooling exists, but Windows must stay **not release-ready** until signed artifacts and real Windows smoke reports are archived.

## Current Product Shape

| Area | Current State | Evidence |
|------|---------------|----------|
| Desktop pet runtime | Transparent Electron pet window with movement, actions, speech bubbles, and pet pack switching | `main.js`, `renderer.js`, `src/main/services/pet-service.js` |
| Control Center | React + Vite app with Pet, Actions, AI, Plugins, Catalog, Service, and About tabs | `src/control-center/`, `tests/control-center/` |
| Pet packs | Legacy cat, OpenPet packs, Codex pet directory/zip import, bundled read-only packs, export/provenance | `src/main/pet-pack/`, `src/main/services/pet-pack-service.js` |
| AI | OpenAI-compatible chat, main-process secret storage, behavior decisions, replay, redacted diagnostics | `src/main/services/ai-service.js`, `src/main/services/behavior-orchestrator-service.js` |
| Extensions | Developer-first ecosystem docs, current legacy SDK compatibility, normalized `entries` declarations, `entries.commands` support through the existing JavaScript compatibility runner, Control Center declaration visibility, explicit HTTP/HTTPS dashboard opening, explicit `entries.services` start/stop with runtime state and logs, validation, submission tooling, catalog install, author rehearsal; services do not auto-start, service spawns do not use shell expansion, and setup/health/bridge support remains future runtime work | `docs/plugin-development.md`, `docs/plugin-ecosystem-rules.md`, `src/main/plugins/manifest.js`, `src/main/services/plugin-service.js` |
| Local API | Loopback-only HTTP and MCP, token gated, logged, disabled by default | `src/main/services/local-http-service.js` |
| Release evidence | Packaged runtime evidence tooling, signed release closure gate, Windows smoke/report tooling | `scripts/create-*-smoke-*`, `docs/release-evidence/` |
| TypeScript | Shared contracts, typed Control Center view defaults, typed API facade, typed Control Center hooks, typed pane prop surfaces, main-process Control Center adapters for service/catalog/plugin/pet pack/About/update/actions payloads, plugin extension entry contracts, full release evidence archive / signed closure report contracts, representative payload fixtures | `src/shared/openpet-contracts.ts`, `src/control-center/src/api/control-center-api.ts`, `src/control-center/src/hooks/`, `src/control-center/src/panes/`, `src/main/control-center-adapters.js` |

## Validation Baseline

Current local baseline:

```bash
npm test                     # 434/434 Node tests
npm run test:control-center  # 10/10 Playwright UI tests
npm run typecheck            # TypeScript no-emit checks
npm run check:syntax         # Node syntax + typecheck + Control Center build
npm run pack                 # electron-builder directory package
```

## Release Truth

| Platform | Status | Public Claim |
|----------|--------|--------------|
| macOS | Validated local baseline and packaged runtime evidence exist; signed/notarized release evidence still needs official archive completion | macOS-first release track |
| Windows | Build, signing policy, smoke report, collector, evidence summary, and archive tooling exist; signed artifact evidence and real smoke reports are missing | Do not claim release-ready |
| Linux | Deferred | No support claim |
| Mobile | Out of scope | No support claim |

## Remaining Work

The active product gaps are evidence and ecosystem maturity, not a rewrite of the platform:

1. Archive official signed macOS release evidence.
2. Produce signed Windows artifacts and real Windows smoke reports before changing Windows wording.
3. Fill native picker smoke evidence from launched or packaged app runs.
4. Continue third-party extension author and maintainer rehearsal with real submissions, while keeping `entries.commands` compatibility, dashboard opening support, service start/stop support, and setup/health/bridge limitations explicit.
5. Continue TypeScript migration into other high-drift main-process adapter boundaries.

## Documentation Map

- Public entry: `README.md`, `README.zh-CN.md`
- Current handoff: `docs/HANDOFF.md`
- Machine context: `docs/project-context.json`
- Documentation rules: `docs/project-documentation-design.md`
- Release gates: `docs/desktop-release-design.md`, `docs/release-checklist.md`
- Phase audit trail: `docs/phases/`, `docs/reviews/`

## Current Assessment

OpenPet is a mature local desktop platform with strong service separation, broad regression coverage, and conservative security/release wording. The correct next posture is to keep adding evidence and ecosystem proof while preserving the current architecture boundaries.
