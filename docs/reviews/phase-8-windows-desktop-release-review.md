# Phase 8 Windows Desktop Release Review

> Reviewed scope: Phase 8.1 Windows packaging config and Phase 8.2 dual-platform release workflow.

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
- Windows code signing and certificate secret policy remain for Phase 8.3.
- About/update asset filtering still needs platform awareness before Windows release UX is complete.
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
