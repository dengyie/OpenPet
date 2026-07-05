# Agent Awareness ClaudePet Parity Design

> Date: 2026-07-05
> Branch: `codex/dev7`
> Status: approved development route for the next Agent Awareness expansion
> Source target: public ClaudePet feature surface as the parity reference

## Purpose

This document defines how OpenPet should expand `openpet.agent-awareness` from the current privacy-first status companion into a richer desktop companion that covers most of ClaudePet's user-visible value.

The goal is not to clone ClaudePet internals. The goal is to match the majority of the experience users care about:

- automatic awareness when Codex work begins;
- richer runtime state than a single status badge;
- a useful detail surface for active sessions;
- usage and progress visibility;
- a more complete desktop-pet feeling across multiple sessions.

This document is the forward-looking design. For current shipped truth, read:

- [`docs/agent-awareness-development-design.md`](../../agent-awareness-development-design.md)
- [`docs/agent-awareness-plugin-design.md`](../../agent-awareness-plugin-design.md)
- [`examples/plugins/agent-awareness/README.md`](../../../examples/plugins/agent-awareness/README.md)

## Problem Statement

The current Agent Awareness baseline is real and useful, but it is still narrower than ClaudePet in five important ways:

1. it is polling-first instead of hook-assisted by default;
2. it has a read-only dashboard but no first-class detail panel in OpenPet;
3. it exposes bounded state, not richer runtime progress;
4. it lacks usage, git, and per-session working context;
5. it does not yet feel like a complete multi-session desktop companion.

If OpenPet wants "most of ClaudePet's functionality," Agent Awareness must become a real companion subsystem rather than only a sanitized lifecycle observer.

## Product Principles

### 1. Match user-visible value, not implementation trivia

Parity means the user can feel that OpenPet knows:

- which session is active;
- whether Codex is thinking, using tools, waiting, blocked, or done;
- what broad task progress looks like;
- how much usage or cost is accumulating;
- which project or branch the work belongs to;
- which session deserves attention right now.

Parity does not require copying ClaudePet's exact file layout, hooks format, or rendering choices.

### 2. Preserve OpenPet's architecture

The following boundaries remain mandatory:

- `PetService` stays the single pet-state authority;
- agent-specific parsing stays in the bundled plugin;
- host-owned Control Center surfaces remain the settings and review entrypoint;
- plugin manifest, lifecycle, and native-execution approval still flow through the existing plugin host.

### 3. Expand metadata richness before content richness

The next milestone should expose more metadata, not raw transcripts.

Safe to expand:

- token and context counts;
- estimated cost;
- git branch and dirty status;
- current project/session summary;
- progress hints and tool state;
- per-session runtime details.

Still out of scope by default:

- raw prompt bodies;
- model responses;
- tool arguments;
- tool outputs;
- terminal transcript;
- stdout or stderr mirroring;
- full local paths;
- unrestricted session-content replay.

### 4. Automation must be explicit and reversible

If OpenPet begins installing hooks or auto-starting services, users must be able to:

- understand what was installed;
- see where it was written;
- restore previous state;
- uninstall without manual archaeology.

### 5. Multi-session UX should feel intentional

Once more than one active session exists, OpenPet must not devolve into noisy event spam. The product needs explicit rules for:

- session prioritization;
- which session gets pet attention;
- how background sessions remain inspectable without overwhelming the user.

## Current Baseline vs Target

| Capability area | Current baseline | Target parity direction |
| --- | --- | --- |
| Codex signal ingestion | polling of `~/.codex/sessions` and `archived_sessions` | dual channel: hooks plus polling fallback |
| Runtime start | enabled by default, service start is manual | trusted auto-start after approval and opt-in |
| Pet awareness | bounded `thinking/working/waiting/blocked/completed/failed` | richer `session/turn/tool/approval/progress` model |
| OpenPet surfaces | Plugins pane health note plus dashboard | Plugins pane detail entry plus pet-side detail entry plus richer dashboard |
| Session detail | hashed session plus recent timeline | current task summary, tool/progress, token/context/cost, git, per-session views |
| Hook support | planning only | shipped install/uninstall, reversible config management |
| Multi-session UX | bounded store and dashboard list | per-session focus model and stronger session arbitration |
| Pet presentation | `pet:event` and low-frequency `pet:say` | richer state presentation, mood/action mapping, possible independent windows |

## Capability Tiers

To keep scope clear, future data is divided into tiers.

### Tier 0: Safety and diagnostics

- service health;
- hook install state;
- poller/hook error counters;
- redaction diagnostics;
- auth/token readiness.

### Tier 1: Session and lifecycle metadata

- session id hash;
- project label;
- status;
- event type;
- tool name;
- timestamps;
- active/inactive state;
- recent timeline.

### Tier 2: Rich runtime metadata

- current turn phase;
- progress hints;
- token counts;
- context-window usage;
- estimated cost;
- git branch and dirty state;
- current task or work summary;
- attention priority.

### Tier 3: Rich desktop presentation

- per-session visual slotting;
- richer pet behaviors and mood;
- attention escalation;
- usage dashboards and history;
- persona and presentation customization.

### Tier 4: Content mirroring

This remains explicitly out of scope for the parity program unless a later opt-in design is approved separately.

## Phase Plan

## Phase A: Product Skeleton Parity

Phase A is the minimum milestone required to stop feeling "prototype narrow" and start feeling like a real companion product.

### Scope

- officially ship `install-codex-hooks` and `uninstall-codex-hooks`;
- support hooks plus polling together;
- auto-start `agent-awareness` after trust is granted and signal appears;
- expand runtime state to `session`, `turn`, `tool`, `approval`, and `progress`;
- add a detail entry from Control Center and from the pet-facing surface.

### Product Outcome

After Phase A, the user should be able to:

1. install Codex hooks from OpenPet;
2. grant native execution approval once;
3. let OpenPet auto-start the bundled service when Codex becomes active;
4. see current active session status without opening raw logs;
5. inspect a structured detail surface for the active session.

### Architecture

#### A1. Official command surface promotion

Promote the currently dormant plugin command files:

- `examples/plugins/agent-awareness/commands/install-codex-hooks.js`
- `examples/plugins/agent-awareness/commands/uninstall-codex-hooks.js`

into `plugin.json` as official commands.

The existing repository helper:

- `scripts/configure-agent-awareness-codex.js`

already contains the real hook-writing logic and should be treated as the code source to factor into a shared install/uninstall library. The official plugin commands should reuse that implementation instead of maintaining two divergent code paths.

#### A2. Reversible hook management

Hook installation must:

- write `~/.codex/hooks.json` only after explicit user action;
- create a timestamped backup before mutation;
- write a companion installation manifest under plugin-owned storage;
- be idempotent when run multiple times;
- preserve unrelated existing Codex hooks;
- support uninstall that removes only OpenPet-owned handlers and leaves unrelated hooks intact.

Recommended plugin-owned state:

- `hook-install-state.json`
- `agent-awareness-token.txt`
- `codex-hook-plan.md`

#### A3. Dual ingestion pipeline

Phase A should introduce a session-event merger with two sources:

1. hook events, preferred for freshness and richer metadata;
2. rollout polling, preserved as fallback and bootstrap coverage.

Recommended flow:

```text
Codex hooks -> POST /api/events -> hook event normalizer
Codex rollout JSONL -> poller -> rollout event normalizer
  -> session runtime reconciler
  -> session store / diagnostics / derived attention state
  -> PetService + Control Center + dashboard
```

Key rule:

- hooks may enrich metadata and freshness;
- polling remains the source of truth for "nothing is installed yet" and for recovery when hooks are stale or missing.

#### A4. Runtime reconciler

The current session store only persists a thin event history. Phase A should introduce a stronger runtime state object per session.

Recommended normalized session shape:

```ts
interface AgentRuntimeSession {
  adapter: 'codex'
  sessionId: string
  project: string
  status: 'idle' | 'thinking' | 'working' | 'waiting' | 'blocked' | 'completed' | 'failed'
  phase: 'session' | 'turn' | 'tool' | 'approval' | 'progress'
  type: string
  message: string
  toolName: string
  progressLabel: string
  progressStep: string
  progressCurrent: number | null
  progressTotal: number | null
  attention: 'background' | 'active' | 'needs-user' | 'urgent'
  lastSource: 'hook' | 'poller'
  firstSeenAt: string
  timestamp: string
  history: AgentRuntimeEntry[]
}
```

`progress*` fields may be empty in Phase A if Codex does not emit enough structure yet. The important change is reserving the normalized shape now so richer fields can land without UI churn in Phase B.

#### A5. Auto-start policy

Auto-start should not bypass trust boundaries. The recommended policy is:

- plugin remains enabled by default;
- native execution approval is still explicit;
- new setting `autoStartOnSignal` defaults to `false` on upgrade and `true` on fresh installs only after the user has granted native approval and either installed hooks or explicitly enabled the companion flow;
- if hooks are installed or polling sees fresh Codex activity and `autoStartOnSignal === true`, OpenPet starts `agent-awareness` automatically.

This preserves the "trust first, automation second" model.

#### A6. Control Center and pet-side entrypoints

Phase A should add two explicit UX entrypoints:

1. **Plugins pane detail entry**
   - open detail drawer or modal for Agent Awareness;
   - show install/uninstall hook status;
   - show service status, active session summary, diagnostics, and dashboard shortcut.

2. **Pet-side detail entry**
   - accessible from bubble chat, pet context menu, or both;
   - opens a lightweight detail surface anchored to the current active session.

The pet-side detail entry should not attempt to replace the full dashboard in Phase A. It should be the fastest path to "what is Codex doing right now?"

### Phase A File Ownership

| Area | Expected files |
| --- | --- |
| Hook install/uninstall logic | `examples/plugins/agent-awareness/commands/install-codex-hooks.js`, `uninstall-codex-hooks.js`, shared helper extracted from `scripts/configure-agent-awareness-codex.js` |
| Manifest promotion | `examples/plugins/agent-awareness/plugin.json`, README, docs |
| Event ingestion and reconciliation | `examples/plugins/agent-awareness/service/agent-awareness-service.js`, `session-store.js`, new runtime reconciler helper if needed |
| Poller and hook normalization | `service/adapters/codex-rollout-poller.js`, `service/adapters/codex.js`, possible new `codex-hook-event.js` helper |
| Auto-start wiring | `src/main/services/plugin-service.js`, `src/main/bootstrap/create-plugin-services.js`, Control Center API surface |
| Detail panel UI | `src/control-center/src/hooks/usePluginsPane.ts`, `src/control-center/src/panes/PluginsPane.tsx`, possible new components under `src/control-center/src/components/` |
| Pet-side entry | `src/main/pet-bubble-chat-window.js`, `src/main/ipc/pet-chat-facade.js`, related UI entry files |

### Phase A Acceptance Criteria

- `install-codex-hooks` and `uninstall-codex-hooks` are in `plugin.json`;
- install creates backups and OpenPet-owned install state;
- uninstall removes only OpenPet-owned handlers;
- hook events and polling events deduplicate into one runtime session model;
- Agent Awareness can auto-start after approval and user opt-in;
- Control Center exposes a first-class detail surface;
- pet-side entry can open a current-session detail view;
- docs, README, tests, and smoke procedures all reflect the new official surface.

## Phase B: Core Visible Information

Phase B adds the information layer users expect from a real coding companion.

### Scope

- token, context, and cost aggregation;
- git status;
- current project and current session summary;
- recent task progress and hints;
- per-session detail views.

### Product Outcome

After Phase B, the user should be able to answer:

- how much this session has consumed;
- what project and branch Codex is touching;
- what broad task is underway;
- what just happened recently;
- which session deserves attention.

### Architecture

#### B1. Usage metadata store

Add plugin-owned rollup storage for usage statistics, separate from the event/session store.

Recommended files:

- `sessions.json` for live sanitized runtime state;
- `usage-rollups.json` for session/project/day aggregates.

Recommended usage shape:

```ts
interface UsageSnapshot {
  sessionId: string
  project: string
  inputTokens: number | null
  outputTokens: number | null
  cachedTokens: number | null
  totalTokens: number | null
  estimatedCostUsd: number | null
  contextUsed: number | null
  contextLimit: number | null
  updatedAt: string
}
```

#### B2. Git state capture

Git state should be captured as narrow metadata, not a raw diff view.

Recommended fields:

- repository label;
- branch name;
- dirty boolean;
- ahead/behind counts when cheaply available;
- last checked timestamp.

Git capture should be best-effort and non-blocking. Failure to read git state must never block pet updates.

#### B3. Current task summary

Task summaries should come from sanitized hook metadata or bounded heuristics, never from raw prompt or transcript replay.

Recommended summaries:

- short task title;
- current step label;
- most recent transition;
- user-needed hint when status is `waiting` or `blocked`.

### Phase B UI Surfaces

- detail panel summary cards for session/project/branch/usage;
- per-session list with stronger filtering and focus;
- richer dashboard sections for runtime, usage, and recent progress;
- compact pet-side peek card for the active session.

### Phase B Acceptance Criteria

- active session detail shows token/context/cost metadata when available;
- git metadata is visible without exposing full local paths;
- project/session summaries are stable across hook and polling sources;
- per-session view supports switching between multiple tracked sessions;
- dashboard and Control Center share the same canonical runtime model.

## Phase C: Desktop Companion Completeness

Phase C is where Agent Awareness stops being only an "awareness plugin" and becomes a mature pet companion product.

### Scope

- multi-session independent pet windows or strongly isolated session slots;
- richer pet presentation layer such as state bar, mood, and action mapping;
- usage stats page;
- pet persona, manifestation, and dedicated companion settings.

### Product Outcome

After Phase C, OpenPet should feel meaningfully competitive with ClaudePet's complete desktop experience:

- multiple sessions feel manageable rather than noisy;
- the pet conveys mood and urgency visually, not only in text;
- users can inspect historical usage and activity;
- the companion behavior is configurable instead of hard-coded.

### Architecture

#### C1. Multi-session presentation model

Two acceptable end states exist:

1. independent pet windows per active session; or
2. one primary pet plus strongly isolated session slots and fast switching.

The architecture decision should be made before implementation. Do not ship a half-layer that mixes sessions into one noisy bubble stream without a priority model.

#### C2. Rich pet presentation contract

The plugin should continue emitting semantic state, but the host should own the visual behavior mapping.

Recommended host-owned companion presentation contract:

```ts
interface AgentPresentationState {
  sessionId: string
  mood: 'neutral' | 'focused' | 'busy' | 'waiting' | 'blocked' | 'celebrating' | 'error'
  urgency: 'low' | 'medium' | 'high'
  actionHint: string
  badgeText: string
  progressRatio: number | null
}
```

This lets `PetService` and later pet packs decide how to animate or express the state without embedding agent-specific rendering logic into the plugin.

#### C3. Usage stats page

Add a dedicated companion analytics surface under Control Center or a dedicated dashboard page showing:

- by-day usage;
- by-project usage;
- active time and completion counts;
- approval/blocking counts;
- top sessions by attention or cost.

#### C4. Persona and settings

Add dedicated companion settings for:

- notification sensitivity;
- automatic opening rules;
- preferred session focus strategy;
- richer pet voice/persona;
- whether usage and git metadata should be shown.

### Phase C Acceptance Criteria

- multi-session UX has an explicit attention and focus policy;
- richer pet mood/progress presentation is visible in the main desktop experience;
- usage history is available outside the ephemeral runtime view;
- companion settings exist as a stable user-facing surface.

## Cross-Phase Risks

### Trust boundary creep

The strongest risk is accidental drift from metadata visibility into transcript mirroring.

Mitigation:

- keep Tier 4 explicitly out of scope;
- update docs and tests any time new stored fields are introduced;
- keep command/dashboard redaction as defense in depth.

### Hook fragility

Codex hook payloads may change shape across versions.

Mitigation:

- keep polling fallback alive;
- version hook payload normalization separately from rollout normalization;
- archive real smoke samples when new record shapes appear.

### Session noise

More data can easily create a worse pet.

Mitigation:

- preserve strong rate limiting;
- add session attention rules before multi-session surfaces multiply;
- treat "useful, low-noise, and readable" as a first-class acceptance gate.

### UI fragmentation

If the dashboard, Plugins pane, and pet-side detail each define their own runtime shape, the product will drift quickly.

Mitigation:

- define one canonical runtime session model and one canonical usage snapshot model;
- make all UI surfaces read from those shapes.

## Test Strategy

### Unit and contract tests

- hook install/uninstall idempotence and backup behavior;
- hook and poller event normalization;
- runtime session reconciliation and dedupe;
- usage and git metadata sanitization;
- redaction invariants for all new fields.

### Integration tests

- bundled plugin sync plus promoted command surface;
- service auto-start after approval and signal;
- Control Center detail-panel state refresh;
- per-session runtime API consistency.

### Browser and UI tests

- Plugins pane detail drawer;
- dashboard richer sections;
- pet-side detail entry;
- per-session switching;
- multi-session rendering in later phases.

### Smoke and manual acceptance

Phase A/B/C should each extend the real-session acceptance runbook and archive format. The smoke evidence needs explicit fields for:

- hook install state;
- auto-start outcome;
- active session summary correctness;
- token/context/cost visibility when available;
- git summary usefulness;
- multi-session usefulness and noise review in later phases.

## Recommended Execution Order

1. Phase A official hook surface and dual-ingestion backbone
2. Phase A Control Center detail entry and pet-side entry
3. Phase B usage/git/project/session metadata
4. Phase B per-session views
5. Phase C multi-session desktop model
6. Phase C richer pet presentation and settings

Do not start Phase C desktop multiplicity before Phase A/B establish one stable runtime model and one stable attention model.

## Deliverables By Document

When implementing this roadmap, keep docs synchronized in this order:

1. this parity design doc;
2. `docs/agent-awareness-development-design.md`;
3. `docs/agent-awareness-plugin-design.md`;
4. `examples/plugins/agent-awareness/README.md`;
5. the real-session runbook and smoke archive expectations.

## Final Recommendation

The next milestone should be named:

`Agent Awareness Phase 2: ClaudePet parity foundation`

Its implementation scope should be exactly Phase A from this document.

That is the smallest milestone that materially changes the user experience from:

"OpenPet can observe Codex safely"

to:

"OpenPet is becoming a real coding companion."
