# OpenPet Handoff

> Last updated: 2026-06-17 | Branch: `main`

## Current Snapshot

OpenPet is a desktop pet platform with:

- Electron pet window runtime,
- React + Vite Control Center,
- pet pack runtime with Codex pet import and zip import,
- bundled built-in packs `doro`, `duodong`, and `chispa`,
- AI chat with secret storage in the main process,
- AI behavior decisions with Control Center replay and redacted diagnostics,
- permission-limited plugins,
- loopback-only local HTTP / MCP,
- and a TypeScript migration baseline covering shared IPC, Control Center view contracts, the Control Center API facade, Control Center hook state boundaries, Control Center pane prop surfaces, and representative payload fixtures.

## Read First

1. [`docs/development-summary.md`](./development-summary.md)
2. [`docs/project-context.json`](./project-context.json)
3. [`docs/project-status-review.md`](./project-status-review.md)
4. [`docs/productization-v1.1-todo-design.md`](./productization-v1.1-todo-design.md)
5. [`docs/project-documentation-design.md`](./project-documentation-design.md)

## Facts To Preserve

- `PetService` remains the single source of truth for pet state.
- New user-facing configuration belongs in Control Center.
- API keys must stay out of the renderer and ordinary plugins.
- Plugins keep permission review and isolation.
- `cat_anime/` structure is unchanged.
- Windows is not release-ready yet.

## Useful Commands

```bash
npm start
npm run dev:control-center
npm test
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
- `docs/plugin-submission-workflow-playbook.md` for plugin onboarding.
- `scripts/create-openpet-plugin.js` and `scripts/create-plugin-author-rehearsal.js` for plugin starter templates and author-path rehearsal.

## Next Steps

1. Use the archived Phase 43 signed release closure report as the current release-claim gate: official desktop, macOS, and Windows release readiness remain `not-ready` until signed evidence and platform smoke reports are complete.
2. Use the archived Phase 44 plugin author rehearsal as the current plugin onboarding baseline; the generated bundle is ready for human review but still not signing trust or catalog approval.
3. Use Phase 48 Control Center pane prop typing as the current TypeScript migration baseline.
4. After Phase 48, start the next concrete phase from a fresh review or from real evidence work: signed release evidence, Windows smoke evidence, native picker evidence, community plugin rehearsal, main-process JSDoc adapters, or the next high-drift service boundary.
