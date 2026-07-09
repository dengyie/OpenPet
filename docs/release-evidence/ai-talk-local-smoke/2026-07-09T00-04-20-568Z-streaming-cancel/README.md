# AI Talk Bubble Chat Smoke Evidence

Generated: 2026-07-09T00:04:20.605Z

This evidence records a sanitized real-provider AI Talk smoke run against the saved OpenPet development gateway configuration, focused on user-triggered streaming cancellation and side-effect isolation.

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
| AI Talk cancel | pass | `streamingAcceptance.canceled = true`, `completed = false`, `memoryExtractionScheduled = false`, and `behaviorDecisionScheduled = false`. |
| Final bubble dispatch | pass | No final assistant reply was dispatched after cancel: `bubbleDispatch.reason = stream-canceled`, `petSayReceived = false`, and `bubbleStateVisible = false`. |
| Cancel telemetry | pass | Correlated logs were copied into `logs/openpet-app.jsonl` for cancellation telemetry review. |

## Artifacts

- Report: `ai-talk-local-smoke-result.json`
- Redacted logs: `logs/openpet-app.jsonl`

## Manual Acceptance

| Review area | Status |
| --- | --- |
| Bubble visible long enough | pending |
| Input usable | pending |

- Notes: _none recorded_
- Request ID: `chat-mrcqvex1-f07984hp`

## Claim Boundary

This evidence confirms that the saved host-side AI Talk wiring can cancel a real-provider streaming request, emit a correlated `requestId`, avoid final assistant bubble dispatch, and avoid memory/behavior side effects after cancel.

It does not by itself prove that transparent popup placement, dwell time comfort, hit-testing, copying behavior, or overall desktop feel have passed fresh human acceptance. The `manualAcceptanceTemplate` in the report remains the handoff point for that human review.

## Reproduction Command

```bash
npm run run-ai-talk-local-smoke -- --message "<message>" --output-dir tmp/ai-talk-streaming-cancel-smoke
npm run create-ai-talk-local-smoke-archive -- --session-dir tmp/ai-talk-streaming-cancel-smoke/2026-07-09T00-04-20-568Z --archive-dir docs/release-evidence/ai-talk-local-smoke/2026-07-09T00-04-20-568Z-streaming-cancel
npm run update-ai-talk-local-smoke-report -- docs/release-evidence/ai-talk-local-smoke/2026-07-09T00-04-20-568Z-streaming-cancel/ai-talk-local-smoke-result.json --bubble-visible-long-enough true --input-usable true --desktop-feel-notes "Record the desktop interaction review here." --validate-complete
```
