# OpenPet Desktop Release Design: macOS + Windows

> Scope: desktop release design for macOS and Windows only. Mobile is out of scope for the current release track, and Linux is deferred until there is an explicit support decision.

> Current distribution policy (2026-10-27): use self-managed signing only. Do not require paid Apple Developer ID/notarization or paid Windows signing. macOS ad-hoc/local signing and a locally generated Windows certificate can verify artifact integrity, but do not imply Gatekeeper approval, notarization, SmartScreen reputation, or publisher trust. The packaged-runtime gate is `--require-signature-integrity`; the release archive/closure helpers still contain legacy fields and must be migrated before they are used as the final release gate; see [`TODO.md`](./TODO.md).

## 1. Current Baseline

OpenPet is already an Electron desktop pet runtime platform with a macOS release baseline, a Windows packaging/CI/legacy signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation/summary/archive-manifest baseline, packaged desktop native picker and runtime smoke evidence toolchains, desktop picker evidence archive tooling, and a release-level evidence archive manifest that currently requires reviewed Windows smoke and desktop picker archive manifests:

- `npm start` builds the Control Center and launches Electron for development.
- `npm run pack` creates a local directory package with the current electron-builder config.
- `npm run dist` uses electron-builder and validates the current host release path.
- `package.json` contains macOS build targets (`dmg`, `zip`), macOS signing/notarization settings, and Windows x64 targets (`nsis`, `zip`).
- `build/icon.ico` exists for Windows installer/taskbar identity and can be regenerated from `build/icon.png` with `npm run generate-icons`.
- `.github/workflows/release.yml` has macOS and Windows PR packaging checks, separate release jobs, and a dedicated macOS release evidence artifact upload.
- About/update asset selection is platform-aware: macOS users see macOS installers, Windows users see Windows installers, and feed metadata/blockmaps are hidden from the user-facing asset list.
- Legacy Windows release policy is still enforced in CI: stable Windows tags require signing secrets, while unsigned prerelease assets are explicitly labeled before upload. This conflicts with the current self-managed-signing policy and must be removed as part of the release-tooling update.
- `npm run create-windows-smoke-report` creates a pending Windows smoke report from release artifacts on the Windows runner, `npm run create-windows-smoke-runbook` generates the matching operator runbook, `npm run create-windows-smoke-collector` generates a PowerShell evidence collector, `npm run validate-windows-smoke-evidence-bundle` checks collector output, `npm run create-windows-smoke-evidence-summary` archives reviewed collector/report metadata, `npm run create-windows-smoke-archive-manifest` hashes and validates a reviewed smoke archive, `npm run update-windows-smoke-report` fills evidence during real validation, and `npm run validate-windows-smoke-report` validates structured Windows smoke evidence reports.
- `npm run create-desktop-picker-smoke-report` creates a pending packaged macOS or Windows native picker smoke report, `npm run create-desktop-picker-smoke-runbook` generates the matching operator guide, `npm run update-desktop-picker-smoke-report` fills picker evidence, `npm run validate-desktop-picker-smoke-report` validates smoke readiness or signed official readiness, `npm run create-desktop-picker-evidence-summary` records reviewed evidence hashes, and `npm run create-desktop-picker-archive-manifest` hashes and validates the reviewed picker archive.
- `npm run create-packaged-runtime-smoke-report` creates a pending packaged runtime smoke report, `npm run create-packaged-runtime-smoke-runbook` generates the matching operator guide, `npm run run-packaged-runtime-smoke` launches a packaged app and fills automated runtime evidence, `npm run update-packaged-runtime-smoke-report` fills remaining manual evidence, and `npm run validate-packaged-runtime-smoke-report` validates smoke readiness or signed official readiness.
- `npm run create-macos-release-evidence` captures or imports canonical macOS codesign, notarization, and Gatekeeper evidence files before release-level aggregation. The macOS release workflow uploads these files as `openpet-macos-release-evidence-<tag>` for maintainer review, and `npm run create-macos-release-evidence-archive` copies a downloaded artifact into the permanent release archive before signed closure while recording `macos-release-evidence-artifact-manifest.json` provenance.
- A real public macOS release-asset verification archive now exists at `docs/release-evidence/macos-release-evidence/2026-07-06T15-57-51Z-v1.0.1-rc.3-public-release-asset-check/`, an authenticated imported workflow-artifact archive now exists at `docs/release-evidence/macos-release-evidence-archive/2026-07-06T16-17-27Z-v1.0.1-rc.3-authenticated-artifact-import/`, and a companion current-parser rerun now exists at `docs/release-evidence/macos-release-evidence-archive/2026-07-06T17-32-13Z-v1.0.1-rc.3-authenticated-artifact-current-parser-rerun/`; together they show the current `v1.0.1-rc.3` macOS evidence failing signed readiness, the imported workflow summary still records notarization as `NotSubmitted`, and the current local interpretation is explicit `fail` / `fail` / `fail`.
- A current packaged-runtime pending report now also exists at `docs/release-evidence/packaged-runtime/2026-07-06T17-00-00Z-darwin-arm64-authenticated-artifact/`; it was generated from the same `v1.0.1-rc.3` macOS release assets without launching the app, records `artifact.signed=false`, preserves the broken signature text under `artifact.signatureEvidence`, and keeps every runtime check pending until a real packaged-app run is observed.
- `npm run create-release-evidence-archive-manifest` hashes and validates a release-level archive containing macOS signing/notarization/Gatekeeper evidence plus Windows smoke, desktop picker, and packaged runtime reports. It also requires the reviewed `windows-smoke-archive-manifest.json` and `desktop-picker-archive-manifest.json` to match the archived report paths and SHA-256 hashes, and when `macos-release-evidence-artifact-manifest.json` is present it validates that the imported macOS workflow artifact still matches the archived macOS evidence files. The manifest separates archive validity from `releaseReady`.
- The pending template lives at `docs/release-evidence/windows-smoke-report.template.json`.
- `docs/release-checklist.md` documents macOS signing, notarization, update checks, and upgrade compatibility.

Windows is an Electron-compatible target with build configuration, CI release jobs, update asset filtering, legacy signing policy, smoke evidence schema, pending report/runbook/collector artifact generation, evidence bundle validation, evidence summary/archive-manifest tooling, report filling tooling, desktop picker/runtime smoke evidence tooling, desktop picker evidence archive tooling, and release-level archive gates for both Windows smoke and desktop picker reviewed archives. The remaining work is to adapt signing/evidence gates to self-managed certificates, document expected SmartScreen warnings, produce filled packaged picker/runtime evidence, and run a real Windows smoke-test matrix.

## 2. Platform Support Statement

| Platform | Current Status | Release Claim |
|----------|----------------|---------------|
| macOS | Historical public assets fail the previous signed/notarized gate; current package smoke is unsigned | Self-managed signing planned; no notarization or Gatekeeper-trust claim |
| Windows | Packaging and evidence tooling exist; self-managed signing workflow and target-OS smoke remain open | Self-managed signing planned; no SmartScreen/publisher-trust claim |
| Linux | Deferred | Do not include in current support matrix |
| Mobile | Out of scope | Do not design or document for this release track |

Public docs should describe OpenPet as a desktop platform. When platform specifics are needed, describe the current package/runtime evidence accurately and state that future distributions use self-managed signing. Do not claim notarization or OS trust; retain platform support claims only when target-OS runtime evidence supports them.

## 3. Target Release Model

### macOS

- Artifact targets: `dmg` and `zip`.
- Local/dev builds may be unsigned. Distribution builds will use ad-hoc signing or a locally controlled identity; do not obtain paid Developer ID signing or notarization.
- Hardened runtime settings may remain where required by Electron packaging, but they do not make a self-signed app trusted by Gatekeeper.
- Validation commands:

```bash
codesign --verify --deep --strict --verbose=2 "release/mac/OpenPet.app"
codesign -dv --verbose=4 "release/mac/OpenPet.app"
```

Record Gatekeeper behavior as an expected trust warning under this policy; `spctl` approval and notarization are not release requirements.

### Windows

- Artifact targets: NSIS installer (`.exe`) and portable/archive `zip`.
- Initial architecture: `x64`.
- `arm64` can be added after a real device or CI validation path exists.
- Local/dev builds may be unsigned. Distribution builds will use a locally generated self-signed certificate; do not purchase a publisher certificate or signing service.
- Self-signed Windows artifacts can show unknown-publisher/SmartScreen warnings. Document the warning and any manual trust steps; do not claim Microsoft publisher reputation.
- Remove the current stable-tag requirement for paid signing secrets when adapting the release workflow.

## 4. Build Configuration Baseline

The shared electron-builder configuration now covers both desktop targets:

- macOS keeps `dmg` and `zip` targets, `build/icon.icns`, and required entitlements; the existing notarization hook belongs to the legacy release policy and should not run for future releases.
- Windows defines `build.win` with x64 `nsis` and `zip` targets.
- Windows uses `build/icon.ico`, generated from `build/icon.png` by `scripts/generate-icons.js`.
- NSIS is configured for assisted install, per-user default install, desktop/start-menu shortcuts, and user data preservation on uninstall.
- Artifact names use `${productName}-${version}-${os}-${arch}.${ext}` so multi-platform release uploads do not collide.
- Keep `appId`, `productName`, `publish`, `files`, and `extraResources` shared where possible.
- Keep locally controlled signing identities/private keys outside source control. Do not add paid signing credentials to CI secrets.

Remaining build work is validation-related, not target-definition-related. README commands should still avoid implying that a signed or unsigned Windows artifact has completed support validation.

## 5. CI And Release Plan

The release workflow now uses a PR matrix and separate release jobs:

| Job | Runner | Purpose | Expected Artifacts |
|-----|--------|---------|--------------------|
| macOS | `macos-latest` | test, syntax, build, pack/dist, ad-hoc or local signing, macOS integrity/runtime evidence | `.dmg`, `.zip`, `.blockmap`, `latest-mac.yml`, release evidence artifact |
| Windows | `windows-latest` | test, syntax, build, dist, locally generated self-signing | `.exe`, `.zip`, `.blockmap`, `latest.yml` |

Release uploads should keep artifact names platform-explicit, for example `OpenPet-${version}-mac.dmg` and `OpenPet-${version}-win-x64.exe`, so About/update checks and manual downloads are unambiguous.

The current workflow is still the legacy implementation: it conditionally uses Apple signing/notarization credentials and fails stable Windows releases without `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD`. Do not configure or use those paths. Update the workflow to create macOS ad-hoc/local signatures and Windows self-signed signatures, and make evidence validators distinguish signature integrity from platform trust. Until that work lands, use unsigned local packages and do not treat the legacy signed closure as a release gate.

Windows smoke evidence is recorded separately from user-facing release assets. The Windows release job creates `release/windows-smoke-report.json`, validates it with `--allow-pending`, generates `release/windows-smoke-runbook.md` and `release/windows-smoke-collector.ps1`, and uploads all three as a GitHub Actions artifact so each Windows build has structured build/signature metadata, an operator checklist, and a local evidence collection helper for real validation. This generated report/runbook/collector set does not prove runtime smoke success until every pending check is filled with real Windows evidence. Use `docs/release-evidence/windows-smoke-report.template.json` for manual validation runs, generate or download the matching runbook and collector with `npm run create-windows-smoke-runbook` and `npm run create-windows-smoke-collector`, run the collector on Windows, validate its output with `npm run validate-windows-smoke-evidence-bundle`, archive reviewed metadata with `npm run create-windows-smoke-evidence-summary`, create a reviewed archive hash manifest with `npm run create-windows-smoke-archive-manifest`, fill reports with `npm run update-windows-smoke-report`, and validate filled reports with `npm run validate-windows-smoke-report`. Existing `--require-signed` checks enforce the legacy paid-signing model and must be adapted to self-signature integrity before use.

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

The first command proves picker smoke readiness. The `--require-signed` variant is a legacy gate and is not current release policy until adapted to accept self-signature integrity. Do not treat the pending report or runbook as proof of native picker success.

After a picker run is reviewed, place the report, runbook, evidence directory, and summary in a `desktop-picker-archive/` directory and create an archive manifest:

```bash
npm run create-desktop-picker-evidence-summary -- desktop-picker-archive/desktop-picker-evidence --report desktop-picker-archive/desktop-picker-smoke-report.json --output desktop-picker-archive/desktop-picker-evidence-summary.md
npm run create-desktop-picker-archive-manifest -- --archive-dir desktop-picker-archive
npm run create-desktop-picker-archive-manifest -- --archive-dir desktop-picker-archive --require-signed
```

The archive manifest verifies completeness and summary hash consistency. It still reports `releaseReady: false` unless the paired picker report itself passes readiness validation.

When the archive is ready for release-level aggregation, include `windows-smoke-archive-manifest.json` and `desktop-picker-archive-manifest.json` in the release evidence archive and keep the closure report pointed at the same archive directory.

Release evidence archives are tracked with one manifest that points at the already reviewed evidence files. A pending or unsigned archive can be valid for review while still reporting `releaseReady: false`:

```bash
npm run create-macos-release-evidence -- --app release/mac/OpenPet.app --notarization-text "<notarytool accepted output>" --output-dir docs/release-evidence/<release-archive>
npm run create-release-evidence-archive-manifest -- --archive-dir docs/release-evidence/<release-archive>
npm run create-release-evidence-archive-manifest -- --archive-dir docs/release-evidence/<release-archive> --require-signed
npm run create-signed-release-closure-report -- --archive-dir docs/release-evidence/<release-archive> --fail-on-not-ready
```

The existing macOS evidence command writes `macos-codesign.txt`, `macos-notarization.txt`, `macos-gatekeeper.txt`, and summary files; its notarization requirements describe the previous policy. The archive helpers can preserve historical evidence and provenance, but the signed manifest and closure checks are legacy gates. Adapt future closure readiness to self-signature integrity, completed target-OS runtime and picker evidence, and explicit Gatekeeper/SmartScreen warnings without requiring notarization or publisher trust.

## 6. Desktop Verification Matrix

Run this matrix before making platform support claims and for each distribution build:

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
- Reviewed Windows smoke archive manifests are required by the release-level archive and signed closure report, and must match the archived Windows smoke report path and SHA-256 hash.
- Windows self-signed artifacts have been produced and their signature integrity has been verified with `Get-AuthenticodeSignature`.
- The desktop verification matrix passes on a clean Windows machine or CI-backed manual test environment.
- About/update behavior distinguishes macOS and Windows release assets.
- `npm start`, `npm test`, `npm run check:syntax`, and macOS packaging remain functional after the Windows changes.

Current gate status: package targets, icon assets, self-managed release workflow, platform-aware update asset filtering, smoke evidence tooling, evidence archive tooling, and picker/runtime validation are implemented. The packaged-runtime validator now checks self-signature integrity separately from OS trust. Archive closure migration, filled packaged picker evidence, and real Windows smoke validation remain open. The archived `v1.0.1-rc.3` macOS assets fail the previous signature/Gatekeeper checks and the Windows assets were unsigned; preserve these as historical facts. Current policy requires self-signature integrity plus target-OS runtime evidence, and does not require Gatekeeper approval, notarization, SmartScreen reputation, or paid certificates.
