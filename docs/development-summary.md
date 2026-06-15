# OpenPet Development Summary

> Last updated: 2026-06-16
> Branch: `main`
> Current release track: `v1.0.1-rc.2`

This is the short engineering summary for the current repository state. For long phase history, read `docs/phases/` and `docs/reviews/`. For support claims and documentation rules, read `docs/project-documentation-design.md`.

## Current State

OpenPet is now a desktop pet platform with:

- an Electron pet window,
- a React + Vite Control Center,
- pet pack import and bundled pet packs,
- AI chat with secret storage in the main process,
- a permission-limited plugin system,
- loopback-only local HTTP / MCP endpoints,
- and a TypeScript migration baseline.

## Latest Delivered Changes

- Native Codex pet import for `pet.json` + `spritesheet.webp` directories.
- Native Codex pet zip import for `.codex-pet.zip` packages.
- Bundled built-in pet packs: `doro`, `duodong`, `chispa`.
- Bundled pet renderer fix so packaged sprite URLs resolve correctly.
- TypeScript migration scaffold with `tsconfig.json`, `npm run typecheck`, and a shared IPC contract sample.

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

## Next Migration Steps

1. Expand TypeScript from shared contracts into the next main-process and Control Center boundaries.
2. Keep `npm start` functional during each migration step.
3. Keep new user-facing configuration in Control Center, not in hidden JSON files.
4. Keep API keys out of renderer and ordinary plugins.
