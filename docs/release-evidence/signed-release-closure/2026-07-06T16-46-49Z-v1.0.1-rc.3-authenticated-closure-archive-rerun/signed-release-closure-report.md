# Signed Release Evidence Closure

Generated: 2026-07-06T16:46:49.000Z
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
- Archive manifest: desktopPickerReport: artifact.signed must be true when --require-signed is used
- Archive manifest: desktopPickerReport: artifact.authenticodeStatus must be "Valid" for signed Windows picker smoke readiness
- Archive manifest: desktopPickerReport: artifact.signatureEvidence or artifact.authenticodeEvidence is required for signed Windows picker smoke readiness
- Archive manifest: packagedRuntimeReport: artifact.signed must be true when --require-signed is used
- Archive manifest: packagedRuntimeReport: artifact.signatureStatus must be "Valid" for signed macOS runtime smoke readiness
- Archive manifest: macosCodesignEvidence does not prove codesign success
- Archive manifest: macosNotarizationEvidence does not prove notarization success
- Archive manifest: macosGatekeeperEvidence does not prove gatekeeper success
- Archive manifest: windowsSmokeArchiveManifest is not valid
- Archive manifest: desktopPickerArchiveManifest is not valid
- Archive manifest releaseReady is false
- macOS codesign evidence status is fail
- macOS notarization evidence status is fail
- macOS Gatekeeper evidence status is fail
- macOS packaged runtime evidence: artifact.signed must be true when --require-signed is used
- macOS packaged runtime evidence: artifact.signatureStatus must be "Valid" for signed macOS runtime smoke readiness
- macOS packaged runtime evidence: packaged-launch must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: pet-window-created must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: transparent-background must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: sprite-visible must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: speech-bubble-rendered must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: default-action-playback must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: pack-switch-legacy-cat must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: pack-switch-doro must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: pack-switch-duodong must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: pack-switch-chispa must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: plugin-picker-evidence-linked must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: pet-picker-evidence-linked must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: invalid-package-feedback must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: state-after-runtime-smoke must pass before packaged runtime smoke readiness can be claimed
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
- Windows smoke archive evidence: windowsSmokeArchiveManifest is not valid
- Windows desktop picker evidence: artifact.signed must be true when --require-signed is used
- Windows desktop picker evidence: artifact.authenticodeStatus must be "Valid" for signed Windows picker smoke readiness
- Windows desktop picker evidence: artifact.signatureEvidence or artifact.authenticodeEvidence is required for signed Windows picker smoke readiness
- Windows desktop picker evidence: packaged-launch must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: control-center-open must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: plugin-picker-cancel must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: plugin-picker-zip-review must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: plugin-install-disabled must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: invalid-package-feedback must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: action-frame-picker-cancel must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: pet-pack-picker-cancel must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: state-after-picker-smoke must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: desktopPickerReport: artifact.signed must be true when --require-signed is used
- Windows desktop picker evidence: desktopPickerReport: artifact.authenticodeStatus must be "Valid" for signed Windows picker smoke readiness
- Windows desktop picker evidence: desktopPickerReport: artifact.signatureEvidence or artifact.authenticodeEvidence is required for signed Windows picker smoke readiness
- Windows desktop picker archive evidence: desktopPickerArchiveManifest is not valid

### macos
- macOS codesign evidence status is fail
- macOS notarization evidence status is fail
- macOS Gatekeeper evidence status is fail
- macOS packaged runtime evidence: artifact.signed must be true when --require-signed is used
- macOS packaged runtime evidence: artifact.signatureStatus must be "Valid" for signed macOS runtime smoke readiness
- macOS packaged runtime evidence: packaged-launch must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: pet-window-created must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: transparent-background must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: sprite-visible must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: speech-bubble-rendered must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: default-action-playback must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: pack-switch-legacy-cat must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: pack-switch-doro must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: pack-switch-duodong must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: pack-switch-chispa must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: plugin-picker-evidence-linked must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: pet-picker-evidence-linked must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: invalid-package-feedback must pass before packaged runtime smoke readiness can be claimed
- macOS packaged runtime evidence: state-after-runtime-smoke must pass before packaged runtime smoke readiness can be claimed
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
- Windows smoke archive evidence: windowsSmokeArchiveManifest is not valid
- Windows desktop picker evidence: artifact.signed must be true when --require-signed is used
- Windows desktop picker evidence: artifact.authenticodeStatus must be "Valid" for signed Windows picker smoke readiness
- Windows desktop picker evidence: artifact.signatureEvidence or artifact.authenticodeEvidence is required for signed Windows picker smoke readiness
- Windows desktop picker evidence: packaged-launch must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: control-center-open must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: plugin-picker-cancel must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: plugin-picker-zip-review must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: plugin-install-disabled must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: invalid-package-feedback must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: action-frame-picker-cancel must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: pet-pack-picker-cancel must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: state-after-picker-smoke must pass before desktop picker smoke readiness can be claimed
- Windows desktop picker evidence: desktopPickerReport: artifact.signed must be true when --require-signed is used
- Windows desktop picker evidence: desktopPickerReport: artifact.authenticodeStatus must be "Valid" for signed Windows picker smoke readiness
- Windows desktop picker evidence: desktopPickerReport: artifact.signatureEvidence or artifact.authenticodeEvidence is required for signed Windows picker smoke readiness
- Windows desktop picker archive evidence: desktopPickerArchiveManifest is not valid

## SmartScreen

- Status: not-proven
- Claim: SmartScreen reputation must be documented as an observed result only; Authenticode and smoke evidence do not prove reputation trust.

## Next Actions

- Capture signed macOS codesign, notarization, Gatekeeper, and packaged runtime launch evidence.
- Capture signed Windows Authenticode, clean-machine smoke, and desktop picker evidence.
- Regenerate the release evidence archive manifest with --require-signed after all evidence is ready.
