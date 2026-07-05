# Agent Awareness

Agent Awareness is a bundled OpenPet runtime plugin that reflects local AI coding-agent activity through bounded pet events, low-frequency pet speech, and a local dashboard.

## Documentation Guide

- Canonical development overview: [`../../../docs/agent-awareness-development-design.md`](../../../docs/agent-awareness-development-design.md)
- Implementation reference: [`../../../docs/agent-awareness-plugin-design.md`](../../../docs/agent-awareness-plugin-design.md)
- Real-session acceptance runbook: [`../../../docs/superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md`](../../../docs/superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md)

## MVP Scope

- Zero-config polling of local Codex session metadata under `~/.codex/sessions` and `~/.codex/archived_sessions`.
- Sanitized session storage under `OPENPET_DATA_DIR/sessions.json`.
- Explicit service start and stop through OpenPet's existing plugin lifecycle.
- A local dashboard and a read-only `codex-hook-plan` command for future hook setup guidance.

The MVP does not install Codex hooks, does not modify `~/.codex`, and does not store prompts, model responses, tool arguments, terminal transcript, stdout, stderr, or full local paths.

## Privacy Boundary

Stored and displayed data is intentionally narrow:

- session id hash;
- bounded status;
- bounded event type;
- project basename plus short hash;
- short sanitized status text when one exists;
- timestamp.

The plugin ignores raw content-bearing fields and only uses safe top-level lifecycle hints to derive pet-visible status.

Additional hardening in the current MVP:

- raw session ids are hashed before persistence or display;
- project paths are reduced to `basename + short hash`;
- `GET /health` does not expose plugin store paths or `codexHome`;
- poller `lastError` is sanitized before it leaves the service;
- the dashboard applies display-time redaction as defense in depth;
- command outputs avoid raw plugin-data paths and loopback URLs.

## Runtime

When the `agent-awareness` service is started, it exposes:

- `GET /health`
- `GET /api/sessions`
- dashboard at `/`

This bundled plugin is normally synchronized into OpenPet's plugin directory and enabled by default. Start the `agent-awareness` service explicitly from Control Center -> Plugins; the service does not auto-start.

## Commands

### `doctor`

Reports a sanitized snapshot of:

- plugin data-dir availability;
- Codex polling directory availability;
- hook-plan/token-file presence;
- service health;
- aggregate diagnostics such as session count, event count, ignored-content count, malformed count, and last scan time.

Safety rules:

- check values are reduced to safe labels such as `plugin-data-dir`, `codex:sessions`, `codex:archived_sessions`, `codex-hook-plan.md`, and `plugin-auth-file`;
- `serviceHealth` is reduced to `ok`, `url`, `statusCode`, and optional `error`;
- loopback URLs are redacted to `[local-url]`;
- no raw `serviceHealth.body` is returned.

### `codex-hook-plan`

Creates a review-only future-hook plan inside the plugin data directory:

- `agent-awareness-token.txt`
- `codex-hook-plan.md`

It does not modify `~/.codex`, install hooks, or write outside plugin-owned storage. Command-mode output intentionally returns safe labels such as `plugin-auth-file` and `codex-hook-plan.md` instead of raw local paths.

## Control Center Notes

- The Plugins pane can show a compact health note for the real bundled `openpet.agent-awareness` service in the form `X active · Y sessions · Z events`.
- That summary is reserved for `pluginId === openpet.agent-awareness` and `serviceId === agent-awareness`; other plugins do not inherit it by returning similarly shaped JSON.
- The first dashboard is read-only and focuses on sanitized session status, recent timeline, hook-plan state, and diagnostics.
