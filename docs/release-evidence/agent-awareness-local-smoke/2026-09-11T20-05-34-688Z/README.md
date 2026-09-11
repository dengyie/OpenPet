# Agent Awareness Local Smoke Evidence

Generated: 2026-09-11T20:05:34.689Z

This evidence records a sanitized real-Codex agent-awareness smoke run against a local Codex home, focused on privacy-safe session discovery, diagnostics, and hook-plan readiness.

## Scope

- Sanitized signal detected: `true`
- Hook-plan available: `true`
- Service health: `true`
- Codex home path: redacted
- Health URL: redacted

## Result

| Check | Status | Evidence |
| --- | --- | --- |
| Session discovery | pass | `sessionCount = 19`, `activeSessionCount = 1`, `totalEvents = 134`. |
| Redaction boundary | pass | `sessionIdsHashed = true`, `projectLabelsRedacted = true`, `noRawPaths = true`, `noLoopbackUrls = true`, `noSecrets = true`. |
| Hook planning | pass | `instructionsFile = codex-hook-plan.md`, `authFile = plugin-auth-file`, and `externalWrites = false`. |
| Poller diagnostics | pass | `seenCount = 134`, `unsupportedLifecycleRecordCount = 268`, `lastError = ""`. |
| Notification policy | pass | `eventCount = 5`, `speechCount = 2`, `suppressedSpeechCount = 3`, `routineStatusSuppressed = true`, `urgentTransitionSpoke = true`, `repeatedUrgentSuppressed = true`, `repeatedCompletionSuppressed = true`. |

## Sample Sessions

| Session | Status | Project | Events |
| --- | --- | --- | --- |
| `8ef09d547c79` | `working` | `OpenPet #19b550` | 37 |
| `0b3b652d25f3` | `completed` | `OpenPet #19b550` | 14 |
| `e0824d9322bc` | `completed` | `test #750302` | 10 |
| `79ee402bd832` | `completed` | `OpenPet #19b550` | 8 |
| `a85cf0b3d8a0` | `completed` | `OpenPet #19b550` | 6 |
| `80abf93f945c` | `completed` | `OpenPet #19b550` | 2 |
| `ee47f1044fdc` | `completed` | `OpenPet #19b550` | 2 |
| `3a677e441d5f` | `failed` | `OpenPet #19b550` | 2 |

## Artifacts

- Report: `agent-awareness-local-smoke-result.json`

## Manual Acceptance

| Review area | Status |
| --- | --- |
| Dashboard usefulness | pending |
| Pet speech noise | pending |
| Redaction review | pass |

- Manual review notes: _none recorded_
- Scope note: manual review notes are operator-entered context. They can mention separate live-app verification outside the archived smoke run, but they do not rewrite the automated smoke facts in this report.

## Claim Boundary

This evidence confirms that the bundled agent-awareness service can discover real local Codex rollout data, reduce it to sanitized session summaries, and preserve the current privacy boundary for archived results.

The synthetic notification-policy evidence exercises the plugin state mapper with bounded metadata only. It proves the low-noise policy shape is wired into the smoke artifact, but it is not a substitute for watching the desktop pet during a real session.

It does not by itself prove that dashboard usefulness, pet speech noisiness, or the overall desktop interaction feel have passed human acceptance. The `manualAcceptanceTemplate` in the report remains the handoff point for that review.

## Reproduction Command

```bash
npm run run-agent-awareness-local-smoke -- --codex-home ~/.codex --output-dir agent-awareness-local-smoke
node scripts/create-agent-awareness-local-smoke-archive.js --session-dir agent-awareness-local-smoke/2026-09-11T20-05-34-688Z --archive-dir docs/release-evidence/agent-awareness-local-smoke/2026-09-11T20-05-34-688Z
npm run update-agent-awareness-local-smoke-report -- docs/release-evidence/agent-awareness-local-smoke/2026-09-11T20-05-34-688Z/agent-awareness-local-smoke-result.json --dashboard-useful true --pet-speech-noise-acceptable true --redaction-looks-safe true --notes "Record the human dashboard/noise review here." --validate-complete
```
