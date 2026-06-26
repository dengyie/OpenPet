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

Current P0 status: no known startup/build blocker in this TODO pass. The highest-risk current gap is the half-wired trigger proposal inbox surface, but it is not yet the primary UI path.

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
- AI Talk core exists: `AiTalkService`, `AiTalkStore`, pet-pack `persona`, local persona override, generated persona draft, pet-pack isolated main conversations, background memory extraction, memory profile UI, delete memory, and clear current pet-pack memories.
- Desktop chat window exists and routes through the same pet chat state/AI Talk flow instead of introducing a separate product brain.
- Bubble chat now has a transparent mini-dialogue implementation path in the current branch, but `main` still reflects a transitional dual-surface model where the lightweight bubble and full desktop chat coexist as separate primary entry points.
- Creator Studio already has `GenerationTask`, deterministic `conversation-wizard`, task answer/confirm commands, `openpet-prompt-builder`, host model bridge, run persistence, QA artifacts, dashboard display, and action import command paths.
- Action trigger review exists for the manually selected action path: `click` can update `clickAction`; `manual` and `unbound` are acknowledged; `random`, `state`, and `event` remain pending host-rule work.
- Trigger proposal inbox now has a host-owned service/API/UI closed loop: proposals can be submitted, persisted, accepted, rejected, preserved through action regeneration, and reviewed from the Actions pane.

## P1 Architecture TODOs

### 1. AI Provider And Model Settings

Owner boundary: `AiService`, `ImageGenerationModelService`, Control Center AI pane.

Current state:

- Chat Provider save and test are separated and provide section-local feedback.
- Image Provider can be saved independently and health-checked through host services.
- Provider diagnostics are structured and sanitized.

P1 work:

- Split dense AI settings into clearer model-settings sections if the current AI pane becomes hard to operate.
- Add provider presets/catalog entries for common OpenAI-compatible chat and image endpoints.
- Add optional `/models` discovery where providers support it, with safe fallback wording when probing is unavailable.
- Add provider compatibility hints, especially for image models that do or do not support transparent-background payload parameters.
- Add user-visible generation usage/cost summaries when the provider response exposes safe metadata.

P2/P3:

- Connection test history with last success/failure timestamps.
- Multiple named provider profiles.
- Provider failover/routing.

Manual-required:

- Real cloud/local provider smoke evidence for each supported provider preset.
- Confirmation of exact image model names against the user's target gateway, because OpenAI-compatible gateways may alias names differently.

### 2. AI Talk And Pet Chat

Owner boundary: `AiTalkService`, `AiTalkStore`, `PetChatWindowManager`, Control Center AI pane.

Current state:

- Each pet-pack has an isolated `control-center:{petPackId}:main` conversation.
- Persona is layered as pet-pack default plus local override, then compiled into system prompt.
- Memory is automatically extracted in the background and injected as dynamic context without blocking the main reply.
- Memory profile UI can show global and pet-pack memories, delete one memory, and clear current pet-pack relationship memories.
- Desktop chat is connected to the same chat state rather than a separate AI implementation.
- The lightweight pet bubble chat is the right product direction for default interaction, but `main` still needs an explicit convergence pass so the transparent bubble becomes the default entry while the desktop chat becomes an extended view instead of a second primary chat surface.

P1 work:

- Converge chat surfaces into one primary flow:
  - `BubbleChatWindow` becomes the default user-facing chat entry anchored around the pet.
  - `PetChatWindow` stays as an extended desktop panel for longer history and advanced interaction, not a competing default entry.
  - Double-click on the pet should open the same bubble chat surface by default.
- Route all lightweight pet speech through one visible surface.
  - Keep `PetService.say()` as the single runtime speech entry.
  - Keep old inline `#bubble` hidden as a compatibility node only; it must not reappear as a second visible chat box.
  - Continue classifying AI main replies as `dialogue` and plugin/http/mcp/renderer/event speech as `notice`.
- Keep one shared conversation brain across all chat entry points.
  - Bubble chat, desktop chat, and Control Center AI must keep using `control-center:{petPackId}:main`.
  - Bubble chat should render a clipped recent dialogue stream plus lightweight notices instead of owning a second transcript.
- Add relevant memory scoring before injection. Score by current user message, recent history, tags, scope, importance, confidence, recency, and use count.
- Mark injected memories as used by updating `lastUsedAt` and `useCount`.
- Upgrade the action tool schema with `reason`, `displayMode`, and a current-pet action candidate whitelist.
- Add reply bubble segmentation while keeping the full assistant reply in transcript.
- Add explicit active pet-pack refresh signals so AI pane and desktop chat reload persona, history, memory profile, and chat state when the active pack changes.
- Add redacted AI Talk trace export that links provider, conversation, memory, and behavior decisions without exposing full prompts, API keys, or raw memory text.
- Add conservative legacy migration from old `settings.ai.conversations.control-center` into `ai-talk-store.json` only when the new store has no messages.

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
- `random`, `state`, and `event` proposals return pending-host-rule semantics.
- `triggerProposalInbox` is part of the action config view state and host service contract.
- `ActionService.submitTriggerProposal`, `acceptTriggerProposalItem`, and `rejectTriggerProposalItem` persist proposal status: pending, accepted, rejected, applied, or pending-host-rule.
- Control Center Actions pane shows a trigger proposal inbox and can accept/reject queued proposals.
- Legacy action regeneration preserves the trigger proposal inbox.

P1 work:

- Define durable trigger-rule schema for `random`, `state`, and `event`.
- Add validation that every trigger rule references an existing imported action.
- Add simulation/preview before applying non-click triggers.
- Connect Creator Studio imports to submit generated trigger proposals into the host inbox instead of only showing them in the plugin dashboard.

P2/P3:

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
- Run persistence, logs, QA metadata, dashboard preview, and approved action import paths exist.

P1 work:

- Turn the existing command-level task flow into a smoother dashboard-first wizard with visible prompt, task preview, pending question, confirmation, generation, QA, and import states.
- Preserve the current command paths as automation/test entry points while improving user-facing dashboard affordances.
- Add explicit retry/recover flows for failed cloud/local generation without silently falling back to fixture.
- Surface prompt-builder provenance in the dashboard, including sanitized final prompt preview for developer mode.
- Connect generated trigger proposals to the host trigger proposal inbox after the inbox service/UI is complete.
- Add realistic smoke guidance for configured host image Provider generation.

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
- Secrets stay in host services.

P1 work:

- Keep bridge route docs synchronized with actual route coverage and permission names.
- Add targeted tests whenever a new route is added to prevent IPC/bridge drift.
- Ensure Creator Studio dashboard cannot bypass command-scoped bridge tokens for privileged actions.
- Document plugin-managed provider credentials as unsupported unless a future explicit trust model is designed.

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

1. Trigger Proposal Inbox Closure
   - User value: Creator Studio and future plugins can submit action trigger proposals into a real host review queue.
   - Main files: `ActionService`, `ipc.js`, Actions pane, shared contracts, action tests, Control Center smoke.

2. AI Talk Relevance And Bubble UX
   - User value: pet conversations feel more contextual and more pet-like without changing provider setup.
   - Main files: `AiTalkService`, `AiTalkStore`, AI pane, pet chat renderer, service tests.

3. Creator Studio Dashboard Wizard Polish
   - User value: users can drive custom action generation from dashboard instead of running individual commands.
   - Main files: Creator Studio service/dashboard/commands, plugin tests, host bridge tests.

4. Model Settings Product Polish
   - User value: provider setup is clearer for local and hosted image/chat gateways.
   - Main files: AI pane, `ImageGenerationModelService`, `AiService`, Control Center smoke tests.

5. Release Evidence Closure
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
