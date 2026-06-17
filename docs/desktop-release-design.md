# OpenPet Desktop Release Design: macOS + Windows

> Scope: desktop release design for macOS and Windows only. Mobile is out of scope for the current release track, and Linux is deferred until there is an explicit support decision.

## 1. Current Baseline

OpenPet is already an Electron desktop pet runtime platform with a macOS release baseline, a Windows packaging/CI/signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation/summary/archive-manifest baseline, packaged desktop native picker and runtime smoke evidence toolchains, desktop picker evidence archive tooling, and a release-level evidence archive manifest:

- `npm start` builds the Control Center and launches Electron for development.
- `npm run pack` creates a local directory package with the current electron-builder config.
- `npm run dist` uses electron-builder and validates the current host release path.
- `package.json` contains macOS build targets (`dmg`, `zip`), macOS signing/notarization settings, and Windows x64 targets (`nsis`, `zip`).
- `build/icon.ico` exists for Windows installer/taskbar identity and can be regenerated from `build/icon.png` with `npm run generate-icons`.
- `.github/workflows/release.yml` has macOS and Windows PR packaging checks and separate release jobs.
- About/update asset selection is platform-aware: macOS users see macOS installers, Windows users see Windows installers, and feed metadata/blockmaps are hidden from the user-facing asset list.
- Windows release policy is enforced in CI: stable Windows tags require signing secrets, while unsigned prerelease assets are explicitly labeled before upload.
- `npm run create-windows-smoke-report` creates a pending Windows smoke report from release artifacts on the Windows runner, `npm run create-windows-smoke-runbook` generates the matching operator runbook, `npm run create-windows-smoke-collector` generates a PowerShell evidence collector, `npm run validate-windows-smoke-evidence-bundle` checks collector output, `npm run create-windows-smoke-evidence-summary` archives reviewed collector/report metadata, `npm run create-windows-smoke-archive-manifest` hashes and validates a reviewed smoke archive, `npm run update-windows-smoke-report` fills evidence during real validation, and `npm run validate-windows-smoke-report` validates structured Windows smoke evidence reports.
- `npm run create-desktop-picker-smoke-report` creates a pending packaged macOS or Windows native picker smoke report, `npm run create-desktop-picker-smoke-runbook` generates the matching operator guide, `npm run update-desktop-picker-smoke-report` fills picker evidence, `npm run validate-desktop-picker-smoke-report` validates smoke readiness or signed official readiness, `npm run create-desktop-picker-evidence-summary` records reviewed evidence hashes, and `npm run create-desktop-picker-archive-manifest` hashes and validates the reviewed picker archive.
- `npm run create-packaged-runtime-smoke-report` creates a pending packaged runtime smoke report, `npm run create-packaged-runtime-smoke-runbook` generates the matching operator guide, `npm run run-packaged-runtime-smoke` launches a packaged app and fills automated runtime evidence, `npm run update-packaged-runtime-smoke-report` fills remaining manual evidence, and `npm run validate-packaged-runtime-smoke-report` validates smoke readiness or signed official readiness.
- `npm run create-release-evidence-archive-manifest` hashes and validates a release-level archive containing macOS signing/notarization/Gatekeeper evidence plus Windows smoke, desktop picker, and packaged runtime reports. The manifest separates archive validity from `releaseReady`.
- The pending template lives at `docs/release-evidence/windows-smoke-report.template.json`.
- `docs/release-checklist.md` documents macOS signing, notarization, update checks, and upgrade compatibility.

Windows is an Electron-compatible target with build configuration, CI release jobs, update asset filtering, signing policy, smoke evidence schema, pending report/runbook/collector artifact generation, evidence bundle validation, evidence summary/archive-manifest tooling, report filling tooling, desktop picker/runtime smoke evidence tooling, desktop picker evidence archive tooling, and release-level evidence archive tooling in place, but it is not release-ready yet. The remaining gates are signed artifact evidence, SmartScreen/reputation expectations, GitHub Actions run evidence, filled packaged picker/runtime evidence, and a real Windows smoke-test matrix.

## 2. Platform Support Statement

| Platform | Current Status | Release Claim |
|----------|----------------|---------------|
| macOS | Implemented and locally validated | Release baseline exists; official release requires signed/notarized artifacts |
| Windows | Packaging, CI, signing-policy, smoke-evidence/reporting/runbook/collector/bundle-validation/summary/archive-manifest, and desktop picker smoke evidence tooling baselines implemented | Do not claim release-ready until signed artifact evidence and real smoke tests land |
| Linux | Deferred | Do not include in current support matrix |
| Mobile | Out of scope | Do not design or document for this release track |

Public docs should describe OpenPet as a desktop platform. When platform specifics are needed, say macOS is the current validated release baseline and Windows desktop packaging/CI/evidence tooling is present but not yet user-supported.

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

Windows smoke evidence is recorded separately from user-facing release assets. The Windows release job creates `release/windows-smoke-report.json`, validates it with `--allow-pending`, generates `release/windows-smoke-runbook.md` and `release/windows-smoke-collector.ps1`, and uploads all three as a GitHub Actions artifact so each Windows build has structured build/signature metadata, an operator checklist, and a local evidence collection helper for real validation. This generated report/runbook/collector set does not prove runtime smoke success until every pending check is filled with real Windows evidence. Use `docs/release-evidence/windows-smoke-report.template.json` for manual validation runs, generate or download the matching runbook and collector with `npm run create-windows-smoke-runbook` and `npm run create-windows-smoke-collector`, run the collector on Windows, validate its output with `npm run validate-windows-smoke-evidence-bundle`, archive reviewed metadata with `npm run create-windows-smoke-evidence-summary`, create a reviewed archive hash manifest with `npm run create-windows-smoke-archive-manifest`, fill reports with `npm run update-windows-smoke-report`, and validate filled reports with `npm run validate-windows-smoke-report`. Official stable readiness must also pass `--require-signed` for the evidence bundle, the evidence summary, the archive manifest, and the filled report.

Packaged native picker evidence is tracked by a separate cross-desktop report so macOS and Windows use the same required picker checks. Generate a pending report and runbook from the packaged artifact directory, fill it during a real launched packaged-app run, then validate without `--allow-pending` before claiming picker smoke success:

```bash
npm run create-desktop-picker-smoke-report -- --platform darwin --release-dir release --output release/desktop-picker-smoke-report.json
npm run create-desktop-picker-smoke-report -- --platform win32 --release-dir release --output release/desktop-picker-smoke-report.json
npm run validate-desktop-picker-smoke-report -- release/desktop-picker-smoke-report.json --allow-pending
npm run create-desktop-picker-smoke-runbook -- release/desktop-picker-smoke-report.json --output release/desktop-picker-smoke-runbook.md
npm run update-desktop-picker-smoke-report -- release/desktop-picker-smoke-report.json --list-checks
```

After the packaged app picker run fills every required check with concrete evidence, run:

```bash
npm run validate-desktop-picker-smoke-report -- release/desktop-picker-smoke-report.json
npm run validate-desktop-picker-smoke-report -- release/desktop-picker-smoke-report.json --require-signed
```

The first command proves picker smoke readiness. The second is required before an official signed desktop release claim. Do not treat the pending report or runbook as proof of native picker success.

After a picker run is reviewed, place the report, runbook, evidence directory, and summary in a `desktop-picker-archive/` directory and create an archive manifest:

```bash
npm run create-desktop-picker-evidence-summary -- desktop-picker-archive/desktop-picker-evidence --report desktop-picker-archive/desktop-picker-smoke-report.json --output desktop-picker-archive/desktop-picker-evidence-summary.md
npm run create-desktop-picker-archive-manifest -- --archive-dir desktop-picker-archive
npm run create-desktop-picker-archive-manifest -- --archive-dir desktop-picker-archive --require-signed
```

The archive manifest verifies completeness and summary hash consistency. It still reports `releaseReady: false` unless the paired picker report itself passes readiness validation.

When the archive is ready for release-level aggregation, include `desktop-picker-archive-manifest.json` in the release evidence archive and keep the closure report pointed at the same archive directory.

Release evidence archives are tracked with one manifest that points at the already reviewed evidence files. A pending or unsigned archive can be valid for review while still reporting `releaseReady: false`:

```bash
npm run create-release-evidence-archive-manifest -- --archive-dir docs/release-evidence/<release-archive>
npm run create-release-evidence-archive-manifest -- --archive-dir docs/release-evidence/<release-archive> --require-signed
npm run create-signed-release-closure-report -- --archive-dir docs/release-evidence/<release-archive> --fail-on-not-ready
```

The signed manifest command is required before an official desktop release claim. The closure command converts the evidence into explicit macOS, Windows, and official desktop release wording, and must remain `not-ready` until successful macOS codesign, notarization, and Gatekeeper evidence files plus signed-ready Windows smoke, desktop picker, and packaged runtime reports are present.

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
| Native file pickers | Plugin package, action frame folder, and pet pack picker cancel/select paths have filled evidence | Plugin package, action frame folder, and pet pack picker cancel/select paths have filled evidence |
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
- Windows smoke evidence reports have a checked-in template, validator, CI pending-report/runbook/collector artifact, collector-output bundle validator, evidence summary/archive-manifest tools, command-driven filling tool, and readiness validator.
- Desktop native picker smoke evidence reports can be generated, filled, validated, summarized, and archive-manifested for packaged macOS and Windows artifacts.
- Desktop native picker smoke archive manifests can be generated and consumed by the release-level archive and closure report.
- Signed Windows release artifacts have been produced and verified with `Get-AuthenticodeSignature`.
- The desktop verification matrix passes on a clean Windows machine or CI-backed manual test environment.
- About/update behavior distinguishes macOS and Windows release assets.
- `npm start`, `npm test`, `npm run check:syntax`, and macOS packaging remain functional after the Windows changes.

Current gate status: package targets, icon assets, release workflow, platform-aware update asset filtering, Windows signing policy, Windows smoke evidence template/validator, CI pending-report/runbook/collector generation, evidence bundle validation, evidence summary/archive-manifest tooling, report filling tooling, desktop picker smoke evidence tooling, desktop picker evidence archive tooling, and release-level archive picker-archive gating are implemented; signed artifact evidence, filled packaged picker evidence, and real Windows smoke validation remain open. Until those remaining gates pass, the correct project status is: macOS release baseline complete; Windows desktop build/CI/signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation/summary/archive-manifest, packaged native picker smoke evidence/archive tooling, and release-level picker-archive gating are implemented but not release-ready.
