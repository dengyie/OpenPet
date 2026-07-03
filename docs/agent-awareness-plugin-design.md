# OpenPet Agent Awareness Bundled Plugin Design

This document describes the current design and implementation status of the
official bundled `openpet.agent-awareness` plugin.

Status:

- generic service-scoped bridge support is implemented in OpenPet core;
- `examples/plugins/agent-awareness/` now contains the bundled official plugin;
- Codex awareness is explicit and manual: OpenPet generates setup instructions
  but does not edit `~/.codex` or any external agent configuration;
- real Codex hook wiring and desktop feel validation remain Manual-required.

## Product Goal

OpenPet should reflect local AI coding-agent activity as pet state without
hardcoding Codex, Claude, Gemini, or other agent-specific behavior into core.

The pet can:

- receive bounded `agent:*` events through `PetService.setEvent`;
- speak short sanitized status messages through `PetService.say`;
- show recent sanitized agent sessions in a local dashboard.

The first adapter target is Codex. The plugin structure leaves room for future
adapters without changing OpenPet core again.

## Non-Goals

The current implementation intentionally does not add:

- `AgentRuntimeService` or agent-specific watchers in OpenPet core;
- automatic writes to `~/.codex`, `~/.claude`, or other agent config;
- raw prompt, tool input, terminal transcript, stdout/stderr, API key, or full
  path capture;
- creator bridge routes for long-running services;
- permission approval bubbles for agent tool calls;
- copied code or assets from Clawd on Desk or similar projects.

External projects may inform product direction, but implementation must remain
original and license-clean.

## Architecture

```text
Local agent hook/log source
  -> adapter-specific event normalizer
  -> openpet.agent-awareness service
  -> local ingest token check
  -> session store + state mapper
  -> service-scoped OpenPet bridge
  -> PetService.say / PetService.setEvent
  -> Agent Awareness dashboard
```

OpenPet core remains a platform:

- sync bundled official plugins;
- validate manifests;
- start/stop declaration services;
- inject service bridge credentials and plugin data/cache/log dirs;
- enforce bridge token lifetime and manifest permissions;
- route pet mutations through `PetService`.

Agent-specific behavior lives in the plugin:

- Codex hook instruction generation;
- Codex event normalization;
- session persistence;
- state-to-pet mapping;
- dashboard rendering;
- local ingestion token management.

## Current Package Layout

```text
examples/plugins/agent-awareness/
  plugin.json
  README.md
  commands/
    command-io.js
    codex-hook-plan.js
    install-codex-hooks.js
    uninstall-codex-hooks.js
    doctor.js
  service/
    agent-awareness-service.js
    bridge-client.js
    session-store.js
    state-mapper.js
    adapters/
      codex.js
  web/
    dashboard/
      index.html
      dashboard.js
      styles.css
```

The first version is dependency-free and uses Node built-ins only.

There is no `config.schema.json` in the current version. The host does not yet
inject saved plugin config into service processes, so exposing service config in
Control Center would create a misleading UI. Service configuration should be a
separate future milestone if needed.

## Manifest Contract

The bundled plugin declares:

- id: `openpet.agent-awareness`;
- profile: `runtime`;
- permissions: `pet:say`, `pet:event`;
- commands:
  - `install-codex-hooks`;
  - `uninstall-codex-hooks`;
  - `doctor`;
- service:
  - `agent-awareness`;
  - health URL `http://127.0.0.1:8795/health`;
- dashboard:
  - `http://127.0.0.1:8795`.

It does not request `pet:action` yet because the current state mapper does not
assume a stable action id exists in every pet pack.

## Service Contract

The service listens on loopback only:

```text
GET  /health
GET  /api/sessions
POST /api/events
GET  /
```

`POST /api/events` requires:

```text
Authorization: Bearer <OPENPET_DATA_DIR/ingest-token.txt>
Content-Type: application/json
```

The token is generated only when the user explicitly runs
`install-codex-hooks`. If the token is missing, ingestion fails closed and tells
the user to run the setup command.

## Event Contract

Accepted input is intentionally small:

```json
{
  "adapter": "codex",
  "sessionId": "local-session-id",
  "type": "turn.completed",
  "status": "completed",
  "message": "Tests passed",
  "cwd": "/path/to/project",
  "toolName": "shell"
}
```

Stored event fields:

| Input | Stored value |
| --- | --- |
| `adapter` | `codex` |
| `sessionId` | safe opaque id, or hash when unsafe |
| `type` | short sanitized event type |
| `status` | canonical status |
| `message` | short redacted text |
| `cwd` | basename plus hash, never full path |
| `toolName` | short sanitized name |
| `timestamp` | provided timestamp or service time |

Dropped fields include prompts, tool input, transcripts, stdout, stderr,
environment variables, credentials, and arbitrary nested payloads.

## State Mapping

Canonical statuses:

```text
idle
thinking
working
waiting
blocked
completed
failed
```

Every accepted event emits a bounded pet event:

```text
agent:<status>
```

Speech is rate-limited by session/status. The mapper speaks immediately when a
session status changes and suppresses repeated same-status messages until the
minimum interval passes.

## Codex Setup Strategy

Default behavior is zero-config local awareness. The Agent Awareness service
polls local Codex rollout JSONL metadata from:

```text
~/.codex/sessions
~/.codex/archived_sessions
```

This path does not require Codex hook trust. It intentionally ignores
`user_message`, `response_item`, function-call arguments, command output,
terminal transcripts, and full stored session content. It only derives bounded
status events such as `session.started`, `turn.started`, `turn.completed`, and
`failed`, which are then normalized through the same adapter boundary as HTTP
hook events.

The hook path remains an enhanced real-time mode:

`npm run configure-agent-awareness:codex` provides the local one-command Codex
setup path. It:

```text
~/.codex/hooks.json
~/.codex/hooks/openpet-agent-awareness.js
OPENPET_DATA_DIR/ingest-token.txt
OPENPET_DATA_DIR/codex-hooks.manual.md
```

The script preserves unrelated Codex hooks, replaces older OpenPet hook
handlers to stay idempotent, and backs up an existing `hooks.json` before
writing changes. The generated Codex hook sender reads the ingest token from
`OPENPET_DATA_DIR` at runtime; the token is not embedded in `hooks.json`.

Codex still requires reviewing and trusting the new hook with `/hooks` before it
runs. This is a Codex runtime trust gate, not an OpenPet limitation.

`install-codex-hooks` remains the manual setup helper and writes:

```text
OPENPET_DATA_DIR/ingest-token.txt
OPENPET_DATA_DIR/codex-hooks.manual.md
```

The generated Markdown contains a `curl` example with the local bearer token.
The command does not edit Codex config. The user must manually connect the
snippet to the current Codex hook mechanism.

`uninstall-codex-hooks` writes:

```text
OPENPET_DATA_DIR/codex-hooks.removal.md
```

It does not delete external Codex config because OpenPet did not create that
config automatically.

`doctor` verifies plugin data dir and setup artifact availability. It does not
mutate external files.

## Security And Privacy Requirements

Current implementation satisfies:

- service listens on `127.0.0.1`;
- ingestion is bearer-token gated;
- request body size is bounded;
- event payload is normalized before persistence;
- full cwd is reduced to basename plus hash;
- token-looking strings are redacted from messages;
- dashboard renders session fields with DOM text nodes, not `innerHTML`;
- service bridge token is separate from ingestion token and is never exposed to
  the dashboard;
- service bridge routes are only context/pet routes, never creator routes.

Residual risks:

- local processes that can read `OPENPET_DATA_DIR/ingest-token.txt` can submit
  sanitized events;
- real Codex hook format is Manual-required and not proven by tests;
- dashboard/UI experience has not had a real desktop feel review.

## Verification

Relevant automated checks:

```bash
node --test tests/examples/agent-awareness-plugin.test.js
node --test tests/main/main-scale-injection.test.js tests/services/bundled-plugin-sync-service.test.js
node --test tests/services/plugin-service.test.js tests/services/plugin-command-bridge-server.test.js tests/services/plugin-command-runner.test.js tests/plugins/plugin-bridge-docs.test.js
npm run check:syntax
git diff --check
```

## Future Backlog

- Inject saved plugin config into service processes through a generic host
  contract, then make service port/speech policy configurable.
- Add a real Codex hook fixture once the supported Codex hook schema is pinned.
- Add Claude/Gemini adapters as plugin-local modules.
- Add optional `pet:action` mapping only after action ids are configurable or
  discoverable.
- Add a richer dashboard setup/status panel after real hook validation.
