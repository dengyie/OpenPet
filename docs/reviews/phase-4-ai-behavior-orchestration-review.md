# Production Code Quality Review：Phase 4 AI 行为编排 v2

> Review date：2026-06-12  
> Scope：`AiService` tool-call intent parsing、`BehaviorOrchestratorService`、AI behavior IPC/preload、Control Center AI Behavior UI、settings migration、tests/docs。

## 1. Findings

No blocking findings after fixes.

## 2. Issues Found And Fixed During Review

- Main AI config save could persist stale `config.behavior` from the React state and overwrite behavior settings saved through the Behavior panel. Fixed by omitting `behavior` from the general AI save path; Behavior has its own save path.
- Dry-run originally evaluated only persisted rules, so users could not test rules currently being edited in the JSON field. Fixed by sending the edited behavior payload to `dryRun()` without persisting it.
- A matching high-priority rule with an unavailable `actionId` originally stopped evaluation, preventing lower-priority valid rules or fallback from running. Fixed by skipping invalid action decisions while still never executing unlisted action ids.

## 3. Review Notes

- `AiService` now sends the `ibot_behavior` OpenAI-compatible tool definition only when behavior orchestration and provider tools are enabled.
- Provider `tool_calls` are parsed into `behaviorIntent` with `intent`, `actionId`, `confidence`, and `bubbleText`; empty assistant content can use `bubbleText` as the pet bubble reply.
- `BehaviorOrchestratorService` owns rules, cooldown, dry-run, action whitelist checks, fallback semantic matching, and bounded recent decisions.
- `ipc.js` still executes behavior exclusively through `PetService.say()`, `PetService.playAction()`, and `PetService.setEvent()`.
- Behavior disabled preserves the existing semantic action fallback path, so existing AI chat behavior remains compatible.
- Settings migration adds `settings.ai.behavior` while preserving existing conversations.
- Control Center AI page exposes behavior enablement, provider tools, cooldown, rules JSON, dry-run, and saved decision state without exposing API keys.

## 4. Residual Risk

- Rules are edited as JSON rather than a full rule-builder UI. This is operable and testable, but a richer editor would reduce user mistakes.
- Provider tool-call support depends on OpenAI-compatible providers honoring `tools`; unsupported providers still work through rules and fallback.
- There is no browser automation harness for the new AI Behavior UI; verification is currently service tests plus Vite build.

## 5. Verification

- `npm test` passed：141/141.
- `npm run check:syntax` passed.
- New tests cover behavior tool-call parse, rule priority, unavailable actionId rejection, invalid high-priority rule skip, cooldown, dry-run with unsaved config, semantic fallback, and conversation preservation.

## 6. Recommendation

Safe to merge with the residual follow-ups above.
