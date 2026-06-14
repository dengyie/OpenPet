# Phase 8 Windows Desktop Release Review

> Reviewed scope: Phase 8.1 Windows packaging config, Phase 8.2 dual-platform release workflow, Phase 8.3 platform-aware About/update asset filtering, Phase 8.4 Windows signing policy enforcement, Phase 8.5a Windows smoke evidence gate, Phase 8.5b Windows smoke report CI artifact generation, Phase 8.5c Windows smoke report filling/update tooling, Phase 8.5d Windows smoke validation runbook generation, and Phase 8.5e Windows smoke evidence collector generation.

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

## Phase 8.5b Findings

No blocking issues found in the Windows smoke report artifact generation change.

## Phase 8.5b Review Notes

- `scripts/create-windows-smoke-report.js` reuses the validator's `REQUIRED_CHECKS`, so the generated pending report cannot silently drop a required Windows smoke item.
- The script defaults to Windows-only generation and requires `--allow-non-windows` for local structure checks, reducing the chance that a macOS developer report is mistaken for Windows runner evidence.
- Required artifact discovery fails when the installer, Windows zip, or `latest.yml` is missing, so the release workflow cannot upload a report that has no install/update artifact basis.
- Authenticode collection uses PowerShell on Windows and only treats `Status : Valid` as signed. Unsigned prerelease artifacts remain represented as not signed.
- The release workflow validates the generated report with `--allow-pending` before publishing assets. This proves report structure, not runtime success.
- The pending report is uploaded as a GitHub Actions artifact, not a public GitHub Release asset, which keeps user-facing release downloads focused on installers and archives.

## Phase 8.5b Residual Risk

- This phase still does not execute the app on Windows, install/uninstall the NSIS package, inspect the transparent pet window, or exercise plugin/pet-pack flows.
- `Get-AuthenticodeSignature` evidence is only meaningful after the Windows release job runs with real artifacts.
- Official Windows readiness still requires a complete non-pending smoke report and, for stable releases, `--require-signed` validation.
- SmartScreen reputation remains external to the repository and cannot be proven by this report artifact alone.

## Phase 8.5b Verification

```bash
node --check scripts/create-windows-smoke-report.js # pass
node --test tests/release/create-windows-smoke-report.test.js # 5/5 pass
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "workflow yaml ok"' # pass
npm run check:syntax                         # pass
npm test                                     # 186/186 pass
```

## Phase 8.5c Findings

No blocking issues found in the Windows smoke report filling/update tooling change.

## Phase 8.5c Review Notes

- `scripts/update-windows-smoke-report.js` reuses the validator's `REQUIRED_CHECKS` and `validateReport()` instead of maintaining a separate readiness rule set.
- `--list-checks` exits after printing the check matrix, so it cannot accidentally rewrite a report while an operator is only looking up ids.
- Metadata updates are constrained to explicit environment and artifact key allowlists, which keeps evidence reports aligned with the schema instead of becoming arbitrary release notes blobs.
- `artifact.signed` is normalized to a JSON boolean and rejects ambiguous values, which matters because signed official readiness depends on strict `true` plus Authenticode evidence.
- Default validation allows pending checks for incremental filling, while `--validate-ready` uses the stricter all-pass path. This preserves the distinction between in-progress evidence and release readiness.
- `--require-signed` must be paired with `--validate-ready`, preventing a partially filled report from being presented as signed official readiness.
- Tests cover argument validation, metadata allowlists, evidence-file ingestion, incremental pending validation, all-pass readiness validation, and signed official readiness validation.

## Phase 8.5c Residual Risk

- This phase still does not run the Windows app, install the NSIS package, verify transparent window behavior, or exercise Windows plugin/pet-pack paths.
- The tool can make evidence collection more consistent, but the evidence itself still has to come from a real Windows clean-machine or CI-backed manual validation run.
- Official Windows readiness still requires a signed artifact with `Get-AuthenticodeSignature` reporting `Status : Valid` and a complete non-pending smoke report.
- SmartScreen reputation remains outside repository control and cannot be proven by the report tooling.

## Phase 8.5c Verification

```bash
node --check scripts/update-windows-smoke-report.js # pass
node --check tests/release/update-windows-smoke-report.test.js # pass
node --test tests/release/update-windows-smoke-report.test.js # 10/10 pass
npm run check:syntax                         # pass
npm test                                     # 196/196 pass
git diff --check                             # pass
```

## Phase 8.5d Findings

No blocking issues found in the Windows smoke validation runbook artifact change.

## Phase 8.5d Review Notes

- `scripts/create-windows-smoke-runbook.js` validates the input report with `allowPending: true` before generating Markdown, so a missing or malformed required check cannot silently produce an operator guide.
- The runbook derives its check matrix from `REQUIRED_CHECKS`, keeping the operator checklist aligned with the JSON readiness validator.
- Each required check includes the validator id, evidence guidance, and the matching `npm run update-windows-smoke-report` command, which reduces manual drift during a real Windows validation session.
- The release workflow generates the runbook only after the pending report passes structural validation, then uploads both files as a single smoke evidence Actions artifact.
- The runbook text explicitly states that it is an operator guide and does not prove Windows support or smoke success by itself.
- Tests cover CLI argument parsing, default output placement, required-check coverage, invalid report rejection, and Markdown file writing.

## Phase 8.5d Residual Risk

- This phase still does not run the Windows installer or app, and it does not create real clean-machine smoke evidence.
- A runbook can make validation more repeatable, but the final Windows support claim still depends on a filled JSON report that passes the readiness validator.
- Official Windows readiness still requires a signed artifact with `Get-AuthenticodeSignature` reporting `Status : Valid` plus full smoke evidence.
- SmartScreen reputation remains outside repository control.

## Phase 8.5d Verification

```bash
node --check scripts/create-windows-smoke-runbook.js # pass
node --check tests/release/create-windows-smoke-runbook.test.js # pass
node --test tests/release/create-windows-smoke-runbook.test.js # 6/6 pass
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "workflow yaml ok"' # pass
npm run check:syntax                         # pass
npm test                                     # 202/202 pass
git diff --check                             # pass
```

## Phase 8.5e Findings

No blocking issues found in the Windows smoke evidence collector artifact change.

## Phase 8.5e Review Notes

- `scripts/create-windows-smoke-collector.js` validates the input report with `allowPending: true`, so malformed or incomplete required-check matrices cannot produce an official-looking collector.
- The collector embeds a manual checklist generated from `REQUIRED_CHECKS` and reuses the runbook evidence guidance, keeping the JSON validator, Markdown runbook, and PowerShell helper aligned.
- The generated PowerShell records environment, Authenticode, process, and uninstall-registry snapshots under `windows-smoke-evidence/`, which gives operators concrete files to reference while filling the report.
- The helper intentionally does not write the JSON report and does not emit any `--status pass` command. It gathers evidence only; readiness still depends on explicit operator review plus validator success.
- The release workflow now uploads the pending report, runbook, and collector as one smoke evidence artifact, while keeping these files out of public user-facing GitHub Release downloads.
- The runbook now points operators to the collector as an optional first step and repeats that it does not mark smoke checks as passed.
- Tests cover CLI parsing, default output placement, required-check guidance coverage, command-note boundaries, invalid report rejection, and PowerShell file writing.

## Phase 8.5e Residual Risk

- This phase still does not run the Windows installer or app, and it does not create real clean-machine smoke evidence.
- The collector can gather useful local snapshots, but visual/interactive checks such as transparent window, drag bounds, Control Center tabs, plugin runner, pet packs, Local HTTP/MCP, API key isolation, and uninstall behavior still require real validation evidence.
- Official Windows readiness still requires a signed artifact with `Get-AuthenticodeSignature` reporting `Status : Valid` plus full smoke evidence.
- SmartScreen reputation remains outside repository control.

## Phase 8.5e Verification

```bash
node --check scripts/create-windows-smoke-collector.js # pass
node --check tests/release/create-windows-smoke-collector.test.js # pass
node --check scripts/create-windows-smoke-runbook.js # pass
node --check tests/release/create-windows-smoke-runbook.test.js # pass
node --test tests/release/create-windows-smoke-runbook.test.js tests/release/create-windows-smoke-collector.test.js # 14/14 pass
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "workflow yaml ok"' # pass
find tests -name '*.test.js' | wc -l # 29
npm run check:syntax # pass
npm test # 210/210 pass
```
