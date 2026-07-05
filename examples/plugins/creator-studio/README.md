# Creator Studio Example Extension

Creator Studio is a hybrid OpenPet extension that now carries the landed end-to-end pet creation workflow for OpenPet's ordinary-user and advanced creator paths.

The fixture backend creates a deterministic `codex-pet` output for local development. Provider generation uses the host-owned image model bridge, then either creates a reviewable pet-pack atlas for full-pet runs or a reviewable transparent PNG frame sequence for `single-action` runs.

Legacy `cloud` and `local` backend inputs are normalized into the same `provider` path. If host model settings or the bridge are unavailable, the run still fails explicitly instead of silently falling back to fixture output.

Current full-pet policy:

- QA/import requires real `idle` and `waving` coverage.
- Host-side extra pose generation is intentionally limited to `waving`.
- Other atlas rows may fall back from the validated base pose.
- The currently verified shortest real-user path is one clean front-facing reference image on the saved `gpt-image-2` gateway path.
- The default one-click path now blocks collage or multi-view references and asks for one clean front-facing image instead.
- Future optional real-action expansion is queued, not active by default, in this order: `waiting`, `running-right`, `running-left`.
- Current action classes are explicit:
  - required real: `idle`, `waving`
  - queued optional attempted real, still disabled in the default path: `waiting`, `running-right`, `running-left`
  - fallback-only today: `jumping`, `failed`, `running`, `review`

Current commands:

- `create-run`: create a run workspace under `OPENPET_DATA_DIR/runs`.
- `run-step`: generate fixture, full-pet, or single-action output and QA metadata for a run.
- `approve-run`: mark a run approved.
- `import-approved-pet`: ask OpenPet to inspect and import the approved output.
- `import-approved-action`: ask OpenPet to import approved single-action frames through the host-owned creator-tools bridge.
- `export-bundle`: return the generated `.codex-pet.zip` output details.

The dashboard service exposes review data through loopback-only routes. Frame previews and repairs stay inside the Creator Studio run workspace; dashboard responses use data-relative artifact paths and preview URLs rather than raw filesystem paths.
