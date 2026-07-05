# OpenPet Agent Awareness Development Design

> Date: 2026-07-05
> Branch: `codex/dev7`
> Status: canonical live development document for the Agent Awareness track

## Documentation Set

Use this doc as the single overview, then drop into the narrower documents only when you need implementation or acceptance detail.

| Need | Read |
| --- | --- |
| Product goal, current baseline, architecture, roadmap | [`agent-awareness-development-design.md`](./agent-awareness-development-design.md) |
| ClaudePet parity expansion route and phased design | [`superpowers/specs/2026-07-05-agent-awareness-claudepet-parity-design.md`](./superpowers/specs/2026-07-05-agent-awareness-claudepet-parity-design.md) |
| Shipped plugin runtime contract and operator-facing behavior | [`../examples/plugins/agent-awareness/README.md`](../examples/plugins/agent-awareness/README.md) |
| Concrete package layout, core touchpoints, and maintenance checklist | [`agent-awareness-plugin-design.md`](./agent-awareness-plugin-design.md) |
| Real-session smoke and desktop acceptance procedure | [`superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md`](./superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md) |
| Archived smoke evidence and manual acceptance write-back | [`release-evidence/agent-awareness-local-smoke/`](./release-evidence/agent-awareness-local-smoke/) |

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
- richer sanitized runtime session state covering `session`, `turn`, `tool`, `approval`, and `progress` metadata;
- bounded pet events for accepted safe lifecycle signals;
- low-frequency pet speech for selected status changes;
- a reserved Plugins pane health-note summary in the form `X active · Y sessions · Z events`;
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
- drive semantic pet actions beyond `pet:event` and `pet:say`;
- claim final desktop-feel sign-off without manual acceptance.

## Privacy And Trust Boundary

The core rule is simple: the plugin may use raw local session data only long enough to derive safe state. It must store and display only a narrow sanitized representation.

Stored and displayed fields are limited to:

- session id hash;
- bounded status;
- bounded runtime phase;
- bounded event type;
- project basename plus short hash;
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
| `examples/plugins/agent-awareness/service/runtime-session.js` | Reconciles hook and poller events into one canonical runtime session shape. |
| `examples/plugins/agent-awareness/service/session-store.js` | Persists sanitized runtime session state in plugin-owned storage. |
| `examples/plugins/agent-awareness/service/state-mapper.js` | Maps canonical agent states into `pet:event` and rate-limited `pet:say`. |
| `examples/plugins/agent-awareness/service/agent-awareness-service.js` | Exposes `/health`, `/api/sessions`, dashboard assets, and token-gated `/api/events`. |
| `examples/plugins/agent-awareness/commands/doctor.js` | Reports sanitized setup and diagnostics. |
| `examples/plugins/agent-awareness/commands/codex-hook-plan.js` | Writes a read-only future-hook plan inside plugin-owned storage. |
| `examples/plugins/agent-awareness/web/dashboard/*` | Read-only dashboard for sanitized session status, diagnostics, and hook-plan state. |

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
node --test tests/scripts/run-agent-awareness-local-smoke.test.js
npm run check:docs-drift
```

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

- token, context, and cost aggregation;
- git status;
- current project and current session summary;
- recent task progress and hints;
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
