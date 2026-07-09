# Desktop Picker Intermediate Pending Packet

Generated at: 2026-07-06T16:34:37.954Z

This directory preserves an intermediate Windows desktop-picker pending packet
 generated from the current `v1.0.1-rc.3` release artifacts before the
 cross-platform archive rerun corrected the metadata and added archive
 bookkeeping.

- `desktop-picker-smoke-report.json` still records `platform=win32` but carries
  the older host-derived `arch=arm64` metadata, even though the directory name
  and artifact filenames are `win32/x64`.
- `desktop-picker-smoke-runbook.md` is still useful as an operator instruction
  sheet, but this directory does not include evidence summaries or an archive
  manifest.
- No packaged-app native picker interaction was performed here; every check
  remains `pending`.

Treat this directory as an intermediate operator packet only. For the corrected
current Windows picker archive shape, use
`../2026-07-06T16-46-49Z-win32-x64-authenticated-artifact-archive-rerun/`.
