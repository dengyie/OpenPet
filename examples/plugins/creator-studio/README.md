# Creator Studio Example Extension

Creator Studio is a hybrid OpenPet extension that demonstrates the end-to-end pet creation workflow planned for hatch-pet style generation.

The first implementation uses a deterministic fixture backend. It creates a valid `codex-pet` output, moves the run through review, then imports the approved output through OpenPet's host-owned pet-pack bridge.

Current commands:

- `create-run`: create a run workspace under `OPENPET_DATA_DIR/runs`.
- `run-step`: generate fixture output and QA metadata for a run.
- `approve-run`: mark a run approved.
- `import-approved-pet`: ask OpenPet to inspect and import the approved output.
- `export-bundle`: return the generated `.codex-pet.zip` output details.

Future backend adapters can replace the fixture generator without changing the run workspace contract.
