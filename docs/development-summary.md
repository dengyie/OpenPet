# OpenPet Development Summary

> Last updated: 2026-06-17
> Branch: `codex/plugin-service-periodic-health-policy-phase71`
> Current release track: `v1.0.1-rc.2`

This is the short engineering summary for the current repository state. For long phase history, read `docs/phases/` and `docs/reviews/`. For support claims and documentation rules, read `docs/project-documentation-design.md`.
For the latest phase execution design, read `docs/productization-v1.1-todo-design.md`. For current platform status, read `docs/project-status-review.md`.

## Current State

OpenPet is now a desktop pet platform with:

- an Electron pet window,
- a React + Vite Control Center,
- pet pack import and bundled pet packs,
- AI chat with secret storage in the main process,
- developer-first local extension docs with explicit `entries.setup` execution, language-neutral explicit `entries.commands` process execution, explicit command result feedback, short-lived command bridge access, explicit dashboard opening, explicit service start/stop controls, explicit loopback service health checks, and host-managed periodic service health policy for running services,
- loopback-only local HTTP / MCP endpoints,
- and a TypeScript migration baseline covering shared IPC, Control Center view contracts, the Control Center API facade, Control Center hook state boundaries, Control Center pane prop surfaces, main-process Control Center adapters for service/catalog/plugin/pet pack/About/update/actions payloads, full release evidence archive / signed closure report contracts, and representative product payload fixtures.

## Current Capability Summary

- Pet packs: Codex pet directory/zip import, bundled `doro`, `duodong`, `chispa`, export, provenance, and version-conflict review.
- AI: OpenAI-compatible chat, main-process secret storage, behavior decisions, replay, redacted diagnostics export, and clear-history controls.
- Extensions: current legacy SDK examples, validation, submission bundles, author rehearsal, developer-first local extension docs, normalized `entries` declarations including explicit `entries.setup` execution, `entries.commands` support through the existing JavaScript compatibility runner and explicit short-lived process execution for declaration-only local extensions, command result feedback in Control Center, short-lived command bridge access for `pet.say` / `pet.action` / `pet.event` / read-only context, Control Center declaration visibility, explicit HTTP/HTTPS dashboard opening, explicit `entries.services` start/stop with runtime status and logs, manual loopback-only health checks, opt-in host-managed periodic health checks for running services, best-effort process-group cleanup on service stop, exit-confirmed setup/command/service stop semantics, and bounded host-side force stop for stubborn services. Command, setup, and service processes are spawned without shell expansion; setup and command entries never run during install or enable, services do not auto-start, and hard process-tree guarantees remain future runtime work.
- Release evidence: packaged runtime smoke runner, stricter runtime/picker evidence-link validation, desktop picker evidence summary/archive manifest tooling, release archive manifest tooling that now requires the picker archive manifest, and signed release closure reporting without unsupported readiness claims.
- TypeScript: shared IPC/view contracts, typed Control Center API facade, typed Control Center hook state boundaries, typed Control Center pane prop surfaces, `@ts-check` main-process Control Center adapters for service/catalog/plugin/pet pack/About/update/actions payloads, plugin extension entry contracts, full release evidence archive / signed closure report contracts, and representative payload fixtures in `npm run typecheck`.

## Validation Baseline

```bash
npm test                     # 510/510 Node tests
npm run test:control-center  # 10/10 Playwright UI tests
npm run typecheck            # TypeScript no-emit checks
npm run check:syntax         # Node syntax + typecheck + Control Center build
```

## Open Work

- Windows is still not release-ready until real signed installer evidence and smoke reports are archived.
- Packaged native picker and signed release archive evidence still need real archived runs; automated macOS packaged runtime evidence is archived under `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/`, Phase 65 requires packaged runtime readiness to link the paired desktop picker report before archive readiness can be claimed, Phase 66 adds desktop picker evidence summary/archive manifest tooling for the reviewed picker archive, and Phase 67 requires the release archive and signed closure flow to consume that picker archive manifest.
- Signed release closure evidence is archived under `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/` and currently records official desktop, macOS, and Windows claims as `not-ready`.
- Extension author rehearsal evidence is archived under `docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/` with minimal, network, storage, and AI-assisted legacy SDK scaffolds plus a validated submission bundle.
- The extension ecosystem now has thirteen runtime-backed slices of the target model: enabled policy-allowed local plugins can explicitly run declared setup entries, `entries.commands` can feed the existing JavaScript compatibility runner when a package still provides `main`, declaration-only local `entries.commands` can run as explicit short-lived processes with JSON stdin context, declaration-only local command runs can use short-lived bridge calls for `pet.say` / `pet.action` / `pet.event` / read-only context, enabled plugins can explicitly open declared HTTP/HTTPS dashboards from Control Center, enabled local plugins can explicitly start/stop declared service entries with logs and runtime state, declared loopback service health endpoints can be checked manually, running services can receive opt-in host-managed periodic health checks, setup/command/service stops now keep stop intent visible until exit confirmation, service stops attempt best-effort process-group cleanup, stubborn services now trigger a bounded force-stop attempt, and command/setup/service processes avoid shell expansion.
- After Phase 71, the next planning step is real signed evidence work, community extension rehearsal, harder process-tree guarantees, or another high-drift service/report boundary.

## Next Engineering Steps

1. Produce real signed release and Windows smoke evidence before changing platform wording.
2. Fill native picker evidence from launched or packaged app runs, archive it with `npm run create-desktop-picker-evidence-summary` and `npm run create-desktop-picker-archive-manifest`, then feed that archive into the release-level manifest and closure report.
3. Decide whether the next extension phase should implement harder process-tree cleanup guarantees or continue evidence/report hardening.
4. Keep `npm start` functional and keep user-facing configuration in Control Center.
