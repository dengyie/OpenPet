# OpenPet Desktop Release Design: macOS + Windows

> Scope: desktop release design for macOS and Windows only. Mobile is out of scope for the current release track, and Linux is deferred until there is an explicit support decision.

## 1. Current Baseline

OpenPet is already an Electron desktop pet runtime platform with a macOS release baseline and a Windows packaging/CI/signing-policy/smoke-evidence-gate baseline:

- `npm start` builds the Control Center and launches Electron for development.
- `npm run pack` creates a local directory package with the current electron-builder config.
- `npm run dist` uses electron-builder and validates the current host release path.
- `package.json` contains macOS build targets (`dmg`, `zip`), macOS signing/notarization settings, and Windows x64 targets (`nsis`, `zip`).
- `build/icon.ico` exists for Windows installer/taskbar identity and can be regenerated from `build/icon.png` with `npm run generate-icons`.
- `.github/workflows/release.yml` has macOS and Windows PR packaging checks and separate release jobs.
- About/update asset selection is platform-aware: macOS users see macOS installers, Windows users see Windows installers, and feed metadata/blockmaps are hidden from the user-facing asset list.
- Windows release policy is enforced in CI: stable Windows tags require signing secrets, while unsigned prerelease assets are explicitly labeled before upload.
- `npm run validate-windows-smoke-report` validates structured Windows smoke evidence reports; the pending template lives at `docs/release-evidence/windows-smoke-report.template.json`.
- `docs/release-checklist.md` documents macOS signing, notarization, update checks, and upgrade compatibility.

Windows is an Electron-compatible target with build configuration, CI release jobs, update asset filtering, signing policy, and smoke evidence schema in place, but it is not release-ready yet. The remaining gates are signed artifact evidence, SmartScreen/reputation expectations, GitHub Actions run evidence, and a real Windows smoke-test matrix.

## 2. Platform Support Statement

| Platform | Current Status | Release Claim |
|----------|----------------|---------------|
| macOS | Implemented and locally validated | Release baseline exists; official release requires signed/notarized artifacts |
| Windows | Packaging, CI, signing-policy, and smoke-evidence-gate baseline implemented | Do not claim release-ready until signed artifact evidence and real smoke tests land |
| Linux | Deferred | Do not include in current support matrix |
| Mobile | Out of scope | Do not design or document for this release track |

Public docs should describe OpenPet as a desktop platform. When platform specifics are needed, say macOS is the current validated release baseline and Windows desktop packaging/CI is present but not yet user-supported.

## 3. Target Release Model

### macOS

- Artifact targets: `dmg` and `zip`.
- Local/dev builds may be unsigned.
- Official releases should use Developer ID signing, hardened runtime, and notarization.
- Validation commands:

```bash
codesign --verify --deep --strict --verbose=2 "release/mac/OpenPet.app"
spctl --assess --type execute --verbose=4 "release/mac/OpenPet.app"
```

### Windows

- Artifact targets: NSIS installer (`.exe`) and portable/archive `zip`.
- Initial architecture: `x64`.
- `arm64` can be added after a real device or CI validation path exists.
- Local/dev builds may be unsigned.
- Official stable releases must use Windows code signing. Without signing and reputation, SmartScreen warnings are expected.
- Unsigned Windows prerelease artifacts are allowed only for RC/beta/alpha validation and must include `unsigned` in the uploaded asset names.

## 4. Build Configuration Baseline

The shared electron-builder configuration now covers both desktop targets:

- macOS keeps `dmg` and `zip` targets, `build/icon.icns`, hardened runtime, entitlements, and the notarization hook.
- Windows defines `build.win` with x64 `nsis` and `zip` targets.
- Windows uses `build/icon.ico`, generated from `build/icon.png` by `scripts/generate-icons.js`.
- NSIS is configured for assisted install, per-user default install, desktop/start-menu shortcuts, and user data preservation on uninstall.
- Artifact names use `${productName}-${version}-${os}-${arch}.${ext}` so multi-platform release uploads do not collide.
- Keep `appId`, `productName`, `publish`, `files`, and `extraResources` shared where possible.
- Keep all platform-specific signing credentials outside source control and only read them from CI secrets or local environment variables.

Remaining build work is validation-related, not target-definition-related. README commands should still avoid implying that a signed or unsigned Windows artifact has completed support validation.

## 5. CI And Release Plan

The release workflow now uses a PR matrix and separate release jobs:

| Job | Runner | Purpose | Expected Artifacts |
|-----|--------|---------|--------------------|
| macOS | `macos-latest` | test, syntax, build, pack/dist, optional signing/notarization | `.dmg`, `.zip`, `.blockmap`, `latest-mac.yml` |
| Windows | `windows-latest` | test, syntax, build, dist, optional code signing | `.exe`, `.zip`, `.blockmap`, `latest.yml` |

Release uploads should keep artifact names platform-explicit, for example `OpenPet-${version}-mac.dmg` and `OpenPet-${version}-win-x64.exe`, so About/update checks and manual downloads are unambiguous.

PR workflows remain unsigned and must not require signing secrets. The macOS tag/manual release job can sign and notarize when Apple secrets are present, otherwise it produces unsigned artifacts. The Windows tag/manual release job now inspects `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD`: stable tags fail if either secret is absent, while RC/beta/alpha tags may continue unsigned after `npm run prepare-windows-release-assets` adds `unsigned` to asset names and updates `latest.yml` references.

Windows smoke evidence is recorded separately from CI artifacts. Use `docs/release-evidence/windows-smoke-report.template.json` as the source template, and validate filled reports with `npm run validate-windows-smoke-report`. Official stable readiness must also pass `--require-signed`.

## 6. Desktop Verification Matrix

Run this matrix before claiming Windows release readiness and before each official desktop release:

| Area | macOS | Windows |
|------|-------|---------|
| App launch | Packaged app starts and remains running | Installed app starts and remains running |
| Transparent pet window | Alpha background renders correctly | Alpha background renders correctly |
| Window behavior | `alwaysOnTop`, `skipTaskbar`, drag, bounds work | `alwaysOnTop`, taskbar behavior, drag, bounds work |
| Control Center | Opens all tabs | Opens all tabs |
| Pet actions | Built-in sprites and imported frame folders work | Built-in sprites and imported frame folders work |
| User data upgrade | Legacy `appData/ibot` path remains active | Legacy data compatibility strategy is verified on Windows paths |
| Settings | All new configuration is operable through UI | All new configuration is operable through UI |
| API keys | Renderer/plugins never receive plaintext secrets | Renderer/plugins never receive plaintext secrets |
| Plugins | Official plugins validate; local runner remains isolated | Permission-model runner works on Windows paths and shell semantics |
| Pet packs | Import/enable/delete works under `userData` | Import/enable/delete works under `%APPDATA%` path |
| Local HTTP/MCP | Default off, loopback only, token-gated | Default off, loopback only, token-gated |
| About/update | Version and update summary are correct | Version and update summary are correct |
| Install/uninstall | Install, relaunch, update, remove | Install, relaunch, update, uninstall |

## 7. Windows-Specific Risks

- Transparent click-through and shaped-window behavior may differ from macOS compositor behavior.
- `alwaysOnTop`, taskbar visibility, and focus activation need manual validation.
- SmartScreen reputation is a product trust issue even when the binary is technically signed.
- Path separators, spaces in `%APPDATA%`, and archive extraction can expose assumptions in plugin and pet-pack import code.
- The local third-party plugin runner relies on Node permission-model behavior; verify it on Windows before enabling public plugin claims.
- Native dependencies such as `sharp` must install and load correctly on Windows CI and clean user machines.
- Existing zip extraction flows that depend on platform tools should be replaced or validated before Windows support is declared.

## 8. Acceptance Gates

Windows desktop support can be called release-ready only after all of these are complete:

- Documentation states macOS and Windows support consistently.
- `package.json` defines Windows package targets and Windows icon assets.
- Release workflow has a Windows runner and uploads Windows artifacts.
- Windows signing policy is documented and enforced by the release workflow, even if early prereleases remain unsigned.
- Windows smoke evidence reports have a checked-in template and validator.
- Signed Windows release artifacts have been produced and verified with `Get-AuthenticodeSignature`.
- The desktop verification matrix passes on a clean Windows machine or CI-backed manual test environment.
- About/update behavior distinguishes macOS and Windows release assets.
- `npm start`, `npm test`, `npm run check:syntax`, and macOS packaging remain functional after the Windows changes.

Current gate status: package targets, icon assets, release workflow, platform-aware update asset filtering, Windows signing policy, and Windows smoke evidence template/validator are implemented; signed artifact evidence and real Windows smoke validation remain open. Until those remaining gates pass, the correct project status is: macOS release baseline complete; Windows desktop build/CI/signing-policy/smoke-evidence-gate baseline implemented but not release-ready.
