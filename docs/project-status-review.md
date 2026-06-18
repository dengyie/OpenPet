# OpenPet Project Status Review

> Date: 2026-06-19
> Branch: `main`
> Release track: `v1.0.1-rc.2`

This document is the current status snapshot. Detailed implementation history belongs in `docs/phases/`; detailed review findings belong in `docs/reviews/`.

## Executive Summary

OpenPet has reached the intended desktop platform shape: Electron pet runtime, React Control Center, pet packs, AI behavior, local extension documentation with explicit `entries.setup` execution, language-neutral explicit `entries.commands` process execution, short-lived command bridge support, creator-tools action reads / validation / bounded writes, active installed user pack metadata workflows, package-local frame inspection/import, user-approved picker frame inspection/import for declaration-only commands, explicit dashboard opening, explicit service start/stop controls, explicit loopback service health checks, opt-in host-managed periodic health checks for running services, best-effort service process-group cleanup, exit-confirmed setup/command/service stop semantics, bounded host-side force stop for stubborn services, host-owned process-tree fallback cleanup for explicit local-process stop paths, structured plugin cleanup tooling, shared plugin submission contracts, local HTTP/MCP, unsigned macOS/Windows test build workflows, dormant release-evidence tooling for future promotion, and a TypeScript boundary baseline.

The current product priority is plugin ecosystem maturity, not public release promotion. GitHub release jobs should produce unsigned macOS and Windows artifacts for small-scope testing without certificate gates; Windows artifacts must remain visibly marked `unsigned`.

The extension ecosystem has also crossed another platform threshold: declaration-only local command entries no longer need the legacy JavaScript SDK path just to make the pet speak or react, and creator-tools entries now have host-backed authoring slices for bounded action configuration reads/writes, active installed user pack metadata workflows, package-local frame inspection/import, and user-approved picker frame inspection/import. The wider ecosystem still stays open, local-first, and honest about trust limits.

## Current Product Shape

| Area | Current State | Evidence |
|------|---------------|----------|
| Desktop pet runtime | Transparent Electron pet window with movement, actions, speech bubbles, and pet pack switching | `main.js`, `renderer.js`, `src/main/services/pet-service.js` |
| Control Center | React + Vite app with Pet, Actions, AI, Plugins, Catalog, Service, and About tabs | `src/control-center/`, `tests/control-center/` |
| Pet packs | Legacy cat, OpenPet packs, Codex pet directory/zip import, bundled read-only packs, export/provenance | `src/main/pet-pack/`, `src/main/services/pet-pack-service.js` |
| AI | OpenAI-compatible chat, main-process secret storage, behavior decisions, replay, redacted diagnostics | `src/main/services/ai-service.js`, `src/main/services/behavior-orchestrator-service.js` |
| Extensions | Developer-first ecosystem docs, current legacy SDK compatibility, normalized `entries` declarations including explicit setup execution, `entries.commands` support through the existing JavaScript compatibility runner and explicit short-lived process execution for declaration-only local extensions, command result feedback in Control Center, short-lived bridge access for declaration-only commands, host-owned creator data/cache/log directories for declaration-only command runs, creator-tools action reads / validation / bounded writes, active installed user pack metadata workflows, package-local frame inspection/import, user-approved picker frame inspection/import through the short-lived bridge, Control Center declaration visibility, explicit HTTP/HTTPS dashboard opening, explicit `entries.services` start/stop with runtime state and logs, manual loopback-only service health checks, opt-in host-managed periodic health checks for running services, best-effort process-group cleanup, exit-confirmed setup/command/service stop semantics, bounded host-side force stop for stubborn services, host-owned process-tree fallback cleanup across explicit service/setup/declaration-command stop paths, structured cleanup evidence tooling with validation-first updates, helper generation, runner archives, packaged-app cleanup evidence runner archives, and archive manifests, validation, submission tooling, catalog install, scaffold author rehearsal, existing-plugin real-world submission rehearsal, remote-source submission rehearsal, community-source discovery reporting, community-source invitation kits, community-source candidate intake reporting, compatible-intake-to-submission bridge tooling, community-source submission evidence, and maintainer approval rehearsal; command/setup/service spawns do not use shell expansion, setup and commands never run during install/enable, services do not auto-start, maintainer approval remains a human review artifact, and packaged cleanup evidence still proves only the observed packaged run rather than universal process-tree guarantees | `docs/plugin-development.md`, `docs/plugin-ecosystem-rules.md`, `docs/plugin-submission-workflow-playbook.md`, `src/main/plugins/manifest.js`, `src/main/services/plugin-service.js`, `src/main/services/action-service.js`, `src/main/services/pet-pack-service.js`, `src/main/services/service-process-tree.js` |
| Local API | Loopback-only HTTP and MCP, token gated, logged, disabled by default | `src/main/services/local-http-service.js` |
| Desktop test builds | Unsigned macOS and Windows release jobs, Windows unsigned asset labeling, dormant release-evidence tooling for future promotion | `.github/workflows/release.yml`, `scripts/prepare-windows-release-assets.js`, `docs/desktop-release-design.md` |
| TypeScript | Shared contracts, typed Control Center view defaults, typed API facade, typed Control Center hooks, typed pane prop surfaces, main-process Control Center adapters for service/catalog/plugin/pet pack/About/update/actions payloads, plugin extension entry contracts, plugin submission evidence contracts, community-source invitation evidence contracts, plugin cleanup archive/runner contracts, packaged plugin cleanup evidence contracts, macOS release evidence summary/archive contracts, Windows smoke report/evidence summary/archive contracts, desktop picker smoke report contracts, desktop picker evidence summary/archive contracts, packaged runtime smoke report/evidence contracts, full release evidence archive / signed closure report contracts, representative payload fixtures | `src/shared/openpet-contracts.ts`, `src/control-center/src/api/control-center-api.ts`, `src/control-center/src/hooks/`, `src/control-center/src/panes/`, `src/main/control-center-adapters.js` |

## Validation Baseline

Current local baseline:

```bash
npm test                     # 691/691 Node tests
npm run test:control-center  # 10/10 Playwright UI tests
npm run typecheck            # TypeScript no-emit checks
npm run check:syntax         # Node syntax + typecheck + Control Center build
npm run pack                 # electron-builder directory package
```

## Release Truth

| Platform | Status | Public Claim |
|----------|--------|--------------|
| macOS | Unsigned test artifacts can be built and uploaded; signing/notarization evidence is paused | Small-scope unsigned testing only |
| Windows | Unsigned test artifacts can be built and uploaded with `unsigned` labels; no Windows certificate requirement in the current product plan | Small-scope unsigned testing only |
| Linux | Deferred | No support claim |
| Mobile | Out of scope | No support claim |

## Remaining Work

The active product gaps are ecosystem maturity, not release evidence:

1. Validate and adapt real third-party plugin candidates, starting with `dengyie/weather-morning-report`. Its main branch still has a legacy OpenPet plugin, while the unified `extension/plugin.json` lives on an active development branch/local repo.
2. Keep plugin authoring permissive enough for weather announcements, pet actions/dialogue/personality, creator-tools action imports, generated action images, config editing, dashboards, services, and cleanup workflows without raw unrestricted host access.
3. Keep release-evidence scripts dormant until distribution strategy changes; do not block current development on macOS certificates, notarization, Windows certificates, or SmartScreen trust.
4. Continue TypeScript migration into high-drift plugin/runtime/Control Center adapter boundaries only when it reduces current ecosystem friction.

## Documentation Map

- Documentation map: `docs/README.md`
- Public entry: `README.md`, `README.zh-CN.md`
- Current handoff: `docs/HANDOFF.md`
- Machine context: `docs/project-context.json`
- Documentation rules: `docs/project-documentation-design.md`
- Release gates: `docs/desktop-release-design.md`, `docs/release-checklist.md`
- Phase audit trail: `docs/phases/`, `docs/reviews/`

## Current Assessment

OpenPet is a mature local desktop platform with strong service separation, broad regression coverage, and conservative trust wording. The correct next posture is to grow real plugin usefulness and keep unsigned desktop builds available for focused testing while preserving architecture boundaries.
