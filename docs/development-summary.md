# OpenPet Development Summary

> Last updated: 2026-06-29
> Current release track: `v1.0.1-rc.3`
> Role: short English engineering summary for quick orientation.

This file is intentionally short. For the full developer guide, read
`docs/jishuwendang.md`. For testing policy, read `docs/testing-strategy.md`.
For the live TODO map, read `docs/openpet-current-todo-architecture.md`. For
the documentation map, start at `docs/README.md`.

## Current State

OpenPet is an Electron desktop pet platform with:

- a transparent pet window and Control Center built with React + Vite,
- pet-pack runtime, bundled packs, Codex pet import, and bounded action/frame import flows,
- host-owned AI chat, AI Talk memory/persona, desktop chat surfaces, and Creator Studio image-provider settings,
- a permission-gated plugin system with explicit setup/command/service execution and bounded creator-tools bridge routes,
- loopback-only local HTTP / MCP surfaces,
- and a TypeScript contract layer across shared IPC, Control Center adapters, and evidence/report payloads.

## Current Capability Summary

- Pet behavior: scaling, movement tuning, grounded roaming, home-anchor behavior, bubble timing, startup preferences, and a compact custom pet context menu with a cascaded manual-action submenu.
- Actions: pack-owned action config, host-mediated frame import, persistent trigger proposal inbox, review/apply flow for `click`, acknowledgement flow for `manual` and `unbound`, host-owned `triggerRules` for `random` / `state` / `event` with Actions-pane editing, save-before-save preview summaries, strict host validation on edited rule saves, host-owned runtime execution for saved non-click rules, and Creator Studio approved-import proposals queued into the same inbox with provenance.
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

Use `docs/testing-strategy.md` when deciding whether a change needs only a
targeted suite, all core tests, or the full broader regression set.

For pet context menu changes, the targeted regression baseline is:

```bash
node --test tests/main/ipc-context-menu.test.js tests/main/pet-context-menu.test.js tests/main/pet-context-menu-window.test.js tests/renderer-menu-viewport.test.js
```

For the current actions and trigger-rule slice, the targeted regression
baseline is:

```bash
node --test tests/services/action-service.test.js tests/services/action-import-service.test.js tests/services/pet-pack-service.test.js tests/main/control-center-adapters.test.js tests/main/ipc-plugin-install.test.js
npm run test:control-center -- --grep "trigger|Actions"
```

## Open Work

- Windows is still not release-ready until real signed installer evidence and smoke reports are archived.
- AI Talk has relevance-based memory scoring, selective injected-memory usage writeback, action-tool metadata with current-pet action hints, and shared-transcript bubble segmentation; remaining work is focused on richer diagnostics, legacy upgrade continuity, and longer-horizon chat controls.
- Creator Studio still needs a smoother dashboard-first user flow; current command paths are functional but still operator-leaning.
- Bubble chat is now the default lightweight chat entry across pet interaction paths, while the desktop chat window remains an explicit extended panel; Bubble Chat can now rebuild segmented assistant dialogue from the shared transcript instead of owning a second transcript, and remaining AI Talk work is focused on richer diagnostics, legacy upgrade continuity, and transcript/tooling polish rather than entry-point convergence.

## Read Next

1. `docs/README.md`
2. `docs/HANDOFF.md`
3. `docs/jishuwendang.md`
4. `docs/testing-strategy.md`
5. `docs/openpet-current-todo-architecture.md`
