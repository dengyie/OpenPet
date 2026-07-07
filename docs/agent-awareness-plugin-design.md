# OpenPet Agent Awareness Implementation Reference

> Date: 2026-07-05
> Scope: shipped implementation map for the bundled `openpet.agent-awareness` plugin

This document is the maintainer-facing implementation companion for Agent Awareness. For product scope, current baseline, privacy boundary, and roadmap, start with [`docs/agent-awareness-development-design.md`](./agent-awareness-development-design.md).

## Canonical Doc Roles

| Doc | Role |
| --- | --- |
| [`agent-awareness-development-design.md`](./agent-awareness-development-design.md) | Canonical overview and current development route. |
| [`superpowers/specs/2026-07-05-agent-awareness-claudepet-parity-design.md`](./superpowers/specs/2026-07-05-agent-awareness-claudepet-parity-design.md) | Forward-looking parity roadmap for the next major milestone set. |
| [`../examples/plugins/agent-awareness/README.md`](../examples/plugins/agent-awareness/README.md) | Shipped plugin runtime contract and operator-facing behavior. |
| [`superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md`](./superpowers/specs/2026-07-03-agent-awareness-real-codex-acceptance-runbook.md) | Real-session smoke and manual desktop acceptance. |

## What This Doc Covers

This file exists to answer three practical maintainer questions:

1. Which files make up the shipped Agent Awareness surface?
2. Which core modules outside the plugin package participate in that surface?
3. Which helper files are present in the repo but are not part of the current official contract?

## Shipped Package Layout

```text
examples/plugins/agent-awareness/
  config.schema.json
  plugin.json
  README.md
  commands/
    command-io.js
    codex-hook-config.js
    codex-hook-plan.js
    doctor.js
    install-codex-hooks.js
    uninstall-codex-hooks.js
  service/
    agent-awareness-service.js
    bridge-client.js
    git-summary.js
    runtime-session.js
    session-store.js
    state-mapper.js
    usage-summary.js
    adapters/
      codex.js
      codex-hook.js
      codex-rollout-poller.js
  web/
    dashboard/
      index.html
      dashboard.js
      styles.css
```

## Current Official Runtime Surface

The current official, user-visible plugin surface is whatever is declared in [`examples/plugins/agent-awareness/plugin.json`](../examples/plugins/agent-awareness/plugin.json).

That means the active contract today is:

- plugin id `openpet.agent-awareness`
- permissions `pet:say`, `pet:event`
- config field `autoStartOnCodexSignal` (default `false`)
- commands `doctor`, `codex-hook-plan`, `install-codex-hooks`, `uninstall-codex-hooks`
- service `agent-awareness`
- dashboard `main`

Anything not exposed from `plugin.json` should not be treated as current product behavior, even if helper code exists on disk.

## File Responsibilities

### Plugin Package

| Path | Responsibility |
| --- | --- |
| `examples/plugins/agent-awareness/config.schema.json` | Declares the explicit auto-start opt-in field exposed through the Control Center. |
| `examples/plugins/agent-awareness/plugin.json` | Defines the authoritative manifest surface. |
| `examples/plugins/agent-awareness/README.md` | Documents the shipped plugin behavior, privacy boundary, and operator notes. |
| `examples/plugins/agent-awareness/commands/codex-hook-config.js` | Owns reversible hook install/uninstall logic shared by plugin commands and the repo helper script. |
| `examples/plugins/agent-awareness/commands/doctor.js` | Produces sanitized setup and health diagnostics. |
| `examples/plugins/agent-awareness/commands/codex-hook-plan.js` | Writes the read-only future hook plan and plugin-owned token file. |
| `examples/plugins/agent-awareness/commands/install-codex-hooks.js` | Installs bounded OpenPet-owned Codex hook handlers and writes hook install state. |
| `examples/plugins/agent-awareness/commands/uninstall-codex-hooks.js` | Removes only the OpenPet-owned Codex hook handlers and clears hook install state. |
| `examples/plugins/agent-awareness/service/agent-awareness-service.js` | Hosts `/health`, `/api/sessions`, `/api/events`, and dashboard assets. |
| `examples/plugins/agent-awareness/service/adapters/codex-rollout-poller.js` | Reads bounded Codex rollout JSONL signal and counts ignored/unknown/malformed records. |
| `examples/plugins/agent-awareness/service/adapters/codex.js` | Sanitizes rollout events, hashes session ids, and redacts project paths. |
| `examples/plugins/agent-awareness/service/adapters/codex-hook.js` | Maps bounded hook payloads into the shared runtime-event shape. |
| `examples/plugins/agent-awareness/service/git-summary.js` | Derives safe branch, dirty, ahead, and behind metadata from a local cwd without storing the cwd. |
| `examples/plugins/agent-awareness/service/usage-summary.js` | Normalizes safe token/context/cost metadata from hook and rollout events for per-session and aggregate diagnostics. |
| `examples/plugins/agent-awareness/service/runtime-session.js` | Reconciles hook and poller events into one canonical runtime session model with bounded current-step and metadata-derived progress summaries. |
| `examples/plugins/agent-awareness/service/session-store.js` | Persists bounded runtime session summaries to plugin-owned storage. |
| `examples/plugins/agent-awareness/service/state-mapper.js` | Emits `agent:<status>` events and rate-limited speech. |
| `examples/plugins/agent-awareness/web/dashboard/*` | Renders the read-only dashboard using display-time redaction, including aggregate usage tokens/cost/context, dedicated `view=stats` daily totals from sanitized history, per-session usage, git, current-step, recent-progress, and generated session-summary metadata, bounded `view=details&sessionId=<sanitized-id>` focus, and per-session `Focus` links. |

### Core Touchpoints Outside The Plugin

| Path | Responsibility |
| --- | --- |
| `src/main/bootstrap/create-plugin-services.js` | Includes Agent Awareness in bundled plugin sync. |
| `src/main/services/bundled-plugin-sync-service.js` | Copies the bundled plugin into the user's plugin directory while preserving user plugins. |
| `src/main/services/plugin-service.js` | Requires native execution approval before service start, owns explicit Codex-signal auto-start gating, and formats the reserved `X active · Y sessions · Z events` health note plus Agent Awareness-only health details for the real bundled service. |
| `src/main/services/plugin-command-runner.js` | Applies command-output redaction rules used by Agent Awareness command responses. |
| `src/control-center/src/hooks/usePluginsPane.ts` + `src/control-center/src/panes/PluginsPane.tsx` | Provide the first-class `查看 Codex 详情` Control Center entry, reuse the shared dashboard deep-link path, and render the compact Agent Awareness-native detail summary when reserved health details are available. |
| `src/main/pet-bubble-chat-preload.js` + `src/main/pet-bubble-chat/renderer.js` | Provide the pet-side `Codex 详情` quick-open entry from Bubble Chat using the same bounded dashboard route. |
| `package.json` | Preserves the runtime bundle inclusion and helper script entrypoints. |

## Non-Canonical Helper Paths

There are a few files that exist for development convenience or for future roadmap work but are not part of the current manifest-declared runtime surface.

### Repository Helper Script

`scripts/configure-agent-awareness-codex.js` now reuses the same shared hook-config library as the shipped plugin commands. That keeps local operator scripting aligned with the manifest contract without making the repo helper itself part of the plugin runtime surface.

Before reviving any of these paths as official surface area, update all of the following together:

- `plugin.json`
- `examples/plugins/agent-awareness/README.md`
- `docs/agent-awareness-development-design.md`
- `docs/superpowers/specs/2026-07-05-agent-awareness-claudepet-parity-design.md`
- acceptance runbook and evidence expectations
- relevant runtime and docs-drift tests

## Test Map

| Test file | What it protects |
| --- | --- |
| `tests/examples/agent-awareness-plugin.test.js` | Manifest contract, sanitization, hook normalization, rollout polling, visible metadata extraction, runtime session store, service behavior, and the full hook command surface. |
| `tests/services/agent-awareness-plugin-service.test.js` | Plugin discovery, native execution approval, Codex-signal auto-start gating, health-note formatting, command redaction, and command results. |
| `tests/services/agent-awareness-bundled-integration.test.js` | Bundled sync behavior, enabled-by-default discovery, config-backed auto-start opt-in, stopped-by-default service state, and start/stop lifecycle. |
| `tests/examples/agent-awareness-dashboard.test.js` | Dashboard state rendering, usage stats, and redaction logic. |
| `tests/examples/agent-awareness-dashboard-browser.test.js` | Browser-level dashboard smoke against the real local service. |
| `tests/control-center/control-center-smoke.spec.js` | Control Center Agent Awareness approval gating, native health detail summary, and the first-class detail entry surface. |
| `tests/main/pet-bubble-chat-renderer.test.js` | Pet-side quick-open button behavior for the Bubble Chat detail entry. |
| `tests/scripts/run-agent-awareness-local-smoke.test.js` | Real-session smoke runner output shape and redaction checks. |
| `tests/scripts/check-docs-drift.test.js` | Live-doc truth baseline for Agent Awareness terminology and indexed docs. |

## Update Checklist

When touching Agent Awareness behavior, walk this checklist before calling the work complete:

1. Does `plugin.json` still match the README and the tests?
2. Does the change preserve the privacy boundary described in the canonical development doc?
3. If the command or service surface changed, did you update `doctor` / `codex-hook-plan` / hook install-uninstall documentation and tests together?
4. If helper scripts became official, did you promote them into the manifest and acceptance runbook instead of leaving them half-documented?
5. Did you rerun `npm run check:docs-drift` after editing live docs?

## Practical Maintenance Rule

If you are unsure whether a behavior is "real" or just "present in the repo," trust the manifest and the tests first, then reconcile the docs to that truth.
