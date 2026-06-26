# Creator Studio Example Extension

Creator Studio is a hybrid OpenPet extension that demonstrates the end-to-end pet creation workflow planned for hatch-pet style generation.

The fixture backend creates a deterministic `codex-pet` output for local development. Cloud/local provider backends use the host-owned image model bridge, then either create a reviewable pet-pack atlas for full-pet runs or a reviewable transparent PNG frame sequence for `single-action` runs.

`cloud` and `local` backend choices use the same adapter boundary, but now rely on the short-lived OpenPet host model bridge. If host model settings or the bridge are unavailable, the run still fails explicitly instead of silently falling back to fixture output.

Current commands:

- `create-run`: create a run workspace under `OPENPET_DATA_DIR/runs`.
- `run-step`: generate fixture, full-pet, or single-action output and QA metadata for a run.
- `approve-run`: mark a run approved.
- `import-approved-pet`: ask OpenPet to inspect and import the approved output.
- `import-approved-action`: ask OpenPet to import approved single-action frames and submit the trigger proposal to the host-owned creator-tools bridge.
- `export-bundle`: return the generated `.codex-pet.zip` output details.

The dashboard service exposes review data through loopback-only routes. Frame previews and repairs stay inside the Creator Studio run workspace; dashboard responses use data-relative artifact paths and preview URLs rather than raw filesystem paths.

The dashboard now also exposes provider smoke guidance for non-fixture runs so users can verify the host-owned Image Provider path through Control Center before trusting generated assets for production import.
