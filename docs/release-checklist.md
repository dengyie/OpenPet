# OpenPet Desktop Release Checklist

> Purpose: keep local test builds, signed releases, and public artifacts reproducible without exposing signing credentials.

Current desktop scope: macOS and Windows. macOS has a validated release baseline; Windows has packaging/CI/update-asset/signing-policy/smoke-evidence/reporting baselines, but must not be called release-ready until signed release evidence and real smoke tests are complete.

| Platform | Status | Public Claim |
|----------|--------|--------------|
| macOS | Baseline implemented | Release candidate path exists; official artifacts should be signed/notarized |
| Windows | Packaging/CI/signing-policy/smoke-evidence/reporting baseline implemented | Do not publish as supported until the Windows checklist passes |
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

- For Windows release jobs, confirm the generated pending report remains structurally valid before uploading artifacts:

```bash
npm run create-windows-smoke-report -- --output release/windows-smoke-report.json
npm run validate-windows-smoke-report -- release/windows-smoke-report.json --allow-pending
```

- Confirm the Windows smoke report filling tool lists the current required check ids:

```bash
npm run update-windows-smoke-report -- --list-checks
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

Current RC target: `v1.0.1-rc.1`.

## 5. macOS Verification

Run these checks on the signed app or mounted DMG output:

```bash
codesign --verify --deep --strict --verbose=2 "release/mac/OpenPet.app"
spctl --assess --type execute --verbose=4 "release/mac/OpenPet.app"
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
- [ ] Verify install, launch, update check, and uninstall on a clean Windows machine.

The generated `release/windows-smoke-report.json` captures artifact metadata and Authenticode status from the Windows runner, but all runtime smoke checks remain `pending` until a real Windows validation run fills evidence.

For a real Windows validation run, copy `docs/release-evidence/windows-smoke-report.template.json` to a versioned report path or download the generated CI pending report, then fill environment/artifact/check evidence with the update tool:

```bash
npm run update-windows-smoke-report -- docs/release-evidence/<report>.json --list-checks
npm run update-windows-smoke-report -- docs/release-evidence/<report>.json --set-env windowsVersion="Windows 11 23H2" --set-env machine="clean Windows VM"
npm run update-windows-smoke-report -- docs/release-evidence/<report>.json --set-artifact version="1.0.1-rc.1" --set-artifact installer="OpenPet-1.0.1-rc.1-win32-x64.exe"
npm run update-windows-smoke-report -- docs/release-evidence/<report>.json --check launch --status pass --evidence "Installed app launched from Start Menu and stayed running for 60 seconds"
```

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
