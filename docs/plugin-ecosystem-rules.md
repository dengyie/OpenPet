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

The default posture for third-party authors is welcome-first:

- accept local/community experiments when the package is structurally safe and honest about what it does;
- prefer clear disclosure, least-necessary permissions, and user-controlled lifecycle over broad rejection;
- treat missing host APIs as backlog when the author idea is valid but the runtime does not support it yet;
- reserve hard rejection for unsafe package structure, hidden install/enable execution, misleading declarations, credential leakage, destructive behavior, or review artifacts that cannot be trusted.

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

This means review should not turn the manifest into a narrow allowlist of allowed ideas. The manifest declares what OpenPet can inspect, operate, and present to users; it should also help authors disclose extension-owned behavior that exists outside OpenPet's direct control.

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
- generate and validate submission review artifacts;
- preserve a separate maintainer approval record when human review completes.

OpenPet should not run extension code during install. Install should extract, inspect, and record metadata only. Declared setup can run later only when the user explicitly chooses the setup action for an enabled, policy-allowed extension.

Extensions should remain disabled by default after install or update until the user intentionally enables them.

## 5. Entry Rules

Entries are the runtime surfaces OpenPet can operate.

### Commands

Commands are explicit short-lived process entries triggered by the user or OpenPet UI.

OpenPet runs them in the extension directory, rejects cwd escapes, spawns without shell expansion, sends stdin JSON with command context, captures stdout/stderr logs, parses the final stdout JSON line when present, and times out stalled processes.

Commands should be allowed to use any suitable runtime. Do not require JavaScript, a particular bundler, or a special host SDK when a local process command is enough.

### Services

Services are long-running local process entries managed by OpenPet.

OpenPet can run command and setup entries only after explicit Control Center action, record setup status/logs, start and stop declared service processes only after explicit Control Center action, apply service platform overrides, capture stdout/stderr snippets, show runtime state, manually check declared loopback health endpoints, optionally schedule host-managed periodic health checks for already running services, stop running services on disable/app quit with best-effort process-group cleanup, wait for confirmed child exit before reporting a clean stop, attempt one bounded host-side force stop if a service ignores the grace-period shutdown request, and try a host-owned process-tree cleanup path before falling back to direct child kill when process-group signalling fails. Declaration-only command runs also receive a short-lived bridge URL/token pair for bounded pet-aware actions and context reads. Explicit setup and declaration-only command cleanup now also keeps stop intent visible until child exit confirmation, but those paths remain direct-child best effort. Commands and setup do not run during install or enable, services do not auto-start, periodic health checks are opt-in and runtime-bound, and command/setup/service processes are spawned without shell expansion. Universal process-tree cleanup guarantees still remain out of scope.
Declaration-only command runs for creator-tools also receive host-owned `OPENPET_DATA_DIR`, `OPENPET_CACHE_DIR`, and `OPENPET_LOG_DIR`, plus bridge routes for bounded action reads/writes, active installed user pack metadata reads / validation / bounded writes through `pack-manifest:read` and `pack-manifest:write`, read-only package-local frame inspection through `assets:inspect`, host-mediated package-local frame import/sprite generation through `assets:generate`, approved full pet-pack import through `pet-pack:import`, and host-owned native picker frame inspection/import after explicit user approval. This does not grant raw filesystem access, raw file writes, plugin-selected output paths, arbitrary pet-pack writes, direct writes to OpenPet pet-pack storage, built-in pack edits, persistent folder grants, or arbitrary pack targeting.

Services may power real local experiences: dashboards, background companions, schedulers, local model servers, voice processors, or integrations with external APIs.

### Dashboards

Dashboards are user-facing URLs or local service pages.

First-version rules should stay simple:

- OpenPet shows an "Open Dashboard" action.
- OpenPet opens the URL externally or in a separate app window.
- OpenPet does not need to host, iframe, theme, inspect, or rewrite dashboard content.

## 6. Context And Bridge Rules

OpenPet should use language-neutral context passing.

Current declaration-only command runs receive stdin JSON context plus:

- `OPENPET_BRIDGE_URL`
- `OPENPET_BRIDGE_TOKEN`
- `OPENPET_DATA_DIR`
- `OPENPET_CACHE_DIR`
- `OPENPET_LOG_DIR`

Reserved future environment variables may still add:

- `OPENPET_EXTENSION_ID`
- `OPENPET_EXTENSION_DIR`
- `OPENPET_CONFIG_PATH`
- `OPENPET_RESULT_PATH`
- `OPENPET_BRIDGE_URL`
- `OPENPET_BRIDGE_TOKEN`

Commands currently receive JSON on stdin with `pluginId`, command id, payload, config, and OpenPet-provided paths.

Command results currently use the final stdout JSON line when present.

Submission review artifacts also stay explicit:

- author-side validation and submission bundles are local handoff material;
- maintainer approval records are separate Markdown/JSON artifacts;
- approval does not imply signing trust, publication, or runtime safety.

The current local bridge stays intentionally small:

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
- `POST /creator/pet-pack/inspect-output`
- `POST /creator/pet-pack/import-output`
- `POST /creator/pet-pack/activate`

The bridge is for integration convenience. It is not a complete SDK, not a full security broker, and not a reason to block extensions from using their own local capabilities.

### Welcomed Pet And Creator Use Cases

The following capabilities are intentionally available to ordinary third-party authors through explicit declaration-only command runs and route permissions:

- pet speech and status updates through `pet:say`;
- pet action playback through `pet:action`;
- bounded pet event emission through `pet:event`;
- action configuration reads/writes through `actions:read` and `actions:write`;
- active installed user pack metadata reads/writes through `pack-manifest:read` and `pack-manifest:write`;
- package-local or user-approved frame inspection through `assets:inspect`;
- package-local or user-approved frame import and sprite/action metadata generation through `assets:generate`;
- approved full pet-pack import through `pet-pack:import`, where the extension provides an output path and OpenPet performs inspection, import, policy checks, and optional activation.

These are not official-only powers. A community weather announcer, pet dialogue pack, pet personality helper, action editor, sprite generator, or local model workflow may request them when the package explains the user value and accepts the host boundary.

The boundary remains:

- pet mutations go through `PetService`;
- creator writes go through host validation/apply paths;
- generated full pet packs go through `PetPackService`, never direct extension writes into OpenPet-managed pet-pack storage;
- built-in pack edits, arbitrary pack targeting, raw filesystem writes, plugin-selected install paths, persistent folder grants, and universal process cleanup guarantees remain out of scope;
- reviewers should ask authors to reduce or explain permissions, not remove useful pet-facing behavior by default.

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
- setup does not run during package install or enable;
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

OpenPet now also supports a structured maintainer approval rehearsal record beside a submission bundle. That record is human review traceability only. It does not prove signing trust, catalog publication, runtime safety, or release readiness.

Reviewer questions should be practical:

- Does the package do what its description says?
- Are entries understandable to a user?
- Are setup and cleanup steps visible?
- Are dashboards and services named clearly?
- Are likely data, secret, account, and network dependencies disclosed?
- Does uninstall behavior explain what OpenPet can and cannot remove?
- Are logs and health checks sufficient for troubleshooting?
- Are requested pet/creator permissions proportional to the feature?
- If the author needs an unsupported capability, is the package still useful with that gap disclosed?

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

Maintainers should distinguish between:

- **blockers**: unsafe archives, path escapes, install-time execution, deceptive manifests, leaked credentials, destructive defaults, or unverifiable review evidence;
- **changes requested**: unclear entry names, excessive permissions without explanation, missing setup/cleanup disclosure, or weak user recovery logs;
- **allowed backlog gaps**: a good extension idea that needs a future host API but is otherwise transparent and safe to install/review locally.

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

These are compatibility surfaces, not the target boundary. The host now supports explicit setup execution with runtime state and logs, explicit language-neutral command process execution with stdin JSON context, explicit short-lived command bridge access for bounded pet and creator-tool capabilities, explicit lifecycle-managed service start/stop, manual and opt-in periodic loopback health checks, best-effort process-group cleanup plus host-owned process-tree fallback cleanup for explicit local-process stop paths, command result UX, and dashboard entries opened explicitly as external HTTP/HTTPS URLs from Control Center. Services still keep the strongest cleanup contract because they alone add process-group signalling and bounded force-stop escalation. Future development should close remaining gaps with broader bridge flows only where they preserve user control and honest safety language.
