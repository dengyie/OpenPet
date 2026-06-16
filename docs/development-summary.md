# OpenPet Development Summary

> Last updated: 2026-06-16
> Branch: `main`
> Current release track: `v1.0.1-rc.2`

This is the short engineering summary for the current repository state. For long phase history, read `docs/phases/` and `docs/reviews/`. For support claims and documentation rules, read `docs/project-documentation-design.md`.
For the latest review-derived TODO design, read `docs/productization-next-steps-design.md`. For the phase-ready v1.1 execution sequence, read `docs/productization-v1.1-todo-design.md`.

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
- Productization TODO design that turns the latest whole-project review items into workstreams, acceptance gates, and execution order.
- v1.1 TODO design that turns the Phase 37+ open work into phase-ready release evidence, plugin, pet pack, AI debugging, TypeScript, and documentation tracks.
- Packaged runtime smoke evidence tooling and runner for pet window, transparency, sprite visibility, speech bubble, action playback, built-in pet pack switching, and linked picker evidence.
- Release evidence archive manifest tooling that hashes and validates macOS signing evidence plus Windows smoke, desktop picker, and packaged runtime reports without claiming readiness for pending evidence.
- Plugin secrets decision and scaffolding: plugin config remains public settings, secret-like fields are rejected, and `create-openpet-plugin` generates minimal/network/storage starter templates.
- Plugin sandbox evaluation: current child-process + Node permission-model + VM runner remains the v1.1 recommendation, with documented limits and re-evaluation triggers.
- Pet pack export and provenance: installed user packs can be exported as `.openpet-pet.zip`, imported provenance is retained, and built-in packs remain read-only.
- AI behavior decision viewer: Control Center shows recent behavior decisions, supports replay, exports redacted diagnostics, and clears decision history.

## Validation Baseline

```bash
npm test                     # 390/390 Node tests
npm run test:control-center  # 10/10 Playwright UI tests
npm run typecheck            # TypeScript no-emit checks
npm run check:syntax         # Node syntax + typecheck + Control Center build
```

## What Still Needs Care

- Windows is still not release-ready until real signed installer evidence and smoke reports are archived.
- Packaged native picker and signed release archive evidence still need real archived runs; automated macOS packaged runtime evidence is archived under `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/`.
- Signed release closure evidence is archived under `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/` and currently records official desktop, macOS, and Windows claims as `not-ready`.
- The plugin ecosystem has submission tooling, examples, scaffolding, and a documented sandbox decision; wider community onboarding is still future work.
- The next prioritized work is filling native picker evidence, signed release evidence, plugin author rehearsals, and continuing TypeScript contract migration.

## Next Migration Steps

1. Use `docs/productization-v1.1-todo-design.md` to drive the next productization phases.
2. Expand TypeScript from shared IPC and Control Center view contracts into the Control Center API facade, hooks, and main-process service boundaries.
3. Keep `npm start` functional during each migration step.
4. Keep new user-facing configuration in Control Center, not in hidden JSON files.
