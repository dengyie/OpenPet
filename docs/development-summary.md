# OpenPet Development Summary

> Last updated: 2026-06-16
> Branch: `main`
> Current release track: `v1.0.1-rc.2`

This is the short engineering summary for the current repository state. For long phase history, read `docs/phases/` and `docs/reviews/`. For support claims and documentation rules, read `docs/project-documentation-design.md`.
For the next execution-oriented productization sequence, read `docs/productization-v1.1-todo-design.md`, then use `docs/productization-next-steps-design.md` and `docs/productization-todo-design.md` for older planning context.

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
- v1.1 TODO design that turns the Phase 37+ open work into phase-ready release evidence, plugin, pet pack, AI debugging, TypeScript, and documentation tracks.
- Packaged runtime smoke evidence tooling for pet window, transparency, sprite visibility, built-in pet pack switching, and linked picker evidence.
- Release evidence archive manifest tooling that hashes and validates macOS signing evidence plus Windows smoke, desktop picker, and packaged runtime reports without claiming readiness for pending evidence.
- Plugin secrets decision and scaffolding: plugin config remains public settings, secret-like fields are rejected, and `create-openpet-plugin` generates minimal/network/storage starter templates.

## Validation Baseline

```bash
npm test                     # 352/352 Node tests
npm run test:control-center  # 9/9 Playwright UI tests
npm run typecheck            # TypeScript no-emit checks
npm run check:syntax         # Node syntax + typecheck + Control Center build
```

## What Still Needs Care

- Windows is still not release-ready until real signed installer evidence and smoke reports are archived.
- Packaged native picker, packaged runtime, and signed release archive evidence still need real archived runs.
- The plugin ecosystem has submission tooling, examples, and scaffolding, but sandbox evaluation and wider community onboarding are still future work.
- The next prioritized work is Phase 39 sandbox evaluation, filling real packaged runtime/picker evidence, release evidence hardening, and continuing TypeScript contract migration.

## Next Migration Steps

1. Use `docs/productization-v1.1-todo-design.md` to drive the next productization phases.
2. Expand TypeScript from shared IPC and Control Center view contracts into the Control Center API facade, hooks, and main-process service boundaries.
3. Keep `npm start` functional during each migration step.
4. Keep new user-facing configuration in Control Center, not in hidden JSON files.
