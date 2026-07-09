# Signed Release Closure Current Reports

Generated at: 2026-07-06T16:35:04.943Z

This directory preserves an earlier `v1.0.1-rc.3` closure pass built from the current reports before reconstructed Windows smoke and desktop-picker archive manifests were added.

- `signed-release-closure-report.json` and `.md` show the release was already not ready at that point.
- The blockers here still include missing `windows-smoke-archive-manifest.json` and missing `desktop-picker-archive-manifest.json`.
- The later archive rerun at `../2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun/` supersedes this directory for current release-truth reading because it replaces those missing-archive blockers with explicit archived-but-not-ready Windows smoke and desktop-picker manifests.

Keep this directory as historical evidence of the intermediate closure state. Use the later archive rerun when you need the current best statement of `rc.3` release readiness.
