# Creator Studio Example Extension

Creator Studio is a hybrid OpenPet extension that demonstrates the end-to-end pet creation workflow planned for hatch-pet style generation.

The first implementation uses a deterministic fixture backend by default. It creates a valid `codex-pet` output, moves the run through review, then imports the approved output through OpenPet's host-owned pet-pack bridge.

`cloud` and `local` backend choices use the same adapter boundary, but now rely on the short-lived OpenPet host model bridge. If host model settings or the bridge are unavailable, the run still fails explicitly instead of silently falling back to fixture output.

Current commands:

- `create-run`: create a run workspace under `OPENPET_DATA_DIR/runs`.
- `run-step`: generate fixture output and QA metadata for a run.
- `approve-run`: mark a run approved.
- `import-approved-pet`: ask OpenPet to inspect and import the approved output.
- `export-bundle`: return the generated `.codex-pet.zip` output details.

Future backend adapters can replace the unavailable cloud/local stubs without changing the run workspace contract.
