# Packaged Runtime Evidence

This directory stores packaged-runtime smoke reports, historical launched sessions, and later pending operator packets.

Start with `2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/` for the current `v1.0.1-rc.3` pending operator packet. The older `2026-06-16T14-52-13-074Z-darwin-arm64/` session is historical launched evidence and remains useful for earlier runtime observations.

These archives preserve runtime report shape and recorded observations. The latest fresh-build unsigned demo run is [2026-10-09T02-18-20-646Z-darwin-arm64/](./2026-10-09T02-18-20-646Z-darwin-arm64/): **11/14** packaged-runtime checks pass using isolated temporary user data. Its three incomplete checks need picker-linked evidence; the 2026-10-08 picker report predates the HTTP picker cutover and remains **8/9**, with `plugin-install-disabled` pending. The earlier [2026-10-08 runtime run](./2026-10-08T23-14-43-864Z-darwin-arm64/) remains historical 14/14 evidence for its earlier build. Code-level HTTP/reverse-channel picker accept/cancel/path-rejection coverage passes without desktop UI. These unsigned reports prove local demo runtime behavior only and do not prove release readiness.
