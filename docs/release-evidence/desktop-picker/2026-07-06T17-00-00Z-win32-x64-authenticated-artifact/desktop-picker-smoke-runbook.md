# OpenPet Desktop Native Picker Smoke Runbook

Generated: 2026-07-06T16:34:37.954Z
Platform: win32
Architecture: arm64
Version: 1.0.1-rc.3
Artifact: OpenPet-1.0.1-rc.3-win-x64-unsigned.exe
Signed: no

Use this runbook only during a real packaged macOS or Windows validation run. This file does not prove native picker success by itself; readiness requires the JSON report to pass validation after every required check has real evidence.

## Fixture Inputs

- Plugin package: Use a valid .openpet-plugin.zip fixture with a signature.json hash metadata file.
- Frame folder: Use a folder containing ordered transparent PNG frames.
- Pet pack: Use a valid pet pack directory with pet.json and sprite assets.

## Required Checks

### `packaged-launch` - Launch packaged OpenPet and keep it running

Launch the packaged app artifact, confirm the pet window appears, and record the artifact path plus a screenshot or short recording.

```bash
npm run update-desktop-picker-smoke-report -- docs/release-evidence/desktop-picker/2026-07-06T17-00-00Z-win32-x64-authenticated-artifact/desktop-picker-smoke-report.json --check packaged-launch --status pass --evidence "<real evidence>"
```

### `control-center-open` - Open Control Center from the packaged app

Open Control Center from the packaged app and record that the Plugins, Actions, and About tabs render.

```bash
npm run update-desktop-picker-smoke-report -- docs/release-evidence/desktop-picker/2026-07-06T17-00-00Z-win32-x64-authenticated-artifact/desktop-picker-smoke-report.json --check control-center-open --status pass --evidence "<real evidence>"
```

### `plugin-picker-cancel` - Plugin package native picker cancel path is safe

From Plugins, open Install Plugin, cancel the native picker, and confirm no plugin selection or install state remains.

```bash
npm run update-desktop-picker-smoke-report -- docs/release-evidence/desktop-picker/2026-07-06T17-00-00Z-win32-x64-authenticated-artifact/desktop-picker-smoke-report.json --check plugin-picker-cancel --status pass --evidence "<real evidence>"
```

### `plugin-picker-zip-review` - Plugin package native picker reviews a real zip package

From Plugins, choose a real .openpet-plugin.zip fixture and record the review panel showing package metadata, permissions, signature status, and install mode.

```bash
npm run update-desktop-picker-smoke-report -- docs/release-evidence/desktop-picker/2026-07-06T17-00-00Z-win32-x64-authenticated-artifact/desktop-picker-smoke-report.json --check plugin-picker-zip-review --status pass --evidence "<real evidence>"
```

### `plugin-install-disabled` - Plugin selected from the native picker installs disabled by default

Install the reviewed plugin and record that it is installed disabled by default and requires explicit enablement.

```bash
npm run update-desktop-picker-smoke-report -- docs/release-evidence/desktop-picker/2026-07-06T17-00-00Z-win32-x64-authenticated-artifact/desktop-picker-smoke-report.json --check plugin-install-disabled --status pass --evidence "<real evidence>"
```

### `invalid-package-feedback` - Invalid plugin or pet package shows a visible error from the packaged app

From Plugins or Actions, choose an invalid package fixture and record that the packaged app shows a visible, actionable error without changing installed state.

```bash
npm run update-desktop-picker-smoke-report -- docs/release-evidence/desktop-picker/2026-07-06T17-00-00Z-win32-x64-authenticated-artifact/desktop-picker-smoke-report.json --check invalid-package-feedback --status pass --evidence "<real evidence>"
```

### `action-frame-picker-cancel` - Action frame folder native picker cancel path is safe

From Actions, open the frame-folder import picker, cancel it, and confirm the action list and pending import state remain unchanged.

```bash
npm run update-desktop-picker-smoke-report -- docs/release-evidence/desktop-picker/2026-07-06T17-00-00Z-win32-x64-authenticated-artifact/desktop-picker-smoke-report.json --check action-frame-picker-cancel --status pass --evidence "<real evidence>"
```

### `pet-pack-picker-cancel` - Pet pack folder native picker cancel path is safe

From Actions / Pet Packs, open the pet pack folder picker, cancel it, and confirm the pack list and active pack remain unchanged.

```bash
npm run update-desktop-picker-smoke-report -- docs/release-evidence/desktop-picker/2026-07-06T17-00-00Z-win32-x64-authenticated-artifact/desktop-picker-smoke-report.json --check pet-pack-picker-cancel --status pass --evidence "<real evidence>"
```

### `state-after-picker-smoke` - Application state remains consistent after picker smoke checks

Restart or refresh the packaged app after picker checks and record that settings, plugin enablement, active pet pack, and local HTTP default-off state are consistent.

```bash
npm run update-desktop-picker-smoke-report -- docs/release-evidence/desktop-picker/2026-07-06T17-00-00Z-win32-x64-authenticated-artifact/desktop-picker-smoke-report.json --check state-after-picker-smoke --status pass --evidence "<real evidence>"
```

## Validation Commands

Run these commands only after every check has real evidence. The first command is the packaged-app smoke gate. The second command is required before an official signed desktop release claim.

```bash
npm run validate-desktop-picker-smoke-report -- docs/release-evidence/desktop-picker/2026-07-06T17-00-00Z-win32-x64-authenticated-artifact/desktop-picker-smoke-report.json
npm run validate-desktop-picker-smoke-report -- docs/release-evidence/desktop-picker/2026-07-06T17-00-00Z-win32-x64-authenticated-artifact/desktop-picker-smoke-report.json --require-signed
```

Do not mark desktop picker validation complete while any check is pending, blocked, failed, or missing evidence. Do not use the signed readiness command for unsigned local or prerelease artifacts.
