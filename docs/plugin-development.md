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

Commands are explicit short-lived process entries. They are triggered from OpenPet UI or another explicit host action, not during install or enable.

```json
{
  "id": "announce-weather",
  "title": "Announce Weather",
  "command": "node ./commands/announce-weather.js",
  "cwd": "."
}
```

OpenPet currently:

- runs the command in the installed extension directory;
- rejects cwd paths or symlinks that escape the extension directory;
- spawns the process without shell expansion;
- passes command context as stdin JSON with `pluginId`, `commandId`, `payload`, `config`, and `paths.extensionDir`;
- captures stdout and stderr snippets into plugin logs;
- parses the final stdout JSON line as the command result when possible;
- times out stalled command processes.

Commands may be written in JavaScript, Python, shell scripts, compiled binaries, or any runtime the user has installed. JavaScript is supported as one ordinary process option, not as the only extension runtime.

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

OpenPet can explicitly run command and setup entries from Control Center, capture stdout/stderr snippets, show setup runtime state, explicitly start and stop services, show service runtime state, stop services on plugin disable, send stop signals on app quit, manually check declared loopback health endpoints, and optionally schedule host-managed periodic checks for running services from Control Center. It can attempt best-effort process-group cleanup when stopping services, wait for confirmed child exit before reporting a clean stop, escalate once to a host-side force stop if a service ignores the grace-period shutdown request, and try a host-owned process-tree cleanup path before falling back to direct child kill. Services remain the strongest cleanup shape because they alone combine process-group signalling, process-tree fallback, and bounded force-stop escalation. Declaration-only command runs also receive a short-lived bridge URL/token so they can call `pet.say`, `pet.action`, `pet.event`, and fetch a bounded read-only context during the active run. Command and setup cleanup keep stop intent visible until child exit confirmation and now also try the same host-owned tree cleanup before direct child kill fallback, but they still do not add service-style process groups or force-stop escalation. Command, setup, and service processes do not run during install or enable; services never auto-start; periodic health checks only run for already running services when the user enables the host policy; and the host spawns command, setup, and service processes without shell expansion. OpenPet still does not claim universal process-tree cleanup guarantees across every host/runtime combination. The service model should not require a specific language, a self-contained package, or a full process sandbox.

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

Current command entries receive context on stdin and run with a minimal host environment. Declaration-only command runs now also receive a short-lived bridge URL/token pair plus host-owned `OPENPET_DATA_DIR`, `OPENPET_CACHE_DIR`, and `OPENPET_LOG_DIR` paths. OpenPet still does not inject generated config files or result-file paths into command processes.

Current standard environment variables:

| Variable | Purpose |
| --- | --- |
| `OPENPET_BRIDGE_URL` | Short-lived local bridge endpoint for the active declaration-only command run. |
| `OPENPET_BRIDGE_TOKEN` | Bearer token for the active declaration-only command bridge. |
| `OPENPET_DATA_DIR` | Host-owned persistent data directory for the active declaration-only command run. |
| `OPENPET_CACHE_DIR` | Host-owned cache directory for the active declaration-only command run. |
| `OPENPET_LOG_DIR` | Host-owned log directory for the active declaration-only command run. |

Reserved future variables only:

| Variable | Purpose |
| --- | --- |
| `OPENPET_EXTENSION_ID` | Current extension id. |
| `OPENPET_EXTENSION_DIR` | Installed package directory. |
| `OPENPET_CONFIG_PATH` | Optional generated config JSON path. |
| `OPENPET_RESULT_PATH` | Command result JSON output path. |

Commands receive JSON on stdin:

```json
{
  "pluginId": "weather-morning-report",
  "commandId": "announce-weather",
  "payload": {},
  "config": {},
  "paths": {
    "extensionDir": "..."
  }
}
```

Current command result:

- write JSON as the final stdout line.

Current bridge routes:

- `GET /context`
- `POST /pet/say`
- `POST /pet/action`
- `POST /pet/event`
- `GET /creator/actions`
- `POST /creator/actions/validate`
- `POST /creator/actions/apply`
- `GET /creator/pack-manifest`
- `POST /creator/pack-manifest/validate`
- `POST /creator/pack-manifest/apply`
- `POST /creator/assets/inspect-frames`
- `POST /creator/assets/import-frames`
- `POST /creator/assets/pick-frames/inspect`
- `POST /creator/assets/pick-frames/import`

The bridge is loopback-only, token-gated, and valid only while the command run is active.

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

For deeper pet integration, OpenPet now provides a minimal optional local bridge for explicit declaration-only command runs. The bridge is not a heavy SDK and should not become a full permission broker in the first version.

Injected values:

- `OPENPET_BRIDGE_URL`
- `OPENPET_BRIDGE_TOKEN`
- `OPENPET_DATA_DIR`
- `OPENPET_CACHE_DIR`
- `OPENPET_LOG_DIR`

Current endpoint set:

- `GET /context`
- `POST /pet/say`
- `POST /pet/action`
- `POST /pet/event`
- `GET /creator/actions`
- `POST /creator/actions/validate`
- `POST /creator/actions/apply`
- `GET /creator/pack-manifest`
- `POST /creator/pack-manifest/validate`
- `POST /creator/pack-manifest/apply`
- `POST /creator/assets/inspect-frames`
- `POST /creator/assets/import-frames`
- `POST /creator/assets/pick-frames/inspect`
- `POST /creator/assets/pick-frames/import`

Bridge rules:

- the bridge exists only during an explicit declaration-only command run;
- the command must belong to an enabled, policy-allowed local extension;
- requests must use `Authorization: Bearer <OPENPET_BRIDGE_TOKEN>`;
- `pet:say`, `pet:action`, `pet:event`, `actions:read`, `actions:write`, `pack-manifest:read`, `pack-manifest:write`, `assets:inspect`, and `assets:generate` permissions are enforced per route;
- all pet mutations still flow through `PetService`;
- creator-tools action reads and writes flow through the host action service boundary, while pack manifest metadata reads and writes flow through the host pet-pack service boundary;
- `pack-manifest:read` / `pack-manifest:write` only expose the current active installed user pack metadata workflow and do not permit arbitrary pet-pack writes, arbitrary pack targeting, or raw filesystem access;
- creator-tools frame inspection is read-only, package-local, and confined to the extension directory;
- creator-tools frame import/sprite generation is host-mediated, package-local, resource-limited, and does not grant raw filesystem writes or plugin-selected output paths;
- creator-tools picker frame inspection/import is host-mediated and user-approved: the command can request a native folder picker, but selected absolute paths stay in the main process and are not returned to the bridge caller;
- setup entries, services, install, enable, and background health paths do not receive bridge access.

Example bridge requests:

```bash
curl -X POST "$OPENPET_BRIDGE_URL/pet/say" \
  -H "Authorization: Bearer $OPENPET_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"今天上海有雨，带伞。","ttlMs":6000}'
```

```bash
curl "$OPENPET_BRIDGE_URL/context" \
  -H "Authorization: Bearer $OPENPET_BRIDGE_TOKEN"
```

```bash
curl "$OPENPET_BRIDGE_URL/creator/actions" \
  -H "Authorization: Bearer $OPENPET_BRIDGE_TOKEN"
```

```bash
curl -X POST "$OPENPET_BRIDGE_URL/creator/assets/inspect-frames" \
  -H "Authorization: Bearer $OPENPET_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"relativePath":"assets/actions/wave","actionId":"wave"}'
```

```bash
curl -X POST "$OPENPET_BRIDGE_URL/creator/assets/import-frames" \
  -H "Authorization: Bearer $OPENPET_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"relativePath":"assets/actions/wave","actionId":"wave","label":"Wave Hello"}'
```

```bash
curl -X POST "$OPENPET_BRIDGE_URL/creator/assets/pick-frames/inspect" \
  -H "Authorization: Bearer $OPENPET_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"actionId":"picked-wave"}'
```

```bash
curl -X POST "$OPENPET_BRIDGE_URL/creator/assets/pick-frames/import" \
  -H "Authorization: Bearer $OPENPET_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"actionId":"picked-wave","label":"Picked Wave"}'
```

Example command behavior:

1. Read command context from stdin.
2. Fetch weather using the extension's own network stack.
3. Optionally call bridge routes such as `POST /pet/say`, `POST /pet/action`, or `POST /pet/event`.
4. Write final result JSON to stdout.

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
- setup runs only when the user explicitly presses the setup action in Control Center;
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

Pet action tooling should prefer package-local assets and generated outputs under `OPENPET_DATA_DIR` or a declared asset directory. Creator-tools commands should use the host bridge for bounded action reads/writes, active installed pack metadata edits, package-local frame inspection/import, or user-approved native picker frame inspection/import. Do not modify `cat_anime/` directly unless the user is intentionally working on core app assets.

## Packaging And Submission

Current repository commands still use the historical "plugin" name:

```bash
npm run validate:plugin -- <extension-dir-or-zip>
npm run create-plugin-submission-bundle -- <extension-dir-or-zip> --output-dir plugin-submission-bundle
npm run validate-plugin-submission-bundle -- plugin-submission-bundle --require-ready
npm run create-plugin-real-world-submission-rehearsal -- --source examples/plugins/weather-status --output-dir docs/release-evidence/plugin-real-world-submission-rehearsal/<session>
npm run create-plugin-remote-source-submission-rehearsal -- --archive-url https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main --plugin-path examples/plugins/weather-status --output-dir docs/release-evidence/plugin-remote-source-submission-rehearsal/<session>
npm run create-plugin-maintainer-approval -- plugin-submission-bundle --reviewer "OpenPet Maintainer" --decision approved --notes "Manifest, permissions, package hash, and submission artifacts reviewed."
npm run validate-plugin-maintainer-approval -- plugin-submission-bundle --require-approved
```

These commands are useful for structural validation and reviewer handoff, but some checks still reflect the legacy short-lived JavaScript SDK plugin model. The host now supports explicit setup execution, visible setup runtime status, explicit language-neutral command execution, explicit service start/stop, manual and opt-in periodic loopback service health checks, exit-confirmed cleanup for explicit setup/command/service stop flows, bounded service-side force stop, a broader process-tree cleanup fallback for explicit stop paths, creator-tools action reads and bounded writes through the short-lived bridge, active installed pack metadata reads / validation / bounded writes through `pack-manifest:read` and `pack-manifest:write`, package-local creator frame inspection through `assets:inspect`, package-local frame import/sprite generation through `assets:generate`, user-approved native picker frame inspection/import through the host, and a separate maintainer approval artifact layered on top of a ready-for-review submission bundle. Approval remains human-authored and does not prove signing trust, catalog publication, runtime safety, or release readiness. Arbitrary raw filesystem grants, arbitrary pet-pack writes, broader bridge flows, and universal process-tree cleanup guarantees are still implementation gaps to reconcile with the extension boundary design when developing the next host runtime.

For a local author rehearsal:

```bash
npm run create-plugin-author-rehearsal -- --output-dir docs/release-evidence/plugin-author-rehearsal/<session> --submission-template ai
```

The rehearsal writes an author README, command list, submission checklist, package zip, and validated submission bundle. The next maintainer step is now:

```bash
npm run create-plugin-maintainer-approval -- <submission-bundle-dir> --reviewer "OpenPet Maintainer" --decision approved --notes "..."
npm run validate-plugin-maintainer-approval -- <submission-bundle-dir> --require-approved
```

This is still review evidence, not catalog approval or signing trust.

For an existing-plugin rehearsal, use `create-plugin-real-world-submission-rehearsal`. The current archived example uses `examples/plugins/weather-status` to exercise package validation, network allowlist review, submission bundle generation, and maintainer approval in one local evidence chain. It is workflow evidence, not proof of external community provenance.

For a remote-source rehearsal, use `create-plugin-remote-source-submission-rehearsal`. The current archived example uses `https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main` to exercise archive URL capture, final URL capture, archive SHA-256 recording, archive size recording, plugin-path selection, extracted file hashing, package validation, submission bundle generation, and maintainer approval in one local evidence chain. It is remote-source workflow evidence, not proof of independent public ecosystem trust.

## Legacy JavaScript SDK Compatibility

Existing examples remain useful for the current implementation:

- [`examples/plugins/focus-timer`](../examples/plugins/focus-timer/) shows storage and pet speech.
- [`examples/plugins/weather-status`](../examples/plugins/weather-status/) shows JSON network allowlist usage.
- [`examples/plugins/rss-reader`](../examples/plugins/rss-reader/) shows public feed fetching and cached announcements.

Legacy packages use fields such as `main`, `permissions`, `network.allowlist`, and `commands`, then export `activate(ctx)` with APIs such as `ctx.pet`, `ctx.storage`, `ctx.network`, and `ctx.ai`.

That path is still valid for compatibility, but it should not define the future ceiling of the ecosystem. New platform work should adapt the host toward the unified extension model described above.
