# AI Provider Test-Key Authentication Check

- Date: 2026-10-08
- Target: documented OpenAI-compatible test gateway (`https://api.mangoqwq.com/v1`)
- Check: one read-only `GET /models` request
- Result: HTTP 401 Unauthorized; provider acceptance not established
- Follow-up requests: chat and image generation were withheld after authentication failed
- Credential handling: key was read from the canonical Obsidian test-API note at runtime and was not included in command arguments, output, or this archive
- Claim boundary: this records a failed authentication check only. It does not establish model availability, chat completion, image generation, or packaged-app provider acceptance.
