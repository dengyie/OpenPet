# Historical Packaged Runtime Launch Smoke

Generated at: 2026-06-16T14:52:15.961Z

This directory preserves the historical launched macOS packaged-runtime smoke
 session from the June 16 release-evidence pass.

- `packaged-runtime-smoke-report.json` proves that an unsigned packaged macOS
  app launched and that transparent rendering, bubble visibility, action frame
  advancement, built-in pack switching, and stable-state restoration were all
  observed in that session.
- The same report still leaves `plugin-picker-evidence-linked` and
  `pet-picker-evidence-linked` as `pending`, and keeps
  `invalid-package-feedback` as `blocked`.
- The archived report and evidence JSON still contain older absolute local path
  references because this session predates the later release-evidence hygiene
  and archive-clarity passes.

Keep this directory as historical launched runtime evidence only. For the
current `v1.0.1-rc.3` packaged-runtime operator packet, use
`../2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/`. For the
current aggregate release-truth statement, use
`../../signed-release-closure/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-closure-archive-rerun/`.
