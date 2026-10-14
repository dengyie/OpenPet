# Desktop Picker Evidence

This directory stores packaged native picker smoke reports and related archive reruns.

The newest local demo observation is [`2026-10-08T21-01-48Z-darwin-arm64/`](./2026-10-08T21-01-48Z-darwin-arm64/): an unsigned macOS arm64 packaged run with **8/9** checks passing. The linked packaged-runtime smoke at [`2026-10-08T23-14-43-864Z-darwin-arm64/`](../packaged-runtime/2026-10-08T23-14-43-864Z-darwin-arm64/) passes all runtime checks that depend on the picker observations. The reviewed plugin was intentionally not installed, so `plugin-install-disabled` remains pending.

Start with `2026-07-06T16-46-49Z-win32-x64-authenticated-artifact-archive-rerun/` for the current corrected Windows structure-only archive. Treat `2026-07-06T17-00-00Z-win32-x64-authenticated-artifact/` as an intermediate packet kept for historical context.

These archives are useful because they preserve picker-report structure and archive bookkeeping. They do not by themselves prove observed packaged-app picker behavior.
