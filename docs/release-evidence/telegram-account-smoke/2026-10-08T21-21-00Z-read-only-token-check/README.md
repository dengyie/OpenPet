# Telegram Bot Read-Only Token Check

- Date: 2026-10-08 UTC
- Check: one Telegram Bot API `getMe` request
- Result: HTTP 200; Telegram returned a valid bot identity
- No polling was started; no `getUpdates`, webhook change, command, or message send was performed
- Account boundary: the canonical Obsidian infrastructure note documents this token as the sole long-poll credential for the existing HK Hermes deployment. OpenPet must not start a second poller with it.
- Claim boundary: token validity only. OpenPet startup readiness, `/openpet whoami`, `/openpet chatid`, allowlist behavior, private AI replies, group mentions, and stop/restart remain unverified.
- Credential handling: the token was read from the canonical Obsidian infrastructure note at runtime and was not included in command arguments, output, or this archive.
