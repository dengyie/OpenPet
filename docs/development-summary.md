# OpenPet Development Summary

> Last updated: 2026-06-28
> Current release track: `v1.0.1-rc.3`

This file is the short English summary of the current repository state. For the full developer guide, read `docs/jishuwendang.md`. For the live TODO map, read `docs/openpet-current-todo-architecture.md`. For historical implementation details, read `docs/phases/` and `docs/reviews/`.

## Current State

OpenPet is an Electron desktop pet platform with:

- a transparent pet window and Control Center built with React + Vite,
- pet-pack runtime, bundled packs, Codex pet import, and bounded action/frame import flows,
- host-owned AI chat, AI Talk memory/persona, desktop chat surfaces, and Creator Studio image-provider settings,
- a permission-gated plugin system with explicit setup/command/service execution and bounded creator-tools bridge routes,
- loopback-only local HTTP / MCP surfaces,
- and a TypeScript contract layer across shared IPC, Control Center adapters, and evidence/report payloads.

## Current Capability Summary

- Pet behavior: scaling, movement tuning, grounded roaming, home-anchor behavior, bubble timing, and startup preferences.
- Actions: pack-owned action config, host-mediated frame import, trigger proposal inbox, review/apply flow for `click`, acknowledgement flow for `manual` and `unbound`, and Creator Studio approved-import proposals queued into the persistent inbox with provenance.
- AI: active/draft provider settings, save/test separation, sanitized diagnostics, AI Talk persona/history/memory, and host-owned image generation for Creator Studio.
- Plugins: explicit `entries.setup`, `entries.commands`, and `entries.services`; short-lived command bridge access; bounded creator-tools asset/action/pack-manifest workflows; dashboard open; loopback health checks; periodic health policy; and cleanup evidence/report tooling.
- Release tooling: packaged runtime smoke tooling, desktop picker and Windows smoke evidence tooling, macOS signed-evidence capture/archive tooling, and conservative signed release closure reporting.

## Validation Baseline

```bash
npm run test:core
npm run test:core:all
npm run test:tools
npm test
npm run test:control-center
npm run check:syntax
```

For the current Creator Studio trigger-proposal slice, the targeted regression baseline is:

```bash
node --test tests/services/plugin-service.test.js tests/control-center/plugin-command-result.test.js
```

## Open Work

- Windows is still not release-ready until real signed installer evidence and smoke reports are archived.
- `random`, `state`, and `event` trigger proposals still need a durable host rule schema/editor before they can be applied.
- Creator Studio still needs a smoother dashboard-first user flow; current command paths are functional but still operator-leaning.
- Bubble chat and desktop chat still need final product convergence around one primary lightweight surface.

## Read Next

1. `docs/HANDOFF.md`
2. `docs/jishuwendang.md`
3. `docs/openpet-current-todo-architecture.md`
4. `docs/project-status-review.md`
