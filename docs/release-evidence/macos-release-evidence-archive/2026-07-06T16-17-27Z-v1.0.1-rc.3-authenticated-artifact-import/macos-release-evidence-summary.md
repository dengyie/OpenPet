# macOS Release Evidence Summary

Generated at: 2026-06-23T22:21:21.394Z
App path: /Users/runner/work/OpenPet/OpenPet/release/mac-arm64/OpenPet.app
Evidence directory: /Users/runner/work/OpenPet/OpenPet/release/macos-release-evidence
Evidence valid: yes
macOS signed release-ready: no

This summary archives macOS signing, notarization, and Gatekeeper evidence metadata for review. Pending, unsigned, rejected, or missing evidence does not prove official signed release readiness.

## Status

- codesign: pending
- notarization: pending
- Gatekeeper: pending

## Evidence Files

| Role | Bytes | SHA-256 | Path |
|------|-------|---------|------|
| macosCodesignEvidence | 188 | 492c09b399e781e8031a5286cf97c15844071c74784c61113a73ff6bfba3b3e2 | /Users/runner/work/OpenPet/OpenPet/release/macos-release-evidence/macos-codesign.txt |
| macosNotarizationEvidence | 61 | 8294db73d918a516f74a724d7b10097ea9b8c07396a292553e12f086b739e182 | /Users/runner/work/OpenPet/OpenPet/release/macos-release-evidence/macos-notarization.txt |
| macosGatekeeperEvidence | 184 | 3bee4fb55bd1f63600058fb6fea7257c9c6652fae4901615bcf14c0f1980eb82 | /Users/runner/work/OpenPet/OpenPet/release/macos-release-evidence/macos-gatekeeper.txt |

## Commands

- `codesign --verify --deep --strict --verbose=2 release/mac-arm64/OpenPet.app` -> exit 1
- `spctl --assess --type execute --verbose=4 release/mac-arm64/OpenPet.app` -> exit 1

## Warnings

- macOS evidence is archived but does not prove official signed release readiness
