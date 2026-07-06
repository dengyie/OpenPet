# Desktop Picker Archive Rerun

Generated at: 2026-07-06T16:46:49.000Z

This archive regenerates a pending Windows desktop-picker smoke report from the downloaded `release/` artifacts after fixing cross-platform architecture inference.

- The report now records `platform=win32` and `arch=x64` from artifact filenames rather than host `process.arch`.
- No packaged-app picker interaction was performed; `desktop-picker-evidence/` contains structure-only notes.
- This archive keeps the signed release closure aligned with the current negative truth and does not prove picker readiness.
