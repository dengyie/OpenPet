# Agent Awareness Unified Phase B Workbench Design

> Date: 2026-07-09
> Branch: `codex/dev7`
> Status: approved design for the next Agent Awareness implementation milestone
> Scope: complete Phase B long-term usage/history and per-session workbench with the dashboard as the primary surface

## Purpose

This document defines the next bounded Agent Awareness milestone after Phase A merge and manual acceptance. The milestone completes the remaining high-value Phase B work:

- durable long-term usage/history visibility;
- a real per-session workbench instead of a thin filtered details screen;
- one coherent persistence model that can support both live status and 30-day history without depending on short in-memory or short-history behavior.

This is a dashboard-first milestone. Control Center remains a summary and entry surface, not the primary workbench.

For current shipped truth, read:

- [`docs/agent-awareness-development-design.md`](../../agent-awareness-development-design.md)
- [`docs/agent-awareness-plugin-design.md`](../../agent-awareness-plugin-design.md)
- [`examples/plugins/agent-awareness/README.md`](../../../examples/plugins/agent-awareness/README.md)

## Locked Decisions

The following decisions are already fixed for this design:

1. both long-term usage/history and per-session workbench are part of the same milestone;
2. persistence moves to one unified Agent Awareness store rather than separate live and analytics stores;
3. long-term history uses a 30-day rolling retention window;
4. the bundled plugin dashboard is the primary detailed surface;
5. Control Center stays compact and continues to deep-link into the dashboard;
6. Phase C work such as pet persona controls, noise controls, richer pet actions, and multi-window presentation remains out of scope for this milestone.

## Problem Statement

The current Agent Awareness baseline has a useful live status surface, but it still has two structural gaps:

1. the persistent store is optimized for recent sessions and recent timeline events, not for stable 30-day history;
2. the dashboard can show a focused session and a small stats page, but it is not yet a full workbench for answering:
   which session matters now,
   what happened in that session,
   how much usage it accumulated,
   how that usage contributes to recent work,
   and which project is consuming attention over time.

If the current store remains event-cache-first, every later attempt to improve history or workbench detail will keep fighting `maxSessions`, `maxEvents`, and short timeline truncation behavior. The data layer has to become explicit before the UI can become complete.

## Goals

### 1. One coherent persistence model

The plugin should persist live session state, stable session summaries, and 30-day usage history in one schema-owned store with one migration path and one retention policy surface.

### 2. Accurate 30-day usage history

The system should retain and display a trustworthy rolling 30-day window for:

- token usage;
- estimated cost when safe metadata exists;
- context peak;
- active sessions;
- active projects;
- top sessions;
- top projects.

### 3. Full per-session workbench

The dashboard should let the user move from “which session needs attention” to “show me this session in detail” without opening raw logs or relying on transient session history.

### 4. Privacy boundary unchanged

The new store must continue to store only safe metadata and derived summaries. Raw prompt content, model output, tool payloads, stdout, stderr, transcript text, and full local paths remain out of scope.

## Out Of Scope

This milestone does not:

- add user-configurable persistent noise controls;
- add pet persona editing or companion settings;
- add semantic pet action mapping beyond existing `pet:event` / `pet:say`;
- add host-owned multi-window or multi-pet presentation;
- capture or mirror raw task content;
- move the primary detailed view into Control Center.

Those remain Phase C or later privacy-reviewed work.

## Product Outcome

After this milestone, a user should be able to open the bundled Agent Awareness dashboard and reliably answer:

1. which sanitized session currently deserves attention;
2. what safe phase, approval state, tool state, git state, and recent progress that session has;
3. how much usage that session has accumulated in the current retained window;
4. what the last 30 days of sanitized usage look like across sessions and projects;
5. which session and project contributed the most usage in that window;
6. whether missing history is caused by retention boundaries or a current store error.

## Design Principles

### 1. Unified persistence without database escalation

This is a single-user local plugin. The store should stay file-backed JSON with explicit schema versioning and atomic full-file writes through temp-file-plus-rename semantics. The design should not introduce SQLite, IndexedDB, or an external database.

### 2. Delta-based history, not naive cumulative re-summing

Codex usage metadata is session-cumulative. Daily history must therefore be built from safe deltas between successive cumulative snapshots, not by summing repeated cumulative totals every time an event arrives.

### 3. Live and historical data have different jobs

The store should preserve this distinction even though both live in one file:

- live session state answers “what is true now”;
- session summary state answers “what do we know about this session as a bounded work item”;
- daily rollups answer “what did the last 30 days look like.”

### 4. Read models can be richer than write events

The incoming event contract stays compact. The store and dashboard read model can derive richer stable views from those events as long as the derived fields stay within the safe metadata boundary.

## Architecture Overview

### Current direction

Today the service normalizes hook and poller events, writes them into `sessions.json`, and lets the dashboard derive both live details and short usage stats directly from recent session history.

### New direction

The plugin moves to a single schema-owned persisted state with three first-class internal sections:

```text
normalized hook/poller event
  -> unified agent-awareness store
     -> liveSessions
     -> sessionSummaries
     -> dailyUsageRollups
  -> /health + /api/sessions read model
  -> dashboard Overview / Sessions / Usage views
```

The write path remains synchronous and simple:

1. normalize and redact the event;
2. update the in-memory unified state;
3. apply retention;
4. write the whole state file atomically;
5. expose the updated read model.

## Store Schema

The current `sessions.json` file becomes a versioned unified state file.

Recommended top-level schema:

```json
{
  "schemaVersion": 2,
  "updatedAt": "2026-07-09T12:00:00.000Z",
  "retentionDays": 30,
  "liveSessions": [],
  "sessionSummaries": [],
  "dailyUsageRollups": [],
  "stats": {
    "totalEvents": 0,
    "lastEventAt": "",
    "storeError": ""
  }
}
```

### `liveSessions`

`liveSessions` keeps the current runtime truth for active and recent sessions.

Each item extends the current runtime shape and adds stable session timing:

```json
{
  "sessionId": "safe-session-hash",
  "project": "OpenPet #123456",
  "status": "working",
  "phase": "tool",
  "type": "tool.started",
  "message": "Using tool apply_patch",
  "toolName": "apply_patch",
  "approvalState": "",
  "progressLabel": "Updating dashboard",
  "progressStep": "render",
  "progressCurrent": 2,
  "progressTotal": 4,
  "active": true,
  "lastSource": "hook",
  "usage": {
    "totalTokens": 1500,
    "inputTokens": 1000,
    "outputTokens": 500,
    "cachedInputTokens": 100,
    "estimatedCostUsd": 0.012345,
    "currency": "USD",
    "contextWindow": 200000,
    "contextUsedPercent": 0.75
  },
  "git": {
    "branch": "codex/dev7",
    "dirty": true,
    "dirtyCount": 2,
    "ahead": 1,
    "behind": 0
  },
  "summary": {
    "title": "OpenPet on codex/dev7",
    "currentStep": "Tool: apply_patch",
    "recentProgressHint": "Using tool apply_patch"
  },
  "firstSeenAt": "2026-07-09T10:00:00.000Z",
  "timestamp": "2026-07-09T12:00:00.000Z",
  "history": []
}
```

`history` remains intentionally short and recent. It still serves the live session timeline, but it no longer carries responsibility for 30-day reporting.

### `sessionSummaries`

`sessionSummaries` is the stable workbench layer. It persists one summary per session in the current retention window.

Recommended shape:

```json
{
  "sessionId": "safe-session-hash",
  "project": "OpenPet #123456",
  "firstSeenAt": "2026-07-09T10:00:00.000Z",
  "lastSeenAt": "2026-07-09T12:00:00.000Z",
  "lastSource": "hook",
  "active": true,
  "status": "working",
  "phase": "tool",
  "lastEventType": "tool.finished",
  "toolName": "apply_patch",
  "approvalState": "",
  "summary": {
    "title": "OpenPet on codex/dev7",
    "currentStep": "Updating usage metadata",
    "recentProgressHint": "Usage updated: 1,500 tokens"
  },
  "usageLatest": {
    "totalTokens": 1500,
    "inputTokens": 1000,
    "outputTokens": 500,
    "cachedInputTokens": 100,
    "estimatedCostUsd": 0.012345,
    "currency": "USD",
    "contextWindow": 200000,
    "contextUsedPercent": 0.75
  },
  "usagePeak": {
    "totalTokens": 1500,
    "contextUsedPercent": 0.75,
    "estimatedCostUsd": 0.012345,
    "currency": "USD"
  },
  "gitLatest": {
    "branch": "codex/dev7",
    "dirty": true,
    "dirtyCount": 2,
    "ahead": 1,
    "behind": 0
  },
  "eventCount": 14,
  "timelineTail": []
}
```

`timelineTail` is still bounded. It exists to give the session workbench a recent event strip without depending on the heavier `liveSessions` history alone.

### `dailyUsageRollups`

`dailyUsageRollups` is the 30-day historical reporting layer. Each row represents one UTC day and stores delta-based usage plus safe per-session contribution buckets.

Recommended shape:

```json
{
  "date": "2026-07-09",
  "totals": {
    "tokenDelta": 3200,
    "inputTokenDelta": 2100,
    "outputTokenDelta": 900,
    "cachedInputTokenDelta": 200,
    "costDeltaUsd": 0.028,
    "currency": "USD",
    "peakContextUsedPercent": 0.81,
    "eventCount": 18,
    "sessionCount": 3,
    "projectCount": 2
  },
  "sessions": [
    {
      "sessionId": "safe-session-hash",
      "project": "OpenPet #123456",
      "tokenDelta": 2500,
      "inputTokenDelta": 1600,
      "outputTokenDelta": 700,
      "cachedInputTokenDelta": 200,
      "costDeltaUsd": 0.022,
      "currency": "USD",
      "peakContextUsedPercent": 0.81,
      "eventCount": 12,
      "firstSeenAt": "2026-07-09T10:00:00.000Z",
      "lastSeenAt": "2026-07-09T12:00:00.000Z"
    }
  ]
}
```

Projects do not need their own stored array. The dashboard can derive project totals by grouping the per-session buckets by sanitized project label.

### Legacy compatibility alias

Older entrypoints and archived links may still request `?view=details`. During this milestone, the dashboard should accept `view=details` as a compatibility alias for `view=sessions`, then render the new session workbench. New links should emit `view=sessions`.

## Usage Aggregation Rules

This milestone depends on correct delta handling.

### Source truth

When usage metadata exists, each event snapshot is treated as a cumulative per-session reading. The store must never sum these cumulative values repeatedly as if they were increments.

### Delta algorithm

For each session summary, keep the last cumulative usage snapshot that was observed:

- `lastUsageSnapshot.totalTokens`
- `lastUsageSnapshot.inputTokens`
- `lastUsageSnapshot.outputTokens`
- `lastUsageSnapshot.cachedInputTokens`
- `lastUsageSnapshot.estimatedCostUsd`
- `lastUsageSnapshot.timestamp`

On every new event with usage metadata:

1. compare the new cumulative numbers to the previous snapshot;
2. compute positive deltas only;
3. if a value decreases, treat the delta as zero and refresh the stored snapshot to the new cumulative reading;
4. attribute the delta to the event day in `dailyUsageRollups`;
5. update the session summary latest and peak metadata.

This handles:

- same-session updates arriving many times in one day;
- sessions that run across day boundaries;
- partial usage fields that appear on some events and not others;
- context compaction or resets that may lower a cumulative reading.

### Currency handling

If all safe cost metadata in the retained window uses one currency, expose that currency. If multiple currencies appear, expose `MIXED` in aggregate summaries. Per-session rows still keep their sanitized currency label.

## Retention Rules

### Long-term window

`dailyUsageRollups` retains only the last 30 UTC days, including the current day.

### Session summary retention

Keep `sessionSummaries` only for sessions whose `lastSeenAt` falls inside the retained 30-day window.

### Live session retention

`liveSessions` remains bounded by count and recent timeline size, similar to the current runtime store behavior. These limits continue to protect the dashboard from unbounded live-session growth.

### Consequence

The dashboard must clearly present this as “30-day retained history.” Missing older data is not an error if it is outside the retention window.

## Store Migration

The current `sessions.json` file contains a versionless legacy structure. On service startup:

1. if `schemaVersion === 2`, load normally;
2. if `schemaVersion` is missing, treat the file as legacy v1;
3. replay legacy sessions and history entries in chronological order to derive:
   `liveSessions`,
   `sessionSummaries`,
   `dailyUsageRollups`,
   and `stats.totalEvents`;
4. write a one-time backup of the original legacy file as `sessions.v1.backup.json` before the first v2 write;
5. persist the migrated v2 store.

### Migration failure behavior

Migration failure must not stop the plugin from starting. Instead:

- the plugin starts with an empty v2 store;
- `/health` exposes a sanitized `storeError`;
- the dashboard can surface that history may be incomplete until new safe events arrive.

Migration logs and diagnostics must remain redacted. No raw path, loopback URL, or token should leave the service boundary.

## Service And API Changes

`createSessionStore` evolves into a unified Agent Awareness store module. The service read API remains local and read-only, but the returned payload becomes richer.

### `GET /health`

Continue exposing service health, poller status, hook state, and aggregate diagnostics, and add:

- `storeSchemaVersion`;
- `retentionDays`;
- `historyWindowStart`;
- `historyWindowEnd`;
- `retainedSessionSummaryCount`;
- `retainedProjectCount`;
- sanitized `storeError` when present.

### `GET /api/sessions`

This endpoint continues to serve dashboard data, but now returns a structured workbench payload:

```json
{
  "ok": true,
  "liveSessions": [],
  "sessionSummaries": [],
  "dailyUsageRollups": []
}
```

The endpoint does not expose raw file paths, raw project paths, prompt content, tool payloads, or unrestricted timeline bodies.

## Dashboard Information Architecture

The dashboard becomes a three-view workbench.

### `Overview`

Purpose: answer “what needs attention right now.”

Contents:

- current summary cards;
- attention session card;
- active and recent session list;
- compact recent history summary;
- entry links into the per-session workbench and usage view.

### `Sessions`

Purpose: answer “what is happening in this session.”

Contents:

- session list sorted by attention priority and recency;
- focusable selected session using `?view=sessions&sessionId=<hash>`;
- stable workbench detail panel with:
  project,
  session hash,
  status,
  phase,
  approval state,
  latest tool name,
  current step,
  recent progress hint,
  latest usage snapshot,
  30-day session usage contribution,
  latest git snapshot,
  first seen time,
  last seen time,
  recent timeline tail.

### `Usage`

Purpose: answer “what has happened across the last 30 days.”

Contents:

- 30-day total tokens;
- 30-day total cost;
- 30-day peak context;
- active session count in window;
- active project count in window;
- daily trend rows for the retained 30-day window;
- top sessions by 30-day token contribution;
- top projects by 30-day token contribution.

## Query Model

Replace the current view semantics with explicit workbench routes:

- `/` and `?view=overview`
- `?view=sessions`
- `?view=sessions&sessionId=<hash>`
- `?view=usage`

Existing entrypoints that currently deep-link to `view=details` should be updated to `view=sessions`. If a session id is present, it should select that session in the Sessions workbench, not filter the entire dashboard into a one-off empty detail state.

## Session Ordering Policy

The session workbench list should sort by:

1. attention priority from the existing bounded attention model;
2. active session status over inactive session status;
3. most recent `lastSeenAt`;
4. stable session id tie-breaker.

This makes the list predictable without introducing Phase C multi-slot presentation rules yet.

## Dashboard Rendering Rules

### Workbench detail fidelity

The selected session view should not depend on the current `liveSessions.history.slice(-4)` shape alone. It should primarily read from the stable session summary and then decorate with live-session timing and recent tail data when available.

### Usage view fidelity

The Usage view should present “30-day retained history” explicitly. It should not imply “all-time” usage.

### Empty states

If there is no retained history:

- Overview still renders live summaries if present;
- Sessions still renders live sessions if present;
- Usage renders an explicit “No retained 30-day usage metadata yet” empty state.

### Error states

If `storeError` is present:

- the dashboard remains usable;
- status copy explains that retained history may be incomplete;
- the UI does not claim corruption or data loss beyond what the sanitized diagnostics actually prove.

## Privacy And Trust Boundary

The unified store may only persist fields already allowed by the current safe contract:

- hashed session id;
- sanitized project label;
- bounded status, phase, event type, approval state, tool name, and progress fields;
- numeric usage metadata when safely present;
- bounded git metadata;
- generated summary title, current step, and recent progress hint;
- timestamps;
- derived counts and aggregate rollups.

The unified store must not add:

- raw prompt or response text;
- terminal transcript;
- stdout or stderr;
- tool arguments or results;
- raw cwd or other full paths;
- loopback URLs;
- secret-like tokens;
- unbounded freeform task content.

Display-time redaction remains in place as defense in depth even when the stored data is already sanitized.

## Component Map

Primary implementation touchpoints:

- `examples/plugins/agent-awareness/service/session-store.js`
  become the unified schema-owned persistence layer;
- `examples/plugins/agent-awareness/service/agent-awareness-service.js`
  expose the richer workbench payload and diagnostics;
- `examples/plugins/agent-awareness/web/dashboard/dashboard.js`
  build new overview, sessions, and usage view models;
- `examples/plugins/agent-awareness/web/dashboard/index.html`
  adjust tab structure and workbench layout;
- `examples/plugins/agent-awareness/web/dashboard/styles.css`
  support the new session workbench and usage layout;
- `tests/examples/agent-awareness-dashboard.test.js`
  cover read-model shaping and route semantics;
- `tests/examples/agent-awareness-dashboard-browser.test.js`
  cover browser rendering and focus navigation;
- `tests/services/agent-awareness-plugin-service.test.js`
  cover store-backed diagnostics and endpoint payloads;
- `tests/services/agent-awareness-session-store.test.js`
  cover migration, retention, delta aggregation, and write-failure behavior.

## Testing Strategy

This milestone should be implemented test-first and verified at four layers.

### 1. Store tests

Required behaviors:

- legacy store migration to schema v2;
- 30-day rollup retention;
- session summary retention aligned with the 30-day window;
- correct delta attribution across multiple events in one day;
- correct delta attribution across day boundaries for the same session;
- safe handling of decreasing cumulative counters;
- sanitized `storeError` behavior when writes fail.

### 2. Service tests

Required behaviors:

- `/health` exposes schema version, retention window, retained counts, and sanitized store errors;
- `/api/sessions` returns `liveSessions`, `sessionSummaries`, and `dailyUsageRollups`;
- no payload exposes raw paths, loopback URLs, or secret-like values.

### 3. Dashboard model tests

Required behaviors:

- `Overview` still renders the current summary and attention state;
- `Sessions` view selects the requested session with `view=sessions&sessionId=...`;
- per-session workbench fields render from the stable summary even when live history is short;
- `Usage` view renders 30-day totals, top sessions, and top projects from rollup data;
- empty and error states render bounded copy.

### 4. Browser regression tests

Required behaviors:

- view-tab routing for `overview`, `sessions`, and `usage`;
- focus link opens the session workbench route rather than the older filtered details route;
- top sessions and top projects render sanitized labels only;
- no browser-visible output leaks raw paths, loopback URLs, or token text.

## Delivery Boundary

This milestone is complete when all of the following are true:

1. the plugin persists live session state, stable session summaries, and 30-day usage rollups in one schema-owned store;
2. legacy `sessions.json` can migrate into the new store without blocking startup;
3. the dashboard has a real Sessions workbench and a full 30-day Usage view;
4. Control Center and Bubble Chat entrypoints still open the correct dashboard route;
5. the retained history model is explicit and accurate enough to avoid repeated cumulative overcounting;
6. tests cover migration, retention, read models, and browser-level rendering.

## Follow-On Work

This milestone intentionally leaves the following for later phases:

- host-owned usage surfaces outside the plugin dashboard;
- companion settings for noise or persona;
- richer pet mood/status/action rendering;
- multi-session pet-window isolation or slotting;
- any privacy-reviewed content mirroring.

Those remain valid next steps after this Phase B workbench milestone, but they are not needed to call this design complete.
