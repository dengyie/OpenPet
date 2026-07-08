# OpenPet IM Gateway

`openpet.im-gateway` is the bundled official runtime plugin that connects IM
messages to OpenPet pet behavior.

Phase 1 supports Telegram through long polling. QQ and WeChat are represented
by disabled adapter skeletons so the gateway shape can evolve without putting
platform SDKs into the OpenPet main process.

## Telegram Setup

1. Create a bot with BotFather and copy the bot token.
2. In OpenPet Control Center, enable the IM Gateway plugin.
3. Save the Telegram token in the IM Gateway card. The token is stored by the
   host secret service and is injected only into this plugin service.
4. Add allowed Telegram user ids and, for groups, allowed chat ids.
5. Approve native execution, then start the IM Gateway Service.

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
  mentions do not share a transcript.
- The gateway keeps at most one in-flight AI request plus one queued follow-up
  per conversation. A third private message receives a short busy notice.
- The plugin health view exposes only redacted counters, timestamps, error
  codes, and hashed peer identifiers. Raw transcript text and Telegram ids are
  not exposed there.

## Commands

- `/openpet say <text>`
- `/openpet action <actionId>`
- `/openpet event <type> <message>`
- `/openpet status`
- `/op ...` as the short alias

## Privacy

The plugin does not persist raw IM text, attachments, transcripts, tokens, full
platform payloads, or local file paths. Health and logs are limited to adapter
state, timestamps, counts, short error codes, and hashed peer identifiers.
