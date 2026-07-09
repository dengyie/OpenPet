# OpenPet Windows Smoke Validation Runbook

Generated: 2026-06-23T22:22:32.063Z
Report: `release\windows-smoke-report.json`

## Scope

Use this runbook only during a real Windows clean-machine or CI-backed manual validation run. This file does not prove Windows support by itself; readiness requires the JSON report to pass validation after every required check has real evidence.

## Artifact Under Test

- Version: 1.0.1-rc.3
- Installer: OpenPet-1.0.1-rc.3-win-x64-unsigned.exe
- ZIP: OpenPet-1.0.1-rc.3-win-x64-unsigned.zip
- latest.yml: latest.yml
- Blockmaps: OpenPet-1.0.1-rc.3-win-x64.exe-unsigned.blockmap
- Signed: false
- Authenticode status: Unknown

## Prepare The Report

```bash
npm run update-windows-smoke-report -- release\windows-smoke-report.json --list-checks
npm run update-windows-smoke-report -- release\windows-smoke-report.json --set-env windowsVersion="Windows 11 23H2" --set-env machine="clean Windows VM"
```

## Optional Evidence Collector

If this runbook was downloaded from the CI smoke evidence artifact, run the generated collector on the Windows validation machine before filling pass/fail results. The collector only writes evidence files; it does not mark any smoke check as passed.

```powershell
powershell -ExecutionPolicy Bypass -File .\windows-smoke-collector.ps1 -ReportPath .\windows-smoke-report.json
```

## Required Checks

| Check ID | What To Prove | Evidence Guidance | Fill Command |
|----------|---------------|-------------------|--------------|
| `install` | Install NSIS package on a clean Windows machine | Record the installer filename, install mode, target path, and whether Start Menu/Desktop shortcuts were created. | `npm run update-windows-smoke-report -- release\windows-smoke-report.json --check install --status pass --evidence "<real evidence>"` |
| `launch` | Launch installed app and keep it running | Record the launch method, app version shown in About, and a short observation that the app stayed running. | `npm run update-windows-smoke-report -- release\windows-smoke-report.json --check launch --status pass --evidence "<real evidence>"` |
| `transparent-window` | Transparent pet window renders with alpha | Attach a screenshot or screen recording showing the pet window alpha background on the Windows desktop. | `npm run update-windows-smoke-report -- release\windows-smoke-report.json --check transparent-window --status pass --evidence "<real evidence>"` |
| `drag-bounds` | Drag, bounds, always-on-top, and taskbar behavior | Record drag behavior, monitor bounds, always-on-top behavior, focus behavior, and taskbar visibility. | `npm run update-windows-smoke-report -- release\windows-smoke-report.json --check drag-bounds --status pass --evidence "<real evidence>"` |
| `control-center-tabs` | Control Center opens all tabs | Record that Pet, Actions, AI, Plugins, Catalog, Service, and About tabs open without renderer errors. | `npm run update-windows-smoke-report -- release\windows-smoke-report.json --check control-center-tabs --status pass --evidence "<real evidence>"` |
| `pet-actions` | Built-in sprites and imported frame folders work | Record built-in action playback and one imported frame-folder action regenerated from Windows paths. | `npm run update-windows-smoke-report -- release\windows-smoke-report.json --check pet-actions --status pass --evidence "<real evidence>"` |
| `pet-pack-import` | Pet pack import, enable, and delete works on Windows paths | Record inspect/import/activate/delete of a pet pack under the Windows userData directory. | `npm run update-windows-smoke-report -- release\windows-smoke-report.json --check pet-pack-import --status pass --evidence "<real evidence>"` |
| `plugin-runner` | Plugin runner works on Windows paths with restricted permissions | Record an official plugin command and a local plugin command running with restricted permissions. | `npm run update-windows-smoke-report -- release\windows-smoke-report.json --check plugin-runner --status pass --evidence "<real evidence>"` |
| `local-http-default-off` | Local HTTP and MCP remain disabled by default | Record a fresh profile showing Local HTTP and MCP disabled before the user enables them. | `npm run update-windows-smoke-report -- release\windows-smoke-report.json --check local-http-default-off --status pass --evidence "<real evidence>"` |
| `local-http-token-gated` | Local HTTP and MCP are loopback-only and token-gated | Record loopback binding, rejected unauthenticated mutation, accepted token-authenticated mutation, and MCP token/session behavior. | `npm run update-windows-smoke-report -- release\windows-smoke-report.json --check local-http-token-gated --status pass --evidence "<real evidence>"` |
| `api-key-isolation` | API keys are unavailable to renderer and ordinary plugins | Record that AI config can save a key while renderer/plugin-visible config never exposes plaintext secret values. | `npm run update-windows-smoke-report -- release\windows-smoke-report.json --check api-key-isolation --status pass --evidence "<real evidence>"` |
| `about-update-assets` | About update check shows only Windows install assets | Record About update results showing Windows installers and hiding macOS assets/feed metadata. | `npm run update-windows-smoke-report -- release\windows-smoke-report.json --check about-update-assets --status pass --evidence "<real evidence>"` |
| `uninstall` | Uninstall preserves user data unless explicitly removed | Record uninstall result, relaunch absence, and preserved user data when uninstall is not asked to delete app data. | `npm run update-windows-smoke-report -- release\windows-smoke-report.json --check uninstall --status pass --evidence "<real evidence>"` |

## Validate Readiness

Run these commands only after every check has real evidence. The first command is the RC/prerelease smoke gate. The second command is required before an official stable Windows release claim.

```bash
npm run validate-windows-smoke-report -- release\windows-smoke-report.json
npm run update-windows-smoke-report -- release\windows-smoke-report.json --validate-ready
npm run validate-windows-smoke-report -- release\windows-smoke-report.json --require-signed
npm run update-windows-smoke-report -- release\windows-smoke-report.json --validate-ready --require-signed
```

Do not mark Windows release-ready while any check is pending, blocked, failed, or missing evidence. Do not use the signed readiness commands for unsigned prerelease artifacts.
