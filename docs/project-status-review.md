# OpenPet Project Status Review

> Date: 2026-06-28
> Branch: `codex/dev`
> Release track: `v1.0.1-rc.3`

This document is the current status snapshot. Detailed implementation history belongs in `docs/phases/`; detailed review findings belong in `docs/reviews/`.

## Executive Summary

OpenPet has reached the intended desktop platform shape: Electron pet runtime, React Control Center, pet packs, AI behavior, local extension documentation with explicit `entries.setup` execution, language-neutral explicit `entries.commands` process execution, short-lived command bridge support, creator-tools action reads / validation / bounded writes, active installed user pack metadata workflows, package-local frame inspection/import, user-approved picker frame inspection/import for declaration-only commands, explicit dashboard opening, explicit service start/stop controls, explicit loopback service health checks, opt-in host-managed periodic health checks for running services, best-effort service process-group cleanup, exit-confirmed setup/command/service stop semantics, bounded host-side force stop for stubborn services, host-owned process-tree fallback cleanup for explicit local-process stop paths, structured plugin cleanup evidence tooling with validation-first report updates, helper generation, runner archives, packaged-app cleanup evidence runner archives, archive manifests, shared cleanup archive/runner contracts, shared plugin submission evidence contracts, shared macOS evidence summary/archive contracts, shared Windows smoke report/evidence summary/archive contracts, shared desktop picker smoke report contracts, shared desktop picker evidence summary/archive contracts, shared packaged runtime smoke report/evidence contracts, structured maintainer approval rehearsal for extension submission bundles, existing-plugin real-world submission rehearsal evidence, remote-source submission rehearsal evidence, community-source discovery reporting, community-source invitation kits, community-source submission evidence tooling, community-source candidate intake reporting, compatible-intake-to-submission bridge tooling, local HTTP/MCP, release evidence tooling including macOS evidence capture, workflow artifact upload, permanent artifact archive handoff, reviewed Windows smoke and desktop picker archive gates, and a TypeScript boundary baseline.

The project is strongest on macOS. Windows build and evidence tooling exists, but Windows must stay **not release-ready** until signed artifacts and real Windows smoke reports are archived.

The extension ecosystem has also crossed another platform threshold: declaration-only local command entries no longer need the legacy JavaScript SDK path just to make the pet speak or react, and creator-tools entries now have host-backed authoring slices for bounded action configuration reads/writes, active installed user pack metadata workflows, package-local frame inspection/import, user-approved picker frame inspection/import, command-scoped image-generation bridge access, dashboard-first Creator Studio review flows, provider-backed full-pet real-atlas packaging with QA-gated import, and host-reviewed trigger proposal handoff through the Actions `Trigger Proposal Inbox`. Approved Creator Studio dashboard runs now also expose a structured host-owned import handoff plus action-lane guidance that points users to the correct Control Center plugin command and clarifies which next step is still available in the dashboard without exposing command-scoped bridge credentials. Imported follow-up is now shared through `workflowGuidance.import.followUp`, so imported review guidance stays aligned with `nextStep`, `actionLane`, and imported result cards: imported action success routes review follow-up to `Actions -> Trigger Proposal Inbox`, imported action handoff failures route follow-up to `Control Center -> Plugins`, and imported pet follow-up remains `OpenPet` through `Import Approved Pet`. Those imported review surfaces are now phase-aware as well, so imported result cards no longer carry pre-import QA blocked notices, repair controls, or retry-generation cues after host-owned import has completed. The live bridge docs and regressions now also pin `trigger-proposals:write` for Creator Studio review handoff and `model:image-generate` for host-managed settings, health checks, and bounded generation, while plugin-managed provider credentials remain unsupported on that host-managed generation surface. The wider ecosystem still stays open, local-first, and honest about trust limits.

The current OpenPet development gateway now also has archived real Creator Studio smoke evidence under `docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/`. That run proves the saved host-owned `gpt-image-2` path can complete prompt build, provider generation with requested `512x512` constraints, and 16-frame action QA end to end, but it also shows the gateway is slow enough to need a `420000ms` timeout override for reliable smoke validation. This is evidence of provider-path correctness, not a production asset-quality approval.

## Current Product Shape

| Area | Current State | Evidence |
|------|---------------|----------|
| Desktop pet runtime | Transparent Electron pet window with movement, actions, speech bubbles, pet pack switching, optional grounded movement, and optional home-anchor roaming constraints | `main.js`, `renderer.js`, `src/main/services/pet-service.js`, `src/main/pet-movement-policy.js` |
| Control Center | React + Vite app with Pet, Actions, AI, Plugins, Catalog, Service, and About tabs | `src/control-center/`, `tests/control-center/` |
| Pet packs | Legacy cat, OpenPet packs, Codex pet directory/zip import, bundled read-only packs, export/provenance | `src/main/pet-pack/`, `src/main/services/pet-pack-service.js` |
| AI | OpenAI-compatible chat, main-process secret storage, chat/image provider presets, optional `/models` discovery, provider-aware model compatibility hints, a model-settings-first AI pane with chat/image Provider sections expanded ahead of secondary tools, explicit host-owned trust/save-test copy, the sanitized `npm run smoke:ai-provider` gateway validation path, the sanitized `npm run smoke:creator-studio-provider` host-side Creator Studio provider-path validation path, archived real Creator Studio provider smoke evidence for the current `gpt-image-2` gateway path, AI Talk persona/history/memory, desktop chat, behavior decisions, replay, redacted diagnostics, trace export filters, and host-owned image Provider usage summaries | `src/main/services/ai-service.js`, `src/main/services/image-generation-model-service.js`, `src/main/services/ai-talk-service.js`, `src/main/services/ai-talk-store.js`, `src/main/pet-chat-window.js`, `src/main/services/behavior-orchestrator-service.js`, `scripts/run-ai-provider-smoke.js`, `scripts/run-creator-studio-provider-smoke.js` |
| Extensions | Developer-first ecosystem docs, current legacy SDK compatibility, normalized `entries` declarations including explicit setup execution, `entries.commands` support through the existing JavaScript compatibility runner and explicit short-lived process execution for declaration-only local extensions, command result feedback in Control Center, short-lived bridge access for declaration-only commands, host-owned creator data/cache/log directories for declaration-only command runs, creator-tools action reads / validation / bounded writes, active installed user pack metadata workflows, package-local frame inspection/import, user-approved picker frame inspection/import through the short-lived bridge, provider-backed full-pet real-atlas packaging with `source-image-validation.json` and `atlas-validation.json`, QA-gated `Import Approved Pet`, reviewed trigger proposal acceptance where `click` can update `clickAction`, `manual` and `unbound` remain review-only acknowledgements, `random`, `state`, and `event` proposals create active host-owned durable trigger rules, Creator Studio action imports submit proposals into the Actions `Trigger Proposal Inbox`, imported follow-up routing shared across `nextStep`, `actionLane`, `workflowGuidance.import.followUp`, and imported review cards, documented bridge route/permission coverage backed by regressions including `trigger-proposals:write` and `model:image-generate`, explicit host-managed generation boundaries where plugin-managed provider credentials remain unsupported, Control Center declaration visibility, explicit HTTP/HTTPS dashboard opening, explicit `entries.services` start/stop with runtime state and logs, manual loopback-only service health checks, opt-in host-managed periodic health checks for running services, best-effort process-group cleanup, exit-confirmed setup/command/service stop semantics, bounded host-side force stop for stubborn services, host-owned process-tree fallback cleanup across explicit service/setup/declaration-command stop paths, structured cleanup evidence tooling with validation-first updates, helper generation, runner archives, packaged-app cleanup evidence runner archives, and archive manifests, validation, submission tooling, catalog install, scaffold author rehearsal, existing-plugin real-world submission rehearsal, remote-source submission rehearsal, community-source discovery reporting, community-source invitation kits, community-source candidate intake reporting, compatible-intake-to-submission bridge tooling, community-source submission evidence, and maintainer approval rehearsal; command/setup/service spawns do not use shell expansion, setup and commands never run during install/enable, services do not auto-start, maintainer approval remains a human review artifact, and packaged cleanup evidence still proves only the observed packaged run rather than universal process-tree guarantees | `docs/plugin-development.md`, `docs/plugin-ecosystem-rules.md`, `docs/plugin-submission-workflow-playbook.md`, `src/main/plugins/manifest.js`, `src/main/services/plugin-service.js`, `src/main/services/action-service.js`, `src/main/services/pet-pack-service.js`, `src/main/services/service-process-tree.js`, `examples/plugins/creator-studio/lib/real-atlas-builder.js` |
| Local API | Loopback-only HTTP and MCP, token gated, logged, disabled by default | `src/main/services/local-http-service.js` |
| Release evidence | Packaged runtime evidence tooling, runtime/picker evidence-link gate, Windows smoke and desktop picker evidence summary/archive manifests, macOS codesign/notarization/Gatekeeper evidence capture with workflow artifact upload and permanent artifact archive handoff, release archive reviewed-archive gates, signed release closure gate, Windows smoke/report tooling | `scripts/create-*-smoke-*`, `scripts/create-macos-release-evidence.js`, `scripts/create-macos-release-evidence-archive.js`, `.github/workflows/release.yml`, `docs/release-evidence/` |
| TypeScript | Shared contracts, typed Control Center view defaults, typed API facade, typed Control Center hooks, typed pane prop surfaces, main-process Control Center adapters for service/catalog/plugin/pet pack/About/update/actions payloads, plugin extension entry contracts, plugin submission evidence contracts, community-source invitation evidence contracts, plugin cleanup archive/runner contracts, packaged plugin cleanup evidence contracts, AI provider smoke report contracts, Creator Studio provider smoke report contracts, macOS release evidence summary/archive contracts, Windows smoke report/evidence summary/archive contracts, desktop picker smoke report contracts, desktop picker evidence summary/archive contracts, packaged runtime smoke report/evidence contracts, full release evidence archive / signed closure report contracts, representative payload fixtures | `src/shared/openpet-contracts.ts`, `src/control-center/src/api/control-center-api.ts`, `src/control-center/src/hooks/`, `src/control-center/src/panes/`, `src/main/control-center-adapters.js` |

## Validation Baseline

Current local baseline:

```bash
npm test                     # current Node regression suite
npm run test:control-center  # current Playwright UI regression suite
npm run typecheck            # TypeScript no-emit checks
npm run check:syntax         # Node syntax + typecheck + Control Center build
npm run pack                 # electron-builder directory package
```

## Release Truth

| Platform | Status | Public Claim |
|----------|--------|--------------|
| macOS | Validated local baseline and packaged runtime evidence exist; canonical signed/notarized/Gatekeeper evidence capture is scripted and uploaded by release workflow, but real official evidence still needs archive completion | macOS-first release track |
| Windows | Build, signing policy, smoke report, collector, evidence summary, and archive tooling exist; signed artifact evidence and real smoke reports are missing | Do not claim release-ready |
| Linux | Deferred | No support claim |
| Mobile | Out of scope | No support claim |

## Remaining Work

The active product gaps are evidence and ecosystem maturity, not a rewrite of the platform:

1. Run `npm run create-macos-release-evidence-archive` on the macOS release workflow's uploaded evidence artifact for the official signed run and verify passing codesign, notarization, and Gatekeeper evidence through the release archive / signed closure flow.
2. Produce signed Windows artifacts and real Windows smoke reports before changing Windows wording.
3. Fill Windows smoke and native picker smoke evidence from launched or packaged app runs, archive each with its summary and archive manifest, and keep the release archive / signed closure flow pointed at those reviewed archive manifests.
4. Continue toward a compatible live third-party extension source: Phase 105 archived invitation materials after Phase 104 reported `compatible-source-not-found`, Phase 106 typed those invitation summaries, Phase 102 archived a real public adjacent OpenPets candidate as `incompatible-package-model`, and Phase 103 provides the bridge for a future compatible `plugin.json` package to pass Phase 100 intake and enter Phase 99 community-source evidence.
5. Continue TypeScript migration into other high-drift main-process adapter boundaries after the plugin submission evidence and packaged runtime/report boundaries.

## Documentation Map

- Documentation map: `docs/README.md`
- Current TODO architecture: `docs/openpet-current-todo-architecture.md`
- Public entry: `README.md`, `README.zh-CN.md`
- Current handoff: `docs/HANDOFF.md`
- Machine context: `docs/project-context.json`
- Documentation rules: `docs/project-documentation-design.md`
- Release gates: `docs/desktop-release-design.md`, `docs/release-checklist.md`
- Phase audit trail: `docs/phases/`, `docs/reviews/`

## Current Assessment

OpenPet is a mature local desktop platform with strong service separation, broad regression coverage, and conservative security/release wording. The correct next posture is to keep adding evidence and ecosystem proof while preserving the current architecture boundaries.
