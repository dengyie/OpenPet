# OpenPet Current TODO Architecture

> Date: 2026-06-28
> Baseline: `main@a317ec5` (`feat(chat): unify pet chat surfaces`)
> Status: live TODO entry point
> Scope: summarize current product gaps by the code architecture that owns them. Historical phase/spec documents remain audit records.

## Purpose

OpenPet now has enough moving parts that TODOs must be tracked by runtime boundary, not by old phase order. This document is the current engineering entry point for future milestones. When this document conflicts with older phase/spec notes, prefer this document first, then inspect the referenced source files.

This is not a promise to implement every item in one milestone. It is a map for choosing the next bounded milestone.

## Priority Rules

- P0: blocks app startup, data safety, secret safety, user-facing saved flows, or a released surface.
- P1: next milestone candidates with clear user value and an existing architecture owner.
- P2: useful product polish or scale work after P1 flows are stable.
- P3: longer-term platform direction.
- Manual-required: needs real provider accounts, signed artifacts, notarization, Windows machines, production credentials, or human review.

Current P0 status: no known startup/build blocker in this TODO pass. Trigger proposal inbox closure is now landed; remaining work is P1 product polish or Manual-required release/provider evidence.

## Current Code Architecture

| Boundary | Primary files | Owns | Guardrails |
| --- | --- | --- | --- |
| App composition | `main.js` | dependency assembly, lifecycle, single-instance startup | keep business logic in services |
| Pet state | `src/main/services/pet-service.js`, `src/main/services/action-service.js`, `src/main/services/pet-pack-service.js` | pet settings, actions, active pack, `say` / action state | `PetService` stays the state source of truth |
| AI provider | `src/main/services/ai-service.js`, `src/main/services/secret-service.js`, `src/main/services/app-log-service.js` | chat provider calls, provider diagnostics, secret lookup | API keys never leave main process |
| AI Talk | `src/main/services/ai-talk-service.js`, `src/main/services/ai-talk-store.js` | pet-pack persona, per-pack conversation, long-term memory, background extraction | no full prompt/API key/raw memory in default logs |
| Desktop chat | `src/main/pet-chat-window.js`, `src/main/pet-chat/`, `src/main/pet-chat-preload.js` | standalone chat window shell and state | share AI Talk product logic instead of forking chat behavior |
| Image generation | `src/main/services/image-generation-model-service.js` | OpenAI-compatible image Provider, health checks, host-owned output writes | plugins submit prompts only, host owns credentials and writes |
| Behavior orchestration | `src/main/services/behavior-orchestrator-service.js` | action decision validation, cooldown, replay, diagnostics | model can suggest, host validates and executes |
| Control Center | `src/control-center/src/api/control-center-api.ts`, `src/control-center/src/hooks/`, `src/control-center/src/panes/` | all user-facing configuration surfaces | new config must be operable here |
| Plugin host | `src/main/services/plugin-service.js`, `src/main/services/plugin-install-service.js`, `src/main/plugins/` | manifest policy, command/service bridge, creator-tools routes | permission-gated, token-gated, no unrestricted plugin access |
| Creator Studio plugin | `examples/plugins/creator-studio/` | prompt/task workflow, run state, QA, preview, import requests | provider secrets, final imports, and trigger persistence stay host-owned |
| Contracts/tests | `src/shared/openpet-contracts.ts`, `src/shared/ipc-channels.*`, `tests/` | IPC/view contracts and regression boundaries | keep JS and TS channel files synchronized |

## Current Landed Facts

- Chat provider UX has separate `保存聊天 Provider` and `测试已保存配置` actions. Saving does not require a successful test, and testing uses the active saved config.
- Image generation settings use a host-owned OpenAI-compatible image Provider contract in Control Center. Legacy `fixture` / `cloud` / `local` vocabulary may still appear in Creator Studio run backends, but secrets and provider calls remain host-owned.
- Control Center AI settings now include chat/image provider presets with explicit claim boundaries: OpenAI/OpenRouter/Together/LM Studio/vLLM/local entries are endpoint templates that require saving plus test or health check before use, while the OpenPet `127.0.0.1:8317/v1` gateway preset is the only preset tied to current archived smoke evidence for `gpt-5.5` chat and `gpt-image-2` Creator Studio provider-path validation. The AI pane also includes optional `/models` discovery with safe fallback wording, chat/image model compatibility hints, safe image generation usage/cost summaries when provider metadata is available, stale-result warnings when chat/image provider drafts are unsaved, and a model-settings-first layout where `聊天 Provider` / `图片 Provider` open by default while secondary memory/persona/behavior/chat sections stay collapsed until expanded.
- AI Provider smoke evidence now has a repeatable CLI entry point: `npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model> [--include-image] --image-model <model> --output <report.json>`. It probes `/models`, tests chat completions, keeps image generation opt-in, and writes a sanitized report without raw API keys.
- Creator Studio image Provider smoke evidence now also has a repeatable CLI entry point: `npm run smoke:creator-studio-provider -- --prompt <text> [--user-data-dir <dir>] [--output-dir <dir>] [--width <n>] [--height <n>] [--timeout-ms <n>] [--skip-health-check]`. It reuses the saved host image Provider config and secret, runs the OpenPet prompt builder plus provider image generation plus action-frame QA chain, and writes a sanitized session report without raw API keys.
- AI Provider smoke evidence for the user's OpenPet development gateway is archived under `docs/release-evidence/ai-provider-smoke/2026-06-28T11-08-10Z-openpet-gateway/`: `/models` exposed `gpt-5.5` and `gpt-image-2`, and `gpt-5.5` passed chat completion smoke; image generation was intentionally skipped.
- Creator Studio provider smoke evidence for the user's OpenPet development gateway is archived under `docs/release-evidence/creator-studio-provider-smoke/2026-06-28T14-06-27-403Z/`: the saved host-owned `gpt-image-2` configuration passed health check, returned one source PNG after about `265s` using requested `512x512` generation constraints, and passed 16-frame action QA with zero warnings under a temporary `420000ms` timeout override.
- AI Talk core exists: `AiTalkService`, `AiTalkStore`, pet-pack `persona`, local persona override, generated persona draft, pet-pack isolated main conversations, conservative legacy `settings.ai.conversations.control-center` migration, active pet-pack refresh signals for AI pane and desktop chat, redacted trace diagnostics export with pet-pack and conversation filters, trace-filter rebinding when the active pet-pack changes, background memory extraction, relevance-ranked memory injection with use tracking, compact bubble segmentation, current-pet action candidate tool hints, provider behavior `reason` / `displayMode` preservation through behavior decisions, memory profile UI, delete memory, and clear current pet-pack memories.
- Desktop chat window exists and routes through the same pet chat state/AI Talk flow instead of introducing a separate product brain.
- Bubble chat is now the default lightweight pet dialogue surface, with the standalone desktop chat positioned as an extended panel for longer history and advanced interaction.
- AI Talk also has a repeatable real-provider Bubble Chat smoke path through `npm run run-ai-talk-local-smoke -- --message <text>` plus the runbook `docs/superpowers/specs/2026-06-28-real-provider-chat-acceptance-runbook.md`; the smoke result captures `bubbleAcceptance.requestId`, `providerLatencyMs`, `bubbleDispatch` visibility evidence, and a `manualAcceptanceTemplate` placeholder for later human desktop validation.
- Creator Studio already has `GenerationTask`, deterministic `conversation-wizard`, task answer/confirm commands, `openpet-prompt-builder`, host model bridge, run persistence, QA artifacts, dashboard-first wizard display, prompt snapshot, wizard-step rail, retry/recover for failed provider runs, sanitized developer-mode prompt provenance, workflow smoke guidance, and structured approved action/pet import command handoff that tells the dashboard which Control Center plugin command to run while preserving command-scoped bridge-token boundaries.
- Creator Studio fixture single-action runs now produce reviewable action-frame artifacts, contact-sheet QA, repairable frame previews, and an `Import Approved Action` dashboard handoff, so the dashboard can validate the action-specific review/import path without a live provider.
- Creator Studio dashboard browser regressions now cover both single-action and full-pet fixture flows through draft/confirm/generate/review/approve to the correct host-owned import handoff, including mode-correct generation status copy, blocked action-frame QA recovery messaging, imported action handoff failure follow-up, and the `Import Approved Pet` full-pet review path.
- Creator Studio provider-backed full-pet runs now package a real generated atlas instead of a placeholder sprite, write source-image and atlas QA artifacts, and gate `Import Approved Pet` on passing QA before the host import bridge runs.
- Action trigger review exists for the manually selected action path: `click` can update `clickAction`; `manual` and `unbound` are acknowledged; `random`, `state`, and `event` create host-owned durable trigger rules.
- Trigger proposal inbox now has a host-owned service/API/UI closed loop: proposals can be submitted, persisted, accepted, rejected, preserved through action regeneration, and reviewed from the Actions pane.
- Creator Studio approved single-action imports now submit their generated `triggerProposal` into the host-owned trigger proposal inbox through the narrow `trigger-proposals:write` creator-tools bridge permission after action frames are imported; the plugin still does not directly apply trigger rules.
- Creator Studio imported follow-up routing is now outcome-specific across `nextStep`, `actionLane`, `workflowGuidance.import.followUp`, and imported result review surfaces: imported action success routes the next review step to `Actions -> Trigger Proposal Inbox`, imported action handoff failures route follow-up to `Control Center -> Plugins`, and imported pet follow-up remains `OpenPet` through `Import Approved Pet`.
- Creator Studio imported review surfaces are now phase-aware: once a run is `imported`, the dashboard keeps imported result and follow-up guidance visible but no longer mixes in pre-import QA blocked notices, repair controls, or retry-generation cues from the approval phase.
- Creator Studio dashboard service now exposes a unified `reviewSnapshot` for each run so dashboard panels, service clients, and browser regressions read the same review gate, import state, next-action owner, and trigger handoff status for blocked QA, imported action success, and import handoff failure paths.
- Creator Studio dashboard service only exposes local task/run/review routes, returns explicit JSON `404` for unknown `/api/*` paths, and cannot invoke command-scoped host bridge routes outside explicit command runs.
- Creator Studio generation remains host-owned at the provider boundary; plugin-managed provider credentials are unsupported in the current trust model.

## P1 Architecture TODOs

### 1. AI Provider And Model Settings

Owner boundary: `AiService`, `ImageGenerationModelService`, Control Center AI pane.

Current state:

- Chat Provider save and test are separated and provide section-local feedback.
- Image Provider can be saved independently and health-checked through host services.
- Provider diagnostics are structured and sanitized.
- Chat provider presets cover OpenAI official, LM Studio, vLLM, OpenRouter, Together, generic local or proxied OpenAI-compatible gateways, and the OpenPet `127.0.0.1:8317/v1` development gateway; image provider presets cover OpenAI official, Together, OpenRouter, generic local or proxied OpenAI-compatible gateways, and the OpenPet `127.0.0.1:8317/v1` development gateway. The common provider presets are conservative endpoint templates, not proof of current account/model reachability; only the OpenPet 8317 preset is tied to the archived OpenPet gateway smoke evidence.
- Chat/image provider health checks now perform optional `/models` discovery with safe fallback wording when probing is unavailable.
- Chat/image model compatibility hints are visible in the AI pane, now keyed by provider family plus model where possible; image generation usage/cost summaries surface when safe provider metadata is returned, unsaved chat/image drafts now warn that `/models` and usage results still reflect saved config, and the AI pane foregrounds the chat/image Provider sections before collapsed memory/persona/behavior/chat sections while explicitly restating the host-owned trust and save/test boundaries.
- `scripts/run-ai-provider-smoke.js` and `npm run smoke:ai-provider` provide a sanitized real-gateway smoke path for confirming chat model names, image model names, optional `/models` discovery, and opt-in image generation without exposing API keys in the output report.
- `scripts/run-creator-studio-provider-smoke.js` and `npm run smoke:creator-studio-provider` provide a sanitized host-side smoke path for confirming that the saved Creator Studio image Provider configuration can complete prompt build, provider generation, and action-frame QA using the same main-process services that own secrets and output writes; smoke operators can tune width, height, and a temporary per-run timeout without persisting those overrides back into saved settings.
- The user's current OpenPet gateway has archived sanitized evidence confirming that `gpt-5.5` and `gpt-image-2` are discoverable model ids and that `gpt-5.5` can complete a chat smoke request.
- The user's current OpenPet gateway also has archived sanitized Creator Studio smoke evidence confirming that the saved host-owned `gpt-image-2` image Provider path can complete prompt build, real provider generation, and action-frame QA end to end when the smoke run is given a `420000ms` timeout and `512x512` generation constraints.

P1 work:

- Keep the curated provider preset list small and verified instead of turning the AI pane into a large dynamic catalog.
- Keep provider compatibility copy aligned with real verified gateway behavior for future provider presets and for any opt-in image-generation evidence.

P2/P3:

- Connection test history with last success/failure timestamps.
- Multiple named provider profiles.
- Provider failover/routing.

Manual-required:

- Real cloud/local provider smoke evidence for each supported provider preset.
- Human review of generated image quality and contact-sheet readability before treating `gpt-image-2` output as production asset-quality evidence.

### 2. AI Talk And Pet Chat

Owner boundary: `AiTalkService`, `AiTalkStore`, `PetChatWindowManager`, Control Center AI pane.

Current state:

- Each pet-pack has an isolated `control-center:{petPackId}:main` conversation.
- Persona is layered as pet-pack default plus local override, then compiled into system prompt.
- Memory is automatically extracted in the background and injected as dynamic context without blocking the main reply.
- Memory injection is relevance-ranked by current user message, recent history, tags, scope, importance, confidence, recency, and use count; injected memories update `lastUsedAt` and `useCount`.
- Memory profile UI can show global and pet-pack memories, delete one memory, and clear current pet-pack relationship memories.
- Trace diagnostics export already supports pet-pack-specific and conversation-specific slices.
- Desktop chat is connected to the same chat state rather than a separate AI implementation.
- User-facing chat entry wording now reflects the intended split: Bubble Chat is the default lightweight surface, while `PetChatWindow` is labeled as an extended panel rather than a parallel primary chat entry.
- Chat surface convergence is implemented around one lightweight visible Bubble Chat surface, one extended desktop chat panel, one shared `AiTalkService` brain, and `PetService.say()` as the speech ingress.
- Packaged runtime smoke evidence now aligns with the real lightweight chat surface: it records Bubble Chat visibility/item evidence, can capture a dedicated Bubble Chat screenshot, and treats the old renderer `#bubble` as a hidden compatibility node rather than the primary speech surface.
- The AI Talk smoke and Bubble Chat acceptance path proves request correlation and popup dispatch, but it does not by itself prove that placement, dwell time, and transparent hit-testing have passed a fresh human desktop feel review.

P1 work:

- Keep future trace UX aligned if trace volume or streaming surfaces expand beyond the current export and filter model.

P2/P3:

- Streaming replies and cancel generation.
- Multiple conversations per pet-pack.
- LLM history summarization.
- Embedding/vector memory retrieval.
- AI Talk plugin extension points.
- Advanced memory privacy controls and manual memory approval mode.

Manual-required:

- Real provider latency and streaming behavior checks once streaming is introduced.
- Real desktop-product validation for bubble placement, transparent hit-testing, reading time, and whether the desktop chat can safely be demoted to an extended panel without harming power-user workflows.

### 2A. Chat Surface Convergence Direction

Owner boundary: `src/main/pet-bubble-chat-window.js`, `src/main/pet-chat-window.js`, `src/main/ipc.js`, `renderer.js`, Control Center Pet/AI panes.

Decision:

- OpenPet should not keep evolving two parallel primary chat experiences.
- The transparent bubble chat above the pet is the default lightweight conversation surface.
- The standalone desktop chat window is retained, but positioned as an extended panel for long-form history, advanced controls, and later streaming-focused interaction.

Why this direction fits the current architecture:

- `PetService.say()` is already the correct single speech ingress for AI, plugins, MCP, local HTTP, and other runtime emitters.
- The main process already owns both bubble and desktop chat windows, which means surface convergence can happen without moving provider logic into a renderer.
- AI Talk already provides the right shared state model: one per-pack main conversation, persona layering, memory extraction, and provider-safe orchestration.
- The current dual-surface model causes product ambiguity: users can see a lightweight bubble path and a full chat path that both feel like "the chat", which makes future behavior changes harder to reason about.

Convergence rules:

- One visible lightweight chat surface: the transparent `BubbleChatWindow`.
- One extended chat surface: the standalone `PetChatWindow`.
- One chat brain: `AiTalkService` + `AiTalkStore`.
- One speech ingress: `PetService.say()`.
- One main conversation id per active pack: `control-center:{petPackId}:main`.

Out of scope for this convergence pass:

- Streaming UI.
- Multiple conversations per pet-pack.
- Plugin-authored dialogue writes into the main transcript by default.
- Theme/custom-position product customization.

### 3. Actions And Trigger Rules

Owner boundary: `ActionService`, `PetPackService`, Actions pane, Creator Studio bridge.

Current state:

- Manual trigger review card can apply `click` to `clickAction`.
- `manual` and `unbound` proposals are acknowledged without mutating bindings.
- `random`, `state`, and `event` proposals create active host-owned durable trigger rules with preview text.
- Actions review now asks the host for an application preview before accepting trigger proposals, and pending non-click inbox items show the host preview text before users apply them.
- `triggerProposalInbox` is part of the action config view state and host service contract.
- `triggerRules` is part of the action config view state, active pet-pack manifest, legacy animation config, and Control Center demo contract.
- `ActionService.submitTriggerProposal`, `acceptTriggerProposalItem`, and `rejectTriggerProposalItem` persist proposal status: pending, accepted, rejected, applied, or pending-host-rule.
- Trigger-rule persistence validates that every rule references an existing imported action and survives action regeneration.
- `random`, `state`, and `event` trigger proposals and saved host trigger rules carry a structured `ruleSpec` with scheduler/state/event intent, so Creator Studio handoff is aligned with future rule-editor and scheduler contracts without giving plugins direct rule mutation rights.
- Control Center Actions pane shows a trigger proposal inbox and can accept/reject queued proposals.
- Control Center Actions pane shows saved host trigger rules for non-click proposal types.
- Legacy action regeneration preserves the trigger proposal inbox and trigger rules.

P1 work:

- Keep Creator Studio-trigger proposal handoff aligned if future rule-editor fields expand beyond the current `ruleSpec` contract.

P2/P3:

- Rich runtime simulation showing actual scheduler timing, state predicates, and event matching.
- Conflict resolution between multiple rules.
- Cooldowns, priorities, and per-pet-pack trigger profiles.
- Import/export of trigger-rule presets.

### 4. Creator Studio Plugin

Owner boundary: `examples/plugins/creator-studio/`, `PluginService`, image-generation host bridge.

Current state:

- Deterministic task drafting exists through `conversation-wizard`.
- `GenerationTask` normalization supports `single-action` and `full-pet`.
- Question answer and task confirmation commands exist.
- `openpet-prompt-builder` compiles OpenPet-specific prompts.
- Host model bridge sends built prompts to host-owned image generation.
- Run persistence, logs, QA metadata, dashboard-first wizard preview, prompt provenance, workflow guidance, retry/recover, and approved action import paths exist.
- Approved action/pet dashboard runs now expose a sanitized `workflowGuidance.import.handoff` object with command id/title, Control Center location, run id, and the reason dashboard import remains blocked by command-scoped bridge tokens.
- Imported runs now also expose a sanitized `workflowGuidance.import.followUp` object so the dashboard can render the same next review route that already powers `nextStep`, `actionLane`, and imported result cards.
- Approved single-action imports submit generated trigger proposals to the host inbox with source plugin/command/run provenance after successful action frame import.
- Creator Studio review/recovery state is now outcome-specific across service and dashboard surfaces: blocked action-frame QA points to `Review and repair frames`, stale full-pet QA source mismatches point to `Retry generation`, imported action handoff failures point to `Review import handoff`, and successful imported action follow-up points to `Actions -> Trigger Proposal Inbox`.
- Imported action success follow-up now points reviewers to `Actions -> Trigger Proposal Inbox`, imported action handoff failures now point to `Control Center -> Plugins`, and imported pet follow-up stays in `OpenPet` for `Import Approved Pet`.
- Creator Studio review surfaces now expose a shared `reviewSummary` and top-level `reviewCheckpoint` for dashboard and service clients, so review owner, review status, next review action, host-owned location, and blocked reason stay consistent across ready-for-review, approved, imported, and handoff-failure states.
- Creator Studio review surfaces now also expose a top-level `reviewSnapshot` that packages the active phase, review gate, import status, next-action owner/location, dashboard/host-action flags, and trigger handoff status into one stable dashboard/service contract.

P1 work:

- Preserve the current command paths as automation/test entry points while continuing dashboard UX polish only when new review states add ambiguity.
- Keep generated trigger proposal submission compatible with future random/state/event trigger-rule schema and editor semantics.

P2/P3:

- Reference image upload and current-pet visual reference extraction.
- Partial regeneration for failed frame ranges.
- Batch full-pet generation from the same `GenerationTask`.
- Prompt profile presets.
- Generation history comparison.

Manual-required:

- Human review of generated pet/action quality before claiming production asset quality.

### 5. Plugin Host Bridge And Security

Owner boundary: `PluginService`, manifest/schema policy, bridge routes, plugin submission tooling.

Current state:

- Plugin commands/services are explicit, permission-gated, and logged.
- Creator-tools routes support bounded action, asset, pack metadata, pet-pack import, and model-generation flows.
- Bridge route docs and permission docs are now synchronized with the implemented surface through targeted route/permission regression coverage, including `trigger-proposals:write` for Creator Studio review handoff and `model:image-generate` for host-managed settings, health checks, and bounded image generation.
- Secrets stay in host services.
- Plugin-managed provider credentials are now explicitly documented as unsupported when an extension uses the host-managed generation surface.
- Creator Studio dashboard cannot use command-scoped host bridge routes directly; explicit command runs remain the only path that receives bridge URL/token credentials.

P1 work:

- Keep future bridge additions behind the same docs-and-tests lockstep instead of letting route/permission drift reappear.

P2/P3:

- Stronger runner isolation beyond current child process and Node permission model.
- Remote marketplace backend.
- Richer plugin storage lifecycle controls.

Manual-required:

- Human review for third-party plugin trust decisions.
- Real community-source package evidence before claiming ecosystem availability.

### 6. Release Evidence And Platform Readiness

Owner boundary: release scripts, evidence docs, GitHub Actions.

Current state:

- Evidence tooling exists for packaged runtime, picker, Windows smoke, macOS signing/notarization/Gatekeeper, release archive, and plugin cleanup.
- Packaged runtime smoke evidence is archived under `docs/release-evidence/packaged-runtime/2026-06-16T14-52-13-074Z-darwin-arm64/`; it proves an unsigned macOS packaged runtime launch, transparent rendering, built-in pack switching, and stable-state restoration, but still records `plugin-picker-evidence-linked` and `pet-picker-evidence-linked` as pending and `invalid-package-feedback` as blocked until a reviewed desktop picker smoke report is linked.
- Signed release closure evidence is archived under `docs/release-evidence/signed-release-closure/2026-06-16T15-00-00Z/`; `officialDesktopRelease`, `macos`, and `windows` all remain `not-ready`, with blockers including missing signed macOS evidence, missing desktop picker evidence, unsigned packaged runtime evidence, and missing signed Windows smoke evidence.
- Official desktop/macOS/Windows readiness claims remain conservative and must stay aligned with those archived `not-ready` facts until new reviewed evidence replaces them.

P1 work:

- Archive real signed macOS evidence from workflow artifacts.
- Archive real Windows signed installer/zip smoke evidence.
- Link packaged runtime smoke evidence with reviewed native picker evidence.
- Keep release wording aligned with evidence state.

Manual-required:

- Apple signing/notarization credentials and accepted notary output.
- Windows signed artifact execution on real Windows.
- Human review of release evidence archives.

### 7. Documentation Drift

Owner boundary: live docs under `docs/`, historical records under `docs/phases/`, `docs/reviews/`, and `docs/superpowers/`.

P1 work:

- Treat this document as the active TODO index.
- Keep `docs/README.md`, `docs/HANDOFF.md`, `docs/development-summary.md`, and `docs/project-status-review.md` short and current.
- A lightweight docs drift checker now exists at `npm run check:docs-drift` to guard known live-doc regressions such as stale `save-and-test` wording, older `codex/dev` branch metadata, and missing release-evidence archive index entries in `docs/README.md`.
- Do not rewrite historical phase/review docs unless they are linked as live planning inputs.
- When a feature lands, move it from "TODO" to "Current landed facts" here instead of letting multiple stale TODO lists diverge.

P2/P3:

- Expand the docs drift checker beyond current live-doc stale phrases and release-evidence indexing into broader historical-doc linting only if it stays low-noise.

## Recommended Next Milestone Options

Choose one of these when starting the next development milestone:

1. Creator Studio Review Surface Polish
   - User value: provider-backed action and full-pet runs stay easy to inspect, retry, and import as review states continue to grow.
   - Main files: `examples/plugins/creator-studio/service/studio-service.js`, dashboard review surfaces, Creator Studio regression tests.

2. Release Evidence Closure
   - User value: release readiness claims can be upgraded only when real evidence exists.
   - Main files: release scripts/docs. This is mostly Manual-required.

3. AI Provider Verification Closure
   - User value: provider preset wording stays aligned with real verified gateway behavior instead of drifting into guessed compatibility claims.
   - Main files: AI provider docs, smoke evidence reports, and AI pane copy only when backed by verified behavior.

## Verification Commands For Future Milestones

Use the narrowest useful set for the touched boundary:

```bash
npm run test:core
npm run test:core:all
npm run test:control-center
npm run check:syntax
node --test tests/services/ai-talk-service.test.js tests/services/ai-talk-store.test.js
node --test tests/services/action-service.test.js tests/main/pet-chat-ipc.test.js tests/main/pet-chat-window.test.js
node --test tests/examples/creator-studio-plugin.test.js tests/services/plugin-service.test.js tests/services/image-generation-model-service.test.js
```
