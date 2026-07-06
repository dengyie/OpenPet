# OpenPet macOS Release Evidence Artifact Import

Generated: 2026-07-06T16:17:27Z
Source artifact: `openpet-macos-release-evidence-v1.0.1-rc.3`
Workflow run: `https://github.com/dengyie/OpenPet/actions/runs/28060966745`

This directory preserves the downloaded macOS release-evidence artifact from the successful `v1.0.1-rc.3` release workflow run. It proves the workflow uploaded a macOS evidence packet, but it does not prove passing signed release readiness.

## Included Files

- `macos-codesign.txt`
- `macos-notarization.txt`
- `macos-gatekeeper.txt`
- `macos-release-evidence-summary.md`
- `macos-release-evidence-summary.json`
- `macos-release-evidence-artifact-manifest.json`

## Current Truth

- The imported raw `codesign` and `spctl` outputs both show `code has no resources but signature indicates they must be present`.
- The imported notarization output records `status: NotSubmitted`.
- The archived workflow summary still labels all three statuses as `pending` because it reflects the older summary-era interpretation.
- A companion current-parser rerun now lives at `../2026-07-06T17-32-13Z-v1.0.1-rc.3-authenticated-artifact-current-parser-rerun/` and classifies these same imported raw texts as explicit `fail` / `fail` / `fail` evidence.
- `macos-release-evidence-artifact-manifest.json` is still useful because it proves the imported files match the downloaded workflow artifact contents.

## Boundary

This archive proves the release workflow produced a macOS evidence artifact and that its imported files match the downloaded artifact. It does not prove passing codesign, notarization, Gatekeeper acceptance, or macOS release readiness.
