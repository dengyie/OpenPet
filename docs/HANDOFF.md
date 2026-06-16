# OpenPet Handoff

> Last updated: 2026-06-16 | Branch: `main`

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
- and a TypeScript migration baseline covering shared IPC and Control Center view contracts.

## Read First

1. [`docs/project-documentation-design.md`](./project-documentation-design.md)
2. [`docs/development-summary.md`](./development-summary.md)
3. [`docs/project-context.json`](./project-context.json)
4. [`CHANGELOG.md`](./CHANGELOG.md)
5. [`docs/release-checklist.md`](./release-checklist.md)
6. [`docs/productization-next-steps-design.md`](./productization-next-steps-design.md)
7. [`docs/productization-v1.1-todo-design.md`](./productization-v1.1-todo-design.md)
8. [`docs/project-review-todo-design.md`](./project-review-todo-design.md)
9. [`docs/productization-todo-design.md`](./productization-todo-design.md)

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
- `docs/productization-next-steps-design.md` for the latest review-derived TODO design.
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

1. Use `docs/project-review-todo-design.md` as the current whole-project TODO design, `docs/productization-next-steps-design.md` as the near-term productization design, and `docs/productization-v1.1-todo-design.md` as the phase execution entry.
2. Use Phase 41 AI behavior replay/decision viewer as the current diagnostics baseline.
3. Use the archived Phase 42 packaged runtime evidence as the automated macOS runtime baseline.
4. Use the archived Phase 43 signed release closure report as the current release-claim gate: official desktop, macOS, and Windows release readiness remain `not-ready` until signed evidence and platform smoke reports are complete.
5. Use the archived Phase 44 plugin author rehearsal as the current plugin onboarding baseline; the generated bundle is ready for human review but still not signing trust or catalog approval.
