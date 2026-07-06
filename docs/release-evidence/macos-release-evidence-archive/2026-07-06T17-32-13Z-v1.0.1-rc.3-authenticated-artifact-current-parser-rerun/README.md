# OpenPet macOS Release Evidence Current-Parser Rerun

Generated: 2026-07-06T17:32:35.084Z
Source evidence: `../2026-07-06T16-17-27Z-v1.0.1-rc.3-authenticated-artifact-import/`

This directory re-evaluates the imported raw macOS evidence texts with the current local parser by running `create-macos-release-evidence` against the already archived `macos-codesign.txt`, `macos-notarization.txt`, and `macos-gatekeeper.txt` files.

## Current Result

- `macos-release-evidence-summary.md` and `.json` now classify the imported evidence as:
  - `codesign: fail`
  - `notarization: fail`
  - `Gatekeeper: fail`
- The copied evidence files keep the same SHA-256 hashes as the authenticated imported artifact.
- This rerun does not change provenance; it only upgrades the local interpretation of those same raw texts to match the current release parser and signed-closure logic.

## Boundary

This companion archive is useful because it makes the current parser result explicit without mutating the original imported artifact directory. It does not prove passing signed readiness; it proves the opposite more clearly.
