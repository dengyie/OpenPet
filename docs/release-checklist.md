# OpenPet Desktop Release Checklist

> Purpose: keep local test builds, signed releases, and public artifacts reproducible without exposing signing credentials.

Current desktop scope: macOS and Windows. macOS has a validated release baseline; Windows has packaging/CI/update-asset/signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation/summary/archive-manifest baselines, both desktop platforms have packaged native picker/runtime smoke evidence tooling, desktop picker evidence summary/archive manifest tooling, and release-level evidence archive gates. Windows must not be called release-ready until signed release evidence and real smoke tests are complete.

| Platform | Status | Public Claim |
|----------|--------|--------------|
| macOS | Baseline implemented | Release candidate path exists; official artifacts should be signed/notarized |
| Windows | Packaging/CI/signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation/summary/archive-manifest and desktop picker/runtime smoke evidence tooling baselines implemented | Do not publish as supported until the Windows checklist passes |
| Linux | Deferred | Out of current release scope |
| Mobile | Out of scope | Not part of this desktop release track |

## 1. Preflight

- Confirm `CHANGELOG.md` has an entry for the release tag.
- Confirm `npm test` passes.
- Confirm `npm run check:syntax` passes.
- Confirm the Windows smoke report template remains structurally valid:

```bash
npm run validate-windows-smoke-report -- docs/release-evidence/windows-smoke-report.template.json --allow-pending
```

- Confirm the desktop native picker smoke report tools remain structurally valid for the target packaged artifact directory. Use the target platform that matches the release runner; `--allow-any-platform` is only for structure checks outside the target OS.

```bash
npm run create-desktop-picker-smoke-report -- --platform darwin --release-dir release --output release/desktop-picker-smoke-report.json
npm run validate-desktop-picker-smoke-report -- release/desktop-picker-smoke-report.json --allow-pending
npm run create-desktop-picker-smoke-runbook -- release/desktop-picker-smoke-report.json --output release/desktop-picker-smoke-runbook.md
npm run update-desktop-picker-smoke-report -- release/desktop-picker-smoke-report.json --list-checks
npm run create-desktop-picker-evidence-summary -- --help
npm run create-desktop-picker-archive-manifest -- --help
```

- For Windows release jobs, confirm the generated pending report remains structurally valid before uploading artifacts:

```bash
npm run create-windows-smoke-report -- --output release/windows-smoke-report.json
npm run validate-windows-smoke-report -- release/windows-smoke-report.json --allow-pending
npm run create-windows-smoke-runbook -- release/windows-smoke-report.json --output release/windows-smoke-runbook.md
npm run create-windows-smoke-collector -- release/windows-smoke-report.json --output release/windows-smoke-collector.ps1
```

- Confirm the Windows smoke report filling tool lists the current required check ids:

```bash
npm run update-windows-smoke-report -- --list-checks
```

- Confirm the release evidence archive manifest tool can parse its options:

```bash
npm run create-release-evidence-archive-manifest -- --help
```

- Confirm `npm run pack` creates an unsigned directory package.
- Confirm the About page shows the expected app version and packaged state.
- Confirm local HTTP remains disabled by default after a fresh install.

## 2. Upgrade Compatibility

- Before testing an OpenPet build over an existing ibot install, back up the local `appData/ibot` directory.
- Launch OpenPet and confirm it still uses the legacy `appData/ibot` userData directory.
- Confirm existing `settings.json`, `secrets.json`, installed plugins, installed pet packs, and local HTTP logs remain available.
- Confirm no duplicate OpenPet-only userData directory becomes the active data source during the upgrade.

Latest local RC smoke test: PASS on 2026-06-13. A temporary HOME with seeded `Library/Application Support/ibot` data launched the packaged `release/mac-arm64/OpenPet.app`, stayed running after startup, preserved legacy settings/secrets/plugins/pet-packs, and did not create an active `Library/Application Support/OpenPet` data source.

## 3. macOS Signing Inputs

Release signing and notarization must only read credentials from environment variables or the runner keychain:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK` or a locally installed Developer ID Application certificate
- `CSC_KEY_PASSWORD` when `CSC_LINK` is used

The app must continue to build unsigned local packages when these variables are absent.

## 4. macOS Release Build

- Create a tag named `vX.Y.Z` or `vX.Y.Z-rc.N`.
- Let GitHub Actions run the release workflow from the tag.
- Download the generated DMG/ZIP artifacts.
- Verify the app launches and shows the pet window.
- Open Control Center and smoke test Pet, Actions, AI, Plugins, Service, and About.
- Generate a packaged desktop picker smoke report/runbook for the macOS artifact, then fill evidence during a real launched packaged-app run before claiming native picker smoke success:

```bash
npm run create-desktop-picker-smoke-report -- --platform darwin --release-dir release --output release/desktop-picker-smoke-report.json
npm run create-desktop-picker-smoke-runbook -- release/desktop-picker-smoke-report.json --output release/desktop-picker-smoke-runbook.md
npm run update-desktop-picker-smoke-report -- release/desktop-picker-smoke-report.json --list-checks
```

Current RC target: `v1.0.1-rc.2`.

## 5. macOS Verification

Run these checks on the signed app or mounted DMG output:

```bash
codesign --verify --deep --strict --verbose=2 "release/mac/OpenPet.app"
spctl --assess --type execute --verbose=4 "release/mac/OpenPet.app"
```

After all macOS packaged native picker checks are filled with concrete evidence, validate readiness:

```bash
npm run validate-desktop-picker-smoke-report -- release/desktop-picker-smoke-report.json
npm run validate-desktop-picker-smoke-report -- release/desktop-picker-smoke-report.json --require-signed
```

The signed readiness command requires valid signing evidence. Do not use a generated pending picker report as proof of picker success.

After the filled picker report is reviewed, assemble `desktop-picker-archive/` with `desktop-picker-smoke-report.json`, `desktop-picker-smoke-runbook.md`, `desktop-picker-evidence/`, and a summary, then create the archive manifest:

```bash
npm run create-desktop-picker-evidence-summary -- desktop-picker-archive/desktop-picker-evidence --report desktop-picker-archive/desktop-picker-smoke-report.json --output desktop-picker-archive/desktop-picker-evidence-summary.md
npm run create-desktop-picker-archive-manifest -- --archive-dir desktop-picker-archive
npm run create-desktop-picker-archive-manifest -- --archive-dir desktop-picker-archive --require-signed
```

The unsigned manifest can archive reviewed material. The signed command is required before an official signed release claim and still depends on the report passing signed readiness.

For packaged runtime validation, launch the packaged app through the smoke runner. Use `--allow-pending-picker` only when native picker evidence is intentionally linked later; that mode is archiveable but not full runtime readiness:

```bash
npm run run-packaged-runtime-smoke -- --app release/mac-arm64/OpenPet.app --output-dir docs/release-evidence/packaged-runtime --allow-pending-picker
npm run validate-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/<session>/packaged-runtime-smoke-report.json --allow-pending
```

When a completed desktop picker report is available, link it and validate without `--allow-pending`:

```bash
npm run run-packaged-runtime-smoke -- --app release/mac-arm64/OpenPet.app --desktop-picker-report release/desktop-picker-smoke-report.json --output-dir docs/release-evidence/packaged-runtime
npm run validate-packaged-runtime-smoke-report -- docs/release-evidence/packaged-runtime/<session>/packaged-runtime-smoke-report.json
```

## 6. Windows Signing Inputs

Official Windows releases use electron-builder's Authenticode signing path. Keep certificate material outside source control and provide it only through GitHub Actions secrets or a local release environment:

- `WINDOWS_CSC_LINK`: Windows code-signing certificate as a secure URL, local path, or base64-encoded `.pfx` value supported by electron-builder.
- `WINDOWS_CSC_KEY_PASSWORD`: password for the certificate referenced by `WINDOWS_CSC_LINK`.

Windows release policy:

- Stable tags such as `v1.2.3` must be signed. The `release-windows` workflow fails before building if either Windows signing secret is missing.
- Prerelease tags such as `v1.2.3-rc.1`, `v1.2.3-beta.1`, or `v1.2.3-alpha.1` may be unsigned for validation.
- Unsigned Windows prerelease assets must include `unsigned` in `.exe`, `.zip`, and `.blockmap` filenames. The workflow runs `npm run prepare-windows-release-assets` to apply that label and update `latest.yml` references before upload.
- Unsigned prerelease assets are for testing only and must not be described as SmartScreen-trusted or production-supported.

Before calling a Windows build official, verify the downloaded installer signature on Windows:

```powershell
Get-AuthenticodeSignature .\OpenPet-*-win32-x64.exe | Format-List
```

The expected result for an official build is `Status : Valid` and a signer certificate that matches the release owner.

## 7. Windows Release Readiness

Windows release support requires these gates before public release claims:

- [x] Add Windows targets to electron-builder (`nsis`, `zip`) and include `build/icon.ico`.
- [x] Add a `windows-latest` CI release job or platform matrix.
- [x] Upload Windows artifacts: `.exe`, `.zip`, `.blockmap`, and `latest.yml`.
- [x] Filter About/update assets by current desktop platform.
- [x] Document the Windows signing provider and CI secret names before producing official signed releases.
- [x] Allow unsigned local/prerelease builds only when artifacts are clearly labeled as unsigned.
- [x] Add a structured Windows smoke report validator and pending evidence template.
- [x] Generate and upload a pending Windows smoke report artifact from the Windows release job.
- [x] Add command-driven Windows smoke report filling/update tooling.
- [x] Generate and upload a Windows smoke validation runbook beside the pending report.
- [x] Generate and upload a Windows smoke evidence collector beside the pending report and runbook.
- [x] Add a Windows smoke evidence bundle validator for collector output.
- [x] Add a Windows smoke evidence summary/archive tool for reviewed collector output.
- [x] Add a Windows smoke archive manifest tool for reviewed archive hashing and consistency checks.
- [x] Add packaged desktop native picker smoke report, runbook, update, and validation tooling.
- [x] Add packaged desktop native picker evidence summary/archive manifest tooling.
- [ ] Verify install, launch, update check, and uninstall on a clean Windows machine.
- [ ] Fill and archive packaged native picker smoke evidence for the signed or release-candidate Windows artifact.

The generated `release/windows-smoke-report.json` captures artifact metadata and Authenticode status from the Windows runner, `release/windows-smoke-runbook.md` gives the operator the matching required-check commands, and `release/windows-smoke-collector.ps1` gathers local Windows evidence snapshots. After running the collector on Windows, use `npm run validate-windows-smoke-evidence-bundle` to check the evidence directory shape, required files, hashes, and optional signed-evidence gate, then use `npm run create-windows-smoke-evidence-summary` to archive the reviewed evidence metadata and `npm run create-windows-smoke-archive-manifest` to hash and validate the assembled review archive. All runtime smoke checks remain `pending` until a real Windows validation run fills evidence.

For a real Windows validation run, copy `docs/release-evidence/windows-smoke-report.template.json` to a versioned report path or download the generated CI pending report plus runbook/collector artifact, then fill environment/artifact/check evidence with the update tool:

```bash
npm run update-windows-smoke-report -- docs/release-evidence/<report>.json --list-checks
npm run update-windows-smoke-report -- docs/release-evidence/<report>.json --set-env windowsVersion="Windows 11 23H2" --set-env machine="clean Windows VM"
npm run update-windows-smoke-report -- docs/release-evidence/<report>.json --set-artifact version="1.0.1-rc.2" --set-artifact installer="OpenPet-1.0.1-rc.2-win32-x64.exe"
npm run update-windows-smoke-report -- docs/release-evidence/<report>.json --check launch --status pass --evidence "Installed app launched from Start Menu and stayed running for 60 seconds"
```

If starting from an existing pending report, generate or refresh its local runbook and collector before validation:

```bash
npm run create-windows-smoke-runbook -- docs/release-evidence/<report>.json --output docs/release-evidence/<report>-runbook.md
npm run create-windows-smoke-collector -- docs/release-evidence/<report>.json --output docs/release-evidence/<report>-collector.ps1
```

When using the generated collector on Windows, run it from the directory that also contains the pending report and installer artifacts:

```powershell
powershell -ExecutionPolicy Bypass -File .\windows-smoke-collector.ps1 -ReportPath .\windows-smoke-report.json
```

The collector writes evidence snapshots only; it does not mark checks as pass and does not prove release readiness by itself.

Validate the collector output before using it as report evidence:

```bash
npm run validate-windows-smoke-evidence-bundle -- windows-smoke-evidence --report docs/release-evidence/<report>.json
npm run create-windows-smoke-evidence-summary -- windows-smoke-evidence --report docs/release-evidence/<report>.json --output docs/release-evidence/<report>-summary.md
npm run create-windows-smoke-archive-manifest -- --archive-dir windows-smoke-archive
```

For official stable Windows release readiness, require signed evidence in both the evidence bundle and the filled report:

```bash
npm run validate-windows-smoke-evidence-bundle -- windows-smoke-evidence --report docs/release-evidence/<report>.json --require-signed
npm run create-windows-smoke-evidence-summary -- windows-smoke-evidence --report docs/release-evidence/<report>.json --require-signed --output docs/release-evidence/<report>-summary.md
npm run create-windows-smoke-archive-manifest -- --archive-dir windows-smoke-archive --require-signed
```

The archive manifest expects a reviewed directory containing `windows-smoke-report.json`, `windows-smoke-runbook.md`, `windows-smoke-collector.ps1`, `windows-smoke-evidence/`, and `windows-smoke-evidence-summary.md` or `.json`. It verifies archive completeness and summary consistency, but it does not prove runtime smoke success by itself.

During validation, updates default to structural validation and may leave other checks pending. Once all checks have evidence, run readiness validation:

```bash
npm run validate-windows-smoke-report -- docs/release-evidence/<report>.json
npm run update-windows-smoke-report -- docs/release-evidence/<report>.json --validate-ready
```

For official stable Windows release readiness, the same report must also pass signed artifact validation:

```bash
npm run validate-windows-smoke-report -- docs/release-evidence/<report>.json --require-signed
npm run update-windows-smoke-report -- docs/release-evidence/<report>.json --validate-ready --require-signed
```

Do not mark the clean-machine validation item complete while the report is still pending or unsigned for an official stable release.

For packaged native picker validation on Windows, generate a desktop picker report/runbook from the Windows artifact directory, fill every required check while running the packaged app, and validate the filled report:

```bash
npm run create-desktop-picker-smoke-report -- --platform win32 --release-dir release --output release/desktop-picker-smoke-report.json
npm run create-desktop-picker-smoke-runbook -- release/desktop-picker-smoke-report.json --output release/desktop-picker-smoke-runbook.md
npm run update-desktop-picker-smoke-report -- release/desktop-picker-smoke-report.json --list-checks
npm run validate-desktop-picker-smoke-report -- release/desktop-picker-smoke-report.json
npm run validate-desktop-picker-smoke-report -- release/desktop-picker-smoke-report.json --require-signed
```

The pending report and runbook are operator aids only. The report proves picker smoke success only after all required checks pass with evidence; the signed command is required before an official Windows support claim.

After reviewing the picker evidence, archive it with a summary and manifest:

```bash
npm run create-desktop-picker-evidence-summary -- desktop-picker-archive/desktop-picker-evidence --report desktop-picker-archive/desktop-picker-smoke-report.json --output desktop-picker-archive/desktop-picker-evidence-summary.md
npm run create-desktop-picker-archive-manifest -- --archive-dir desktop-picker-archive
npm run create-desktop-picker-archive-manifest -- --archive-dir desktop-picker-archive --require-signed
```

The desktop picker archive manifest expects `desktop-picker-smoke-report.json`, `desktop-picker-smoke-runbook.md`, `desktop-picker-evidence/`, and `desktop-picker-evidence-summary.md` or `.json`. It verifies archive completeness and summary hash consistency, but it does not create picker evidence by itself.

For a release-level archive, assemble a reviewed directory with:

- `windows-smoke-report.json`
- `desktop-picker-smoke-report.json`
- `packaged-runtime-smoke-report.json`
- `macos-codesign.txt`
- `macos-notarization.txt`
- `macos-gatekeeper.txt`

Then generate the archive manifest:

```bash
npm run create-release-evidence-archive-manifest -- --archive-dir docs/release-evidence/<release-archive>
npm run create-release-evidence-archive-manifest -- --archive-dir docs/release-evidence/<release-archive> --require-signed
npm run create-signed-release-closure-report -- --archive-dir docs/release-evidence/<release-archive> --fail-on-not-ready
```

The first command can archive pending review material. The second command is required before an official desktop release claim and must produce `releaseReady: true`. The closure command turns the manifest into explicit release wording and should fail official release CI when any signed evidence remains missing or pending.

Windows smoke checks:

- Transparent pet window renders with alpha and remains draggable.
- `alwaysOnTop`, taskbar behavior, focus, and screen bounds work as intended.
- Control Center opens Pet, Actions, AI, Plugins, Catalog, Service, and About tabs.
- Legacy user data compatibility is verified against the Windows app data path strategy.
- Plugin runner, pet-pack import, and sprite/native dependencies work with Windows paths.
- Local HTTP/MCP remains off by default, loopback only, and token-gated.
- API keys remain unavailable to renderer code and ordinary plugins.

See [desktop-release-design.md](./desktop-release-design.md) for the full macOS + Windows design and acceptance gates.

## 8. Update Check

- Publish the GitHub Release for the tag.
- Open Control Center → About.
- Run Check Updates.
- Confirm the latest version, release URL, and platform-appropriate asset names are displayed.
- On macOS, confirm `.dmg` and macOS `.zip` assets are shown while Windows `.exe` / Windows `.zip` assets are hidden.
- On Windows, confirm `.exe` and Windows `.zip` assets are shown while macOS `.dmg` / macOS `.zip` assets are hidden.
- Confirm `.blockmap`, `latest.yml`, and `latest-mac.yml` feed metadata are not shown as user-installable assets.

## 9. Rollback

- Unpublish or mark a bad release as draft if it should not be discovered by update checks.
- Keep the previous release artifact available.
- Rotate any exposed CI signing credentials immediately if a workflow log or artifact leaks them.
