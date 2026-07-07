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
