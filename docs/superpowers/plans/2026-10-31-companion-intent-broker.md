# Companion Intent Broker Implementation Plan

> **For agentic workers:** Execute this plan task by task with review checkpoints. Keep the `PetService` as the only public mutation boundary and preserve the Shell / Backend ownership described below.

**Goal:** Give OpenPet one host-owned policy layer for deciding which pet state, action, notice, or dialogue should be presented when AI, Agent Awareness, plugins, local APIs, and user interactions produce requests at the same time.

**Architecture:** Add a bounded in-memory Companion Intent Broker behind `PetService`. It classifies existing pet calls into independent presentation lanes, applies host-owned priority, deduplication, expiry, and multi-session attention rules, and emits accepted effects through the existing PetService event channels. Existing renderer windows remain presentation surfaces; the Backend remains the owner of HTTP, Jobs, SSE, settings/catalog/AI domains, and durable stores.

**Tech Stack:** Electron Shell JavaScript services, Node native test runner, TypeScript/Zod contracts where data crosses a typed boundary, existing React/Vite Control Center.

## Global Constraints

- Keep `PetService` as the single source of truth for pet state and action/event flows.
- Keep native window and presentation authority in the Shell; do not add a second Electron runtime.
- Do not bypass the existing PetService event channels or let plugins call Renderer windows directly.
- Do not trust caller-supplied priority, source identity, session focus, or policy overrides from ordinary plugins, local HTTP, MCP, or renderer payloads.
- Keep the initial Broker in memory. Do not persist raw intents, messages, prompt text, tool arguments, or session identifiers.
- Keep all new user-facing configuration operable through the Control Center.
- Keep `npm start` functional and do not modify the existing `cat_anime/` material structure.
- Preserve existing plugin permissions, API-key boundaries, Pet Pack safety checks, and Backend/Shell reverse-channel contracts.
- Do not turn Agent Awareness Phase C into committed product scope without its separate product approval.

---

## 1. Context And Source Review

### 1.1 Big Whale reference

The analysis used the repository state available on 2026-10-31. The upstream README identifies Big Whale `0.6.0-rc.4`, tested with DSH `0.2.1-rc.5`; its verification document records Windows as the exercised host and explicitly limits the evidence for other platforms and full native lifecycle behavior.

Relevant upstream files:

- [README](https://github.com/Aliciawque/dsh-big-whale/blob/main/README.md): product behaviors, local voices, controls, and fallback display.
- [state.mjs](https://raw.githubusercontent.com/Aliciawque/dsh-big-whale/main/lib/state.mjs): session status, event transitions, signal IDs, expiry, history, and bounded session state.
- [audio-coordinator.mjs](https://raw.githubusercontent.com/Aliciawque/dsh-big-whale/main/lib/audio-coordinator.mjs): single-speaker lease, duplicate event suppression, heartbeat, release, and bounded counters.
- [host.mjs](https://raw.githubusercontent.com/Aliciawque/dsh-big-whale/main/lib/host.mjs): host event subscription and same-origin asset/state routes.
- [desktop/main.cjs](https://raw.githubusercontent.com/Aliciawque/dsh-big-whale/main/desktop/main.cjs): isolated optional desktop window, navigation and permission restrictions, host-PID lifecycle, and bounded renderer status projection.
- [PRIVACY.md](https://github.com/Aliciawque/dsh-big-whale/blob/main/PRIVACY.md): local data and network claims.
- [VERIFICATION.md](https://github.com/Aliciawque/dsh-big-whale/blob/main/docs/VERIFICATION.md): exact-package and platform evidence boundaries.
- [MARKETPLACE.md](https://github.com/Aliciawque/dsh-big-whale/blob/main/MARKETPLACE.md): author index versus community listing and official endorsement.

The transferable ideas are explicit event semantics, per-session state, priority and expiry, shared audio ownership, local-first privacy, bounded diagnostics, and verification of the exact distributed package. The implementation is DSH-specific, uses one active session, and polls its own state route at 400 ms; those choices are not requirements for OpenPet, which already has Shell events, Backend SSE, and multi-session Agent Awareness data.

### 1.2 OpenPet baseline

The current system already provides most primitives, but policy is split across callers:

| Area | Current owner and behavior | Gap this plan addresses |
| --- | --- | --- |
| Pet mutation | `apps/desktop/src/services/pet-service.js` exposes `say`, `playAction`, and `setEvent`; each emits immediately to the in-process event bus. `say` records `requestId` and `sourceSurface`. | No common priority, expiry, dedupe, queue, or focus decision is made before dispatch. |
| Window delivery | `apps/desktop/src/ipc/index.js` forwards `onSay`, `onAction`, and `onEvent` to chat/window services. | The last event can replace or visually compete with another source's active presentation. |
| Agent Awareness | `examples/plugins/agent-awareness/service/state-mapper.js` suppresses routine speech and applies per-status/fingerprint cooldowns. `agent-awareness-service.js` sends its event and optional speech through the plugin bridge. | The notification policy is plugin-local and cannot arbitrate with AI, IM, or other plugins. |
| Agent session store | `examples/plugins/agent-awareness/service/session-store.js` already deduplicates event IDs and bounds retained data. | Durable session history exists, but the desktop pet does not yet have a host-owned attention selection policy. |
| AI behavior | `apps/desktop/src/services/behavior-orchestrator-service.js` evaluates AI reply rules, priority-sorts them, applies action cooldowns, and records bounded decisions. | It only handles AI reply behavior and does not arbitrate across runtime sources. |
| Action triggers | `apps/desktop/src/services/trigger-rule-runtime-service.js` handles random/state/event rules, cooldowns, and the winning rule. | It decides which trigger rule matches, not whether its action should interrupt a higher-priority presentation. |
| Pet Pack | `apps/desktop/src/pet/pet-pack/schema.js` validates actions, frame timing, persona, provenance, and trigger rules. | It has no explicit state-to-action/expression/voice presentation mapping. |
| Bubble Chat | `apps/desktop/src/ipc/pet-chat-facade.js` routes AI dialogue and non-AI transient speech into existing windows and history. | Dialogue and status notices need separate scheduling semantics so an urgent status does not erase a user-requested AI reply. |
| Backend notifications | `services/backend/events/hub.js` already has topic filtering, heartbeats, bounded queues, backpressure, and dropped-event reporting. | This is a separate data/event channel and should not be repurposed as the pet presentation scheduler. |
| Settings | `apps/desktop/src/services/settings.js` is the Shell settings authority; `packages/contracts/src/settings.ts` defines the Backend settings contract and trusted paths. | New preferences need defaults, validation, reverse-channel ownership, and Control Center UI together. |

Agent Awareness Phase C already calls for a host-owned presentation contract, explicit multi-session attention, richer state presentation, and Companion settings. This plan turns that direction into a staged implementation route without changing the current product approval status.

## 2. Goals And Non-Goals

### Goals

1. Keep all pet mutations behind `PetService`, while making admission and presentation policy consistent across sources.
2. Represent ongoing agent state separately from finite notices, dialogue, and actions.
3. Select the visible agent session with a deterministic policy instead of event arrival order.
4. Deduplicate repeated signals, expire stale transient intents, and bound all queues and diagnostics.
5. Preserve direct user interaction and AI conversation UX while allowing urgent approval/error state to take visual attention.
6. Make later Pet Pack state mappings and local voice playback consumable by the same presentation decision.
7. Keep decisions inspectable without recording sensitive content.

### Non-goals

- Replacing Backend SSE, Job delivery, or Agent Awareness ingestion with polling.
- Adding a new Electron process or moving native window authority into a plugin.
- Adding unrestricted plugin rendering, raw HTML, or direct renderer injection.
- Making real-time TTS a default feature.
- Changing the `cat_anime/` asset layout or automatically renaming action IDs.
- Adding independent per-session pet windows in the first implementation.
- Persisting transient intent queues across restart.
- Rewriting the AI behavior rule engine or trigger rule engine.
- Claiming Big Whale's Windows verification as evidence for OpenPet's platform support.

## 3. Product And Runtime Semantics

### 3.1 Independent presentation lanes

Do not place every effect in a single FIFO queue. A single queue would let a long AI response block an approval signal, or let a status change replace a message the user explicitly requested.

The Broker owns four bounded lanes:

| Lane | Typical inputs | Retention rule | Output owner |
| --- | --- | --- | --- |
| `attention` | Agent session status and progress | Latest accepted state per session; select one session for the shared pet surface | Pet state/action presentation |
| `notice` | Approval, error, completion, plugin status, HTTP event with a message | Priority queue; dedupe; expire by TTL; bounded to 32 pending entries initially | Existing Bubble Chat notice/transient path |
| `dialogue` | AI reply and user-requested chat output | Preserve `requestId` ordering and current chat persistence; never silently discard because of unrelated status | Existing Bubble Chat conversation path |
| `action` | Manual, AI-behavior, trigger-rule, and plugin action requests | One active finite action plus bounded pending requests; manual interaction wins; lower-priority actions may be replaced or suppressed with a reason | Existing `PET_ACTION` renderer event |

Lanes may update together. For example, Agent Awareness can update `attention` to `working` while an AI dialogue remains visible in `dialogue`. A higher-priority error may replace the active status action and enqueue a notice without deleting conversation history.

### 3.2 Priority policy

Priority is derived by Shell policy from validated source and semantic event type. A caller may supply an event ID or dedupe key, but ordinary plugins and renderer/HTTP/MCP requests cannot choose a priority or mark themselves urgent.

Initial semantic ordering:

| Semantic state / input | Attention priority | Notice behavior | Speech behavior in initial release |
| --- | --- | --- | --- |
| `idle` | none | none | none |
| `thinking`, routine `working`, progress ticks | ambient | coalesce; no per-tick notice | silent |
| `completed` / `success` | summary | one summary notice per transition | remains governed by current Agent Awareness policy; no new audio |
| `waiting` / approval requested | urgent | notice; repeat suppressed by event ID and cooldown | existing approved text behavior only |
| `blocked`, `failed`, `error` | urgent | notice; repeat suppressed by event ID and cooldown | existing approved text behavior only |
| `compacting` | important, bounded duration | coalesce by compaction ID; expire after completion or TTL | no new audio |
| user click/manual action | user-controlled | do not enqueue a notice unless explicitly requested | no new audio |
| user-requested AI reply | important dialogue | use existing conversation/request ordering | no new audio |
| ordinary plugin/HTTP/MCP message | normal notice | show through existing transient message path | no new audio |

Source does not override semantic severity: a plugin cannot mark arbitrary text urgent. A host-owned adapter may map a validated known event such as `agent:waiting` into an urgent state. Unknown event types remain ordinary events and cannot take over the attention lane.

### 3.3 Multi-session attention selection

Store one bounded current attention record per session, then choose a single record for the shared pet surface. Keep explicit user focus separate from the pet's visible winner.

The initial deterministic comparison tuple is:

```text
(semanticUrgency, explicitFocus, activeTurn, recency, stableSessionKey)
```

Higher values win for the first four fields; the final key is compared lexically to make ties repeatable. `semanticUrgency` ranks approval/waiting and failure above completion, then working/thinking, then idle. `explicitFocus` only breaks ties within the same urgency class, so focusing a session cannot hide an unresolved approval or error elsewhere. The chosen record expires to `idle` when its status TTL elapses or its source session becomes stale.

Rules:

- A late event from session A never overwrites session B's stored state.
- A same-session event with an older host-assigned sequence is ignored.
- Routine transitions update the state but do not create repeated notices.
- Focus is set through a host-owned command from the session selector/detail surface; arbitrary plugin payloads cannot change it.
- Subagent/background activity is tagged as background when the adapter can establish that fact; it may update details but does not take attention over a parent/user-focused session at equal urgency.
- Missing session identity maps to a bounded source bucket rather than a fabricated shared session.

### 3.4 Intent shape

This shape is an internal Shell model first. Promote fields to a Zod contract only when a typed IPC, HTTP, Backend reverse-channel, or durable boundary actually needs them.

```ts
type CompanionLane = "attention" | "notice" | "dialogue" | "action"
type CompanionPriority = "ambient" | "normal" | "summary" | "important" | "urgent"
type CompanionStatus = "idle" | "thinking" | "working" | "waiting" | "blocked" | "completed" | "failed" | "compacting"

type CompanionIntent = {
  id: string
  lane: CompanionLane
  source: string                 // Shell-normalized, bounded source identifier
  sourceSurface: string          // Existing diagnostic surface, bounded
  sessionKey?: string            // Already pseudonymized by the Agent Awareness adapter
  sourceSequence?: number        // Host assigned for in-process ordering
  status?: CompanionStatus
  priority: CompanionPriority    // Derived by host policy, never trusted from plugin input
  dedupeKey?: string             // Namespaced by normalized source and session
  createdAt: number
  expiresAt: number
  interruptible: boolean         // Derived from lane/source policy
  requestId?: string
  payload: Record<string, unknown>
}
```

Requirements:

- Normalize all strings and cap source/session/key lengths before retention.
- Clamp TTL by lane and event type; reject `NaN`, negative, and unbounded values.
- Store no raw prompt, tool arguments, shell command, provider response, API key, or full filesystem path in the intent or decision record.
- Keep user-visible text only in the existing presentation path; diagnostics store `textChars`, not text.
- Namespace caller-provided dedupe keys with the Shell-derived source and session key.
- Assign `id` and sequence in Shell. Reuse existing `requestId` when one is already the idempotency key.

### 3.5 Broker result and diagnostics

Submission returns a bounded decision object:

```ts
type CompanionDecision = {
  accepted: boolean
  intentId: string
  lane: CompanionLane
  outcome: "dispatched" | "queued" | "coalesced" | "suppressed" | "expired" | "invalid"
  reason: string
  selectedSessionKey?: string
  queueDepth: number
}
```

Keep the most recent 100 decisions in memory. Do not write a second durable decision log during the first milestone; use `appLogService` only for aggregate lifecycle events and content-free reasons. The future Control Center diagnostics view must show counts/latency/reason codes and must not expose message bodies or session IDs.

## 4. Ownership And Integration Boundaries

```text
Agent Awareness adapter ─┐
AI chat / AI behavior ───┤
Trigger rules ───────────┤
Plugins / local HTTP ────┼──> PetService API -> Companion Intent Broker
User IPC actions ────────┘                             │
                                                      ├── attention snapshot
                                                      ├── PET_EVENT -> existing event listeners
                                                      ├── PET_ACTION -> pet window
                                                      └── PET_SAY -> Bubble Chat / utterance history

Backend HTTP / Jobs / SSE remain data transport and state-domain owners.
Control Center sends commands to the Shell through existing IPC/reverse bridges.
```

The Broker must not import Electron, open windows, access plugin-private process data, call Backend HTTP, or bypass the existing safe PetService routes. Keep pure policy functions separate from service composition so they can be tested without Electron.

### Compatibility adapter

Keep the current public PetService methods:

- `say({ text, ttlMs, source, requestId, sourceSurface })`
- `playAction({ actionId, source })`
- `setEvent({ type, message, ttlMs, source })`

They normalize into intents internally and continue returning a compatible result. Add a host-only state submission method for Agent Awareness, for example `submitAttentionState({ sessionKey, status, eventId, occurredAt, sourceSequence, message })`. The plugin SDK must not expose `priority`, `interruptible`, focus mutation, or arbitrary presentation overrides.

The dispatcher inside `PetService` continues to emit the existing `PET_SAY`, `PET_ACTION`, and `PET_EVENT` bus events. The Broker does not call the public `PetService` methods recursively. Keep `trigger-rule-runtime-service.js` listening to the same events; evaluate trigger rules only for accepted/dispatchable events and retain its self-trigger guard.

## 5. Implementation Phases

### Phase 1: Broker core and backward-compatible PetService path

**Outcome:** Existing pet APIs flow through a pure policy service. Existing callers keep working while duplicate/stale transient events and action conflicts become explicit decisions.

**Files:**

- Create `apps/desktop/src/services/companion-intent-broker-service.js` for queues, attention state, policy, TTL, dedupe, and snapshots.
- Create `apps/desktop/src/services/companion-intent-policy.js` for pure normalization, priority derivation, event classification, and comparison functions.
- Modify `apps/desktop/src/services/pet-service.js` to normalize and submit calls, then dispatch accepted decisions through the existing event bus channels.
- Modify `apps/desktop/src/services/bootstrap/create-core-services.js` to construct/inject the Broker without creating a circular dependency.
- Modify `apps/desktop/src/ipc/index.js` only if the dispatch registration needs a new snapshot callback; retain current say/action/event forwarding.
- Create `tests/services/companion-intent-policy.test.js` and `tests/services/companion-intent-broker-service.test.js`.
- Extend `tests/services/pet-service.test.js` for compatibility, blocked, expired, and accepted paths.

**Interfaces:**

- Broker consumes normalized intent records and a dispatcher callback that emits existing PetService bus events.
- Broker produces `submit(intent)`, `setFocusedSession(sessionKey)`, `getSnapshot()`, and `dispose()`.
- PetService remains the only public writer and exposes `getCompanionSnapshot()` plus a host-only `submitAttentionState()` method.
- `submit()` returns the bounded `CompanionDecision` shape from Section 3.5.

**Required behaviors:**

- Preserve direct manual actions and user-requested AI dialogue by default.
- Dedupe only when a stable `requestId`/event ID/dedupe key exists; do not dedupe unrelated text solely because the text is equal.
- Expire transient notices before dispatch and report `expired` without showing them.
- Keep `attention`, `notice`, `dialogue`, and `action` independently bounded.
- On queue overflow, coalesce replaceable routine states first, then suppress the lowest-priority interruptible notice with an explicit reason; never drop a user-requested dialogue silently.
- Keep action fallback behavior (`idle` when requested action is unavailable) and include fallback in the decision reason.
- Keep all queue mutations synchronous in the Shell process; no new timer/poll loop is needed except one bounded expiry timer if the implementation cannot expire on submission/read.

**Verification for implementation:**

- Run: `node --test tests/services/companion-intent-policy.test.js tests/services/companion-intent-broker-service.test.js tests/services/pet-service.test.js`
- Expected: all focused tests pass; one `submit()` produces at most one effect per lane; duplicate IDs produce no duplicate effect; expired intent produces no window event.
- Run: `npm run check:syntax`
- Expected: exit code 0.

### Phase 2: Agent Awareness host adapter and multi-session attention

**Outcome:** Agent Awareness submits typed session-state intents to the host policy while retaining its existing durable event store, privacy filtering, dashboard, and low-noise evidence.

**Files:**

- Modify `examples/plugins/agent-awareness/service/state-mapper.js` to map normalized lifecycle states to semantic state/event data without being the final host-wide speech arbiter.
- Modify `examples/plugins/agent-awareness/service/agent-awareness-service.js` to submit a host-attention request through an approved bridge operation or Shell-owned plugin bridge callback.
- Modify `apps/desktop/src/services/plugin-service.js` only to establish a host-owned capability route and derive source identity from the installed plugin manifest.
- Modify `packages/contracts/src/bridge.ts` only if the chosen operation crosses the Backend/Shell reverse channel; define strict discriminated schemas and export from `packages/contracts/src/index.ts`.
- Modify `apps/desktop/src/shared/browser-contracts.ts` only if a new setting or snapshot crosses the browser-safe API.
- Extend `tests/examples/agent-awareness-plugin.test.js`, `tests/services/plugin-service.test.js`, and relevant bridge contract tests.

**Interfaces:**

- Host adapter accepts only `sessionKey`, a bounded known status, stable event ID, optional host sequence/time, and bounded sanitized display text.
- Session key must already be a pseudonymous stable key produced by Agent Awareness; raw session IDs remain in the plugin's existing protected processing boundary only.
- Unknown status values map to a normal event and cannot set urgent priority.
- Broker snapshot exposes only selected pseudonymous session key, semantic status, timestamps/TTL, queue sizes, and content-free reason codes.

**Attention tests must cover:**

- Two sessions arriving in interleaved order; a less-important new event cannot steal attention from an urgent waiting/error state.
- Newer same-session sequence replaces older state; older sequence is ignored.
- Equal priority prefers explicit focus, then active turn, then recency, with stable tie breaking.
- Stale session state returns to idle without deleting durable Agent Awareness history.
- Subagent/background state does not steal equal-priority attention from a focused parent session.
- Existing routine `thinking`/`working` visual-only policy and repeated urgent/completion suppression remain covered.

**Verification for implementation:**

- Run: `node --test tests/examples/agent-awareness-plugin.test.js tests/services/plugin-service.test.js tests/backend/plugin-runtime-server.test.js`
- Run: `npm run build:contracts` before contract checks in a fresh worktree.
- Run: `npm run check:api-contract`
- Expected: current contract/channel reconciliation remains clean; no raw session ID, prompt, or tool payload enters Broker diagnostics.

### Phase 3: Pet Pack semantic presentation contract

**Gate:** Start only after Phase 1 and Phase 2 desktop acceptance establish that host attention policy is useful and low-noise. This extends Pet Pack compatibility and generated asset metadata.

**Outcome:** Pet Packs explicitly map semantic statuses to action/expression and fallback behavior; status mapping no longer depends on matching words in `actionId`.

**Files to evaluate and likely modify:**

- `apps/desktop/src/pet/pet-pack/schema.js` for versioned `presentation` normalization and strict bounds.
- `apps/desktop/src/services/action-service.js` and active Pet Pack activation paths for resolving a status to available actions.
- Creator Studio manifest generation and validation paths under `examples/plugins/creator-studio/` and `apps/desktop/src/services/pet-pack-service.js`.
- `packages/contracts/src/` and browser contracts only for new typed Control Center snapshots or mutations.
- Pet Pack schema and Creator Studio tests under `tests/pet-pack/`, `tests/services/`, and `tests/examples/`.

**Proposed manifest field:**

```json
{
  "presentation": {
    "schemaVersion": 1,
    "states": {
      "thinking": { "actionId": "think", "expression": "focused" },
      "working": { "actionId": "work", "expression": "busy" },
      "waiting": { "actionId": "wait", "expression": "question" },
      "completed": { "actionId": "success", "expression": "happy" },
      "failed": { "actionId": "error", "expression": "concerned" }
    },
    "fallback": { "actionId": "idle", "expression": "normal" }
  }
}
```

Validation requirements:

- Every referenced action ID must exist in the same manifest.
- Unknown status and expression keys are rejected or ignored according to the explicit schema-version migration policy; never evaluate code from a Pet Pack.
- Missing mappings fall back to the manifest's default/idle action.
- Old Pet Packs without `presentation` remain valid without migration writes.
- Generated asset quality, attribution, license, and source claims remain separate from whether an action mapping is structurally valid.

**Acceptance:** All built-in and existing user packs load unchanged; action IDs resolve only from manifest declarations; unavailable mappings degrade visibly to fallback and produce a content-free diagnostic.

### Phase 4: Companion settings, local voice lease, and diagnostics UI

**Gate:** Keep audio out of the first two implementation phases. Begin only after the companion behavior and existing Bubble Chat noise have passed manual desktop review.

**Outcome:** Users control companion output in Control Center; optional local voice cannot double-play between the desktop pet and preview surfaces; bounded runtime decisions are inspectable.

**Files to evaluate and likely modify:**

- `apps/desktop/src/services/settings.js` for normalized `companion` defaults.
- `packages/contracts/src/settings.ts` and `apps/desktop/src/shared/browser-contracts.ts` for strict setting paths and DTOs.
- `apps/desktop/src/services/settings-sidecar-bridge.js` for settings ownership if Backend hydration or writes are involved.
- `apps/control-center/src/features/` for Companion settings and diagnostics view.
- `apps/desktop/src/windows/` and preload contracts only if the Shell-owned audio output requires a new narrow window bridge.
- `tests/services/`, contract tests, and `tests/control-center/control-center-smoke.spec.js`.

**Initial settings proposal:**

```js
companion: {
  enabled: true,
  focusedSessionKey: "",
  noticeCooldownMs: { completed: 120000, waiting: 120000, failed: 120000 },
  quietHours: { enabled: false, start: "22:00", end: "08:00" },
  voice: { enabled: false, language: "zh-CN", volume: 0.7 },
  idleMotion: { enabled: true, intensity: 0.8 }
}
```

This is a proposal, not a settled user preference contract. Review field names, locale choices, quiet-hour timezone behavior, and default values before adding persistent settings. Voice is disabled by default until bundled assets, license, accessibility, and desktop acceptance are reviewed.

**Audio lease requirements:**

- Host owns one lease across desktop and preview playback.
- Lease request includes `ownerId`, approved role/source, clip ID, bounded duration, and stable signal ID.
- A duplicate signal is denied; inactive/failed renderer releases its lease; missing heartbeat expires it.
- Renderer reports only playback state and clip ID, never arbitrary remote audio URLs.
- Audio assets are local Pet Pack/package resources with validated relative paths and license/provenance metadata.
- Autoplay, quiet hours, reduced-motion/accessibility settings, and explicit user stop all override ambient playback.

**Diagnostics view requirements:**

- Show selected semantic state, selected pseudonymous session label, last decision reason, queue depths, suppressed/expired counts, action fallback, resource failures, and current audio lease state.
- Do not show raw prompts, message text, tool arguments/results, full session IDs, API keys, plugin private data, or filesystem paths.
- Make diagnostics bounded and clearable; do not turn the runtime view into a second durable event archive.

## 6. Detailed Policy And Edge Cases

### 6.1 Queue behavior

- `attention`: map keyed by normalized `sessionKey`; maximum 40 sessions in memory, matching the existing Agent Awareness session bounds. Evict the oldest inactive non-selected session first.
- `notice`: maximum 32 queued; order by priority descending, then creation time ascending. Coalesce only stable semantic duplicates, not arbitrary equal text.
- `dialogue`: delegate durable ordering and message retention to current AI Talk/Bubble Chat services. Broker only guards duplicate dispatch by request ID and does not store transcript text.
- `action`: one active action and at most 16 pending action requests. Manual click/context-menu action outranks autonomous trigger/ambient action; repeated state-bound actions coalesce by session/status/action ID.
- Use one shared TTL normalizer; preserve existing minimum/maximum bubble TTL behavior in `pet-bubble-chat-window.js`.
- A dropped item always gets a content-free reason (`duplicate`, `expired`, `lower-priority`, `queue-capacity`, `stale-sequence`, or `policy-disabled`).

### 6.2 Interrupt policy

| Current presentation | Incoming presentation | Result |
| --- | --- | --- |
| Manual action or active user interaction | Any autonomous action | Do not interrupt; queue/coalesce by lane. |
| Ambient thinking/working action | Urgent waiting/error action | Interrupt ambient action; retain prior session state. |
| Summary/completion action | Urgent waiting/error action | Urgent action takes the action lane; completion notice may remain queued until TTL. |
| AI dialogue bubble | Urgent notice | Keep dialogue in history; show urgent notice in the notice slot without replacing conversation records. |
| Urgent notice | Lower-priority plugin notice | Keep urgent notice; queue lower priority until it expires or suppress on capacity. |
| Any presentation | Explicit user hide/mute/stop | Respect the explicit user action. |

### 6.3 Lifecycle

- On startup, Broker begins empty; it does not replay stale actions, speech, or notices from a previous process.
- On active Pet Pack change, re-resolve status/action mappings and fall back to idle where mappings are absent. Do not replay old notices.
- On app quit, stop expiry timers and discard transient queues.
- On Agent Awareness plugin stop/disable, clear its live in-memory attention slots and pending notices but retain its existing durable history according to the plugin's own retention rules.
- On settings update, apply new policy atomically through the existing settings service; new fields require strict normalization and Control Center support.

### 6.4 Failure behavior

- If Broker construction fails, application startup must fail clearly in development and use an explicit legacy passthrough only if a documented compatibility adapter is available; do not silently disable all pet output.
- If the Broker rejects one malformed intent, return a typed/reasoned rejection and keep the event loop and other sources alive.
- If a mapped action is unavailable, preserve the existing `idle` fallback and report `action-unavailable` in the decision.
- If diagnostics logging fails, pet presentation must continue.
- If the Control Center or Backend is unavailable, in-process pet behavior continues with normalized Shell settings.

## 7. Security And Privacy

- Priority and lane classification are server-owned. Plugin payloads cannot request `urgent`, set focus, override expiry, bypass cooldown, or interrupt a user interaction.
- Plugin source identity is assigned from the manifest in `plugin-service.js`; never trust a plugin-provided `source` string as authority.
- Maintain the existing plugin capability checks for `pet:say`, `pet:action`, and `pet:event`.
- Agent session keys are already pseudonymized before persistence/display; do not introduce raw session IDs into the Shell contract.
- Store content-free decisions: status, lane, source class, bounded reason, queue counts, text character counts, and elapsed timing only.
- No prompt, model response, IM text, tool arguments/output, shell command, API key, local path, or remote media URL enters Broker diagnostics.
- Keep audio clips local and manifest-declared; do not fetch voice assets at runtime.
- Validate all imported Pet Pack references against local manifest action IDs and safe relative paths.
- Keep origin/navigation restrictions and preload APIs narrow if a later audio/preview surface is added.

## 8. Verification Matrix

These commands are implementation gates for the phases that touch the listed surfaces. Focused Broker, PetService, Agent Awareness, plugin bridge, contract, and syntax checks are run during implementation. Multi-session desktop behavior remains subject to the manual acceptance below.

| Surface | Focused verification | Broader gate |
| --- | --- | --- |
| Broker policy | `node --test tests/services/companion-intent-policy.test.js tests/services/companion-intent-broker-service.test.js` | `npm run test:core` |
| PetService compatibility | `node --test tests/services/pet-service.test.js` | `npm run test:core` |
| Agent Awareness adapter | `node --test tests/examples/agent-awareness-plugin.test.js` | `npm run test:core` and a fresh local Agent Awareness smoke archive |
| Plugin/bridge trust | `node --test tests/services/plugin-service.test.js tests/backend/plugin-runtime-server.test.js` | `npm run check:api-contract` and `npm run check:channel-retirement` |
| Settings/contracts | Settings and contracts focused Node tests | `npm run build:contracts`, `npm run check:api-contract`, `npm run check:docs-drift` |
| Control Center settings/diagnostics | Add focused assertions to `tests/control-center/control-center-smoke.spec.js` | `npm run test:control-center` |
| Full user-facing runtime | Packaged smoke plus manual desktop acceptance | `npm run test:core:all` before merging user-facing runtime changes |

### Required manual acceptance

Use at least two active Agent Awareness sessions and generate, in order, routine thinking/working, one completion, one approval wait, one failure, and repeated copies of each terminal state. Verify:

1. Routine progress does not create repeated speech bubbles or steal attention from a waiting/error session.
2. An explicit focused session wins among equal-priority sessions and switching focus takes effect without restarting OpenPet.
3. Approval/error notices remain visible long enough to act and do not delete AI dialogue history.
4. A manual action and active user interaction are never interrupted by an autonomous trigger.
5. Disabling Agent Awareness clears live attention but preserves its durable dashboard history.
6. No raw prompt, tool payload, API key, full session ID, or local path appears in logs, diagnostics, or screenshots intended for archive.

Record automated runtime evidence and human noise/usefulness acceptance separately; synthetic policy tests do not count as human UX approval.

## 9. Rollout And Product Decisions

### Stage gates

1. **Design review:** accept lane boundaries, priority ordering, session identity handling, and backward compatibility before code work begins.
2. **Phase 1 code gate:** focused tests and existing PetService/plugin/API contract regressions pass. No new user-facing settings are introduced in this phase.
3. **Phase 2 acceptance gate:** multi-session manual desktop acceptance completes; only then consider the Pet Pack schema expansion.
4. **Phase 3 compatibility gate:** old Pet Packs and Creator-generated packs remain installable, with explicit fallback evidence.
5. **Phase 4 product gate:** approve settings names/defaults and local voice licensing/accessibility before bundling assets or adding UI.

### Decisions that need product review before their phase

- Whether explicit focus is sticky until changed, follows the most recent Bubble Chat session, or expires after an idle period.
- Whether an urgent state from an unfocused session can interrupt an actively used pet interaction. This plan says urgent status can outrank background attention, while never interrupting direct user input/action.
- Whether notices queue behind one another or display only the highest-priority current notice.
- Which locales and licenses are acceptable for bundled pre-recorded voice.
- Quiet-hours timezone source and whether quiet hours suppress only voice or all notices.
- Whether Pet Pack expressions are a fixed host enum or an asset-defined bounded name list.

## 10. Documentation And Implementation Handoff

When the plan is accepted for implementation:

- Update `docs/TODO.md` only when the product owner explicitly moves Phase C into the active queue; do not duplicate this plan as a second backlog.
- Update `docs/agent-awareness-development-design.md` when host-level attention work begins or phase status changes.
- Add a phase record and review report only after implementation evidence exists.
- Update Control Center, contract, and testing docs alongside the code when those interfaces change.
- Run `npm run check:docs-drift` after live-document updates.

## References

- OpenPet current Agent Awareness direction: [`docs/agent-awareness-development-design.md`](../../agent-awareness-development-design.md), especially Phase C and the privacy boundary.
- OpenPet current active work queue: [`docs/TODO.md`](../../TODO.md).
- OpenPet Pet Platform ownership: [`docs/pet-platform-development-plan.md`](../../pet-platform-development-plan.md).
- OpenPet event contract: [`packages/contracts/src/events.ts`](../../../packages/contracts/src/events.ts).
- OpenPet Shell settings contract: [`packages/contracts/src/settings.ts`](../../../packages/contracts/src/settings.ts).
- Big Whale upstream: [`Aliciawque/dsh-big-whale`](https://github.com/Aliciawque/dsh-big-whale).
