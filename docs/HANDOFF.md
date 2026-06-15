# OpenPet Handoff

> Last updated: 2026-06-16 | Branch: `main`

## Current Snapshot

OpenPet is a desktop pet platform with:

- Electron pet window runtime,
- React + Vite Control Center,
- pet pack runtime with Codex pet import and zip import,
- bundled built-in packs `doro`, `duodong`, and `chispa`,
- AI chat with secret storage in the main process,
- permission-limited plugins,
- loopback-only local HTTP / MCP,
- and a TypeScript migration baseline.

## Read First

1. [`docs/project-documentation-design.md`](./project-documentation-design.md)
2. [`docs/development-summary.md`](./development-summary.md)
3. [`docs/project-context.json`](./project-context.json)
4. [`CHANGELOG.md`](./CHANGELOG.md)
5. [`docs/release-checklist.md`](./release-checklist.md)
6. [`docs/productization-next-steps-design.md`](./productization-next-steps-design.md)

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
```

## Where To Look For Detail

- `docs/phases/` for phase records.
- `docs/reviews/` for phase review notes.
- `docs/project-status-review.md` for longer evaluation.
- `docs/desktop-release-design.md` for desktop release evidence.
- `docs/plugin-submission-workflow-playbook.md` for plugin onboarding.

## Next Steps

1. Use `docs/productization-next-steps-design.md` as the near-term execution entry for the next productization phases.
2. Continue TypeScript migration by boundary.
3. Fill real Windows and packaged picker evidence before claiming release readiness there.
