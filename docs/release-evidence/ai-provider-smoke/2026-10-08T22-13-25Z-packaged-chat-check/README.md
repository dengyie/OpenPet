# Packaged OpenPet AI Provider Chat Smoke

- Date: 2026-10-08 UTC
- Target: local unsigned macOS arm64 packaged demo
- Provider: `openai-compatible` at `https://api.mangoqwq.com/v1`
- Model: `deepseek-v4-flash`
- Saved configuration: chat enabled and saved; the saved-provider connection check passed in 2,196 ms with reply `ok`
- Model catalog: 182 models were available; the selected chat model was present
- Packaged chat: one short, non-sensitive message completed successfully. The pet returned `OpenPet demo 联通正常！我在这里陪着你哦～ 🐾`
- Chat timing: provider 1,750 ms; total 1,832 ms; six streamed chunks
- Secret handling: the configured credential is test-only; no API-key value or preview is included in this archive
- Image generation: not run because it may be billable and was outside this chat smoke
- Claim boundary: this confirms one packaged text-chat path on this local demo build. It does not establish image-generation behavior, production availability, or signed release readiness.

See `packaged-ai-provider-smoke-report.json` for the sanitized machine-readable record.
