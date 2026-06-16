# OpenPet Handoff

> Last updated: 2026-06-17 | Branch: `codex/extension-entry-visibility`

## Current Snapshot

OpenPet is a desktop pet platform with:

- Electron pet window runtime,
- React + Vite Control Center,
- pet pack runtime with Codex pet import and zip import,
- bundled built-in packs `doro`, `duodong`, and `chispa`,
- AI chat with secret storage in the main process,
- AI behavior decisions with Control Center replay and redacted diagnostics,
- developer-first local extension docs with `entries.commands` compatibility runtime support and explicit dashboard opening,
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
- Extension docs must be honest: OpenPet now parses declarations, can run `entries.commands` through the JavaScript compatibility runner when `main` exists, and can explicitly open declared HTTP/HTTPS dashboards for enabled plugins, but service/setup/health lifecycle support is not implemented yet and OpenPet does not claim complete sandboxing for arbitrary local processes.
- `cat_anime/` structure is unchanged.
- Windows is not release-ready yet.

## Useful Commands

```bash
npm start
npm run dev:control-center
npm test                     # 424/424 Node tests
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
2. Use Phase 57 plugin dashboard opening as the current runtime boundary: `entries.commands` can run only through the existing JavaScript compatibility path, and dashboard entries can be opened explicitly as external HTTP/HTTPS URLs.
3. Use Phase 54 Release Evidence Contracts plus Phase 57 plugin entry/dashboard contracts as the current TypeScript migration baseline.
4. After Phase 57, start the next concrete phase from service lifecycle implementation, real evidence work, community extension rehearsal, or another high-drift service/report boundary.
