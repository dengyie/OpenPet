# Agent Awareness Local Smoke Evidence

Generated: 2026-07-03T16:04:08.847Z

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
| Session discovery | pass | `sessionCount = 20`, `activeSessionCount = 3`, `totalEvents = 1000`. |
| Redaction boundary | pass | `sessionIdsHashed = true`, `projectLabelsRedacted = true`, `noRawPaths = true`, `noLoopbackUrls = true`, `noSecrets = true`. |
| Hook planning | pass | `instructionsFile = codex-hook-plan.md`, `authFile = plugin-auth-file`, and `externalWrites = false`. |
| Poller diagnostics | pass | `seenCount = 1374`, `unsupportedLifecycleRecordCount = 0`, `lastError = ""`. |

## Sample Sessions

| Session | Status | Project | Events |
| --- | --- | --- | --- |
| `c769bb02d6f5` | `working` | `OpenPet #262c94` | 63 |
| `e2b6e7df2708` | `working` | `OpenPet #586229` | 71 |
| `04863673f289` | `working` | `OpenPet #834bd8` | 69 |
| `16b03e6e8010` | `failed` | `OpenPet #586229` | 60 |
| `a61ca1ca52e9` | `completed` | `OpenPet #00d409` | 66 |

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
node scripts/create-agent-awareness-local-smoke-archive.js --session-dir agent-awareness-local-smoke/2026-07-03T16-04-08-824Z --archive-dir docs/release-evidence/agent-awareness-local-smoke/2026-07-03T16-04-08-824Z
npm run update-agent-awareness-local-smoke-report -- docs/release-evidence/agent-awareness-local-smoke/2026-07-03T16-04-08-824Z/agent-awareness-local-smoke-result.json --dashboard-useful true --pet-speech-noise-acceptable true --redaction-looks-safe true --notes "Record the human dashboard/noise review here." --validate-complete
```
