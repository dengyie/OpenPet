# OpenPet Handoff

> Last updated: 2026-07-05
> Canonical active queue: [`TODO.md`](./TODO.md)
> Branch: `main`

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
- Real-provider smoke entrypoints now exist for AI provider verification, Bubble Chat acceptance, and Creator Studio provider-path verification: `npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model>`, `npm run smoke:creator-studio-provider -- --prompt "<prompt>"`, and `npm run run-ai-talk-local-smoke -- --message "<message>"`.
- Archived proof currently lives at `docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/`, `docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/`, `docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/`, `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/`, and `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/`.
- The archived OpenPet gateway smoke confirms `gpt-5.5`, `gpt-image-2`, chat completion smoke success, and that image generation was intentionally opt-in and was skipped in that smoke run; it does not prove image generation output quality or asset readiness.
- The AI Talk Bubble Chat smoke path records `bubbleAcceptance`, `providerLatencyMs`, and `manualAcceptanceTemplate`, and the archived `ai-talk-local-smoke/2026-06-28T15-35-59-210Z/` result does not by itself prove full desktop feel or later human desktop validation.
- Creator Studio full-pet review now uses a landed real-atlas QA/import path backed by `source-image-validation.json` and `atlas-validation.json`.
- The current one-click full-pet policy requires real `idle` and `waving` coverage at QA/import time, while host-side extra pose generation is intentionally limited to `waving`; other rows may fall back from the base pose.
- The current stable shortest path is a single clean front-facing reference image on the saved `gpt-image-2` gateway path; multi-view collage inputs remain less stable and should not be treated as the default success path.
- `random`, `state`, and `event` trigger proposals now create active host-owned durable trigger rules, the Actions pane can minimally edit those saved host rules inline, and Creator Studio follow-up review still goes through the Trigger Proposal Inbox.
- Imported action success follow-up now routes reviewers to `Actions -> Trigger Proposal Inbox`, imported action handoff failure follow-up routes to `Control Center -> Plugins`, and imported pet follow-up stays in `OpenPet` through `Import Approved Pet`.
- Creator Studio imported review surfaces are phase-aware imported review guidance: after import they no longer mix pre-import QA, repair controls, or retry generation cues into the imported state.
- The typed plugin view config schema/storage/signature payloads, action-frame `inspectionResult` payloads, and pet-pack mutation view payloads are already normalized through the TypeScript adapter boundary.
- The current plugin host bridge keeps `trigger-proposals:write` and `model:image-generate` as the narrow generation/review permissions, and plugin-managed provider credentials are unsupported for host-managed generation.
- The current public posture is macOS-first release track; the archived signed closure keeps official desktop, macOS, and Windows in a not-ready state until signed evidence is archived.

## Current Priorities

1. Archive real signed macOS release evidence.
2. Collect real signed Windows smoke evidence.
3. Collect packaged native picker evidence from real app runs; the archived packaged runtime smoke at `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/` still shows `plugin-picker-evidence-linked` pending, `pet-picker-evidence-linked` pending, and `invalid-package-feedback` blocked.
4. Keep extension-community proof moving without overstating trust.

## Guardrails

- Keep `cat_anime/` structure intact.
- Keep extension capability wording honest and conservative.
- Keep local HTTP/MCP loopback-only and off by default.
- Keep trigger proposal ownership on the host side; `random`, `state`, and `event` already create active host-owned durable trigger rules with minimal inline host editing in the Actions pane, while Creator Studio still submits reviewable proposals through the Trigger Proposal Inbox instead of mutating rules directly.

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
- Extension authoring: [`plugin-development.md`](./plugin-development.md)
- Release evidence and gates: [`desktop-release-design.md`](./desktop-release-design.md), [`release-checklist.md`](./release-checklist.md)
- Release blockers remain explicit in the archived signed closure at `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/`: missing signed macOS evidence, missing desktop picker evidence, and missing signed Windows smoke evidence. Apple signing/notarization credentials and real Windows signed artifact execution remain Manual-required.
