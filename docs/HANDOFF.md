# OpenPet Handoff

> Last updated: 2026-06-17 | Branch: `codex/plugin-setup-execution`

## Current Snapshot

OpenPet is a desktop pet platform with:

- Electron pet window runtime,
- React + Vite Control Center,
- pet pack runtime with Codex pet import and zip import,
- bundled built-in packs `doro`, `duodong`, and `chispa`,
- AI chat with secret storage in the main process,
- AI behavior decisions with Control Center replay and redacted diagnostics,
- developer-first local extension docs with explicit `entries.setup` execution, `entries.commands` compatibility runtime support, explicit dashboard opening, explicit service start/stop controls, explicit loopback service health checks, and best-effort service process-group cleanup,
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
- Extension docs must be honest: OpenPet now parses declarations, can explicitly run `entries.setup` for enabled policy-allowed local plugins, can run `entries.commands` through the JavaScript compatibility runner when `main` exists, can explicitly open declared HTTP/HTTPS dashboards for enabled plugins, can explicitly start/stop declared local service entries, can manually check declared loopback service health endpoints, and attempts best-effort process-group cleanup when stopping service entries. Setup and service commands are spawned without shell expansion. Services do not auto-start, setup commands do not run during install or enable, health checks do not run in the background, bridge token injection, generic shell command execution, and hard process-tree cleanup guarantees are not implemented yet, and OpenPet does not claim complete sandboxing for arbitrary local processes.
- `cat_anime/` structure is unchanged.
- Windows is not release-ready yet.

## Useful Commands

```bash
npm start
npm run dev:control-center
npm test                     # 454/454 Node tests
npm run test:control-center
npm run typecheck
npm run check:syntax
npm run create-openpet-plugin -- "My Plugin" --template minimal --output-dir scratch/plugins
npm run create-plugin-author-rehearsal
npm run create-packaged-runtime-smoke-report
npm run create-packaged-runtime-smoke-runbook
npm run run-packaged-runtime-smoke
npm run validate-packaged-runtime-smoke-report
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
- `scripts/create-release-evidence-archive-manifest.js` and `scripts/create-signed-release-closure-report.js` for release-level evidence archive validation and release-claim closure.
- `docs/plugin-development.md`, `docs/plugin-ecosystem-rules.md`, and `docs/plugin-submission-workflow-playbook.md` for extension onboarding and legacy SDK compatibility.
- `scripts/create-openpet-plugin.js` and `scripts/create-plugin-author-rehearsal.js` for current compatibility starter templates and author-path rehearsal.

## Next Steps

1. Use the archived Phase 43 signed release closure report as the current release-claim gate: official desktop, macOS, and Windows release readiness remain `not-ready` until signed evidence and platform smoke reports are complete.
2. Use Phase 61 plugin setup execution as the current runtime boundary: setup entries run only from an explicit Control Center action on enabled policy-allowed local plugins, return final runtime status and logs, use plugin-local cwd symlink guards, and are spawned without shell expansion.
3. Use Phase 54 Release Evidence Contracts plus Phase 61 plugin entry/setup/dashboard/service contracts as the current TypeScript migration baseline.
4. After Phase 61, start the next concrete phase from bridge integration, real evidence work, community extension rehearsal, hard process-tree guarantees, richer command execution, or another high-drift service/report boundary.
