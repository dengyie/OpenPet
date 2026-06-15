# OpenPet Plugin Ecosystem Rules

This document defines the hard rules for third-party OpenPet plugins, the compatibility contract the host app currently supports, and the adaptation guidance plugin authors should follow before packaging or submitting a plugin.

Use this together with [`plugin-development.md`](./plugin-development.md) and [`plugin-submission-workflow-playbook.md`](./plugin-submission-workflow-playbook.md).

## 1. Ecosystem Goals

OpenPet plugins are intentionally constrained.

The platform is optimizing for:

- safe local extensibility
- predictable review and update flows
- compatibility with Control Center install and management UX
- plugin behavior that stays inside the pet platform instead of turning into general-purpose desktop code

The platform is not offering:

- unrestricted Node.js or Electron access
- background daemons or long-lived resident processes
- direct filesystem access
- direct renderer integration
- privileged access to user secrets or app internals

If a plugin needs one of those, it is outside the current plugin contract and should be designed as a future platform capability, not worked around inside a plugin package.

## 2. Allowed Plugin Shape

Supported package layout:

```text
my-plugin/
├── plugin.json
├── index.js
├── config.schema.json   # optional
└── signature.json       # optional
```

Supported package transports:

- plugin directory
- `.openpet-plugin.zip`
- legacy `.ibot-plugin.zip` for compatibility only

Current preferred public format:

- package suffix: `.openpet-plugin.zip`
- catalog compatibility field: `openpetApiVersion`
- user-facing naming: `OpenPet`

Legacy `ibot` naming is accepted only so existing packages and upgrade paths do not break.

## 3. Non-Negotiable Safety Rules

These are hard blockers. A plugin package must not attempt to bypass them.

- `plugin.json` must live at the package root.
- `main` and `configSchema` must be safe relative paths inside the plugin directory.
- Absolute paths, `..`, NUL bytes, unsafe zip entries, and escaping symlinks are rejected.
- Plugin folders and extracted plugin packages must not contain symlinks.
- Only declared manifest permissions are available at runtime.
- Plugins must never depend on `require`, `process`, Electron globals, shell access, or arbitrary filesystem access.
- Plugins must treat all SDK payloads and command results as JSON-serializable data.
- Plugins must not require API keys, bearer tokens, cookies, or private credentials through network headers.
- Plugins must not attempt to contact `localhost`, private IPs, raw IPv4/IPv6 hosts, or non-HTTPS endpoints.
- Plugins must not assume they will be auto-enabled after install or update.

## 4. Runtime Contract

OpenPet currently supports command-style plugins only.

That means:

- The main entry must export `activate(ctx)`.
- A plugin runs only when the user or host triggers a declared command.
- Execution happens in a short-lived isolated runner.
- Each command must finish quickly and return a JSON-serializable result.
- Plugins must not rely on in-memory state surviving between command invocations.

Author guidance:

- Persist durable state in `ctx.storage`, not module-level globals.
- Recompute transient state per command.
- Keep commands small, deterministic, and retry-safe where possible.
- Treat timeouts as a normal operating constraint, not an exceptional edge case.

## 5. Manifest Rules

`plugin.json` is the compatibility contract. Keep it conservative and explicit.

Required fields:

- `id`
- `name`
- `version`
- `main`
- `permissions`
- `commands`

Rules:

- `id` and `commands[].id` must use safe ids: letters, numbers, `_`, `.`, `-`.
- `version` should be SemVer-style even though current validation only requires a non-empty string.
- `description` should clearly explain the user-visible job of the plugin.
- `permissions` must be the minimum required set.
- `network.allowlist` must contain public DNS hosts, optionally with an explicit port, never full URLs.
- `commands` should expose stable user-facing actions, not internal helper names.

Recommended `id` pattern:

```text
<namespace>.<plugin-name>
```

Examples:

- `openpet.example.focus-timer`
- `com.yourname.weather-status`

Do not:

- overload one plugin with unrelated capabilities
- request permissions “just in case”
- hide behavior behind vague command ids like `run`, `main`, or `doit`

## 6. Permission Rules

OpenPet currently supports only these permissions:

- `pet:say`
- `pet:action`
- `pet:event`
- `ai:chat`
- `storage`
- `network`
- `commands`

Permission budgeting rules:

- Ask only for the permissions your commands use today.
- If a new version needs more permissions or new network hosts, expect update review and re-enable by the user.
- Prefer `pet:say` over `pet:event` unless structured event semantics are actually needed.
- Prefer `storage` over trying to rebuild state from repeated network calls.
- Do not request `ai:chat` unless the plugin meaningfully delegates reasoning to the app AI layer.

Suggested review posture by permission level:

- Low-risk: `pet:say`, `pet:action`, `pet:event`
- Medium-risk: `storage`
- Higher-risk: `network`, `ai:chat`

`commands` is a manifest declaration for command exposure. It is not a privilege escalation path.

## 7. SDK Adaptation Rules

### `ctx.pet`

Use pet APIs only for visible pet behavior.

- `ctx.pet.say()` should produce user-meaningful output, not debug noise.
- `ctx.pet.playAction()` should reference stable action ids that exist on the active pet.
- `ctx.pet.setEvent()` should be used when the host needs structured state/event semantics.

Do not:

- spam repeated speech on every refresh loop
- treat pet speech as logging
- assume every pet pack supports a custom action

### `ctx.storage`

Storage is the only supported durable plugin state.

Hard limits already enforced by the host:

- 64KB total per plugin
- 16KB per value
- key pattern: letters, numbers, `_`, `.`, `:`, `-`

Author rules:

- store small normalized state, not raw archives or large documents
- cache derived summaries instead of full upstream payloads
- version your storage shape if later plugin versions may migrate data
- clear or replace stale cached values instead of accumulating history forever

Good fits:

- counters
- last successful fetch result
- user-visible cache snapshots
- lightweight plugin state flags

Bad fits:

- binary data
- large AI transcripts
- full RSS archives
- secret tokens

### `ctx.network`

Network access is intentionally narrow.

Current enforced rules:

- permission `network` is required
- only HTTPS
- only hosts in `network.allowlist`, including the port when one is declared
- only `GET` and `POST`
- sensitive headers like `authorization` and `cookie` are rejected
- request and response size limits are enforced
- redirect targets must stay on allowlisted HTTPS hosts

Author rules:

- keep allowlists tight and stable
- prefer one upstream host per plugin when possible
- include an explicit port only when the upstream service requires it
- make idempotent read-style requests unless there is a strong reason to POST
- send only public, non-secret headers such as `accept`
- normalize and trim upstream responses before storing them

Do not:

- ask users to paste private API keys into plugin config and then forward them as headers
- proxy through your own opaque endpoint just to hide a broader dependency surface
- depend on undocumented redirects or multi-host redirect chains

### `ctx.ai`

`ctx.ai.chat()` is for bounded AI assistance through the host.

Author rules:

- use it when the plugin truly needs model reasoning, summarization, or rewriting
- keep prompts focused and short
- persist only the minimum follow-up context you need
- assume the host may namespace conversation ids

Do not:

- expect raw provider credentials
- build your own long-lived chat client inside plugin state
- store large prompt/response transcripts in plugin storage

### `ctx.commands`

Commands are the stable invocation surface.

Rules:

- every manifest command should map to a real handler
- command handlers should return structured results
- payloads should be small, explicit, and optional where possible
- command ids are part of the plugin compatibility contract and should not churn casually

## 8. Configuration Rules

Current supported schema field types:

- `string`
- `number`
- `boolean`

Current supported schema features:

- `title`
- `description`
- `default`
- `enum`
- `required`

Author rules:

- keep configuration human-editable in Control Center
- use defaults aggressively so the plugin works immediately after enablement
- use `enum` when values are intentionally limited
- avoid config that contains private secrets because plugin config is ordinary app settings, not secret storage

Until the platform has a dedicated plugin secret capability:

- do not design plugins that require private API keys
- do not instruct users to store tokens in plugin config
- do not claim a plugin is secure if it depends on user-pasted secrets in ordinary settings

## 9. Compatibility And Upgrade Rules

Plugin authors must target the current OpenPet contract, not internal implementation details.

Required compatibility mindset:

- treat the SDK as the only supported host surface
- treat `plugin.json` as the only supported package contract
- assume install/update always goes through review
- assume updates with new permissions or new hosts will disable the plugin until the user re-enables it

Practical adaptation guidance:

- Prefer additive plugin upgrades over breaking command renames.
- Keep command ids stable across versions.
- When storage shape changes, migrate lazily and safely inside a command.
- If a plugin was formerly branded for `ibot`, repackage it as `OpenPet` and prefer `.openpet-plugin.zip`.
- If publishing to catalog metadata, populate `openpetApiVersion` rather than `ibotApiVersion`.

## 10. Catalog And Submission Rules

Catalog publication requires more discipline than local experimentation.

Before reviewer handoff:

```bash
npm run validate:plugin -- path/to/my-plugin
npm run create-plugin-submission-report -- path/to/my-plugin --output plugin-submission-report.md
npm run create-plugin-submission-pr -- path/to/my-plugin --output plugin-submission-pr.md
npm run create-plugin-submission-bundle -- path/to/my-plugin --output-dir plugin-submission-bundle
npm run validate-plugin-submission-bundle -- plugin-submission-bundle --require-ready
```

Submission rules:

- unsigned plugins may be acceptable for local/manual use, but they should be treated as review-risk packages
- signature metadata currently proves hash coverage only, not signer trust
- catalog entries are metadata only; they do not bypass install review
- package hashes must stay stable between submission artifacts and shipped bytes
- reviewer materials must match the actual package being distributed

## 11. Testing Rules For Plugin Authors

Every plugin should have both package-level and behavior-level validation.

Minimum recommended checks:

```bash
node --check index.js
npm run validate:plugin -- path/to/my-plugin
```

If the plugin is intended for this repository or official examples, also add service-level tests that mirror the existing examples:

- install inspection test
- disabled-by-default install assertion
- runtime command test through `PluginService`
- fake `fetch` injection for network plugins
- storage assertions for persistent state

Testing guidance:

- do not depend on live network access in tests
- do not test by invoking internal runner details directly when `PluginService` covers the integration path
- assert actual emitted pet payloads, not just return values

## 12. Reviewer Checklist

Reviewers should reject or bounce a plugin when any of these are true:

- permissions are broader than the user-visible feature needs
- network allowlist is broader than the declared feature needs
- plugin config asks for secrets
- commands are vague, unstable, or inconsistent with manifest declarations
- plugin stores more data than needed for its job
- plugin behavior depends on undeclared host internals
- update introduces new permissions or hosts without a clear explanation
- submission artifacts do not match the reviewed package hash

## 13. Design Guidance For New Plugins

Good first-party ecosystem shapes under the current platform:

- pet productivity helpers with small persistent counters
- public-data announcers using one allowlisted host
- lightweight AI-assisted pet messaging with bounded prompts
- pet-pack-aware utility plugins that degrade gracefully when an action is unavailable

Poor fits under the current platform:

- plugins that need background scheduling outside command triggers
- plugins that need local file indexing
- plugins that need desktop automation
- plugins that need private API credentials
- plugins that need multi-tenant account systems

If a plugin idea keeps pushing against these limits, treat that as a signal to evolve the platform contract first.
