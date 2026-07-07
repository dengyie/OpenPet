# OpenPet Agent Awareness Development Design

> Date: 2026-07-05
> Branch: `codex/dev7`
> Status: canonical live development document for the Agent Awareness track

## Documentation Set

Use this doc as the single overview, then drop into the narrower documents only when you need implementation or acceptance detail.

| Need | Read |
| --- | --- |
| Product goal, current baseline, architecture, roadmap | [`agent-awareness-development-design.md`](./agent-awareness-development-design.md) |
| Current executable Phase A implementation plan | [`superpowers/plans/2026-07-05-agent-awareness-phase2-claudepet-parity-foundation.md`](./superpowers/plans/2026-07-05-agent-awareness-phase2-claudepet-parity-foundation.md) |
| ClaudePet parity expansion route and phased design | [`superpowers/specs/2026-07-05-agent-awareness-claudepet-parity-design.md`](./superpowers/specs/2026-07-05-agent-awareness-claudepet-parity-design.md) |
| Shipped plugin runtime contract and operator-facing behavior | [`../examples/plugins/agent-awareness/README.md`](../examples/plugins/agent-awareness/README.md) |
| Concrete package layout, core touchpoints, and maintenance checklist | [`agent-awareness-plugin-design.md`](./agent-awareness-plugin-design.md) |
| Real-session smoke and desktop acceptance procedure | [`superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md`](./superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md) |
| Archived smoke evidence and manual acceptance write-back | [`release-evidence/agent-awareness-local-smoke/`](./release-evidence/agent-awareness-local-smoke/) |

## Program Snapshot

This document is the single live entry for the whole Agent Awareness program. Use it first, then drill into the narrower docs only when you need execution detail.

| Layer | Status | Use this when you need |
| --- | --- | --- |
| Current shipped baseline | live | the exact product truth today |
| Phase A: product skeleton parity | code complete, manual acceptance pending | the current implementation milestone |
| Phase B: core visible information | foundation shipped, broader phase open | the visible metadata layer after Phase A |
| Phase C: desktop companion completeness | designed, not started | the later companion-product completeness layer |

## Current Delivery Status

The current branch baseline is no longer "paper design only." It has the full planned Phase A code surface plus the first Phase B visible-information foundation. Manual-required desktop acceptance is still open.

### Already Landed

- shipped `install-codex-hooks` and `uninstall-codex-hooks` as official plugin commands;
- shipped hook + polling dual ingestion with one canonical runtime session model;
- shipped trusted auto-start gating behind native approval plus explicit opt-in;
- shipped richer runtime metadata covering `session`, `turn`, `tool`, `approval`, and `progress`;
- shipped the first Phase B visible metadata layer for token/context/cost values when Codex exposes them, aggregate usage diagnostics, lightweight daily usage stats from sanitized history, best-effort git branch/dirty summaries, content-safe current-step summaries, generated session summaries, dashboard rendering, bounded detail deep-link focus, in-dashboard session focus controls, and a compact Control Center-native Agent Awareness detail summary;
- shipped a first-class Agent Awareness detail entry from Control Center;
- shipped a pet-side quick-open detail entry from Bubble Chat;
- kept the privacy boundary intact while adding the richer runtime shape.

### Manual-Required Boundaries

These are intentionally outside automated completion:

- the user still must trust the installed hook inside Codex with `/hooks`;
- final desktop product acceptance still needs human review of dashboard usefulness and pet speech frequency.

## Goal And Positioning

OpenPet should feel present during local AI coding sessions without turning OpenPet core into a Codex-, Claude-, or tool-specific runtime. The shipped first-class experience for this track is the bundled `openpet.agent-awareness` plugin.

ClaudePet is the inspiration for the companion feel: a desktop pet that reflects what the coding agent is doing right now. OpenPet deliberately implements that value with different boundaries:

- `PetService` remains the only pet-state authority in core;
- agent-specific parsing stays in a bundled plugin, not in OpenPet core services;
- the renderer never receives raw prompts, tool arguments, transcripts, stdout/stderr, secrets, or full local paths;
- the first deliverable prioritizes bounded awareness, low-noise notifications, and repeatable validation over feature breadth.

## Current Baseline

The current shipped baseline is stronger than a paper prototype and narrower than "full Codex awareness."

Today Agent Awareness provides:

- bundled plugin `openpet.agent-awareness`, synchronized into the user's plugin directory;
- enabled-by-default discovery with stopped-by-default runtime behavior until manual start or trusted auto-start conditions are met;
- schema-backed plugin config with `autoStartOnCodexSignal` as an explicit, reversible opt-in;
- explicit `install-codex-hooks` and `uninstall-codex-hooks` commands for reversible Codex hook management;
- explicit manual service start through the Plugins pane, still gated by `native execution approval`;
- dual-channel Codex ingestion: rollout polling from `~/.codex/sessions` / `~/.codex/archived_sessions` plus optional hook-assisted freshness;
- trusted host-side auto-start after `native execution approval`, explicit opt-in, and recent Codex activity detection;
- a local service with `GET /health`, `GET /api/sessions`, dashboard `/`, and bearer-token-gated `POST /api/events`;
- richer sanitized runtime session state covering `session`, `turn`, `tool`, `approval`, `progress`, usage, git, and generated summary metadata;
- bounded pet events for accepted safe lifecycle signals;
- low-frequency pet speech for selected status changes;
- a reserved Plugins pane health-note summary in the form `X active · Y sessions · Z events`;
- a Control Center-native `Agent Awareness 原生详情` summary that reads the real bundled service health details for active sessions, tracked sessions, observed events, usage tokens, estimated cost, and peak context when available;
- a first-class `查看 Codex 详情` entry in the Plugins pane that deep-links to the Agent Awareness dashboard detail view;
- a pet-side `Codex 详情` quick-open button in Bubble Chat that opens the same bounded detail view;
- dashboard support for `view=details&sessionId=<sanitized-id>` so an existing safe session hash can be shown as a focused detail view;
- a per-session dashboard `Focus` link that opens the same bounded detail route without adding a new host/plugin contract;
- a read-only dashboard that shows aggregate usage tokens, token breakdown, estimated cost, peak context, recent daily usage stats, and per-session usage, git, current step, and summary facts when available;
- operator commands `doctor`, `codex-hook-plan`, `install-codex-hooks`, and `uninstall-codex-hooks`;
- repeatable real-session smoke via `npm run run-agent-awareness-local-smoke`;
- archived smoke review write-back through `npm run update-agent-awareness-local-smoke-report`.

One canonical archived smoke evidence sample in this repository already shows real sanitized local signal detection under:

- [`docs/release-evidence/agent-awareness-local-smoke/2026-07-03T16-04-08-824Z/`](./release-evidence/agent-awareness-local-smoke/2026-07-03T16-04-08-824Z/)

That run recorded:

- `sanitizedSignalDetected === true`
- `sessionCount === 20`
- `totalEvents === 1000`
- `unknownRecordCount === 0`
- `unsupportedLifecycleRecordCount === 0`

## What This Feature Is And Is Not

### What It Is

Agent Awareness is a privacy-bounded companion layer for local coding-agent activity. It detects safe lifecycle hints, maps them into canonical agent states, and reflects those states through OpenPet speech, events, and a dashboard.

### What It Is Not

Agent Awareness is not yet "complete Codex awareness." The current milestone does not:

- auto-install Codex hooks during discovery or app boot;
- capture raw prompts, model responses, tool arguments, tool results, terminal transcript, stdout, stderr, or full local paths;
- expose multi-session pinning/focus controls as a finished product feature;
- provide persistent noise controls;
- infer model pricing or cost when Codex does not provide safe cost metadata;
- drive semantic pet actions beyond `pet:event` and `pet:say`;
- claim final desktop-feel sign-off without manual acceptance.

## ClaudePet Parity Program

The parity program is intentionally split into three bounded product phases. Phase A is code complete, and a narrow Phase B foundation has landed. The rest of Phase B and all of Phase C remain separate milestones.

| Phase | Product objective | Scope boundary | Primary owners | Exit signal |
| --- | --- | --- | --- | --- |
| Phase A | stop feeling prototype-narrow | hook management, dual ingestion, trusted auto-start, richer runtime state, Control Center and pet-side detail entry | bundled plugin, `PluginService`, Plugins pane, pet-facing window | OpenPet can install hooks, auto-start safely, and open a useful current-session detail surface |
| Phase B | make the companion broadly informative | token/context/cost, git state, project and session summary, recent progress hints, per-session views | bundled plugin store and dashboard, Plugins pane detail UI, shared session model | users can see what work is happening, where it belongs, and roughly how much it is costing |
| Phase C | make it feel like a real desktop companion product | multi-session presentation, richer pet mood and action mapping, usage stats page, persona/settings | host presentation contract, pet windows, Control Center settings | multiple active sessions remain understandable, configurable, and visually expressive |

## Phase Delivery Matrix

### Phase A: Product Skeleton Parity

Phase A is the only active implementation milestone right now.

**Scope**

- official `install-codex-hooks` / `uninstall-codex-hooks`;
- hook + polling dual ingestion;
- trusted auto-start after approval plus opt-in;
- richer runtime state for `session`, `turn`, `tool`, `approval`, and `progress`;
- Control Center detail entry and pet-side detail entry.

**Architecture owners**

- plugin commands and service under `examples/plugins/agent-awareness/`;
- lifecycle and auto-start orchestration under `src/main/services/plugin-service.js`;
- Operator entry and detail UI under `src/control-center/src/hooks/usePluginsPane.ts` and `src/control-center/src/panes/PluginsPane.tsx`;
- fast pet entry under the pet-facing window and IPC bridge.

**Definition of done**

- Commands, README, tests, and smoke procedures all treat hook install/uninstall as official shipped surface.
- Hook and poller events reconcile into one canonical runtime session model.
- Auto-start never bypasses native approval or explicit opt-in.
- Both desktop entry surfaces can open a useful current-session detail view.

### Phase B: Core Visible Information

Phase B has started with a foundation slice. That slice adds safe visible metadata, but it does not close the broader Phase B product goal.

**Scope**

- token/context/cost aggregation when provided by Codex metadata;
- git branch and dirty-state summary;
- current project and current session summary;
- recent task progress and hints;
- per-session independent detail views.

**Shipped foundation**

- rollout polling derives safe `token_count` metadata into usage summaries;
- rollout polling derives safe `turn_context` cwd into bounded git metadata without storing the cwd;
- hook and poller adapters preserve bounded `usage`, `git`, and `summary` objects;
- `/health` exposes aggregate usage totals, token breakdown, estimated cost, currency, and peak context metadata;
- runtime summaries prefer bounded progress labels or safe tool names over raw lifecycle type strings for `currentStep`;
- the dashboard renders aggregate usage tokens, token breakdown, estimated cost, peak context, lightweight recent daily usage stats, and per-session usage/git/current-step/session-summary facts;
- the Plugins pane renders a compact Agent Awareness-only native detail summary from the same reserved health diagnostics, without creating an arbitrary plugin JSON detail surface;
- the dashboard honors `view=details&sessionId=<sanitized-id>` for safe per-session focus and renders a bounded empty state when the requested session is absent;
- each rendered session card exposes a safe `Focus` link into that bounded detail route;
- mock smoke flow preserves these fields in redacted reports.

**Still open**

- a dedicated longitudinal stats page over time;
- richer semantic current-task summaries beyond lifecycle labels while remaining content-safe.

**Architecture owners**

- plugin-owned usage rollups and session summary model;
- dashboard and Control Center detail UI that both read the same canonical runtime and usage shapes;
- best-effort git metadata capture kept outside the renderer trust boundary.

**Definition of done**

- the active session surface shows usage and git metadata without exposing raw prompts, transcripts, tool payloads, or full paths;
- multi-session detail switching works from one canonical model;
- the pet-side peek stays bounded and low-noise while the richer detail remains inspectable.

### Phase C: Desktop Companion Completeness

Phase C is a product-completion phase, not a quick follow-up patch.

**Scope**

- multi-session independent pet windows or strongly isolated session slots;
- richer pet presentation such as status bar, mood, progress, and action mapping;
- usage stats page;
- dedicated companion persona and settings surfaces.

**Architecture owners**

- host-owned presentation contract consumed by `PetService` and pet-facing windows;
- Control Center settings and stats pages;
- session-focus policy shared between plugin state and host presentation.

**Definition of done**

- multi-session attention has an explicit policy instead of whichever event arrived last;
- the pet can express urgency and progress visually as well as through text;
- usage and companion preferences become stable user-facing product surfaces rather than hard-coded behavior.

## Privacy And Trust Boundary

The core rule is simple: the plugin may use raw local session data only long enough to derive safe state. It must store and display only a narrow sanitized representation.

Stored and displayed fields are limited to:

- session id hash;
- bounded status;
- bounded runtime phase;
- bounded event type;
- project basename plus short hash;
- token/context/cost metadata when provided as numeric metadata;
- git branch, dirty state, dirty count, and ahead/behind counts;
- generated session summary title, current step, and progress hint;
- bounded tool name;
- bounded approval state;
- bounded progress label, step, and counts;
- short sanitized status text when one exists;
- bounded source marker (`hook` or `poller`);
- timestamp.

The current implementation intentionally does not store:

- raw prompt bodies;
- model responses;
- tool arguments or tool output;
- shell command text;
- terminal transcript;
- stdout or stderr;
- API keys or bearer tokens;
- full local filesystem paths.

Additional hardening that is part of the live contract:

- raw session ids are hashed before persistence or display;
- project paths are reduced to `basename + short hash`;
- `/health` does not expose plugin store paths or `codexHome`;
- poller `lastError` is sanitized before leaving the service;
- the dashboard re-applies display-time redaction as defense in depth;
- command outputs use safe labels such as `plugin-data-dir`, `codex:sessions`, `codex:archived_sessions`, `codex-hook-plan.md`, and `plugin-auth-file`.

## Architecture

```text
Codex hooks
  -> token-gated POST /api/events
  -> codex-hook normalizer
Local Codex rollout JSONL
  -> codex-rollout-poller
  -> safe lifecycle event derivation
  -> codex normalizer/redaction
  -> runtime-session reconciler
  -> session store + diagnostics
  -> state mapper
  -> service-scoped bridge client
  -> PetService.say / PetService.setEvent
  -> Plugins pane health note + dashboard

PluginService host probe
  -> recent Codex activity detection
  -> explicit auto-start opt-in + native approval gate
  -> bundled agent-awareness service start
```

OpenPet core owns:

- bundled plugin synchronization;
- plugin manifest validation;
- service lifecycle and native execution approval;
- service bridge credential injection;
- permission enforcement;
- pet mutation through `PetService`;
- the reserved health-note summary formatting for the real bundled target.

The plugin owns:

- Codex polling and normalization;
- Codex hook-event normalization;
- redaction and session hashing;
- session reconciliation, persistence, and diagnostics;
- state-to-pet mapping;
- dashboard rendering;
- hook-planning guidance.

## Component Map

| Path | Responsibility |
| --- | --- |
| `src/main/bootstrap/create-plugin-services.js` | Adds Agent Awareness to bundled plugin sync. |
| `src/main/services/plugin-service.js` | Enforces native execution approval, owns explicit auto-start gating, and formats the reserved `X active · Y sessions · Z events` summary for the real bundled service. |
| `examples/plugins/agent-awareness/plugin.json` | Declares the shipped manifest surface. |
| `examples/plugins/agent-awareness/config.schema.json` | Declares the explicit auto-start opt-in config field. |
| `examples/plugins/agent-awareness/commands/codex-hook-config.js` | Owns reversible Codex hook install/uninstall plus the bounded hook sender script. |
| `examples/plugins/agent-awareness/service/adapters/codex-rollout-poller.js` | Reads safe local Codex rollout signal and counts ignored/unknown/malformed records. |
| `examples/plugins/agent-awareness/service/adapters/codex.js` | Normalizes and sanitizes accepted rollout events. |
| `examples/plugins/agent-awareness/service/adapters/codex-hook.js` | Normalizes bounded Codex hook events into the shared runtime shape. |
| `examples/plugins/agent-awareness/service/usage-summary.js` | Normalizes safe token/context/cost metadata. |
| `examples/plugins/agent-awareness/service/git-summary.js` | Derives bounded git branch/dirty metadata without storing cwd. |
| `examples/plugins/agent-awareness/service/runtime-session.js` | Reconciles hook and poller events into one canonical runtime session shape. |
| `examples/plugins/agent-awareness/service/session-store.js` | Persists sanitized runtime session state in plugin-owned storage. |
| `examples/plugins/agent-awareness/service/state-mapper.js` | Maps canonical agent states into `pet:event` and rate-limited `pet:say`. |
| `examples/plugins/agent-awareness/service/agent-awareness-service.js` | Exposes `/health`, `/api/sessions`, dashboard assets, and token-gated `/api/events`. |
| `examples/plugins/agent-awareness/commands/doctor.js` | Reports sanitized setup and diagnostics. |
| `examples/plugins/agent-awareness/commands/codex-hook-plan.js` | Writes a read-only future-hook plan inside plugin-owned storage. |
| `examples/plugins/agent-awareness/web/dashboard/*` | Read-only dashboard for sanitized session status, diagnostics, hook-plan state, usage, git, and summary metadata. |

## Runtime Contract

The shipped manifest contract is:

- plugin id: `openpet.agent-awareness`
- profile: `runtime`
- permissions: `pet:say`, `pet:event`
- config field: `autoStartOnCodexSignal` (default `false`)
- commands: `doctor`, `codex-hook-plan`, `install-codex-hooks`, `uninstall-codex-hooks`
- service id: `agent-awareness`
- service health URL: `http://127.0.0.1:8795/health`
- dashboard URL: `http://127.0.0.1:8795`

Current operator flow:

1. Open `Control Center -> Plugins`.
2. Find the synchronized `openpet.agent-awareness` plugin.
3. Ensure it is enabled if local settings previously disabled it.
4. Run `codex-hook-plan` if you want to review the hook wiring before any external write.
5. Grant `native execution approval`.
6. Run `install-codex-hooks` if you want hook-assisted freshness in addition to polling.
7. Review and trust the new hook once inside Codex with `/hooks`.
8. Decide whether to keep manual start only, or enable `autoStartOnCodexSignal`.
9. If auto-start stays off, start the `agent-awareness` service explicitly. If auto-start is on, let recent Codex activity bring it up after the trust gates are satisfied.
10. Open the dashboard.
11. Run `doctor` if no Codex polling or hook signal is visible.

The plugin still must not auto-start during discovery alone or app boot alone. Auto-start requires all of the following together:

- the bundled plugin is enabled;
- `native execution approval` is granted;
- `autoStartOnCodexSignal` is enabled;
- recent Codex activity is detected.

## Event And Notification Contract

Canonical statuses are:

- `idle`
- `thinking`
- `working`
- `waiting`
- `blocked`
- `completed`
- `failed`

Every accepted safe event produces a pet event in the form:

```text
agent:<status>
```

Speech policy is intentionally conservative:

- `idle` never speaks;
- `thinking` and `working` are rate-limited to once per session/status every 5 minutes by default;
- identical event fingerprints are suppressed for 10 minutes by default;
- `waiting`, `blocked`, `completed`, and `failed` may speak immediately on transition;
- the initial bootstrap scan must not notify the pet; only incremental events should notify it.

The current tests explicitly prove the incremental-notification rule and the completion example:

- event: `agent:completed`
- message: `Codex completed a turn.`
- speech: `我刚完成：Codex completed a turn.`

## Commands And Diagnostics

### `doctor`

`doctor` is the operator-facing truth source for safe diagnostics. It reports:

- plugin data-dir availability;
- Codex polling directory availability;
- hook-plan/token-file presence;
- service health;
- session and event counts;
- ignored-content, ignored-metadata, malformed, unknown, and unsupported-lifecycle counters;
- last scan time and sanitized error state.

### `codex-hook-plan`

`codex-hook-plan` is intentionally read-only with respect to external agent config. It creates only plugin-owned planning assets:

- `agent-awareness-token.txt`
- `codex-hook-plan.md`

It does not modify `~/.codex`, install hooks, or write outside plugin-owned storage.

### `install-codex-hooks`

`install-codex-hooks` is the explicit, shipped hook-management entrypoint. It:

- writes only bounded OpenPet-owned handlers into `~/.codex/hooks.json`;
- preserves unrelated existing Codex hooks;
- creates a timestamped backup before hook-file mutation;
- writes a companion `hook-install-state.json` file under plugin-owned storage;
- keeps the service ingress bearer-token gated.

It does not enable service auto-start, does not bypass `native execution approval`, and does not trust the hook inside Codex on the user's behalf.

### `uninstall-codex-hooks`

`uninstall-codex-hooks` removes only the OpenPet-owned handlers and hook sender script. It preserves unrelated Codex hooks and clears the plugin-owned install-state file.

## Codex Integration Strategy

The first-class baseline is zero-config local polling from:

- `~/.codex/sessions`
- `~/.codex/archived_sessions`

Only safe top-level lifecycle hints are used. Content-bearing records are ignored and counted, not stored. This is why the plugin can be meaningfully useful now without crossing the privacy boundary.

There is also an official optional hook-assisted path. The shipped install flow reuses the repository helper implementation from `scripts/configure-agent-awareness-codex.js`, but the helper script itself remains a repo/operator convenience wrapper rather than the primary user-facing surface. The canonical plugin user contract now includes:

- `doctor`;
- `codex-hook-plan`;
- `install-codex-hooks`;
- `uninstall-codex-hooks`;
- explicit manual service start plus opt-in trusted auto-start;
- real-session smoke and manual acceptance.

## Validation And Evidence

### Automated Checks

The core runtime and documentation baseline should be protected by:

```bash
node --test tests/examples/agent-awareness-plugin.test.js
node --test tests/services/agent-awareness-plugin-service.test.js
node --test tests/services/agent-awareness-bundled-integration.test.js
node --test tests/services/plugin-service.test.js
node --test tests/examples/agent-awareness-dashboard.test.js
node --test tests/scripts/run-agent-awareness-local-smoke.test.js
node --test tests/scripts/mock-agent-awareness-flow.test.js
npm run check:docs-drift
```

`tests/scripts/mock-agent-awareness-flow.test.js` is the synthetic preflight for
the archive chain: it drives mock Codex rollout data through smoke generation,
archive creation, and manual-acceptance write-back without launching OpenPet.
It proves tool wiring and redacted data flow only; it does not replace the real
session smoke or the later human desktop review.

### Real-Session Smoke

Primary entrypoint:

```bash
npm run run-agent-awareness-local-smoke -- \
  --codex-home ~/.codex \
  --output-dir agent-awareness-local-smoke
```

The smoke result is expected to preserve a `manualAcceptanceTemplate` block so that automated validation and human desktop review stay clearly separated.

The report should then be updated with:

```bash
npm run update-agent-awareness-local-smoke-report -- \
  docs/release-evidence/agent-awareness-local-smoke/<session>/agent-awareness-local-smoke-result.json \
  --dashboard-useful true \
  --pet-speech-noise-acceptable true \
  --redaction-looks-safe true \
  --notes "Dashboard is useful and pet speech stays low-noise." \
  --validate-complete
```

This write-back step is part of the current process, not clerical cleanup. It is how the repository records the remaining Manual-required acceptance truth.

## Execution Rule

Keep the implementation flow phase-gated:

1. keep Phase A and Phase B claims separate;
2. run the phase review and acceptance checks;
3. open dedicated plans for each remaining Phase B or Phase C slice;
4. do not write one monolithic A+B+C execution plan.

That rule keeps the product honest. Phase B and Phase C are already designed, but they should still be implemented as separate milestones with their own test gates and review passes.

## What Still Needs To Happen Before We Can Say "Fully Aware"

OpenPet is not yet at "pet completely perceives Codex" quality. The remaining gap is concrete:

- auto or semi-auto hook installation still lacks a final product decision;
- the shipped plugin still prefers bounded awareness over deep session introspection;
- multi-session focus, pinning, and arbitration are unfinished;
- persistent notification tuning is unfinished;
- semantic pet behavior mapping is unfinished;
- final desktop usefulness and noise acceptance are still partly manual.

That is the honest line: the current system already provides real sanitized awareness plus notifications, but not full raw-state understanding or zero-touch desktop polish.

## Development Route

The baseline above remains the current shipped truth. The next expansion route is now the ClaudePet parity program documented in:

- [`docs/superpowers/specs/2026-07-05-agent-awareness-claudepet-parity-design.md`](./superpowers/specs/2026-07-05-agent-awareness-claudepet-parity-design.md)

That program replaces the older "finish acceptance, then defer hook decisions until later" sequence with a clearer product roadmap:

### Phase A: Product Skeleton Parity

- officially ship `install-codex-hooks` and `uninstall-codex-hooks`;
- support hook plus polling dual ingestion;
- allow trusted auto-start after approval and opt-in;
- promote runtime state from simple status to `session`, `turn`, `tool`, `approval`, and `progress`;
- add a first-class detail entry in Control Center and from the pet-facing surface.

### Phase B: Core Visible Information

- token, context, and cost aggregation foundation: shipped for safe numeric metadata, richer history still open;
- git status foundation: shipped for branch/dirty/ahead/behind metadata, deeper repository views still open;
- current project and current session summary foundation: shipped as generated metadata summaries, semantic content summaries still out of scope;
- recent task progress and hints foundation: shipped from safe metadata and lifecycle labels;
- per-session detail views.

### Phase C: Desktop Companion Completeness

- multi-session independent pet windows or strongly isolated session slots;
- richer pet presentation such as mood, status bar, and action mapping;
- usage stats page;
- dedicated companion persona and settings surfaces.

The parity route still preserves the core trust boundary: richer metadata comes before any content mirroring, and raw prompts/transcripts/tool payloads remain out of scope by default.

## Maintainer Rule Of Thumb

When Agent Awareness changes, update facts in this order:

1. `docs/agent-awareness-development-design.md`
2. `docs/superpowers/specs/2026-07-05-agent-awareness-claudepet-parity-design.md` when the future route changes
3. `examples/plugins/agent-awareness/README.md`
4. `docs/agent-awareness-plugin-design.md`
5. `docs/superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md` when acceptance procedure changes
6. related tests and evidence helpers

If a new change cannot be explained cleanly inside this document, the design is probably drifting again.
