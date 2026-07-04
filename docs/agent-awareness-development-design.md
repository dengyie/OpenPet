# OpenPet Agent Awareness Development Design

> Date: 2026-07-03
> Branch: `codex/dev7`
> Purpose: summarize the current OpenPet baseline and define the next development route for ClaudePet-inspired agent awareness.

## Summary

OpenPet's next high-value product direction is agent awareness: the desktop pet should reflect local AI coding-agent activity without turning OpenPet core into a Claude, Codex, or tool-specific runtime.

The reference product direction is `liuchenlili/ClaudePet`: a desktop pet that visualizes Claude Code session state, hooks, status line data, token/cost/git/task information, permission waits, and per-session pet presence. OpenPet should absorb that companion value while preserving its own platform boundaries:

- `PetService` remains the single source of truth for pet state.
- User-facing configuration belongs in Control Center.
- API keys, raw prompts, transcripts, command output, and credentials stay out of renderer and ordinary plugin contexts.
- Agent-specific parsing and setup should live in a bundled official plugin first, not in OpenPet core.
- Agent events should degrade to safe speech/events when a pet pack cannot express richer behavior.

## Current OpenPet Baseline

The current trusted baseline is defined by:

- `docs/project-status-review.md`
- `docs/development-summary.md`
- `PROJECT-SUMMARY.md`
- `docs/openpet-current-todo-architecture.md`
- `docs/project-context.json`

The platform already includes:

- Electron transparent pet runtime with movement, speech bubbles, actions, pack switching, grounded movement, and home-anchor behavior.
- React + Vite Control Center with Pet, Actions, AI, Plugins, Catalog, Service, and About surfaces.
- Pet pack import/export, bundled read-only packs, Codex pet directory/zip import, and provenance tracking.
- AI Talk, Bubble Chat, desktop chat, persona/history/memory, provider diagnostics, and sanitized smoke evidence.
- Host-owned OpenAI-compatible chat/image provider settings with main-process secret storage.
- Creator Studio for prompt/task workflows, provider-backed generation, QA, import handoff, and trigger proposal submission.
- Plugin entries for setup, commands, services, dashboards, short-lived bridge access, creator-tools routes, health checks, logs, cleanup evidence, and submission evidence.
- Loopback-only Local HTTP/MCP.
- Release evidence tooling for packaged runtime, desktop picker, Windows smoke, macOS signing evidence, and signed closure reports.
- TypeScript contracts and regression coverage across IPC/view/service evidence boundaries.

Recent 2026-07-01 security/correctness baseline from `PROJECT-SUMMARY.md` also matters for this work:

- plugin VM escape hardening;
- native execution approval gate for `entries.commands`, `entries.services`, and `entries.setup`;
- trigger rule contract fixes;
- atomic `settings.ai` updates;
- EventBus listener isolation;
- `safeStorage` encryption for API keys;
- DNS rebinding/SSRF protection;
- window navigation locks;
- memory count limits.

Agent awareness must build on these boundaries rather than reopening them.

## ClaudePet Comparison

ClaudePet is strongest as an agent-session companion:

- Claude Code status line and hooks integration.
- Session/task state visible through a desktop pet.
- Permission waiting, tool/task progress, git state, token and cost visibility.
- Session details panel and usage statistics.
- Per-session pet identity.
- CLI tooling for installation, diagnostics, startup, and pet management.

OpenPet is already broader as a platform, but it lacks a first-class agent-session awareness loop. The gap is not pet rendering, AI provider support, or plugin infrastructure. The gap is the product connection between local coding-agent activity and pet behavior.

## Product Goal

Deliver a bundled `openpet.agent-awareness` experience that makes OpenPet feel present during local AI coding sessions.

The first milestone should answer:

- What is the current coding agent doing?
- Is it idle, thinking, working, waiting for approval, blocked, failed, or done?
- Which project/session is active, without revealing full paths or transcripts?
- Can the pet quietly communicate status through speech, events, and eventually semantic actions?
- Can users inspect recent sanitized activity in Control Center or a plugin dashboard?
- Can users enable/disable the integration and tune noisiness?

## Confirmed MVP Contract

The first milestone is a Codex status-awareness MVP, not full ClaudePet parity.

Confirmed decisions:

- ship as a bundled official plugin named `openpet.agent-awareness`;
- make the plugin visible and runnable through existing plugin surfaces, but do not auto-start its service;
- prefer zero-config Codex polling as the default data source;
- keep hook mode optional and non-default;
- use `pet:event` for every accepted safe status event;
- use `pet.say` only for low-frequency, high-value state changes;
- keep the first dashboard mostly read-only;
- avoid persistent plugin configuration in MVP;
- hash session identifiers before storage or display;
- store/display project identity as `basename + short hash`, never full path;
- scan only default Codex directories in MVP;
- request only `pet:say` and `pet:event` bridge permissions;
- keep token/cost/git statistics, per-session pet identity, semantic actions, and persistent noise controls for follow-up milestones.

MVP success is recognized when a user can explicitly start the bundled plugin, run a local Codex session, see sanitized session status in the dashboard, and observe bounded pet events/speech for meaningful state transitions without exposing prompts, transcripts, command output, credentials, or full paths.

## Bundling And Discovery Contract

OpenPet currently has two official-plugin shapes:

- in-memory official plugins passed to `createPluginService({ officialPlugins })`, such as `createBasicBehaviorPlugin()`;
- bundled local plugin directories synchronized into the user's plugin directory through `syncBundledPlugins`, such as `examples/plugins/creator-studio`.

Agent Awareness should use the bundled local plugin directory shape, not the in-memory official plugin shape. It needs service, dashboard, command files, local data directories, and native process lifecycle support, so the correct source of truth is:

```text
examples/plugins/agent-awareness/
```

Phase 1 implementation must update the bootstrap bundling list in `src/main/bootstrap/create-plugin-services.js` so `syncBundledPlugins` receives both:

```text
examples/plugins/creator-studio
examples/plugins/agent-awareness
```

Expected runtime result:

- the plugin is copied/synchronized into `app.getPath('userData')/plugins`;
- `PluginService` discovers it from the normal `pluginDirs: [pluginDir]` path;
- `PluginViewState.source` remains the local/bundled-directory path used by synchronized bundled plugins, unless a later core change introduces an explicit `bundled` source label;
- the plugin is visible in Control Center Plugins surfaces;
- the plugin is enabled by default through bundled sync unless existing settings explicitly disable it, but its service remains stopped until the user starts it;
- service start still requires the same explicit user/native-execution approval path as other local service entries.

Tests should prove:

- the bundling list includes Agent Awareness;
- `syncBundledPlugins` can synchronize the package without deleting unrelated user plugins;
- the synchronized plugin is discoverable through `PluginService`;
- the service does not start during install, enable, or app boot;
- native execution approval is required before starting the service.

## Non-Goals

Do not implement these in the first milestone:

- Do not make OpenPet core parse Claude/Codex internal logs directly.
- Do not capture raw prompts, tool input, terminal transcripts, stdout/stderr, environment variables, secrets, or full absolute paths.
- Do not implement direct permission approval or tool approval inside the pet UI.
- Do not auto-modify `~/.codex`, `~/.claude`, or other agent config from OpenPet core.
- Do not claim full sandboxing for agent hooks or local process integrations.
- Do not copy code, assets, or implementation details from ClaudePet or other projects.
- Do not require every pet pack to support agent-specific actions before the feature is useful.

## Architecture

Recommended shape:

```text
Agent source
  -> adapter-specific collector
  -> normalized agent event
  -> bundled agent-awareness plugin service
  -> session store + redaction + state mapper
  -> service-scoped OpenPet bridge
  -> PetService.say / PetService.setEvent
  -> dashboard or Control Center surface
```

OpenPet core owns:

- bundled official plugin synchronization;
- manifest validation and native execution approval;
- command/service start/stop lifecycle;
- bridge credential injection;
- plugin data/cache/log directories;
- permission enforcement;
- pet state mutation through `PetService`.

The plugin owns:

- Codex/Claude adapter logic;
- hook or polling setup guidance;
- event normalization;
- redaction;
- session storage;
- state-to-pet mapping;
- dashboard rendering;
- local diagnostics.

## Proposed Plugin Package

Target layout:

```text
examples/plugins/agent-awareness/
  plugin.json
  README.md
  commands/
    command-io.js
    codex-hook-plan.js
    doctor.js
    # Phase 2 only:
    # install-codex-hooks.js
    # uninstall-codex-hooks.js
  service/
    agent-awareness-service.js
    bridge-client.js
    session-store.js
    state-mapper.js
    adapters/
      codex.js
      codex-rollout-poller.js
  web/
    dashboard/
      index.html
      dashboard.js
      styles.css
```

Initial manifest profile:

- id: `openpet.agent-awareness`;
- profile: `runtime`;
- permissions: `pet:say`, `pet:event`;
- commands: doctor and optional hook plan;
- service: loopback-only health and dashboard;
- dashboard: local HTTP dashboard.

Avoid `pet:action` until the host has a stable semantic action resolver. Guessing raw action IDs per pack will be brittle.

Do not include hook install/uninstall commands in the MVP unless the milestone is explicitly expanded. Hook installation writes outside OpenPet's plugin data directory, so it belongs to Phase 2 after the polling MVP proves value and after the trust/rollback UX is reviewed.

## Event Contract

The normalized event shape should stay intentionally small:

```json
{
  "adapter": "codex",
  "sessionId": "sessionHash12",
  "type": "turn.completed",
  "status": "completed",
  "message": "Codex completed a turn",
  "project": "OpenPet #a1b2c3",
  "toolName": "shell",
  "timestamp": "2026-07-03T12:00:00.000Z"
}
```

Canonical statuses:

- `idle`
- `thinking`
- `working`
- `waiting`
- `blocked`
- `completed`
- `failed`

Stored fields must be sanitized:

- `sessionId`: always a stable hash, never the original local session id.
- `project`: basename plus short hash, never full path.
- `message`: short redacted status text only.
- `toolName`: short safe identifier.
- `timestamp`: provided timestamp or service time.

Dropped fields:

- prompts;
- model responses;
- tool arguments;
- command output;
- stdout/stderr;
- terminal transcript;
- environment variables;
- credentials;
- arbitrary nested payloads;
- full filesystem paths.

The implementation should treat raw session ids and raw `cwd` values as transient input only. They may be used to compute stable hashes in memory, but they must not be written to the session store, dashboard payloads, logs, or command output.

Hashing rules:

- use SHA-256 over a typed prefix plus the raw value, for example `openpet-agent-session\0${rawSessionId}`;
- truncate display hashes to 12 lowercase hex characters for sessions;
- truncate project/path display hashes to 6 lowercase hex characters;
- keep hashes stable across app restarts so the dashboard can correlate recent sessions;
- do not salt the MVP hashes unless a future migration also updates correlation and tests.

Example:

```text
raw session id -> sha256("openpet-agent-session\0" + rawSessionId).slice(0, 12)
raw cwd        -> basename(rawCwd) + " #" + sha256("openpet-agent-project\0" + rawCwd).slice(0, 6)
```

## State Mapping

First milestone mapping:

| Agent status | Pet event | Speech style |
| --- | --- | --- |
| `idle` | `agent:idle` | usually silent |
| `thinking` | `agent:thinking` | short "thinking" message, rate-limited |
| `working` | `agent:working` | short task progress message |
| `waiting` | `agent:waiting` | permission/input wait message |
| `blocked` | `agent:blocked` | concise blocked reason if sanitized |
| `completed` | `agent:completed` | short completion summary |
| `failed` | `agent:failed` | short failure notice |

Speech must be rate-limited by session and status. Repeated same-status events should update dashboard state without constantly triggering bubbles.

Default speech policy:

- `idle`: silent;
- `thinking`: first transition only, then heavily rate-limited;
- `working`: first transition only, then heavily rate-limited;
- `waiting`: speak on transition;
- `blocked`: speak on transition;
- `completed`: speak on transition;
- `failed`: speak on transition.

The exact rate-limit constants can be tuned during implementation, but the tests should prove repeated same-status events do not produce repeated speech calls.

Initial rate-limit constants:

- `idle`: never speak;
- `thinking`: at most once per session every 5 minutes;
- `working`: at most once per session every 5 minutes;
- `waiting`: once per transition into `waiting`;
- `blocked`: once per transition into `blocked`;
- `completed`: once per transition into `completed`;
- `failed`: once per transition into `failed`;
- identical event fingerprint suppression: no repeated speech for the same `(sessionHash, status, type, projectHash)` within 10 minutes.

These constants are implementation defaults, not product promises. They should be kept in the mapper module where tests can assert them.

## Codex Integration Strategy

Use Codex as the first adapter because the current development workflow is Codex-centered.

Phase 1 should support zero-config polling where possible:

- read bounded local session metadata from known Codex session directories;
- ignore raw messages and tool content;
- derive safe lifecycle events such as session started, turn started, turn completed, failed, and approval requested.

MVP polling scope is limited to:

```text
~/.codex/sessions
~/.codex/archived_sessions
```

Do not support custom paths in the MVP. Missing directories, unreadable files, malformed JSONL records, unknown event shapes, and partially written files should fail soft: skip the bad input, increment a sanitized diagnostic counter, and keep the service running.

The poller must not parse or retain:

- `user_message`;
- assistant response content;
- function-call arguments;
- shell command text;
- command stdout/stderr;
- terminal transcripts;
- environment variables.

Allowed polling inputs:

- file path only for deriving a raw session identity and project label in memory;
- file `mtimeMs`, size, and existence;
- JSONL record timestamps when present;
- JSONL top-level event/type/name/status fields when they are primitive strings;
- JSONL top-level cwd/workspace/project path fields only as transient input to compute `basename + hash`;
- top-level approval/waiting/error/completed indicators when they are primitive booleans or short primitive strings.

Disallowed polling inputs:

- nested payload objects;
- message arrays;
- text/content fields;
- arguments/input/output/result fields;
- environment/config dumps;
- command strings;
- full raw file paths in stored diagnostics.

Derived status rules for MVP:

| Observed safe signal | Derived status | Event type |
| --- | --- | --- |
| new session file or unseen session id | `idle` | `session.discovered` |
| top-level turn/start event | `thinking` | `turn.started` |
| top-level tool/call/run event without arguments | `working` | `tool.started` |
| top-level approval/waiting signal | `waiting` | `approval.requested` |
| top-level blocked/error signal | `blocked` or `failed` | `turn.blocked` / `turn.failed` |
| top-level completed/done signal | `completed` | `turn.completed` |
| no fresh safe events but recent mtime changed | `working` | `session.updated` |

Unknown records should not become speech. `unknownRecordCount` should represent only truly unclassified records, while known-safe drops should stay in dedicated counters such as ignored content-bearing records, ignored metadata records, and unsupported lifecycle records so troubleshooting stays actionable without storing raw content.

Phase 2 can add optional hook-enhanced realtime mode:

- provide a command that writes or updates user-reviewed hook files;
- preserve unrelated hooks;
- create backups before writing;
- require user trust through the agent's normal hook approval flow;
- generate manual setup instructions when automatic configuration is unsafe.

OpenPet core should not write those files directly. The bundled plugin command can do it only after explicit user action and native execution approval.

MVP commands:

- `doctor`: reports sanitized polling directories, native-execution approval state, service health, event counts, malformed/unknown record counts, hook-plan/token presence, and sanitized poller diagnostics;
- `codex-hook-plan`: creates a review-only future-hook plan inside the plugin data dir without modifying `~/.codex`.

Phase 2 commands:

- `install-codex-hooks`;
- `uninstall-codex-hooks`;
- any one-command configure script that writes `~/.codex`.

The MVP should not add `scripts/configure-agent-awareness-codex.js`. That script is Phase 2 unless explicitly requested as a hook-planning-only command that does not write outside the repo or plugin data dir.

## Control Center And Dashboard

Initial surface can be a plugin dashboard because the plugin system already supports local dashboards.

Dashboard should show:

- active sessions;
- current status;
- last sanitized event;
- project label, not full path;
- recent timeline;
- health and adapter diagnostics;
- hook installation state;
- plan/token readiness state for future hook mode;
- event counts and last update time.

Dashboard v1 is read-only for persisted state. It may include runtime-only controls such as refresh, temporary mute, or temporary session focus, but those controls should reset when the service/dashboard restarts.

Control Center integration should eventually expose these controls, but only the existing generic enable/disable, service start/stop, dashboard open, and command-run surfaces are MVP-relevant:

- enable/disable agent awareness;
- grant native execution approval when required by the host;
- start/stop service;
- run doctor;
- run the read-only hook-plan command;
- open dashboard;

Do not expose raw logs or transcripts in renderer.

Current MVP hardening that the docs and UI should reflect:

- `GET /health` sanitizes poller `lastError` before returning `codexPoller` and `diagnostics`;
- dashboard rendering performs its own display-time redaction as defense in depth;
- Plugins pane health notes use a dedicated `X active · Y sessions · Z events` summary only for the real bundled `openpet.agent-awareness` / `agent-awareness` target;
- other plugins fall back to generic `OK` / `HTTP nnn` health notes even if they return lookalike JSON.

Persistent controls such as speech noisiness, status filters, session pinning, and custom polling paths are Phase 2+ work. They should wait for an explicit plugin configuration path instead of being smuggled into ad hoc service files.

First-run user flow for MVP:

1. Open Control Center -> Plugins.
2. Find the synchronized `openpet.agent-awareness` plugin.
3. Confirm the plugin is enabled. If a previous local setting disabled it, re-enable it.
4. Grant native execution approval for this plugin if the current host requires approval before service start.
5. Start the `agent-awareness` service explicitly.
6. Open the dashboard.
7. Run `doctor` if the dashboard reports no Codex polling signal.

The plugin must not start polling before the explicit service start step.

## Semantic Pet Behavior Follow-Up

The richer companion milestone should introduce a host-stable semantic behavior contract:

```text
agent event/status
  -> plugin state mapper
  -> semantic pet behavior
  -> host resolves semantic to current pet-pack action
  -> fallback to pet:event + pet:say
```

Candidate semantic behaviors:

- `idle`
- `thinking`
- `working`
- `waiting`
- `completed`
- `failed`

Design constraints:

- semantics belong to a host contract;
- plugins must not guess arbitrary action IDs;
- pet packs may optionally declare semantic action mappings;
- missing mappings degrade cleanly;
- multiple sessions require explicit priority/arbitration before they can drive one pet.

Open question: the resolver could live in `PetService`, `ActionService`, or a small adapter layer. Prefer the smallest host-owned adapter that keeps `PetService` as the state ingress and avoids action-specific logic leaking into plugins.

## Multi-Session Model

ClaudePet emphasizes per-session pet presence. OpenPet should approach this carefully.

Milestone 1:

- one active agent-awareness service;
- many tracked sessions in dashboard;
- the most-recent active session drives pet speech/events by default;
- any dashboard focus/mute controls are temporary runtime state only.

Milestone 2:

- explicit active-session priority model;
- user-selectable session focus;
- dashboard controls to pin/mute sessions.

Milestone 3:

- optional multi-pet or per-session visual identity exploration.

Do not make multi-session behavior implicit. Multiple agents fighting over one desktop pet will feel chaotic.

## Privacy And Trust Rules

Agent awareness must be privacy-first:

- full paths become project labels plus hashes;
- session ids become stable hashes;
- prompts and responses are never stored by the plugin;
- tool arguments and command output are never stored;
- credentials and environment variables are never captured;
- hook installation, when implemented, is explicit and reversible;
- dashboard data is local and loopback-only;
- bridge tokens are short-lived or service-scoped according to existing host rules;
- all pet mutations still go through OpenPet host services.

Retention should be deliberately small in the MVP. Use a rolling local store, with an initial target of at most 100 sessions or 1,000 events, whichever limit is reached first. Retention exists for dashboard usefulness and diagnostics only; it is not an audit log.

Retention eviction rules:

- events are kept newest-first globally and evicted oldest-first when the 1,000 event limit is exceeded;
- sessions are sorted by latest event timestamp and evicted oldest-inactive-first when the 100 session limit is exceeded;
- evicting a session also evicts that session's events;
- diagnostics may keep aggregate counters after eviction, but not raw evicted identifiers.

## Development Phases

### Phase A: Documentation And Baseline

- Add this development design.
- Link it from `docs/README.md`.
- Keep current release and safety claims unchanged.
- Re-check the previous `agent-awareness` stash before implementation.

Exit criteria:

- maintainers have one current route document;
- no runtime code changes yet.

### Phase B: Restore Or Rebuild Bundled Plugin

- Add `examples/plugins/agent-awareness/`.
- Add manifest, service, dashboard, command helpers, Codex adapter, session store, and state mapper.
- Keep dependencies to Node built-ins.
- Use `pet:say` and `pet:event` only.
- Start from the old `stash@{0}` files only where they still match the current security baseline; otherwise rebuild cleanly.
- Add the plugin directory to the existing `syncBundledPlugins` list in `src/main/bootstrap/create-plugin-services.js`.

Exit criteria:

- plugin validates;
- bundled sync includes the plugin;
- synchronized plugin discovery is covered;
- service starts/stops through existing plugin lifecycle;
- health endpoint works;
- dashboard renders sanitized sessions;
- no raw sensitive fields stored.

### Phase C: Codex Setup And Diagnostics

- Add `doctor` and `codex-hook-plan` command entries.
- Keep `codex-hook-plan` read-only with respect to external agent config: it may write plan/token files inside plugin-owned data storage, but it must not write `~/.codex`.
- Keep hook installation optional, explicit, and out of MVP implementation unless the milestone is expanded.

Exit criteria:

- doctor reports service health, polling directory status, native-execution approval state, event counts, malformed/unknown record counts, and hook-plan/token readiness with safe labels rather than raw paths;
- doctor reduces service-health output to `ok`, `url`, `statusCode`, and optional `error`, without surfacing raw health bodies;
- hook plan output documents future setup without modifying external agent config and keeps command-mode path outputs redacted behind stable labels;
- no command writes outside plugin-owned data/cache/log directories in MVP.

### Phase C2: Hook Setup Follow-Up

This is a follow-up phase, not MVP.

- Add `scripts/configure-agent-awareness-codex.js` or equivalent command entry if a top-level helper remains useful.
- Add install/uninstall hook commands.
- Preserve unrelated hooks and create backups.
- Generate manual instructions for trust review.

Exit criteria:

- repeated setup is idempotent;
- uninstall removes only OpenPet-managed hook entries;
- external config writes are reviewed, reversible, and documented;
- real Codex hook trust is manually validated.

### Phase D: Regression Coverage

- Add tests for manifest validation and plugin package shape.
- Add tests for event redaction and state mapping.
- Add tests for no raw prompt/tool/output persistence.
- Add tests for raw session id hashing and raw path redaction.
- Add tests for malformed polling input failing soft.
- Add tests for speech rate limiting.
- Add tests for retention limits.
- Add tests for bundled sync/discovery and no auto-start.
- Add tests for native execution approval being required before service start.
- Add sanitized Codex JSONL fixture tests that prove only allowed top-level fields are used.

Phase 2 follow-up tests:

- add tests for Codex hook config idempotency;
- add tests for preserving unrelated hook entries;
- add tests for uninstall removing only OpenPet-managed hook entries.

Suggested commands:

```bash
npm run test:core
npm run test:tools
npm run check:syntax
```

### Phase E: Human Desktop Validation

Automation-assisted baseline now exists:

- `npm run run-agent-awareness-local-smoke -- --codex-home <dir>` starts the bundled service logic against a local Codex home, writes a redacted result with sanitized session samples, hook-plan readiness, diagnostics, redaction checks, and a `manualAcceptanceTemplate`, and fails non-zero when no sanitized session signal is detected.
- `npm run update-agent-awareness-local-smoke-report -- <report.json> ...` updates `manualAcceptanceTemplate` in an archived smoke report, rewrites the archive README, refreshes any existing archive summary JSON, and rejects raw paths, loopback URLs, and secret-like text so manual review cannot quietly weaken the privacy boundary.
- `docs/superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md` is the current acceptance runbook for combining that smoke path with remaining human desktop review.

Manual-required:

- run the real Codex smoke path against a live local Codex home and then exercise the desktop app against the same real session signal;
- trust hooks through the normal Codex flow if hook mode is used;
- verify pet speech frequency is useful and not noisy;
- verify dashboard data is sanitized;
- verify service start/stop and disable behavior.

## Current Implementation Snapshot

Current `codex/dev7` status after the MVP implementation pass:

- Phase A is complete:
  - this design doc exists;
  - `docs/README.md` links to it.
- Phase B is complete for the polling-first MVP:
  - `examples/plugins/agent-awareness/` exists with manifest, service, adapter, store, mapper, commands, and dashboard assets;
  - `src/main/bootstrap/create-plugin-services.js` synchronizes the bundled plugin beside Creator Studio;
  - the bundled plugin is enabled by default through sync, but its service remains stopped until explicit start;
  - service start still requires native execution approval.
- Phase C is complete for the polling-first MVP:
  - `doctor` and `codex-hook-plan` are implemented;
  - `codex-hook-plan` remains read-only with respect to `~/.codex`, while creating only plugin-owned token/plan files under the plugin data dir;
  - bearer-token protection is supported for `POST /api/events` when a local token file exists.
- Phase D is materially complete for the MVP scope:
  - focused Node tests cover manifest shape, redaction, state mapping, retention, diagnostics, bundled sync, no auto-start, native approval gating, dashboard rendering, command-output safety, `/health` poller-error sanitization, health-summary safety, and the real-session smoke entrypoint contract.
- Phase E is only partially complete:
  - the real-session smoke/runbook path now reduces live Codex validation to a repeatable asset, but desktop/manual validation still remains required for perceived speech noisiness and overall dashboard usefulness in the full desktop app.

Known verification limits in the current environment:

- focused Node regressions pass for the agent-awareness feature set;
- focused browser/dashboard verification now exists in repo tests, but a human still needs to judge real-session usefulness and noise in the desktop app;
- the smoke script proves sanitized signal and hook-plan readiness, not that dashboard usefulness or pet speech feels right to a human.

## Acceptance Checklist

- Agent awareness ships as a bundled official plugin, not hardcoded core logic.
- The bundled plugin is synchronized and enabled by default, but its service does not auto-start.
- The plugin can start, stop, and report health through current OpenPet plugin runtime.
- The plugin can ingest or derive safe Codex status events.
- Pet speech/events go through host bridge permissions and `PetService`.
- Dashboard shows useful sanitized session status.
- MVP commands do not write external Codex config.
- Hook setup, when implemented in Phase 2, is explicit, reversible, idempotent, and backup-safe.
- Tests cover redaction, mapping, setup, and package shape.
- Tests prove no raw session ids, raw paths, prompts, transcripts, tool arguments, or command output are persisted or surfaced.
- Documentation states what is proven and what remains Manual-required.

## Risks

- Agent log formats may change; adapters must fail soft.
- Hook setup may vary across agent versions; doctor output must be clear.
- Speech can become noisy; rate limiting and mute controls are product requirements.
- Rich action mapping can break across pet packs; semantic behavior should wait for a host contract.
- Capturing too much data would violate OpenPet's trust posture; redaction must be tested.
- Polling may be less real-time than hook mode; the MVP accepts that trade-off for safety and reversibility.
- Without persistent configuration, users cannot permanently tune noise until Phase 2.

## Recommended Next Task For `codex/dev7`

The MVP baseline now exists. The highest-value next task is to finish verification and then choose the next product increment deliberately:

1. Run `npm run run-agent-awareness-local-smoke -- --codex-home <dir>` against fresh local Codex evidence and review the redacted result.
2. Manually validate the same real Codex session in the desktop app against the privacy boundary:
   - no full paths in dashboard or health payloads;
   - no unsanitized poller `lastError` values in dashboard or `/health`;
   - no prompt, stdout/stderr, or tool-argument leakage;
   - pet speech is useful and not noisy.
3. Record that manual review back into the archived report with `npm run update-agent-awareness-local-smoke-report -- <report.json> ...` so the evidence archive carries the human acceptance decision instead of a blank placeholder.
4. Keep the existing Control Center build and Playwright agent-awareness slice green when frontend/toolchain changes land.
5. Decide the next milestone:
   - richer Control Center summary for agent-awareness;
   - semantic pet behavior mapping in host core;
   - optional hook install/uninstall Phase 2;
   - broader safe lifecycle mapping for new Codex rollout records.

This keeps the ClaudePet-inspired companion loop grounded in verified behavior instead of letting the roadmap drift ahead of the proven baseline.
