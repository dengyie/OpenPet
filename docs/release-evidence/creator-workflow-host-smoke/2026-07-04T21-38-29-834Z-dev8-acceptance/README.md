# Creator Workflow Host Smoke Evidence

Generated: 2026-07-04T21:41:56.554Z

This evidence records a sanitized host-side one-click Creator Workflow smoke run against the saved OpenPet image Provider configuration.

## Scope

- Source session: `release/creator-workflow-host-smoke/2026-07-04T21-38-29-834Z`
- Reference image: `[redacted-local-reference]/正面.png`
- Scenarios: `new-character`, `existing-action`
- Raw API key: not recorded
- Local user-data path: redacted

## Result

| Scenario | Status | Evidence |
| --- | --- | --- |
| new-character | pass | `smoke-mango-cat` completed in `114453ms`; conditioning: image-edit via /images/edits with 1 reference image(s). |
| existing-action | pass | `smoke-wave` completed in `92198ms`; conditioning: image-edit via /images/edits with 1 reference image(s). |

## Claim Boundary

This archive confirms that the saved host-owned Creator Workflow can complete provider generation, import/apply handoff, and reference-conditioning recording on the current branch with the supplied single-image material shape.

It does not by itself prove production art quality, broad multi-view support, or main-branch acceptance. Human review is still required, and main-branch acceptance remains required before broadening support claims.

## Artifacts

- Report: `creator-workflow-host-smoke-result.json`

## Reproduction Command

```bash
npm run smoke:creator-workflow-host -- --source-user-data-dir "[redacted-local-user-data]" --reference-image "[redacted-local-reference]/正面.png" --scenario both
node scripts/create-creator-workflow-host-smoke-archive.js --session-dir release/creator-workflow-host-smoke/2026-07-04T21-38-29-834Z --archive-dir docs/release-evidence/creator-workflow-host-smoke/2026-07-04T21-38-29-834Z-dev8-acceptance
```

