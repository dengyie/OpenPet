# AI Talk Bubble Chat Smoke Evidence

Generated: 2026-07-04T20:54:59.392Z

This evidence records a sanitized real-provider AI Talk smoke run against the saved OpenPet development gateway configuration, focused on Bubble Chat request correlation and popup dispatch.

## Scope

- Provider: `openai-compatible`
- Base URL: `[redacted-local-url]`
- Chat model: `gpt-5.4`
- Active pet-pack during the run: `duodong`
- Prompt: not recorded in the archive README
- Raw API key: not recorded
- Local user-data path: redacted in the persisted report

## Result

| Check | Status | Evidence |
| --- | --- | --- |
| Connection test | fail | Saved chat Provider configuration failed its connection test with code `network_error`. |
| AI Talk chat | pass | `gpt-5.4` returned `你好，我在这儿。` with `providerLatencyMs = 3565`. |
| Bubble dispatch | pass | `bubbleAcceptance.requestId = chat-mr6ucjyq-chld6t4n`, `bubbleDispatch.petSayReceived = true`, and `bubbleDispatch.bubbleStateVisible = true`. |
| Bubble telemetry | pass | Correlated logs include `ai-talk.chat.started`, `ai-talk.chat.completed`, `pet.say.ingress`, `pet-bubble-chat.window.opened`, `pet-bubble-chat.message.displayed`, `pet-bubble-chat.auto-hide.scheduled`, `pet-bubble-chat.items.updated`; the displayed bubble recorded popup telemetry in `logs/openpet-app.jsonl`. |

## Artifacts

- Report: `ai-talk-local-smoke-result.json`
- Redacted logs: `logs/openpet-app.jsonl`

## Manual Acceptance

| Review area | Status |
| --- | --- |
| Bubble visible long enough | pending |
| Input usable | pending |

- Notes: _none recorded_
- Request ID: `chat-mr6ucjyq-chld6t4n`

## Claim Boundary

This evidence confirms that the saved host-side AI Talk wiring can complete a real-provider chat request, emit a correlated `requestId`, record provider latency, and dispatch the reply into Bubble Chat with visible popup telemetry.

It does not by itself prove that transparent popup placement, dwell time comfort, hit-testing, copying behavior, or overall desktop feel have passed fresh human acceptance. The `manualAcceptanceTemplate` in the report remains the handoff point for that human review.

## Reproduction Command

```bash
npm run run-ai-talk-local-smoke -- --message "<message>" --output-dir ai-talk-local-smoke
npm run create-ai-talk-local-smoke-archive -- --session-dir ai-talk-local-smoke/2026-07-04T20-54-59-358Z --archive-dir docs/release-evidence/ai-talk-local-smoke/2026-07-04T20-54-59-358Z
npm run update-ai-talk-local-smoke-report -- docs/release-evidence/ai-talk-local-smoke/2026-07-04T20-54-59-358Z/ai-talk-local-smoke-result.json --bubble-visible-long-enough true --input-usable true --desktop-feel-notes "Record the desktop interaction review here." --validate-complete
```
