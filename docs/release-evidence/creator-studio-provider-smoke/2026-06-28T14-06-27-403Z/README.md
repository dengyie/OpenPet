# Creator Studio Provider Smoke Evidence

Generated: 2026-06-28T14:06:27.408Z

This evidence records a sanitized host-side Creator Studio smoke run against the saved OpenPet image Provider configuration.

## Scope

- Base URL host: `127.0.0.1:8317`
- Provider: `openai-compatible`
- Model: `gpt-image-2`
- Backend mode: `provider`
- Prompt mode: single action (`provider-smoke-wave` / `开心挥手`)
- Prompt text: `新增一个自定义动作：开心挥手，菜单手动触发，保持当前宠物风格。`
- Requested generation constraints: `512x512`
- Archived source PNG dimensions: `1254x1254` as returned by the provider
- Temporary timeout override: `420000ms`
- Raw API key: not recorded

## Result

| Check | Status | Evidence |
| --- | --- | --- |
| Health check | pass | `/models` probe succeeded and the saved `gpt-image-2` model was discoverable. |
| Image generation | pass | Provider returned one PNG output after `265004ms` with HTTP `200`. |
| Action-frame QA | pass | 16 visible frames were produced with `warningCount = 0`. |

## Artifacts

- Report: `creator-studio-provider-smoke-result.json`
- Source image: `frames/base/0001.png`
- QA report: `qa/action-frame-validation.json`
- QA contact sheet: `qa/action-frame-contact-sheet.png`
- Redacted logs: `logs/openpet-app.jsonl`

## Claim Boundary

This evidence confirms that the saved host-owned Creator Studio image Provider configuration can complete the OpenPet prompt-builder, provider image generation, and action-frame QA chain with the current OpenPet development gateway.

It does not prove production art quality, transparent-background perfection across providers, import-ready asset quality for release claims, or that lower timeout settings will succeed reliably. Human review of the generated image and contact sheet is still required before any production asset-quality claim.

## Reproduction Command

```bash
npm run smoke:creator-studio-provider -- --prompt "新增一个自定义动作：开心挥手，菜单手动触发，保持当前宠物风格。" --width 512 --height 512 --timeout-ms 420000
```
