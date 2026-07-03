# Agent Awareness

Agent Awareness is an official bundled OpenPet extension that lets a local AI
coding agent report sanitized activity into OpenPet.

The extension is intentionally service-based. OpenPet core only starts/stops the
service and provides a small service bridge for pet speech/events. Codex-specific
hook guidance, event normalization, session storage, and dashboard state live in
this extension.

## Privacy Boundary

By default, the service works in zero-config mode: it scans local Codex rollout
JSONL metadata under `~/.codex/sessions` and `~/.codex/archived_sessions`.
This does not require Codex hook trust. It only derives session status, cwd
basename/hash, and timestamps; raw prompts, tool inputs, terminal transcripts,
stdout, and stderr are ignored.

The optional HTTP hook path accepts only a small event shape:

```json
{
  "adapter": "codex",
  "sessionId": "local-session-id",
  "type": "turn.completed",
  "status": "completed",
  "message": "Tests passed",
  "cwd": "/path/to/project"
}
```

Stored and displayed data is sanitized. The extension does not store raw prompts,
tool input, terminal transcripts, stdout, stderr, API keys, or full local paths.

## Codex Setup

No Codex setup is required for basic status awareness. Start the `Agent
Awareness Service` entry and open the dashboard.

For richer real-time hook events, run:

```sh
npm run configure-agent-awareness:codex
```

The script creates or updates `~/.codex/hooks.json`, installs a best-effort
sender at `~/.codex/hooks/openpet-agent-awareness.js`, and creates an ingestion
token at `OPENPET_DATA_DIR/ingest-token.txt`. It preserves unrelated Codex
hooks and backs up an existing `hooks.json` before changing it.

Preview changes without writing files:

```sh
npm run configure-agent-awareness:codex -- --dry-run
```

Codex requires reviewing and trusting new command hooks before they run. After
configuration, open a new Codex session and run `/hooks` once to trust the
OpenPet hook. This step is only for the hook-enhanced path, not for the default
zero-config scanner.

For manual setup instead, run the `Prepare Codex Hook Instructions` command from
Control Center. It writes manual setup notes into
`OPENPET_DATA_DIR/codex-hooks.manual.md` and creates an ingestion token at
`OPENPET_DATA_DIR/ingest-token.txt`. The command does not modify `~/.codex` or
any external agent config.

Start the `Agent Awareness Service` entry before sending hook events. The service
listens on `http://127.0.0.1:8795` and exposes:

- `GET /health`
- `GET /api/sessions`
- `POST /api/events` with `Authorization: Bearer <ingest token>`
- dashboard at `/`
