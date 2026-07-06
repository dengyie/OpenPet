# OpenPet Windows Smoke Artifact Import

Generated: 2026-07-06T16:17:27Z
Source artifact: `openpet-windows-smoke-evidence-v1.0.1-rc.3`
Workflow run: `https://github.com/dengyie/OpenPet/actions/runs/28060966745`

This directory preserves the downloaded Windows smoke evidence artifact from the successful `v1.0.1-rc.3` release workflow run. It captures CI-generated review inputs only; it does not prove Windows smoke success or signed release readiness.

## Included Files

- `windows-smoke-report.json`
- `windows-smoke-runbook.md`
- `windows-smoke-collector.ps1`

## Current Truth

- The archived report targets `win32` / `x64` for `1.0.1-rc.3`.
- The installer and zip are explicitly named `unsigned`.
- `artifact.signed` is `false`.
- `authenticodeStatus` is `Unknown`.
- All 13 required smoke checks remain `pending`.
- `npm run validate-windows-smoke-report -- <report> --allow-pending` confirms the report structure is valid, but it still reports `0/13` checks passed and warns that the artifact is not signed.

## Boundary

This archive proves that the release workflow produced a Windows smoke report/runbook/collector artifact. It does not prove reviewed smoke evidence, signed Authenticode trust, SmartScreen reputation, or Windows release readiness.
