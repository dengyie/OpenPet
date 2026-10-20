# Telegram Bot Read-Only Token Check

- Date: 2026-10-08
- Check: one Telegram Bot API `getMe` request
- Result: HTTP 200; Telegram confirmed the credential identifies a bot
- No polling was started; no `getUpdates`, webhook change, command, or message send was performed
- Account boundary: the canonical Obsidian infrastructure note documents this bot as the sole long-poll bot for an existing deployment. OpenPet must not start polling it concurrently.
- Claim boundary: bot-token validity only. OpenPet startup readiness, `/openpet whoami`, `/openpet chatid`, allowlist, AI replies, group mentions, and stop/restart remain unverified.
- Credential handling: token was read from the canonical Obsidian infrastructure note at runtime and was not included in command arguments, output, or this archive.
