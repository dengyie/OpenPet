# AI Behavior Adapter Boundary Design

> Date: 2026-07-07
> Branch: `codex/dev7`
> Status: approved by standing continuation instruction, pending implementation
> Scope: Control Center AI Behavior IPC payload normalization only

## 1. Purpose

OpenPet has been migrating high-drift main-process payloads through `src/main/control-center-adapters.js` before they reach the Control Center renderer. AI config, image generation, plugin, catalog, action-frame, pet-pack, and several plugin runtime payloads already follow that pattern. The remaining AI Behavior IPC handlers still return raw `BehaviorOrchestratorService` objects directly.

This milestone adds a narrow adapter boundary for AI Behavior so renderer-facing payloads stay stable, typed, and free of service-only fields.

## 2. Current Problem

`src/main/ipc/register-ai-ipc.js` currently returns these raw service outputs:

- `AI_BEHAVIOR_GET`
- `AI_BEHAVIOR_SAVE`
- `AI_BEHAVIOR_DRY_RUN`
- `AI_BEHAVIOR_REPLAY_DECISION`
- `AI_BEHAVIOR_CLEAR_DECISIONS`

The service already normalizes most behavior data internally, but IPC should not depend on that implementation detail. Without an explicit Control Center adapter, future behavior fields can leak internal service-only data, raw replay payloads, or malformed values into the renderer.

`AI_BEHAVIOR_EXPORT_DIAGNOSTICS` stays as a JSON string download surface. It is already the deliberate diagnostics artifact and should not be converted into a view object in this slice.

## 3. Goals

- Add AI Behavior view adapters in `src/main/control-center-adapters.js`.
- Normalize AI behavior config, rules, decisions, dry-run results, replay results, and clear-decisions arrays.
- Strip internal/raw fields such as raw provider payloads, secret-like service fields, and ad hoc object properties.
- Preserve the existing Control Center API contract names in `src/shared/openpet-contracts.ts`.
- Wire `registerAiIpc` to use the injected adapters for AI Behavior handlers.
- Keep product behavior unchanged: no new UI, no behavior-rule semantics changes, no diagnostics format changes.

## 4. Non-Goals

- No changes to `BehaviorOrchestratorService` rule matching, cooldown, replay, or export semantics.
- No UI redesign in the AI pane.
- No changes to demo Control Center behavior except if tests reveal an existing mismatch.
- No broader TypeScript migration beyond the AI Behavior boundary.
- No new real-provider or packaged-app evidence.

## 5. Adapter Design

Add these functions:

- `createAiBehaviorConfigView(config)`
- `createAiBehaviorRuleView(rule, index)`
- `createAiBehaviorDecisionView(decision, index)`
- `createAiBehaviorResultView(result)`
- `createAiBehaviorDecisionListView(decisions)`

The config adapter returns:

- `enabled`: boolean
- `useTools`: boolean, default true unless explicitly false
- `cooldownMs`: non-negative integer
- `rules`: normalized array of `AiBehaviorRule`
- `decisions`: normalized array of `AiBehaviorDecision`

Rule normalization keeps only the renderer contract:

- `id`
- `enabled`
- `priority`
- `when.intent`
- `when.minConfidence`
- `when.contains`
- `when.actionKind`
- `then.type`
- `then.text`
- `then.actionId`
- `then.event`
- `then.message`

Decision normalization keeps only the renderer contract:

- scalar decision fields defined by `AiBehaviorDecision`
- `providerReason` and `displayMode` only when they are strings and valid for display
- `replay.reply` and `replay.behaviorIntent` normalized into bounded renderer-safe strings/numbers
- `replayRedacted` when present as a boolean

Result normalization keeps only the renderer contract:

- `matched`
- `reason`
- optional scalar result fields
- `replayOf` as a number when finite

The adapter does not redact diagnostics exports because that path already returns a prepared string from the service. The export path remains covered by existing service tests.

## 6. IPC Wiring

`registerAiIpc` accepts these injected adapter functions:

- `createAiBehaviorConfigView`
- `createAiBehaviorResultView`
- `createAiBehaviorDecisionListView`

Handlers use them as follows:

- `AI_BEHAVIOR_GET`: wraps `behaviorOrchestratorService.getConfig()`
- `AI_BEHAVIOR_SAVE`: wraps `behaviorOrchestratorService.saveConfig(payload)`
- `AI_BEHAVIOR_DRY_RUN`: wraps `behaviorOrchestratorService.dryRun(...)`
- `AI_BEHAVIOR_REPLAY_DECISION`: wraps `behaviorOrchestratorService.replayDecision(...)`
- `AI_BEHAVIOR_CLEAR_DECISIONS`: wraps `behaviorOrchestratorService.clearDecisions()`
- `AI_BEHAVIOR_EXPORT_DIAGNOSTICS`: unchanged

`src/main/ipc.js` imports and injects the new functions alongside the existing Control Center adapters.

## 7. Tests

Add adapter tests in `tests/main/control-center-adapters.test.js` that fail before implementation:

- config normalization removes service-only fields and stabilizes rules/decisions;
- dry-run/replay result normalization removes unknown fields and coerces optional fields;
- decision-list normalization returns only `AiBehaviorDecision[]` shapes.

Update `tests/main/ipc-registration-groups.test.js` so the fake injected adapters wrap behavior results. The test should prove the IPC registration layer calls adapters for get/save/dry-run/replay/clear and still passes actions into `dryRun`/`replayDecision`.

Verification commands:

```bash
node --test tests/main/control-center-adapters.test.js tests/main/ipc-registration-groups.test.js
npm run test:core
npm run typecheck -- --pretty false
```

## 8. Risks

- Over-normalizing can drop fields the current UI reads. Mitigation: match existing `AiBehaviorConfig`, `AiBehaviorDecision`, and `AiBehaviorResult` contracts exactly.
- Changing diagnostics export shape would break downloads. Mitigation: leave `AI_BEHAVIOR_EXPORT_DIAGNOSTICS` untouched.
- Service semantics could accidentally change if normalization is moved into the service. Mitigation: keep this slice in `control-center-adapters.js` and IPC wiring only.

## 9. Acceptance Criteria

- AI Behavior IPC handlers return adapter-normalized payloads.
- Existing UI-facing contract names remain unchanged.
- Unknown/internal fields from service outputs do not reach the renderer through AI Behavior IPC.
- Diagnostics export remains a string.
- Targeted tests pass.
- `npm run test:core` and `npm run typecheck -- --pretty false` pass.
