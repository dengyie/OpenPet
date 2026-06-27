# OpenPet Current TODO Architecture

> Date: 2026-06-24
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
- Control Center AI settings now include chat/image provider presets, an explicit OpenPet `127.0.0.1:8317/v1` gateway preset for `gpt-5.5` chat and `gpt-image-2` image generation, optional `/models` discovery with safe fallback wording, chat/image model compatibility hints, safe image generation usage/cost summaries when provider metadata is available, and a model-settings-first AI pane where `聊天 Provider` / `图片 Provider` open by default while secondary memory/persona/behavior/chat sections stay collapsed until expanded.
- AI Provider smoke evidence now has a repeatable CLI entry point: `npm run smoke:ai-provider -- --base-url <url> --api-key-env <env> --chat-model <model> [--include-image] --image-model <model> --output <report.json>`. It probes `/models`, tests chat completions, keeps image generation opt-in, and writes a sanitized report without raw API keys.
- AI Talk core exists: `AiTalkService`, `AiTalkStore`, pet-pack `persona`, local persona override, generated persona draft, pet-pack isolated main conversations, conservative legacy `settings.ai.conversations.control-center` migration, active pet-pack refresh signals for AI pane and desktop chat, redacted trace diagnostics export with pet-pack and conversation filters, background memory extraction, relevance-ranked memory injection with use tracking, compact bubble segmentation, current-pet action candidate tool hints, provider behavior `reason` / `displayMode` preservation through behavior decisions, memory profile UI, delete memory, and clear current pet-pack memories.
- Desktop chat window exists and routes through the same pet chat state/AI Talk flow instead of introducing a separate product brain.
- Creator Studio already has `GenerationTask`, deterministic `conversation-wizard`, task answer/confirm commands, `openpet-prompt-builder`, host model bridge, run persistence, QA artifacts, dashboard-first wizard display, prompt snapshot, wizard-step rail, retry/recover for failed provider runs, sanitized developer-mode prompt provenance, workflow smoke guidance, and structured approved action/pet import command handoff that tells the dashboard which Control Center plugin command to run while preserving command-scoped bridge-token boundaries.
- Creator Studio fixture single-action runs now produce reviewable action-frame artifacts, contact-sheet QA, repairable frame previews, and an `Import Approved Action` dashboard handoff, so the dashboard can validate the action-specific review/import path without a live provider.
- Creator Studio dashboard browser regressions now cover both single-action and full-pet fixture flows through draft/confirm/generate/review/approve to the correct host-owned import handoff, including mode-correct generation status copy and the `Import Approved Pet` full-pet review path.
- Creator Studio provider-backed full-pet runs now package a real generated atlas instead of a placeholder sprite, write source-image and atlas QA artifacts, and gate `Import Approved Pet` on passing QA before the host import bridge runs.
- Action trigger review exists for the manually selected action path: `click` can update `clickAction`; `manual` and `unbound` are acknowledged; `random`, `state`, and `event` create host-owned durable trigger rules.
- Trigger proposal inbox now has a host-owned service/API/UI closed loop: proposals can be submitted, persisted, accepted, rejected, preserved through action regeneration, and reviewed from the Actions pane.
- Creator Studio approved single-action imports now submit their generated `triggerProposal` into the host-owned trigger proposal inbox through the narrow `trigger-proposals:write` creator-tools bridge permission after action frames are imported; the plugin still does not directly apply trigger rules.
- Creator Studio imported follow-up routing is now outcome-specific: imported action success routes the next review step to `Actions -> Trigger Proposal Inbox`, imported action handoff failures route follow-up to `Control Center -> Plugins`, and imported pet follow-up remains `OpenPet` through `Import Approved Pet`.
- Creator Studio dashboard service only exposes local task/run/review routes, returns explicit JSON `404` for unknown `/api/*` paths, and cannot invoke command-scoped host bridge routes outside explicit command runs.
- Creator Studio generation remains host-owned at the provider boundary; plugin-managed provider credentials are unsupported in the current trust model.

## P1 Architecture TODOs

### 1. AI Provider And Model Settings

Owner boundary: `AiService`, `ImageGenerationModelService`, Control Center AI pane.

Current state:

- Chat Provider save and test are separated and provide section-local feedback.
- Image Provider can be saved independently and health-checked through host services.
- Provider diagnostics are structured and sanitized.
- Chat provider presets now cover OpenAI official, LM Studio, vLLM, OpenRouter, Together, generic local or proxied OpenAI-compatible gateways, and the OpenPet `127.0.0.1:8317/v1` development gateway; image provider presets cover OpenAI official, Together, OpenRouter, generic local or proxied OpenAI-compatible gateways, and the OpenPet `127.0.0.1:8317/v1` development gateway.
- Chat/image provider health checks now perform optional `/models` discovery with safe fallback wording when probing is unavailable.
- Chat/image model compatibility hints are visible in the AI pane, now keyed by provider family plus model where possible; image generation usage/cost summaries surface when safe provider metadata is returned, and the AI pane foregrounds the chat/image Provider sections before collapsed memory/persona/behavior/chat sections while explicitly restating the host-owned trust and save/test boundaries.
- `scripts/run-ai-provider-smoke.js` and `npm run smoke:ai-provider` provide a sanitized real-gateway smoke path for confirming chat model names, image model names, optional `/models` discovery, and opt-in image generation without exposing API keys in the output report.

P1 work:

- Keep the curated provider preset list small and verified instead of turning the AI pane into a large dynamic catalog.
- Keep provider compatibility copy aligned with real verified gateway behavior, especially for transparent-background support details and provider-specific routing caveats.

P2/P3:

- Connection test history with last success/failure timestamps.
- Multiple named provider profiles.
- Provider failover/routing.

Manual-required:

- Real cloud/local provider smoke evidence for each supported provider preset.
- Confirmation of exact image model names against the user's target gateway, because OpenAI-compatible gateways may alias names differently. Use `npm run smoke:ai-provider` as the evidence entry point, but do not treat a generated report as production asset-quality proof without human review.

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

P1 work:

- No current P1 gap is frozen at this boundary beyond keeping future trace UX aligned if new trace volume or streaming surfaces land.

P2/P3:

- Streaming replies and cancel generation.
- Multiple conversations per pet-pack.
- LLM history summarization.
- Embedding/vector memory retrieval.
- AI Talk plugin extension points.
- Advanced memory privacy controls and manual memory approval mode.

Manual-required:

- Real provider latency and streaming behavior checks once streaming is introduced.

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
- Control Center Actions pane shows a trigger proposal inbox and can accept/reject queued proposals.
- Control Center Actions pane shows saved host trigger rules for non-click proposal types.
- Legacy action regeneration preserves the trigger proposal inbox and trigger rules.

P1 work:

- Keep Creator Studio-trigger proposal handoff aligned with future trigger-rule editor and scheduler semantics.

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
- Approved single-action imports submit generated trigger proposals to the host inbox with source plugin/command/run provenance after successful action frame import.
- Imported action success follow-up now points reviewers to `Actions -> Trigger Proposal Inbox`, imported action handoff failures now point to `Control Center -> Plugins`, and imported pet follow-up stays in `OpenPet` for `Import Approved Pet`.

P1 work:

- Preserve the current command paths as automation/test entry points while continuing dashboard UX polish beyond the import handoff card.
- Keep generated trigger proposal submission compatible with future random/state/event trigger-rule schema and editor semantics.

P2/P3:

- Reference image upload and current-pet visual reference extraction.
- Partial regeneration for failed frame ranges.
- Batch full-pet generation from the same `GenerationTask`.
- Prompt profile presets.
- Generation history comparison.

Manual-required:

- Real image model generation checks using the configured gateway and selected model.
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
- Official desktop/macOS/Windows readiness claims remain conservative.

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
- Do not rewrite historical phase/review docs unless they are linked as live planning inputs.
- When a feature lands, move it from "TODO" to "Current landed facts" here instead of letting multiple stale TODO lists diverge.

P2/P3:

- Generate a lightweight docs drift checker for known stale phrases such as `save-and-test`, obsolete `cloud/local` wording, or completed "missing UI" claims.

## Recommended Next Milestone Options

Choose one of these when starting the next development milestone:

1. Creator Studio Review And Recovery Polish
   - User value: provider-backed action and full-pet runs stay easy to inspect, retry, and import without leaving ambiguous QA state.
   - Main files: `examples/plugins/creator-studio/service/studio-service.js`, dashboard review surfaces, Creator Studio regression tests.

2. Model Settings Product Polish
   - User value: provider setup is clearer for local and hosted image/chat gateways.
   - Main files: AI pane, `ImageGenerationModelService`, `AiService`, Control Center smoke tests.

3. AI Talk Trace Filtering Polish
   - User value: developers can export narrower pet-pack or conversation trace slices after the broad redacted trace export.
   - Main files: `AiTalkService`, `AiTalkStore`, AI pane, trace export tests.

4. Release Evidence Closure
   - User value: release readiness claims can be upgraded only when real evidence exists.
   - Main files: release scripts/docs. This is mostly Manual-required.

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
