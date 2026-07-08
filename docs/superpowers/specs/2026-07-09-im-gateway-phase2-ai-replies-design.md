# IM Gateway Phase 2 AI Replies Design

> Date: 2026-07-09
> Branch: `dev9`
> Status: approved for implementation planning
> Scope: Telegram AI replies through the bundled `openpet.im-gateway` plugin using a host-owned AI bridge

## 1. Purpose

Phase 1 proved that OpenPet can accept Telegram-triggered pet speech and explicit `/openpet` commands through an official bundled plugin without moving IM platform SDKs into the main process.

Phase 2 should add real AI reply capability while keeping the same architectural boundary:

- the IM gateway remains a bundled privileged plugin service;
- AI providers, persona, memory, and secret ownership remain host-owned;
- the plugin only routes IM traffic, constructs stable IM conversation keys, and delivers IM replies.

The immediate goal is not a general IM bot platform. The goal is a safe, conservative Telegram-first AI reply path that still respects OpenPet's existing plugin and AI boundaries.

## 2. Confirmed Product Decisions

- The implementation uses the existing bundled plugin route, not a new main-process IM subsystem.
- The first Phase 2 target is Telegram only.
- Allowed private-chat non-command text can route to AI.
- Group AI replies require all of the following:
  - allowlist passes;
  - the message directly mentions the current bot;
  - the user explicitly enables group AI replies in IM Gateway config.
- `/openpet` commands continue to own explicit `say`, `action`, `event`, and `status` control flows.
- Conversation continuity is per user-facing IM context, not global:
  - private chat conversation key: `platform + chatId + userId`;
  - group chat conversation key: `platform + chatId + userId`.
- Group chats do not share a single AI conversation across all members.
- The host AI system remains the source of truth for:
  - provider config;
  - API keys;
  - persona;
  - memory;
  - trace and diagnostics;
  - reply generation.

## 3. Non-Goals

Phase 2 does not include:

- QQ real AI replies;
- WeChat real AI replies;
- media, image, sticker, or voice-message understanding;
- IM-triggered `pet.action` or `pet.event` from AI free text;
- a general plugin secret capability;
- a public generic IM adapter framework;
- group-shared conversation state;
- exposing IM transcript text to renderer config surfaces or plugin config;
- a second independent AI transcript stack inside the IM plugin.

## 4. Architecture

### 4.1 Boundary choice

Use a host-owned AI bridge.

The plugin service should not call provider SDKs directly and should not keep its own durable transcript rules. Instead, the host should expose one additional service-bridge route:

- `POST /ai/chat`

This route should only be available to long-running plugin service bridge runtimes and should still require manifest permission checks.

### 4.2 Why this route

This design fits the existing repository better than plugin-local AI state:

- command-style plugins already have an `ai:chat` capability through `PluginService`;
- IM Gateway already uses a long-running service bridge for `/pet/say`, `/pet/action`, and `/pet/event`;
- `aiTalkService` already owns persona, memory, trace, and conversation persistence behavior.

The new work is therefore an extension of an existing trusted boundary, not a parallel AI subsystem.

### 4.3 Responsibility split

Host owns:

- AI provider configuration;
- API keys and secret storage;
- AI conversation persistence;
- persona and memory injection;
- trace and diagnostics;
- request throttling policy for the host AI call;
- reply generation.

Plugin owns:

- Telegram message eligibility checks;
- IM-specific conversation key construction;
- per-conversation in-flight and queue state;
- IM reply sending;
- IM-safe receipts and error notices;
- IM-safe health counters.

## 5. Host AI Bridge Contract

### 5.1 Permission model

`openpet.im-gateway` must explicitly declare `ai:chat` in its manifest before it can use `/ai/chat`.

The host should reject `/ai/chat` for service bridge callers that do not have `ai:chat`.

### 5.2 Bridge request

The IM Gateway plugin should send a bounded JSON payload such as:

```json
{
  "message": "Hello there",
  "conversationKey": "telegram:private:1001:1001",
  "entrypoint": "im-gateway",
  "sourceContext": {
    "platform": "telegram",
    "chatType": "private",
    "chatId": "1001",
    "userId": "1001",
    "messageId": "42"
  }
}
```

The exact wire shape can evolve, but the host-owned route must receive:

- the normalized user message;
- a stable IM conversation key;
- an `entrypoint` value that identifies IM Gateway traffic;
- enough redacted source context for diagnostics and namespacing.

### 5.3 Host conversation namespace

The host should map plugin service requests into a namespaced AI conversation id such as:

```text
plugin:openpet.im-gateway:service:im-gateway:telegram:private:1001:1001
```

This namespace must guarantee:

- no collision with Control Center AI chats;
- no collision with other plugins;
- no collision between private and group contexts;
- no cross-user contamination inside the same Telegram group.

### 5.4 AI service path

The primary path should go through `aiTalkService`, not a one-off `aiService.chat` call.

Phase 2 should therefore add a host entrypoint-aware AI talk method, for example:

- `chatFromEntrypoint(...)`, or
- an equivalent extension of `aiTalkService.chat(...)`

The chosen host path must support:

- external conversation ids or conversation keys;
- `entrypoint: "im-gateway"`;
- the same persona, memory, and trace behavior already used by host-owned AI flows.

If the implementation keeps a narrow fallback path for environments where `aiTalkService` is unavailable, that fallback should be explicit and secondary. The main product path is `aiTalkService`.

## 6. Message Routing Rules

### 6.1 Preserve command priority

All IM messages continue through this order:

1. allowlist gate;
2. explicit `/openpet` command parsing;
3. AI or `pet.say` routing for non-command text.

`/openpet` commands must keep their Phase 1 meaning and must not be silently reinterpreted as AI chat requests.

### 6.2 Private chats

Add a new config field:

- `privateTextMode`: `"command-only" | "pet-say" | "ai-chat"`

Default:

- `"command-only"`

Behavior:

- `command-only`: ordinary non-command private text is ignored;
- `pet-say`: keep the Phase 1 direct `pet.say` behavior;
- `ai-chat`: ordinary non-command private text is sent to the host AI bridge.

Do not overload the existing Phase 1 routing by silently changing the meaning of previously saved settings. The new AI behavior must be explicit.

Migration rule:

- keep the existing `privateChatPolicy` field for Phase 1 compatibility;
- when a saved config has no `privateTextMode`, derive it from the old field:
  - `command-only` -> `command-only`
  - `any-text` -> `pet-say`
- once `privateTextMode` exists, it becomes the only private non-command routing field used by Phase 2 logic.

### 6.3 Group chats

Add a new config field:

- `groupAiRepliesEnabled: boolean`

Default:

- `false`

Group AI replies are allowed only when:

- the chat is a group or supergroup;
- allowlist passes;
- the message directly mentions the current bot;
- `groupAiRepliesEnabled === true`.

If `groupAiRepliesEnabled === false`, direct mentions keep the Phase 1 behavior and can still trigger local `pet.say` according to the shipped trigger policy.
If `groupAiRepliesEnabled === true`, the AI reply path takes precedence for eligible direct-mention group text so one message does not both send an IM AI reply and trigger a duplicate local `pet.say`.

### 6.4 Group reply style

Phase 2 group AI replies are short-text replies only.

They should not:

- execute behavior tools into `pet.action` or `pet.event`;
- emit long multi-paragraph responses;
- claim to support full group conversation orchestration.

Before sending group text to the host AI route, the plugin should strip the matched direct bot mention token from the user message so the model receives the actual user utterance instead of a repeated `@bot` prefix.

## 7. Control Center Config Surface

The Plugins-pane IM Gateway card should add non-secret policy controls for:

- `privateTextMode`
- `groupAiRepliesEnabled`

The existing host-owned Telegram token controls stay unchanged:

- tokens remain host-owned secrets;
- renderer only sees saved-state booleans;
- no token text is ever rendered back after save.

Phase 2 should keep the IM Gateway card as the only user-facing configuration surface. No manual config-file edits should be required.

## 8. Conversation and Queue Model

### 8.1 Conversation identity

Use the normalized IM route key:

- private: `telegram:private:<chatId>:<userId>`
- group: `telegram:group:<chatId>:<userId>`

The plugin should treat this as its local conversation key and pass it to the host AI bridge for namespaced mapping.

### 8.2 In-flight behavior

Each IM conversation key should allow:

- at most one in-flight AI request;
- at most one queued follow-up request.

If a third message arrives while one request is running and one is already queued:

- private chat: return a short busy notice;
- group chat: drop the extra AI reply attempt silently and record a redacted diagnostic.

This keeps ordering stable without letting a single user or group create an unbounded backlog.

## 9. Failure Handling and Limits

### 9.1 Private-chat failures

If AI generation fails, times out, or returns an empty reply:

- send one short private-chat failure notice;
- update IM Gateway diagnostics and health;
- do not leak provider internals, stack traces, or raw host errors.

### 9.2 Group-chat failures

If group AI generation fails:

- default to silent failure in the group chat;
- record a redacted diagnostic;
- update IM Gateway health counters.

This default is intentionally conservative to avoid noisy failures in group contexts.

### 9.3 Telegram send failures

If Telegram reply delivery fails:

- record a redacted error code;
- update per-adapter health;
- do not retry indefinitely.

### 9.4 Length limits

Phase 2 should introduce conservative IM limits before calling the host AI system:

- private inbound text: cap to 2000 chars;
- group inbound text after mention cleanup: cap to 500 chars;
- private reply text: cap to 800 chars;
- group reply text: cap to 160 chars.

Exact constants should live in plugin-local code and tests, but the product intent is clear: IM replies are more conservative than full Control Center chat.

## 10. Observability and Privacy

### 10.1 Plugin health additions

Extend IM Gateway redacted health with AI summary fields:

- `lastAiReplyAt`
- `aiReplyCount`
- `lastAiErrorCode`

These fields are plugin-local, operator-facing diagnostics only.

### 10.2 Redaction rules

The following must not appear in plugin health, plugin logs, or renderer config:

- raw IM transcript text;
- tokens or credentials;
- provider raw error bodies;
- stack traces;
- raw chat ids or raw user ids in operator-facing health unless a future setup helper explicitly scopes that output.

Hashed peer ids and short error codes remain allowed.

### 10.3 AI trace integration

Host AI trace should record that the request came from:

- `entrypoint: "im-gateway"`

It should still preserve the existing privacy model for trace exports and diagnostics.

## 11. Test Strategy

### 11.1 Node and service tests

Add tests for:

- service bridge `/ai/chat` permission checks;
- IM Gateway private `ai-chat` routing;
- group AI replies disabled by default;
- group AI replies enabled only for direct bot mentions;
- conversation namespacing;
- per-conversation in-flight and one-item queue behavior;
- private failure notice behavior;
- group silent-failure behavior;
- health propagation for AI reply counters and AI error codes;
- redaction of raw IM text in health and logs.

### 11.2 Control Center tests

Add tests for:

- saving and reloading `privateTextMode`;
- saving and reloading `groupAiRepliesEnabled`;
- coexistence of IM token controls and AI reply config;
- demo API and smoke coverage for the new controls.

### 11.3 Regression tests

Keep and extend regressions that protect:

- `/openpet say|action|event|status`;
- direct bot mention matching;
- host-owned secret boundaries;
- plugin-local IM adapter boundaries;
- no AI route without `ai:chat` permission.

## 12. Implementation Slices

### Stage A: Host bridge

- add service-bridge `/ai/chat`;
- enforce `ai:chat` permission for service callers;
- add namespaced IM conversation mapping into host AI talk.

### Stage B: Plugin routing

- add `privateTextMode`;
- add `groupAiRepliesEnabled`;
- route eligible private and group text through the AI bridge.

### Stage C: Safety and diagnostics

- add per-conversation in-flight and queue handling;
- add length limits;
- add failure notices and AI diagnostics fields.

### Stage D: Control Center and docs

- add Plugins-pane config controls;
- extend smoke and demo coverage;
- update IM Gateway docs and active backlog references.

## 13. Acceptance Criteria

Phase 2 is ready only when all of the following are true:

- allowed Telegram private chats can use AI replies through host-owned AI configuration;
- allowed Telegram group chats only receive AI replies when directly mentioning the bot and when the explicit group AI toggle is enabled;
- `/openpet` commands still work unchanged;
- IM conversations remain isolated per user-facing chat context;
- AI requests from IM are visible in host AI trace with an IM-specific entrypoint;
- plugin logs and health remain redacted;
- Node and Control Center regression coverage pass.
