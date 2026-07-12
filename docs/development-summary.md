# OpenPet Development Summary

> Last updated: 2026-07-05
> Branch: `main`

This is the compact engineering snapshot for the current repository state. Use [`TODO.md`](./TODO.md) for active work, and use `docs/phases/` plus `docs/reviews/` for detailed implementation history.

## Platform Baseline

OpenPet currently has:

- an Electron pet runtime plus React + Vite Control Center,
- a card-based cursor picker with import, resize, and uploaded custom cursor deletion for pet hover cursors,
- pet-pack import and export flows with bundled built-in packs,
- AI provider settings with main-process secret storage, structured diagnostics, and real-provider smoke entrypoints,
- Common chat/image provider presets such as OpenRouter and Together are endpoint templates rather than verified integrations; only the OpenPet 8317 gateway preset is tied to current archived smoke evidence.
- a developer-first local extension runtime with explicit setup, command, dashboard, and service controls,
- Bubble Chat and Creator Studio host-side provider validation paths, including `npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model>`, `npm run smoke:creator-studio-provider -- --prompt "<prompt>"`, and `npm run run-ai-talk-local-smoke -- --message "<message>"`,
- Archived smoke evidence currently lives at `docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/`, `docs/release-evidence/ai-talk-local-smoke/2026-06-28T15-35-59-210Z/`, `docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/`, `docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-38-29-834Z-dev8-acceptance/`, and `docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-56-30-104Z-main-acceptance/`; the AI Talk smoke records `bubbleAcceptance`, `providerLatencyMs`, and `manualAcceptanceTemplate` but does not by itself prove full desktop feel or later human desktop validation, the Creator Studio provider smoke keeps the `420000ms` timeout override and technical-chain-not-final-asset-quality claim boundary explicit, and the Creator Workflow host smoke proves the narrowed one-click new-pet and existing-action path with reference conditioning on both `codex/dev8` and `main`,
- a landed technical full-pet atlas QA/import path backed by `source-image-validation.json` and `atlas-validation.json`; this proves packaging/import plumbing, not official-quality action rows. The current single-reference, quality-first contract and directional mirror target live in [`pet-character-generation.md`](./pet-character-generation.md),
- active host-owned durable trigger rules where `random`, `state`, and `event` proposals create active host-owned durable trigger rules and feed the Trigger Proposal Inbox review loop,
- typed plugin view config schema/storage/signature payloads, action-frame `inspectionResult` payloads, and pet-pack mutation view payloads normalized at the TypeScript adapter boundary,
- and a narrow plugin host bridge where `trigger-proposals:write` and `model:image-generate` are the current review/generation permissions and plugin-managed provider credentials are unsupported for host-managed generation,
- loopback-only local HTTP/MCP endpoints,
- and a TypeScript migration baseline across shared contracts plus key Control Center and evidence boundaries, including discriminated random/state/event trigger-rule spec contracts plus current smoke report contracts.

## Architecture Facts

- `main.js` assembles the app and service graph.
- `src/main/services/` is the operating core.
- `PetService` is the single source of truth for pet state.
- Control Center owns user-facing configuration.
- Provider credentials stay in the main process.
- The OpenPet gateway archive at `docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/` confirms `gpt-5.5` and `gpt-image-2` discovery, `gpt-5.5` chat completion smoke success, keeps image generation intentionally opt-in and was skipped in that smoke run, and does not prove image generation output quality or asset readiness.
- Imported action success follow-up now routes reviewers to `Actions -> Trigger Proposal Inbox`, imported action handoff failure follow-up routes to `Control Center -> Plugins`, and imported pet follow-up stays in `OpenPet` through `Import Approved Pet`.
- Creator Studio imported review surfaces are phase-aware imported review guidance: after import they no longer mix pre-import QA, repair controls, or retry generation cues into the imported state.
- Archived release-truth evidence remains the source of readiness truth: `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/` still shows an unsigned macOS runtime launch with `plugin-picker-evidence-linked` pending, `pet-picker-evidence-linked` pending, and `invalid-package-feedback` blocked, while `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/` keeps official desktop, macOS, and Windows release claims in a not-ready state.

## Validation Baseline

```bash
npm test                     # full Node regression suite
npm run test:core            # core runtime regression suite
npm run test:tools           # tooling and evidence regression suite
npm run test:control-center  # Playwright UI regression baseline
npm run typecheck            # TypeScript no-emit checks
npm run check:syntax         # Node syntax + typecheck + Control Center build
npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model>
npm run smoke:creator-studio-provider -- --prompt "<prompt>"
npm run run-ai-talk-local-smoke -- --message "你好，请用一句简短中文回复，用于 bubble chat 验收"
npm run update-ai-talk-local-smoke-report -- docs/release-evidence/ai-talk-local-smoke/<session>/ai-talk-local-smoke-result.json --bubble-visible-long-enough true --input-usable true --desktop-feel-notes "Bubble readable and input usable." --validate-complete
npm run run-agent-awareness-local-smoke -- --codex-home ~/.codex
npm run create-agent-awareness-local-smoke-archive -- --session-dir agent-awareness-local-smoke/<session>
npm run update-agent-awareness-local-smoke-report -- docs/release-evidence/agent-awareness-local-smoke/<session>/agent-awareness-local-smoke-result.json --dashboard-useful true --pet-speech-noise-acceptable true --redaction-looks-safe true --notes "Dashboard useful and low-noise." --validate-complete
npm run create-ai-talk-local-smoke-archive -- --session-dir ai-talk-local-smoke/<session>
```

## Open Engineering Themes

- Release evidence still needs real signed macOS and Windows artifacts before support claims can move.
- Packaged native picker evidence still needs real archived runs.
- Creator Studio image-provider polish remains open product work, but host-owned durable trigger rules are already landed for `random`, `state`, and `event`.
- Creator Studio now has Provider row-generation, extraction, stable-slot, row-QA, and official atlas-package infrastructure, while production art approval remains open and Manual-required. The current code still requests both directional rows; the canonical target generates `running-right` once and derives `running-left` as `approved-mirror`. See [`pet-character-generation.md`](./pet-character-generation.md) for the single-image Provider rule, exact quality gates, and remaining runtime work.
- Extension-community proof still needs a compatible third-party package path without overstating trust or safety.

## Reference Points

- Active backlog: [`TODO.md`](./TODO.md)
- Product/release posture: [`project-status-review.md`](./project-status-review.md)
- Maintainer continuation: [`HANDOFF.md`](./HANDOFF.md)
