# OpenPet Packaged Runtime Smoke Runbook

Generated: 2026-07-06T16:34:37.809Z
Report: `docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json`

## Scope

Use this runbook only during a real packaged macOS or Windows validation run. This file does not prove runtime success by itself; readiness requires the JSON report to pass validation after every required check has real evidence.

## Artifact Under Test

- Version: 1.0.1-rc.3
- App path: OpenPet.app
- Installer: OpenPet-1.0.1-rc.3-mac-arm64.dmg
- ZIP: OpenPet-1.0.1-rc.3-mac-arm64.zip
- Signed: false
- Signature status: Unknown

## Linked Evidence

- Desktop picker smoke report: <fill during packaged runtime validation>
- Desktop picker smoke runbook: <fill during packaged runtime validation>
- Screenshots: <fill during packaged runtime validation>
- Recordings: <fill during packaged runtime validation>

## Required Checks

| Check ID | What To Prove | Evidence Guidance | Fill Command |
|----------|---------------|-------------------|--------------|
| `packaged-launch` | Packaged OpenPet launches and stays running | Record the packaged app path, launch command or user action, app version, and that the process stays running. | `npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --check packaged-launch --status pass --evidence "<real evidence>"` |
| `pet-window-created` | Pet BrowserWindow is created from the packaged app | Record Electron window evidence such as a screenshot, screen recording, or runtime log showing the pet window exists. | `npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --check pet-window-created --status pass --evidence "<real evidence>"` |
| `transparent-background` | Pet window transparent background renders correctly | Attach a screenshot showing desktop content visible around the pet sprite without an opaque window rectangle. | `npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --check transparent-background --status pass --evidence "<real evidence>"` |
| `sprite-visible` | Pet sprite is visible and not fully transparent | Attach a screenshot or pixel observation showing the pet sprite is visible and not fully transparent. | `npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --check sprite-visible --status pass --evidence "<real evidence>"` |
| `speech-bubble-rendered` | Floating BubbleChatWindow renders and the old inline bubble stays hidden | Trigger a say event and record that the floating BubbleChatWindow appears while the old inline pet bubble stays hidden. | `npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --check speech-bubble-rendered --status pass --evidence "<real evidence>"` |
| `default-action-playback` | Default action plays in the packaged renderer | Trigger the default action and record animation playback from the packaged renderer. | `npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --check default-action-playback --status pass --evidence "<real evidence>"` |
| `pack-switch-legacy-cat` | Built-in pet pack legacy-cat can be activated and rendered | Activate legacy-cat and record that it renders with a visible sprite and working default action. | `npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --check pack-switch-legacy-cat --status pass --evidence "<real evidence>"` |
| `pack-switch-doro` | Built-in pet pack doro can be activated and rendered | Activate doro and record that it renders with a visible sprite and working default action. | `npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --check pack-switch-doro --status pass --evidence "<real evidence>"` |
| `pack-switch-duodong` | Built-in pet pack duodong can be activated and rendered | Activate duodong and record that it renders with a visible sprite and working default action. | `npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --check pack-switch-duodong --status pass --evidence "<real evidence>"` |
| `pack-switch-chispa` | Built-in pet pack chispa can be activated and rendered | Activate chispa and record that it renders with a visible sprite and working default action. | `npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --check pack-switch-chispa --status pass --evidence "<real evidence>"` |
| `plugin-picker-evidence-linked` | Plugin package native picker smoke evidence is linked | Link the paired desktop picker smoke report or direct evidence for plugin zip picker cancel and review paths. | `npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --check plugin-picker-evidence-linked --status pass --evidence "<real evidence>"` |
| `pet-picker-evidence-linked` | Pet pack native picker smoke evidence is linked | Link the paired desktop picker smoke report or direct evidence for pet pack picker cancel and import paths. | `npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --check pet-picker-evidence-linked --status pass --evidence "<real evidence>"` |
| `invalid-package-feedback` | Invalid plugin or pet package shows a visible error | Record a visible error when selecting an invalid plugin or pet package. | `npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --check invalid-package-feedback --status pass --evidence "<real evidence>"` |
| `state-after-runtime-smoke` | State remains consistent after packaged runtime smoke checks | Restart or refresh the packaged app and record that active pack, plugin enablement, settings, and Local HTTP default-off state remain consistent. | `npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --check state-after-runtime-smoke --status pass --evidence "<real evidence>"` |

## Validate Readiness

Run these commands only after every check has real evidence. The first command is the packaged runtime smoke gate. The second command is required before an official signed desktop release claim.

```bash
npm run validate-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json
npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --validate-ready
npm run validate-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --require-signed
npm run update-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/packaged-runtime-smoke-report.json --validate-ready --require-signed
```

Do not mark packaged runtime smoke ready while any check is pending, blocked, failed, or missing evidence.
