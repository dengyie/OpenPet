# OpenPet Development Summary

> Last updated: 2026-07-03

This is the compact engineering snapshot for the current repository state. Use [`TODO.md`](./TODO.md) for active work, and use `docs/phases/` plus `docs/reviews/` for detailed implementation history.

## Platform Baseline

OpenPet currently has:

- an Electron pet runtime plus React + Vite Control Center,
- a card-based cursor picker with import, resize, and uploaded custom cursor deletion for pet hover cursors,
- pet-pack import and export flows with bundled built-in packs,
- AI provider settings with main-process secret storage, structured diagnostics, and real-provider smoke entrypoints,
- a developer-first local extension runtime with explicit setup, command, dashboard, and service controls,
- Bubble Chat and Creator Studio host-side provider validation paths,
- loopback-only local HTTP/MCP endpoints,
- and a TypeScript migration baseline across shared contracts plus key Control Center and evidence boundaries.

## Architecture Facts

- `main.js` assembles the app and service graph.
- `src/main/services/` is the operating core.
- `PetService` is the single source of truth for pet state.
- Control Center owns user-facing configuration.
- Provider credentials stay in the main process.

## Validation Baseline

```bash
npm run test:core
npm run test:tools
npm run test:control-center
npm test
npm run check:syntax
npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model>
npm run smoke:creator-studio-provider -- --prompt "<prompt>"
npm run run-ai-talk-local-smoke -- --message "<message>"
```

## Open Engineering Themes

- Release evidence still needs real signed macOS and Windows artifacts before support claims can move.
- Packaged native picker evidence still needs real archived runs.
- Creator Studio image-provider polish and host-owned trigger-rule editing remain open product work.
- Extension-community proof still needs a compatible third-party package path without overstating trust or safety.

## Reference Points

- Active backlog: [`TODO.md`](./TODO.md)
- Product/release posture: [`project-status-review.md`](./project-status-review.md)
- Maintainer continuation: [`HANDOFF.md`](./HANDOFF.md)
