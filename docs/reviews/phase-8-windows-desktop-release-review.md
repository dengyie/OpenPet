# Phase 8 Windows Desktop Release Review

> Reviewed scope: Phase 8.1 Windows packaging config, Phase 8.2 dual-platform release workflow, Phase 8.3 platform-aware About/update asset filtering, Phase 8.4 Windows signing policy enforcement, and Phase 8.5a Windows smoke evidence gate.

## Phase 8.1 Findings

No blocking issues found in Phase 8.1.

## Review Notes

- Windows support is still correctly documented as planned, not release-ready. The current change adds package targets and icon assets, but does not claim installer validation.
- `scripts/generate-icons.js` uses the existing `sharp` dev dependency and writes a deterministic multi-size ICO from `build/icon.png`; no new dependency or external binary tool is introduced.
- `build.win` is scoped to `x64` for the first Windows release path, matching the desktop release design. Windows `arm64` remains gated on real validation.
- `nsis.deleteAppDataOnUninstall` is `false`, which preserves user data and aligns with the legacy userData compatibility requirement.
- macOS build settings remain unchanged.

## Residual Risk

- This review does not prove NSIS installer behavior because it was performed from the macOS development environment.
- Windows signing, SmartScreen reputation, and Windows runner artifacts remain for later phases.
- Plugin runner behavior on Windows paths still needs manual or CI-backed validation before public support claims.

## Verification

Phase 8.1 verification commands:

```bash
npm run generate-icons                       # pass
node --check scripts/generate-icons.js       # pass
npm run check:syntax                         # pass
npm test                                     # 171/171 pass
npm run build:control-center && npx electron-builder --win --x64 --dir --publish never
                                               # pass; generated release/win-unpacked on macOS
npm run pack                                 # pass; generated release/mac-arm64
```

Windows release readiness still requires a Windows build runner and smoke-test evidence.

## Phase 8.2 Findings

No blocking issues found in the workflow split.

## Phase 8.2 Review Notes

- The PR path now runs packaging validation on both `macos-latest` and `windows-latest`, so Windows packaging regressions should be caught before merge.
- The release path is split into `release-macos` and `release-windows`; macOS signing/notarization conditions no longer gate Windows artifact generation.
- Windows artifacts are intentionally unsigned in this phase. The workflow does not imply SmartScreen trust or official signed readiness.
- `artifactName` includes `${os}-${arch}`, reducing collision risk between macOS and Windows ZIP assets in the same release.
- macOS artifact upload remains constrained to `.dmg`, `.zip`, `.blockmap`, and `latest-mac.yml`; Windows upload is constrained to `.exe`, `.zip`, `.blockmap`, and `latest.yml`.

## Phase 8.2 Residual Risk

- GitHub Actions must run the new Windows job before this can be treated as CI-proven.
- Windows code signing and certificate secret policy remain for Phase 8.4.
- About/update asset filtering has since been completed in Phase 8.3.
- Windows installer behavior still needs manual or CI-backed smoke validation.

## Phase 8.2 Verification

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "workflow yaml ok"' # pass
npm run check:syntax                         # pass
npm test                                     # 171/171 pass
npm run build:control-center && npx electron-builder --win --x64 --dir --publish never
                                               # pass; generated release/win-unpacked on macOS
npm run pack                                 # pass; generated release/mac-arm64
```

## Phase 8.3 Findings

No blocking issues found in the platform-aware update asset filtering change.

## Phase 8.3 Review Notes

- `AboutService` now accepts injectable `platform` and `arch` values, keeping production behavior tied to `process.platform` / `process.arch` while making macOS and Windows update paths deterministic in tests.
- The asset filter excludes `.blockmap`, `latest.yml`, and `latest-mac.yml`, so About does not present update feed metadata as user-installable downloads.
- macOS release checks now prefer `.dmg` and macOS `.zip` assets; Windows release checks now prefer `.exe` and Windows `.zip` assets.
- Platform tokens in artifact names prevent cross-platform ZIP leakage when a GitHub Release contains both `darwin` and `win32` archives.
- Legacy ZIP assets without platform tokens remain visible for compatibility with old single-platform releases, but the current `artifactName` includes `${os}-${arch}` so new dual-platform releases should be unambiguous.

## Phase 8.3 Residual Risk

- Windows signing and SmartScreen reputation are still unresolved; this change only fixes update asset presentation.
- GitHub Actions still needs to run the Windows release job before the Windows pipeline can be treated as CI-proven.
- Real Windows installer, uninstall, transparent-window, and plugin-runner smoke validation remain for Phase 8.5.

## Phase 8.3 Verification

```bash
npm run check:syntax                         # pass
npm test                                     # 172/172 pass
```

## Phase 8.4 Findings

No blocking issues found in the Windows signing policy enforcement change.

## Phase 8.4 Review Notes

- `release-windows` now distinguishes stable tags from RC/beta/alpha tags. Stable Windows releases fail before build when `WINDOWS_CSC_LINK` or `WINDOWS_CSC_KEY_PASSWORD` is missing, preventing accidental unsigned stable artifacts.
- Signed Windows builds use electron-builder's standard `CSC_LINK` / `CSC_KEY_PASSWORD` environment variables, but the repository-level secret names are Windows-specific so they do not collide with macOS certificate inputs.
- Unsigned prerelease builds remain possible for validation and are explicitly labeled by `npm run prepare-windows-release-assets` before upload.
- The asset labeling script updates `latest.yml` after renaming files, so update metadata does not point to stale pre-rename filenames.
- The script updates `latest.yml` with a single combined filename match, which avoids corrupting `.exe.blockmap` references through repeated `.exe` substring replacements.
- The script protects existing `unsigned` filenames from double-labeling and refuses to overwrite conflicting destination files.

## Phase 8.4 Residual Risk

- This phase does not prove a real signed Windows artifact because no Windows signing certificate secret is present in the local workspace.
- SmartScreen reputation remains an external product trust signal even after Authenticode signing works.
- The Windows release job still needs GitHub Actions run evidence and real Windows install/uninstall/runtime smoke validation before public Windows support claims.

## Phase 8.4 Verification

```bash
node --check scripts/prepare-windows-release-assets.js # pass
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "workflow yaml ok"' # pass
npm run check:syntax                         # pass
npm test                                     # 175/175 pass
```

## Phase 8.5a Findings

No blocking issues found in the Windows smoke evidence gate.

## Phase 8.5a Review Notes

- `scripts/validate-windows-smoke-report.js` keeps smoke readiness and official signed readiness separate. A complete unsigned prerelease report can pass the smoke matrix, but the CLI still warns that official release readiness requires signed artifact validation.
- The report requires evidence for every passing check, which prevents a future Windows support claim from being based only on status labels.
- `--allow-pending` is appropriately limited to template or in-progress report validation; pending checks still fail in the default readiness path.
- `--require-signed` requires `artifact.signed`, Authenticode status `Valid`, and signature evidence, matching the Phase 8.4 signing policy.
- The template is intentionally pending and therefore records no smoke success by itself.
- The `.gitignore` change from `release/` to `/release/` preserves root build-output ignoring while allowing the new `tests/release/` test file to be tracked.

## Phase 8.5a Residual Risk

- This phase does not run on Windows and does not prove installer, uninstall, transparent window, plugin runner, or Windows path behavior.
- No signed Windows artifact or Authenticode evidence exists in the repository yet.
- SmartScreen reputation remains an external trust gate even after a signed artifact validates.

## Phase 8.5a Verification

```bash
node --check scripts/validate-windows-smoke-report.js # pass
npm run validate-windows-smoke-report -- docs/release-evidence/windows-smoke-report.template.json --allow-pending # pass; structure only, 0/13 passed
node --test tests/release/windows-smoke-report.test.js # 6/6 pass
npm run check:syntax                         # pass
npm test                                     # 181/181 pass
```
