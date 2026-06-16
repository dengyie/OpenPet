# OpenPet Extension Development

OpenPet is moving toward a developer-first local extension platform. An extension can be a small pet command, a long-running companion service, a local dashboard, a writing assistant, a weather announcer, a pet animation tool, or a package that orchestrates local models and generated assets.

This document follows the extension ecosystem boundary design. It is the target author guide for new development. Existing JavaScript SDK plugins remain a compatibility path while the host runtime catches up to the broader extension model.

For lifecycle, safety, and review language, read [`plugin-ecosystem-rules.md`](./plugin-ecosystem-rules.md) together with this guide.

## Core Model

OpenPet uses one package model: an extension.

The package root still contains:

```text
plugin.json
```

`plugin.json` is the unified manifest for all extension shapes. The word "plugin" remains in file names and some commands for compatibility, but new product and developer language should use "extension" when describing the ecosystem.

OpenPet should treat the manifest as a declaration and operational contract, not as a complete sandbox. It can validate package structure, show the user what the extension declares, start/stop entries, capture logs, and uninstall OpenPet-owned files. It should not claim to fully control everything a local process can do.

## Package Layout

An extension may be tiny:

```text
my-extension/
├── plugin.json
├── config.schema.json
└── commands/
    └── announce.js
```

It may also be a fuller local app:

```text
my-extension/
├── plugin.json
├── config.schema.json
├── commands/
├── service/
├── web/
├── templates/
├── static/
├── assets/
├── bin/
├── models/
└── README.md
```

OpenPet should preserve structural safety:

- `plugin.json` must be at package root.
- Entry paths and package-relative files must stay inside the installed package.
- Absolute paths, path traversal, unsafe zip entries, and escaping symlinks are rejected.
- Installation must not overwrite OpenPet application files.
- Install only extracts and inspects; extension code should not run during install.

## Manifest Shape

Use this first-version shape for new extension design:

```json
{
  "id": "weather-morning-report",
  "name": "Weather Morning Report",
  "version": "1.0.0",
  "description": "Weather reports, Web dashboard, and Email delivery for OpenPet.",
  "entries": {
    "commands": [],
    "services": [],
    "dashboards": []
  },
  "manifest": {},
  "config": "config.schema.json",
  "assets": []
}
```

Important fields:

- `id`: stable extension id.
- `name`: user-facing name.
- `version`: extension version.
- `description`: short user-facing purpose.
- `entries`: commands, services, and dashboards OpenPet can run, manage, or open.
- `manifest`: structured declaration area shown to users.
- `config`: optional package-relative configuration schema.
- `assets`: meaningful package assets such as templates, static files, model assets, generated pet art, docs, or examples.

Recommended id pattern:

```text
<namespace>.<extension-name>
```

Examples:

- `community.weather-morning-report`
- `com.yourname.pet-action-studio`
- `openpet.example.focus-timer`

## Entries

Entries describe what OpenPet can start, run, or open. They do not create separate package types.

### Commands

Commands are user-triggered or OpenPet-triggered shell entries.

```json
{
  "id": "announce-weather",
  "title": "Announce Weather",
  "command": "node ./commands/announce-weather.js",
  "cwd": "."
}
```

OpenPet should:

- run the command in the installed extension directory;
- inject standard environment variables;
- pass command context as stdin JSON;
- collect stdout and stderr;
- read result JSON from `OPENPET_RESULT_PATH` when provided;
- optionally parse the final stdout JSON line as a fallback;
- show success/failure state and recent logs.

Commands may be written in JavaScript, Python, shell, compiled binaries, or any runtime the user has installed. JavaScript is supported as ordinary shell execution, not as the only extension runtime.

### Services

Services are long-running local process entries managed by OpenPet.

```json
{
  "id": "companion",
  "name": "Weather Companion Service",
  "command": "npm run service:start",
  "cwd": ".",
  "platforms": {
    "darwin": { "command": "npm run service:start" },
    "win32": { "command": "npm run service:start:win" },
    "linux": { "command": "npm run service:start" }
  },
  "health": {
    "type": "http",
    "url": "http://127.0.0.1:8787/health"
  }
}
```

OpenPet can explicitly start and stop services from Control Center, capture stdout/stderr snippets, show runtime state, stop services on plugin disable, and send stop signals on app quit. Services never auto-start, and the host spawns service commands without shell expansion. Health checks, setup coupling, bridge injection, and full process-tree cleanup are still future runtime work. The service model should not require a specific language, a self-contained package, or a full process sandbox.

### Dashboards

Dashboards are user-facing URLs or local service pages.

```json
{
  "id": "main",
  "title": "Weather Dashboard",
  "url": "http://127.0.0.1:8787"
}
```

First-version behavior should stay simple: OpenPet shows an "Open Dashboard" action and opens the URL externally or in a separate app window. OpenPet does not need to host, iframe, theme, or inspect the dashboard.

## Context Passing

OpenPet should use language-neutral context passing.

Common environment variables:

| Variable | Purpose |
| --- | --- |
| `OPENPET_EXTENSION_ID` | Current extension id. |
| `OPENPET_EXTENSION_DIR` | Installed package directory. |
| `OPENPET_DATA_DIR` | Recommended persistent data directory. |
| `OPENPET_CACHE_DIR` | Recommended cache directory. |
| `OPENPET_LOG_DIR` | Recommended log directory. |
| `OPENPET_CONFIG_PATH` | Optional generated config JSON path. |
| `OPENPET_RESULT_PATH` | Command result JSON output path. |
| `OPENPET_BRIDGE_URL` | Optional local bridge endpoint. |
| `OPENPET_BRIDGE_TOKEN` | Optional bridge token. |

Commands receive JSON on stdin:

```json
{
  "commandId": "announce-weather",
  "payload": {},
  "config": {},
  "paths": {
    "extensionDir": "...",
    "dataDir": "...",
    "cacheDir": "...",
    "logDir": "..."
  }
}
```

Preferred command result:

- write JSON to `OPENPET_RESULT_PATH`.

Fallback command result:

- write JSON as the final stdout line.

OpenPet may interpret common result keys:

```json
{
  "ok": true,
  "message": "Report sent.",
  "petSay": "今天有雨，邮件已发送。",
  "petAction": "umbrella",
  "dashboardUrl": "http://127.0.0.1:8787/reports/latest"
}
```

## Optional Bridge

For deeper pet integration, OpenPet should provide a minimal optional local bridge. The bridge is not a heavy SDK and should not become a full permission broker in the first version.

Injected values:

- `OPENPET_BRIDGE_URL`
- `OPENPET_BRIDGE_TOKEN`

First-version endpoint set:

- `POST /pet/say`
- `POST /pet/action`
- `POST /notification`
- `POST /status`
- `GET /config`

Example command behavior:

1. Read command context from stdin.
2. Fetch weather using the extension's own network stack.
3. Write a result JSON file to `OPENPET_RESULT_PATH`.
4. Optionally call `POST /pet/say` or include `petSay` in the result.

## Configuration

`config` points to an optional package-relative schema that can power Control Center forms.

```json
{
  "title": "Weather Morning Report Settings",
  "type": "object",
  "properties": {
    "city": {
      "type": "string",
      "title": "City",
      "default": "Shanghai"
    },
    "sendEmail": {
      "type": "boolean",
      "title": "Send Email",
      "default": false
    }
  },
  "required": ["city"]
}
```

OpenPet-managed config is useful for friendly setup, but it is not the only place an extension may keep settings. Extensions may also maintain their own files, databases, dashboards, `.env` files, external accounts, or local model caches. If an extension manages secrets outside OpenPet, disclose that clearly in `manifest`.

## Manifest Declarations

Use `manifest` to disclose facts OpenPet should show to the user.

```json
{
  "network": {
    "declaredHosts": ["api.weather.example.com", "smtp.example.com"]
  },
  "dataLocations": [
    {
      "path": "OPENPET_DATA_DIR",
      "description": "Report history, scheduler state, and generated summaries."
    },
    {
      "path": "~/.weather-morning-report",
      "description": "Optional developer-managed local configuration."
    }
  ],
  "externalAccounts": ["Weather API provider", "SMTP provider"],
  "setupNotes": "Run the setup command before starting the companion service.",
  "cleanupNotes": "Cleanup can remove the local report database but cannot revoke external accounts."
}
```

OpenPet should display these declarations honestly. It should not treat them as proof that every runtime behavior is enforced.

## Setup And Dependencies

Extensions may declare explicit setup commands:

```json
{
  "id": "setup",
  "title": "Install Dependencies",
  "command": "npm install",
  "cwd": "."
}
```

Setup behavior:

- install only extracts and inspects;
- the extension remains disabled by default;
- setup runs only when the user explicitly runs it or confirms it during enable/start;
- OpenPet records setup status and logs;
- setup may be rerun.

Production packages should prefer self-contained dependencies when practical, but the ecosystem should not require every package to be self-contained.

## Data And Secrets

OpenPet manages:

- extension installation metadata;
- enabled state;
- service process state;
- setup state;
- OpenPet-created data/cache/log directories;
- health and log summaries;
- configuration the user enters through OpenPet UI.

Third-party extensions may manage:

- their own databases;
- SMTP credentials;
- API tokens;
- `.env` files;
- external accounts;
- model caches;
- generated files;
- user content.

Do not imply that OpenPet can enumerate, audit, or delete every third-party secret or data file. Instead, disclose likely locations, provide cleanup commands when useful, and make local behavior understandable.

## Pet Integration Ideas

Extensions should be able to build practical pet experiences, not just text commands.

Good extension shapes include:

- weather morning reports where the pet speaks, changes action, and opens a dashboard;
- pet action packs that add or regenerate animation frame lists;
- pet personality injectors that alter speaking style through local config;
- writing assistants where the pet summarizes progress;
- local model workflows that generate pet sprites or dialogue variants;
- scheduled companions that announce calendar, RSS, build, or system status;
- dashboards for configuring extension-specific workflows.

Pet action tooling should prefer package-local assets and generated outputs under `OPENPET_DATA_DIR` or a declared asset directory. Do not modify `cat_anime/` directly unless the user is intentionally working on core app assets.

## Packaging And Submission

Current repository commands still use the historical "plugin" name:

```bash
npm run validate:plugin -- <extension-dir-or-zip>
npm run create-plugin-submission-bundle -- <extension-dir-or-zip> --output-dir plugin-submission-bundle
npm run validate-plugin-submission-bundle -- plugin-submission-bundle --require-ready
```

These commands are useful for structural validation and reviewer handoff, but some checks still reflect the legacy short-lived JavaScript SDK plugin model. The host now supports explicit service start/stop, but generic shell command execution, setup status, health checks, bridge flows, and process-tree cleanup are still implementation gaps to reconcile with the extension boundary design when developing the next host runtime.

For a local author rehearsal:

```bash
npm run create-plugin-author-rehearsal -- --output-dir docs/release-evidence/plugin-author-rehearsal/<session> --submission-template ai
```

The rehearsal writes an author README, command list, submission checklist, package zip, and validated submission bundle. It is review evidence, not catalog approval or signing trust.

## Legacy JavaScript SDK Compatibility

Existing examples remain useful for the current implementation:

- [`examples/plugins/focus-timer`](../examples/plugins/focus-timer/) shows storage and pet speech.
- [`examples/plugins/weather-status`](../examples/plugins/weather-status/) shows JSON network allowlist usage.
- [`examples/plugins/rss-reader`](../examples/plugins/rss-reader/) shows public feed fetching and cached announcements.

Legacy packages use fields such as `main`, `permissions`, `network.allowlist`, and `commands`, then export `activate(ctx)` with APIs such as `ctx.pet`, `ctx.storage`, `ctx.network`, and `ctx.ai`.

That path is still valid for compatibility, but it should not define the future ceiling of the ecosystem. New platform work should adapt the host toward the unified extension model described above.
