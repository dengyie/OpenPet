# IM Gateway Core Plugin Design

> Date: 2026-07-08
> Branch: `dev9`
> Status: Phase 1 MVP complete on `dev9`; future work is tracked in `docs/TODO.md`
> Scope: official privileged core plugin for IM integration with Telegram first, QQ and WeChat deferred

## 1. Purpose

OpenPet should connect to IM software without turning WeChat, QQ, Telegram, or other platform SDKs into main-process platform code.

The chosen route is an official privileged bundled plugin:

- plugin id: `openpet.im-gateway`
- runtime form: long-running plugin service
- first platform: Telegram through long polling
- later platforms: QQ and WeChat through adapter implementations behind the same internal gateway model

The host remains the owner of pet state, secrets, plugin lifecycle, and Control Center entry points. The plugin owns IM platform adapters, reconnect behavior, trigger policy, command parsing, and platform-specific delivery details.

## 2. Current OpenPet Fit

OpenPet already has most host-side primitives needed for this route:

- `PetService` is the single pet mutation authority for `say`, `playAction`, and `setEvent`.
- `PluginService` can run long-lived plugin services with native execution approval.
- plugin service bridge already exposes scoped routes for `/context`, `/pet/say`, `/pet/action`, and `/pet/event`.
- plugin service runtime state, logs, health checks, dashboards, and config display already exist in Control Center.
- `SecretService` already supports host-owned secret storage and should be reused for IM credentials.

This means the IM gateway should avoid direct Electron or renderer access. It should call host-owned bridge routes instead.

## 3. Product Goal

Phase 1 should prove that OpenPet can react to IM messages as a desktop pet companion.

Success means:

1. a user can configure Telegram safely from OpenPet;
2. OpenPet can start the bundled IM Gateway service only after explicit opt-in and native execution approval;
3. an allowed Telegram user can send an explicit trigger or `/openpet` command;
4. the desktop pet speaks, changes action, or displays a short event through `PetService`;
5. Telegram receives a short command receipt for command-style interactions;
6. the Control Center shows safe connection and trigger health without leaking raw IM content.

Phase 1 is not a full chat bot, and it is not a general third-party IM adapter framework.

## 4. Confirmed Decisions

- IM integration is an official privileged core plugin, not a main-process platform subsystem.
- The first shipped plugin id is `openpet.im-gateway`.
- The plugin is bundled with OpenPet but disabled by default.
- Users must explicitly enable it, save credentials, approve native execution, and start the service.
- Phase 1 supports Telegram only as a real adapter.
- QQ and WeChat get internal adapter skeletons but remain disabled and experimental.
- Telegram uses Node.js and `grammY`.
- Telegram Phase 1 uses long polling only. Webhook mode is deferred.
- The plugin has an internal lightweight adapter registry.
- The internal normalized IM message model stays inside the plugin in Phase 1.
- Host shared contracts do not get a formal `NormalizedImMessage` in Phase 1.
- Normal text triggers `pet.say`.
- `pet.action` and `pet.event` require explicit `/openpet` or `/op` commands.
- Default behavior requires explicit triggers. Private chats can be configured; group chats require a direct bot mention or command.
- Allowlisting supports both `allowedUsers` and `allowedChats`.
- Private chats are gated by user id.
- Group chats are gated by both chat id and user id.
- IM credentials are host-managed secrets and are injected only for this official plugin.
- Phase 1 uses a narrow hard-coded privileged path for `openpet.im-gateway`, not a general plugin secret permission.
- IM raw text and attachments are not persisted.
- Logs and health only store safe metadata such as platform, hashed peer identifiers, trigger type, counts, timestamps, and error codes.
- Control Center gets a first-class IM settings card inside the Plugins pane.
- Health reports gateway-level and per-platform redacted status.
- Phase 1 supports minimal IM command receipts but not AI chat replies.
- Automated tests use fake adapters and mock bridge calls. A real Telegram smoke test is optional and skipped without a token.

## 5. Non-Goals

Phase 1 does not include:

- bidirectional AI chat in IM;
- Telegram webhook mode;
- QQ OneBot real connection;
- QQ official bot real connection;
- WeChat official account, WeCom, iLink, or local-client automation real connection;
- third-party IM adapter API;
- generic plugin `secrets` or `privileged` permission;
- persistence of raw messages, media, voice transcripts, or attachments;
- keyword-to-action rules engine;
- full IM conversation or session contract in `src/shared/openpet-contracts.ts`;
- remote cloud gateway hosting;
- exposing API keys or IM tokens to renderer, dashboards, ordinary plugins, or logs.

## 6. Architecture

### 6.1 Host responsibilities

The OpenPet host owns:

- bundled plugin synchronization for `examples/plugins/im-gateway`;
- plugin enable/disable state;
- native execution approval;
- secret storage for IM tokens;
- narrow startup-time secret injection for `openpet.im-gateway`;
- pet bridge routes;
- optional future AI chat bridge route;
- Control Center settings and status surface.

The host should not import Telegram, QQ, or WeChat SDKs.

### 6.2 Plugin service responsibilities

The IM Gateway service owns:

- adapter registry;
- platform lifecycle;
- long polling;
- message normalization;
- trigger filtering;
- allowlist checks;
- `/openpet` command parsing;
- bridge calls to `/pet/say`, `/pet/action`, and `/pet/event`;
- platform command receipts;
- redacted health response;
- redacted runtime logs.

### 6.3 Internal plugin modules

Recommended layout:

```text
examples/plugins/im-gateway/
  plugin.json
  config.schema.json
  service/
    im-gateway-service.js
    bridge-client.js
    config.js
    health.js
    log-safety.js
    adapters/
      base.js
      registry.js
      fake.js
      telegram.js
      onebot.js
      weixin.js
    core/
      allowlist.js
      commands.js
      gateway.js
      normalize-message.js
      trigger-policy.js
```

The fake adapter is required for tests. `onebot.js` and `weixin.js` should define disabled skeletons only in Phase 1.

## 7. Host Secret Model

IM tokens must not be represented as plain plugin config fields.

Recommended secret ids:

- `im.telegram.botToken`
- future: `im.qq.appSecret`
- future: `im.weixin.token`

Phase 1 should add a narrow host path:

- save Telegram bot token through Control Center IM card;
- persist it in `SecretService`;
- expose only `hasTelegramBotToken` and optional masked preview to the renderer;
- inject the secret only when starting `openpet.im-gateway`;
- never write the token to plugin logs, app logs, dashboards, health JSON, or plugin config.

Recommended environment variable for the service:

- `OPENPET_IM_TELEGRAM_BOT_TOKEN`

This is deliberately not a general plugin secret API.

## 8. Plugin Manifest

The bundled plugin should declare only the permissions it needs:

```json
{
  "id": "openpet.im-gateway",
  "name": "IM Gateway",
  "version": "0.1.0",
  "profile": "runtime",
  "configSchema": "config.schema.json",
  "description": "Connect IM messages to OpenPet pet speech, actions, and status events.",
  "permissions": ["pet:say", "pet:action", "pet:event"],
  "entries": {
    "services": [
      {
        "id": "im-gateway",
        "title": "IM Gateway Service",
        "command": "node ./service/im-gateway-service.js",
        "cwd": ".",
        "health": { "type": "http", "url": "http://127.0.0.1:8796/health" }
      }
    ],
    "dashboards": []
  }
}
```

The exact port can change, but it must be local-only.

## 9. Non-Secret Config

The plugin config schema should contain only non-secret policy:

- `telegramEnabled`: boolean, default false
- `telegramMode`: enum with `"polling"` only in Phase 1
- `privateChatPolicy`: enum, default `"command-only"`
- `groupChatPolicy`: enum, default `"mention-or-command"`
- `allowedUsers`: string, comma-separated Telegram user ids
- `allowedChats`: string, comma-separated Telegram chat ids
- `allowAllPrivateChats`: boolean, default false
- `allowAllGroupChats`: boolean, default false
- `commandAliases`: string, default `"/openpet,/op"`
- `petSayTtlMs`: number, default 6000
- `receiptMode`: enum, default `"commands-only"`

The schema must not include `botToken`, `appSecret`, `password`, or token-like fields.

## 10. Command Protocol

Primary command:

- `/openpet`

Alias:

- `/op`

Phase 1 subcommands:

- `/openpet say <text>`
- `/openpet action <actionId>`
- `/openpet event <type> <message>`
- `/openpet status`

Behavior:

- `say` calls `/pet/say`.
- `action` calls `/pet/action`.
- `event` calls `/pet/event`.
- `status` replies in Telegram with redacted gateway status.
- command success or failure gets a short receipt.
- ordinary trigger text does not get an IM receipt by default.

Receipts must not include full raw user text, secret values, full local paths, or stack traces.

## 11. Trigger Policy

Phase 1 defaults:

- private chat: command-only by default;
- group chat: mention or command by default;
- group mention matching should mean a direct mention of the current bot, not any arbitrary `@handle` text;
- keyword triggers are deferred to a later rule phase and are not part of the Phase 1 shipped policy surface;
- action/event are command-only;
- all triggers must pass allowlist checks.

Allowlist rules:

- private chat: `allowedUsers` or `allowAllPrivateChats`;
- group chat: `allowedChats` or `allowAllGroupChats`, and `allowedUsers`;
- `allowAll*` switches default false;
- empty allowlist means no external user can trigger the gateway.

## 12. Internal Message Model

The plugin should normalize platform updates into an internal object:

```js
{
  platform: 'telegram',
  adapterId: 'telegram',
  chatType: 'private',
  chatId: '...',
  userId: '...',
  userName: '...',
  messageId: '...',
  text: '...',
  isCommand: false,
  isMention: false,
  receivedAt: '2026-07-08T00:00:00.000Z',
  raw: undefined
}
```

This model stays private to the plugin in Phase 1. It must not be added to renderer-facing OpenPet contracts yet.

## 13. Health Model

The service health endpoint should return a redacted shape:

```json
{
  "ok": true,
  "service": "openpet.im-gateway",
  "adapters": {
    "telegram": {
      "enabled": true,
      "status": "connected",
      "mode": "polling",
      "lastMessageAt": "2026-07-08T00:00:00.000Z",
      "lastTriggerAt": "2026-07-08T00:00:00.000Z",
      "triggerCount": 3,
      "lastErrorCode": ""
    },
    "qq": { "enabled": false, "status": "disabled" },
    "weixin": { "enabled": false, "status": "disabled" }
  }
}
```

Forbidden in health responses:

- tokens;
- raw message text;
- raw chat ids unless explicitly needed for setup and approved later;
- raw user ids unless explicitly needed for setup and approved later;
- platform raw payloads;
- local file paths;
- stack traces.

## 14. Control Center UX

Phase 1 should add a first-class IM settings card inside the Plugins pane, not a new top-level tab.

The card should support:

- enable/disable IM Gateway plugin;
- save Telegram bot token without displaying it after save;
- show token saved state;
- configure allowed users and allowed chats;
- choose private/group trigger policy;
- approve native execution;
- start/stop IM Gateway service;
- run health check;
- show redacted platform health;
- optionally test Telegram credentials.

The user should not need to understand generic plugin internals to configure the official IM gateway.

## 15. Logging And Privacy

Phase 1 must not persist raw IM messages or attachments.

Allowed logs:

- platform name;
- adapter status;
- hashed chat id;
- hashed user id;
- hashed message id;
- trigger type;
- command name;
- success/failure;
- short error code;
- timestamp.

Forbidden logs:

- raw text;
- media content;
- voice transcript;
- token or token-like values;
- full platform payloads;
- full stack traces containing request details.

A future debug mode may allow short-lived verbose diagnostics, but it must be explicit, time-limited, and documented separately.

## 16. Testing Plan

Automated tests should not require a real Telegram account.

Recommended test layers:

- `allowlist` unit tests;
- command parser tests for `/openpet` and `/op`;
- trigger policy tests for private and group chats;
- fake adapter tests for normalized messages;
- gateway tests proving pet bridge calls for `say`, `action`, and `event`;
- health summary tests proving redaction;
- service integration test using fake adapter and fake bridge env;
- host tests for narrow secret injection into `openpet.im-gateway` only;
- Control Center adapter or pane tests for token saved state and service controls.

Optional smoke:

- if `OPENPET_IM_TELEGRAM_BOT_TOKEN` exists, run a manual Telegram connection probe;
- skip by default in CI and normal `npm test`.

Suggested verification commands after implementation:

```bash
node --test tests/services/im-gateway*.test.js tests/examples/im-gateway*.test.js
npm run test:core
npm run test:control-center
```

Exact filenames may change with implementation.

## 17. Phase 1 Implementation Checklist

Host:

- add bundled plugin sync entry for `examples/plugins/im-gateway`;
- add narrow `openpet.im-gateway` secret save/read/inject path;
- add renderer-safe token state contract;
- inject `OPENPET_IM_TELEGRAM_BOT_TOKEN` only for this plugin service;
- add Plugins pane IM settings card;
- add tests for secret non-leakage and service env injection.

Plugin:

- scaffold plugin manifest and config schema;
- implement bridge client reading `OPENPET_SERVICE_BRIDGE_URL` and `OPENPET_SERVICE_BRIDGE_TOKEN`;
- implement fake adapter;
- implement Telegram adapter with `grammY` long polling;
- implement adapter registry;
- implement allowlist and trigger policy;
- implement `/openpet` command parser;
- implement redacted health endpoint;
- implement minimal command receipts;
- add tests.

Docs:

- update plugin README;
- document Telegram setup through BotFather;
- document how to find Telegram user/chat ids without persisting raw ids by default;
- document privacy behavior and non-goals.

### Phase 1 milestone record

- Stage 1 plugin core: committed on `dev9` as `f7137192 feat: add IM gateway plugin core`.
- Stage 2 host wiring: committed on `dev9` as `3c23532b feat: wire IM gateway host secrets`.
- Stage 3 Control Center: committed on `dev9` as `d97d7bf9 feat: add IM gateway control center card`.
- Post-review hardening on `dev9`: lock group mention triggers to direct bot mentions, propagate adapter `lastErrorCode` into health, and keep the IM Gateway smoke fixture aligned with the shipped schema.
- Phase 1 MVP foundation is complete on `dev9`; do not start Phase 2 without a new approval.
- Active follow-up work should be tracked in `docs/TODO.md`, while the longer-term shape stays in the sections below.

## 18. Future Work

### Phase 2: AI chat bridge and IM replies

Goal: let IM users talk with OpenPet AI and receive replies in IM.

Development items:

- add a permission-gated service bridge route for `ai:chat`;
- define IM conversation id mapping;
- route AI conversation ids by platform, chat, user, and optional thread;
- support short IM reply delivery through adapters;
- add reply failure handling and retry policy;
- define rate limiting;
- define safe transcript retention rules;
- add tests for AI bridge permission and conversation isolation.

### Phase 3: QQ support

Goal: add real QQ support after Telegram proves the gateway shape.

Development items:

- implement OneBot v11 adapter for NapCat/Lagrange-style deployments;
- evaluate QQ official bot adapter separately for compliant bot scenarios;
- keep OneBot and official QQ credentials and config separate;
- add QQ-specific allowlist handling;
- add QQ command receipt support;
- add platform capability notes in UI;
- add fake and protocol-level tests.

### Phase 4: WeChat support

Goal: support WeChat-like channels without pretending one implementation covers every WeChat surface.

Development items:

- split WeChat options into official account, WeCom, and experimental personal WeChat/iLink tracks;
- document capability and risk differences clearly;
- implement only official or semi-official routes by default;
- keep personal WeChat/iLink behind explicit experimental settings if ever shipped;
- add strict privacy warnings and health limitations;
- avoid ordinary group-chat claims unless verified by the selected backend.

### Phase 5: Better user setup

Goal: reduce Telegram setup friction.

Development items:

- add "who am I" helper for Telegram user id setup;
- add one-time setup command that returns the current chat id;
- add copy buttons for safe ids;
- add setup diagnostics for bot token, polling conflict, and allowlist misses;
- add clearer Control Center empty states.

### Phase 6: Rich trigger rules

Goal: let users map specific IM events to pet behaviors.

Development items:

- keyword-to-action rules;
- per-chat rules;
- per-user rules;
- cooldowns;
- quiet hours;
- rule preview in Control Center;
- test coverage for rule precedence and safety defaults.

### Phase 7: Generic privileged capability review

Goal: decide whether host-managed secrets should become a general plugin capability.

Development items:

- review at least two official plugin use cases;
- design permission wording;
- add install/update permission diff behavior;
- add uninstall cleanup policy;
- add third-party review and catalog implications;
- add renderer contract for secret saved state only;
- keep raw secret access out of ordinary renderer and dashboards.

### Deferred

These are deliberately not planned until a later design:

- Telegram webhook mode;
- remote cloud gateway deployment;
- third-party IM adapter marketplace;
- raw message persistence;
- attachment archiving;
- voice transcription;
- full IM session viewer in Control Center;
- platform SDKs in the Electron main process.

## 19. Risks

- Secret handling can accidentally leak if plugin config fields are used for tokens. Mitigation: host `SecretService` only, saved-state views only.
- Telegram can fail due to token errors, polling conflicts, or network issues while the process remains alive. Mitigation: per-adapter health, explicit error codes, and command receipts.
- Group chat defaults can be too permissive. Mitigation: default to command or mention and require both chat and user allowlists.
- The Telegram-first implementation can bias the abstraction. Mitigation: keep base adapter and fake adapter tests platform-neutral.
- The official privileged plugin can become a backdoor for generic secret access. Mitigation: hard-code Phase 1 privilege to `openpet.im-gateway` only.

## 20. Acceptance Criteria

- `openpet.im-gateway` is bundled and visible in Plugins.
- It is disabled by default.
- Telegram token can be saved without being displayed back to the renderer.
- Starting the service injects the Telegram token only for `openpet.im-gateway`.
- Telegram long polling can receive allowed, explicit triggers.
- Allowed text trigger calls `pet.say`.
- `/openpet action` calls `pet.action`.
- `/openpet event` calls `pet.event`.
- Commands receive short Telegram receipts.
- Health reports gateway and adapter state without raw IM content.
- Raw IM text and attachments are not persisted.
- Automated tests pass without real Telegram credentials.
- Optional Telegram smoke is documented and skipped when no token is present.
