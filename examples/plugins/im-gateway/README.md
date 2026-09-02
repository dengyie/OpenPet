# OpenPet IM Gateway

`openpet.im-gateway` is the bundled official runtime plugin that connects IM
messages to OpenPet pet behavior.

The current runtime supports Telegram through long polling and includes a
development/test-boundary adapter for the official QQ Robot route. The QQ
adapter uses an injected official-protocol transport seam (WebSocket events,
token HTTP exchange, and HTTPS replies); it does not claim real-account
support, and it never falls back to OneBot. WeCom and personal WeChat routes
are out of scope here.

## QQ Official Robot (development/test boundary)

QQ is disabled by default and requires both plugin enablement and native
execution approval. The host stores `appId` and `clientSecret` separately and
injects them only while this service starts. Plugin config contains routing
policy and optional fake-transport URLs only; it never contains credentials.
Automated tests use fake HTTP/WebSocket clients. Real QQ credentials and
account smoke are not part of the development test gate.

The current QQ lifecycle boundary is deliberately conservative: gateway
reconnect (`op 7`) and invalid-session (`op 9`) updates stop the adapter and
report stable `qq-reconnect-required` or `qq-invalid-session` failure codes;
automatic re-identification is not included in this test-version boundary.
Dispatch sequence values are carried in heartbeats and heartbeat requests are
acknowledged.
The selected WeCom route is a self-built application callback. Personal WeChat,
Official Account, iLink, and OneBot are outside the supported routes.

WeCom is disabled by default and requires both plugin enablement and native
execution approval. Store the three WeCom credentials through Control Center;
the child service receives them only at launch. Configuration contains only
tenant/application and callback policy fields.

## Telegram Setup

1. Create a bot with BotFather and copy the bot token.
2. In OpenPet Control Center, enable the IM Gateway plugin.
3. Save the Telegram token in the IM Gateway card. The token is stored by the
   host secret service and is injected only into this plugin service.
4. Approve native execution, then start the IM Gateway Service.
5. In Telegram, send `/openpet whoami` in private chat and `/openpet chatid`
   in the target chat to collect the values needed for `allowedUsers` and
   `allowedChats`.
6. Save the allowlist values in the IM Gateway config.

The helper commands above work even before the allowlist is configured. Other
commands and non-command traffic still require the normal allowlist rules.

Private chats default to command-only. Group chats default to mention-or-command.
Action and event changes always require `/openpet` or `/op`.

## AI Replies (Phase 2)

Telegram AI replies stay host-owned even though the IM transport lives in the
bundled plugin runtime.

- Private text mode can be set to `command-only`, `pet-say`, or `ai-chat`.
- Group AI replies stay off by default and only run when all of these are true:
  direct `@bot` mention, allowlist pass, and `groupAiRepliesEnabled` enabled.
- `/openpet` commands still take priority over free-text AI routing.
- IM conversations are isolated per Telegram context so private chats and group
  mentions do not share a transcript. Durable conversation ids use pseudonymous
  hashes rather than raw Telegram peer identifiers.
- The gateway keeps at most one in-flight AI request plus one queued follow-up
  per conversation. A third private message receives a short busy notice.
- Private AI ingress is limited to 6 accepted requests per 30 seconds; group
  ingress is limited to 3 per 30 seconds. Rate-limit tracking is bounded.
- Host bridge calls time out after 45 seconds, and Telegram update dispatch does
  not wait for a pending AI response before accepting another update. Timeout,
  adapter shutdown, and client disconnect cancellation propagate into the host
  Provider request before a late assistant reply can be persisted.
- Telegram message ids are converted to opaque request hashes before crossing
  the bridge. The AI response DTO contains only `reply` and `requestId`; host
  conversation history and behavior metadata are not returned to the plugin.
- Telegram update ids are retained in a bounded plugin-local state file so
  redelivered updates are ignored across normal service restarts. This is an
  at-most-once duplicate guard, not an exactly-once delivery guarantee.
- The Telegram adapter accepts at most 128 pending handlers globally, silently
  drops excess updates, reports pending/drop counters in health, and aborts
  active handlers during a bounded stop.
- Polling, handler, duplicate-update, overload, AI, and stop failures emit
  rate-limited, bounded JSON diagnostics containing only stable codes and
  counters.
- The host retains at most 500 non-main AI conversations and removes evicted
  conversation messages with them.
- The plugin health view exposes only redacted counters, timestamps, error
  codes, and hashed peer identifiers. Raw transcript text and Telegram ids are
  not exposed there.

## Commands

- `/openpet whoami`
- `/openpet chatid`
- `/openpet say <text>`
- `/openpet action <actionId>`
- `/openpet event <type> <message>`
- `/openpet status`
- `/op ...` as the short alias

## Privacy

Helper replies may include raw Telegram user ids and chat ids in Telegram chat.
Control Center, plugin health, and plugin logs keep those identifiers redacted.

The plugin does not persist raw IM text, attachments, transcripts, tokens, full
platform payloads, or local file paths. Health and logs are limited to adapter
state, timestamps, counts, short error codes, and hashed peer identifiers.

Telegram credentials and routing configuration are immutable while the service
is starting, running, or stopping. Stop the service before changing them.

## Verification Boundary

The packaged service uses the bundled Electron Node runtime for declared
`node` entries, so it does not require a separately installed system Node.

The automated suite covers simulated grammY polling, readiness, allowlists,
commands, AI routing, bridge timeouts and disconnect cancellation, global
handler overload, bounded shutdown, narrow AI bridge responses, rate limits,
retention, duplicate updates, command targeting, bounded diagnostics, and
redaction. A real Telegram Bot Token smoke session remains a manual follow-up
and is not part of the repository test suite.
