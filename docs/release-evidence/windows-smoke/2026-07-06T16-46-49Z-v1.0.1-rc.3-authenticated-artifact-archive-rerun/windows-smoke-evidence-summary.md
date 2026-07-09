# Windows Smoke Evidence Summary

Generated at: 2026-07-06T16:46:49.000Z
Evidence directory: /Users/mango/.codex/worktrees/ef96/OpenPet/docs/release-evidence/windows-smoke/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-artifact-archive-rerun/windows-smoke-evidence
Signed evidence required: yes
Evidence/report validation valid: no
Windows release-ready: no

This summary archives evidence metadata for review. Pending or unsigned evidence does not prove Windows release readiness; a real Windows smoke report must pass readiness validation, and official stable releases must also pass signed Authenticode validation.

## Evidence Files

Required files present: 6/6
Authenticode evidence valid: no

| File | Bytes | SHA-256 |
|------|-------|---------|
| environment.txt | 420 | e9c9c7dca06c0040b0ee64e14c6017de2fc7031ef733a0cc0d5d237b8df57d82 |
| authenticode.txt | 773 | c1abc6e03f7c75f3b3cb352de738cd6406fa3f2a07c17eb6ed096313f93394ab |
| process.txt | 187 | 985765335a725a8ff01175875e523078db1ba3c7409eb91c966284b596131749 |
| install-registry.txt | 186 | 817274dfc380680f8ca9d6cf7b5986db520ece4517b21f9225749c63f6d04699 |
| manual-checks.md | 2781 | daa43d78806f49175d693308ec3e0347c5ad06bda1bf4718a425544e1e1a6fff |
| update-report-commands.md | 1056 | 49ab90dcd580e449bca697d28715dde4fee86adc6f345fa50d5a18b00c4e919f |

## Paired Report

Report path: /Users/mango/.codex/worktrees/ef96/OpenPet/docs/release-evidence/windows-smoke/2026-07-06T16-46-49Z-v1.0.1-rc.3-authenticated-artifact-archive-rerun/windows-smoke-report.json
Platform: win32
Architecture: x64
Report generated at: 2026-06-23T22:22:30.455Z

| Artifact Field | Value |
|----------------|-------|
| version | 1.0.1-rc.3 |
| installer | OpenPet-1.0.1-rc.3-win-x64-unsigned.exe |
| zip | OpenPet-1.0.1-rc.3-win-x64-unsigned.zip |
| latestYml | latest.yml |
| signed | no |
| authenticodeStatus | Unknown |

## Check Statuses

Required checks present: 13/13

| Status | Count | Check IDs |
|--------|-------|-----------|
| pass | 0 | - |
| fail | 0 | - |
| pending | 13 | install, launch, transparent-window, drag-bounds, control-center-tabs, pet-actions, pet-pack-import, plugin-runner, local-http-default-off, local-http-token-gated, api-key-isolation, about-update-assets, uninstall |
| blocked | 0 | - |

## Validation Flags

Structural report validation: no
Readiness validation: no
Smoke ready: no
Official signed ready: no

## Errors

- authenticode.txt must contain Authenticode evidence with Status : Valid when --require-signed is used
- report: artifact.signed must be true when --require-signed is used
- report: artifact.authenticodeStatus must be "Valid" when --require-signed is used
