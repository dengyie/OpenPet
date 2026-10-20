# Telegram Account Smoke Evidence

This directory records live Telegram credential and account checks for the IM Gateway demo path.

The current records, `2026-10-08-read-only-token-check/` and `2026-10-08T21-21-00Z-read-only-token-check/`, verify Bot API token identity only. They do not establish OpenPet polling, command handling, allowlists, AI replies, group mentions, or lifecycle behavior. The token is reserved by the existing HK Hermes long-poll deployment, so a live OpenPet account smoke requires a separate token or a coordinated maintenance window.
