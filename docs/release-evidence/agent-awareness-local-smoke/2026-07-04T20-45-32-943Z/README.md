# Agent Awareness Local Smoke Evidence

Generated: 2026-07-04T20:45:32.944Z

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
| Session discovery | pass | `sessionCount = 24`, `activeSessionCount = 4`, `totalEvents = 872`. |
| Redaction boundary | pass | `sessionIdsHashed = true`, `projectLabelsRedacted = true`, `noRawPaths = true`, `noLoopbackUrls = true`, `noSecrets = true`. |
| Hook planning | pass | `instructionsFile = codex-hook-plan.md`, `authFile = plugin-auth-file`, and `externalWrites = false`. |
| Poller diagnostics | pass | `seenCount = 872`, `unsupportedLifecycleRecordCount = 0`, `lastError = ""`. |

## Sample Sessions

| Session | Status | Project | Events |
| --- | --- | --- | --- |
| `c769bb02d6f5` | `working` | `OpenPet #262c94` | 34 |
| `3a6f9de523a3` | `thinking` | `codex #5bd67c` | 39 |
| `d6cbb8caed23` | `completed` | `OpenPet #ea29a6` | 21 |
| `fe3a82c03cfc` | `thinking` | `OpenPet #19b550` | 23 |
| `24bd228a131d` | `thinking` | `OpenPet #19b550` | 3 |

## Artifacts

- Report: `agent-awareness-local-smoke-result.json`

## Manual Acceptance

| Review area | Status |
| --- | --- |
| Dashboard usefulness | pending |
| Pet speech noise | pending |
| Redaction review | pass |

- Notes: _none recorded_

## Claim Boundary

This evidence confirms that the bundled agent-awareness service can discover real local Codex rollout data, reduce it to sanitized session summaries, and preserve the current privacy boundary for archived results.

It does not by itself prove that dashboard usefulness, pet speech noisiness, or the overall desktop interaction feel have passed human acceptance. The `manualAcceptanceTemplate` in the report remains the handoff point for that review.

## Reproduction Command

```bash
npm run run-agent-awareness-local-smoke -- --codex-home ~/.codex --output-dir agent-awareness-local-smoke
node scripts/create-agent-awareness-local-smoke-archive.js --session-dir agent-awareness-local-smoke/2026-07-04T20-45-32-943Z --archive-dir docs/release-evidence/agent-awareness-local-smoke/2026-07-04T20-45-32-943Z
npm run update-agent-awareness-local-smoke-report -- docs/release-evidence/agent-awareness-local-smoke/2026-07-04T20-45-32-943Z/agent-awareness-local-smoke-result.json --dashboard-useful true --pet-speech-noise-acceptable true --redaction-looks-safe true --notes "Record the human dashboard/noise review here." --validate-complete
```
