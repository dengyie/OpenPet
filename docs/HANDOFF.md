# OpenPet Handoff

> Last updated: 2026-07-03
> Branch: `main`
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
- OpenRouter and Together provider presets are endpoint templates; only the OpenPet 8317 gateway preset is tied to archived smoke evidence.
- Archived AI provider smoke evidence lives at `docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/`: `gpt-5.5` and `gpt-image-2` were discovered, `gpt-5.5` passed chat completion smoke, image generation was intentionally skipped, and the archive does not prove image generation output quality.
- AI Talk Bubble Chat smoke uses `npm run run-ai-talk-local-smoke -- --message <text>` and records `bubbleAcceptance`, `providerLatencyMs`, `bubbleDispatch`, and `manualAcceptanceTemplate`; archived telemetry lives under `docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/` and does not by itself prove full desktop feel.
- Creator Studio provider smoke uses `npm run smoke:creator-studio-provider`; archived evidence at `docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/` records a `gpt-image-2` run with `420000ms` timeout override, not production asset-quality approval.
- Creator Studio provider-backed full-pet runs now use real-atlas packaging with `source-image-validation.json` and `atlas-validation.json`; imported action success routes to `Actions -> Trigger Proposal Inbox`, import handoff failure routes to `Control Center -> Plugins`, and imported pet follow-up remains `OpenPet`.
- Imported review guidance is phase-aware and no longer mixes pre-import QA, repair controls, or retry generation cues after import.
- `random`, `state`, and `event` trigger proposals create active host-owned durable trigger rules with discriminated random/state/event trigger-rule spec contracts.
- TypeScript boundary coverage includes typed plugin view config schema/storage/signature payloads, action-frame `inspectionResult` payloads, and pet-pack mutation view payloads.
- Creator-tools bridge permissions include `trigger-proposals:write` and `model:image-generate`; plugin-managed provider credentials are unsupported for host-managed generation.
- Packaged runtime evidence is archived at `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/`: unsigned macOS packaged runtime launched, pending picker-link checks include `plugin-picker-evidence-linked` and `pet-picker-evidence-linked`, and `invalid-package-feedback` is blocked.
- Signed release closure evidence is archived at `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/`; official desktop, macOS, and Windows remain not-ready with blockers including missing signed macOS evidence, missing desktop picker evidence, and missing signed Windows smoke evidence.
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
- Keep trigger proposal ownership on the host side; `random`, `state`, and `event` durable rule creation remains host-owned.

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
