# OpenPet Handoff

> Last updated: 2026-07-03
> Canonical active queue: [`TODO.md`](./TODO.md)

This file is the compact maintainer continuation note. Historical phase-level detail lives in `docs/phases/`, `docs/reviews/`, and older planning docs.

## Read First

1. [`../README.md`](../README.md)
2. [`TODO.md`](./TODO.md)
3. [`development-workflow.md`](./development-workflow.md)
4. [`testing-strategy.md`](./testing-strategy.md)
5. [`project-context.json`](./project-context.json)

## Current State

- OpenPet is an Electron desktop pet platform with a React Control Center, pet packs, AI configuration, local extensions, and loopback-only local HTTP/MCP.
- `PetService` remains the single source of truth for pet state, actions, and events.
- User-facing configuration belongs in Control Center.
- API keys and provider credentials stay in the main process.
- Real-provider smoke entrypoints now exist for AI provider verification, Bubble Chat acceptance, and Creator Studio provider-path verification.
- The AI pane currently uses one default-open `模型 Provider` section with `聊天模型` / `图片模型` capability cards, disclosure-based advanced sections, and card-local diagnostics. Safe settings/workflow logs now cover chat provider saves, image provider saves, and Creator Studio workflow/default-flow lifecycle events.
- The current public posture is macOS-first release track; Windows tooling exists but Windows is still not release-ready until signed evidence is archived.

## Current Priorities

1. Archive real signed macOS release evidence.
2. Collect real signed Windows smoke evidence.
3. Collect packaged native picker evidence from real app runs.
4. Keep extension-community proof moving without overstating trust.

## Guardrails

- Keep `cat_anime/` structure intact.
- Keep extension capability wording honest and conservative.
- Keep local HTTP/MCP loopback-only and off by default.
- Keep trigger proposal ownership on the host side; `random`, `state`, and `event` still need a host rule editor before they can be applied.

## High-Signal Commands

```bash
npm start
npm run dev:control-center
npm run test:core
npm run test:tools
npm run test:control-center
npm test
npm run check:syntax
npm run check:docs-drift
npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model>
npm run smoke:creator-studio-provider -- --prompt "<prompt>"
npm run run-ai-talk-local-smoke -- --message "<message>"
npm run pack
```

## Where To Look Next

- Active queue: [`TODO.md`](./TODO.md)
- Engineering snapshot: [`development-summary.md`](./development-summary.md)
- Product/release snapshot: [`project-status-review.md`](./project-status-review.md)
- AI Talk and runtime TODO map: [`openpet-current-todo-architecture.md`](./openpet-current-todo-architecture.md)
- AI provider implementation/development note: [`ai-provider-settings-ux-design.md`](./ai-provider-settings-ux-design.md)
- Extension authoring: [`plugin-development.md`](./plugin-development.md)
- Release evidence and gates: [`desktop-release-design.md`](./desktop-release-design.md), [`release-checklist.md`](./release-checklist.md)
