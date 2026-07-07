# Creator Studio Example Extension

Creator Studio is a hybrid OpenPet extension that now carries the landed end-to-end pet creation workflow for OpenPet's ordinary-user and advanced creator paths.

The fixture backend creates a deterministic `codex-pet` output for local development. Provider generation uses the host-owned image model bridge, then either creates a reviewable pet-pack atlas for full-pet runs or a reviewable transparent PNG frame sequence for `single-action` runs.

Legacy `cloud` and `local` backend inputs are normalized into the same `provider` path. If host model settings or the bridge are unavailable, the run still fails explicitly instead of silently falling back to fixture output.

Current full-pet policy:

- QA/import currently requires base identity coverage for the economical default path; this is not the same as an official real `idle` row strip.
- Default full-pet generation spends no provider calls on official action row strips, so it must be described as base-pet/preview quality rather than official-quality full action generation.
- Local transform-based fallback rows are compatibility previews only. They must not be claimed as real `idle`, `waving`, `running`, `jumping`, `waiting`, `failed`, or `review` action generation.
- Official-quality Codex pet output requires base generation plus state-specific row-strip generation for all rows, including `idle`, except `running-left` may be framewise-mirrored from an approved `running-right` row.
- The currently verified shortest real-user path is one clean front-facing reference image on the saved `gpt-image-2` gateway path.
- The default one-click path now blocks collage or multi-view references and asks for one clean front-facing image instead.
- Future official-quality row expansion must follow the Codex/hatch-pet contract, not local base-image transforms.
- Current action classes are explicit:
  - base identity coverage today: `idle` preview/fallback only
  - row-specific required for official-quality full-pet output: `idle`, `running-right`, `running-left`, `waving`, `jumping`, `failed`, `waiting`, `running`, `review`
  - only deterministic derivation allowed by the official rules: `running-left` from approved `running-right`, preserving frame order

Current single-action policy:

- Generated action frames must pass deterministic QA before approval or import.
- QA rejects missing/empty frames, reused frames, repeated static sheets, unstable visible area, unstable body anchors, opaque provider backgrounds, and excessive adjacent whole-sprite or face/body-core redraw that indicates identity drift.
- Passing deterministic QA is still not final art approval. Review the contact sheet before importing because metrics cannot fully prove semantic quality or character likeness.
- Independent per-frame provider generation is currently an exploration path for high-likeness references, not the preferred production strategy. Fresh `gpt-image-2` evidence with a user-approved identity-lock board kept the slot anchored but redrew the cat identity between frames, so the import gate correctly rejected it.
- The next production-quality action path should start from an approved canonical frame and apply controlled masked edits, local reference-preserving rig/pose-keyframe synthesis, or another bounded method that moves only the intended action region.

Current commands:

- `create-run`: create a run workspace under `OPENPET_DATA_DIR/runs`.
- `run-step`: generate fixture, full-pet, or single-action output and QA metadata for a run.
- `approve-run`: mark a run approved.
- `import-approved-pet`: ask OpenPet to inspect and import the approved output.
- `import-approved-action`: ask OpenPet to import approved single-action frames through the host-owned creator-tools bridge.
- `export-bundle`: return the generated `.codex-pet.zip` output details.

The dashboard service exposes review data through loopback-only routes. Frame previews and repairs stay inside the Creator Studio run workspace; dashboard responses use data-relative artifact paths and preview URLs rather than raw filesystem paths.
