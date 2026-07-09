# Public Release Metadata Snapshots

This directory stores structured snapshots of what was publicly attached to a GitHub Release at the time of collection.

The current `v1.0.1-rc.3` snapshot at `2026-07-06T15-57-51Z-v1.0.1-rc.3-public-release-metadata.json` records:

- the successful release workflow run that published the assets;
- the public macOS and Windows asset filenames, URLs, and sizes;
- the workflow artifacts that were also available to maintainers; and
- the key public observations that Windows assets were explicitly labeled `unsigned` while macOS signed readiness still required separate verification evidence.

This metadata is useful because it preserves the public release surface in one machine-readable file. It does not prove signing, runtime smoke success, or release readiness by itself.
