# OpenPet Extension Ecosystem Rules

This document defines the product and development rules for OpenPet's third-party extension ecosystem. It follows the extension ecosystem boundary design and supersedes the older restrictive plugin-only framing.

Use this with [`plugin-development.md`](./plugin-development.md) and [`plugin-submission-workflow-playbook.md`](./plugin-submission-workflow-playbook.md).

## 1. Ecosystem Goal

OpenPet should be a developer-first local extension platform.

The ecosystem should welcome practical third-party work such as:

- pet weather announcers and morning reports;
- Web dashboards;
- Email and SMTP delivery;
- voice conversation;
- long-running local services;
- writing assistants;
- pet action editors and generated sprite workflows;
- pet dialogue and personality packs;
- local model or binary workflows;
- scheduled jobs;
- third-party API integrations;
- local automation that makes the desktop pet feel useful and alive.

OpenPet should not require every new idea to become a first-party hardcoded feature before authors can experiment.

## 2. One Extension Model

OpenPet has one conceptual third-party package model: extension.

Allowed descriptive words:

- command;
- service;
- dashboard;
- companion;
- widget;
- worker;
- tool.

Those words describe entries or behavior. They must not create separate package models with separate mental rules.

The package root remains:

```text
plugin.json
```

`plugin.json` is the unified manifest. The historical file name stays for compatibility, but new documentation should describe the ecosystem as extensions.

## 3. Manifest Is Declaration, Not Sandbox

The manifest is a user-visible declaration and operational contract.

OpenPet should hard-check structural safety:

- required identity fields exist;
- JSON shape is valid;
- `plugin.json` is at the package root;
- entry paths stay inside the installed package;
- package extraction cannot escape the install directory;
- symlinks and path traversal are rejected;
- platform-specific entry definitions are syntactically valid;
- referenced config/assets paths are package-relative;
- package installation cannot overwrite OpenPet application files.

OpenPet should not claim that the manifest fully constrains runtime behavior. A local command or service may use its own runtime, filesystem access, network stack, secrets, databases, binaries, and external accounts.

The right product promise is transparency and lifecycle control, not complete local-process policing.

## 4. Lifecycle Management

OpenPet should manage extension lifecycle:

- install;
- enable/disable;
- setup step status;
- start/stop service entries;
- run command entries;
- collect stdout/stderr;
- store recent logs;
- run health checks;
- open dashboards;
- show manifest declarations;
- uninstall;
- optionally run explicit cleanup commands.

OpenPet should not run extension code during install. Install should extract, inspect, and record metadata only.

Extensions should remain disabled by default after install or update until the user intentionally enables them.

## 5. Entry Rules

Entries are the runtime surfaces OpenPet can operate.

### Commands

Commands are shell entries triggered by the user or OpenPet UI.

OpenPet should run them in the extension directory, inject standard environment variables, send stdin JSON, capture logs, read `OPENPET_RESULT_PATH`, and show success/failure state.

Commands should be allowed to use any suitable runtime. Do not require JavaScript, a particular bundler, or a special host SDK when a shell command is enough.

### Services

Services are long-running shell entries managed by OpenPet.

OpenPet should select platform overrides, start/stop the process, capture logs, show running/stopped/failed state, run health checks, and stop services on disable/uninstall.

Services may power real local experiences: dashboards, background companions, schedulers, local model servers, voice processors, or integrations with external APIs.

### Dashboards

Dashboards are user-facing URLs or local service pages.

First-version rules should stay simple:

- OpenPet shows an "Open Dashboard" action.
- OpenPet opens the URL externally or in a separate app window.
- OpenPet does not need to host, iframe, theme, inspect, or rewrite dashboard content.

## 6. Context And Bridge Rules

OpenPet should use language-neutral context passing.

Standard environment variables:

- `OPENPET_EXTENSION_ID`
- `OPENPET_EXTENSION_DIR`
- `OPENPET_DATA_DIR`
- `OPENPET_CACHE_DIR`
- `OPENPET_LOG_DIR`
- `OPENPET_CONFIG_PATH`
- `OPENPET_RESULT_PATH`
- `OPENPET_BRIDGE_URL`
- `OPENPET_BRIDGE_TOKEN`

Commands should receive JSON on stdin with command id, payload, config, and OpenPet-provided paths.

Command results should prefer `OPENPET_RESULT_PATH`; a final stdout JSON line may be accepted as fallback.

The optional local bridge should start small:

- `POST /pet/say`
- `POST /pet/action`
- `POST /notification`
- `POST /status`
- `GET /config`

The bridge is for integration convenience. It is not a complete SDK, not a full security broker, and not a reason to block extensions from using their own local capabilities.

## 7. Data And Secret Ownership

OpenPet manages:

- extension installation metadata;
- enabled state;
- service process state;
- setup state;
- OpenPet-created data/cache/log directories;
- health and log summaries;
- configuration entered through OpenPet UI.

Third-party extensions may manage:

- their own databases;
- SMTP credentials;
- API tokens;
- `.env` files;
- external accounts;
- model caches;
- generated files;
- user content.

OpenPet should not claim it can enumerate, audit, revoke, or delete every third-party secret or data file. Authors should disclose likely data locations and external dependencies in `manifest`, and OpenPet should show those declarations plainly.

This is intentionally more welcoming than the older "no secrets in ordinary plugin config" posture. The new boundary is: OpenPet-owned config should be clear about whether it stores secrets, and extension-owned secrets must be disclosed and managed by the extension/user, not silently implied to be protected by OpenPet.

## 8. Setup, Dependencies, And Cleanup

Extensions may declare setup commands such as dependency installation, model download, local database preparation, or account login helpers.

Rules:

- setup is explicit and user-visible;
- setup may be rerun;
- setup status and logs are recorded;
- setup does not run during package install;
- self-contained packages are recommended for production, but not required.

Uninstall should:

- stop services;
- disable the extension;
- remove the installed package;
- remove OpenPet-owned metadata;
- optionally remove OpenPet-created data/cache/log directories when the user chooses.

Uninstall should not automatically:

- delete third-party-declared external data locations;
- revoke external accounts;
- delete cloud data;
- assume extension-managed secrets are known.

Cleanup commands are allowed, but running cleanup must be explicit.

## 9. Source Labels

OpenPet should preserve source labels:

- `official`;
- `community`;
- `local`.

Source labels affect display and trust messaging only. They should not change runtime capability in the first version.

Suggested display posture:

- `official`: maintained or bundled by OpenPet maintainers.
- `community`: shared by a third party with package metadata intended for other users.
- `local`: installed from a local folder or archive for personal use, testing, or development.

These labels should help users understand provenance without turning local experimentation into a gatekept approval process.

## 10. Package Review And Catalog Review

Local installation review should focus on structural safety and transparency:

- identity;
- version;
- package size;
- file count;
- executable-looking entries;
- declared commands;
- declared services;
- declared dashboards;
- setup and cleanup commands;
- declared data locations;
- declared external accounts;
- package hash;
- source label.

Catalog or community publication may add reviewer expectations, but review should not be framed as a promise that OpenPet has proven the extension safe. It is a transparency and quality process.

Reviewer questions should be practical:

- Does the package do what its description says?
- Are entries understandable to a user?
- Are setup and cleanup steps visible?
- Are dashboards and services named clearly?
- Are likely data, secret, account, and network dependencies disclosed?
- Does uninstall behavior explain what OpenPet can and cannot remove?
- Are logs and health checks sufficient for troubleshooting?

## 11. Compatibility Rules

Historical OpenPet plugins use a short-lived JavaScript runner with `activate(ctx)`, SDK permissions, private storage, and network allowlists. That compatibility path can continue while the host migrates.

New extension development should target:

- `entries.commands`;
- `entries.services`;
- `entries.dashboards`;
- language-neutral stdin/env/result passing;
- optional bridge integration;
- manifest declarations for data, accounts, setup, cleanup, and runtime expectations.

When updating docs, examples, UI copy, or architecture plans, avoid presenting the legacy SDK permission model as the future ecosystem ceiling.

When updating runtime implementation, preserve compatibility for existing examples where practical, but adapt new infrastructure toward the unified extension model.

## 12. Product Language

Use honest language:

- "OpenPet runs local extensions and shows their manifest declarations."
- "OpenPet manages lifecycle, logs, health, and uninstall flow."
- "Extensions may run local commands and manage their own data."
- "OpenPet does not fully sandbox arbitrary local processes."
- "Source labels explain provenance; they do not guarantee safety."

Avoid misleading language:

- "fully safe";
- "complete sandbox";
- "all secrets are controlled by OpenPet";
- "OpenPet blocks every undeclared action";
- "reviewed means risk-free";
- "community extensions are less capable than official extensions."

## 13. Author Guidance

Authors should feel welcome to experiment.

Good author habits:

- make the extension purpose obvious;
- keep entry names human-readable;
- disclose local files, external accounts, and setup needs;
- write logs that help users recover from failure;
- provide a dashboard when configuration is richer than a simple form;
- prefer explicit setup over surprising background work;
- provide cleanup commands when the extension creates durable external state;
- degrade gracefully when a pet action, local binary, model, or external service is unavailable.

Good OpenPet pet integration habits:

- use pet speech for user-meaningful updates, not noisy debug logs;
- check whether an action exists before assuming it can play;
- allow users to configure personality, timing, and verbosity;
- keep generated pet actions and art in declared package/data locations;
- treat `cat_anime/` as core app material unless the user is intentionally developing the app itself.

The ecosystem should be broad enough for authors to build things like "a pet that announces weather with custom actions and personality" without waiting for OpenPet core to add every individual capability first.

## 14. Current Implementation Gap

Some repository tools and examples still reflect the older plugin SDK implementation:

- `main` entry files;
- `permissions`;
- `network.allowlist`;
- `ctx.pet`;
- `ctx.storage`;
- `ctx.network`;
- `ctx.ai`;
- short-lived isolated JavaScript command handlers.

These are compatibility surfaces, not the target boundary. Future development should close the gap by adding lifecycle-managed service entries, richer command execution, language-neutral context passing, setup status, health, and honest user-facing copy. Dashboard entries can already be opened explicitly as external HTTP/HTTPS URLs from Control Center.
