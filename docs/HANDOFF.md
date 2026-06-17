# OpenPet Handoff

> Last updated: 2026-06-17 | Branch: `codex/plugin-service-periodic-health-policy-phase71`

## Current Snapshot

OpenPet is a desktop pet platform with:

- Electron pet window runtime,
- React + Vite Control Center,
- pet pack runtime with Codex pet import and zip import,
- bundled built-in packs `doro`, `duodong`, and `chispa`,
- AI chat with secret storage in the main process,
- AI behavior decisions with Control Center replay and redacted diagnostics,
- developer-first local extension docs with explicit `entries.setup` execution, language-neutral explicit `entries.commands` process execution, explicit command result feedback, explicit command bridge access, explicit dashboard opening, explicit service start/stop controls, explicit loopback service health checks, host-managed periodic service health policy for running services, best-effort service process-group cleanup, exit-confirmed setup/command/service stop semantics, and bounded host-side force stop for stubborn services,
- loopback-only local HTTP / MCP,
- and a TypeScript migration baseline covering shared IPC, Control Center view contracts, the Control Center API facade, Control Center hook state boundaries, Control Center pane prop surfaces, main-process Control Center adapters for service/catalog/plugin/pet pack/About/update/actions payloads, plugin extension entry contracts, full release evidence archive / signed closure report contracts, and representative payload fixtures.

## Read First

1. [`docs/development-summary.md`](./development-summary.md)
2. [`docs/project-context.json`](./project-context.json)
3. [`docs/project-status-review.md`](./project-status-review.md)
4. [`docs/productization-v1.1-todo-design.md`](./productization-v1.1-todo-design.md)
5. [`docs/project-documentation-design.md`](./project-documentation-design.md)

## Facts To Preserve

- `PetService` remains the single source of truth for pet state.
- New user-facing configuration belongs in Control Center.
- API keys must stay out of the renderer.
- Extension docs must be honest: OpenPet now parses declarations, can explicitly run `entries.setup` for enabled policy-allowed local plugins, can run `entries.commands` through the JavaScript compatibility runner when `main` exists, can explicitly run declaration-only local `entries.commands` as short-lived processes with JSON stdin context, can inject short-lived bridge URL/token env vars for those declaration-only command runs, can explicitly open declared HTTP/HTTPS dashboards for enabled plugins, can explicitly start/stop declared local service entries, can manually check declared loopback service health endpoints, can host-manage periodic health checks for running services through Control Center, attempts best-effort process-group cleanup when stopping service entries, only reports setup/command/service stop completion after child exit confirmation, and will attempt one bounded host-side force stop if the service ignores the grace-period stop request. Command, setup, and service processes are spawned without shell expansion. Services do not auto-start, setup and command entries do not run during install or enable, background checks stay opt-in and runtime-bound, hard process-tree cleanup guarantees are not implemented yet, and OpenPet does not claim complete sandboxing for arbitrary local processes.
- `cat_anime/` structure is unchanged.
- Windows is not release-ready yet.

## Useful Commands

```bash
npm start
npm run dev:control-center
npm test                     # 510/510 Node tests
npm run test:control-center
npm run typecheck
npm run check:syntax
npm run create-openpet-plugin -- "My Plugin" --template minimal --output-dir scratch/plugins
npm run create-plugin-author-rehearsal
npm run create-packaged-runtime-smoke-report
npm run create-packaged-runtime-smoke-runbook
npm run run-packaged-runtime-smoke
npm run validate-packaged-runtime-smoke-report
npm run create-desktop-picker-evidence-summary
npm run create-desktop-picker-archive-manifest
npm run create-release-evidence-archive-manifest
npm run create-signed-release-closure-report
```

## Where To Look For Detail

- `docs/phases/` for phase records.
- `docs/reviews/` for phase review notes.
- `docs/project-status-review.md` for longer evaluation.
- `docs/productization-v1.1-todo-design.md` for the Phase 38+ execution design.
- `docs/project-review-todo-design.md` for the consolidated whole-project review TODO design.
- `docs/productization-todo-design.md` for the prioritized TODO implementation design.
- `docs/desktop-release-design.md` for desktop release evidence.
- `docs/plugin-sandbox-evaluation.md` for current plugin runner guarantees, limits, and v1.1 recommendation.
- `scripts/run-packaged-runtime-smoke.js`, `scripts/create-packaged-runtime-smoke-report.js`, and `scripts/validate-packaged-runtime-smoke-report.js` for packaged app runtime evidence.
- `scripts/create-desktop-picker-evidence-summary.js` and `scripts/create-desktop-picker-archive-manifest.js` for reviewed native picker evidence archive summaries and manifests.
- `scripts/create-release-evidence-archive-manifest.js` and `scripts/create-signed-release-closure-report.js` for release-level evidence archive validation and release-claim closure.
- `docs/plugin-development.md`, `docs/plugin-ecosystem-rules.md`, and `docs/plugin-submission-workflow-playbook.md` for extension onboarding and legacy SDK compatibility.
- `scripts/create-openpet-plugin.js` and `scripts/create-plugin-author-rehearsal.js` for current compatibility starter templates and author-path rehearsal.

## Next Steps

1. Use the archived Phase 43 signed release closure report as the current release-claim gate: official desktop, macOS, and Windows release readiness remain `not-ready` until signed evidence and platform smoke reports are complete.
2. Use Phase 64 plugin command bridge as the current plugin-command boundary: command entries still run only from an explicit Control Center action on enabled policy-allowed local plugins, and declaration-only command runs now get a short-lived bridge URL/token for `pet.say`, `pet.action`, `pet.event`, and read-only context.
3. Use Phase 65 release evidence link closure as the current runtime/picker evidence boundary: packaged runtime reports must link the paired desktop picker report before they can claim readiness, and archive release readiness now fails when that link is missing or mismatched.
4. Use Phase 66 desktop picker evidence archive tooling when a packaged native picker run is collected: generate the summary, create the archive manifest, and only claim readiness when the filled report and archive both pass.
5. Use Phase 67 release picker archive link closure as the current release-claim boundary: release-level archive manifests and signed closure wording now explicitly require the reviewed desktop picker archive manifest to match the archived picker report.
6. Use Phase 71 periodic health policy plus Phase 70 setup/command cleanup parity and Phase 69 plugin service force stop as the current extension cleanup/health boundary: setup, declaration-only command, and service stop requests now keep stop intent visible until child exit confirmation, while only service entries add the bounded host-side force-stop path and only running services can receive opt-in periodic health checks.
7. Use Phase 54 Release Evidence Contracts plus Phase 64 plugin entry/setup/command/dashboard/service contracts as the current TypeScript migration baseline.
8. After Phase 71, start the next concrete phase from real signed evidence work, community extension rehearsal, harder process-tree guarantees, or another high-drift service/report boundary.
