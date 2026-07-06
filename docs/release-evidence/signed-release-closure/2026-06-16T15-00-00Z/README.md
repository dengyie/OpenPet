# Signed Release Closure Historical Baseline

Generated at: 2026-06-16T15:37:18.706Z

This directory preserves the earliest archived signed-release-closure snapshot
 that was committed during the June 16 release-evidence pass.

- `signed-release-closure-report.json` and `.md` already show the release was
  not ready.
- This snapshot predates the later authenticated macOS workflow-artifact import,
  reconstructed Windows smoke/archive bookkeeping, and the newer packaged
  runtime truth surface.
- The blockers here still include older absolute-path missing-file references,
  because this archive was generated before the later archive-shape cleanup and
  path-sanitization work.

Keep this directory as historical evidence of the early closure baseline only.
For the current best statement of `v1.0.1-rc.3` release readiness, use
`../2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun/`.
