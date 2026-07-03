# OpenPet Development Summary

> Last updated: 2026-07-03
> Branch: `main`

This is the compact engineering snapshot for the current repository state. Use [`TODO.md`](./TODO.md) for active work, and use `docs/phases/` plus `docs/reviews/` for detailed implementation history.

## Platform Baseline

OpenPet currently has:

- an Electron pet runtime plus React + Vite Control Center,
- a card-based cursor picker with import, resize, and uploaded custom cursor deletion for pet hover cursors,
- pet-pack import and export flows with bundled built-in packs,
- AI provider settings with one `模型 Provider` hub, chat/image capability cards, disclosure-based advanced configuration, main-process secret storage, structured diagnostics, and real-provider smoke entrypoints,
- a developer-first local extension runtime with explicit setup, command, dashboard, and service controls,
- Bubble Chat and Creator Studio host-side provider validation paths,
- loopback-only local HTTP/MCP endpoints,
- and a TypeScript migration baseline across shared contracts plus key Control Center and evidence boundaries.

## Current Verification Facts

- Control Center provider presets for OpenRouter, Together, OpenAI-compatible local gateways, LM Studio, and vLLM are endpoint templates, not verified integrations; only the OpenPet 8317 gateway preset is tied to current archived smoke evidence.
- Chat provider settings separate active saved config from renderer drafts, support separate save and test connection actions, and keep provider credentials in the main process.
- AI provider smoke evidence is archived at `docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/`: `gpt-5.5` and `gpt-image-2` were discoverable, `gpt-5.5` passed chat completion smoke, and image generation remained intentionally opt-in and was skipped, so the archive does not prove image generation output quality or asset readiness.
- AI Talk Bubble Chat smoke uses `npm run run-ai-talk-local-smoke -- --message <text>` and records `bubbleAcceptance`, `providerLatencyMs`, `bubbleDispatch`, and `manualAcceptanceTemplate`; the archived `docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/` run recorded `providerLatencyMs = 2141`, `bubbleDispatch.petSayReceived = true`, and `bubbleDispatch.bubbleStateVisible = true`, but does not by itself prove full desktop feel or transparent popup placement.
- Creator Studio uses one host-owned OpenAI-compatible image Provider contract; `npm run smoke:creator-studio-provider` verifies the provider path, and archived evidence at `docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/` records a `gpt-image-2` run of about `265s` with a `420000ms` timeout override, not a production asset-quality approval.
- Creator Studio provider-backed full-pet runs now package a real generated atlas, write `source-image-validation.json` and `atlas-validation.json`, and gate `Import Approved Pet` on passing QA.
- Creator Studio imported action success submits their trigger proposals into the Actions `Trigger Proposal Inbox`; import handoff failure routes follow-up to `Control Center -> Plugins`; imported pet follow-up remains `OpenPet` through `Import Approved Pet`.
- Creator Studio imported review surfaces are phase-aware imported review guidance: imported runs keep result/follow-up visible without pre-import QA notices, repair controls, or retry generation cues.
- `random`, `state`, and `event` trigger proposals create active host-owned durable trigger rules, backed by discriminated random/state/event trigger-rule spec contracts.
- TypeScript boundary coverage includes typed plugin view config schema/storage/signature payloads, action-frame `inspectionResult` payloads, and pet-pack mutation view payloads.
- Creator-tools bridge permissions include `trigger-proposals:write` and `model:image-generate`; plugin-managed provider credentials are unsupported for host-managed generation.
- Packaged runtime evidence at `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/` shows unsigned macOS packaged runtime launched, with `plugin-picker-evidence-linked` pending and `invalid-package-feedback` blocked.
- Signed release closure evidence at `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/` keeps `releaseReady is false`; official desktop, macOS, and Windows are not-ready because of missing signed macOS evidence, missing desktop picker evidence, and missing signed Windows smoke evidence.

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
- Host-owned trigger-rule editing remains open product work after the current Provider UX hardening pass.
- AI/Creator diagnostics now have better safe logs and UI coverage, but full release confidence still depends on broader smoke and packaged-runtime evidence.
- Extension-community proof still needs a compatible third-party package path without overstating trust or safety.

## Reference Points

- Active backlog: [`TODO.md`](./TODO.md)
- Product/release posture: [`project-status-review.md`](./project-status-review.md)
- Maintainer continuation: [`HANDOFF.md`](./HANDOFF.md)
