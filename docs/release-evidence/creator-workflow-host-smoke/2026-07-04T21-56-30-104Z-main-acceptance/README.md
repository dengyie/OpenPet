# Creator Workflow Host Smoke Evidence

Generated: 2026-07-04T21:59:38.114Z

This evidence records a sanitized host-side one-click Creator Workflow smoke run against the saved OpenPet image Provider configuration.

## Scope

- Source session: `release/creator-workflow-host-smoke/2026-07-04T21-56-30-104Z`
- Reference image: `[redacted-local-reference]/正面.png`
- Scenarios: `new-character`, `existing-action`
- Raw API key: not recorded
- Local user-data path: redacted

## Result

| Scenario | Status | Evidence |
| --- | --- | --- |
| new-character | pass | `smoke-mango-cat` completed in `117526ms`; conditioning: image-edit via /images/edits with 1 reference image(s). |
| existing-action | pass | `smoke-wave` completed in `70413ms`; conditioning: image-edit via /images/edits with 1 reference image(s). |

## Claim Boundary

This archive confirms the current supported one-click path on `main` for the supplied single-image material shape.

It does not by itself prove production art quality or broad multi-view support. Human review is still required before broadening support claims.

## Artifacts

- Report: `creator-workflow-host-smoke-result.json`

## Reproduction Command

```bash
npm run smoke:creator-workflow-host -- --source-user-data-dir "[redacted-local-user-data]" --reference-image "[redacted-local-reference]/正面.png" --scenario both
node scripts/create-creator-workflow-host-smoke-archive.js --session-dir release/creator-workflow-host-smoke/2026-07-04T21-56-30-104Z --archive-dir docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-56-30-104Z-main-acceptance
```

