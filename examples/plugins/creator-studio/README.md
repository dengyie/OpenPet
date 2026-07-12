# Creator Studio Example Extension

Creator Studio is OpenPet's hybrid extension for drafting, generating, reviewing, and importing pet characters and actions. The extension owns bounded task, prompt, artifact, QA, and dashboard workflows; the host owns Provider credentials, model calls, output writes, final imports, activation, and trigger-proposal persistence.

The current character/action contract, one-image Provider rule, Codex Pet atlas layout, directional mirror policy, QA gates, and implementation gaps are defined only in [`docs/pet-character-generation.md`](../../../docs/pet-character-generation.md).

## Backends

- `fixture` creates deterministic local output for development and UI regression tests.
- `provider` uses the host-owned image-generation bridge.
- Legacy `cloud` and `local` values normalize to `provider`.

Missing host settings or bridge access fails explicitly. Creator Studio never silently falls back from a Provider run to fixture output.

Fixture output and compatibility fallbacks are not official-quality or production art. Provider success and deterministic QA also do not replace human visual review.

## Commands

- `draft-task`: create a structured generation task from a user request.
- `answer-question`: provide a bounded missing task answer.
- `confirm-task`: freeze the task before generation.
- `run-step`: generate full-pet or single-action output and QA artifacts.
- `approve-run`: mark a reviewable run approved.
- `import-approved-pet`: inspect and import an approved pet package through the host bridge.
- `import-approved-action`: import approved action frames and submit the trigger proposal to the host inbox.
- `export-bundle`: return the generated `.codex-pet.zip` details.

## Runtime And Review

Runs live under `OPENPET_DATA_DIR/runs`. The loopback-only dashboard exposes data-relative preview URLs and sanitized review state rather than raw filesystem paths. Approval is invalidated when generated files no longer match their QA hashes.

Use the dashboard for task details, contact sheets, animated previews, repair, approval, and import handoff. Use the host smoke commands listed in the canonical generation document when Provider-path behavior or support claims change.
