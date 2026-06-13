# Phase 8 Windows Desktop Release Review

> Reviewed scope: Phase 8.1 Windows packaging config, reproducible ICO generation, and release documentation boundaries.

## Findings

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
