# OpenPet Current TODO Architecture

> Date: 2026-06-26
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

Current P0 status: no known startup/build blocker in this TODO pass. The highest-risk current gaps are release evidence closure and remaining trigger-rule host schema work, not the trigger proposal inbox surface itself.

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
| Plugin host | `src/main/services/plugin-service.js`, `src/main/services/plugin-install-service.js`, `src/main/plugins/`, `docs/plugin-service-architecture-checkpoint.md` | manifest policy, command/service bridge, creator-tools routes, orchestrator boundary | permission-gated, token-gated, no unrestricted plugin access |
| Creator Studio plugin | `examples/plugins/creator-studio/` | prompt/task workflow, run state, QA, preview, import requests | provider secrets, final imports, and trigger persistence stay host-owned |
| Contracts/tests | `src/shared/openpet-contracts.ts`, `src/shared/ipc-channels.*`, `tests/` | IPC/view contracts and regression boundaries | keep JS and TS channel files synchronized |

## Current Landed Facts

- Chat provider UX has separate `保存聊天 Provider` and `测试已保存配置` actions. Saving does not require a successful test, and testing uses the active saved config.
- Image generation settings use a host-owned OpenAI-compatible image Provider contract in Control Center. Legacy `fixture` / `cloud` / `local` vocabulary may still appear in Creator Studio run backends, but secrets and provider calls remain host-owned.
- Chat and image provider checks now surface discovered `/models` results back to the AI pane as suggested model lists, while preserving safe fallback wording when probing is unavailable.
- Creator Studio dashboard now surfaces sanitized generation usage summaries when host image generation returns safe metadata such as estimated cost.
- AI Talk core exists: `AiTalkService`, `AiTalkStore`, pet-pack `persona`, local persona override, generated persona draft, pet-pack isolated main conversations, background memory extraction, relevance-ranked memory injection, injected-memory usage tracking, memory profile UI, delete memory, and clear current pet-pack memories.
- AI Talk segmented bubble playback now preserves visible reply order: the first segment shows immediately, later segments are scheduled by bubble TTL, and the full assistant reply still stays in transcript/history.
- AI Talk main-conversation reads no longer rewrite or persist unchanged timestamps when the default conversation already exists.
- Desktop chat window exists and routes through the same pet chat state/AI Talk flow instead of introducing a separate product brain.
- Active pet-pack changes now emit explicit refresh signals so the AI pane reloads persona, memory profile, and chat state without requiring a tab switch or window reopen.
- Creator Studio already has `GenerationTask`, deterministic `conversation-wizard`, task answer/confirm commands, `openpet-prompt-builder`, host model bridge, run persistence, QA artifacts, dashboard display, approved action import paths, dashboard-visible prompt provenance with a sanitized final prompt preview, sanitized generation usage summaries, explicit backend recovery guidance for failed generation runs, dashboard-visible provider smoke guidance for non-fixture host image runs, a dashboard-visible workflow status summary with current stage plus next-step guidance, and full-pet/action import flows that can submit generated trigger proposals into the host inbox.
- Action trigger review exists for the manually selected action path: `click` can update `clickAction`; `manual` and `unbound` are acknowledged; `random`, `state`, and `event` remain pending host-rule work.
- Trigger proposal inbox now has a host-owned service/API/UI closed loop: proposals can be submitted, persisted, accepted, rejected, preserved through action regeneration, and reviewed from the Actions pane.
- `PluginService` high-risk subdomains are now split into focused controllers for resolution, config/storage, runtime SDK, creator bridge handlers, asset/path safety, listing/projection, policy/signature gating, dashboard open, and management writes. The remaining `PluginService` code is intentionally kept as orchestration; see `docs/plugin-service-architecture-checkpoint.md`.
- Declaration-only plugin setup and command processes now finalize on child `close`, not early `exit`, so trailing stdout/stderr is still captured before the host resolves success or failure.

## P1 Architecture TODOs

### 1. AI Provider And Model Settings

Owner boundary: `AiService`, `ImageGenerationModelService`, Control Center AI pane.

Current state:

- Chat Provider save and test are separated and provide section-local feedback.
- Image Provider can be saved independently and health-checked through host services.
- Provider diagnostics are structured and sanitized.

P1 work:

- Split dense AI settings into clearer model-settings sections if the current AI pane becomes hard to operate.
- Add provider presets/catalog entries for common OpenAI-compatible chat and image endpoints. Completed in current branch: the AI pane now exposes shared chat and image provider preset catalogs for official OpenAI, local/proxy OpenAI-compatible endpoints, and a generic gateway image template, without auto-saving or overwriting stored API keys.
- Add optional `/models` discovery where providers support it, with safe fallback wording when probing is unavailable. Completed in current branch: chat and image provider host checks now return discovered model lists when probing succeeds, the AI pane surfaces them as suggested model options, and unavailable probes still use the existing safe fallback wording.
- Add provider compatibility hints, especially for image models that do or do not support transparent-background payload parameters. Completed in current branch: the AI pane now distinguishes `gpt-image-2` host-default behavior, `dall-e*` transparent-parameter limitations, FLUX/SDXL gateway alpha-cutout caveats, and generic OpenAI-compatible transparent-background requests.
- Add user-visible generation usage/cost summaries when the provider response exposes safe metadata. Completed in current branch: Creator Studio dashboard/service detail now surfaces sanitized generation usage summaries from host-owned image generation metadata when estimated cost is available.

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

P1 work:

- Upgrade the action tool schema with `reason`, `displayMode`, and a current-pet action candidate whitelist. Completed in current branch: `AiService` now exposes and parses the upgraded `openpet_behavior` fields, `AiTalkService` injects current pet-pack action candidates only when behavior tools are enabled, and host-side validation remains authoritative through existing behavior orchestrator checks.
- Add reply bubble segmentation while keeping the full assistant reply in transcript. Completed in current branch: `AiTalkService` now returns `bubbleSegments`, IPC shows the first bubble segment immediately, schedules later segments by TTL so visible speech does not collapse to the last segment, preserves the full assistant reply in transcript/history, and covers the sequencing behavior with core regressions.
- Add redacted AI Talk trace export that links provider, conversation, memory, and behavior decisions without exposing full prompts, API keys, or raw memory text. Completed in current branch: `AiTalkStore` now persists redacted chat traces, `AiTalkService` exports them, and `ipc.js` backfills host behavior decisions onto the trace after orchestration.
- Add conservative legacy migration from old `settings.ai.conversations.control-center` into `ai-talk-store.json` only when the new store has no messages. Completed in current branch: bootstrap now injects legacy conversation candidates into `AiTalkStore`, migration only runs when the new store has no messages, and `main.js` records `ai-talk.migration.legacy-conversations` when migration occurs.

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
- `random`, `state`, and `event` proposals return pending-host-rule semantics.
- `triggerProposalInbox` is part of the action config view state and host service contract.
- `ActionService.submitTriggerProposal`, `acceptTriggerProposalItem`, and `rejectTriggerProposalItem` persist proposal status: pending, accepted, rejected, applied, or pending-host-rule.
- Control Center Actions pane shows a trigger proposal inbox and can accept/reject queued proposals.
- Legacy action regeneration preserves the trigger proposal inbox.
- Durable trigger-rule persistence now exists for `random`, `state`, and `event`, with validation against missing host actions and preview-before-apply semantics for host-managed rules.
- The host action contract and Actions pane already surface saved trigger rules, including enable/disable and deletion flows.

P1 work:

- Keep bridge route docs synchronized with actual route coverage and permission names. Completed in current branch: plugin bridge runtime now exports both route inventory and the derived permission-name inventory from one source, bridge docs now publish the exact current route and permission sets, and dedicated doc drift tests fail when runtime coverage changes without a matching docs update.
- Ensure Creator Studio dashboard cannot bypass command-scoped bridge tokens for privileged actions. Completed in current branch: declaration-only command runs still receive the short-lived bridge URL/token, service launch paths remain free of bridge secrets, and Creator Studio dashboard detail/log responses plus dashboard handoff copy now make the host-command boundary explicit instead of exposing privileged bridge access.
- Document plugin-managed provider credentials as unsupported unless a future explicit trust model is designed. Completed in current branch: extension docs and submission guidance now state that ordinary extensions must not receive OpenPet-managed chat/image provider credentials, and any third-party provider secrets remain extension-owned unless a future explicit trust model is introduced.

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

- Turn the existing command-level task flow into a smoother dashboard-first wizard with visible prompt, task preview, pending question, confirmation, generation, QA, and import states. Partially completed in current branch: the dashboard now surfaces a host-owned workflow status summary with current stage, next-step guidance, prompt/question/review/import panels, and mode-aware `single-action` vs `full-pet` task/review/import copy so the same UI can guide both flows without action-only wording.
- Preserve the current command paths as automation/test entry points while improving user-facing dashboard affordances.
- Add explicit retry/recover flows for failed cloud/local generation without silently falling back to fixture. Completed in current branch: failed generation runs now expose backend recovery guidance in the dashboard and service detail view, while keeping retry on the existing generation command path instead of silently falling back to fixture.
- Connect generated trigger proposals directly into the existing host trigger proposal inbox from successful generation/import flows. Completed in current branch: approved single-action and task-driven full-pet imports now submit generated trigger proposals through the existing host inbox bridge, and Codex pet manifests preserve host-owned trigger proposal/rule fields after import.
- Add realistic smoke guidance for configured host image Provider generation. Completed in current branch: Creator Studio run detail and dashboard now expose provider smoke guidance for non-fixture runs, including Control Center AI-pane validation steps, expected evidence, and transparent-output compatibility notes for configured or not-yet-configured host image providers.

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

- Add targeted tests whenever a new route is added to prevent IPC/bridge drift. Completed in current branch: route inventory tests now assert the exact bridge permission set and dedicated doc inventory tests verify that both extension ecosystem docs list every current route and permission name from the runtime inventory.

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
