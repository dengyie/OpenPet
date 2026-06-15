# OpenPet Development Summary

> Last updated: 2026-06-16
> Branch: `main`
> Current release track: `v1.0.1-rc.2`

This is the short engineering summary for the current repository state. For long phase history, read `docs/phases/` and `docs/reviews/`. For support claims and documentation rules, read `docs/project-documentation-design.md`.
For the next execution-oriented productization sequence, read `docs/productization-next-steps-design.md`. For the implementation-oriented TODO breakdown, read `docs/productization-todo-design.md`.

## Current State

OpenPet is now a desktop pet platform with:

- an Electron pet window,
- a React + Vite Control Center,
- pet pack import and bundled pet packs,
- AI chat with secret storage in the main process,
- a permission-limited plugin system,
- loopback-only local HTTP / MCP endpoints,
- and a TypeScript migration baseline covering shared IPC and Control Center view contracts.

## Latest Delivered Changes

- Native Codex pet import for `pet.json` + `spritesheet.webp` directories.
- Native Codex pet zip import for `.codex-pet.zip` packages.
- Bundled built-in pet packs: `doro`, `duodong`, `chispa`.
- Bundled pet renderer fix so packaged sprite URLs resolve correctly.
- TypeScript migration scaffold with `tsconfig.json`, `npm run typecheck`, shared IPC contracts, and typed Control Center view defaults.
- Productization TODO design that turns the remaining review items into prioritized implementation phases.

## Validation Baseline

```bash
npm test                     # 319/319 Node tests
npm run test:control-center  # 9/9 Playwright UI tests
npm run typecheck            # TypeScript no-emit checks
npm run check:syntax         # Node syntax + typecheck + Control Center build
```

## What Still Needs Care

- Windows is still not release-ready until real signed installer evidence and smoke reports are archived.
- Packaged native picker evidence still needs real archived runs.
- The plugin ecosystem has submission tooling and example assets, but wider community onboarding is still future work.
- The next prioritized work is packaged app runtime smoke, release evidence hardening, and TypeScript contract migration.

## Next Migration Steps

1. Use `docs/productization-next-steps-design.md` and `docs/productization-todo-design.md` to drive the next productization phases.
2. Expand TypeScript from shared IPC and Control Center view contracts into the Control Center API facade, hooks, and main-process service boundaries.
3. Keep `npm start` functional during each migration step.
4. Keep new user-facing configuration in Control Center, not in hidden JSON files.
