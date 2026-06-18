# OpenPet Desktop Release Design: macOS + Windows

> Scope: desktop release design for macOS and Windows only. Mobile is out of scope for the current release track, and Linux is deferred until there is an explicit support decision.

## 1. Current Baseline

OpenPet is already an Electron desktop pet runtime platform with macOS and Windows packaging/test-build paths. The active release posture is unsigned small-scope testing while plugin ecosystem work is prioritized. Older certificate, signing, notarization, smoke-evidence, and release-archive tooling remains in the repository as dormant future-release infrastructure:

- `npm start` builds the Control Center and launches Electron for development.
- `npm run pack` creates a local directory package with the current electron-builder config.
- `npm run dist` uses electron-builder and validates the current host release path.
- `package.json` contains macOS build targets (`dmg`, `zip`), macOS signing/notarization settings, and Windows x64 targets (`nsis`, `zip`).
- `build/icon.ico` exists for Windows installer/taskbar identity and can be regenerated from `build/icon.png` with `npm run generate-icons`.
- `.github/workflows/release.yml` has macOS and Windows PR packaging checks plus separate unsigned release jobs for small-scope test artifacts.
- About/update asset selection is platform-aware: macOS users see macOS installers, Windows users see Windows installers, and feed metadata/blockmaps are hidden from the user-facing asset list.
- Windows release jobs no longer require signing secrets. They always build unsigned test artifacts and run `npm run prepare-windows-release-assets` so uploaded Windows filenames and update metadata stay explicitly labeled `unsigned`.
- `npm run create-windows-smoke-report` creates a pending Windows smoke report from release artifacts on the Windows runner, `npm run create-windows-smoke-runbook` generates the matching operator runbook, `npm run create-windows-smoke-collector` generates a PowerShell evidence collector, `npm run validate-windows-smoke-evidence-bundle` checks collector output, `npm run create-windows-smoke-evidence-summary` archives reviewed collector/report metadata, `npm run create-windows-smoke-archive-manifest` hashes and validates a reviewed smoke archive, `npm run update-windows-smoke-report` fills evidence during real validation, and `npm run validate-windows-smoke-report` validates structured Windows smoke evidence reports.
- `npm run create-desktop-picker-smoke-report` creates a pending packaged macOS or Windows native picker smoke report, `npm run create-desktop-picker-smoke-runbook` generates the matching operator guide, `npm run update-desktop-picker-smoke-report` fills picker evidence, `npm run validate-desktop-picker-smoke-report` validates smoke readiness or signed official readiness, `npm run create-desktop-picker-evidence-summary` records reviewed evidence hashes, and `npm run create-desktop-picker-archive-manifest` hashes and validates the reviewed picker archive.
- `npm run create-packaged-runtime-smoke-report` creates a pending packaged runtime smoke report, `npm run create-packaged-runtime-smoke-runbook` generates the matching operator guide, `npm run run-packaged-runtime-smoke` launches a packaged app and fills automated runtime evidence, `npm run update-packaged-runtime-smoke-report` fills remaining manual evidence, and `npm run validate-packaged-runtime-smoke-report` validates smoke readiness or signed official readiness.
- `npm run create-macos-release-evidence` and `npm run create-macos-release-evidence-archive` remain available for a future signed release promotion path, but the active GitHub release workflow does not generate or upload macOS release evidence.
- `npm run create-release-evidence-archive-manifest` hashes and validates a release-level archive containing macOS signing/notarization/Gatekeeper evidence plus Windows smoke, desktop picker, and packaged runtime reports. It also requires the reviewed `windows-smoke-archive-manifest.json` and `desktop-picker-archive-manifest.json` to match the archived report paths and SHA-256 hashes. The manifest separates archive validity from `releaseReady`.
- The pending template lives at `docs/release-evidence/windows-smoke-report.template.json`.
- `docs/release-checklist.md` documents macOS signing, notarization, update checks, and upgrade compatibility.

Windows is an Electron-compatible target with build configuration, CI release jobs, update asset filtering, unsigned asset labeling, and dormant smoke/evidence tooling. It is suitable for small-scope unsigned testing only; do not claim SmartScreen trust, signed support, or production release readiness.

## 2. Platform Support Statement

| Platform | Current Status | Release Claim |
|----------|----------------|---------------|
| macOS | Unsigned test builds implemented | Small-scope unsigned testing only; signed/notarized release promotion is paused |
| Windows | Unsigned packaging and CI implemented; smoke/evidence tooling dormant | Small-scope unsigned testing only; no Windows certificate requirement in the current product plan |
| Linux | Deferred | Do not include in current support matrix |
| Mobile | Out of scope | Do not design or document for this release track |

Public docs should describe OpenPet as a desktop platform in plugin-ecosystem-first development. When platform specifics are needed, say current public artifacts are unsigned test builds and not production-supported releases.

## 3. Target Release Model

### macOS

- Artifact targets: `dmg` and `zip`.
- Local/dev builds may be unsigned.
- Future official macOS releases may use Developer ID signing, hardened runtime, and notarization; this is paused for the current ecosystem-building track.
- Validation commands:

```bash
codesign --verify --deep --strict --verbose=2 "release/mac/OpenPet.app"
spctl --assess --type execute --verbose=4 "release/mac/OpenPet.app"
npm run create-macos-release-evidence -- --app "release/mac/OpenPet.app" --notarization-text "<notarytool accepted output>" --output-dir docs/release-evidence/macos-release-evidence/<session>
```

### Windows

- Artifact targets: NSIS installer (`.exe`) and portable/archive `zip`.
- Initial architecture: `x64`.
- `arm64` can be added after a real device or CI validation path exists.
- Local/dev builds may be unsigned.
- The current product plan does not require Windows code signing. Unsigned Windows test builds should be expected to trigger SmartScreen warnings.
- All Windows release-job artifacts are currently unsigned test artifacts and must include `unsigned` in uploaded asset names.

## 4. Build Configuration Baseline

The shared electron-builder configuration now covers both desktop targets:

- macOS keeps `dmg` and `zip` targets, `build/icon.icns`, hardened runtime, entitlements, and the notarization hook.
- Windows defines `build.win` with x64 `nsis` and `zip` targets.
- Windows uses `build/icon.ico`, generated from `build/icon.png` by `scripts/generate-icons.js`.
- NSIS is configured for assisted install, per-user default install, desktop/start-menu shortcuts, and user data preservation on uninstall.
- Artifact names use `${productName}-${version}-${os}-${arch}.${ext}` so multi-platform release uploads do not collide.
- Keep `appId`, `productName`, `publish`, `files`, and `extraResources` shared where possible.
- Do not add platform signing credentials to the active GitHub workflow while certificate work is paused. If release promotion resumes, keep credentials outside source control and only read them from CI secrets or local environment variables.

Remaining build work is ecosystem- and validation-related, not target-definition-related. README commands must avoid implying that unsigned artifacts are production-supported releases.

## 5. CI And Release Plan

The release workflow now uses a PR matrix and separate release jobs:

| Job | Runner | Purpose | Expected Artifacts |
|-----|--------|---------|--------------------|
| macOS | `macos-latest` | test, syntax, unsigned dist | `.dmg`, `.zip`, `.blockmap`, `latest-mac.yml` |
| Windows | `windows-latest` | test, syntax, unsigned dist, unsigned asset labeling | `.exe`, `.zip`, `.blockmap`, `latest.yml` |

Release uploads should keep artifact names platform-explicit, for example `OpenPet-${version}-mac.dmg` and `OpenPet-${version}-win-x64.exe`, so About/update checks and manual downloads are unambiguous.

PR workflows and tag/manual release jobs remain unsigned and must not require signing secrets. The macOS job builds unsigned artifacts only. The Windows job builds unsigned artifacts only, then runs `npm run prepare-windows-release-assets` to add `unsigned` to asset names and update `latest.yml` references.

Windows smoke evidence is no longer generated by the active release job. The report/runbook/collector commands remain available for future manual validation when release promotion resumes. This generated report/runbook/collector set does not prove runtime smoke success until every pending check is filled with real Windows evidence. Use `docs/release-evidence/windows-smoke-report.template.json` for manual validation runs, generate or download the matching runbook and collector with `npm run create-windows-smoke-runbook` and `npm run create-windows-smoke-collector`, run the collector on Windows, validate its output with `npm run validate-windows-smoke-evidence-bundle`, archive reviewed metadata with `npm run create-windows-smoke-evidence-summary`, create a reviewed archive hash manifest with `npm run create-windows-smoke-archive-manifest`, fill reports with `npm run update-windows-smoke-report`, and validate filled reports with `npm run validate-windows-smoke-report`. Future official readiness may require `--require-signed`, but that path is paused and should not block current unsigned testing.

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

When the archive is ready for release-level aggregation, include `windows-smoke-archive-manifest.json` and `desktop-picker-archive-manifest.json` in the release evidence archive and keep the closure report pointed at the same archive directory.

Release evidence archives are tracked with one manifest that points at the already reviewed evidence files. A pending or unsigned archive can be valid for review while still reporting `releaseReady: false`:

```bash
npm run create-macos-release-evidence -- --app release/mac/OpenPet.app --notarization-text "<notarytool accepted output>" --output-dir docs/release-evidence/<release-archive>
npm run create-release-evidence-archive-manifest -- --archive-dir docs/release-evidence/<release-archive>
npm run create-release-evidence-archive-manifest -- --archive-dir docs/release-evidence/<release-archive> --require-signed
npm run create-signed-release-closure-report -- --archive-dir docs/release-evidence/<release-archive> --fail-on-not-ready
```

The macOS evidence command writes `macos-codesign.txt`, `macos-notarization.txt`, `macos-gatekeeper.txt`, and summary files. The active release workflow does not upload those files; if release promotion resumes, generate or archive them manually before final closure. It records evidence only; the signed manifest command is still required before an official desktop release claim. The closure command converts the evidence into explicit macOS, Windows, and official desktop release wording, and must remain `not-ready` until successful macOS codesign, notarization, and Gatekeeper evidence files plus signed-ready Windows smoke, reviewed Windows smoke archive, desktop picker, reviewed desktop picker archive, and packaged runtime evidence are present.

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

If release promotion resumes, Windows desktop support can be called release-ready only after all of these are complete:

- Documentation states macOS and Windows support consistently.
- `package.json` defines Windows package targets and Windows icon assets.
- Release workflow has a Windows runner and uploads Windows artifacts.
- A Windows signing policy is explicitly reactivated; this is not part of the current product plan.
- Windows smoke evidence reports have a checked-in template, validator, CI pending-report/runbook/collector artifact, collector-output bundle validator, evidence summary/archive-manifest tools, command-driven filling tool, and readiness validator.
- Desktop native picker smoke evidence reports can be generated, filled, validated, summarized, and archive-manifested for packaged macOS and Windows artifacts.
- Desktop native picker smoke archive manifests can be generated and consumed by the release-level archive and closure report.
- Reviewed Windows smoke archive manifests are required by the release-level archive and signed closure report, and must match the archived Windows smoke report path and SHA-256 hash.
- Signed Windows release artifacts have been produced and verified with `Get-AuthenticodeSignature`.
- The desktop verification matrix passes on a clean Windows machine or CI-backed manual test environment.
- About/update behavior distinguishes macOS and Windows release assets.
- `npm start`, `npm test`, `npm run check:syntax`, and macOS packaging remain functional after the Windows changes.

Current gate status: package targets, icon assets, unsigned release workflow, platform-aware update asset filtering, Windows unsigned labeling, and dormant release-evidence tooling are implemented. The correct current status is: macOS and Windows can produce unsigned small-scope test artifacts; official signed release readiness is intentionally out of scope until plugin ecosystem work justifies promotion.
