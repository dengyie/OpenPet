# AI Talk Bubble Chat Smoke Evidence

Generated: 2026-06-28T15:35:59.235Z

This evidence records a sanitized real-provider AI Talk smoke run against the saved OpenPet development gateway configuration, focused on Bubble Chat request correlation and popup dispatch.

## Scope

- Provider: `openai-compatible`
- Base URL: `http://127.0.0.1:8317/v1`
- Chat model: `gpt-5.5`
- Active pet-pack during the run: `duodong`
- Prompt: `你好，请用一句简短中文回复，用于 bubble chat 验收`
- Raw API key: not recorded
- Local user-data path: redacted in the persisted report

## Result

| Check | Status | Evidence |
| --- | --- | --- |
| Connection test | pass | Saved chat Provider configuration completed a connection test in `2656ms`. |
| AI Talk chat | pass | `gpt-5.5` returned `你好呀，我在这儿陪你～🐾` with `providerLatencyMs = 2141`. |
| Bubble dispatch | pass | `bubbleAcceptance.requestId = chat-mqxyb5gj-6tvex3h5`, `bubbleDispatch.petSayReceived = true`, and `bubbleDispatch.bubbleStateVisible = true`. |
| Bubble telemetry | pass | Correlated logs include `ai-talk.chat.started`, `ai-talk.chat.completed`, `pet-bubble-chat.message.displayed`, and `pet-bubble-chat.items.updated`; the displayed bubble used `ttlMs = 9835` before auto-hide. |

## Artifacts

- Report: `ai-talk-local-smoke-result.json`
- Redacted logs: `logs/openpet-app.jsonl`

## Claim Boundary

This evidence confirms that the saved host-side AI Talk wiring can complete a real-provider chat request, emit a correlated `requestId`, record provider latency, and dispatch the reply into Bubble Chat with visible popup telemetry.

It does not by itself prove that transparent popup placement, dwell time comfort, hit-testing, copying behavior, or overall desktop feel have passed fresh human acceptance. The `manualAcceptanceTemplate` in the report remains the handoff point for that human review.

## Reproduction Command

```bash
npm run run-ai-talk-local-smoke -- --message "你好，请用一句简短中文回复，用于 bubble chat 验收" --output-dir tmp/real-provider-chat-acceptance
```
