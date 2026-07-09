# Agent Awareness Local Smoke Evidence

Generated: 2026-07-05T14:32:15.222Z

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
| Session discovery | pass | `sessionCount = 24`, `activeSessionCount = 2`, `totalEvents = 913`. |
| Redaction boundary | pass | `sessionIdsHashed = true`, `projectLabelsRedacted = true`, `noRawPaths = true`, `noLoopbackUrls = true`, `noSecrets = true`. |
| Hook planning | pass | `instructionsFile = codex-hook-plan.md`, `authFile = plugin-auth-file`, and `externalWrites = false`. |
| Poller diagnostics | pass | `seenCount = 913`, `unsupportedLifecycleRecordCount = 0`, `lastError = ""`. |

## Sample Sessions

| Session | Status | Project | Events |
| --- | --- | --- | --- |
| `c769bb02d6f5` | `working` | `OpenPet #262c94` | 6 |
| `d6cbb8caed23` | `completed` | `OpenPet #ea29a6` | 43 |
| `a61ca1ca52e9` | `completed` | `OpenPet #00d409` | 52 |
| `7d80d0d286c1` | `completed` | `awesome-skills #961c50` | 56 |
| `fe3a82c03cfc` | `failed` | `OpenPet #19b550` | 44 |

## Artifacts

- Report: `agent-awareness-local-smoke-result.json`

## Manual Acceptance

| Review area | Status |
| --- | --- |
| Dashboard usefulness | pass |
| Pet speech noise | pass |
| Redaction review | pass |

- Manual review notes: Separate live-app verification outside this archived smoke run confirmed the dev7 app health endpoint showed hook installed; the automated smoke evidence in this report still reflects plan-only hook mode.
- Scope note: manual review notes are operator-entered context. They can mention separate live-app verification outside the archived smoke run, but they do not rewrite the automated smoke facts in this report.

## Claim Boundary

This evidence confirms that the bundled agent-awareness service can discover real local Codex rollout data, reduce it to sanitized session summaries, and preserve the current privacy boundary for archived results.

It does not by itself prove that dashboard usefulness, pet speech noisiness, or the overall desktop interaction feel have passed human acceptance. The `manualAcceptanceTemplate` in the report remains the handoff point for that review.

## Reproduction Command

```bash
npm run run-agent-awareness-local-smoke -- --codex-home ~/.codex --output-dir release/agent-awareness-local-smoke
node scripts/create-agent-awareness-local-smoke-archive.js --session-dir release/agent-awareness-local-smoke/2026-07-05T14-32-15-220Z --archive-dir docs/release-evidence/agent-awareness-local-smoke/2026-07-05T14-32-15-220Z
npm run update-agent-awareness-local-smoke-report -- docs/release-evidence/agent-awareness-local-smoke/2026-07-05T14-32-15-220Z/agent-awareness-local-smoke-result.json --dashboard-useful true --pet-speech-noise-acceptable true --redaction-looks-safe true --notes "Record the human dashboard/noise review here." --validate-complete
```
