# Signed Release Evidence Closure

Generated: 2026-07-06T16:28:20.417Z
Overall release-ready: no
Archive manifest ok: no
Archive manifest releaseReady: no

| Claim | Status | Release wording |
|------|--------|-----------------|
| officialDesktopRelease | not-ready | Do not claim official signed desktop release readiness for this evidence set. |
| macos | not-ready | Do not claim macOS signed release readiness for this archived artifact. |
| windows | not-ready | Do not claim Windows release readiness for this archived artifact. |

## Blockers

### officialDesktopRelease
- Archive manifest: windowsSmokeReport: artifact.signed must be true when --require-signed is used
- Archive manifest: windowsSmokeReport: artifact.authenticodeStatus must be "Valid" when --require-signed is used
- Archive manifest: missing desktopPickerReport: desktop-picker-smoke-report.json
- Archive manifest: packagedRuntimeReport: artifact.signed must be true when --require-signed is used
- Archive manifest: packagedRuntimeReport: artifact.signatureStatus must be "Valid" for signed macOS runtime smoke readiness
- Archive manifest: macosCodesignEvidence does not prove codesign success
- Archive manifest: macosNotarizationEvidence does not prove notarization success
- Archive manifest: macosGatekeeperEvidence does not prove gatekeeper success
- Archive manifest: missing windowsSmokeArchiveManifest: windows-smoke-archive-manifest.json
- Archive manifest: missing desktopPickerArchiveManifest: desktop-picker-archive-manifest.json
- Archive manifest releaseReady is false
- macOS codesign evidence status is pending
- macOS notarization evidence status is pending
- macOS Gatekeeper evidence status is pending
- macOS packaged runtime evidence: artifact.signed must be true when --require-signed is used
- macOS packaged runtime evidence: artifact.signatureStatus must be "Valid" for signed macOS runtime smoke readiness
- macOS packaged runtime evidence: plugin-picker-evidence-linked must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: pet-picker-evidence-linked must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: invalid-package-feedback must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: linkedEvidence.desktopPickerSmokeReport is required for packaged runtime smoke readiness
- macOS packaged runtime evidence: packagedRuntimeReport: artifact.signed must be true when --require-signed is used
- macOS packaged runtime evidence: packagedRuntimeReport: artifact.signatureStatus must be "Valid" for signed macOS runtime smoke readiness
- Windows smoke evidence: artifact.signed must be true when --require-signed is used
- Windows smoke evidence: artifact.authenticodeStatus must be "Valid" when --require-signed is used
- Windows smoke evidence: install must pass before Windows release readiness can be claimed
- Windows smoke evidence: launch must pass before Windows release readiness can be claimed
- Windows smoke evidence: transparent-window must pass before Windows release readiness can be claimed
- Windows smoke evidence: drag-bounds must pass before Windows release readiness can be claimed
- Windows smoke evidence: control-center-tabs must pass before Windows release readiness can be claimed
- Windows smoke evidence: pet-actions must pass before Windows release readiness can be claimed
- Windows smoke evidence: pet-pack-import must pass before Windows release readiness can be claimed
- Windows smoke evidence: plugin-runner must pass before Windows release readiness can be claimed
- Windows smoke evidence: local-http-default-off must pass before Windows release readiness can be claimed
- Windows smoke evidence: local-http-token-gated must pass before Windows release readiness can be claimed
- Windows smoke evidence: api-key-isolation must pass before Windows release readiness can be claimed
- Windows smoke evidence: about-update-assets must pass before Windows release readiness can be claimed
- Windows smoke evidence: uninstall must pass before Windows release readiness can be claimed
- Windows smoke evidence: windowsSmokeReport: artifact.signed must be true when --require-signed is used
- Windows smoke evidence: windowsSmokeReport: artifact.authenticodeStatus must be "Valid" when --require-signed is used
- Windows smoke archive evidence is missing
- Windows desktop picker evidence is missing
- Windows desktop picker archive evidence is missing

### macos
- macOS codesign evidence status is pending
- macOS notarization evidence status is pending
- macOS Gatekeeper evidence status is pending
- macOS packaged runtime evidence: artifact.signed must be true when --require-signed is used
- macOS packaged runtime evidence: artifact.signatureStatus must be "Valid" for signed macOS runtime smoke readiness
- macOS packaged runtime evidence: plugin-picker-evidence-linked must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: pet-picker-evidence-linked must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: invalid-package-feedback must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: linkedEvidence.desktopPickerSmokeReport is required for packaged runtime smoke readiness
- macOS packaged runtime evidence: packagedRuntimeReport: artifact.signed must be true when --require-signed is used
- macOS packaged runtime evidence: packagedRuntimeReport: artifact.signatureStatus must be "Valid" for signed macOS runtime smoke readiness

### windows
- Windows smoke evidence: artifact.signed must be true when --require-signed is used
- Windows smoke evidence: artifact.authenticodeStatus must be "Valid" when --require-signed is used
- Windows smoke evidence: install must pass before Windows release readiness can be claimed
- Windows smoke evidence: launch must pass before Windows release readiness can be claimed
- Windows smoke evidence: transparent-window must pass before Windows release readiness can be claimed
- Windows smoke evidence: drag-bounds must pass before Windows release readiness can be claimed
- Windows smoke evidence: control-center-tabs must pass before Windows release readiness can be claimed
- Windows smoke evidence: pet-actions must pass before Windows release readiness can be claimed
- Windows smoke evidence: pet-pack-import must pass before Windows release readiness can be claimed
- Windows smoke evidence: plugin-runner must pass before Windows release readiness can be claimed
- Windows smoke evidence: local-http-default-off must pass before Windows release readiness can be claimed
- Windows smoke evidence: local-http-token-gated must pass before Windows release readiness can be claimed
- Windows smoke evidence: api-key-isolation must pass before Windows release readiness can be claimed
- Windows smoke evidence: about-update-assets must pass before Windows release readiness can be claimed
- Windows smoke evidence: uninstall must pass before Windows release readiness can be claimed
- Windows smoke evidence: windowsSmokeReport: artifact.signed must be true when --require-signed is used
- Windows smoke evidence: windowsSmokeReport: artifact.authenticodeStatus must be "Valid" when --require-signed is used
- Windows smoke archive evidence is missing
- Windows desktop picker evidence is missing
- Windows desktop picker archive evidence is missing

## SmartScreen

- Status: not-proven
- Claim: SmartScreen reputation must be documented as an observed result only; Authenticode and smoke evidence do not prove reputation trust.

## Next Actions

- Capture signed macOS codesign, notarization, Gatekeeper, and packaged runtime launch evidence.
- Capture signed Windows Authenticode, clean-machine smoke, and desktop picker evidence.
- Regenerate the release evidence archive manifest with --require-signed after all evidence is ready.
