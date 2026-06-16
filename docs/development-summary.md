# OpenPet Development Summary

> Last updated: 2026-06-17
> Branch: `main`
> Current release track: `v1.0.1-rc.2`

This is the short engineering summary for the current repository state. For long phase history, read `docs/phases/` and `docs/reviews/`. For support claims and documentation rules, read `docs/project-documentation-design.md`.
For the latest phase execution design, read `docs/productization-v1.1-todo-design.md`. For current platform status, read `docs/project-status-review.md`.

## Current State

OpenPet is now a desktop pet platform with:

- an Electron pet window,
- a React + Vite Control Center,
- pet pack import and bundled pet packs,
- AI chat with secret storage in the main process,
- a permission-limited plugin system,
- loopback-only local HTTP / MCP endpoints,
- and a TypeScript migration baseline covering shared IPC, Control Center view contracts, the Control Center API facade, Control Center hook state boundaries, Control Center pane prop surfaces, main-process Control Center adapters for service/catalog/plugin/pet pack/About/update payloads, and representative product payload fixtures.

## Current Capability Summary

- Pet packs: Codex pet directory/zip import, bundled `doro`, `duodong`, `chispa`, export, provenance, and version-conflict review.
- AI: OpenAI-compatible chat, main-process secret storage, behavior decisions, replay, redacted diagnostics export, and clear-history controls.
- Plugins: permission-limited runtime, example plugins, validation, submission bundles, author rehearsal, and conservative public-config-only secret policy.
- Release evidence: packaged runtime smoke runner, release archive manifest tooling, and signed release closure reporting without unsupported readiness claims.
- TypeScript: shared IPC/view contracts, typed Control Center API facade, typed Control Center hook state boundaries, typed Control Center pane prop surfaces, `@ts-check` main-process Control Center adapters for service/catalog/plugin/pet pack/About/update payloads, and representative payload fixtures in `npm run typecheck`.

## Validation Baseline

```bash
npm test                     # 405/405 Node tests
npm run test:control-center  # 10/10 Playwright UI tests
npm run typecheck            # TypeScript no-emit checks
npm run check:syntax         # Node syntax + typecheck + Control Center build
```

## Open Work

- Windows is still not release-ready until real signed installer evidence and smoke reports are archived.
- Packaged native picker and signed release archive evidence still need real archived runs; automated macOS packaged runtime evidence is archived under `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/`.
- Signed release closure evidence is archived under `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/` and currently records official desktop, macOS, and Windows claims as `not-ready`.
- Plugin author rehearsal evidence is archived under `docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/` with minimal, network, storage, and AI-assisted scaffolds plus a validated submission bundle.
- The plugin ecosystem has submission tooling, examples, scaffolding, an author rehearsal, and a documented sandbox decision; wider community onboarding is still future work.
- After Phase 52, the next planning step is a fresh whole-project review, a concrete evidence-producing phase, or the next high-drift TypeScript boundary.

## Next Engineering Steps

1. Produce real signed release and Windows smoke evidence before changing platform wording.
2. Fill native picker evidence from launched or packaged app runs.
3. Expand TypeScript from the current main-process Control Center adapters into another high-drift service, evidence, or report payload boundary.
4. Keep `npm start` functional and keep user-facing configuration in Control Center.
